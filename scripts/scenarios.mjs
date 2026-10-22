// Screens captured by scripts/screenshots.mjs. Team view data is shaped like
// what src/ext/teamView.ts posts to the webview.
const now = Math.floor(Date.now() / 1000);
const W = { width: 1100, height: 760 };
const S = { width: 380, height: 760 };

const steps = ['welcome', 'language', 'theme', 'notify', 'test', 'done'];
const wizard = [];
for (const [theme, vscode] of [['light', 'light'], ['dark', 'dark']]) {
  steps.forEach((name, i) => {
    const sc = { name: `wizard-${i + 1}-${name}-${theme}`, kind: 'wizard', lang: 'th', theme, vscode, state: { step: i }, ...W };
    if (name === 'test') sc.script = `setTimeout(() => window.postMessage({ type: 'testResult', backend: 'alerter' }, '*'), 50);`;
    if (name === 'done') {
      sc.script = `setTimeout(() => window.postMessage({ type: 'finished', background: 'enabled' }, '*'), 50);`;
      sc.wait = 500;
    }
    if (name === 'notify') sc.background = true;
    wizard.push(sc);
  });
}
wizard.push({ name: 'wizard-1-welcome-en-system-dark', kind: 'wizard', lang: 'en', theme: 'system', vscode: 'dark', state: { step: 0 }, ...W });
wizard.push({ name: 'wizard-3-theme-en-system-light', kind: 'wizard', lang: 'en', theme: 'system', vscode: 'light', state: { step: 2 }, ...W });

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
  noUpstream: { repos: [repo({ state: 'noUpstream', upstream: null, branch: 'feature/cart', recent: [] })], selected: 0 },
  error: { repos: [repo({ state: 'error', error: { code: 'network', text: 'ตอนนี้ติดต่อ remote ไม่ได้ (เน็ตหลุดหรือเปล่า?) เดี๋ยว PushPal ลองใหม่ให้เอง' } })], selected: 0 },
};

const team = [];
for (const [theme, vscode] of [['light', 'light'], ['dark', 'dark']]) {
  for (const [name, view] of Object.entries(views)) {
    const sc = { name: `team-${name}-${theme}`, kind: 'team', lang: 'th', theme, vscode, view, ...S };
    if (name === 'success') Object.assign(sc, { wait: 900, budget: 1600 });
    if (name === 'pulling') sc.freezeAt = 900;
    team.push(sc);
  }
}
team.push({ name: 'team-behind-en-system-dark', kind: 'team', lang: 'en', theme: 'system', vscode: 'dark', view: views.behind, ...S });
team.push({ name: 'team-conflictMerge-en-system-light', kind: 'team', lang: 'en', theme: 'system', vscode: 'light', view: views.conflictMerge, ...S });

export const scenarios = [...wizard, ...team];
