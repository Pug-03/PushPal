import * as vscode from 'vscode';
import { DesktopNotifier, type Backend } from '../notify/desktop';
import type { DesktopChannel } from './alerts';
import { productJson } from './host';
import { t } from './l10n';

export function iconPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png').fsPath;
}

/** Adapts the platform notifier to the extension (labels, vscode:// links). */
export class ExtensionDesktopChannel implements DesktopChannel {
  readonly notifier: DesktopNotifier;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.notifier = new DesktopNotifier({
      iconPath: iconPath(context),
      macBundleId: productJson().darwinBundleIdentifier,
      windowsAppId: productJson().win32AppUserModelId,
    });
  }

  backend(): Promise<Backend> {
    return this.notifier.detect();
  }

  async available(): Promise<boolean> {
    return (await this.notifier.detect()) !== 'none';
  }

  uri(action: 'pull' | 'show', root: string): string {
    return `${vscode.env.uriScheme}://${this.context.extension.id}/${action}?repo=${encodeURIComponent(root)}`;
  }

  show(n: { group: string; title: string; message: string; subtitle?: string; root: string }) {
    return this.notifier.show({
      group: n.group,
      title: n.title,
      subtitle: n.subtitle,
      message: n.message,
      primaryLabel: t('btn.pull'),
      laterLabel: t('btn.later'),
      primaryUri: this.uri('pull', n.root),
      contentUri: this.uri('show', n.root),
    });
  }

  remove(group: string): void {
    void this.notifier.remove(group);
  }
}
