import * as vscode from 'vscode';
import { webviewStrings } from '../i18n';
import { renderPage } from './webview';
import { readSettings } from './settings';
import { currentLang, t } from './l10n';
import { errorText, type Actions } from './actions';
import type { RepoEntry, RepoManager } from './repoManager';
import { repoKey } from '../core/storage';
import type { CheckBadge } from './checks';
import type { FailureDetail } from '../core/checks';
import type { PrView, PullRequests } from './pullRequests';

/** What the page reports about itself: animation library loaded, script errors. */
export interface WebviewDiag {
  gsap: boolean;
  morph: boolean;
  errors: string[];
}

type FromView =
  | { type: 'ready'; diag?: WebviewDiag }
  | { type: 'error'; message: string }
  | { type: 'select'; root: string }
  | { type: 'pull'; root: string }
  | { type: 'check' }
  | { type: 'openFile'; root: string; file: string }
  | { type: 'mergeEditor'; root: string; file: string }
  | { type: 'finishMerge'; root: string }
  | { type: 'command'; id: 'openFolder' | 'clone' | 'publish' | 'switchBranch' | 'setup' }
  | { type: 'checkDetail'; root: string; sha: string; id: string }
  | { type: 'openUrl'; url: string }
  | { type: 'undo'; root: string }
  | { type: 'push'; root: string }
  | { type: 'pr'; root: string; act: 'startTask' | 'send' | 'updateFromMain' | 'finishTask' | 'openPr' }
  | { type: 'fullError'; text: string };

const COMMANDS: Record<string, string> = {
  openFolder: 'workbench.action.files.openFolder',
  clone: 'git.clone',
  publish: 'git.publish',
  switchBranch: 'git.checkout',
  setup: 'pushpug.setup',
};

/** The "ทีมของฉัน / My Team" sidebar view. */
export class TeamViewProvider implements vscode.WebviewViewProvider {
  static readonly id = 'pushpug.team';
  private view: vscode.WebviewView | undefined;
  private selected: string | undefined;
  private pending: NodeJS.Timeout | undefined;
  /** Last self-report from the page (used by the smoke test and the output log). */
  diag: WebviewDiag | undefined;
  log: ((line: string) => void) | undefined;
  /** GitHub checks of a commit (timeline badge). */
  checksFor: ((sha: string) => CheckBadge | undefined) | undefined;
  /** Why a check failed (failed step, end of the log). */
  checkDetail: ((root: string, sha: string, id: string) => Promise<FailureDetail | undefined>) | undefined;
  /** Seconds left to undo the last merge. */
  undoLeft: ((root: string) => number) | undefined;
  /** Profile picture URL for a commit author's e-mail. */
  avatarFor: ((email: string) => string | undefined) | undefined;
  /** GitHub Actions result per repo, so the pug can react to it. */
  ciState: ((root: string) => { state: 'running' | 'success' | 'failure' } | undefined) | undefined;
  /** The current task and its pull request. */
  prFor: ((root: string) => PrView | null) | undefined;
  prs: PullRequests | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly repos: RepoManager,
    private readonly actions: Actions,
  ) {
    repos.onDidChange(() => this.schedule());
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')] };
    this.render();
    view.webview.onDidReceiveMessage((m: FromView) => void this.onMessage(m));
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.post();
        void this.repos.refreshAll({ fetch: true, minFetchGapMs: 15_000 });
        for (const e of this.repos.list()) void this.prs?.refresh(e.root);
      }
    });
    view.onDidDispose(() => (this.view = undefined));
  }

  /** Re-render the whole page (language change). */
  render(): void {
    if (!this.view) return;
    const lang = currentLang();
    this.view.title = lang === 'th' ? 'ทีมของฉัน' : 'My Team';
    this.view.webview.html = renderPage(this.view.webview, this.context.extensionUri, {
      title: 'PushPug',
      lang,
      theme: readSettings().theme,
      surface: 'sidebar',
      styles: ['team.css'],
      scripts: ['team.js'],
      init: { lang, theme: readSettings().theme, strings: webviewStrings(lang), view: this.snapshot() },
    });
  }

  setTheme(): void {
    void this.view?.webview.postMessage({ type: 'theme', theme: readSettings().theme });
  }

  reveal(root?: string, sha?: string): void {
    if (root) this.selected = root;
    void vscode.commands.executeCommand(`${TeamViewProvider.id}.focus`);
    this.post();
    // Open that commit's checks once the page has the data.
    if (sha) setTimeout(() => void this.view?.webview.postMessage({ type: 'expandChecks', sha }), 300);
  }

  /** Re-send the view data (e.g. GitHub Actions finished). */
  refresh(): void {
    this.schedule();
  }

  private schedule(): void {
    clearTimeout(this.pending);
    this.pending = setTimeout(() => this.post(), 40);
  }

  private post(): void {
    void this.view?.webview.postMessage({ type: 'view', view: this.snapshot() });
  }

  private snapshot() {
    const entries = this.repos.list();
    let selected = entries.findIndex((e) => this.selected && repoKey(e.root) === repoKey(this.selected));
    if (selected < 0) {
      // Default to the repo that needs attention most.
      const rank = (e: RepoEntry) => (e.snapshot?.state === 'conflict' ? 0 : e.snapshot?.state === 'behind' ? 1 : 2);
      selected = entries.reduce((best, e, i) => (rank(e) < rank(entries[best]) ? i : best), 0);
    }
    const decorate = <T extends { email: string; sha: string }>(c: T) => ({ ...c, avatar: this.avatarFor?.(c.email) ?? null, checks: this.checksFor?.(c.sha) ?? null });
    return {
      repos: entries.map((e) => {
        const r = serialize(e);
        return { ...r, recent: r.recent.map(decorate), incoming: r.incoming.map(decorate), ci: this.ciState?.(e.root) ?? null, pr: this.prFor?.(e.root) ?? null, undoLeft: this.undoLeft?.(e.root) ?? 0 };
      }),
      selected,
    };
  }

  private async onMessage(m: FromView): Promise<void> {
    switch (m.type) {
      case 'ready':
        this.diag = m.diag;
        if (m.diag) this.log?.(`[team view] gsap=${m.diag.gsap} morph=${m.diag.morph}${m.diag.errors.length ? ' errors: ' + m.diag.errors.join(' | ') : ''}`);
        this.post();
        return;
      case 'error':
        this.log?.(`[team view] ${m.message}`);
        this.diag?.errors.push(m.message);
        return;
      case 'select':
        this.selected = m.root;
        this.post();
        return;
      case 'pull':
        this.selected = m.root;
        await this.actions.pull(m.root);
        return;
      case 'check':
        await this.repos.refreshAll({ fetch: true });
        return;
      case 'openFile':
        await this.actions.openFile(m.root, m.file);
        return;
      case 'mergeEditor':
        await this.actions.openMergeEditor(m.root, m.file);
        return;
      case 'finishMerge':
        await this.actions.finishMerge(m.root);
        return;
      case 'command':
        if (COMMANDS[m.id]) await vscode.commands.executeCommand(COMMANDS[m.id]);
        return;
      case 'checkDetail': {
        const detail = await this.checkDetail?.(m.root, m.sha, m.id).catch(() => undefined);
        void this.view?.webview.postMessage({ type: 'checkDetail', sha: m.sha, id: m.id, detail: detail ?? null });
        return;
      }
      case 'openUrl':
        if (/^https:\/\//.test(m.url)) await vscode.env.openExternal(vscode.Uri.parse(m.url));
        return;
      case 'undo':
        await this.actions.undo(m.root);
        return;
      case 'push':
        await this.actions.push(m.root);
        return;
      case 'pr': {
        const p = this.prs;
        if (!p) return;
        this.selected = m.root;
        if (m.act === 'startTask') await p.startTask(m.root);
        else if (m.act === 'send') await p.sendForReview(m.root);
        else if (m.act === 'updateFromMain') await p.updateFromMain(m.root);
        else if (m.act === 'finishTask') await p.finishTask(m.root);
        else if (m.act === 'openPr') await p.openPullRequest(m.root);
        return;
      }
      case 'fullError':
        await vscode.window.showInformationMessage(t('gerr.fullTitle'), { modal: true, detail: m.text });
        return;
    }
  }
}

function serialize(e: RepoEntry) {
  const s = e.snapshot;
  const incoming = new Set((s?.incoming ?? []).map((c) => c.sha));
  // Incoming commits first (they may not be in the upstream log window), then history.
  const recent = [...(s?.incoming ?? []), ...e.recent.filter((c) => !incoming.has(c.sha))]
    .slice(0, 30)
    .map((c) => ({ ...c, isNew: incoming.has(c.sha) }));
  const r = e.lastResult;
  return {
    root: e.root,
    name: e.name,
    branch: s?.branch ?? null,
    upstream: s?.upstream ?? null,
    state: s?.state ?? 'checking',
    phase: e.phase,
    behind: s?.behind ?? 0,
    ahead: s?.ahead ?? 0,
    incoming: s?.incoming ?? [],
    recent,
    overlap: s?.overlap ?? [],
    conflict: s?.conflict ? { kind: s.conflict.kind, files: s.conflict.files } : null,
    error: s?.error ? { code: s.error.code, text: errorText(s.error.code, s.error.message), raw: s.error.message } : null,
    checkedAt: s?.checkedAt ?? 0,
    lastResult: r ? { kind: r.result.kind, pulled: r.result.kind === 'ok' ? r.result.pulled : 0, at: r.at } : null,
  };
}
