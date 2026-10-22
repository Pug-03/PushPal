import * as vscode from 'vscode';
import { join } from 'node:path';
import { pull, finishMerge, type PullResult, type ErrorCode } from '../git/repo';
import { listFiles } from '../core/messages';
import type { RepoEntry, RepoManager } from './repoManager';
import type { Alerts } from './alerts';
import { t } from './l10n';

export function errorText(code: ErrorCode, message: string): string {
  if (code === 'other') return t('err.other', message.split('\n').filter(Boolean).slice(-1)[0] ?? '');
  return t(`err.${code}`);
}

/** User-facing commands: pull, open conflicts, finish merge. */
export class Actions {
  /** Webview / commands can ask to reveal the team view focused on one repo. */
  revealTeam: (root?: string) => void = () => undefined;

  constructor(
    private readonly repos: RepoManager,
    private readonly alerts: Alerts,
    private readonly log: vscode.OutputChannel,
  ) {}

  async pickRepo(filter: (e: RepoEntry) => boolean): Promise<RepoEntry | undefined> {
    const candidates = this.repos.list().filter(filter);
    if (candidates.length <= 1) return candidates[0];
    const picked = await vscode.window.showQuickPick(
      candidates.map((e) => ({ label: e.name, description: e.snapshot?.upstream ?? '', detail: e.root, entry: e })),
      { placeHolder: t('pick.repo') },
    );
    return picked?.entry;
  }

  async pull(root?: string): Promise<PullResult | undefined> {
    const entry = root
      ? this.repos.get(root)
      : await this.pickRepo((e) => e.snapshot?.state === 'behind' || e.snapshot?.state === 'conflict').then(
          (e) => e ?? this.repos.list()[0],
        );
    if (!entry || entry.phase === 'pulling') return undefined;
    const target = entry.root;
    const result = await this.repos.withLock(target, async () => {
      this.repos.setPhase(target, 'pulling');
      try {
        return await pull(target);
      } finally {
        this.repos.setPhase(target, 'idle');
      }
    });
    this.log.appendLine(`[pull] ${entry.name}: ${result.kind}`);
    if (result.kind === 'autostashConflict') await this.repos.rememberAutostash(target, result.stashSha);
    this.repos.setLastResult(target, result);
    await this.repos.refresh(target, { fetch: false });
    if (result.kind === 'ok' || result.kind === 'upToDate') this.alerts.clear(target);
    await this.report(entry, result);
    return result;
  }

  private async report(entry: RepoEntry, result: PullResult): Promise<void> {
    const conflictButtons = [t('btn.openMergeEditor'), t('btn.howToFix')];
    switch (result.kind) {
      case 'ok':
        void vscode.window.showInformationMessage(result.autostashed ? t('pull.okLocal', result.pulled) : t('pull.ok', result.pulled));
        return;
      case 'upToDate':
        void vscode.window.showInformationMessage(t('pull.upToDate'));
        return;
      case 'mergeConflict': {
        await this.openConflictFiles(entry.root, result.files);
        const text = t('pull.mergeConflict', result.files.length) + (result.mergeAutostash ? ' ' + t('pull.mergeConflictStash') : '');
        void this.conflictPrompt(entry, result.files, text, conflictButtons);
        return;
      }
      case 'autostashConflict':
        await this.openConflictFiles(entry.root, result.files);
        void this.conflictPrompt(entry, result.files, t('pull.autostashConflict', result.files.length), conflictButtons);
        return;
      case 'blocked': {
        const c = result.conflict;
        if (c.kind === 'merge' && c.files.length === 0) {
          const choice = await vscode.window.showWarningMessage(t('pull.blockedReady'), t('btn.finishMerge'));
          if (choice) await this.finishMerge(entry.root);
          return;
        }
        await this.openConflictFiles(entry.root, c.files);
        void this.conflictPrompt(entry, c.files, t('pull.blocked', c.files.length), conflictButtons);
        return;
      }
      case 'noUpstream':
        void vscode.window.showInformationMessage(t('pull.noUpstream'));
        return;
      case 'detached':
        void vscode.window.showWarningMessage(t('pull.detached'));
        return;
      case 'untrackedInTheWay':
        void vscode.window.showWarningMessage(t('pull.untracked', listFiles(result.files, 5)));
        return;
      case 'error': {
        const choice = await vscode.window.showErrorMessage(errorText(result.code, result.message), t('btn.details'));
        if (choice) this.log.show(true);
        return;
      }
    }
  }

  private async conflictPrompt(entry: RepoEntry, files: string[], text: string, buttons: string[]): Promise<void> {
    const choice = await vscode.window.showWarningMessage(`${text} (${listFiles(files)})`, ...buttons);
    if (choice === t('btn.openMergeEditor') && files[0]) await this.openMergeEditor(entry.root, files[0]);
    else if (choice === t('btn.howToFix')) this.revealTeam(entry.root);
  }

  /** Open each conflicted file (max 5) and the Merge Editor for the first. */
  async openConflictFiles(root: string, files: string[]): Promise<void> {
    for (const f of files.slice(0, 5)) {
      try {
        await vscode.window.showTextDocument(vscode.Uri.file(join(root, f)), { preview: false, preserveFocus: true });
      } catch (e) {
        this.log.appendLine(`[open] ${f}: ${e}`);
      }
    }
    if (files[0]) await this.openMergeEditor(root, files[0]);
  }

  async openMergeEditor(root: string, file: string): Promise<void> {
    const uri = vscode.Uri.file(join(root, file));
    try {
      await vscode.commands.executeCommand('git.openMergeEditor', uri);
    } catch {
      await vscode.window.showTextDocument(uri, { preview: false });
    }
  }

  async openFile(root: string, file: string): Promise<void> {
    await vscode.window.showTextDocument(vscode.Uri.file(join(root, file)), { preview: false });
  }

  async showConflicts(root?: string): Promise<void> {
    const entry = root ? this.repos.get(root) : await this.pickRepo((e) => e.snapshot?.state === 'conflict');
    if (!entry) return this.revealTeam();
    this.revealTeam(entry.root);
    const c = entry.snapshot?.conflict;
    if (c && c.files.length) await this.openConflictFiles(entry.root, c.files);
  }

  async finishMerge(root?: string): Promise<void> {
    const entry = root
      ? this.repos.get(root)
      : await this.pickRepo((e) => e.snapshot?.conflict?.kind === 'merge');
    if (!entry) return;
    const result = await this.repos.withLock(entry.root, () => finishMerge(entry.root));
    this.log.appendLine(`[finishMerge] ${entry.name}: ${result.kind}`);
    if (result.kind === 'autostashConflict') await this.repos.rememberAutostash(entry.root, result.stashSha);
    this.repos.setLastResult(entry.root, result);
    await this.repos.refresh(entry.root, { fetch: false });
    if (result.kind === 'ok') {
      this.alerts.clear(entry.root);
      void vscode.window.showInformationMessage(t('merge.finished'));
    } else {
      await this.report(entry, result);
    }
  }
}
