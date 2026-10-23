// Screens captured by scripts/screenshots.mjs. Team view data is shaped like
// what src/ext/teamView.ts posts to the webview.
const now = Math.floor(Date.now() / 1000);
const W = { width: 1100, height: 760 };
const S = { width: 380, height: 760 };

// Shaped like frequencyModel() in src/ext/settingsPage.ts; numbers use the
// measured constants from src/core/frequency.ts (5,400 B + 58 B/ref per fetch).
const fetchBytes = (refs) => 5400 + 58 * refs;
const est = (sec, refs = [4, 12]) => ({ checksPerHour: Math.round((3600 / sec) * refs.length), bytesPerHour: Math.round(refs.reduce((a, r) => a + (3600 / sec) * fetchBytes(r), 0)) });
const rules = (idleMin, idleS, pct, lowS, lpmS) => ({
  idle: { enabled: true, minutes: idleMin, seconds: idleS },
  lowBattery: { enabled: true, percent: pct, seconds: lowS },
  lowPowerMode: { enabled: true, seconds: lpmS },
  pluggedInUsesNormal: true,
});
const presets = {
  fast: { checkSeconds: 10, actionsSeconds: 10, backgroundSeconds: 60, ...rules(10, 60, 20, 60, 60) },
  balanced: { checkSeconds: 30, actionsSeconds: 20, backgroundSeconds: 120, ...rules(10, 60, 20, 60, 60) },
  batterySaver: { checkSeconds: 60, actionsSeconds: 30, backgroundSeconds: 300, ...rules(5, 180, 30, 180, 300) },
};
const freqModel = (mode, config, over = {}) => ({
  mode,
  config,
  limits: { checkSeconds: [10, 300], actionsSeconds: [10, 120], backgroundSeconds: [60, 3600], 'idle.minutes': [1, 240], 'idle.seconds': [10, 3600], 'lowBattery.percent': [5, 95], 'lowBattery.seconds': [10, 3600], 'lowPowerMode.seconds': [10, 3600] },
  presets: Object.fromEntries(Object.entries(presets).map(([k, v]) => [k, { ...v, estimate: est(v.checkSeconds) }])),
  repoCount: 2,
  estimates: { check: est(config.checkSeconds), background: est(config.backgroundSeconds), actions: { checksPerHour: Math.round(3600 / config.actionsSeconds), bytesPerHour: Math.round((3600 / config.actionsSeconds) * 7300) } },
  effective: { seconds: config.checkSeconds, normalSeconds: config.checkSeconds, reason: 'normal' },
  nowText: 'เช็กทุก 30 วิ',
  signedIn: false,
  ghFound: false,
  snoozeUntil: 0,
  ...over,
});
const hours = { enabled: false, start: '08:00', end: '23:00' };
const balancedModel = freqModel('balanced', { ...presets.balanced, activeHours: hours });
const customModel = freqModel('custom', { ...presets.balanced, checkSeconds: 45, backgroundSeconds: 300, activeHours: { enabled: true, start: '08:00', end: '22:00' } }, {
  effective: { seconds: 60, normalSeconds: 45, reason: 'lowBattery', percent: 15 },
  nowText: 'ตอนนี้เช็กทุก 1 นาที เพราะแบตเหลือ 15%',
  signedIn: true,
});
const settingsOn = { language: 'th', theme: 'light', notifyInVSCode: true, notifyDesktop: true, notifyBackground: true, sameFileWarning: true, actionsEnabled: true, avatarsEnabled: true, checksOnPass: true, checksFor: 'all', quietEnabled: true, quietStart: '22:00', quietEnd: '08:00' };

const steps = ['welcome', 'language', 'theme', 'notify', 'frequency', 'github', 'test', 'done'];
const wizard = [];
for (const [theme, vscode] of [['light', 'light'], ['dark', 'dark']]) {
  steps.forEach((name, i) => {
    const sc = { name: `wizard-${i + 1}-${name}-${theme}`, kind: 'wizard', lang: 'th', theme, vscode, state: { step: i }, freq: balancedModel, ...W };
    if (name === 'test') sc.script = `setTimeout(() => window.postMessage({ type: 'testResult', backend: 'alerter' }, '*'), 50);`;
    if (name === 'done') {
      sc.script = `setTimeout(() => window.postMessage({ type: 'finished', background: 'enabled' }, '*'), 50);`;
      sc.wait = 2600;
    }
    if (name === 'notify') sc.background = true;
    wizard.push(sc);
  });
}
wizard.push({ name: 'wizard-1-welcome-en-system-dark', kind: 'wizard', lang: 'en', theme: 'system', vscode: 'dark', state: { step: 0 }, freq: balancedModel, ...W });
wizard.push({ name: 'wizard-3-theme-en-system-light', kind: 'wizard', lang: 'en', theme: 'system', vscode: 'light', state: { step: 2 }, freq: balancedModel, ...W });
wizard.push({ name: 'wizard-5-frequency-en-system-dark', kind: 'wizard', lang: 'en', theme: 'system', vscode: 'dark', state: { step: 4 }, freq: balancedModel, ...W });

// Settings page: the extension posts { type: 'state' } after the page says "ready".
const settingsPage = [];
const postState = (settings, freq, extra = {}, only = []) =>
  `setTimeout(() => window.postMessage(${JSON.stringify({ type: 'state', settings, freq, ...extra })}, '*'), 30);` +
  (only.length ? `setTimeout(() => document.querySelectorAll('.st-sec').forEach((e) => { if (!${JSON.stringify(only)}.includes(e.dataset.sec)) e.remove(); }), 80);` : '');
for (const [theme, vscode] of [['light', 'light'], ['dark', 'dark']]) {
  const st = { ...settingsOn, theme };
  settingsPage.push({ name: `settings-notify-${theme}`, kind: 'settings', lang: 'th', theme, vscode, script: postState(st, balancedModel, {}, ['notify']), width: 1100, height: 760 });
  settingsPage.push({ name: `settings-frequency-${theme}`, kind: 'settings', lang: 'th', theme, vscode, script: postState(st, customModel, {}, ['frequency']), width: 1100, height: 1640 });
  settingsPage.push({ name: `settings-github-${theme}`, kind: 'settings', lang: 'th', theme, vscode, script: postState(st, customModel, {}, ['look', 'github']), width: 1100, height: 1080 });
}
settingsPage.push({
  name: 'settings-clamped-en-system-light', kind: 'settings', lang: 'en', theme: 'system', vscode: 'light', width: 1100, height: 1640,
  script: postState({ ...settingsOn, language: 'en', theme: 'system' }, { ...customModel, nowText: 'Checking every 1 min right now because the battery is at 15%' }, { notice: 'Check interval (s): 5 is outside 10–300, so PushPal uses 10.', adjusted: ['checkSeconds'] }, ['frequency']),
});

const people = {
  alice: { author: 'Alice Lee', email: 'alice@example.com' },
  nok: { author: 'นก ศรีสุข', email: 'nok@example.com' },
  ben: { author: 'Ben Carter', email: 'ben@example.com' },
  me: { author: 'Pug-03', email: 'me@example.com' },
};
const c = (who, sha, mins, subject, isNew = false) => ({ ...people[who], sha, time: now - mins * 60, subject, isNew });

const recent = [
  c('alice', 'a91f3c2d', 4, 'แก้ปุ่ม login ให้กดได้บนมือถือ', true),
  c('nok', 'b72e1a90', 11, 'เพิ่มหน้า "ตะกร้าสินค้า" + เทสต์', true),
  c('alice', 'c03d77e1', 26, 'Refactor API client', true),
  c('me', 'd44b2f10', 95, 'อัปเดต README วิธีรันโปรเจกต์'),
  c('ben', 'e5519a3b', 180, 'Fix typo in checkout copy'),
  c('nok', 'f6a01c77', 60 * 26, 'ตั้งค่า ESLint + Prettier'),
];

const repo = (over) => ({
  root: '/Users/me/code/shop-web',
  name: 'shop-web',
  branch: 'main',
  upstream: 'origin/main',
  state: 'upToDate',
  phase: 'idle',
  behind: 0,
  ahead: 0,
  incoming: [],
  recent: recent.map((r) => ({ ...r, isNew: false })),
  overlap: [],
  conflict: null,
  error: null,
  checkedAt: Date.now() - 40_000,
  lastResult: null,
  ...over,
});

// GitHub checks, shaped like ChecksWatcher.badge().
const item = (id, name, state, duration) => ({ id, name, state, duration, url: 'https://github.com/shop/web/actions/runs/1', canExplain: state === 'failure' });
const checksOk = { state: 'success', passed: 4, total: 4, items: [item('a', 'Lint', 'success', 21), item('b', 'Test (ubuntu-latest)', 'success', 48), item('c', 'Test (windows-latest)', 'success', 96), item('d', 'Test (macos-latest)', 'success', 37)] };
const checksFail = { state: 'failure', passed: 3, total: 4, items: [item('b', 'Test (ubuntu-latest)', 'failure', 52), item('a', 'Lint', 'success', 19), item('c', 'Test (windows-latest)', 'success', 101), item('d', 'Test (macos-latest)', 'success', 41), item('e', 'Deploy preview', 'skipped')] };
const checksRun = { state: 'pending', passed: 1, total: 4, items: [item('b', 'Test (ubuntu-latest)', 'pending'), item('c', 'Test (windows-latest)', 'pending'), item('d', 'Test (macos-latest)', 'pending'), item('a', 'Lint', 'success', 18)] };
const withChecks = (list) => list.map((c, i) => ({ ...c, checks: [checksRun, checksFail, checksOk, checksOk, checksOk, checksOk][i] }));
const failDetail = { step: 'Run npm test', kind: 'tests', url: 'https://github.com/shop/web/actions/runs/1', log: [
  '> shop-web@1.4.0 test', '> node --test', '', '✔ cart › adds items (3.2ms)', '✔ cart › removes items (1.1ms)', '✖ login › accepts a valid password (8.4ms)',
  '  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:', '  + actual - expected', '  + 401', '  - 200', '      at TestContext.<anonymous> (test/login.test.js:22:12)',
  '', 'ℹ tests 38', 'ℹ pass 37', 'ℹ fail 1', '##[error]Process completed with exit code 1.'] };

const behindRepo = repo({ state: 'behind', behind: 3, recent, incoming: recent.filter((r) => r.isNew), overlap: ['src/pages/Login.tsx'] });

const views = {
  upToDate: { repos: [repo({})], selected: 0 },
  behind: { repos: [behindRepo, repo({ root: '/Users/me/code/shop-api', name: 'shop-api' })], selected: 0 },
  pulling: { repos: [{ ...behindRepo, phase: 'pulling' }], selected: 0 },
  success: { repos: [repo({ lastResult: { kind: 'ok', pulled: 3, at: Date.now() + 3_600_000 } })], selected: 0 },
  conflictMerge: {
    repos: [repo({ state: 'conflict', conflict: { kind: 'merge', files: ['src/pages/Login.tsx', 'src/api/client.ts'] } })],
    selected: 0,
  },
  conflictAutostash: {
    repos: [repo({ state: 'conflict', conflict: { kind: 'autostash', files: ['src/pages/Login.tsx'] } })],
    selected: 0,
  },
  mergeReady: { repos: [repo({ state: 'conflict', conflict: { kind: 'merge', files: [] } })], selected: 0 },
  noRepo: { repos: [], selected: 0 },
  checks: { repos: [repo({ recent: withChecks(recent.map((r) => ({ ...r, isNew: false }))) })], selected: 0 },
  undo: { repos: [repo({ undoLeft: 512, recent: withChecks(recent.map((r) => ({ ...r, isNew: false }))) })], selected: 0 },
  noUpstream: { repos: [repo({ state: 'noUpstream', upstream: null, branch: 'feature/cart', recent: [] })], selected: 0 },
  error: { repos: [repo({ state: 'error', error: { code: 'network', text: 'ตอนนี้ติดต่อ remote ไม่ได้ (เน็ตหลุดหรือเปล่า?) เดี๋ยว PushPal ลองใหม่ให้เอง' } })], selected: 0 },
};

const team = [];
for (const [theme, vscode] of [['light', 'light'], ['dark', 'dark']]) {
  for (const [name, view] of Object.entries(views)) {
    const sc = { name: `team-${name}-${theme}`, kind: 'team', lang: 'th', theme, vscode, view, ...S };
    if (name === 'success') Object.assign(sc, { wait: 2200, budget: 3400 });
    if (name === 'pulling') sc.freezeAt = 900;
    if (name === 'checks') {
      sc.height = 1100;
      sc.script = `setTimeout(() => { window.postMessage({ type: 'expandChecks', sha: 'b72e1a90' }, '*'); document.querySelector('[data-act="why"]').click(); }, 400);` +
        `setTimeout(() => window.postMessage({ type: 'checkDetail', sha: 'b72e1a90', id: 'b', detail: ${JSON.stringify(failDetail)} }, '*'), 700);`;
    }
    team.push(sc);
  }
}
team.push({ name: 'team-behind-en-system-dark', kind: 'team', lang: 'en', theme: 'system', vscode: 'dark', view: views.behind, ...S });
team.push({ name: 'team-conflictMerge-en-system-light', kind: 'team', lang: 'en', theme: 'system', vscode: 'light', view: views.conflictMerge, ...S });

// English copies of the screens the README shows (docs/screenshots/en/), sample data in English too.
const EN = {
  'แก้ปุ่ม login ให้กดได้บนมือถือ': 'Fix the login button on mobile',
  'เพิ่มหน้า "ตะกร้าสินค้า" + เทสต์': 'Add the shopping cart page + tests',
  'อัปเดต README วิธีรันโปรเจกต์': 'Update README: how to run the project',
  'ตั้งค่า ESLint + Prettier': 'Set up ESLint + Prettier',
  'นก ศรีสุข': 'Nok Srisuk',
  'ตอนนี้เช็กทุก 1 นาที เพราะแบตเหลือ 15%': 'Checking every 1 min right now because the battery is at 15%',
  'เช็กทุก 30 วิ': 'Checking every 30 s',
  'ตอนนี้ติดต่อ remote ไม่ได้ (เน็ตหลุดหรือเปล่า?) เดี๋ยว PushPal ลองใหม่ให้เอง': "Can't reach the remote right now. Check your internet connection; PushPal will retry by itself.",
};
const english = (sc) => {
  let json = JSON.stringify(sc);
  for (const [th, en] of Object.entries(EN)) json = json.split(JSON.stringify(th).slice(1, -1)).join(JSON.stringify(en).slice(1, -1));
  const out = JSON.parse(json);
  out.lang = 'en';
  if (out.view) out.view = JSON.parse(JSON.stringify(out.view));
  return out;
};
const README_SHOTS = ['team-upToDate', 'team-behind', 'team-pulling', 'team-success', 'team-undo', 'team-conflictMerge', 'team-conflictAutostash', 'team-mergeReady', 'team-checks', 'team-error', 'team-noUpstream', 'team-noRepo', 'wizard-1-welcome', 'wizard-5-frequency', 'wizard-6-github', 'settings-frequency', 'settings-notify'];
const readme = [...wizard, ...settingsPage, ...team]
  .filter((sc) => sc.lang === 'th' && README_SHOTS.some((n) => sc.name === `${n}-light` || sc.name === `${n}-dark`))
  .map((sc) => ({ ...english(sc), name: `en/${sc.name}` }))
  .map((sc) => {
    // README crops: just the part of My Team that matters for that situation.
    const crop = { upToDate: 470, behind: 860, pulling: 470, success: 470, undo: 640, conflictMerge: 1000, conflictAutostash: 980, mergeReady: 440, checks: 760, error: 500, noUpstream: 470, noRepo: 560 };
    const key = sc.name.replace(/^en\/team-/, '').replace(/-(light|dark)$/, '');
    if (sc.kind !== 'team' || !crop[key]) return sc;
    const out = { ...sc, height: crop[key] };
    if (key === 'checks') out.script = (sc.script || '') + `setTimeout(() => { document.getElementById('hero').style.display = 'none'; }, 50);`;
    return out;
  });

export const scenarios = [...wizard, ...settingsPage, ...team, ...readme];
