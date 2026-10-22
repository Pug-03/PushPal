import * as vscode from 'vscode';
import type { LangSetting } from '../i18n';

export type ThemeSetting = 'system' | 'light' | 'dark';

export interface Settings {
  language: LangSetting;
  theme: ThemeSetting;
  intervalSeconds: number;
  notifyInVSCode: boolean;
  notifyDesktop: boolean;
  notifyBackground: boolean;
  sameFileWarning: boolean;
}

export function readSettings(): Settings {
  const c = vscode.workspace.getConfiguration('pushpal');
  return {
    language: c.get<LangSetting>('language', 'auto'),
    theme: c.get<ThemeSetting>('theme', 'system'),
    intervalSeconds: Math.max(15, c.get<number>('checkIntervalSeconds', 60)),
    notifyInVSCode: c.get<boolean>('notify.inVSCode', true),
    notifyDesktop: c.get<boolean>('notify.desktop', true),
    notifyBackground: c.get<boolean>('notify.background', false),
    sameFileWarning: c.get<boolean>('notify.sameFileWarning', true),
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const c = vscode.workspace.getConfiguration('pushpal');
  const map: Record<keyof Settings, string> = {
    language: 'language',
    theme: 'theme',
    intervalSeconds: 'checkIntervalSeconds',
    notifyInVSCode: 'notify.inVSCode',
    notifyDesktop: 'notify.desktop',
    notifyBackground: 'notify.background',
    sameFileWarning: 'notify.sameFileWarning',
  };
  for (const [k, v] of Object.entries(patch) as Array<[keyof Settings, unknown]>) {
    await c.update(map[k], v, vscode.ConfigurationTarget.Global);
  }
}
