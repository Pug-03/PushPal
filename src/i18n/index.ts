// Message catalogs shared by the extension, the webviews and the background
// worker. The user can pick a language that differs from VS Code's display
// language, so lookups go through our own catalogs; vscode.l10n is used when
// the setting is "auto" (see src/ext/l10n.ts).
import en from './locales/en.json';
import th from './locales/th.json';

export type Lang = 'th' | 'en';
export type LangSetting = Lang | 'auto';
export type MessageKey = keyof typeof en;

const catalogs: Record<Lang, Record<string, string>> = { en, th };

export function resolveLang(setting: string | undefined, uiLanguage: string, osLocale?: string): Lang {
  if (setting === 'th' || setting === 'en') return setting;
  // VS Code has no official Thai language pack, so also look at the OS locale.
  if (uiLanguage.toLowerCase().startsWith('th')) return 'th';
  if (osLocale && osLocale.toLowerCase().startsWith('th')) return 'th';
  return 'en';
}

export function format(template: string, args: ReadonlyArray<string | number>): string {
  return template.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m));
}

export function translate(lang: Lang, key: MessageKey | string, ...args: Array<string | number>): string {
  const text = catalogs[lang][key] ?? catalogs.en[key] ?? key;
  return format(text, args);
}

export function englishSource(key: MessageKey): string {
  return en[key];
}

/** Webview strings: keys starting with "wv." with the prefix removed. */
export function webviewStrings(lang: Lang): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(catalogs[lang])) if (k.startsWith('wv.')) out[k.slice(3)] = v;
  return out;
}

export function relativeTime(lang: Lang, unixSeconds: number, now = Date.now()): string {
  const diff = Math.round(unixSeconds - now / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (abs < 45) return lang === 'th' ? 'เมื่อสักครู่' : 'just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(unixSeconds * 1000).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "45 วิ", "2 นาที", "1 นาที 30 วิ" / "45 s", "2 min". */
export function formatSeconds(lang: Lang, seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return translate(lang, 'wv.unit.s', s);
  if (s >= 3600 && s % 3600 === 0) return translate(lang, 'wv.unit.h', s / 3600);
  const m = Math.floor(s / 60);
  return s % 60 ? translate(lang, 'wv.unit.minS', m, s % 60) : translate(lang, 'wv.unit.min', m);
}
