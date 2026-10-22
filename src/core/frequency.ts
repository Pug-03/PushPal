// How often PushPal checks, and when it slows down to save battery.
// Pure logic (no `vscode`, no OS calls): shared by the extension, the
// background worker and the tests.

export type Mode = 'fast' | 'balanced' | 'batterySaver' | 'custom';
export const MODES: Mode[] = ['fast', 'balanced', 'batterySaver', 'custom'];
export type PresetMode = Exclude<Mode, 'custom'>;

export interface SaverRule {
  enabled: boolean;
  /** Check every this many seconds while the rule applies. */
  seconds: number;
}

export interface FrequencyConfig {
  /** Normal check interval while VS Code is open. */
  checkSeconds: number;
  /** GitHub Actions polling interval while a run is in progress. */
  actionsSeconds: number;
  /** Interval of the background job while VS Code is closed. */
  backgroundSeconds: number;
  idle: SaverRule & { minutes: number };
  lowBattery: SaverRule & { percent: number };
  lowPowerMode: SaverRule;
  /** Plugged in → always the normal interval, whatever the rules say. */
  pluggedInUsesNormal: boolean;
  activeHours: { enabled: boolean; start: string; end: string };
}

/** Allowed range of every number, as [min, max]. */
export const LIMITS = {
  checkSeconds: [10, 300],
  actionsSeconds: [10, 120],
  // Task Scheduler can't repeat faster than once a minute, and launchd runs the
  // job every 60 s, so the background interval starts at 60 s on every OS.
  backgroundSeconds: [60, 3600],
  'idle.minutes': [1, 240],
  'idle.seconds': [10, 3600],
  'lowBattery.percent': [5, 95],
  'lowBattery.seconds': [10, 3600],
  'lowPowerMode.seconds': [10, 3600],
} as const;
export type LimitKey = keyof typeof LIMITS;

const ACTIVE_HOURS_DEFAULT = { enabled: false, start: '08:00', end: '23:00' };

export const PRESETS: Record<PresetMode, Omit<FrequencyConfig, 'activeHours'>> = {
  fast: {
    checkSeconds: 10,
    actionsSeconds: 10,
    backgroundSeconds: 60,
    idle: { enabled: true, minutes: 10, seconds: 60 },
    lowBattery: { enabled: true, percent: 20, seconds: 60 },
    lowPowerMode: { enabled: true, seconds: 60 },
    pluggedInUsesNormal: true,
  },
  balanced: {
    checkSeconds: 30,
    actionsSeconds: 20,
    backgroundSeconds: 120,
    idle: { enabled: true, minutes: 10, seconds: 60 },
    lowBattery: { enabled: true, percent: 20, seconds: 60 },
    lowPowerMode: { enabled: true, seconds: 60 },
    pluggedInUsesNormal: true,
  },
  batterySaver: {
    checkSeconds: 60,
    actionsSeconds: 30,
    backgroundSeconds: 300,
    idle: { enabled: true, minutes: 5, seconds: 180 },
    lowBattery: { enabled: true, percent: 30, seconds: 180 },
    lowPowerMode: { enabled: true, seconds: 300 },
    pluggedInUsesNormal: true,
  },
};

export const DEFAULT_MODE: Mode = 'balanced';

export function presetConfig(mode: PresetMode, activeHours = ACTIVE_HOURS_DEFAULT): FrequencyConfig {
  const p = PRESETS[mode];
  return {
    ...p,
    idle: { ...p.idle },
    lowBattery: { ...p.lowBattery },
    lowPowerMode: { ...p.lowPowerMode },
    activeHours: { ...activeHours },
  };
}

export const DEFAULT_CONFIG: FrequencyConfig = presetConfig('balanced');

export interface Adjustment {
  key: LimitKey | 'activeHours.start' | 'activeHours.end';
  from: unknown;
  to: number | string;
  min?: number;
  max?: number;
}

function getPath(o: FrequencyConfig, key: LimitKey): number {
  const [a, b] = key.split('.') as [string, string | undefined];
  const v = (o as unknown as Record<string, unknown>)[a];
  return (b ? (v as Record<string, unknown>)[b] : v) as number;
}

function setPath(o: FrequencyConfig, key: LimitKey, value: number): void {
  const [a, b] = key.split('.') as [string, string | undefined];
  const rec = o as unknown as Record<string, unknown>;
  if (b) (rec[a] as Record<string, unknown>)[b] = value;
  else rec[a] = value;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Pull every number into its allowed range (rounded to whole units) and fix
 * malformed times. Returns what was changed so the UI can say so.
 */
export function clampConfig(input: FrequencyConfig): { config: FrequencyConfig; adjustments: Adjustment[] } {
  const config: FrequencyConfig = JSON.parse(JSON.stringify(input));
  const adjustments: Adjustment[] = [];
  for (const key of Object.keys(LIMITS) as LimitKey[]) {
    const [min, max] = LIMITS[key];
    const raw = getPath(config, key);
    const fallback = getPath(DEFAULT_CONFIG, key);
    const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : fallback;
    const v = Math.min(max, Math.max(min, n));
    if (v !== raw) {
      setPath(config, key, v);
      adjustments.push({ key, from: raw, to: v, min, max });
    }
  }
  for (const k of ['start', 'end'] as const) {
    const raw = config.activeHours[k];
    if (typeof raw !== 'string' || !TIME.test(raw)) {
      const to = ACTIVE_HOURS_DEFAULT[k];
      config.activeHours[k] = to;
      adjustments.push({ key: `activeHours.${k}`, from: raw, to });
    }
  }
  return { config, adjustments };
}

/** Do these values equal the preset? (Active hours are not part of a preset.) */
export function matchesPreset(mode: PresetMode, c: FrequencyConfig): boolean {
  const p = PRESETS[mode];
  return (
    c.checkSeconds === p.checkSeconds &&
    c.actionsSeconds === p.actionsSeconds &&
    c.backgroundSeconds === p.backgroundSeconds &&
    c.pluggedInUsesNormal === p.pluggedInUsesNormal &&
    c.idle.enabled === p.idle.enabled &&
    c.idle.minutes === p.idle.minutes &&
    c.idle.seconds === p.idle.seconds &&
    c.lowBattery.enabled === p.lowBattery.enabled &&
    c.lowBattery.percent === p.lowBattery.percent &&
    c.lowBattery.seconds === p.lowBattery.seconds &&
    c.lowPowerMode.enabled === p.lowPowerMode.enabled &&
    c.lowPowerMode.seconds === p.lowPowerMode.seconds
  );
}

/**
 * The mode that describes these values: the stored mode when the values still
 * match it, otherwise "custom" (someone edited a value by hand).
 */
export function reconcileMode(mode: Mode, c: FrequencyConfig): Mode {
  if (mode === 'custom') return 'custom';
  return matchesPreset(mode, c) ? mode : 'custom';
}

// ---------- Power state and the effective interval ----------

export interface PowerState {
  /** true = on mains power, false = on battery, undefined = unknown. */
  onAC?: boolean;
  /** Battery percentage, undefined when there is no battery or it's unknown. */
  percent?: number;
  /** macOS Low Power Mode / Windows Battery Saver / Linux power-saver profile. */
  lowPowerMode?: boolean;
  /** Seconds since the last keyboard / mouse input, when known. */
  idleSeconds?: number;
}

export type Reason = 'normal' | 'pluggedIn' | 'idle' | 'lowBattery' | 'lowPowerMode' | 'outsideHours';

export interface Effective {
  /** null = paused (outside active hours). */
  seconds: number | null;
  normalSeconds: number;
  reason: Reason;
  percent?: number;
  idleMinutes?: number;
  /** "HH:MM" when checks resume (reason = outsideHours). */
  resumeAt?: string;
}

function minutesOf(hhmm: string): number {
  const m = TIME.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** Inside [start, end)? Works across midnight (e.g. 22:00–06:00). start === end means all day. */
export function inActiveHours(h: FrequencyConfig['activeHours'], now: Date): boolean {
  if (!h.enabled) return true;
  const s = minutesOf(h.start);
  const e = minutesOf(h.end);
  if (s === e) return true;
  const n = now.getHours() * 60 + now.getMinutes();
  return s < e ? n >= s && n < e : n >= s || n < e;
}

/** Milliseconds until the active window opens again (0 when inside it). */
export function msUntilActive(h: FrequencyConfig['activeHours'], now: Date): number {
  if (inActiveHours(h, now)) return 0;
  const s = minutesOf(h.start);
  const n = now.getHours() * 60 + now.getMinutes();
  const mins = (s - n + 24 * 60) % (24 * 60) || 24 * 60;
  return mins * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds();
}

/**
 * The interval to use right now. Battery rules only ever slow checks down:
 * when several apply, the slowest wins, and a rule faster than the normal
 * interval is ignored.
 */
export function effectiveInterval(c: FrequencyConfig, normalSeconds: number, power: PowerState, now: Date): Effective {
  if (!inActiveHours(c.activeHours, now)) {
    return { seconds: null, normalSeconds, reason: 'outsideHours', resumeAt: c.activeHours.start };
  }
  if (c.pluggedInUsesNormal && power.onAC === true) {
    const anyRule = c.idle.enabled || c.lowBattery.enabled || c.lowPowerMode.enabled;
    return { seconds: normalSeconds, normalSeconds, reason: anyRule ? 'pluggedIn' : 'normal' };
  }
  const candidates: Array<{ seconds: number; reason: Reason }> = [];
  if (c.idle.enabled && power.idleSeconds !== undefined && power.idleSeconds >= c.idle.minutes * 60) {
    candidates.push({ seconds: c.idle.seconds, reason: 'idle' });
  }
  if (c.lowBattery.enabled && power.onAC === false && power.percent !== undefined && power.percent < c.lowBattery.percent) {
    candidates.push({ seconds: c.lowBattery.seconds, reason: 'lowBattery' });
  }
  if (c.lowPowerMode.enabled && power.lowPowerMode === true) {
    candidates.push({ seconds: c.lowPowerMode.seconds, reason: 'lowPowerMode' });
  }
  const slowest = candidates.sort((a, b) => b.seconds - a.seconds)[0];
  if (!slowest || slowest.seconds <= normalSeconds) return { seconds: normalSeconds, normalSeconds, reason: 'normal' };
  return {
    seconds: slowest.seconds,
    normalSeconds,
    reason: slowest.reason,
    percent: power.percent,
    idleMinutes: power.idleSeconds !== undefined ? Math.floor(power.idleSeconds / 60) : undefined,
  };
}

/** Does any rule need to know the power state / idle time? */
export function needsPowerState(c: FrequencyConfig): boolean {
  return c.idle.enabled || c.lowBattery.enabled || c.lowPowerMode.enabled;
}

// ---------- Network estimate ----------
//
// Measured with scripts/measure-fetch.mjs (bytes on the wire in both
// directions, TLS included) against github.com on 2026-10-22:
//   up-to-date `git fetch` (what every check runs)   5,457 B with 1 ref on the remote
//   ref advertisement grows with the remote's refs   ≈ 58 B per branch/tag (372 refs: 28 KB, 2,032 refs: 120 KB)
//   GitHub Actions "runs for this commit" API call    ≈ 7,300 B (gzip)
export const FETCH_BASE_BYTES = 5_400;
export const FETCH_BYTES_PER_REF = 58;
export const ACTIONS_CALL_BYTES = 7_300;

/** Bytes of one up-to-date check of a remote with `refs` branches + tags. */
export function fetchBytes(refs: number): number {
  return FETCH_BASE_BYTES + FETCH_BYTES_PER_REF * Math.max(1, refs);
}

export interface Estimate {
  checksPerHour: number;
  bytesPerHour: number;
}

/** Checks and traffic per hour for one interval over the given repos (ref counts). */
export function estimate(seconds: number, repoRefs: number[]): Estimate {
  const refs = repoRefs.length ? repoRefs : [1];
  const perRepo = 3600 / seconds;
  return {
    checksPerHour: Math.round(perRepo * refs.length),
    bytesPerHour: Math.round(refs.reduce((sum, r) => sum + perRepo * fetchBytes(r), 0)),
  };
}

export function estimateActions(seconds: number): Estimate {
  const n = 3600 / seconds;
  return { checksPerHour: Math.round(n), bytesPerHour: Math.round(n * ACTIONS_CALL_BYTES) };
}
