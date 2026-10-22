// "Pal", the PushPal mascot: a round teal buddy whose antenna is a git commit node.
// Inline SVG so every part can be animated with CSS transforms (see base.css).
(function () {
  'use strict';

  /** @param {{pose?: string, size?: number, label?: string, enter?: boolean}} [o] */
  function mascotSvg(o) {
    o = o || {};
    var size = o.size || 96;
    var pose = o.pose || 'idle';
    var label = o.label || 'PushPal';
    return (
      '<svg class="mascot pose-' + pose + (o.enter ? ' enter' : '') + '" viewBox="0 0 120 132" width="' + size + '" height="' + Math.round(size * 1.1) + '" role="img" aria-label="' + label + '">' +
      '<ellipse cx="60" cy="125" rx="30" ry="4.5" fill="#000" opacity=".12"/>' +
      '<g class="m-whole m-part">' +
        // antenna = commit node
        '<g class="m-node m-part">' +
          '<path d="M60 31 V16" stroke="var(--pp-body-shade)" stroke-width="3.2" stroke-linecap="round"/>' +
          '<circle cx="60" cy="12" r="6.5" fill="var(--pp-node)"/>' +
          '<circle cx="58" cy="10" r="2" fill="#fff" opacity=".7"/>' +
        '</g>' +
        // feet
        '<ellipse cx="46" cy="115" rx="10" ry="5.5" fill="var(--pp-body-shade)"/>' +
        '<ellipse cx="74" cy="115" rx="10" ry="5.5" fill="var(--pp-body-shade)"/>' +
        // arms (behind the body so they read as little nubs at rest)
        '<g class="m-arm-l m-part"><rect x="14" y="64" width="12" height="28" rx="6" fill="var(--pp-body-shade)" transform="rotate(14 20 66)"/></g>' +
        '<g class="m-arm-r m-part"><rect x="94" y="64" width="12" height="28" rx="6" fill="var(--pp-body-shade)" transform="rotate(-14 100 66)"/></g>' +
        // body
        '<path d="M60 28C87 28 99 49 99 75C99 101 84 116 60 116C36 116 21 101 21 75C21 49 33 28 60 28Z" fill="var(--pp-body)"/>' +
        '<path d="M36 46C42 36 52 32 60 32" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".35"/>' +
        '<ellipse cx="60" cy="92" rx="23" ry="17" fill="var(--pp-belly)" opacity=".9"/>' +
        // face
        '<g class="m-eyes m-part">' +
          '<g class="m-eyes-open">' +
            '<ellipse cx="47" cy="64" rx="5.2" ry="6.8" fill="var(--pp-ink)"/>' +
            '<ellipse cx="73" cy="64" rx="5.2" ry="6.8" fill="var(--pp-ink)"/>' +
            '<circle cx="48.8" cy="61.4" r="1.9" fill="#fff"/>' +
            '<circle cx="74.8" cy="61.4" r="1.9" fill="#fff"/>' +
          '</g>' +
          '<g class="m-eyes-happy" fill="none" stroke="var(--pp-ink)" stroke-width="3.2" stroke-linecap="round">' +
            '<path d="M41.5 66Q47 58.5 52.5 66"/><path d="M67.5 66Q73 58.5 78.5 66"/>' +
          '</g>' +
        '</g>' +
        '<ellipse cx="38.5" cy="75" rx="5.5" ry="3.3" fill="var(--pp-cheek)" opacity=".75"/>' +
        '<ellipse cx="81.5" cy="75" rx="5.5" ry="3.3" fill="var(--pp-cheek)" opacity=".75"/>' +
        '<path d="M54 75.5Q60 81.5 66 75.5" stroke="var(--pp-ink)" stroke-width="2.8" stroke-linecap="round" fill="none"/>' +
        // sweat drop (worry)
        '<path class="m-sweat m-part" d="M93 44C93 44 88 51 88 54A5 5 0 0 0 98 54C98 51 93 44 93 44Z" fill="#7cc8ff"/>' +
      '</g>' +
      '</svg>'
    );
  }

  /** Switch pose on an existing mascot without re-rendering it. */
  function setPose(svg, pose) {
    if (!svg) return;
    var cls = svg.getAttribute('class') || '';
    var next = cls.replace(/\bpose-[a-z]+\b/, 'pose-' + pose).replace(/\benter\b/, '').trim();
    if (next !== cls) svg.setAttribute('class', next);
  }

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
