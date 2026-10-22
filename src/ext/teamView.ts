import * as vscode from 'vscode';
import { webviewStrings } from '../i18n';
import { renderPage } from './webview';
import { readSettings } from './settings';
import { currentLang } from './l10n';
import { errorText, type Actions } from './actions';
import type { RepoEntry, RepoManager } from './repoManager';
import { repoKey } from '../core/storage';

type FromView =
  | { type: 'ready' }
  | { type: 'select'; root: string }
  | { type: 'pull'; root: string }
  | { type: 'check' }
  | { type: 'openFile'; root: string; file: string }
  | { type: 'mergeEditor'; root: string; file: string }
  | { type: 'finishMerge'; root: string }
  | { type: 'command'; id: 'openFolder' | 'clone' | 'publish' | 'switchBranch' | 'setup' };

const COMMANDS: Record<string, string> = {
  openFolder: 'workbench.action.files.openFolder',
  clone: 'git.clone',
  publish: 'git.publish',
  switchBranch: 'git.checkout',
  setup: 'pushpal.setup',
};

/** The "ทีมของฉัน / My Team" sidebar view. */
export class TeamViewProvider implements vscode.WebviewViewProvider {
  static readonly id = 'pushpal.team';
  private view: vscode.WebviewView | undefined;
  private selected: string | undefined;
  private pending: NodeJS.Timeout | undefined;

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
      title: 'PushPal',
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

  reveal(root?: string): void {
    if (root) this.selected = root;
    void vscode.commands.executeCommand(`${TeamViewProvider.id}.focus`);
    this.post();
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
    return { repos: entries.map(serialize), selected };
  }

  private async onMessage(m: FromView): Promise<void> {
    switch (m.type) {
      case 'ready':
        this.post();
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
    error: s?.error ? { code: s.error.code, text: errorText(s.error.code, s.error.message) } : null,
    checkedAt: s?.checkedAt ?? 0,
    lastResult: r ? { kind: r.result.kind, pulled: r.result.kind === 'ok' ? r.result.pulled : 0, at: r.at } : null,
  };
}
