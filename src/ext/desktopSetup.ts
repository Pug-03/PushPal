import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import type { ExtensionDesktopChannel } from './desktopChannel';
import type { Backend } from '../notify/desktop';
import { t } from './l10n';

const BREW_PATHS = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'];

/** Sends a test notification both in VS Code and on the desktop. */
export async function sendTestNotification(desktop: ExtensionDesktopChannel): Promise<Backend> {
  void vscode.window.showInformationMessage(`${t('test.title')} — ${t('test.sentInVSCode')}`);
  desktop.notifier.reset();
  const backend = await desktop.backend();
  if (backend === 'none') {
    void vscode.window.showWarningMessage(t('desktop.unavailable'));
    return backend;
  }
  void desktop.notifier.show({
    group: 'pushpal-test',
    title: t('test.title'),
    message: t('test.body'),
    primaryLabel: t('btn.ok'),
    laterLabel: t('btn.later'),
  });
  if (backend === 'osascript') {
    const choice = await vscode.window.showInformationMessage(t('desktop.osascript'), t('btn.installAlerter'));
    if (choice) installAlerter(desktop);
  }
  return backend;
}

/** macOS: run `brew install vjeantet/tap/alerter` in a visible terminal. */
export function installAlerter(desktop: ExtensionDesktopChannel): void {
  const brew = BREW_PATHS.find((p) => existsSync(p));
  if (!brew) {
    void vscode.window.showWarningMessage(t('alerter.noBrew'), t('btn.openBrew')).then((c) => {
      if (c) void vscode.env.openExternal(vscode.Uri.parse('https://brew.sh'));
    });
    return;
  }
  const term = vscode.window.createTerminal({ name: 'PushPal: alerter', shellPath: brew, shellArgs: ['install', 'vjeantet/tap/alerter'] });
  term.show();
  void vscode.window.showInformationMessage(t('alerter.installing'));
  const sub = vscode.window.onDidCloseTerminal((closed) => {
    if (closed === term) {
      sub.dispose();
      desktop.notifier.reset();
    }
  });
}
