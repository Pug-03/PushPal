// Draws the step-by-step install illustrations used in README.md (GitHub,
// VS Code, macOS and Windows screens with numbered call-outs) in headless
// Chrome, light and dark, and saves PNGs to docs/guide/.
// Usage: node scripts/guide-illustrations.mjs [filter]
import { mkdirSync, writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findChrome } from './chrome.mjs';

const outDir = resolve('docs/guide');
mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'pushpug-guide-'));
const filter = process.argv[2];
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const vsix = `pushpug-${version}.vsix`;
const palIcon = readFileSync('media/activity.svg', 'utf8');
const mascot = (name) => `file://${resolve(`docs/mascot/still/${name}.png`)}`;

const PALETTE = {
  light: {
    bg: '#ffffff', surface: '#f8f8f8', surface2: '#f0f0f0', border: '#e1e1e1', text: '#2b2b2b', muted: '#6b6b6b',
    accent: '#005fb8', accentText: '#ffffff', select: '#e4effa', input: '#ffffff', shadow: '0 12px 40px rgba(0,0,0,.18)',
    gh: { bg: '#ffffff', subtle: '#f6f8fa', border: '#d1d9e0', text: '#1f2328', muted: '#59636e', link: '#0969da', green: '#1f883d', label: '#dafbe1', labelText: '#1a7f37' },
    vsc: { activity: '#f8f8f8', side: '#f8f8f8', editor: '#ffffff', status: '#f8f8f8', statusText: '#3b3b3b', icon: '#616161', iconActive: '#1f1f1f', menu: '#ffffff', menuHover: '#0060c0' },
    mac: { window: '#ececec', side: '#e6e6e6', pane: '#ffffff', group: '#f5f5f5', toggle: '#34c759', select: '#0a64d9' },
    win: { bg: '#f3f3f3', card: '#fbfbfb', toggle: '#005fb8' },
  },
  dark: {
    bg: '#1f1f1f', surface: '#252526', surface2: '#2d2d2d', border: '#3c3c3c', text: '#e3e3e3', muted: '#a0a0a0',
    accent: '#0078d4', accentText: '#ffffff', select: '#04395e', input: '#313131', shadow: '0 12px 40px rgba(0,0,0,.55)',
    gh: { bg: '#0d1117', subtle: '#151b23', border: '#3d444d', text: '#e6edf3', muted: '#9198a1', link: '#4493f8', green: '#238636', label: '#1b3a26', labelText: '#3fb950' },
    vsc: { activity: '#181818', side: '#181818', editor: '#1f1f1f', status: '#181818', statusText: '#cccccc', icon: '#868686', iconActive: '#d7d7d7', menu: '#1f1f1f', menuHover: '#0078d4' },
    mac: { window: '#2b2b2b', side: '#323232', pane: '#1e1e1e', group: '#2a2a2a', toggle: '#30d158', select: '#0a64d9' },
    win: { bg: '#202020', card: '#2b2b2b', toggle: '#4cc2ff' },
  },
};

// Hand-drawn stand-ins for VS Code's codicons, kept simple on purpose.
const ICON = {
  files: '<path d="M14 3H7a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8z M14 3v5h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14.5 14.5 20 20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  git: '<circle cx="7" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="17" cy="9" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 8v8M17 11c0 4-6 3-9.5 5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  run: '<path d="M8 5v14l11-7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  ext: '<rect x="4" y="11" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="12" y="11" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="3" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14.5" y="2.5" width="7" height="7" transform="rotate(12 18 6)" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  filter: '<path d="M4 5h16l-6 7v6l-4 2v-8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  refresh: '<path d="M19 12a7 7 0 1 1-2-5M19 4v4h-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  gear: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  account: '<circle cx="12" cy="9" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 20c1-4 4-5.5 7-5.5s6 1.5 7 5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  check: '<path d="M5 12.5 10 17 19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  info: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" fill="currentColor"/>',
  box: '<path d="M12 3 20 7v10l-8 4-8-4V7z M4 7l8 4 8-4 M12 11v10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="7.5" cy="8.5" r="1.5" fill="currentColor"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  caret: '<path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  chevron: '<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8L3.5 9.7l5.9-.9z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  win: '<rect x="3" y="3" width="8" height="8" fill="currentColor"/><rect x="13" y="3" width="8" height="8" fill="currentColor"/><rect x="3" y="13" width="8" height="8" fill="currentColor"/><rect x="13" y="13" width="8" height="8" fill="currentColor"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  terminal: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 10l3 2-3 2M12 15h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
};
const icon = (name, size = 20, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" ${extra}>${ICON[name]}</svg>`;
const pal = (size = 24) => palIcon.replace('width="24" height="24"', `width="${size}" height="${size}"`).replace('fill="#C5C5C5"', 'fill="currentColor"');

// A numbered call-out: wraps content in a ring and pins a numbered badge to it.
const mark = (n, inner, { pos = 'tr', block = false, round = 6 } = {}) =>
  `<span class="mark ${block ? 'block' : ''}" style="--r:${round}px">${inner}<i class="badge ${pos}">${n}</i></span>`;

const BASE_CSS = (p) => `
*{box-sizing:border-box}
html,body{margin:0;background:transparent}
body{font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:${p.text};padding:28px;-webkit-font-smoothing:antialiased}
svg{display:block;flex:none}
.frame{border-radius:12px;overflow:hidden;box-shadow:${p.shadow};border:1px solid ${p.border}}
.mark{position:relative;display:inline-flex;border-radius:var(--r);outline:3px solid #ff5a36;outline-offset:3px;box-shadow:0 0 0 9px rgba(255,90,54,.18)}
.mark.block{display:flex}
.badge{position:absolute;z-index:5;width:26px;height:26px;border-radius:50%;background:#ff5a36;color:#fff;font:700 14px/26px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;font-style:normal;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff}
.badge.tr{top:-20px;right:-20px}.badge.tl{top:-20px;left:-20px}.badge.br{bottom:-20px;right:-20px}.badge.bl{bottom:-20px;left:-20px}
.badge.r{top:50%;right:-42px;margin-top:-13px}.badge.l{top:50%;left:-42px;margin-top:-13px}
.row{display:flex;align-items:center}
.muted{color:${p.muted}}
`;

// --- VS Code pieces -------------------------------------------------------------

function vscWindow(p, { activity, side, editor = '', status = '', title = 'my-project — Visual Studio Code', height = 420, sideWidth = 290, overlay = '' }) {
  const v = p.vsc;
  return `<div class="frame" style="width:860px;height:${height}px;display:flex;flex-direction:column;background:${v.editor};position:relative">
  <div class="row" style="height:34px;background:${v.side};border-bottom:1px solid ${p.border};padding:0 12px;gap:8px">
    <span style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></span><span style="width:12px;height:12px;border-radius:50%;background:#febc2e"></span><span style="width:12px;height:12px;border-radius:50%;background:#28c840"></span>
    <span class="muted" style="flex:1;text-align:center;font-size:12px">${title}</span>
  </div>
  <div style="flex:1;display:flex;min-height:0">
    <div style="width:48px;background:${v.activity};border-right:1px solid ${p.border};display:flex;flex-direction:column;align-items:center;padding-top:6px;gap:4px;color:${v.icon}">
      ${activity}
      <div style="flex:1"></div>
      <div style="padding:10px">${icon('account', 24)}</div><div style="padding:10px 10px 12px">${icon('gear', 24)}</div>
    </div>
    <div style="width:${sideWidth}px;background:${v.side};border-right:1px solid ${p.border};display:flex;flex-direction:column;position:relative">${side}</div>
    <div style="flex:1;position:relative;background:${v.editor}">${editor}</div>
  </div>
  <div class="row" style="height:24px;background:${v.status};border-top:1px solid ${p.border};color:${v.statusText};font-size:12px;padding:0 10px;gap:14px">${status}</div>
  ${overlay}
</div>`;
}

function activityBar(p, active, { ext = null, pal: palMark = null, showPal = false } = {}) {
  const v = p.vsc;
  const item = (name, content) => {
    const on = name === active;
    return `<div style="position:relative;padding:10px;color:${on ? v.iconActive : v.icon}">${on ? `<span style="position:absolute;left:-1px;top:6px;bottom:6px;width:2px;background:${p.accent}"></span>` : ''}${content}</div>`;
  };
  const extItem = item('ext', icon('ext', 24));
  const palItem = item('pal', pal(26));
  return [
    item('files', icon('files', 24)), item('search', icon('search', 24)), item('git', icon('git', 24)), item('run', icon('run', 24)),
    ext ? mark(ext, extItem, { pos: 'r' }) : extItem,
    showPal ? (palMark ? mark(palMark, palItem, { pos: 'r' }) : palItem) : '',
  ].join('');
}

function sideHeader(p, title, actions = '') {
  return `<div class="row" style="height:36px;padding:0 8px 0 18px;font-size:11px;font-weight:600;letter-spacing:.04em;color:${p.muted}"><span style="flex:1">${title}</span>${actions}</div>`;
}
const toolBtn = (p, name) => `<span style="padding:4px;border-radius:5px;color:${p.vsc.iconActive}">${icon(name, 16)}</span>`;

function extensionCard(p, { name, desc, publisher, badge = '', button = '', iconHtml }) {
  return `<div class="row" style="gap:10px;padding:8px 14px;align-items:flex-start">
    <div style="width:42px;height:42px;border-radius:8px;display:grid;place-items:center;flex:none;background:${p.surface2}">${iconHtml}</div>
    <div style="flex:1;min-width:0">
      <div class="row" style="gap:6px"><b style="font-size:13px">${name}</b>${badge}</div>
      <div class="muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${desc}</div>
      <div class="row" style="gap:6px;margin-top:4px"><span class="muted" style="font-size:12px;flex:1">${publisher}</span>${button}</div>
    </div>
  </div>`;
}
const vscButton = (p, label) => `<span style="background:${p.accent};color:${p.accentText};border-radius:3px;padding:2px 9px;font-size:12px">${label}</span>`;
const palTile = (p) => `<img src="${mascot('success')}" width="40" height="40" style="border-radius:8px">`;
const searchBox = (p, value, placeholder = 'Search Extensions in Marketplace') =>
  `<div style="margin:0 12px 8px;padding:5px 8px;border:1px solid ${p.border};background:${p.input};border-radius:4px;font-size:12px;${value ? '' : `color:${p.muted}`}">${value || placeholder}</div>`;

function editorPlaceholder(p) {
  const lines = [70, 54, 82, 40, 0, 64, 58, 76, 30];
  return `<div style="padding:22px 26px;display:flex;flex-direction:column;gap:9px">${lines.map((w, i) =>
    `<div class="row" style="gap:16px"><span class="muted" style="width:14px;text-align:right;font:11px ui-monospace,Menlo,monospace;opacity:.6">${i + 1}</span><span style="height:8px;border-radius:4px;width:${w}%;background:${p.border}"></span></div>`).join('')}</div>`;
}

// --- Illustrations ----------------------------------------------------------------

const ILLUSTRATIONS = {
  // GitHub repository page: where the Releases link is.
  'gh-releases-link': { width: 920, height: 470, body: (p) => {
    const g = p.gh;
    return `<div class="frame" style="width:860px;background:${g.bg};color:${g.text};border-color:${g.border}">
      ${browserBar(p, 'github.com/Pug-03/PushPug')}
      <div style="padding:16px 24px;border-bottom:1px solid ${g.border}" class="row">
        <span style="font-size:18px"><span style="color:${g.link}">Pug-03</span> / <b style="color:${g.link}">PushPug</b></span>
        <span style="margin-left:10px;border:1px solid ${g.border};border-radius:12px;padding:0 8px;font-size:12px;color:${g.muted}">Public</span>
        <span style="flex:1"></span>
        ${ghPill(p, icon('eye', 16) + 'Watch')}${ghPill(p, icon('star', 16) + 'Star')}
      </div>
      <div style="display:flex;gap:24px;padding:20px 24px">
        <div style="flex:1;border:1px solid ${g.border};border-radius:6px;overflow:hidden">
          <div class="row" style="background:${g.subtle};padding:10px 14px;gap:8px;border-bottom:1px solid ${g.border}"><span style="width:20px;height:20px;border-radius:50%;background:${g.muted};opacity:.5"></span><b>Pug-03</b><span style="color:${g.muted}">docs: README download, install and update steps</span></div>
          ${['.github/workflows', 'docs', 'media', 'scripts', 'src', 'README.md', 'package.json'].map((f) =>
            `<div class="row" style="padding:7px 14px;gap:10px;border-bottom:1px solid ${g.border}"><span style="color:${f.includes('.') && !f.startsWith('.') ? g.muted : '#54aeff'}">${f.includes('.') && !f.startsWith('.') ? icon('files', 16) : icon('folder', 16)}</span>${f}</div>`).join('')}
        </div>
        <div style="width:260px">
          <b style="font-size:15px">About</b>
          <p style="color:${g.muted};margin:8px 0 16px">Know the moment a teammate pushes. Pull their code in with one click.</p>
          <div style="border-top:1px solid ${g.border};padding-top:16px">
            ${mark(1, `<div style="padding:6px 8px;width:236px"><div class="row" style="gap:6px"><b style="font-size:15px">Releases</b><span style="background:${g.subtle};border:1px solid ${g.border};border-radius:10px;padding:0 7px;font-size:12px">1</span></div>
              <div class="row" style="gap:8px;margin-top:10px"><span style="color:${g.labelText}">${icon('tag', 16)}</span><b>v${version}</b><span style="border:1px solid ${g.labelText};color:${g.labelText};border-radius:12px;padding:0 7px;font-size:12px">Latest</span></div></div>`, { block: true, pos: 'tl' })}
          </div>
        </div>
      </div>
    </div>`;
  } },

  // GitHub release page: the Assets list.
  'gh-assets': { width: 920, height: 440, body: (p) => {
    const g = p.gh;
    const asset = (name, size, kind) => `<div class="row" style="padding:9px 14px;gap:10px;border-top:1px solid ${g.border}"><span style="color:${g.muted}">${icon(kind, 16)}</span><span style="color:${g.link};font-weight:600;flex:1">${name}</span><span style="color:${g.muted};font-size:12px">${size}</span></div>`;
    return `<div class="frame" style="width:860px;background:${g.bg};color:${g.text};border-color:${g.border}">
      ${browserBar(p, `github.com/Pug-03/PushPug/releases/tag/v${version}`)}
      <div style="padding:20px 24px">
        <div style="border:1px solid ${g.border};border-radius:6px;padding:18px 20px">
          <div class="row" style="gap:10px"><b style="font-size:24px">PushPug ${version}</b><span style="border:1px solid ${g.labelText};color:${g.labelText};border-radius:12px;padding:1px 8px;font-size:12px">Latest</span></div>
          <p style="color:${g.muted};margin:8px 0 16px">Download <b style="color:${g.text}">${vsix}</b> below and install it in VS Code.</p>
          <div class="row" style="gap:6px;margin-bottom:8px"><span style="color:${g.muted}">${icon('caret', 16)}</span><b style="font-size:16px">Assets</b><span style="background:${g.subtle};border:1px solid ${g.border};border-radius:10px;padding:0 7px;font-size:12px">3</span></div>
          <div style="border:1px solid ${g.border};border-radius:6px">
            <div style="padding:6px">${mark(2, `<div class="row" style="padding:5px 8px;gap:10px;width:780px"><span style="color:${g.muted}">${icon('box', 16)}</span><span style="color:${g.link};font-weight:600;flex:1">${vsix}</span><span style="color:${g.muted};font-size:12px">210 KB</span></div>`, { block: true, pos: 'r' })}</div>
            ${asset('Source code (zip)', '', 'files')}${asset('Source code (tar.gz)', '', 'files')}
          </div>
        </div>
      </div>
    </div>`;
  } },

  // VS Code: Extensions view, the … menu, Install from VSIX…
  'vsc-install-vsix': { width: 920, height: 480, body: (p) => {
    const v = p.vsc;
    const menuItems = ['Check for Extension Updates', 'Auto Update Extensions', 'Enable All Extensions', 'Disable All Extensions', '—', 'Install from VSIX…', '—', 'Views', 'Developer'];
    const menu = `<div style="position:absolute;top:34px;left:208px;width:250px;background:${v.menu};border:1px solid ${p.border};border-radius:6px;box-shadow:${p.shadow};padding:4px;z-index:3">
      ${menuItems.map((m) => m === '—' ? `<div style="height:1px;background:${p.border};margin:4px 6px"></div>`
        : m.startsWith('Install') ? mark(5, `<div style="padding:4px 10px;width:240px;border-radius:4px;background:${v.menuHover};color:#fff">${m}</div>`, { block: true, pos: 'r', round: 4 })
          : `<div style="padding:4px 10px">${m}</div>`).join('')}
    </div>`;
    const side = `${sideHeader(p, 'EXTENSIONS', `${toolBtn(p, 'filter')}${toolBtn(p, 'refresh')}${mark(4, `<span style="padding:4px;border-radius:5px;background:${p.surface2};color:${v.iconActive}">${icon('dots', 16)}</span>`, { pos: 'tr', round: 5 })}`)}
      ${searchBox(p, '')}
      <div style="padding:4px 18px;font-size:11px;font-weight:600;color:${p.muted}">INSTALLED</div>
      ${extensionCard(p, { name: 'Python', desc: 'Python language support', publisher: 'Microsoft', iconHtml: `<span style="color:#3776ab">${icon('code', 24)}</span>` })}
      ${extensionCard(p, { name: 'Prettier', desc: 'Code formatter', publisher: 'Prettier', iconHtml: `<span style="color:#c596c7">${icon('code', 24)}</span>` })}
      ${menu}`;
    return vscWindow(p, { activity: activityBar(p, 'ext', { ext: 3 }), side, editor: editorPlaceholder(p), height: 440 });
  } },

  // VS Code: the same through the Command Palette.
  'vsc-palette-vsix': { width: 920, height: 330, body: (p) => {
    const v = p.vsc;
    const overlay = `<div style="position:absolute;top:44px;left:50%;margin-left:-280px;width:560px;background:${v.menu};border:1px solid ${p.border};border-radius:8px;box-shadow:${p.shadow};padding:6px">
      ${mark(1, `<div style="padding:5px 9px;width:536px;border:1px solid ${p.accent};border-radius:4px;background:${p.input}">&gt;Install from VSIX<span style="border-left:1.5px solid ${p.text};margin-left:1px"></span></div>`, { block: true, pos: 'l', round: 4 })}
      <div style="height:10px"></div>
      ${mark(2, `<div class="row" style="padding:5px 9px;width:536px;border-radius:4px;background:${v.menuHover};color:#fff"><span style="flex:1">Extensions: Install from VSIX…</span></div>`, { block: true, pos: 'l', round: 4 })}
      <div class="row" style="padding:5px 9px;margin-top:6px"><span style="flex:1">Developer: Install Extension from Location…</span></div>
    </div>`;
    return vscWindow(p, { activity: activityBar(p, 'files'), side: sideHeader(p, 'EXPLORER'), editor: editorPlaceholder(p), height: 290, sideWidth: 200, overlay });
  } },

  // macOS file dialog: pick the .vsix and press Install.
  'pick-vsix': { width: 920, height: 450, body: (p) => {
    const m = p.mac;
    const file = (name, sel, kind = 'files') => `<div class="row" style="gap:8px;padding:4px 10px;border-radius:5px;${sel ? `background:${m.select};color:#fff` : ''}"><span style="${sel ? '' : `color:${p.muted}`}">${icon(kind, 16)}</span>${name}</div>`;
    return `<div class="frame" style="width:860px;background:${m.pane}">
      <div class="row" style="height:44px;padding:0 14px;gap:8px;background:${m.window};border-bottom:1px solid ${p.border}">
        <span style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></span><span style="width:12px;height:12px;border-radius:50%;background:#febc2e"></span><span style="width:12px;height:12px;border-radius:50%;background:#28c840"></span>
        <b style="margin-left:16px">Downloads</b><span style="flex:1"></span>
        <span style="padding:3px 10px;border-radius:6px;background:${p.surface2};color:${p.muted};width:180px">${icon('search', 14, 'style="display:inline;vertical-align:-2px"')} Search</span>
      </div>
      <div style="display:flex;height:300px">
        <div style="width:190px;background:${m.side};padding:12px 8px;font-size:13px">
          <div class="muted" style="font-size:11px;font-weight:600;padding:4px 8px">Favorites</div>
          ${['Desktop', 'Documents'].map((x) => `<div class="row" style="gap:8px;padding:4px 8px"><span style="color:${m.select}">${icon('folder', 16)}</span>${x}</div>`).join('')}
          <div class="row" style="gap:8px;padding:4px 8px;border-radius:5px;background:${p.border}"><span style="color:${m.select}">${icon('download', 16)}</span><b>Downloads</b></div>
          <div class="row" style="gap:8px;padding:4px 8px"><span style="color:${m.select}">${icon('folder', 16)}</span>Applications</div>
        </div>
        <div style="flex:1;padding:12px">
          ${file('budget.xlsx', false)}${file('photo.jpg', false)}
          <div style="padding:6px 0">${mark(6, `<div style="width:620px">${file(vsix, true, 'box')}</div>`, { pos: 'tr' })}</div>
          ${file('notes.pdf', false)}
        </div>
      </div>
      <div class="row" style="padding:12px 18px;gap:10px;border-top:1px solid ${p.border};background:${m.window}">
        <span style="flex:1"></span>
        <span style="padding:4px 16px;border-radius:6px;background:${p.surface2};border:1px solid ${p.border}">Cancel</span>
        ${mark(7, `<span style="padding:4px 18px;border-radius:6px;background:${m.select};color:#fff;font-weight:600">Install</span>`, { pos: 'tr' })}
      </div>
    </div>`;
  } },

  // VS Code after installing: the toast and Pal in the Activity Bar.
  'vsc-installed': { width: 920, height: 530, body: (p) => {
    const v = p.vsc;
    const toast = `<div style="position:absolute;right:18px;bottom:40px">${mark(9, `<div class="row" style="gap:10px;width:400px;padding:12px 14px;background:${v.menu};border:1px solid ${p.border};border-radius:6px;box-shadow:${p.shadow}"><span style="color:${p.accent}">${icon('info', 18)}</span><span style="flex:1">Completed installing extension PushPug from VSIX.</span><span class="muted">${icon('close', 14)}</span></div>`, { pos: 'tl' })}</div>`;
    const side = `${sideHeader(p, 'EXTENSIONS')}${searchBox(p, '')}
      <div style="padding:4px 18px;font-size:11px;font-weight:600;color:${p.muted}">INSTALLED</div>
      ${extensionCard(p, { name: 'PushPug', desc: 'Know the moment a teammate pushes', publisher: 'pushpug', iconHtml: palTile(p) })}`;
    const editor = `<div style="padding:30px;display:flex;gap:18px;align-items:center"><img src="${mascot('welcome')}" width="96"><div><b style="font-size:20px">Hi! I'm Pal from PushPug</b><div class="muted" style="margin-top:6px">The setup wizard opens on its own.</div></div></div>`;
    return vscWindow(p, { activity: activityBar(p, 'ext', { showPal: true, pal: 8 }), side, editor, height: 490, overlay: toast });
  } },

  // VS Code Marketplace / Open VSX: search and Install.
  'vsc-marketplace': { width: 920, height: 420, body: (p) => {
    const side = `${sideHeader(p, 'EXTENSIONS')}
      <div style="padding:0 0 4px">${mark(2, `<div style="margin:0 12px;width:266px;padding:5px 8px;border:1px solid ${p.accent};background:${p.input};border-radius:4px;font-size:12px">PushPug</div>`, { pos: 'tr', round: 4 })}</div>
      <div style="height:10px"></div>
      ${extensionCard(p, { name: 'PushPug', desc: 'Know the moment a teammate pushes', publisher: 'pushpug', iconHtml: palTile(p), button: mark(3, vscButton(p, 'Install'), { pos: 'r', round: 3 }) })}`;
    return vscWindow(p, { activity: activityBar(p, 'ext', { ext: 1 }), side, editor: editorPlaceholder(p), height: 370, sideWidth: 330 });
  } },

  // VS Code with a project open: Pal in the Activity Bar and the status bar item.
  'vsc-first-run': { width: 920, height: 520, body: (p) => {
    const side = `${sideHeader(p, 'PUSHPUG: MY TEAM')}
      <div style="padding:20px;text-align:center"><img src="${mascot('sleep')}" width="110"><div style="font-size:15px;font-weight:600;margin-top:8px">You're up to date</div><div class="muted" style="margin-top:4px">I'll tell you when a teammate pushes.</div></div>`;
    const status = `<span class="row" style="gap:4px">${icon('git', 14)} main</span>${mark(2, `<span class="row" style="gap:4px;padding:0 4px">${icon('check', 14)} Up to date</span>`, { pos: 'tr', round: 3 })}`;
    return vscWindow(p, { activity: activityBar(p, 'pal', { showPal: true, pal: 1 }), side, editor: editorPlaceholder(p), status, height: 470 });
  } },

  // VS Code extension page: the version and the Uninstall button.
  'vsc-version': { width: 920, height: 380, body: (p) => {
    const side = `${sideHeader(p, 'EXTENSIONS')}${searchBox(p, '')}
      <div style="padding:4px 18px;font-size:11px;font-weight:600;color:${p.muted}">INSTALLED</div>
      <div style="background:${p.select}">${extensionCard(p, { name: 'PushPug', desc: 'Know the moment a teammate pushes', publisher: 'pushpug', iconHtml: palTile(p) })}</div>`;
    const editor = `<div style="padding:26px 30px;display:flex;gap:20px"><img src="${mascot('success')}" width="100" height="100" style="border-radius:12px;background:${p.surface2}">
      <div><div class="row" style="gap:12px"><b style="font-size:24px">PushPug</b>${mark(1, `<span style="font-size:13px;padding:1px 6px;border-radius:3px;background:${p.surface2}">v${version}</span>`, { pos: 'tr', round: 3 })}</div>
      <div class="muted" style="margin-top:6px">pushpug</div><div style="margin-top:8px">Know the moment a teammate pushes.</div>
      <div class="row" style="gap:8px;margin-top:16px"><span style="padding:3px 10px;border:1px solid ${p.border};border-radius:3px">Disable</span>${mark(2, `<span style="padding:3px 10px;border:1px solid ${p.border};border-radius:3px">Uninstall</span>`, { pos: 'tr', round: 3 })}</div></div></div>`;
    return vscWindow(p, { activity: activityBar(p, 'ext', { showPal: true }), side, editor, height: 340 });
  } },

  // GitHub: Watch → Custom → Releases.
  'gh-watch-releases': { width: 920, height: 470, body: (p) => {
    const g = p.gh;
    const box = (label, on) => `<div class="row" style="gap:8px;padding:6px 0"><span style="width:16px;height:16px;border-radius:4px;display:grid;place-items:center;${on ? `background:${g.link};color:#fff` : `border:1px solid ${g.border}`}">${on ? icon('check', 12) : ''}</span>${label}</div>`;
    return `<div class="frame" style="width:860px;height:410px;background:${g.bg};color:${g.text};border-color:${g.border};position:relative">
      ${browserBar(p, 'github.com/Pug-03/PushPug')}
      <div style="padding:16px 24px;border-bottom:1px solid ${g.border}" class="row">
        <span style="font-size:18px"><span style="color:${g.link}">Pug-03</span> / <b style="color:${g.link}">PushPug</b></span><span style="flex:1"></span>
        ${mark(1, ghPill(p, icon('eye', 16) + 'Watch' + icon('caret', 14), true), { pos: 'tl' })}<span style="width:8px"></span>${ghPill(p, icon('star', 16) + 'Star')}
      </div>
      <div style="position:absolute;top:118px;right:90px;width:300px;background:${g.bg};border:1px solid ${g.border};border-radius:12px;box-shadow:${p.shadow}">
        <div style="padding:10px 14px;border-bottom:1px solid ${g.border}"><b>Custom</b></div>
        <div style="padding:8px 16px;color:${g.muted};font-size:12px">Select events you want to be notified of in addition to participating and @mentions.</div>
        <div style="padding:0 16px">${box('Issues', false)}${box('Pull requests', false)}
          ${mark(3, `<div style="width:262px;padding:0 6px">${box('<b>Releases</b>', true)}</div>`, { block: true, pos: 'r', round: 4 })}
          ${box('Discussions', false)}${box('Security alerts', false)}</div>
        <div class="row" style="padding:10px 16px;gap:8px;border-top:1px solid ${g.border};justify-content:flex-end"><span style="padding:4px 12px;border:1px solid ${g.border};border-radius:6px">Cancel</span>${mark(4, `<span style="padding:4px 14px;border-radius:6px;background:${g.green};color:#fff;font-weight:600">Apply</span>`, { pos: 'tr' })}</div>
      </div>
      <div style="position:absolute;top:118px;right:404px;width:250px;background:${g.bg};border:1px solid ${g.border};border-radius:12px;box-shadow:${p.shadow};padding:6px 0">
        ${['Participating and @mentions', 'All Activity', 'Ignore'].map((x) => `<div style="padding:8px 14px">${x}</div>`).join('')}
        <div style="padding:2px 6px">${mark(2, `<div class="row" style="padding:6px 8px;width:236px;background:${g.subtle};border-radius:6px"><b style="flex:1">Custom</b>${icon('chevron', 14)}</div>`, { block: true, pos: 'l' })}</div>
      </div>
    </div>`;
  } },

  // macOS System Settings → Notifications → alerter.
  'mac-notifications': { width: 920, height: 520, body: (p) => {
    const m = p.mac;
    const toggle = (on) => `<span style="width:38px;height:22px;border-radius:11px;background:${on ? m.toggle : p.border};position:relative;display:inline-block"><span style="position:absolute;top:2px;${on ? 'right:2px' : 'left:2px'};width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3)"></span></span>`;
    const sideItem = (label, color, ic, sel) => `<div class="row" style="gap:8px;padding:5px 8px;border-radius:6px;${sel ? `background:${m.select};color:#fff` : ''}"><span style="width:22px;height:22px;border-radius:6px;background:${color};color:#fff;display:grid;place-items:center">${icon(ic, 14)}</span>${label}</div>`;
    const styleCard = (label, picked) => `<div style="text-align:center"><div style="width:120px;height:66px;border-radius:8px;background:${p.surface2};border:2px solid ${picked ? m.select : 'transparent'};position:relative"><span style="position:absolute;top:10px;right:10px;width:64px;height:18px;border-radius:5px;background:${p.border}"></span></div><div style="margin-top:6px;${picked ? 'font-weight:600' : ''}">${label}</div></div>`;
    return `<div class="frame" style="width:860px;display:flex;height:460px;background:${m.pane}">
      <div style="width:230px;background:${m.side};padding:14px 10px;border-right:1px solid ${p.border}">
        <div class="row" style="gap:7px;margin-bottom:16px"><span style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></span><span style="width:12px;height:12px;border-radius:50%;background:#febc2e"></span><span style="width:12px;height:12px;border-radius:50%;background:#28c840"></span></div>
        ${sideItem('Wi-Fi', '#0a84ff', 'info', false)}${sideItem('Bluetooth', '#0a84ff', 'info', false)}${sideItem('General', '#8e8e93', 'gear', false)}
        <div style="margin:6px 0">${mark(1, `<div style="width:206px">${sideItem('Notifications', '#ff3b30', 'bell', true)}</div>`, { block: true, pos: 'r' })}</div>
        ${sideItem('Focus', '#5e5ce6', 'moon', false)}${sideItem('Screen Time', '#5e5ce6', 'info', false)}
      </div>
      <div style="flex:1;padding:18px 26px">
        <div class="row" style="gap:8px;margin-bottom:16px"><span class="muted">${icon('chevron', 16, 'style="transform:rotate(180deg)"')}</span><b style="font-size:15px">alerter</b></div>
        <div style="background:${m.group};border:1px solid ${p.border};border-radius:10px">
          <div style="padding:10px 14px">${mark(2, `<div class="row" style="width:520px"><span style="flex:1">Allow notifications</span>${toggle(true)}</div>`, { block: true, pos: 'r' })}</div>
          <div style="padding:14px;border-top:1px solid ${p.border}">
            <div style="margin-bottom:10px">Desktop &amp; banner style</div>
            <div class="row" style="gap:26px;justify-content:center">${styleCard('Temporary', false)}${mark(3, styleCard('Persistent', true), { pos: 'tr', round: 8 })}</div>
          </div>
          <div class="row" style="padding:10px 14px;border-top:1px solid ${p.border}"><span style="flex:1">Show notifications on Lock Screen</span>${toggle(true)}</div>
          <div class="row" style="padding:10px 14px;border-top:1px solid ${p.border}"><span style="flex:1">Play sound for notification</span>${toggle(true)}</div>
        </div>
      </div>
    </div>`;
  } },

  // Windows 11 Settings → System → Notifications.
  'win-notifications': { width: 920, height: 500, body: (p) => {
    const w = p.win;
    const toggle = (on) => `<span class="row" style="gap:8px">${on ? 'On' : 'Off'}<span style="width:40px;height:20px;border-radius:10px;position:relative;display:inline-block;${on ? `background:${w.toggle}` : `border:1.5px solid ${p.muted}`}"><span style="position:absolute;top:${on ? 4 : 3}px;${on ? 'right:4px' : 'left:3px'};width:12px;height:12px;border-radius:50%;background:${on ? (p === PALETTE.dark ? '#000' : '#fff') : p.muted}"></span></span></span>`;
    const card = (label, sub, right, inner = '') => `<div class="row" style="background:${w.card};border:1px solid ${p.border};border-radius:6px;padding:12px 16px;gap:12px;margin-bottom:4px;${inner}"><div style="flex:1"><div>${label}</div>${sub ? `<div class="muted" style="font-size:12px">${sub}</div>` : ''}</div>${right}</div>`;
    return `<div class="frame" style="width:860px;height:440px;background:${w.bg};display:flex;font-family:'Segoe UI',system-ui,sans-serif">
      <div style="width:220px;padding:16px 10px">
        <div class="muted" style="font-size:12px;margin:0 6px 16px">Settings</div>
        ${['System', 'Bluetooth & devices', 'Network & internet', 'Personalization', 'Apps', 'Accounts'].map((x, i) =>
          `<div style="padding:7px 10px;border-radius:5px;position:relative;${i === 0 ? `background:${w.card}` : ''}">${i === 0 ? `<span style="position:absolute;left:0;top:9px;bottom:9px;width:3px;border-radius:2px;background:${w.toggle}"></span>` : ''}${x}</div>`).join('')}
      </div>
      <div style="flex:1;padding:18px 26px 0 6px">
        <div style="font-size:24px;font-weight:600;margin-bottom:16px">System <span class="muted">›</span> Notifications</div>
        ${mark(1, `<div style="width:590px">${card('Notifications', 'Get notifications from apps and other senders', toggle(true), 'margin:0')}</div>`, { block: true, pos: 'tl' })}
        <div style="height:12px"></div>
        ${mark(2, `<div style="width:590px">${card('Do not disturb', 'Notifications will be sent directly to notification center', toggle(false), 'margin:0')}</div>`, { block: true, pos: 'tl' })}
        <div style="font-weight:600;margin:18px 0 8px">Notifications from apps and other senders</div>
        ${mark(3, `<div style="width:590px">${card(`<span class="row" style="gap:10px"><span style="color:#0078d4">${icon('code', 20)}</span>Visual Studio Code</span>`, 'Banners, Sounds', toggle(true), 'margin:0')}</div>`, { block: true, pos: 'tl' })}
        <div style="height:8px"></div>
        ${card(`<span class="row" style="gap:10px"><span style="color:#2671be">${icon('terminal', 20)}</span>Windows PowerShell</span>`, 'Banners, Sounds', toggle(true))}
      </div>
    </div>`;
  } },
};

function browserBar(p, url) {
  return `<div class="row" style="height:40px;padding:0 14px;gap:8px;background:${p.surface2};border-bottom:1px solid ${p.border}">
    <span style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></span><span style="width:12px;height:12px;border-radius:50%;background:#febc2e"></span><span style="width:12px;height:12px;border-radius:50%;background:#28c840"></span>
    <span style="flex:1;margin-left:14px;padding:4px 12px;border-radius:14px;background:${p.bg};color:${p.muted};font-size:12px">${url}</span>
  </div>`;
}
function ghPill(p, inner, open = false) {
  const g = p.gh;
  return `<span class="row" style="gap:6px;padding:4px 10px;border:1px solid ${g.border};border-radius:6px;background:${open ? g.subtle : g.bg};margin-left:8px;font-size:12px;font-weight:600">${inner}</span>`;
}

let count = 0;
for (const [name, ill] of Object.entries(ILLUSTRATIONS)) {
  if (filter && !name.includes(filter)) continue;
  for (const theme of ['light', 'dark']) {
    const p = PALETTE[theme];
    const html = join(tmp, `${name}-${theme}.html`);
    writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS(p)}</style></head><body>${ill.body(p)}</body></html>`);
    execFileSync(findChrome(), [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=2',
      '--default-background-color=00000000', `--window-size=${ill.width},${ill.height}`, `--screenshot=${join(outDir, `${name}-${theme}.png`)}`, `file://${html}`,
    ], { stdio: 'ignore' });
    count++;
  }
}
console.log(`${count} illustration(s) in docs/guide/`);
