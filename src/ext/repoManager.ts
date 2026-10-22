import * as vscode from 'vscode';
import { basename } from 'node:path';
import { checkRepo, findRepoRoot, recentCommits, dropAutostashIfResolved, type RepoSnapshot, type Commit, type PullResult } from '../git/repo';
import { setDefaultGitPath } from '../git/exec';
import { repoKey } from '../core/storage';

export type Phase = 'idle' | 'checking' | 'pulling';

export interface RepoEntry {
  root: string;
  name: string;
  snapshot: RepoSnapshot | null;
  phase: Phase;
  /** Recent upstream history for the team timeline (includes already-pulled commits). */
  recent: Commit[];
  lastResult?: { result: PullResult; at: number };
  lastFetchAt: number;
  /** Set after a successful pull: lets the user undo it for 10 minutes. */
  undo?: import('../git/safety').UndoRecord;
}

interface GitRepository {
  rootUri: vscode.Uri;
  state: { onDidChange: vscode.Event<void> };
}
interface GitAPI {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
  onDidCloseRepository: vscode.Event<GitRepository>;
  git: { path: string };
  /** VS Code 1.80+: lets an extension explain / fix a failed Push or Sync. */
  registerPushErrorHandler?(handler: { handlePushError(repository: GitRepository, remote: unknown, refspec: string, error: Error & { stderr?: string; gitErrorCode?: string }): Promise<boolean> }): vscode.Disposable;
}

export type CheckListener = (entry: RepoEntry, previous: RepoSnapshot | null) => void | Promise<void>;

const AUTOSTASH_KEY = 'pushpal.autostash';

export class RepoManager implements vscode.Disposable {
  private readonly entries = new Map<string, RepoEntry>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly repoWatchers = new Map<string, vscode.Disposable>();
  private readonly localCheckTimers = new Map<string, NodeJS.Timeout>();
  private checkListeners: CheckListener[] = [];
  private gitApi: GitAPI | undefined;
  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.OutputChannel,
  ) {}

  onDidCheck(listener: CheckListener): void {
    this.checkListeners.push(listener);
  }

  /** Explain rejected pushes from VS Code's own Push / Sync buttons. */
  onPushError: ((root: string, stderr: string) => Promise<boolean>) | undefined;

  get gitPath(): string | undefined {
    return this.gitApi?.git.path;
  }

  /** Automatic fetches (on focus, on discovery) are skipped while this returns false (outside active hours). */
  canAutoFetch: () => boolean = () => true;

  /** Periodic checks are driven by the Scheduler (src/ext/scheduler.ts). */
  async init(): Promise<void> {
    await this.connectGitExtension();
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.discover()),
      vscode.window.onDidChangeWindowState((s) => {
        if (s.focused) void this.refreshAll({ fetch: this.canAutoFetch(), minFetchGapMs: 10_000 });
      }),
    );
    await this.discover();
    void this.refreshAll({ fetch: this.canAutoFetch() });
  }

  private async connectGitExtension(): Promise<void> {
    try {
      const ext = vscode.extensions.getExtension<{ getAPI(v: 1): GitAPI }>('vscode.git');
      if (!ext) return;
      const exports = ext.isActive ? ext.exports : await ext.activate();
      this.gitApi = exports.getAPI(1);
      setDefaultGitPath(this.gitApi.git.path);
      const reg = this.gitApi.registerPushErrorHandler?.({
        handlePushError: async (repository, _remote, _refspec, error) =>
          this.onPushError ? this.onPushError(repository.rootUri.fsPath, `${error.stderr ?? ''}\n${error.message ?? ''}`) : false,
      });
      if (reg) this.disposables.push(reg);
      this.disposables.push(
        this.gitApi.onDidOpenRepository(() => void this.discover()),
        this.gitApi.onDidCloseRepository(() => void this.discover()),
      );
    } catch (e) {
      this.log.appendLine(`[git] built-in git extension unavailable, scanning folders instead: ${e}`);
    }
  }

  /** Find repos from the built-in git extension, plus each workspace folder. */
  async discover(): Promise<void> {
    const roots = new Map<string, string>();
    for (const r of this.gitApi?.repositories ?? []) roots.set(repoKey(r.rootUri.fsPath), r.rootUri.fsPath);
    for (const f of vscode.workspace.workspaceFolders ?? []) {
      if (f.uri.scheme !== 'file') continue;
      const root = await findRepoRoot(f.uri.fsPath);
      if (root) roots.set(repoKey(root), root);
    }
    let changed = false;
    for (const [key, root] of roots) {
      if (this.entries.has(key)) continue;
      this.entries.set(key, { root, name: basename(root), snapshot: null, phase: 'idle', recent: [], lastFetchAt: 0 });
      this.watchRepo(key, root);
      changed = true;
      void this.refresh(root, { fetch: this.canAutoFetch() });
    }
    for (const key of [...this.entries.keys()]) {
      if (roots.has(key)) continue;
      this.entries.delete(key);
      this.repoWatchers.get(key)?.dispose();
      this.repoWatchers.delete(key);
      changed = true;
    }
    if (changed) this.emitter.fire();
  }

  /** React quickly (no fetch) when files are staged or committed. */
  private watchRepo(key: string, root: string): void {
    const repo = this.gitApi?.repositories.find((r) => repoKey(r.rootUri.fsPath) === key);
    if (!repo) return;
    this.repoWatchers.set(
      key,
      repo.state.onDidChange(() => {
        clearTimeout(this.localCheckTimers.get(key));
        this.localCheckTimers.set(key, setTimeout(() => void this.refresh(root, { fetch: false }), 1200));
      }),
    );
  }

  list(): RepoEntry[] {
    return [...this.entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get(root: string): RepoEntry | undefined {
    return this.entries.get(repoKey(root));
  }

  /** Run `fn` exclusively for this repo (no check while a pull runs, etc). */
  async withLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
    const key = repoKey(root);
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(key, next.catch(() => undefined));
    return next;
  }

  setPhase(root: string, phase: Phase): void {
    const e = this.get(root);
    if (e && e.phase !== phase) {
      e.phase = phase;
      this.emitter.fire();
    }
  }

  setLastResult(root: string, result: PullResult): void {
    const e = this.get(root);
    if (e) {
      e.lastResult = { result, at: Date.now() };
      this.emitter.fire();
    }
  }

  async refreshAll(opts: { fetch: boolean; minFetchGapMs?: number }): Promise<void> {
    await Promise.all(
      this.list().map((e) => {
        const fetch = opts.fetch && Date.now() - e.lastFetchAt >= (opts.minFetchGapMs ?? 0);
        return this.refresh(e.root, { fetch });
      }),
    );
  }

  async refresh(root: string, opts: { fetch: boolean }): Promise<void> {
    const entry = this.get(root);
    if (!entry) return;
    await this.withLock(root, async () => {
      if (!this.get(root)) return;
      const showSpinner = !entry.snapshot;
      if (showSpinner) this.setPhase(root, 'checking');
      const previous = entry.snapshot;
      let snap = await checkRepo(root, { fetch: opts.fetch });
      if (opts.fetch) entry.lastFetchAt = Date.now();
      if (snap.error) this.log.appendLine(`[check] ${entry.name}: ${snap.error.code} ${snap.error.message}`);
      if (await this.trackAutostash(root, snap)) snap = await checkRepo(root, { fetch: false });
      entry.snapshot = snap;
      if (snap.upstream) entry.recent = await recentCommits(root, '@{u}', 25);
      if (showSpinner) entry.phase = 'idle';
      this.emitter.fire();
      for (const l of this.checkListeners) {
        try {
          await l(entry, previous);
        } catch (e) {
          this.log.appendLine(`[listener] ${e}`);
        }
      }
    });
  }

  /**
   * Remember the autostash sha while an autostash conflict is open; once the
   * user has staged every file, drop exactly that stash entry.
   * Returns true when a stash was dropped.
   */
  private async trackAutostash(root: string, snap: RepoSnapshot): Promise<boolean> {
    const key = repoKey(root);
    const all = this.context.workspaceState.get<Record<string, string>>(AUTOSTASH_KEY, {});
    if (snap.conflict?.kind === 'autostash' && snap.conflict.stashSha) {
      if (all[key] !== snap.conflict.stashSha) {
        all[key] = snap.conflict.stashSha;
        await this.context.workspaceState.update(AUTOSTASH_KEY, all);
      }
      return false;
    }
    const expected = all[key];
    if (!expected || snap.conflict) return false;
    delete all[key];
    await this.context.workspaceState.update(AUTOSTASH_KEY, all);
    const dropped = await dropAutostashIfResolved(root, expected);
    if (dropped) {
      this.log.appendLine(`[autostash] ${basename(root)}: all conflicts staged, dropped autostash ${expected.slice(0, 8)}`);
      this.onAutostashDropped?.(root);
    }
    return dropped;
  }

  onAutostashDropped: ((root: string) => void) | undefined;

  /** Record the stash sha right after PushPal's own pull hit an autostash conflict. */
  async rememberAutostash(root: string, sha: string): Promise<void> {
    const all = this.context.workspaceState.get<Record<string, string>>(AUTOSTASH_KEY, {});
    all[repoKey(root)] = sha;
    await this.context.workspaceState.update(AUTOSTASH_KEY, all);
  }

  dispose(): void {
    for (const t of this.localCheckTimers.values()) clearTimeout(t);
    for (const d of this.repoWatchers.values()) d.dispose();
    for (const d of this.disposables) d.dispose();
    this.emitter.dispose();
  }
}
