import * as vscode from 'vscode';
import { fetchRuns, githubSlug, summarize, type CiSummary } from '../core/ciRuns';
import { upstreamRemoteUrl } from '../git/repo';
import { repoKey } from '../core/storage';
import { readSettings } from './settings';
import { t } from './l10n';
import type { RepoEntry, RepoManager } from './repoManager';
import type { Scheduler } from './scheduler';

/** Runs may take a moment to appear after a push; keep asking this long. */
const APPEAR_WINDOW_MS = 3 * 60_000;
/** Without a GitHub sign-in the API allows 60 requests an hour. */
const ANON_MIN_SECONDS = 60;
const SHOW_RESULT_MS = 90_000;

interface Watch {
  root: string;
  name: string;
  slug: string;
  sha: string;
  since: number;
  etag?: string;
  summary?: CiSummary;
  sawRunning: boolean;
  finishedAt?: number;
  timer?: NodeJS.Timeout;
}

/**
 * Watches the GitHub Actions runs of each repo's upstream commit. It asks
 * once when the upstream moves (a teammate's push or your own), then polls
 * only while a run is queued or in progress, and says how it went.
 */
export class CiWatcher implements vscode.Disposable {
  private readonly watches = new Map<string, Watch>();
  private readonly item = vscode.window.createStatusBarItem('pushpal.ci', vscode.StatusBarAlignment.Left, 49);
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private hideTimer: NodeJS.Timeout | undefined;
  signedIn = false;

  constructor(
    repos: RepoManager,
    private readonly scheduler: Scheduler,
    private readonly log: vscode.OutputChannel,
  ) {
    this.item.name = 'PushPal · GitHub Actions';
    repos.onDidCheck((entry) => this.onCheck(entry));
    void this.token(false);
  }

  private async token(interactive: boolean): Promise<string | undefined> {
    try {
      const s = interactive
        ? await vscode.authentication.getSession('github', ['repo'], { createIfNone: true })
        : await vscode.authentication.getSession('github', ['repo'], { silent: true });
      if (this.signedIn !== !!s) {
        this.signedIn = !!s;
        this.emitter.fire();
      }
      return s?.accessToken;
    } catch (e) {
      this.log.appendLine(`[ci] sign-in: ${e}`);
      return undefined;
    }
  }

  async signIn(): Promise<boolean> {
    await this.token(true);
    return this.signedIn;
  }

  private async onCheck(entry: RepoEntry): Promise<void> {
    const sha = entry.snapshot?.upstreamSha;
    if (!readSettings().actionsEnabled || !sha) return;
    const key = repoKey(entry.root);
    const prev = this.watches.get(key);
    if (prev && prev.sha === sha) return;
    const url = await upstreamRemoteUrl(entry.root);
    const slug = url ? githubSlug(url) : null;
    if (!slug) return;
    if (prev) clearTimeout(prev.timer);
    const w: Watch = { root: entry.root, name: entry.name, slug, sha, since: Date.now(), sawRunning: false };
    this.watches.set(key, w);
    await this.poll(w);
  }

  private async poll(w: Watch): Promise<void> {
    if (this.watches.get(repoKey(w.root)) !== w || !readSettings().actionsEnabled) return;
    const token = await this.token(false);
    const r = await fetchRuns(w.slug, w.sha, { token, etag: w.etag });
    if (r.kind === 'rateLimited') {
      this.log.appendLine(`[ci] ${w.name}: rate limited`);
      return this.later(w, Math.max(60_000, (r.resetAt ?? Date.now() + 15 * 60_000) - Date.now()));
    }
    if (r.kind === 'error') {
      this.log.appendLine(`[ci] ${w.name}: HTTP ${r.status}`);
      // 404 = private repo without access: stop quietly.
      if (r.status === 404 || r.status === 401) return;
      return this.later(w, this.intervalMs(!!token));
    }
    if (r.kind === 'ok') {
      w.etag = r.etag;
      const before = w.summary?.state;
      w.summary = summarize(r.runs);
      if (w.summary.state === 'running') w.sawRunning = true;
      if (before !== w.summary.state) this.onStateChange(w);
    }
    const s = w.summary?.state ?? 'none';
    if (s === 'running' || (s === 'none' && Date.now() - w.since < APPEAR_WINDOW_MS)) this.later(w, this.intervalMs(!!token));
  }

  private intervalMs(signedIn: boolean): number {
    const s = this.scheduler.actionsSeconds();
    if (s === null) return 15 * 60_000; // outside active hours
    return (signedIn ? s : Math.max(s, ANON_MIN_SECONDS)) * 1000;
  }

  private later(w: Watch, ms: number): void {
    clearTimeout(w.timer);
    w.timer = setTimeout(() => void this.poll(w), ms);
  }

  private onStateChange(w: Watch): void {
    const s = w.summary!;
    this.log.appendLine(`[ci] ${w.name}: ${s.state} (${s.done}/${s.total})`);
    if ((s.state === 'success' || s.state === 'failure') && w.sawRunning) {
      w.finishedAt = Date.now();
      void this.announce(w);
    }
    this.update();
  }

  private async announce(w: Watch): Promise<void> {
    if (!readSettings().notifyInVSCode) return;
    const s = w.summary!;
    const open = t('ci.open');
    const choice =
      s.state === 'failure'
        ? await vscode.window.showWarningMessage(t('ci.failed', w.name, s.failed.map((r) => r.name).join(', ')), open)
        : await vscode.window.showInformationMessage(t('ci.passed', w.name), open);
    if (choice === open && s.url) void vscode.env.openExternal(vscode.Uri.parse(s.url));
  }

  /** Latest result for one repo (for the mascot): running, or finished within the last few minutes. */
  stateFor(root: string): { state: 'running' | 'success' | 'failure' } | undefined {
    const w = this.watches.get(repoKey(root));
    const s = w?.summary?.state;
    if (s === 'running') return { state: 'running' };
    if ((s === 'success' || s === 'failure') && w?.finishedAt && Date.now() - w.finishedAt < 5 * 60_000) return { state: s };
    return undefined;
  }

  /** For the status bar tooltip and the settings page. */
  running(): Array<{ name: string; done: number; total: number }> {
    return [...this.watches.values()].filter((w) => w.summary?.state === 'running').map((w) => ({ name: w.name, done: w.summary!.done, total: w.summary!.total }));
  }

  private update(): void {
    clearTimeout(this.hideTimer);
    const ws = [...this.watches.values()];
    const running = ws.filter((w) => w.summary?.state === 'running');
    const recent = ws.filter((w) => w.finishedAt && Date.now() - w.finishedAt < SHOW_RESULT_MS).sort((a, b) => b.finishedAt! - a.finishedAt!);
    const item = this.item;
    if (running.length) {
      const done = running.reduce((n, w) => n + w.summary!.done, 0);
      const total = running.reduce((n, w) => n + w.summary!.total, 0);
      item.text = t('ci.status.running', done, total);
      item.tooltip = running.map((w) => t('ci.tip.running', w.name, w.summary!.done, w.summary!.total)).join('\n');
      item.command = runCommand(running[0].summary?.url);
      item.backgroundColor = undefined;
      item.show();
    } else if (recent.length) {
      const w = recent[0];
      const failed = w.summary!.state === 'failure';
      item.text = failed ? t('ci.status.failed') : t('ci.status.passed');
      item.tooltip = failed ? t('ci.failed', w.name, w.summary!.failed.map((r) => r.name).join(', ')) : t('ci.passed', w.name);
      item.backgroundColor = failed ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined;
      item.command = runCommand(w.summary!.url);
      item.show();
      this.hideTimer = setTimeout(() => this.update(), SHOW_RESULT_MS - (Date.now() - w.finishedAt!) + 100);
    } else {
      item.hide();
    }
    this.emitter.fire();
  }

  dispose(): void {
    for (const w of this.watches.values()) clearTimeout(w.timer);
    clearTimeout(this.hideTimer);
    this.item.dispose();
    this.emitter.dispose();
  }
}

function runCommand(url: string | undefined): vscode.Command | undefined {
  return url ? { title: 'Open', command: 'vscode.open', arguments: [vscode.Uri.parse(url)] } : undefined;
}
