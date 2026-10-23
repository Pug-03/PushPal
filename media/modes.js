// Mode cards and number formatting, shared by the setup wizard and the settings page.
(function () {
  'use strict';
  var I = window.PushPugIcon;
  var ICONS = { fast: 'zap', balanced: 'scale', batterySaver: 'battery', custom: 'sliders' };
  var ORDER = ['fast', 'balanced', 'batterySaver', 'custom'];

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** s(key, ...args) is the page's translate function. */
  function fmtSeconds(s, n) {
    n = Math.round(n);
    if (n < 60) return s('unit.s', n);
    if (n >= 3600 && n % 3600 === 0) return s('unit.h', n / 3600);
    var m = Math.floor(n / 60);
    return n % 60 ? s('unit.minS', m, n % 60) : s('unit.min', m);
  }

  function fmtBytes(s, b) {
    if (b >= 1000 * 1000) return s('unit.mb', (b / 1e6).toLocaleString(undefined, { maximumFractionDigits: 1 }));
    return s('unit.kb', Math.round(b / 1000).toLocaleString());
  }

  function estimateLine(s, est) {
    return s('est.line', est.checksPerHour.toLocaleString(), fmtBytes(s, est.bytesPerHour));
  }

  function card(s, model, mode) {
    var on = model.mode === mode;
    var preset = model.presets[mode];
    var every = preset ? s('mode.every', fmtSeconds(s, preset.checkSeconds)) : on ? s('mode.every', fmtSeconds(s, model.config.checkSeconds)) : s('mode.customEvery');
    var est = preset ? preset.estimate : on ? model.estimates.check : null;
    return (
      '<button class="mode-card' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" data-mode="' + mode + '">' +
        '<span class="mode-ic">' + I(ICONS[mode]) + '</span>' +
        '<span class="mode-name">' + esc(s('mode.' + mode)) + (mode === 'balanced' ? '<span class="mode-badge">' + esc(s('mode.default')) + '</span>' : '') + '</span>' +
        '<span class="mode-every">' + esc(every) + '</span>' +
        '<span class="mode-for">' + esc(s('mode.' + mode + '.for')) + '</span>' +
        '<span class="mode-est">' + (est ? esc(estimateLine(s, est)) : '&nbsp;') + '</span>' +
        '<span class="opt-check">' + I('check') + '</span>' +
      '</button>'
    );
  }

  function cards(s, model) {
    return '<div class="mode-grid" role="radiogroup">' + ORDER.map(function (m) { return card(s, model, m); }).join('') + '</div>';
  }

  /** Flip the selection locally (instant feedback) and play the pick animation. */
  function pick(btn) {
    var grid = btn.closest('.mode-grid');
    grid.querySelectorAll('.mode-card').forEach(function (b) {
      var on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
      b.classList.remove('picked');
    });
    void btn.offsetWidth;
    btn.classList.add('picked');
  }

  window.PushPugModes = { cards: cards, pick: pick, fmtSeconds: fmtSeconds, fmtBytes: fmtBytes, estimateLine: estimateLine, esc: esc };
})();
