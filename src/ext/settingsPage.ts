import * as vscode from 'vscode';
import { webviewStrings, type Lang, type LangSetting } from '../i18n';
import { renderPage } from './webview';
import { readSettings, saveSettings, resetAllSettings, type Settings, type ThemeSetting, type FrequencyField } from './settings';
import { currentLang, t } from './l10n';
import { isBackgroundSupported } from '../background/agent';
import { LIMITS, PRESETS, estimate, estimateActions, presetConfig, type Mode, type PresetMode } from '../core/frequency';
import { countRemoteRefs } from '../git/repo';
import { describeAdjustments, type ModeController } from './modes';
import { scheduleLine } from './statusBar';
import type { RepoManager } from './repoManager';
import type { Scheduler } from './scheduler';
import type { ChecksWatcher } from './checks';
import type { ExtensionDesktopChannel } from './desktopChannel';
import { sendTestNotification } from './desktopSetup';

export interface FrequencyDeps {
  modes: ModeController;
  repos: RepoManager;
  scheduler: Scheduler;
  ci: ChecksWatcher;
  /** `gh` CLI installed and signed in (background alerts can include checks). */
  ghFound?: () => boolean;
  /** "Mute for an hour" end time (ms), 0 when not muted. */
  snoozeUntil?: () => number;
}

/** Everything the mode cards and the custom panel need. Shared with the wizard. */
export async function frequencyModel(d: FrequencyDeps) {
  const refs = await Promise.all(d.repos.list().map((e) => countRemoteRefs(e.root)));
  const config = d.modes.config;
  const per = (seconds: number) => estimate(seconds, refs);
  const presets = Object.fromEntries(
    (Object.keys(PRESETS) as PresetMode[]).map((m) => [m, { ...presetConfig(m), estimate: per(PRESETS[m].checkSeconds) }]),
  );
  return {
    mode: d.modes.mode,
    config,
    limits: LIMITS,
    presets,
    repoCount: refs.length,
    estimates: {
      check: per(config.checkSeconds),
      background: per(config.backgroundSeconds),
      actions: estimateActions(config.actionsSeconds),
    },
    effective: d.scheduler.effective ?? null,
    nowText: scheduleLine({ mode: d.modes.mode, effective: d.scheduler.effective }).replace(/\$\([^)]+\)\s*/g, ''),
    signedIn: d.ci.signedIn,
    ghFound: d.ghFound?.() ?? false,
    snoozeUntil: d.snoozeUntil?.() ?? 0,
  };
}

type FromPage =
  | { type: 'ready' }
  | { type: 'setMode'; mode: Mode }
  | { type: 'setValues'; patch: Partial<Record<FrequencyField, unknown>> }
  | { type: 'setSetting'; key: keyof Settings; value: unknown }
  | { type: 'test' }
  | { type: 'signIn' }
  | { type: 'reset' }
  | { type: 'openVsSettings' }
  | { type: 'snooze' }
  | { type: 'unsnooze' };

/** "ตั้งค่า PushPal / PushPal Settings": one page with every setting, live both ways. */
export class SettingsPage {
  private static current: SettingsPage | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly panel: vscode.WebviewPanel;
  private pending: NodeJS.Timeout | undefined;

  static show(context: vscode.ExtensionContext, deps: FrequencyDeps, desktop: ExtensionDesktopChannel, section?: string): void {
    if (SettingsPage.current) {
      SettingsPage.current.panel.reveal();
      if (section) void SettingsPage.current.panel.webview.postMessage({ type: 'section', section });
      return;
    }
    SettingsPage.current = new SettingsPage(context, deps, desktop, section);
  }

  /** Re-send the page data (e.g. snooze changed). */
  static refresh(): void {
    SettingsPage.current?.schedulePost();
  }

  static postTheme(theme: ThemeSetting): void {
    void SettingsPage.current?.panel.webview.postMessage({ type: 'theme', theme });
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly deps: FrequencyDeps,
    private readonly desktop: ExtensionDesktopChannel,
    private readonly section: string | undefined,
  ) {
    const lang = currentLang();
    this.panel = vscode.window.createWebviewPanel('pushpal.settings', title(lang), vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    });
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
    this.render(lang);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((m: FromPage) => void this.onMessage(m), null, this.disposables);
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('pushpal')) return;
        if (e.affectsConfiguration('pushpal.language')) return this.render(currentLang());
        this.schedulePost();
      }),
      deps.modes.onDidChange(() => this.schedulePost()),
      deps.scheduler.onDidChange(() => this.schedulePost()),
      deps.ci.onDidChange(() => this.schedulePost()),
      deps.repos.onDidChange(() => this.schedulePost()),
    );
  }

  private render(lang: Lang): void {
    const s = readSettings();
    this.panel.title = title(lang);
    this.panel.webview.html = renderPage(this.panel.webview, this.context.extensionUri, {
      title: title(lang),
      lang,
      theme: s.theme,
      surface: 'panel',
      styles: ['controls.css', 'settings.css'],
      scripts: ['modes.js', 'settings.js'],
      init: { lang, strings: webviewStrings(lang), platform: process.platform, bgSupported: isBackgroundSupported(process.platform), section: this.section },
    });
  }

  private schedulePost(): void {
    clearTimeout(this.pending);
    this.pending = setTimeout(() => void this.post(), 60);
  }

  private async post(extra?: Record<string, unknown>): Promise<void> {
    const s = readSettings();
    const model = await frequencyModel(this.deps);
    this.send({ type: 'state', settings: s, freq: model, ...extra });
  }

  private async onMessage(m: FromPage): Promise<void> {
    switch (m.type) {
      case 'ready':
        return this.post();
      case 'setMode':
        await this.deps.modes.setMode(m.mode);
        return this.post();
      case 'setValues': {
        const adj = await this.deps.modes.setValues(m.patch);
        return this.post(adj.length ? { notice: describeAdjustments(adj), adjusted: adj.map((a) => a.key) } : undefined);
      }
      case 'setSetting':
        if (m.key === 'language') await saveSettings({ language: m.value as LangSetting });
        else await saveSettings({ [m.key]: m.value } as Partial<Settings>);
        return;
      case 'test':
        await sendTestNotification(this.desktop);
        return;
      case 'signIn':
        await this.deps.ci.signIn();
        return this.post();
      case 'reset':
        await resetAllSettings();
        await this.deps.modes.init();
        return this.post({ notice: t('settings.resetDone') });
      case 'snooze':
        await vscode.commands.executeCommand('pushpal.snooze');
        return this.post();
      case 'unsnooze':
        await vscode.commands.executeCommand('pushpal.unsnooze');
        return this.post();
      case 'openVsSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:' + this.context.extension.id);
        return;
    }
  }

  private disposed = false;

  /** postMessage throws once the panel is closed (e.g. an async result arrives late). */
  private send(msg: unknown): void {
    if (this.disposed) return;
    try {
      void this.panel.webview.postMessage(msg);
    } catch {
      /* panel closed */
    }
  }

  private dispose(): void {
    this.disposed = true;
    clearTimeout(this.pending);
    SettingsPage.current = undefined;
    for (const d of this.disposables) d.dispose();
  }
}

function title(lang: Lang): string {
  return lang === 'th' ? 'ตั้งค่า PushPal' : 'PushPal Settings';
}
