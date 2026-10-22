import * as vscode from 'vscode';
import { fetchFailureDetail, type CheckSummary, type FailureDetail, type Requester } from '../core/checks';
import { ChecksTracker, type TrackerEvent } from '../core/checksTracker';
import { githubSlug } from '../core/ciRuns';
import { upstreamRemoteUrl } from '../git/repo';
import { runGit } from '../git/exec';
import { repoKey } from '../core/storage';
import { readSettings, saveSettings } from './settings';
import { t, currentLang } from './l10n';
import { formatSeconds } from '../i18n';
import type { RepoEntry, RepoManager } from './repoManager';
import type { Scheduler } from './scheduler';
import type { Alerts } from './alerts';

const AUTH_ASKED_KEY = 'pushpal.checksAuthAsked';
/** Timeline rows whose checks are looked up (newest first). */
const TIMELINE_DEPTH = 8;
/** A passing result keeps the mascot cheerful this long. */
const SHOW_PASS_MS = 5 * 60_000;

export interface CheckBadge {
  state: CheckSummary['state'];
  passed: number;
  total: number;
  items: Array<{ id: string; name: string; state: string; duration?: number; url?: string; canExplain: boolean }>;
}

/** GitHub sign-in that comes with VS Code; the token is only ever kept in memory. */
async function session(interactive: boolean): Promise<vscode.AuthenticationSession | undefined> {
  try {
    return interactive
      ? await vscode.authentication.getSession('github', ['repo'], { createIfNone: true })
      : await vscode.authentication.getSession('github', ['repo'], { silent: true });
  } catch {
    return undefined;
  }
}

function fetchRequester(token: string): Requester {
  return async (path, opts) => {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'PushPal-VSCode',
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(20_000),
    });
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = res.headers.get('x-ratelimit-reset');
    const base = { status: res.status, remaining: remaining === null ? undefined : Number(remaining), resetAt: reset === null ? undefined : Number(reset) * 1000 };
    if (!res.ok) return base;
    return opts?.raw ? { ...base, text: await res.text() } : { ...base, json: await res.json() };
  };
}

interface RepoInfo {
  slug: string | null;
  me: string;
}

/**
 * GitHub checks for the commits PushPal shows: the tip of each branch (alerts,
 * status bar, mascot) and the newest timeline rows (badges). Polls only while
 * something is pending; says how it went.
 */
export class ChecksWatcher implements vscode.Disposable {
  private readonly tracker: ChecksTracker;
  private readonly info = new Map<string, RepoInfo>();
  private readonly heads = new Map<string, { sha: string; finishedAt?: number }>();
  private readonly item = vscode.window.createStatusBarItem('pushpal.checks', vscode.StatusBarAlignment.Left, 49);
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private timer: NodeJS.Timeout | undefined;
  private token: string | undefined;
  signedIn = false;
  /** Set by the extension: pull / reveal the team view on a repo. */
  onPull: (root: string) => Promise<unknown> = async () => undefined;
  onReveal: (root: string, sha?: string) => void = () => undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly repos: RepoManager,
    private readonly scheduler: Scheduler,
    private readonly alerts: Alerts,
    private readonly log: vscode.OutputChannel,
  ) {
    this.item.name = 'PushPal · GitHub checks';
    this.tracker = new ChecksTracker(null, Date.now, () => this.pollMs());
    repos.onDidCheck((entry) => this.onCheck(entry));
    void this.refreshAuth();
    context.subscriptions.push(vscode.authentication.onDidChangeSessions((e) => e.provider.id === 'github' && void this.refreshAuth()));
  }

  get enabled(): boolean {
    return readSettings().actionsEnabled;
  }

  /** Poll while pending: the configured Actions interval, never faster than 20 s, slowed by battery rules. */
  private pollMs(): number {
    const s = this.scheduler.actionsSeconds();
    return s === null ? 15 * 60_000 : Math.max(20, s) * 1000;
  }

  private async refreshAuth(): Promise<void> {
    const s = await session(false);
    this.token = s?.accessToken;
    this.tracker.setRequester(this.token ? fetchRequester(this.token) : null);
    if (this.signedIn !== !!s) {
      this.signedIn = !!s;
      this.emitter.fire();
      this.schedule();
    }
  }

  githubToken(): Promise<string | undefined> {
    return Promise.resolve(this.token);
  }

  async signIn(): Promise<boolean> {
    const s = await session(true);
    if (s) {
      this.token = s.accessToken;
      this.signedIn = true;
      this.tracker.setRequester(fetchRequester(s.accessToken));
      if (!this.enabled) await saveSettings({ actionsEnabled: true });
      this.emitter.fire();
      this.schedule();
    }
    return !!s;
  }

  private async repoInfo(root: string): Promise<RepoInfo> {
    const key = repoKey(root);
    let i = this.info.get(key);
    if (!i) {
      const url = await upstreamRemoteUrl(root);
      const me = (await runGit(root, ['config', 'user.email'])).stdout.trim().toLowerCase();
      i = { slug: url ? githubSlug(url) : null, me };
      this.info.set(key, i);
    }
    return i;
  }

  /** After every check of a repo: follow the branch tip and the newest timeline rows. */
  private async onCheck(entry: RepoEntry): Promise<void> {
    const sha = entry.snapshot?.upstreamSha;
    if (!this.enabled || !sha) return;
    const { slug, me } = await this.repoInfo(entry.root);
    if (!slug) return; // not github.com: the feature stays out of sight
    const key = repoKey(entry.root);
    const tip = entry.recent.find((c) => c.sha === sha) ?? entry.snapshot?.incoming[0];
    const branch = entry.snapshot?.upstream ?? '';
    this.tracker.watch(key, slug, sha, { mine: !!tip && tip.email.toLowerCase() === me, author: tip?.author ?? '', head: true, branch });
    for (const c of entry.recent.slice(0, TIMELINE_DEPTH)) {
      this.tracker.watch(key, slug, c.sha, { mine: c.email.toLowerCase() === me, author: c.author, head: false, branch });
    }
    if (this.heads.get(key)?.sha !== sha) this.heads.set(key, { sha });
    this.updateItem();
    this.schedule();
  }

  /** For the teammate-push alert: one quick look so it can say "checks running / failed". */
  async quickLine(entry: RepoEntry): Promise<string | undefined> {
    const sha = entry.snapshot?.upstreamSha;
    if (!this.enabled || !sha || !this.token) return undefined;
    const { slug } = await this.repoInfo(entry.root);
    if (!slug) return undefined;
    await this.onCheck(entry);
    const evs = await Promise.race([this.tracker.tick(), new Promise<TrackerEvent[]>((r) => setTimeout(() => r([]), 3000))]);
    // Handled in the background: the alert above shows first, a finished result follows it.
    void this.handle(evs).then(() => this.schedule());
    const s = this.tracker.summary(sha);
    if (!s) return undefined;
    if (s.state === 'pending') return t('checks.line.pending');
    if (s.state === 'failure') return t('checks.line.failed', s.failed.length, s.total);
    if (s.state === 'success') return t('checks.line.passed', s.passed, s.total);
    return undefined;
  }

  private schedule(): void {
    clearTimeout(this.timer);
    const d = this.tracker.nextDelay();
    if (d === null) return;
    this.timer = setTimeout(() => void this.tick(), d);
  }

  private async tick(): Promise<void> {
    try {
      await this.handle(await this.tracker.tick());
    } catch (e) {
      this.log.appendLine(`[checks] ${e}`);
    }
    this.updateItem();
    this.emitter.fire();
    this.schedule();
  }

  private allows(mine: boolean): boolean {
    const scope = readSettings().checksFor;
    return scope === 'all' || (scope === 'mine' ? mine : !mine);
  }

  private async handle(events: TrackerEvent[]): Promise<void> {
    for (const ev of events) {
      if (ev.type === 'needsAuth') await this.askSignIn();
      else if (ev.type === 'rateLimited') this.log.appendLine(`[checks] rate limited until ${ev.resetAt ? new Date(ev.resetAt).toLocaleTimeString() : '?'}`);
      else if (ev.type === 'pending') this.log.appendLine(`[checks] ${ev.sha.slice(0, 7)} running`);
      else if (ev.type === 'result') await this.onResult(ev);
      else if (ev.type === 'recovered') await this.onRecovered(ev);
    }
  }

  private entryOf(repo: string): RepoEntry | undefined {
    return this.repos.list().find((e) => repoKey(e.root) === repo);
  }

  private async onResult(ev: Extract<TrackerEvent, { type: 'result' }>): Promise<void> {
    const s = ev.summary;
    this.log.appendLine(`[checks] ${ev.sha.slice(0, 7)} ${s.state} (${s.passed}/${s.total})`);
    if (!ev.meta.head) return;
    const h = this.heads.get(ev.repo);
    if (h && h.sha === ev.sha) h.finishedAt = Date.now();
    const entry = this.entryOf(ev.repo);
    if (!entry || !this.allows(ev.meta.mine)) return;
    const branch = ev.meta.branch;
    const failedNames = s.failed.map((f) => f.name).join(', ');
    const see = t('checks.btn.see');
    if (ev.meta.mine) {
      if (s.state === 'success') {
        if (!readSettings().checksOnPass || !ev.wasPending) return;
        await this.alerts.announce({ root: entry.root, level: 'info', title: t('checks.mine.passed', s.passed, s.total), body: branch, buttons: [] });
        return;
      }
      const choice = await this.alerts.announce({
        root: entry.root,
        level: 'warn',
        title: t('checks.mine.failed', s.failed.length, s.total, failedNames),
        body: branch,
        buttons: [see],
        desktop: true,
        desktopPrimary: 'show',
        group: `${entry.root}#checks`,
      });
      if (choice === see) this.onReveal(entry.root, ev.sha);
      return;
    }
    // A teammate's push: only interesting while it isn't pulled yet.
    if (entry.snapshot?.state !== 'behind') return;
    if (s.state === 'failure') {
      const pull = t('checks.btn.pullAnyway');
      const choice = await this.alerts.announce({
        root: entry.root,
        level: 'warn',
        title: t('checks.team.failed', ev.meta.author),
        body: t('checks.team.failedBody', s.failed.length, s.total, failedNames),
        buttons: [see, pull, t('btn.later')],
        desktop: true,
        desktopPrimary: 'show',
      });
      if (choice === see) this.onReveal(entry.root, ev.sha);
      else if (choice === pull) await this.onPull(entry.root);
    } else if (ev.wasPending && readSettings().checksOnPass) {
      const choice = await this.alerts.announce({ root: entry.root, level: 'info', title: t('checks.team.passed', ev.meta.author, s.passed, s.total), body: branch, buttons: [t('btn.pull')] });
      if (choice === t('btn.pull')) await this.onPull(entry.root);
    }
  }

  private async onRecovered(ev: Extract<TrackerEvent, { type: 'recovered' }>): Promise<void> {
    const entry = this.entryOf(ev.repo);
    if (!entry || !this.allows(ev.meta.mine)) return;
    const behind = entry.snapshot?.state === 'behind';
    const choice = await this.alerts.announce({
      root: entry.root,
      level: 'info',
      title: t('checks.fixed', ev.meta.branch),
      body: behind ? t('checks.fixedPull') : '',
      buttons: behind ? [t('btn.pull')] : [],
      desktop: behind,
      desktopPrimary: 'pull',
    });
    if (choice === t('btn.pull')) await this.onPull(entry.root);
  }

  /** Ask once, politely; "No thanks" turns the feature off (everything else keeps working). */
  private async askSignIn(): Promise<void> {
    if (this.context.globalState.get<boolean>(AUTH_ASKED_KEY)) return;
    await this.context.globalState.update(AUTH_ASKED_KEY, true);
    const yes = t('checks.auth.signIn');
    const choice = await vscode.window.showInformationMessage(t('checks.auth.ask'), yes, t('checks.auth.no'));
    if (choice === yes) {
      if (await this.signIn()) return;
    }
    await saveSettings({ actionsEnabled: false });
    void vscode.window.showInformationMessage(t('checks.auth.off'));
  }

  // ---------- views ----------

  badge(sha: string): CheckBadge | undefined {
    if (!this.enabled) return undefined;
    const s = this.tracker.summary(sha);
    if (!s || s.state === 'none') return undefined;
    return {
      state: s.state,
      passed: s.passed,
      total: s.total,
      items: s.items.map((i) => ({
        id: i.id,
        name: i.name,
        state: i.state,
        duration: i.startedAt && i.completedAt ? Math.round((i.completedAt - i.startedAt) / 1000) : undefined,
        url: i.url,
        canExplain: i.state === 'failure',
      })),
    };
  }

  /** Mascot mood for the branch tip. */
  stateFor(root: string): { state: 'running' | 'success' | 'failure' } | undefined {
    const h = this.heads.get(repoKey(root));
    const s = h && this.tracker.summary(h.sha);
    if (!s) return undefined;
    if (s.state === 'pending') return { state: 'running' };
    if (s.state === 'failure') return { state: 'failure' };
    if (s.state === 'success' && h!.finishedAt && Date.now() - h!.finishedAt < SHOW_PASS_MS) return { state: 'success' };
    return undefined;
  }

  async detail(root: string, sha: string, id: string): Promise<FailureDetail | undefined> {
    const s = this.tracker.summary(sha);
    const item = s?.items.find((i) => i.id === id);
    const { slug } = await this.repoInfo(root);
    if (!item || !slug || !this.token) return undefined;
    return fetchFailureDetail(fetchRequester(this.token), slug, item);
  }

  private updateItem(): void {
    const entries = this.repos.list();
    const withHead = entries.map((e) => ({ e, h: this.heads.get(repoKey(e.root)) })).find((x) => x.h && this.tracker.summary(x.h.sha));
    const s = withHead && this.tracker.summary(withHead.h!.sha);
    if (!this.enabled || !s || s.state === 'none') {
      this.item.hide();
      return;
    }
    const icon = s.state === 'pending' ? '$(sync~spin)' : s.state === 'success' ? '$(pass)' : '$(error)';
    this.item.text = `${icon} ${s.passed}/${s.total}`;
    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**${t(`checks.tip.${s.state}` as 'checks.tip.success', withHead!.e.name)}**\n\n`);
    for (const i of s.items.slice(0, 12)) {
      const ic = i.state === 'success' ? '$(pass)' : i.state === 'failure' ? '$(error)' : i.state === 'pending' ? '$(sync~spin)' : '$(circle-slash)';
      const dur = i.startedAt && i.completedAt ? ` · ${formatSeconds(currentLang(), Math.round((i.completedAt - i.startedAt) / 1000))}` : '';
      md.appendMarkdown(`${ic} ${i.name.replace(/[\\`*_[\]]/g, '\\$&')}${dur}\n\n`);
    }
    this.item.tooltip = md;
    this.item.backgroundColor = s.state === 'failure' ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined;
    this.item.command = { title: 'Show', command: 'pushpal.showChecks', arguments: [withHead!.e.root, withHead!.h!.sha] };
    this.item.show();
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.item.dispose();
    this.emitter.dispose();
  }
}
