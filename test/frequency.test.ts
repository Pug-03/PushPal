import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS,
  DEFAULT_CONFIG,
  presetConfig,
  clampConfig,
  matchesPreset,
  reconcileMode,
  effectiveInterval,
  inActiveHours,
  msUntilActive,
  estimate,
  estimateActions,
  fetchBytes,
  type FrequencyConfig,
} from '../src/core/frequency';
import { parsePmsetBatt, parsePmsetLowPower, parseIoregIdle, parseWindows, readLinuxPowerSupply, probePower } from '../src/core/power';
import { githubSlug } from '../src/core/ciRuns';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const at = (hh: number, mm = 0) => new Date(2026, 9, 22, hh, mm, 0, 0);
const noon = at(12);
const cfg = (over: Partial<FrequencyConfig> = {}): FrequencyConfig => ({ ...presetConfig('balanced'), ...over });

describe('modes', () => {
  test('presets have the advertised intervals', () => {
    assert.equal(PRESETS.fast.checkSeconds, 10);
    assert.equal(PRESETS.balanced.checkSeconds, 30);
    assert.equal(PRESETS.batterySaver.checkSeconds, 60);
    assert.deepEqual(DEFAULT_CONFIG, presetConfig('balanced'));
  });

  test('switching to a preset gives values that match it, and keeps the active hours', () => {
    const hours = { enabled: true, start: '09:00', end: '18:00' };
    for (const m of ['fast', 'balanced', 'batterySaver'] as const) {
      const c = presetConfig(m, hours);
      assert.equal(matchesPreset(m, c), true);
      assert.equal(reconcileMode(m, c), m);
      assert.deepEqual(c.activeHours, hours);
    }
    assert.equal(matchesPreset('fast', presetConfig('balanced')), false);
  });

  test('editing any value of a preset turns the mode into custom', () => {
    assert.equal(reconcileMode('fast', { ...presetConfig('fast'), checkSeconds: 12 }), 'custom');
    assert.equal(reconcileMode('balanced', { ...presetConfig('balanced'), idle: { enabled: false, minutes: 10, seconds: 60 } }), 'custom');
    assert.equal(reconcileMode('batterySaver', { ...presetConfig('batterySaver'), pluggedInUsesNormal: false }), 'custom');
    // Active hours are not part of a preset.
    assert.equal(reconcileMode('balanced', { ...presetConfig('balanced'), activeHours: { enabled: true, start: '07:00', end: '20:00' } }), 'balanced');
    assert.equal(reconcileMode('custom', presetConfig('fast')), 'custom', 'custom stays custom even when values happen to match');
  });

  test('preset copies are independent', () => {
    const a = presetConfig('fast');
    a.idle.minutes = 99;
    assert.equal(PRESETS.fast.idle.minutes, 10);
  });
});

describe('clamping custom values', () => {
  test('numbers outside the range are pulled in and reported', () => {
    const { config, adjustments } = clampConfig(cfg({ checkSeconds: 5, actionsSeconds: 500, backgroundSeconds: 30 }));
    assert.equal(config.checkSeconds, 10);
    assert.equal(config.actionsSeconds, 120);
    assert.equal(config.backgroundSeconds, 60);
    assert.deepEqual(
      adjustments.map((a) => [a.key, a.from, a.to, a.min, a.max]),
      [
        ['checkSeconds', 5, 10, 10, 300],
        ['actionsSeconds', 500, 120, 10, 120],
        ['backgroundSeconds', 30, 60, 60, 3600],
      ],
    );
  });

  test('nested values, decimals and garbage', () => {
    const c = cfg();
    c.lowBattery = { enabled: true, percent: 100, seconds: 59.6 };
    c.idle = { enabled: true, minutes: 0, seconds: Number.NaN };
    const { config, adjustments } = clampConfig(c);
    assert.equal(config.lowBattery.percent, 95);
    assert.equal(config.lowBattery.seconds, 60, 'rounded to whole seconds');
    assert.equal(config.idle.minutes, 1);
    assert.equal(config.idle.seconds, DEFAULT_CONFIG.idle.seconds, 'NaN falls back to the default');
    assert.equal(adjustments.length, 4);
  });

  test('values already in range are left alone', () => {
    const { config, adjustments } = clampConfig(cfg({ checkSeconds: 10 }));
    assert.equal(config.checkSeconds, 10);
    assert.deepEqual(adjustments, []);
  });

  test('malformed times fall back to the defaults', () => {
    const { config, adjustments } = clampConfig(cfg({ activeHours: { enabled: true, start: '25:00', end: '7pm' } }));
    assert.deepEqual(config.activeHours, { enabled: true, start: '08:00', end: '23:00' });
    assert.deepEqual(adjustments.map((a) => a.key), ['activeHours.start', 'activeHours.end']);
  });

  test('does not modify its input', () => {
    const c = cfg({ checkSeconds: 1 });
    clampConfig(c);
    assert.equal(c.checkSeconds, 1);
  });
});

describe('battery saving rules', () => {
  const c = cfg({
    checkSeconds: 30,
    idle: { enabled: true, minutes: 10, seconds: 60 },
    lowBattery: { enabled: true, percent: 20, seconds: 90 },
    lowPowerMode: { enabled: true, seconds: 120 },
    pluggedInUsesNormal: true,
  });

  test('normal when nothing applies', () => {
    const e = effectiveInterval(c, 30, { onAC: false, percent: 80, lowPowerMode: false, idleSeconds: 5 }, noon);
    assert.deepEqual([e.seconds, e.reason], [30, 'normal']);
  });

  test('idle for longer than the limit', () => {
    assert.equal(effectiveInterval(c, 30, { onAC: false, idleSeconds: 9 * 60 }, noon).reason, 'normal');
    const e = effectiveInterval(c, 30, { onAC: false, idleSeconds: 12 * 60 }, noon);
    assert.deepEqual([e.seconds, e.reason, e.idleMinutes], [60, 'idle', 12]);
  });

  test('low battery only when not plugged in, strictly below the threshold', () => {
    const e = effectiveInterval(c, 30, { onAC: false, percent: 15 }, noon);
    assert.deepEqual([e.seconds, e.reason, e.percent], [90, 'lowBattery', 15]);
    assert.equal(effectiveInterval(c, 30, { onAC: false, percent: 20 }, noon).reason, 'normal');
    assert.equal(effectiveInterval({ ...c, pluggedInUsesNormal: false }, 30, { onAC: true, percent: 10 }, noon).reason, 'normal', 'charging: not "not plugged in"');
    assert.equal(effectiveInterval(c, 30, { percent: 10 }, noon).reason, 'normal', 'unknown charger: rule does not guess');
  });

  test('low power mode', () => {
    const e = effectiveInterval(c, 30, { onAC: false, lowPowerMode: true }, noon);
    assert.deepEqual([e.seconds, e.reason], [120, 'lowPowerMode']);
  });

  test('plugged in → always the normal interval', () => {
    const e = effectiveInterval(c, 30, { onAC: true, lowPowerMode: true, idleSeconds: 3600 }, noon);
    assert.deepEqual([e.seconds, e.reason], [30, 'pluggedIn']);
    const off = effectiveInterval({ ...c, pluggedInUsesNormal: false }, 30, { onAC: true, lowPowerMode: true }, noon);
    assert.deepEqual([off.seconds, off.reason], [120, 'lowPowerMode']);
  });

  test('several rules: the slowest wins', () => {
    const e = effectiveInterval(c, 30, { onAC: false, percent: 5, lowPowerMode: true, idleSeconds: 3600 }, noon);
    assert.deepEqual([e.seconds, e.reason], [120, 'lowPowerMode']);
  });

  test('each rule can be turned off', () => {
    const off = cfg({ ...c, idle: { ...c.idle, enabled: false }, lowBattery: { ...c.lowBattery, enabled: false }, lowPowerMode: { ...c.lowPowerMode, enabled: false } });
    assert.equal(effectiveInterval(off, 30, { onAC: false, percent: 5, lowPowerMode: true, idleSeconds: 3600 }, noon).reason, 'normal');
  });

  test('a rule never makes checks faster than normal', () => {
    const e = effectiveInterval(c, 300, { onAC: false, percent: 5 }, noon);
    assert.deepEqual([e.seconds, e.reason], [300, 'normal']);
  });
});

describe('checking hours', () => {
  const day = { enabled: true, start: '08:00', end: '23:00' };
  const night = { enabled: true, start: '22:00', end: '06:00' };

  test('inside / outside a daytime window', () => {
    assert.equal(inActiveHours(day, at(8)), true);
    assert.equal(inActiveHours(day, at(22, 59)), true);
    assert.equal(inActiveHours(day, at(23)), false, 'end is exclusive');
    assert.equal(inActiveHours(day, at(7, 59)), false);
  });

  test('windows that cross midnight', () => {
    assert.equal(inActiveHours(night, at(23)), true);
    assert.equal(inActiveHours(night, at(3)), true);
    assert.equal(inActiveHours(night, at(12)), false);
  });

  test('disabled or start === end means always', () => {
    assert.equal(inActiveHours({ ...day, enabled: false }, at(3)), true);
    assert.equal(inActiveHours({ enabled: true, start: '09:00', end: '09:00' }, at(3)), true);
  });

  test('paused outside the window, with the time it resumes', () => {
    const e = effectiveInterval(cfg({ activeHours: day }), 30, { onAC: true }, at(2));
    assert.deepEqual([e.seconds, e.reason, e.resumeAt], [null, 'outsideHours', '08:00']);
    assert.equal(msUntilActive(day, at(7, 30)), 30 * 60_000);
    assert.equal(msUntilActive(day, at(23, 0)), 9 * 3600_000);
    assert.equal(msUntilActive(day, at(12)), 0);
  });
});

describe('network estimate', () => {
  test('uses the measured fetch size', () => {
    assert.equal(fetchBytes(1), 5_458, 'matches the 5,457 B measured for a 1-ref repo');
    assert.equal(fetchBytes(372), 26_976, 'close to the 28,030 B measured for 372 refs');
  });

  test('30 s → 120 checks/hour per repo', () => {
    const e = estimate(30, [1]);
    assert.equal(e.checksPerHour, 120);
    assert.equal(e.bytesPerHour, 120 * 5_458);
    assert.equal(estimate(30, [1, 1]).checksPerHour, 240);
    assert.equal(estimate(30, []).checksPerHour, 120, 'no repo open: estimate one');
  });

  test('actions polling', () => {
    assert.deepEqual(estimateActions(20), { checksPerHour: 180, bytesPerHour: 180 * 7_300 });
  });
});

describe('power state parsing', () => {
  test('macOS pmset / ioreg', () => {
    assert.deepEqual(parsePmsetBatt("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t15%; discharging; 1:02 remaining present: true"), { onAC: false, percent: 15 });
    assert.deepEqual(parsePmsetBatt("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t94%; charging;"), { onAC: true, percent: 94 });
    assert.deepEqual(parsePmsetBatt("Now drawing from 'AC Power'\n"), { onAC: true }, 'desktop Mac: no battery');
    assert.equal(parsePmsetLowPower('System-wide power settings:\n lowpowermode         1\n'), true);
    assert.equal(parsePmsetLowPower(' lowpowermode         0\n'), false);
    assert.equal(parsePmsetLowPower('nothing'), undefined);
    assert.equal(parseIoregIdle('    | |   "HIDIdleTime" = 987769250\n'), 0);
    assert.equal(parseIoregIdle('"HIDIdleTime" = 720000000000'), 720);
  });

  test('Windows PowerShell output', () => {
    assert.deepEqual(parseWindows('pct=15\r\nsupply=NotPresent\r\nbattery=Discharging\r\nsaver=On\r\nidleMs=650000\r\n'), { onAC: false, percent: 15, lowPowerMode: true, idleSeconds: 650 });
    assert.deepEqual(parseWindows('pct=80\nsupply=Adequate\nbattery=Charging\nsaver=Off\nidleMs=1000\n'), { onAC: true, percent: 80, lowPowerMode: false, idleSeconds: 1 });
    assert.deepEqual(parseWindows('pct=100\nsupply=Adequate\nbattery=NotPresent\nsaver=Disabled\n'), { onAC: true, lowPowerMode: false }, 'desktop PC');
  });

  test('Linux /sys/class/power_supply', () => {
    const base = mkdtempSync(join(tmpdir(), 'pushpal-ps-'));
    const dev = (name: string, files: Record<string, string>) => {
      mkdirSync(join(base, name));
      for (const [f, v] of Object.entries(files)) writeFileSync(join(base, name, f), v + '\n');
    };
    dev('AC', { type: 'Mains', online: '0' });
    dev('BAT0', { type: 'Battery', capacity: '12', status: 'Discharging' });
    dev('hid-mouse', { type: 'Battery', scope: 'Device', capacity: '3', status: 'Discharging' });
    assert.deepEqual(readLinuxPowerSupply(base), { onAC: false, percent: 12 });
    assert.deepEqual(readLinuxPowerSupply(join(base, 'missing')), {});
  });

  test('probePower asks each OS the right commands', async () => {
    const calls: string[] = [];
    const out: Record<string, string> = {
      'pmset -g batt': "Now drawing from 'Battery Power'\n\t40%; discharging",
      'pmset -g': ' lowpowermode 1',
      'ioreg -c IOHIDSystem -d 4': '"HIDIdleTime" = 30000000000',
    };
    const mac = await probePower('darwin', async (f, a) => (calls.push([f, ...a].join(' ')), out[[f, ...a].join(' ')] ?? null));
    assert.deepEqual(mac, { onAC: false, percent: 40, lowPowerMode: true, idleSeconds: 30 });
    const win = await probePower('win32', async (f) => (f === 'powershell.exe' ? 'pct=50\nsupply=NotPresent\nbattery=Discharging\nsaver=Off\nidleMs=0' : null));
    assert.deepEqual(win, { onAC: false, percent: 50, lowPowerMode: false, idleSeconds: 0 });
    const failing = await probePower('win32', async () => null);
    assert.deepEqual(failing, {}, 'a failed probe means "unknown", so no rule applies');
  });
});

describe('GitHub Actions', () => {
  test('repo slug from remote URLs', () => {
    assert.equal(githubSlug('https://github.com/Pug-03/PushPal.git'), 'Pug-03/PushPal');
    assert.equal(githubSlug('https://user@github.com/a/b'), 'a/b');
    assert.equal(githubSlug('git@github.com:a/b.git'), 'a/b');
    assert.equal(githubSlug('ssh://git@github.com/a/b.git'), 'a/b');
    assert.equal(githubSlug('https://gitlab.com/a/b.git'), null);
    assert.equal(githubSlug('/tmp/remote.git'), null);
  });
});
