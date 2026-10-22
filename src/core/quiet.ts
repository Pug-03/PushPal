// Do-not-disturb: hours with no pop-ups / desktop notifications, plus "snooze
// for an hour". The status bar keeps updating. No `vscode` import (the
// background worker uses it too).
import { inActiveHours } from './frequency';

export interface QuietConfig {
  enabled: boolean;
  /** "HH:MM", 24-hour. The window may cross midnight (22:00–07:00). */
  start: string;
  end: string;
}

export const DEFAULT_QUIET: QuietConfig = { enabled: false, start: '22:00', end: '08:00' };
export const SNOOZE_MS = 60 * 60_000;

/** Should notifications stay quiet right now? */
export function isQuiet(q: QuietConfig | undefined, snoozeUntil: number | undefined, now: Date): boolean {
  if (snoozeUntil && now.getTime() < snoozeUntil) return true;
  if (!q || !q.enabled || q.start === q.end) return false;
  return inActiveHours({ enabled: true, start: q.start, end: q.end }, now);
}
