// "Pal", PushPal's pug — a flat-style head whose expressions tell the story.
// Every part is its own layer (ears, brows, eyes, eyelids, mouth shapes,
// blush, props), animated with GSAP from its real pivot. Without GSAP, or
// with reduced motion, each expression is still drawn correctly.
//
//   PushPalMascot.svg({ pose, size, label, enter })  → markup
//   PushPalMascot.setPose(svgEl, pose)                → animate to a pose
//   PushPalMascot.confetti(hostEl, count)
//   PushPalIconHead(size)                            → simplified head for icons
(function () {
  'use strict';

  var K = {
    ink: '#3b2230',
    fur: '#f3c48f',
    furShade: '#dfa26e',
    furLight: '#fbd9ad',
    dark: '#6e3b35',
    darkShade: '#542b28',
    eye: '#24141a',
    iris: '#6b4a3c',
    patch: '#d9a170',
    tongue: '#f07a86',
    blush: '#f39a92',
    star: '#f2bd4b',
    tear: '#7cc8ff',
    teal: '#1f9e89',
    coral: '#ff7a59',
    nose: '#a07068'
  };
  var W = 3.6;

  // ---------- drawing helpers (everything is a path) ----------
  function oval(cx, cy, rx, ry) {
    var k = 0.552;
    return 'M' + (cx - rx) + ' ' + cy + 'C' + (cx - rx) + ' ' + (cy - ry * k) + ' ' + (cx - rx * k) + ' ' + (cy - ry) + ' ' + cx + ' ' + (cy - ry) +
      'C' + (cx + rx * k) + ' ' + (cy - ry) + ' ' + (cx + rx) + ' ' + (cy - ry * k) + ' ' + (cx + rx) + ' ' + cy +
      'C' + (cx + rx) + ' ' + (cy + ry * k) + ' ' + (cx + rx * k) + ' ' + (cy + ry) + ' ' + cx + ' ' + (cy + ry) +
      'C' + (cx - rx * k) + ' ' + (cy + ry) + ' ' + (cx - rx) + ' ' + (cy + ry * k) + ' ' + (cx - rx) + ' ' + cy + 'Z';
  }
  function shape(d, fill, w, extra) {
    return '<path d="' + d + '" fill="' + fill + '" stroke="' + K.ink + '" stroke-width="' + (w || W) + '" stroke-linejoin="round" stroke-linecap="round"' + (extra || '') + '/>';
  }
  function flat(d, fill, extra) {
    return '<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function line(d, w, color, extra) {
    return '<path d="' + d + '" fill="none" stroke="' + (color || K.ink) + '" stroke-width="' + (w || W) + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '/>';
  }
  function star(x, y, r) {
    return 'M' + x + ' ' + (y - r) + 'C' + (x + r * 0.12) + ' ' + (y - r * 0.25) + ' ' + (x + r * 0.25) + ' ' + (y - r * 0.12) + ' ' + (x + r) + ' ' + y +
      'C' + (x + r * 0.25) + ' ' + (y + r * 0.12) + ' ' + (x + r * 0.12) + ' ' + (y + r * 0.25) + ' ' + x + ' ' + (y + r) +
      'C' + (x - r * 0.12) + ' ' + (y + r * 0.25) + ' ' + (x - r * 0.25) + ' ' + (y + r * 0.12) + ' ' + (x - r) + ' ' + y +
      'C' + (x - r * 0.25) + ' ' + (y - r * 0.12) + ' ' + (x - r * 0.12) + ' ' + (y - r * 0.25) + ' ' + x + ' ' + (y - r) + 'Z';
  }
  function heart(cx, cy, s) {
    return 'M' + cx + ' ' + (cy + 10 * s) + 'C' + (cx - 14 * s) + ' ' + (cy + 1 * s) + ' ' + (cx - 14 * s) + ' ' + (cy - 12 * s) + ' ' + (cx - 5 * s) + ' ' + (cy - 10 * s) +
      'C' + (cx - 2 * s) + ' ' + (cy - 9 * s) + ' ' + cx + ' ' + (cy - 6 * s) + ' ' + cx + ' ' + (cy - 5 * s) +
      'C' + cx + ' ' + (cy - 6 * s) + ' ' + (cx + 2 * s) + ' ' + (cy - 9 * s) + ' ' + (cx + 5 * s) + ' ' + (cy - 10 * s) +
      'C' + (cx + 14 * s) + ' ' + (cy - 12 * s) + ' ' + (cx + 14 * s) + ' ' + (cy + 1 * s) + ' ' + cx + ' ' + (cy + 10 * s) + 'Z';
  }

  // ---------- shapes (viewBox 0 -24 200 220; head centre ≈ 100,100) ----------
  var P = {
    head: 'M100 36C132 35 158 52 164 80C168 102 162 126 146 142C132 156 116 162 100 162C84 162 68 156 54 142C38 126 32 102 36 80C42 52 68 37 100 36Z',
    headShade: 'M30 128C56 152 144 152 170 124L170 170L30 170Z',
    headLight: 'M52 58C64 44 84 40 104 41C86 46 70 54 60 68Z',
    muzzle: 'M72 104C80 96 92 94 100 97C108 94 120 96 128 104C136 112 138 126 132 136C126 146 114 151 100 151C86 151 74 146 68 136C62 126 64 112 72 104Z',
    muzzleShade: 'M56 134C76 150 124 150 144 132L144 160L56 160Z',
    // Ears: rounded folded flaps in every variant, same anatomy point for point,
    // so they morph without any sharp corner showing up in between.
    earL: { rest: 'M66 46C55 38 40 40 31 49C23 58 20 75 23 88C26 98 37 98 41 88C47 75 56 60 66 46Z', up: 'M66 46C57 38 45 35 35 39C26 43 22 52 25 62C28 70 37 69 43 63C49 58 58 54 66 46Z', down: 'M64 50C53 45 38 52 31 63C24 74 24 94 27 106C30 116 41 114 44 103C49 88 56 67 64 50Z' },
    earR: { rest: 'M134 46C145 38 160 40 169 49C177 58 180 75 177 88C174 98 163 98 159 88C153 75 144 60 134 46Z', up: 'M134 46C143 38 155 35 165 39C174 43 178 52 175 62C172 70 163 69 157 63C151 58 142 54 134 46Z', down: 'M136 50C147 45 162 52 169 63C176 74 176 94 173 106C170 116 159 114 156 103C151 88 144 67 136 50Z' },
    // Brow spots, like a dog's tan points: they move up, together or apart with the mood.
    browL: { rest: oval(70, 68, 5.5, 3.8), up: oval(69, 60, 5.5, 3.8), worried: oval(75, 63, 5.5, 3.8), angry: oval(75, 72, 5.5, 3.8) },
    browR: { rest: oval(130, 68, 5.5, 3.8), up: oval(131, 60, 5.5, 3.8), worried: oval(125, 63, 5.5, 3.8), angry: oval(125, 72, 5.5, 3.8) },
    diamond: 'M100 50L106 58L100 66L94 58Z',
    wrinkle: 'M86 76C92 72 108 72 114 76',
    noseRoll: 'M76 112C86 106 114 106 124 112',
    nose: 'M92 112C94 107 106 107 108 112C110 117 105 121 100 121C95 121 90 117 92 112Z',
    noseLight: 'M95 111C97 109 101 109 103 110C101 112 97 112 95 111Z',
    philtrum: 'M100 121L100 128',
    mouth: {
      w: 'M86 132C91 138 96 138 100 132C104 138 109 138 114 132',
      frown: 'M88 138C93 133 107 133 112 138',
      flat: 'M89 135C95 133 105 136 111 134',
      side: 'M90 136C96 134 104 133 112 128'
    },
    smile: 'M82 128C88 132 112 132 118 128C117 140 110 147 100 147C90 147 83 140 82 128Z',
    smileTongue: 'M90 140C93 135 107 135 110 140C106 145 94 145 90 140Z',
    bark: 'M86 126C92 122 108 122 114 126C116 138 110 148 100 148C90 148 84 138 86 126Z',
    barkTongue: 'M91 141C94 137 106 137 109 141C105 146 95 146 91 141Z',
    tongueOut: 'M94 134C93 146 107 146 106 134C103 136 97 136 94 134Z',
    ropeA: 'M-4 138C22 126 50 146 76 134',
    ropeB: 'M204 138C178 126 150 146 124 134',
    question: 'M150 -6C152 -16 168 -16 168 -6C168 2 158 2 158 10M158 18L158 18.5',
    z: 'M0 0L8 0L0 8L8 8',
    barkL: 'M30 116C24 110 22 102 24 94M40 112C36 108 34 102 35 96',
    barkR: 'M170 116C176 110 178 102 176 94M160 112C164 108 166 102 165 96',
    sniff: 'M140 116C146 112 150 114 154 110M142 124C148 122 154 124 158 120',
    tear: 'M152 100C152 100 146 108 146 112C146 116 149 118 152 118C155 118 158 116 158 112C158 108 152 100 152 100Z'
  };
  var EYES = { L: [66, 92], R: [134, 92] };

  function eye(side) {
    var c = EYES[side];
    var x = c[0], y = c[1];
    var o = [];
    o.push('<g class="p-eye' + side + '">');
    o.push(flat(oval(x, y + 1, 18, 17), K.patch));
    // open eye: the "look" group moves, the "open" group blinks
    o.push('<g class="p-open' + side + '"><g class="p-look' + side + '">' +
      shape(oval(x, y, 12.5, 12.2), K.eye) +
      flat('M' + (x - 8) + ' ' + (y + 5) + 'C' + (x - 4) + ' ' + (y + 10) + ' ' + (x + 4) + ' ' + (y + 10) + ' ' + (x + 8) + ' ' + (y + 5) + 'C' + (x + 4) + ' ' + (y + 8) + ' ' + (x - 4) + ' ' + (y + 8) + ' ' + (x - 8) + ' ' + (y + 5) + 'Z', K.iris) +
      flat(oval(x - 4, y - 4.5, 4.4, 4.2), '#fff') + flat(oval(x + 5, y + 4, 1.9, 1.8), '#fff') +
      '</g></g>');
    // heavy upper lid (sad)
    o.push('<g class="p-lid' + side + '" opacity="0">' +
      flat('M' + (x - 17) + ' ' + (y - 2) + 'C' + (x - 11) + ' ' + (y - 19) + ' ' + (x + 11) + ' ' + (y - 19) + ' ' + (x + 17) + ' ' + (y - 2) + 'C' + (x + 9) + ' ' + (y - 7) + ' ' + (x - 9) + ' ' + (y - 7) + ' ' + (x - 17) + ' ' + (y - 2) + 'Z', K.patch) +
      line('M' + (x - 14) + ' ' + (y - 4) + 'C' + (x - 6) + ' ' + (y - 9) + ' ' + (x + 6) + ' ' + (y - 9) + ' ' + (x + 14) + ' ' + (y - 4), 3) + '</g>');
    o.push(line('M' + (x - 11) + ' ' + (y + 2) + 'C' + (x - 5) + ' ' + (y + 8) + ' ' + (x + 5) + ' ' + (y + 8) + ' ' + (x + 11) + ' ' + (y + 2), 3.4, K.ink, ' class="p-closed' + side + '" opacity="0"'));
    o.push(line('M' + (x - 11) + ' ' + (y + 4) + 'C' + (x - 6) + ' ' + (y - 7) + ' ' + (x + 6) + ' ' + (y - 7) + ' ' + (x + 11) + ' ' + (y + 4), 3.8, K.ink, ' class="p-happy' + side + '" opacity="0"'));
    o.push('<g class="p-heart' + side + '" opacity="0">' + shape(heart(x, y, 1), K.tongue) + '</g>');
    o.push('</g>');
    return o.join('');
  }

  var uid = 0;

  function mascotSvg(o) {
    o = o || {};
    var size = o.size || 96;
    var pose = o.pose || 'sit';
    var u = 'pal' + ++uid + '-';
    var s = [];
    s.push('<svg class="mascot pug' + (o.enter ? ' enter' : '') + '" data-pose="' + pose + '" viewBox="0 -24 200 220" width="' + size + '" height="' + Math.round(size * 1.1) + '" role="img" aria-label="' + (o.label || 'PushPal') + '">');
    s.push('<defs><clipPath id="' + u + 'head"><path d="' + P.head + '"/></clipPath><clipPath id="' + u + 'muzzle"><path d="' + P.muzzle + '"/></clipPath></defs>');
    s.push('<path class="p-shadow" d="' + oval(100, 184, 46, 5) + '" fill="#2a1a20" opacity=".14"/>');
    s.push('<g class="p-root"><g class="p-poke"><g class="p-spin"><g class="p-tilt">');
    // props behind the head
    s.push('<g class="p-rope" opacity="0"><g class="p-ropeA">' + line(P.ropeA, 8) + line(P.ropeA, 4.2, K.teal) + '</g><g class="p-ropeB">' + line(P.ropeB, 8) + line(P.ropeB, 4.2, K.coral) + '</g></g>');
    s.push('<path class="p-earL" d="' + P.earL.rest + '" fill="' + K.dark + '" stroke="' + K.ink + '" stroke-width="' + W + '" stroke-linejoin="round"/>');
    s.push('<path class="p-earR" d="' + P.earR.rest + '" fill="' + K.dark + '" stroke="' + K.ink + '" stroke-width="' + W + '" stroke-linejoin="round"/>');
    // head, with blush clipped inside it
    s.push(shape(P.head, K.fur));
    s.push('<g clip-path="url(#' + u + 'head)">' + flat(P.headShade, K.furShade) + flat(P.headLight, K.furLight) +
      '<g class="p-blush" opacity=".5">' + flat(oval(54, 124, 8, 4.6), K.blush) + flat(oval(146, 124, 8, 4.6), K.blush) + '</g></g>');
    s.push(line(P.head, W));
    s.push(flat(P.diamond, K.patch, ' opacity=".7"'));
    s.push(line(P.wrinkle, 2.6, K.furShade));
    s.push(flat(P.browL.rest, K.darkShade, ' class="p-browL"'));
    s.push(flat(P.browR.rest, K.darkShade, ' class="p-browR"'));
    s.push(eye('L') + eye('R'));
    // muzzle
    s.push('<g class="p-muzzle">' + shape(P.muzzle, K.dark) + '<g clip-path="url(#' + u + 'muzzle)">' + flat(P.muzzleShade, K.darkShade) + '</g>' + line(P.muzzle, W) +
      line(P.noseRoll, 2.6, K.darkShade) + shape(P.nose, K.eye) + flat(P.noseLight, K.nose) + line(P.philtrum, 2.6) +
      [[80, 122], [84, 126], [78, 128], [120, 122], [116, 126], [122, 128]].map(function (d) { return flat(oval(d[0], d[1], 1.6, 1.4), K.darkShade); }).join('') + '</g>');
    // mouths: one line that morphs, plus open shapes that pop in
    s.push(line(P.mouth.w, 3, K.ink, ' class="p-mouth"'));
    s.push('<g class="p-smile" opacity="0">' + shape(P.smile, K.eye) + flat(P.smileTongue, K.tongue) + '</g>');
    s.push('<g class="p-bark" opacity="0">' + shape(P.bark, K.eye) + flat(P.barkTongue, K.tongue) + '</g>');
    s.push('<g class="p-tongue" opacity="0">' + shape(P.tongueOut, K.tongue, 2.6) + '</g>');
    s.push('<g class="p-mouthO" opacity="0">' + shape(oval(100, 138, 5.5, 7), K.eye, 2.6) + '</g>');
    s.push('<g class="p-knot" opacity="0">' + shape(oval(100, 152, 9, 7), K.teal, 3) + line('M94 151C98 147 103 149 106 155', 3, K.coral) + '</g>');
    s.push('</g></g></g></g>'); // tilt, spin, poke, root
    // props in front, not tilted with the head
    s.push('<g class="p-zzz" opacity="0">' + [0, 1, 2].map(function (i) { return '<g class="p-z" transform="translate(' + (150 + i * 10) + ' ' + (30 - i * 16) + ') scale(' + (1 + i * 0.25) + ')">' + line(P.z, 2.8, K.iris) + '</g>'; }).join('') + '</g>');
    s.push('<g class="p-barkLines" opacity="0">' + line(P.barkL, 3, K.iris) + line(P.barkR, 3, K.iris) + '</g>');
    s.push('<g class="p-sniff" opacity="0">' + line(P.sniff, 2.6, K.iris) + '</g>');
    s.push('<g class="p-quest" opacity="0">' + line(P.question, 7) + line(P.question, 3.6, K.star) + '</g>');
    s.push('<g class="p-tear" opacity="0">' + shape(P.tear, K.tear, 2.2) + '</g>');
    s.push('<g class="p-hearts">' + [0, 1, 2].map(function () { return '<g class="p-heartUp" opacity="0">' + shape(heart(0, 0, 0.75), K.tongue, 2.2) + '</g>'; }).join('') + '</g>');
    s.push('<g class="p-stars">' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<g class="p-star" opacity="0">' + shape(star(0, 0, 8), i % 2 ? K.coral : K.star, 2.2) + '</g>'; }).join('') + '</g>');
    s.push('</svg>');
    return s.join('');
  }

  /** Simplified head for icons: no props; brows, blush and mouth dropped when tiny. */
  function iconSvg(size, opts) {
    opts = opts || {};
    var u = 'icon' + ++uid;
    var tiny = size <= 20;
    var w = tiny ? 6 : W;
    var s = [];
    s.push('<svg viewBox="16 26 168 144" width="' + size + '" height="' + size + '" role="img" aria-label="' + (opts.label || 'PushPal') + '">');
    s.push('<defs><clipPath id="' + u + 'h"><path d="' + P.head + '"/></clipPath><clipPath id="' + u + 'm"><path d="' + P.muzzle + '"/></clipPath></defs>');
    s.push(shape(P.earL.rest, K.dark, w) + shape(P.earR.rest, K.dark, w) + shape(P.head, K.fur, w));
    s.push('<g clip-path="url(#' + u + 'h)">' + flat(P.headShade, K.furShade) + (tiny ? '' : flat(P.headLight, K.furLight) + flat(oval(54, 124, 8, 4.6), K.blush, ' opacity=".5"') + flat(oval(146, 124, 8, 4.6), K.blush, ' opacity=".5"')) + '</g>');
    s.push(line(P.head, w));
    if (!tiny) s.push(flat(P.diamond, K.patch, ' opacity=".7"') + flat(P.browL.rest, K.darkShade) + flat(P.browR.rest, K.darkShade));
    ['L', 'R'].forEach(function (side) {
      var c = EYES[side];
      var r = tiny ? 14 : 12.5;
      s.push(flat(oval(c[0], c[1] + 1, 18, 17), K.patch) + shape(oval(c[0], c[1], r, r), K.eye, w) + flat(oval(c[0] - 4, c[1] - 4.5, tiny ? 5.5 : 4.4, tiny ? 5.5 : 4.2), '#fff'));
    });
    s.push(shape(P.muzzle, K.dark, w) + '<g clip-path="url(#' + u + 'm)">' + flat(P.muzzleShade, K.darkShade) + '</g>' + line(P.muzzle, w) + shape(P.nose, K.eye, tiny ? 4 : W));
    if (!tiny) s.push(line(P.philtrum, 2.6) + line(P.mouth.w, 3));
    s.push('</svg>');
    return s.join('');
  }

  // ---------- animation ----------
  var gsap = window.gsap;
  var hasMorph = !!(gsap && window.MorphSVGPlugin);
  if (hasMorph) gsap.registerPlugin(window.MorphSVGPlugin);
  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  var ORIGINS = {
    root: '100 172', poke: '100 150', spin: '100 100', tilt: '100 128', earL: '62 50', earR: '138 50',
    openL: '66 92', openR: '134 92', heartL: '66 92', heartR: '134 92', happyL: '66 92', happyR: '134 92',
    blush: '100 124', muzzle: '100 120', smile: '100 128', bark: '100 124', tongue: '100 134', mouthO: '100 138',
    knot: '100 152', quest: '159 14', tear: '152 108', shadow: '100 184'
  };

  // Expression = which variant each feature shows. Pose = expression + motion.
  var FACES = {
    sit: { eyes: 'open', brows: 'rest', ears: 'rest', mouth: 'w' },
    sleep: { eyes: 'closed', brows: 'rest', ears: 'down', mouth: 'flat', tilt: -6, blush: 1.25, zzz: true },
    check: { eyes: 'open', brows: 'up', ears: 'rest', mouth: 'o', tilt: 4, look: [5, -2], sniff: true },
    alert: { eyes: 'wide', brows: 'up', ears: 'up', mouth: 'w' },
    merge: { eyes: 'open', brows: 'angry', ears: 'rest', mouth: 'w', look: [0, 2], rope: true },
    success: { eyes: 'happy', brows: 'rest', ears: 'up', mouth: 'smile', blush: 1.4 },
    conflict: { eyes: 'open', brows: 'conflict', ears: 'rest', mouth: 'side', tilt: 14, look: [-3, -3], quest: true },
    fail: { eyes: 'sad', brows: 'worried', ears: 'down', mouth: 'frown', look: [0, 3], blush: 0, tear: true },
    pass: { eyes: 'wink', brows: 'up', ears: 'rest', mouth: 'smile', tilt: -6, blush: 1.3 },
    welcome: { eyes: 'open', brows: 'up', ears: 'up', mouth: 'smile', blush: 1.2 },
    love: { eyes: 'heart', brows: 'rest', ears: 'up', mouth: 'tongue', tilt: 6, blush: 1.5 }
  };
  // Older names kept so existing callers keep working.
  var ALIASES = { idle: 'sit', chill: 'sleep', wave: 'welcome', point: 'check', cheer: 'success', worry: 'conflict', busy: 'merge', belly: 'love' };

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function Pal(svg) {
    this.svg = svg;
    var q = (this.parts = {});
    ['root', 'poke', 'spin', 'tilt', 'earL', 'earR', 'browL', 'browR', 'openL', 'openR', 'lookL', 'lookR', 'lidL', 'lidR', 'closedL', 'closedR', 'happyL', 'happyR', 'heartL', 'heartR',
      'blush', 'muzzle', 'mouth', 'smile', 'bark', 'tongue', 'mouthO', 'knot', 'rope', 'ropeA', 'ropeB', 'zzz', 'barkLines', 'sniff', 'quest', 'tear', 'shadow'].forEach(function (n) {
      q[n] = svg.querySelector('.p-' + n);
    });
    q.zs = Array.prototype.slice.call(svg.querySelectorAll('.p-z'));
    q.stars = Array.prototype.slice.call(svg.querySelectorAll('.p-star'));
    q.hearts = Array.prototype.slice.call(svg.querySelectorAll('.p-heartUp'));
    this.loops = [];
    this.timers = [];
    if (!gsap) return;
    Object.keys(ORIGINS).forEach(function (n) { if (q[n]) gsap.set(q[n], { svgOrigin: ORIGINS[n] }); });
    var self = this;
    // Poke with the mouse: squish while pressed, jiggle on release.
    svg.addEventListener('pointerdown', function (e) { self.press(e); });
    svg.addEventListener('pointerenter', function () { self.perk(); });
  }

  Pal.prototype.clear = function () {
    if (this.tl) this.tl.kill();
    this.loops.forEach(function (t) { t.kill(); });
    this.timers.forEach(function (t) { t.kill(); });
    this.loops = [];
    this.timers = [];
  };
  Pal.prototype.later = function (sec, fn) { this.timers.push(gsap.delayedCall(sec, fn)); };
  Pal.prototype.keep = function (t) { this.loops.push(t); return t; };

  /** Tween (or set, when dur is 0) every feature to an expression. */
  Pal.prototype.face = function (f, tl, at, dur) {
    var q = this.parts;
    var to = function (el, vars) {
      if (!el) return;
      if (dur) tl.to(el, Object.assign({ duration: dur, ease: 'power2.inOut' }, vars), at);
      else gsap.set(el, vars);
    };
    var morph = function (el, d) {
      if (!el) return;
      if (hasMorph && dur) tl.to(el, { morphSVG: d, duration: dur, ease: 'power2.inOut' }, at);
      else el.setAttribute('d', d);
    };
    morph(q.earL, P.earL[f.ears]);
    morph(q.earR, P.earR[f.ears]);
    morph(q.browL, P.browL[f.brows === 'conflict' ? 'rest' : f.brows]);
    morph(q.browR, P.browR[f.brows === 'conflict' ? 'up' : f.brows]);
    var lineMouth = P.mouth[f.mouth];
    morph(q.mouth, lineMouth || P.mouth.w);
    to(q.mouth, { opacity: lineMouth || f.mouth === 'tongue' ? 1 : 0 });
    to(q.smile, { opacity: f.mouth === 'smile' ? 1 : 0, scaleY: f.mouth === 'smile' ? 1 : 0.3 });
    to(q.bark, { opacity: 0, scaleY: 0.3 });
    to(q.tongue, { opacity: f.mouth === 'tongue' ? 1 : 0, scaleY: f.mouth === 'tongue' ? 1 : 0.2 });
    to(q.mouthO, { opacity: f.mouth === 'o' ? 1 : 0, scale: f.mouth === 'o' ? 1 : 0.3 });
    ['L', 'R'].forEach(function (side) {
      var e = f.eyes === 'wink' ? (side === 'L' ? 'happy' : 'open') : f.eyes;
      var open = e === 'open' || e === 'wide' || e === 'sad';
      to(q['open' + side], { opacity: open ? 1 : 0, scale: e === 'wide' ? 1.14 : 1 });
      to(q['look' + side], { x: f.look ? f.look[0] : 0, y: f.look ? f.look[1] : 0 });
      to(q['lid' + side], { opacity: e === 'sad' ? 1 : 0, y: e === 'sad' ? 0 : -6 });
      to(q['closed' + side], { opacity: e === 'closed' ? 1 : 0 });
      to(q['happy' + side], { opacity: e === 'happy' ? 1 : 0, scale: e === 'happy' ? 1 : 0.6 });
      to(q['heart' + side], { opacity: e === 'heart' ? 1 : 0, scale: e === 'heart' ? 1 : 0.2 });
    });
    var blush = f.blush === undefined ? 1 : f.blush;
    to(q.blush, { opacity: 0.5 * blush, scale: Math.max(0.8, blush * 0.9) });
    to(q.tilt, { rotation: f.tilt || 0 });
    to(q.rope, { opacity: f.rope ? 1 : 0 });
    to(q.knot, { opacity: f.rope ? 1 : 0, scale: f.rope ? 1 : 0.2 });
    to(q.zzz, { opacity: f.zzz ? 1 : 0 });
    to(q.sniff, { opacity: f.sniff ? 1 : 0 });
    to(q.quest, { opacity: f.quest ? 1 : 0, scale: f.quest ? 1 : 0.3 });
    to(q.tear, { opacity: f.tear ? 1 : 0 });
  };

  Pal.prototype.play = function (pose) {
    pose = ALIASES[pose] || pose;
    if (!FACES[pose]) pose = 'sit';
    if (pose === this.pose && pose !== 'love') return;
    var from = this.pose;
    this.pose = pose;
    this.svg.setAttribute('data-pose', pose);
    if (!gsap) return;
    this.clear();
    var f = FACES[pose];
    var q = this.parts;
    var self = this;
    if (reduceMQ.matches) {
      // No movement: cross-fade to the new expression.
      this.tl = gsap.timeline()
        .to(this.svg, { opacity: from ? 0 : 1, duration: from ? 0.15 : 0 })
        .call(function () { self.face(f, null, 0, 0); })
        .to(this.svg, { opacity: 1, duration: 0.2 });
      return;
    }
    var tl = (this.tl = gsap.timeline());
    var first = !from;
    // Settle the head back to rest, then switch the face.
    if (!first) {
      tl.to(q.root, { x: 0, y: 0, scaleX: 1, scaleY: 1, scale: 1, rotation: 0, duration: 0.3, ease: 'power2.out' }, 0)
        .to(q.spin, { rotation: 0, duration: 0.3 }, 0)
        .to([q.earL, q.earR, q.muzzle], { rotation: 0, scaleX: 1, scaleY: 1, duration: 0.3 }, 0);
    }
    this.face(f, tl, 0, first ? 0 : 0.28);
    var intro = INTROS[pose];
    if (intro && (!first || pose === 'welcome' || this.svg.classList.contains('enter'))) intro.call(this, tl, f);
    tl.call(function () { (LOOPS[pose] || LOOPS.sit).call(self, f); });
  };

  /** Mouse over: a little ear perk and a glance up, without changing the pose. */
  Pal.prototype.perk = function () {
    if (!gsap || reduceMQ.matches || this.pokeTl) return;
    var q = this.parts;
    gsap.timeline()
      .to(q.earL, { rotation: -10, duration: 0.08, ease: 'power2.out' }, 0)
      .to(q.earR, { rotation: 10, duration: 0.08, ease: 'power2.out' }, 0.04)
      .to([q.earL, q.earR], { rotation: 0, duration: 0.6, ease: 'elastic.out(1.2,0.3)' }, 0.12)
      .fromTo(q.poke, { y: 0 }, { y: -4, duration: 0.12, ease: 'power2.out', yoyo: true, repeat: 1 }, 0);
  };

  // Quick reactions shown for a moment after a poke.
  var POKE_FACES = [
    { eyes: 'happy', mouth: 'smile', blush: 1.5 },
    { eyes: 'wide', mouth: 'o', blush: 1.2 },
    { eyes: 'happy', mouth: 'tongue', blush: 1.4 },
    { eyes: 'wink', mouth: 'smile', blush: 1.4 }
  ];

  /**
   * Poke: squash while the button is held, then a springy jiggle with ears and
   * muzzle wobbling and a quick funny face. Five quick pokes = heart eyes.
   */
  Pal.prototype.press = function (e) {
    if (!gsap) return;
    if (e && e.button !== undefined && e.button !== 0) return;
    var self = this;
    var q = this.parts;
    if (this.pose === 'love') return;
    var now = Date.now();
    this.pokes = (this.pokes || []).filter(function (t) { return now - t < 2000; });
    this.pokes.push(now);
    if (this.pokes.length >= 5) {
      this.pokes = [];
      if (this.pokeTl) this.pokeTl.kill();
      this.pokeTl = null;
      gsap.set(q.poke, { scaleX: 1, scaleY: 1, rotation: 0, y: 0 });
      return this.tickle();
    }
    if (this.pokeTl) this.pokeTl.kill();
    var reduce = reduceMQ.matches;
    if (!reduce) gsap.to(q.poke, { scaleX: 1.12, scaleY: 0.86, rotation: 0, y: 4, duration: 0.08, ease: 'power2.out', overwrite: true });
    var released = false;
    var release = function () {
      if (released) return;
      released = true;
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      var base = Object.assign({}, FACES[self.pose] || FACES.sit);
      var flash = Object.assign({}, base, POKE_FACES[Math.floor(Math.random() * POKE_FACES.length)]);
      var tl = (self.pokeTl = gsap.timeline({ onComplete: function () { self.pokeTl = null; } }));
      if (!reduce) {
        var dir = Math.random() < 0.5 ? -1 : 1;
        tl.to(q.poke, { scaleX: 0.9, scaleY: 1.12, y: -10, rotation: 9 * dir, duration: 0.12, ease: 'power2.out' }, 0)
          .to(q.poke, { keyframes: [
            { rotation: -7 * dir, scaleX: 1.05, scaleY: 0.96, y: 0, duration: 0.12 },
            { rotation: 5 * dir, scaleX: 0.98, scaleY: 1.03, duration: 0.11 },
            { rotation: -3 * dir, scaleX: 1.01, scaleY: 0.99, duration: 0.1 },
            { rotation: 0, scaleX: 1, scaleY: 1, duration: 0.3, ease: 'elastic.out(1,0.4)' }
          ] }, 0.12)
          .fromTo(q.earL, { rotation: -26 * dir }, { rotation: 0, duration: 1, ease: 'elastic.out(1.2,0.25)' }, 0.05)
          .fromTo(q.earR, { rotation: 26 * dir }, { rotation: 0, duration: 1.05, ease: 'elastic.out(1.2,0.25)' }, 0.08)
          .fromTo(q.muzzle, { scaleX: 1.08, scaleY: 0.92 }, { scaleX: 1, scaleY: 1, duration: 0.8, ease: 'elastic.out(1,0.3)' }, 0.1);
      }
      // Funny face for a moment, then back to the pose's own face.
      self.face(flash, tl, 0, 0.1);
      self.face(base, tl, 0.9, 0.2);
    };
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
  };

  /** Five quick pokes: love-struck for a moment, then back to what it was doing. */
  Pal.prototype.tickle = function () {
    if (!gsap || this.pose === 'love') return;
    var back = this.pose || 'sit';
    this.play('love');
    var self = this;
    this.later(2.4, function () { self.play(back); });
  };

  // ---------- shared moves ----------
  function blinkLoop(self, f) {
    var q = self.parts;
    var eyes = [];
    ['L', 'R'].forEach(function (s) {
      var e = f.eyes === 'wink' ? (s === 'L' ? 'happy' : 'open') : f.eyes;
      if (e === 'open' || e === 'wide' || e === 'sad') eyes.push(q['open' + s]);
    });
    if (!eyes.length) return;
    var go = function () {
      var t = gsap.timeline();
      t.to(eyes, { scaleY: 0.08, duration: 0.06, ease: 'power2.in' }).to(eyes, { scaleY: 1, duration: 0.12, ease: 'power2.out' });
      if (Math.random() < 0.22) t.to(eyes, { scaleY: 0.08, duration: 0.06 }, '+=0.08').to(eyes, { scaleY: 1, duration: 0.12 });
      self.loops.push(t);
      self.later(rnd(3, 6), go);
    };
    self.later(rnd(1, 3.5), go);
  }
  function breathe(self, amp, dur) {
    return self.keep(gsap.to(self.parts.root, { scaleY: 1 + amp, scaleX: 1 - amp * 0.5, duration: dur, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
  }
  /** Ears and muzzle keep wobbling after a move (follow-through). */
  function wobble(tl, q, at, strength) {
    strength = strength || 1;
    tl.fromTo(q.earL, { rotation: -18 * strength }, { rotation: 0, duration: 0.9, ease: 'elastic.out(1.1,0.3)' }, at)
      .fromTo(q.earR, { rotation: 18 * strength }, { rotation: 0, duration: 0.95, ease: 'elastic.out(1.1,0.3)' }, at + 0.03)
      .fromTo(q.muzzle, { scaleX: 1.05, scaleY: 0.95 }, { scaleX: 1, scaleY: 1, duration: 0.7, ease: 'elastic.out(1,0.35)' }, at);
  }
  function barkOnce(tl, q, at) {
    tl.to(q.root, { y: -6, scaleY: 1.06, duration: 0.08, ease: 'power2.out' }, at)
      .to(q.mouth, { opacity: 0, duration: 0.04 }, at)
      .to(q.bark, { opacity: 1, scaleY: 1, duration: 0.08, ease: 'back.out(3)' }, at)
      .fromTo(q.barkLines, { opacity: 1, scale: 0.7, svgOrigin: '100 105' }, { opacity: 0, scale: 1.3, duration: 0.45, ease: 'power1.out' }, at + 0.03)
      .to(q.root, { y: 0, scaleY: 1, duration: 0.3, ease: 'elastic.out(1,0.4)' }, at + 0.1)
      .to(q.bark, { opacity: 0, scaleY: 0.3, duration: 0.12, ease: 'power2.in' }, at + 0.16)
      .to(q.mouth, { opacity: 1, duration: 0.06 }, at + 0.24);
  }
  function burst(tl, els, at, radius) {
    els.forEach(function (s, i) {
      var a = (i / els.length) * Math.PI * 2 - Math.PI / 2 + rnd(-0.3, 0.3);
      var d = rnd(radius * 0.75, radius);
      tl.fromTo(s, { x: 100, y: 96, scale: 0.2, opacity: 1, rotation: 0 }, { x: 100 + Math.cos(a) * d, y: 96 + Math.sin(a) * d * 0.85, scale: rnd(1, 1.5), rotation: rnd(-90, 90), duration: 0.6, ease: 'power3.out' }, at);
      tl.to(s, { opacity: 0, scale: 0.4, duration: 0.3, ease: 'power1.in' }, at + 0.45);
    });
  }

  var INTROS = {
    alert: function (tl) {
      var q = this.parts;
      // Startle: flinch down (anticipation), then pop up tall with ears lifting.
      tl.to(q.root, { y: 6, scaleY: 0.86, scaleX: 1.08, duration: 0.12, ease: 'power2.in' }, 0)
        .to(q.root, { y: -14, scaleY: 1.1, scaleX: 0.94, duration: 0.18, ease: 'power3.out' }, 0.13)
        .to(q.root, { y: 0, scaleY: 1, scaleX: 1, duration: 0.45, ease: 'bounce.out' }, 0.32);
      wobble(tl, q, 0.36, 1);
      barkOnce(tl, q, 0.9);
      barkOnce(tl, q, 1.25);
    },
    merge: function (tl) {
      var q = this.parts;
      tl.fromTo(q.ropeA, { x: -70 }, { x: 0, duration: 0.5, ease: 'power3.out' }, 0.05)
        .fromTo(q.ropeB, { x: 70 }, { x: 0, duration: 0.5, ease: 'power3.out' }, 0.15)
        .fromTo(q.knot, { scale: 0 }, { scale: 1.3, duration: 0.2, ease: 'back.out(3)' }, 0.6)
        .to(q.knot, { scale: 1, duration: 0.3, ease: 'elastic.out(1,0.4)' }, 0.8);
    },
    success: function (tl) {
      var q = this.parts;
      var t = 0.2;
      tl.to(q.root, { scaleY: 0.8, scaleX: 1.14, y: 6, duration: 0.18, ease: 'power2.in' }, t)
        .to(q.root, { y: -44, scaleY: 1.12, scaleX: 0.92, duration: 0.3, ease: 'power2.out' }, t + 0.18)
        .fromTo(q.spin, { rotation: 0 }, { rotation: 360, duration: 0.55, ease: 'power1.inOut' }, t + 0.2)
        .to(q.shadow, { scaleX: 0.55, opacity: 0.06, duration: 0.3 }, t + 0.18)
        .to(q.root, { scaleY: 1, scaleX: 1, duration: 0.2 }, t + 0.45)
        .to(q.root, { y: 0, duration: 0.24, ease: 'power2.in' }, t + 0.55)
        .to(q.shadow, { scaleX: 1, opacity: 0.14, duration: 0.24, ease: 'power2.in' }, t + 0.55)
        .set(q.spin, { rotation: 0 }, t + 0.79)
        .to(q.root, { scaleY: 0.82, scaleX: 1.14, duration: 0.08 }, t + 0.79)
        .to(q.root, { scaleY: 1, scaleX: 1, duration: 0.5, ease: 'elastic.out(1.1,0.35)' }, t + 0.87);
      wobble(tl, q, t + 0.82, 1.2);
      burst(tl, q.stars, t + 0.82, 88);
    },
    conflict: function (tl, f) {
      var q = this.parts;
      tl.fromTo(q.tilt, { rotation: 0 }, { rotation: f.tilt, duration: 1.1, ease: 'sine.inOut' }, 0)
        .fromTo(q.quest, { opacity: 0, scale: 0.2, y: 14 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: 'back.out(3)' }, 0.7);
    },
    fail: function (tl) {
      // The head sinks a little while the ears droop.
      tl.fromTo(this.parts.root, { y: 0 }, { y: 6, duration: 1, ease: 'power2.inOut' }, 0.2);
    },
    pass: function (tl) {
      var q = this.parts;
      // Two nods.
      tl.to(q.root, { y: 6, scaleY: 0.95, duration: 0.13, ease: 'power2.in' }, 0)
        .to(q.root, { y: 0, scaleY: 1, duration: 0.2, ease: 'power2.out' }, 0.13)
        .to(q.root, { y: 6, scaleY: 0.95, duration: 0.13, ease: 'power2.in' }, 0.36)
        .to(q.root, { y: 0, scaleY: 1, duration: 0.3, ease: 'back.out(2)' }, 0.49);
      wobble(tl, q, 0.55, 0.5);
    },
    welcome: function (tl) {
      var q = this.parts;
      // Pop in with an overshoot and a little twist; ears flop into place; a wink.
      tl.fromTo(q.root, { scale: 0, rotation: -20, y: 30 }, { scale: 1, rotation: 0, y: 0, duration: 0.7, ease: 'back.out(2.2)' }, 0)
        .fromTo(q.shadow, { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 0.14, duration: 0.6 }, 0.1);
      wobble(tl, q, 0.55, 1);
      tl.to(q.happyL, { opacity: 1, scale: 1, duration: 0.08 }, 1.1).to(q.openL, { opacity: 0, duration: 0.08 }, 1.1)
        .to(q.happyL, { opacity: 0, duration: 0.1 }, 1.45).to(q.openL, { opacity: 1, duration: 0.1 }, 1.45);
    },
    love: function (tl) {
      var q = this.parts;
      tl.fromTo(q.root, { scaleX: 1.12, scaleY: 0.88 }, { scaleX: 1, scaleY: 1, duration: 0.5, ease: 'elastic.out(1.1,0.35)' }, 0);
      [q.heartL, q.heartR].forEach(function (h, i) { tl.fromTo(h, { scale: 0.2 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' }, 0.05 + i * 0.05); });
    }
  };

  // Loops: life while holding a pose. Random timing so nothing visibly repeats.
  var LOOPS = {
    sit: function (f) {
      var q = this.parts;
      var self = this;
      breathe(this, 0.015, 1.9);
      blinkLoop(this, f);
      var idle = function () {
        var r = Math.random();
        var t = gsap.timeline();
        if (r < 0.35) {
          var ear = Math.random() < 0.5 ? q.earL : q.earR;
          t.to(ear, { rotation: ear === q.earL ? -14 : 14, duration: 0.07 }).to(ear, { rotation: 0, duration: 0.6, ease: 'elastic.out(1.2,0.3)' });
        } else if (r < 0.7) {
          var dir = Math.random() < 0.5 ? -1 : 1;
          t.to([q.lookL, q.lookR], { x: 4 * dir, duration: 0.15, ease: 'power2.out' })
            .to(q.tilt, { rotation: 5 * dir, duration: 0.5, ease: 'sine.inOut' }, '<')
            .to([q.lookL, q.lookR], { x: 0, duration: 0.2 }, '+=1.1')
            .to(q.tilt, { rotation: f.tilt || 0, duration: 0.5, ease: 'sine.inOut' }, '<');
        } else {
          // A quick smile with rosier cheeks, then back.
          t.to(q.mouth, { opacity: 0, duration: 0.05 }).to(q.smile, { opacity: 1, scaleY: 1, duration: 0.15, ease: 'back.out(2)' }, '<')
            .to(q.blush, { scale: 1.15, opacity: 0.7, duration: 0.3 }, '<')
            .to(q.smile, { opacity: 0, scaleY: 0.3, duration: 0.15 }, '+=1.2').to(q.mouth, { opacity: 1, duration: 0.1 }, '<')
            .to(q.blush, { scale: 0.9, opacity: 0.5, duration: 0.3 }, '<');
        }
        self.loops.push(t);
        self.later(rnd(6, 14), idle);
      };
      this.later(rnd(3, 7), idle);
    },
    sleep: function () {
      var q = this.parts;
      this.keep(gsap.to(q.root, { scaleY: 1.03, scaleX: 0.985, y: 1.5, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
      this.keep(gsap.to(q.tilt, { rotation: -9, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
      q.zs.forEach(function (z, i) {
        this.keep(gsap.fromTo(z, { opacity: 0, y: 10 }, { keyframes: [{ opacity: 1, y: 0, duration: 0.6 }, { opacity: 0, y: -18, duration: 1.6, ease: 'sine.out' }], repeat: -1, repeatDelay: 1.2, delay: i * 0.75 }));
      }, this);
    },
    check: function (f) {
      var q = this.parts;
      var self = this;
      blinkLoop(this, f);
      this.keep(gsap.fromTo(q.sniff, { opacity: 0.3, x: 0 }, { opacity: 1, x: 3, duration: 0.25, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
      var look = function () {
        var dir = Math.random() < 0.5 ? -1 : 1;
        var t = gsap.timeline();
        t.to(q.muzzle, { scale: 1.05, duration: 0.06, yoyo: true, repeat: 5, ease: 'sine.inOut' })
          .to([q.lookL, q.lookR], { x: 6 * dir, y: -2, duration: 0.18, ease: 'power2.out' })
          .to(q.tilt, { rotation: 8 * dir, duration: 0.4, ease: 'power2.inOut' }, '<')
          .to(dir < 0 ? q.earL : q.earR, { rotation: 12 * dir, duration: 0.08, yoyo: true, repeat: 1 }, '<0.1')
          .to([q.lookL, q.lookR], { x: -6 * dir, duration: 0.22, ease: 'power2.inOut' }, '+=0.6')
          .to(q.tilt, { rotation: -8 * dir, duration: 0.5, ease: 'power2.inOut' }, '<')
          .to([q.lookL, q.lookR], { x: 5, y: -2, duration: 0.2 }, '+=0.6')
          .to(q.tilt, { rotation: f.tilt, duration: 0.4, ease: 'power2.inOut' }, '<');
        self.loops.push(t);
        self.later(t.duration() + rnd(0.3, 1.2), look);
      };
      look();
    },
    alert: function (f) {
      var q = this.parts;
      var self = this;
      blinkLoop(this, f);
      breathe(this, 0.02, 0.9);
      var again = function () {
        var t = gsap.timeline();
        barkOnce(t, q, 0);
        barkOnce(t, q, 0.35);
        self.loops.push(t);
        self.later(rnd(4, 7), again);
      };
      this.later(rnd(3.5, 5.5), again);
    },
    merge: function (f) {
      var q = this.parts;
      blinkLoop(this, f);
      // Tug left / right: the rope ends jerk, the knot cinches tight.
      var t = gsap.timeline({ repeat: -1, repeatDelay: 0.25 });
      t.to(q.tilt, { rotation: -6, duration: 0.18, ease: 'power2.inOut' })
        .to(q.ropeA, { x: -3, duration: 0.18 }, '<')
        .to(q.knot, { scaleX: 0.86, scaleY: 1.1, duration: 0.12 }, '<0.06')
        .to(q.tilt, { rotation: 6, duration: 0.22, ease: 'power2.inOut' })
        .to(q.ropeB, { x: 3, duration: 0.22 }, '<')
        .to(q.knot, { scaleX: 1.1, scaleY: 0.9, duration: 0.12 }, '<0.06')
        .to(q.tilt, { rotation: 0, duration: 0.2, ease: 'power2.out' })
        .to([q.ropeA, q.ropeB], { x: 0, duration: 0.2 }, '<')
        .to(q.knot, { scaleX: 1, scaleY: 1, duration: 0.35, ease: 'elastic.out(1,0.35)' }, '<');
      this.keep(t);
    },
    success: function () {
      var q = this.parts;
      this.keep(gsap.to(q.root, { y: -5, scaleY: 1.02, duration: 0.32, ease: 'sine.inOut', yoyo: true, repeat: -1, repeatDelay: 0.15 }));
      this.keep(gsap.to(q.blush, { scale: 1.4, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    },
    conflict: function (f) {
      var q = this.parts;
      blinkLoop(this, f);
      this.keep(gsap.to(q.quest, { y: -5, rotation: 8, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
      this.keep(gsap.to(q.tilt, { rotation: f.tilt + 4, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    },
    fail: function (f) {
      var q = this.parts;
      blinkLoop(this, f);
      breathe(this, 0.012, 2.6);
      // A tear rolls down now and then.
      this.keep(gsap.fromTo(q.tear, { y: -6, opacity: 0 }, { keyframes: [{ y: 0, opacity: 1, duration: 0.4 }, { y: 28, opacity: 0, duration: 1.1, ease: 'power2.in' }], repeat: -1, repeatDelay: 1.6 }));
    },
    pass: function (f) {
      blinkLoop(this, f);
      this.keep(gsap.to(this.parts.root, { y: -3, duration: 0.45, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    },
    welcome: function (f) {
      LOOPS.sit.call(this, f);
    },
    love: function () {
      var q = this.parts;
      this.keep(gsap.to([q.heartL, q.heartR], { scale: 1.15, duration: 0.25, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
      this.keep(gsap.to(q.tilt, { rotation: -6, duration: 0.3, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
      q.hearts.forEach(function (h, i) {
        this.keep(gsap.fromTo(h, { x: 140 + i * 14, y: 40, opacity: 0, scale: 0.4 }, { keyframes: [{ opacity: 1, scale: 1, y: 26, duration: 0.3 }, { opacity: 0, y: -10, x: '+=8', duration: 1, ease: 'sine.out' }], repeat: -1, delay: i * 0.35, repeatDelay: 0.3 }));
      }, this);
    }
  };

  // ---------- public API ----------
  function controller(svg) {
    if (!svg) return null;
    if (!svg.__pal) {
      svg.__pal = new Pal(svg);
      svg.__pal.play(svg.getAttribute('data-pose') || 'sit');
    }
    return svg.__pal;
  }

  function setPose(svg, pose) {
    var c = controller(svg);
    if (svg) svg.classList.remove('enter');
    if (c) c.play(pose);
  }

  function mountAll(root) {
    (root || document).querySelectorAll('svg.pug').forEach(function (s) { controller(s); });
  }

  // Hidden panel or tab: stop the clock so idle loops cost nothing.
  if (gsap && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) gsap.globalTimeline.pause();
      else gsap.globalTimeline.resume();
    });
  }

  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        r.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches('svg.pug')) controller(n);
          else if (n.querySelectorAll) mountAll(n);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  /** A burst of confetti pieces inside `host` (position: relative). */
  function confetti(host, count) {
    if (!host || reduceMQ.matches) return;
    var colors = ['#1f9e89', '#ff7a59', '#f2bd4b', '#7cc8ff', '#b28dff', '#4fd08a'];
    var layer = document.createElement('div');
    layer.className = 'confetti';
    for (var i = 0; i < (count || 36); i++) {
      var p = document.createElement('i');
      var angle = Math.random() * Math.PI * 2;
      var dist = 70 + Math.random() * 140;
      p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle) * dist * 0.8 + 60 + 'px');
      p.style.setProperty('--rot', Math.round(Math.random() * 720 - 360) + 'deg');
      p.style.setProperty('--delay', Math.round(Math.random() * 120) + 'ms');
      p.style.setProperty('--dur', Math.round(900 + Math.random() * 500) + 'ms');
      p.style.background = colors[i % colors.length];
      layer.appendChild(p);
    }
    host.appendChild(layer);
    setTimeout(function () { layer.remove(); }, 1800);
  }

  window.PushPalIconHead = iconSvg;
  window.PushPalMascot = { svg: mascotSvg, setPose: setPose, confetti: confetti, mount: mountAll, poses: Object.keys(FACES), colors: K };
})();
