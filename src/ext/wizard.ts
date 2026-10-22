import * as vscode from 'vscode';
import { webviewStrings, type Lang } from '../i18n';
import { renderPage } from './webview';
import { readSettings, saveSettings, type ThemeSetting } from './settings';
import { currentLang } from './l10n';
import { isBackgroundSupported } from '../background/agent';
import type { ExtensionDesktopChannel } from './desktopChannel';
import { sendTestNotification, installAlerter } from './desktopSetup';
import { frequencyModel, type FrequencyDeps } from './settingsPage';
import type { Mode } from '../core/frequency';

export const SETUP_SHOWN_KEY = 'pushpal.setupShown';

type FromWizard =
  | { type: 'setLang'; lang: Lang }
  | { type: 'setTheme'; theme: ThemeSetting }
  | { type: 'setNotify'; key: 'notifyInVSCode' | 'notifyDesktop' | 'notifyBackground'; value: boolean }
  | { type: 'setMode'; mode: Mode }
  | { type: 'openSettings' }
  | { type: 'test' }
  | { type: 'installAlerter' }
  | { type: 'finish' }
  | { type: 'close' };

/** Full-page, multi-step setup wizard (one instance at a time). */
export class SetupWizard {
  private static current: SetupWizard | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  static show(
    context: vscode.ExtensionContext,
    desktop: ExtensionDesktopChannel,
    applyBackground: (want: boolean | undefined) => Promise<string>,
    onDone: () => void,
    freq: FrequencyDeps,
  ): void {
    if (SetupWizard.current) {
      SetupWizard.current.panel.reveal();
      return;
    }
    void context.globalState.update(SETUP_SHOWN_KEY, true);
    SetupWizard.current = new SetupWizard(context, desktop, applyBackground, onDone, freq);
  }

  static postTheme(theme: ThemeSetting): void {
    void SetupWizard.current?.panel.webview.postMessage({ type: 'theme', theme });
  }

  private readonly panel: vscode.WebviewPanel;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly desktop: ExtensionDesktopChannel,
    private readonly applyBackground: (want: boolean | undefined) => Promise<string>,
    private readonly onDone: () => void,
    private readonly freq: FrequencyDeps,
  ) {
    const lang = currentLang();
    this.panel = vscode.window.createWebviewPanel('pushpal.setup', lang === 'th' ? 'ตั้งค่า PushPal' : 'PushPal Setup', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    });
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
    this.render(lang);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((m: FromWizard) => void this.onMessage(m), null, this.disposables);
    freq.modes.onDidChange(() => void this.postFreq(), null, this.disposables);
  }

  private async postFreq(): Promise<void> {
    void this.panel.webview.postMessage({ type: 'freq', freq: await frequencyModel(this.freq) });
  }

  private async render(lang: Lang): Promise<void> {
    const s = readSettings();
    const backend = await this.desktop.backend();
    this.panel.webview.html = renderPage(this.panel.webview, this.context.extensionUri, {
      title: 'PushPal',
      lang,
      theme: s.theme,
      surface: 'panel',
      styles: ['controls.css', 'wizard.css'],
      scripts: ['modes.js', 'wizard.js'],
      init: {
        lang,
        theme: s.theme,
        strings: { th: webviewStrings('th'), en: webviewStrings('en') },
        platform: process.platform,
        backend,
        bgSupported: isBackgroundSupported(process.platform),
        notify: { notifyInVSCode: s.notifyInVSCode, notifyDesktop: s.notifyDesktop, notifyBackground: s.notifyBackground },
        freq: await frequencyModel(this.freq),
      },
    });
  }

  private async onMessage(m: FromWizard): Promise<void> {
    switch (m.type) {
      case 'setLang':
        await saveSettings({ language: m.lang });
        this.panel.title = m.lang === 'th' ? 'ตั้งค่า PushPal' : 'PushPal Setup';
        return;
      case 'setTheme':
        await saveSettings({ theme: m.theme });
        return;
      case 'setNotify':
        // Background is applied on "finish" so toggling doesn't install/remove repeatedly.
        if (m.key !== 'notifyBackground') await saveSettings({ [m.key]: m.value });
        else this.wantBackground = m.value;
        return;
      case 'setMode':
        await this.freq.modes.setMode(m.mode);
        return;
      case 'openSettings':
        await vscode.commands.executeCommand('pushpal.openSettings', 'frequency');
        return;
      case 'test': {
        const backend = await sendTestNotification(this.desktop);
        void this.panel.webview.postMessage({ type: 'testResult', backend });
        return;
      }
      case 'installAlerter':
        installAlerter(this.desktop);
        return;
      case 'finish': {
        let result: string;
        try {
          result = await this.applyBackground(this.wantBackground);
        } catch (e) {
          result = 'failed:' + (e instanceof Error ? e.message : String(e));
        }
        void this.panel.webview.postMessage({ type: 'finished', background: result });
        return;
      }
      case 'close':
        this.panel.dispose();
        this.onDone();
        return;
    }
  }

  private wantBackground: boolean | undefined;

  private dispose(): void {
    SetupWizard.current = undefined;
    for (const d of this.disposables) d.dispose();
  }
}
