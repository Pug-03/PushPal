// Renders media/icon.png (128×128) from the mascot SVG with headless Chrome.
import { writeFileSync, mkdtempSync, readFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findChrome } from './chrome.mjs';

const media = resolve('media');
const dir = mkdtempSync(join(tmpdir(), 'pushpal-icon-'));
const html = join(dir, 'icon.html');
writeFileSync(
  html,
  `<!doctype html><html class="theme-light"><head><style>${readFileSync(join(media, 'base.css'), 'utf8')}
  html,body{margin:0;background:transparent}
  .tile{width:512px;height:512px;border-radius:116px;display:grid;place-items:center;
    background:radial-gradient(120% 90% at 30% 15%,#fffaf0 0%,#ffeccd 55%,#ffd9a8 100%);}
  .tile svg{transform:translateY(6px)}
  </style><script>${readFileSync(join(media, 'mascot.js'), 'utf8')}</script></head>
  <body><div class="tile" id="t"></div><script>
  document.getElementById('t').innerHTML = PushPalIconHead(400);
  </script></body></html>`,
);
const big = join(dir, 'icon-512.png');
execFileSync(findChrome(), ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', '--window-size=512,512', `--screenshot=${big}`, `file://${html}`], { stdio: 'ignore' });
execFileSync('sips', ['-z', '128', '128', big, '--out', join(media, 'icon.png')], { stdio: 'ignore' });
copyFileSync(big, join('docs', 'icon-512.png'));
console.log('media/icon.png written');
