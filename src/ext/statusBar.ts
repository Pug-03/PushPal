import * as vscode from 'vscode';
import type { RepoEntry, RepoManager } from './repoManager';
import { t, currentLang } from './l10n';
import { relativeTime, formatSeconds } from '../i18n';
import type { Effective, Mode } from '../core/frequency';

/** What the scheduler is doing, for the tooltip. */
export interface ScheduleInfo {
  mode: Mode;
  effective: Effective | undefined;
}

type Aggregate = 'pulling' | 'conflict' | 'behind' | 'error' | 'upToDate' | 'noUpstream' | 'checking' | 'none';

/** One status bar item summarising every repo in the window. */
export class StatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem('pushpal.status', vscode.StatusBarAlignment.Left, 50);

  constructor(
    private readonly repos: RepoManager,
    private readonly schedule: () => ScheduleInfo | undefined = () => undefined,
  ) {
    this.item.name = 'PushPal';
    repos.onDidChange(() => this.update());
    this.update();
  }

  static aggregate(entries: RepoEntry[]): Aggregate {
    if (entries.length === 0) return 'none';
    if (entries.some((e) => e.phase === 'pulling')) return 'pulling';
    if (entries.some((e) => e.snapshot?.state === 'conflict')) return 'conflict';
    if (entries.some((e) => e.snapshot?.state === 'behind')) return 'behind';
    if (entries.every((e) => !e.snapshot)) return 'checking';
    if (entries.some((e) => e.snapshot?.state === 'error')) return 'error';
    if (entries.some((e) => e.snapshot?.state === 'upToDate')) return 'upToDate';
    return 'noUpstream';
  }

  update(): void {
    const entries = this.repos.list();
    const state = StatusBar.aggregate(entries);
    const item = this.item;
    item.backgroundColor = undefined;
    item.color = undefined;
    switch (state) {
      case 'none':
        item.hide();
        return;
      case 'pulling':
        item.text = t('status.pulling');
        item.command = 'pushpal.showTeam';
        break;
      case 'checking':
        item.text = t('status.checking');
        item.command = 'pushpal.showTeam';
        break;
      case 'conflict':
        item.text = t('status.conflict');
        item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
        item.command = 'pushpal.showConflicts';
        break;
      case 'behind': {
        const n = entries.reduce((sum, e) => sum + (e.snapshot?.state === 'behind' ? e.snapshot.behind : 0), 0);
        item.text = t('status.behind', n);
        item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
        item.command = 'pushpal.pull';
        break;
      }
      case 'error':
        item.text = t('status.error');
        item.command = 'pushpal.checkNow';
        break;
      case 'upToDate':
        item.text = t('status.upToDate');
        item.command = 'pushpal.showTeam';
        break;
      case 'noUpstream':
        item.text = t('status.noUpstream');
        item.command = 'pushpal.showTeam';
        break;
    }
    item.tooltip = this.tooltip(entries);
    item.accessibilityInformation = { label: `PushPal: ${item.text.replace(/\$\([^)]+\)\s*/g, '')}` };
    item.show();
  }

  private tooltip(entries: RepoEntry[]): vscode.MarkdownString {
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: ['pushpal.switchMode', 'pushpal.openSettings'] };
    md.appendMarkdown(`$(account) ${t('tip.header')}\n\n`);
    let newest = 0;
    for (const e of entries) {
      const s = e.snapshot;
      newest = Math.max(newest, s?.checkedAt ?? 0);
      const name = escapeMd(e.name);
      if (!s) continue;
      let line: string;
      switch (s.state) {
        case 'upToDate':
          line = t('tip.upToDate', name, escapeMd(s.upstream ?? ''));
          break;
        case 'behind':
          line = t('tip.behind', name, s.behind, escapeMd(s.upstream ?? ''));
          break;
        case 'conflict':
          line = s.conflict?.kind === 'merge' && s.conflict.files.length === 0 ? t('tip.mergeReady', name) : t('tip.conflict', name, s.conflict?.files.length ?? 0);
          break;
        case 'error':
          line = t('tip.error', name, t(`err.${s.error?.code ?? 'other'}` as 'err.other', escapeMd(s.error?.message.split('\n')[0] ?? '')));
          break;
        case 'noUpstream':
          line = t('tip.noUpstream', name, escapeMd(s.branch ?? ''));
          break;
        case 'detached':
          line = t('tip.detached', name);
          break;
      }
      md.appendMarkdown(`- ${line}\n`);
    }
    if (newest) md.appendMarkdown(`\n_${t('tip.checkedAt', relativeTime(currentLang(), newest / 1000))}_`);
    const info = this.schedule();
    if (info) {
      md.appendMarkdown(`\n\n---\n\n${scheduleLine(info)}\n\n`);
      md.appendMarkdown(`${t(`mode.icon.${info.mode}` as 'mode.icon.fast')} ${t('tip.mode', t(`mode.${info.mode}` as 'mode.fast'))} · [${t('tip.switchMode')}](command:pushpal.switchMode) · [${t('tip.settings')}](command:pushpal.openSettings)`);
    }
    return md;
  }

  dispose(): void {
    this.item.dispose();
  }
}

/** "Checking every 60 s because the battery is at 15%", etc. */
export function scheduleLine(info: ScheduleInfo): string {
  const e = info.effective;
  if (!e) return '';
  const every = formatSeconds(currentLang(), e.seconds ?? 0);
  switch (e.reason) {
    case 'outsideHours':
      return `$(debug-pause) ${t('sched.paused', e.resumeAt ?? '')}`;
    case 'lowBattery':
      return `$(watch) ${t('sched.lowBattery', every, e.percent ?? '?')}`;
    case 'idle':
      return `$(watch) ${t('sched.idle', every, e.idleMinutes ?? '?')}`;
    case 'lowPowerMode':
      return `$(watch) ${t('sched.lowPowerMode', every)}`;
    case 'pluggedIn':
      return `$(plug) ${t('sched.pluggedIn', every)}`;
    default:
      return `$(sync) ${t('sched.normal', every)}`;
  }
}

function escapeMd(s: string): string {
  return s.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}
