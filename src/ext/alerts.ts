import * as vscode from 'vscode';
import { basename } from 'node:path';
import type { RepoEntry } from './repoManager';
import type { RepoSnapshot } from '../git/repo';
import { SharedStore, repoGroupId } from '../core/storage';
import { summarizeIncoming } from '../core/messages';
import { readSettings } from './settings';
import { t, currentLang } from './l10n';

export interface DesktopChannel {
  /** Shows a desktop notification; resolves with the button the user pressed. */
  show(n: { group: string; title: string; message: string; subtitle?: string; root: string }): Promise<'primary' | 'content' | 'later' | 'none'>;
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
    if (!this.store.claimNotification(entry.root, snap.upstreamSha)) return;

    const settings = readSettings();
    const lang = currentLang();
    const overlap = settings.sameFileWarning ? snap.overlap : [];
    const summary = summarizeIncoming(lang, entry.root, snap.incoming, snap.behind, overlap);
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
    const buttons = [t('btn.pull'), t('btn.details')];
    const choice = sameFile
      ? await vscode.window.showWarningMessage(`${title} — ${sameFile}`, { detail: body }, ...buttons)
      : await vscode.window.showInformationMessage(`${title} — ${body}`, ...buttons);
    if (choice === t('btn.pull')) await this.onPull(root);
    else if (choice === t('btn.details')) this.onReveal(root);
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
