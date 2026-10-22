// "Pal", the PushPal mascot: a round teal face whose brows, eyes, mouth and cheeks
// change with its mood. Inline SVG so every part can be animated with CSS (see base.css).
// Poke it: it squishes, giggles, and gets dizzy if you poke too fast.
(function () {
  'use strict';

  var uid = 0;

  // Each pose picks one variant per facial feature; CSS shows the matching group.
  var FACES = {
    idle: { eyes: 'open', brows: 'calm', mouth: 'smile' },
    wave: { eyes: 'open', brows: 'up', mouth: 'grin' },
    point: { eyes: 'open', brows: 'up', mouth: 'smile' },
    cheer: { eyes: 'happy', brows: 'up', mouth: 'grin' },
    chill: { eyes: 'happy', brows: 'calm', mouth: 'smile' },
    worry: { eyes: 'open', brows: 'worry', mouth: 'wobble' },
    busy: { eyes: 'open', brows: 'focus', mouth: 'flat' },
  };
  var POKES = [
    { eyes: 'happy', brows: 'up', mouth: 'grin' },
    { eyes: 'squeeze', brows: 'up', mouth: 'o' },
    { eyes: 'open', brows: 'up', mouth: 'o' },
    { eyes: 'squeeze', brows: 'calm', mouth: 'grin' },
  ];
  var DIZZY = { eyes: 'dizzy', brows: 'worry', mouth: 'wobble' };

  function faceAttrs(f) {
    return ' data-eyes="' + f.eyes + '" data-brows="' + f.brows + '" data-mouth="' + f.mouth + '"';
  }

  function applyFace(svg, f) {
    svg.setAttribute('data-eyes', f.eyes);
    svg.setAttribute('data-brows', f.brows);
    svg.setAttribute('data-mouth', f.mouth);
  }

  /** @param {{pose?: string, size?: number, label?: string, enter?: boolean}} [o] */
  function mascotSvg(o) {
    o = o || {};
    var size = o.size || 96;
    var pose = FACES[o.pose] ? o.pose : 'idle';
    var label = o.label || 'PushPal';
    var u = 'pp' + (++uid) + '-';
    var line = 'var(--pp-line)';
    var ink = 'var(--pp-ink)';
    var eye = function (cx) {
      return '<ellipse cx="' + cx + '" cy="70" rx="6" ry="7.6" fill="' + ink + '"/>' +
        '<circle cx="' + (cx + 2.2) + '" cy="66.8" r="2.5" fill="#fff"/>' +
        '<circle cx="' + (cx - 2) + '" cy="73.4" r="1.1" fill="#fff" opacity=".8"/>';
    };
    var spiral = function (cx) {
      return '<path d="M' + cx + ' 70m-1.5 0a1.5 1.5 0 1 1 3 0a3 3 0 1 1-6 0a4.5 4.5 0 1 1 9 0a6 6 0 1 1-12 0"/>';
    };
    return (
      '<svg class="mascot pose-' + pose + (o.enter ? ' enter' : '') + '"' + faceAttrs(FACES[pose]) +
        ' viewBox="0 0 120 132" width="' + size + '" height="' + Math.round(size * 1.1) + '" role="img" aria-label="' + label + '">' +
      '<defs>' +
        '<radialGradient id="' + u + 'face" cx="36%" cy="28%" r="80%"><stop offset="0" stop-color="#8AF0DE"/><stop offset=".5" stop-color="#3CC6AF"/><stop offset="1" stop-color="#1D9A86"/></radialGradient>' +
        '<radialGradient id="' + u + 'cheek"><stop offset="0" stop-color="#FF8F86" stop-opacity=".95"/><stop offset="1" stop-color="#FF8F86" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      '<ellipse class="m-shadow m-part" cx="60" cy="126" rx="32" ry="4.5" fill="#0B1F1C" opacity=".14"/>' +
      '<g class="m-whole m-part"><g class="m-poke m-part">' +
        // face
        '<circle cx="60" cy="72" r="50" fill="url(#' + u + 'face)" stroke="' + line + '" stroke-width="2.2"/>' +
        '<path d="M28 50C33 38 43 31 54 29" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".5"/>' +
        '<circle cx="25" cy="60" r="2.4" fill="#fff" opacity=".45"/>' +
        // cheeks
        '<g class="m-cheeks m-part">' +
          '<ellipse cx="32" cy="86" rx="9" ry="6" fill="url(#' + u + 'cheek)"/>' +
          '<ellipse cx="88" cy="86" rx="9" ry="6" fill="url(#' + u + 'cheek)"/>' +
        '</g>' +
        // brows
        '<g class="m-brows m-part" fill="none" stroke="' + ink + '" stroke-width="3.2" stroke-linecap="round">' +
          '<g class="m-v m-brows-calm"><path d="M37 55Q43 51.5 49 54"/><path d="M71 54Q77 51.5 83 55"/></g>' +
          '<g class="m-v m-brows-up"><path d="M36 51Q42 46 49 49"/><path d="M71 49Q78 46 84 51"/></g>' +
          '<g class="m-v m-brows-worry"><path d="M37 55Q43 53 49 49"/><path d="M71 49Q77 53 83 55"/></g>' +
          '<g class="m-v m-brows-focus"><path d="M37 53Q43 52.5 49 55"/><path d="M71 55Q77 52.5 83 53"/></g>' +
        '</g>' +
        // eyes
        '<g class="m-eyes m-part">' +
          '<g class="m-v m-eyes-open"><g class="m-blink m-part">' + eye(44) + eye(76) + '</g></g>' +
          '<g class="m-v m-eyes-happy" fill="none" stroke="' + ink + '" stroke-width="3.6" stroke-linecap="round">' +
            '<path d="M37.5 72Q44 63 50.5 72"/><path d="M69.5 72Q76 63 82.5 72"/>' +
          '</g>' +
          '<g class="m-v m-eyes-squeeze" fill="none" stroke="' + ink + '" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M39 64L49 70L39 76"/><path d="M81 64L71 70L81 76"/>' +
          '</g>' +
          '<g class="m-v m-eyes-dizzy" fill="none" stroke="' + ink + '" stroke-width="2.4" stroke-linecap="round">' +
            spiral(44) + spiral(76) +
          '</g>' +
        '</g>' +
        // mouth
        '<g class="m-mouth m-part">' +
          '<path class="m-v m-mouth-smile" d="M52 87Q60 94 68 87" fill="none" stroke="' + ink + '" stroke-width="3.2" stroke-linecap="round"/>' +
          '<g class="m-v m-mouth-grin">' +
            '<path d="M49 85Q60 87 71 85Q69 99 60 99Q51 99 49 85Z" fill="' + ink + '" stroke="' + ink + '" stroke-width="1.6" stroke-linejoin="round"/>' +
            '<path d="M54 95.5Q60 92 66 95.5Q63 98.2 60 98.2Q57 98.2 54 95.5Z" fill="#FF8F86"/>' +
          '</g>' +
          '<ellipse class="m-v m-mouth-o" cx="60" cy="91" rx="5" ry="6" fill="' + ink + '"/>' +
          '<path class="m-v m-mouth-wobble" d="M50 92Q53.5 88 57 91.5T64 91.5T71 90" fill="none" stroke="' + ink + '" stroke-width="3" stroke-linecap="round"/>' +
          '<path class="m-v m-mouth-flat" d="M53 90Q60 92 67 90" fill="none" stroke="' + ink + '" stroke-width="3.2" stroke-linecap="round"/>' +
        '</g>' +
        // sweat drop (worry)
        '<path class="m-sweat m-part" d="M98 36C98 36 92.5 43.5 92.5 47A5.5 5.5 0 0 0 103.5 47C103.5 43.5 98 36 98 36Z" fill="#8FD3FF" stroke="' + line + '" stroke-width="1.4"/>' +
      '</g></g>' +
      '</svg>'
    );
  }

  /** Switch pose on an existing mascot without re-rendering it. */
  function setPose(svg, pose) {
    if (!svg) return;
    if (!FACES[pose]) pose = 'idle';
    var cls = svg.getAttribute('class') || '';
    var next = cls.replace(/\bpose-[a-z]+\b/, 'pose-' + pose).replace(/\benter\b/, '').trim();
    if (next !== cls) svg.setAttribute('class', next);
    if (!svg._ppPoke) applyFace(svg, FACES[pose]);
  }

  function poseOf(svg) {
    var m = /\bpose-([a-z]+)\b/.exec(svg.getAttribute('class') || '');
    return m && FACES[m[1]] ? m[1] : 'idle';
  }

  function restartClass(svg, name) {
    svg.classList.remove(name);
    void svg.getBoundingClientRect();
    svg.classList.add(name);
  }

  // Poking: press squishes, release boings with a random reaction; rapid pokes make it dizzy.
  function onPress(e) {
    var svg = e.target.closest && e.target.closest('svg.mascot');
    if (!svg) return;
    svg.classList.add('squish');
    var now = Date.now();
    var hits = (svg._ppHits || []).filter(function (t) { return now - t < 2500; });
    hits.push(now);
    svg._ppHits = hits;
    var dizzy = hits.length >= 6;
    if (dizzy) svg._ppHits = [];
    var face = dizzy ? DIZZY : POKES[Math.floor(Math.random() * POKES.length)];

    function release() {
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      svg.classList.remove('squish', 'poked', 'dizzy');
      restartClass(svg, dizzy ? 'dizzy' : 'poked');
      svg.classList.add('blush');
      applyFace(svg, face);
      clearTimeout(svg._ppPoke);
      svg._ppPoke = setTimeout(function () {
        svg._ppPoke = null;
        svg.classList.remove('poked', 'dizzy', 'blush');
        applyFace(svg, FACES[poseOf(svg)]);
      }, dizzy ? 1800 : 900);
    }
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
  }
  document.addEventListener('pointerdown', onPress);

  /** A burst of confetti pieces inside `host` (position: relative). */
  function confetti(host, count) {
    if (!host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['#3cc4ae', '#ff7a59', '#f2bd4b', '#7cc8ff', '#b28dff', '#4fd08a'];
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

  window.PushPalMascot = { svg: mascotSvg, setPose: setPose, confetti: confetti };
})();
