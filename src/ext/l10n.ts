import * as vscode from 'vscode';
import { resolveLang, translate, englishSource, type Lang, type MessageKey } from '../i18n';
import { readSettings } from './settings';

/** The language PushPal shows, from the setting or VS Code / OS locale. */
export function currentLang(): Lang {
  const osLocale = Intl.DateTimeFormat().resolvedOptions().locale || process.env.LANG;
  return resolveLang(readSettings().language, vscode.env.language, osLocale);
}

/**
 * Translate a message. With the language on "auto" and VS Code itself in
 * Thai, go through vscode.l10n (bundle generated from our catalog);
 * otherwise use the catalog directly so the user's explicit choice wins.
 */
export function t(key: MessageKey, ...args: Array<string | number>): string {
  const setting = readSettings().language;
  if (setting === 'auto' && vscode.env.language.startsWith('th')) {
    return vscode.l10n.t(englishSource(key), ...args);
  }
  return translate(currentLang(), key, ...args);
}
