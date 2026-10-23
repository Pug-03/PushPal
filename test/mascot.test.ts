import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

// Load media/mascot.js the way a webview does, without GSAP (static drawing).
function loadMascot() {
  const window: Record<string, any> = { matchMedia: () => ({ matches: false }) };
  const ctx = { window, document: { documentElement: null }, MutationObserver: undefined, setTimeout };
  runInNewContext(readFileSync(join(__dirname, '..', 'media', 'mascot.js'), 'utf8'), ctx);
  return window;
}

test('Pug is drawn only with paths, as separate animatable layers', () => {
  const w = loadMascot();
  const svg: string = w.PushPugMascot.svg({ pose: 'sit', size: 120 });
  assert.doesNotMatch(svg, /<(circle|ellipse|rect)\b/, 'no stock shapes: everything is a bezier path');
  for (const part of ['root', 'tilt', 'earL', 'earR', 'eyeL', 'eyeR', 'openL', 'lookL', 'lidL', 'closedL', 'happyL', 'heartL', 'browL', 'browR', 'blush', 'muzzle', 'mouth', 'smile', 'bark', 'tongue', 'zzz', 'quest', 'tear']) {
    assert.match(svg, new RegExp(`class="p-${part}"`), `layer ${part}`);
  }
  assert.match(svg, /width="120" height="132"/);
});

test('the static drawing (no animation script) already shows the resting face', () => {
  const svg: string = loadMascot().PushPugMascot.svg({ pose: 'sit' });
  assert.match(svg, /class="p-lidL" opacity="0"/, 'no heavy eyelid');
  assert.match(svg, /class="p-closedL" opacity="0"/, 'eyes open');
  assert.match(svg, /class="p-smile" opacity="0"/, 'resting mouth, not the big smile');
  assert.match(svg, /class="p-tongue" opacity="0"/);
});

test('every requested pose exists', () => {
  const M = loadMascot().PushPugMascot;
  for (const p of ['sleep', 'check', 'alert', 'merge', 'success', 'conflict', 'fail', 'pass', 'welcome', 'love']) assert.ok(M.poses.includes(p), p);
});

test('the small icon head stays simple', () => {
  const w = loadMascot();
  const tiny: string = w.PushPugIconHead(16);
  const big: string = w.PushPugIconHead(128);
  assert.doesNotMatch(tiny, /<(circle|ellipse|rect)\b/);
  assert.ok(tiny.length < big.length, 'details (brows, mouth, blush) are dropped at 16 px');
});
