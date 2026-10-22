import * as vscode from 'vscode';
import { basename } from 'node:path';
import type { RepoEntry } from './repoManager';
import type { RepoSnapshot } from '../git/repo';
import { SharedStore, repoGroupId } from '../core/storage';
import { summarizeIncoming } from '../core/messages';
import { readSettings } from './settings';
import { t, currentLang } from './l10n';
import { isQuiet, SNOOZE_MS } from '../core/quiet';

export interface DesktopChannel {
  /** Shows a desktop notification; resolves with the button the user pressed. */
  show(n: { group: string; title: string; message: string; subtitle?: string; root: string; primary?: 'pull' | 'show' }): Promise<'primary' | 'content' | 'later' | 'none'>;
  remove(group: string): void;
  available(): Promise<boolean>;
}

/**
 * Decides where to tell the user about new commits:
 * VS Code focused → VS Code pop-up only; otherwise a desktop notification
 * (when enabled), so the same news never pops up in two places.
 */
export class Alerts {
  desktop: DesktopChannel | undefined;
  onPull: (root: string) => Promise<unknown> = async () => undefined;
  onFinishMerge: (root: string) => Promise<unknown> = async () => undefined;
  onReveal: (root: string) => void = () => undefined;
  onFocusWindow: () => void = () => undefined;
  /** One short line about the pushed commit's GitHub checks ("checks running…"), if known. */
  checksLine: (entry: RepoEntry) => Promise<string | undefined> = async () => undefined;

  constructor(
    private readonly store: SharedStore,
    private readonly log: vscode.OutputChannel,
  ) {}

  async onCheck(entry: RepoEntry, previous: RepoSnapshot | null): Promise<void> {
    const snap = entry.snapshot;
    if (!snap) return;

    // Pulled some other way (terminal, Source Control…): remove stale desktop notes.
    if ((previous?.behind ?? 0) > 0 && snap.behind === 0) this.clear(entry.root);

    if (snap.state === 'conflict' && snap.conflict?.kind === 'merge' && snap.conflict.files.length === 0 && (previous?.conflict?.files.length ?? 0) > 0) {
      const choice = await vscode.window.showInformationMessage(t('merge.ready', entry.name), t('btn.finishMerge'));
      if (choice) await this.onFinishMerge(entry.root);
      return;
    }

    if (snap.state !== 'behind' || !snap.upstreamSha) return;
    if (this.isQuiet()) {
      // Not claimed: the alert comes once the quiet hours / snooze are over.
      this.log.appendLine(`[notify] ${entry.name}: quiet hours, not interrupting`);
      return;
    }
    if (!this.store.claimNotification(entry.root, snap.upstreamSha)) return;

    const settings = readSettings();
    const lang = currentLang();
    const overlap = settings.sameFileWarning ? snap.overlap : [];
    const summary = summarizeIncoming(lang, entry.root, snap.incoming, snap.behind, overlap);
    const checks = await this.checksLine(entry).catch(() => undefined);
    if (checks) summary.body = `${summary.body} · ${checks}`;
    this.log.appendLine(`[notify] ${entry.name}: ${snap.behind} new, overlap=${overlap.length}`);

    const focused = vscode.window.state.focused;
    const useDesktop = !focused && settings.notifyDesktop && this.desktop && (await this.desktop.available());
    if (useDesktop) {
      void this.showDesktop(entry.root, summary.title, summary.sameFile ?? summary.body, summary.sameFile ? summary.body : undefined);
    } else if (settings.notifyInVSCode || (!focused && settings.notifyDesktop)) {
      void this.showInVSCode(entry.root, summary.title, summary.body, summary.sameFile);
    }
  }

  async showInVSCode(root: string, title: string, body: string, sameFile?: string): Promise<void> {
    const buttons = [t('btn.pull'), t('btn.details'), t('btn.snooze')];
    const choice = sameFile
      ? await vscode.window.showWarningMessage(`${title} — ${sameFile}`, { detail: body }, ...buttons)
      : await vscode.window.showInformationMessage(`${title} — ${body}`, ...buttons);
    if (choice === t('btn.pull')) await this.onPull(root);
    else if (choice === t('btn.details')) this.onReveal(root);
    else if (choice === t('btn.snooze')) this.snooze();
  }

  /** Inside do-not-disturb hours, or snoozed. The status bar keeps updating either way. */
  isQuiet(now = new Date()): boolean {
    const s = readSettings();
    return isQuiet({ enabled: s.quietEnabled, start: s.quietStart, end: s.quietEnd }, this.store.snoozeUntil(), now);
  }

  snooze(ms = SNOOZE_MS): void {
    const until = Date.now() + ms;
    this.store.setSnooze(until);
    this.log.appendLine(`[notify] snoozed until ${new Date(until).toLocaleTimeString()}`);
    void vscode.window.setStatusBarMessage(t('snooze.on', new Date(until).toLocaleTimeString(currentLang() === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit' })), 5000);
    this.onQuietChange();
  }

  unsnooze(): void {
    this.store.setSnooze(0);
    this.onQuietChange();
  }

  onQuietChange: () => void = () => undefined;

  /**
   * A one-off notification (GitHub checks etc.) with the same rules as push alerts:
   * VS Code focused → pop-up; otherwise desktop when allowed; quiet hours → nothing.
   * Resolves with the button pressed (desktop primary = buttons[0]).
   */
  async announce(a: {
    root: string;
    level: 'info' | 'warn';
    title: string;
    body: string;
    buttons: string[];
    desktop?: boolean;
    desktopPrimary?: 'pull' | 'show';
    group?: string;
  }): Promise<string | undefined> {
    if (this.isQuiet()) return undefined;
    const settings = readSettings();
    const focused = vscode.window.state.focused;
    if (a.desktop && !focused && settings.notifyDesktop && this.desktop && (await this.desktop.available())) {
      const outcome = await this.desktop.show({ group: a.group ?? repoGroupId(a.root), title: a.title, message: a.body || a.title, root: a.root, primary: a.desktopPrimary });
      if (outcome === 'primary' || outcome === 'content') {
        this.onFocusWindow();
        return a.buttons[0];
      }
      return undefined;
    }
    if (!settings.notifyInVSCode && focused) return undefined;
    const text = a.body ? `${a.title} — ${a.body}` : a.title;
    const buttons = a.level === 'warn' ? [...a.buttons, t('btn.snooze')] : a.buttons;
    const choice = a.level === 'warn' ? await vscode.window.showWarningMessage(text, ...buttons) : await vscode.window.showInformationMessage(text, ...buttons);
    if (choice === t('btn.snooze')) {
      this.snooze();
      return undefined;
    }
    return choice;
  }

  private async showDesktop(root: string, title: string, message: string, subtitle?: string): Promise<void> {
    if (!this.desktop) return;
    const outcome = await this.desktop.show({ group: repoGroupId(root), title, message, subtitle, root });
    this.log.appendLine(`[desktop] ${basename(root)}: ${outcome}`);
    if (outcome === 'primary') {
      this.onFocusWindow();
      await this.onPull(root);
    } else if (outcome === 'content') {
      this.onFocusWindow();
      this.onReveal(root);
    }
  }

  /** Remove any desktop notification still on screen for this repo. */
  clear(root: string): void {
    this.desktop?.remove(repoGroupId(root));
  }
}
