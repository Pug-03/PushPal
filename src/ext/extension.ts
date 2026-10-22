import * as vscode from 'vscode';
import { RepoManager } from './repoManager';
import { StatusBar } from './statusBar';
import { Actions } from './actions';
import { Alerts } from './alerts';
import { SharedStore, HEARTBEAT_INTERVAL_MS } from '../core/storage';
import { readSettings } from './settings';
import { t } from './l10n';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = vscode.window.createOutputChannel('PushPal');
  const store = new SharedStore(context.globalStorageUri.fsPath);
  const repos = new RepoManager(context, log);
  const alerts = new Alerts(store, log);
  const actions = new Actions(repos, alerts, log);
  const status = new StatusBar(repos);
  context.subscriptions.push(log, repos, status);

  alerts.onPull = (root) => actions.pull(root);
  alerts.onFinishMerge = (root) => actions.finishMerge(root);
  alerts.onReveal = (root) => actions.revealTeam(root);
  repos.onDidCheck((entry, prev) => alerts.onCheck(entry, prev));
  repos.onAutostashDropped = () => void vscode.window.showInformationMessage(t('autostash.dropped'));
  actions.revealTeam = () => void vscode.commands.executeCommand('pushpal.team.focus');

  repos.onDidChange(() => {
    const hasConflict = repos.list().some((e) => e.snapshot?.state === 'conflict');
    void vscode.commands.executeCommand('setContext', 'pushpal.hasConflict', hasConflict);
  });

  const cmd = (id: string, fn: (...args: any[]) => unknown) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  cmd('pushpal.pull', (root?: string) => actions.pull(typeof root === 'string' ? root : undefined));
  cmd('pushpal.checkNow', () => repos.refreshAll({ fetch: true }));
  cmd('pushpal.showConflicts', () => actions.showConflicts());
  cmd('pushpal.finishMerge', () => actions.finishMerge());
  cmd('pushpal.showTeam', () => actions.revealTeam());
  cmd('pushpal.openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:' + context.extension.id));

  // Heartbeat: tells the background worker this window watches these repos.
  const beat = () => {
    try {
      store.writeHeartbeat(vscode.env.sessionId, repos.list().map((e) => e.root));
    } catch (e) {
      log.appendLine(`[heartbeat] ${e}`);
    }
  };
  const hb = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  repos.onDidChange(beat);
  context.subscriptions.push({ dispose: () => (clearInterval(hb), store.removeHeartbeat(vscode.env.sessionId)) });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('pushpal.checkIntervalSeconds')) repos.setInterval(readSettings().intervalSeconds);
      if (e.affectsConfiguration('pushpal.language')) status.update();
    }),
  );

  await repos.init(readSettings().intervalSeconds);
  beat();
}

export function deactivate(): void {
  // Disposables registered on the context clean everything up.
}
