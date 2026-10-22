// Renders every PushPal screen in headless Chrome with a mocked webview API
// and VS Code's Dark Modern / Light Modern theme variables, then saves PNGs
// to docs/screenshots/. Usage: node scripts/screenshots.mjs [filter]
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findChrome } from './chrome.mjs';
import { scenarios } from './scenarios.mjs';

const media = resolve('media');
const outDir = resolve('docs/screenshots');
mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'pushpal-shots-'));
const filter = process.argv[2];

const en = JSON.parse(readFileSync('src/i18n/locales/en.json', 'utf8'));
const th = JSON.parse(readFileSync('src/i18n/locales/th.json', 'utf8'));
const wv = (cat) => Object.fromEntries(Object.entries(cat).filter(([k]) => k.startsWith('wv.')).map(([k, v]) => [k.slice(3), v]));
const strings = { en: wv(en), th: wv(th) };

const VSCODE_VARS = {
  dark: {
    'editor-background': '#1f1f1f', 'sideBar-background': '#181818', foreground: '#cccccc', descriptionForeground: '#9d9d9d',
    'button-background': '#0078d4', 'button-hoverBackground': '#026ec1', 'button-foreground': '#ffffff', focusBorder: '#0078d4',
    'widget-border': '#313131', 'input-background': '#313131', 'editorWidget-background': '#202020', 'widget-shadow': 'rgba(0,0,0,.36)',
    'font-family': '-apple-system, BlinkMacSystemFont, sans-serif',
  },
  light: {
    'editor-background': '#ffffff', 'sideBar-background': '#f8f8f8', foreground: '#3b3b3b', descriptionForeground: '#616161',
    'button-background': '#005fb8', 'button-hoverBackground': '#0258a8', 'button-foreground': '#ffffff', focusBorder: '#005fb8',
    'widget-border': '#e5e5e5', 'input-background': '#ffffff', 'editorWidget-background': '#f8f8f8', 'widget-shadow': 'rgba(0,0,0,.16)',
    'font-family': '-apple-system, BlinkMacSystemFont, sans-serif',
  },
};

function page(sc) {
  const vars = Object.entries(VSCODE_VARS[sc.vscode]).map(([k, v]) => `--vscode-${k}:${v}`).join(';');
  const kindFiles = sc.kind === 'wizard' ? { css: ['wizard.css'], js: ['wizard.js'] } : { css: ['team.css'], js: ['team.js'] };
  const init = sc.kind === 'wizard'
    ? { lang: sc.lang, theme: sc.theme, strings, platform: sc.platform ?? 'darwin', backend: sc.backend ?? 'alerter', bgSupported: true,
        notify: { notifyInVSCode: true, notifyDesktop: true, notifyBackground: sc.background ?? false } }
    : { lang: sc.lang, theme: sc.theme, strings: strings[sc.lang], view: sc.view };
  return `<!doctype html><html lang="${sc.lang}" class="theme-${sc.theme} surface-${sc.kind === 'wizard' ? 'panel' : 'sidebar'}" style="${vars}">
<head><meta charset="utf-8">
${['base.css', ...kindFiles.css].map((f) => `<link rel="stylesheet" href="file://${join(media, f)}">`).join('')}
<script>
window.__posted = [];
window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__posted.push(m), getState: () => (${JSON.stringify(sc.state ?? null)}), setState: () => {} });
</script></head>
${sc.kind === 'team' ? `<style>html,body{width:${sc.width}px;overflow-x:hidden}</style>` : ''}
<body class="vscode-${sc.vscode}">
<div id="app"></div>
<script type="application/json" id="pp-init">${JSON.stringify(init).replace(/</g, '\\u003c')}</script>
${['mascot.js', 'icons.js', ...kindFiles.js].map((f) => `<script src="file://${join(media, f)}"></script>`).join('')}
<script>
${sc.script ?? ''}
setTimeout(() => {
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    if (t && t.iterations === Infinity) { a.pause(); a.currentTime = ${sc.freezeAt ?? 350}; }
    else { try { a.finish(); } catch (e) {} }
  }
  ${sc.after ?? ''}
}, ${sc.wait ?? 1200});
</script>
</body></html>`;
}

let count = 0;
for (const sc of scenarios) {
  if (filter && !sc.name.includes(filter)) continue;
  const html = join(tmp, `${sc.name}.html`);
  writeFileSync(html, page(sc));
  const out = join(outDir, `${sc.name}.png`);
  execFileSync(findChrome(), [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=2',
    `--window-size=${sc.width},${sc.height}`, `--virtual-time-budget=${sc.budget ?? 4000}`, `--screenshot=${out}`, `file://${html}`,
  ], { stdio: 'ignore' });
  count++;
}
console.log(`${count} screenshot(s) in docs/screenshots/`);
