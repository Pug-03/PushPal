// Renders the mascot pages with Playwright (the locally installed Chrome).
//   node scripts/mascot-render.mjs sheet            → docs/mascot/sheet.png (+ sheet-dark.png)
//   node scripts/mascot-render.mjs gifs [pose…]     → docs/mascot/<pose>.gif from playground.html
import { chromium } from 'playwright-core';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome } from './chrome.mjs';

const [what = 'sheet', ...rest] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: findChrome() });

async function sheet() {
  for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1060, height: 700 }, deviceScaleFactor: 2 });
    await page.emulateMedia({ reducedMotion: 'reduce' }); // held frames, no idle motion
    await page.goto(pathToFileURL(resolve('docs/mascot/sheet.html')).href + (dark ? '#dark' : ''));
    await page.waitForTimeout(900);
    await page.screenshot({ path: `docs/mascot/sheet${dark ? '-dark' : ''}.png`, fullPage: true });
    await page.close();
  }
  console.log('docs/mascot/sheet.png, sheet-dark.png');
}

/** Record each pose as frames (stepping GSAP's clock exactly), then encode a GIF with ffmpeg. */
async function gifs(poses) {
  const page = await browser.newPage({ viewport: { width: 360, height: 360 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(resolve('docs/mascot/playground.html')).href + '#record');
  await page.waitForFunction(() => window.__record);
  const all = poses.length ? poses : await page.evaluate(() => window.__record.poses);
  for (const pose of all) {
    const dir = mkdtempSync(join(tmpdir(), `pug-${pose}-`));
    const { seconds, from } = await page.evaluate((p) => window.__record.start(p), pose);
    const fps = 25;
    const frames = Math.round(seconds * fps);
    for (let i = 0; i < frames; i++) {
      await page.evaluate((t) => window.__record.seek(t), (i + 1) / fps);
      await page.locator('#stage').screenshot({ path: join(dir, `f${String(i).padStart(4, '0')}.png`) });
    }
    const out = `docs/mascot/${pose}.gif`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'f%04d.png'),
      '-vf', 'scale=240:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:reserve_transparent=0[p];[b][p]paletteuse=dither=sierra2_4a', out]);
    rmSync(dir, { recursive: true, force: true });
    console.log(`${out} (${frames} frames${from ? `, from ${from}` : ''})`);
  }
  await page.close();
}

if (what === 'sheet') await sheet();
else if (what === 'gifs') await gifs(rest);
await browser.close();
