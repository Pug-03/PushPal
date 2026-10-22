// PushPal setup wizard. Plain JS, no framework.
(function () {
  'use strict';
  var vscode = acquireVsCodeApi();
  var init = JSON.parse(document.getElementById('pp-init').textContent);
  var M = window.PushPalMascot;
  var I = window.PushPalIcon;

  var saved = vscode.getState() || {};
  var state = {
    step: saved.step || 0,
    lang: init.lang,
    theme: init.theme,
    notify: init.notify,
    backend: init.backend,
    testSent: false,
    finished: null
  };
  var STEPS = ['welcome', 'lang', 'theme', 'notify', 'frequency', 'test', 'done'];
  var Modes = window.PushPalModes;
  state.freq = init.freq;
  var app = document.getElementById('app');

  function s(key) {
    var args = Array.prototype.slice.call(arguments, 1);
    var t = (init.strings[state.lang] && init.strings[state.lang][key]) || init.strings.en[key] || key;
    return t.replace(/\{(\d+)\}/g, function (m, i) { return args[i] !== undefined ? args[i] : m; });
  }
  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function post(msg) { vscode.postMessage(msg); }

  // ---------- Steps ----------
  function stepWelcome() {
    return (
      '<div class="wz-hero">' +
        '<div class="wz-mascot" id="welcomeMascot">' + M.svg({ pose: 'wave', size: 150, enter: true }) + '</div>' +
        '<h1 class="wz-title">' + esc(s('welcome.title')) + '</h1>' +
        '<p class="wz-lead">' + esc(s('welcome.body')) + '</p>' +
        '<ul class="wz-features">' +
          feature('bell', s('welcome.f1'), 1) + feature('pull', s('welcome.f2'), 2) + feature('shield', s('welcome.f3'), 3) +
        '</ul>' +
      '</div>'
    );
  }
  function feature(icon, text, i) {
    return '<li class="wz-feature d' + i + '"><span class="wz-feature-ic">' + I(icon) + '</span><span>' + esc(text) + '</span></li>';
  }

  function stepLang() {
    return (
      header(s('lang.title'), s('lang.body')) +
      '<div class="wz-grid two" role="radiogroup">' +
        option('lang', 'th', '<span class="glyph">ก</span>', s('lang.th'), s('lang.thHint'), state.lang === 'th') +
        option('lang', 'en', '<span class="glyph">A</span>', s('lang.en'), s('lang.enHint'), state.lang === 'en') +
      '</div>'
    );
  }

  function stepTheme() {
    return (
      header(s('theme.title'), s('theme.body')) +
      '<div class="wz-grid three" role="radiogroup">' +
        option('theme', 'light', I('sun'), s('theme.light'), '', state.theme === 'light') +
        option('theme', 'dark', I('moon'), s('theme.dark'), '', state.theme === 'dark') +
        option('theme', 'system', I('auto'), s('theme.system'), s('theme.systemHint'), state.theme === 'system') +
      '</div>' +
      '<div class="wz-preview-label">' + esc(s('theme.preview')) + '</div>' +
      '<div class="wz-preview theme-' + state.theme + '" id="preview">' +
        '<div class="pv-head">' +
          '<div class="pv-mascot">' + M.svg({ pose: 'point', size: 54 }) + '</div>' +
          '<div class="pv-text"><div class="pv-title">' + esc(s('theme.sampleTitle')) + '</div>' +
          '<div class="pv-sub"><span class="chip chip-new"><i class="dot"></i>' + esc(s('team.new')) + '</span></div></div>' +
          '<button class="btn btn-primary pv-btn" tabindex="-1">' + I('pull') + esc(s('team.pull')) + '</button>' +
        '</div>' +
        '<div class="pv-row"><span class="avatar" data-hue="16">AL</span><div><div class="pv-commit">' + esc(s('theme.sampleCommit')) + '</div><div class="pv-meta">Alice · 2m · <span class="mono">a1b2c3d</span></div></div></div>' +
      '</div>'
    );
  }

  function stepNotify() {
    var bgHint = init.platform === 'darwin' ? s('notify.backgroundMac') : init.platform === 'win32' ? s('notify.backgroundWin') : s('notify.backgroundNo');
    return (
      header(s('notify.title'), s('notify.body')) +
      '<div class="wz-list">' +
        toggle('notifyInVSCode', I('code'), s('notify.vscode'), s('notify.vscodeHint'), state.notify.notifyInVSCode, false) +
        toggle('notifyDesktop', I('screen'), s('notify.desktop'), s('notify.desktopHint'), state.notify.notifyDesktop, false) +
        toggle('notifyBackground', I('clock'), s('notify.background'), s('notify.backgroundHint') + ' ' + bgHint, state.notify.notifyBackground && init.bgSupported, !init.bgSupported) +
      '</div>'
    );
  }

  function stepFrequency() {
    var f = state.freq;
    return (
      header(s('freq.title'), s('freq.body')) +
      '<div id="freqCards">' + Modes.cards(s, f) + '</div>' +
      '<p class="mode-note">' + esc(s('est.note', Math.max(1, f.repoCount))) + '</p>' +
      '<div class="wz-more"><button class="btn btn-ghost" data-act="openSettings">' + I('sliders') + esc(s('freq.more')) + '</button></div>'
    );
  }

  function stepTest() {
    var how;
    if (init.platform === 'darwin') {
      how = ['mac1', 'mac2', 'mac3'];
    } else if (init.platform === 'win32') {
      how = ['win1', 'win2', 'win3'];
    } else {
      how = ['linux1', 'linux2'];
    }
    var alerterBox = '';
    if (init.platform === 'darwin') {
      alerterBox = state.backend === 'alerter'
        ? '<div class="wz-note ok">' + I('check') + '<span>' + esc(s('test.alerterOk')) + '</span></div>'
        : '<div class="wz-note">' + I('bell') + '<span>' + esc(s('test.macNoAlerter')) + '</span><button class="btn" data-act="installAlerter">' + esc(s('test.installAlerter')) + '</button></div>';
    }
    var result = '';
    if (state.testSent) {
      result = '<div class="wz-sent" role="status">' + I('check') + '<span>' + esc(state.backend === 'none' ? s('test.vscodeOnly') : s('test.sent')) + '</span></div>';
    }
    return (
      header(s('test.title'), s('test.body')) +
      '<div class="wz-test">' +
        '<div class="wz-test-visual"><div class="wz-bell' + (state.testSent ? ' ring' : '') + '">' + I('bell') + '</div></div>' +
        '<button class="btn btn-primary btn-lg" data-act="test">' + I('bell') + esc(s('test.send')) + '</button>' +
        result +
      '</div>' +
      alerterBox +
      '<details class="wz-howto"' + (state.testSent ? ' open' : '') + '><summary>' + I('help') + esc(s('test.howTo')) + '</summary><ol>' +
        how.map(function (k) { return '<li>' + esc(s('test.' + k)) + '</li>'; }).join('') +
      '</ol></details>'
    );
  }

  function stepDone() {
    var bg = '';
    if (state.finished === 'enabled') bg = '<div class="wz-note ok">' + I('check') + '<span>' + esc(s('done.bgOn')) + '</span></div>';
    else if (state.finished && state.finished.indexOf('failed:') === 0) bg = '<div class="wz-note bad">' + I('warn') + '<span>' + esc(s('done.bgFailed', state.finished.slice(7))) + '</span></div>';
    return (
      '<div class="wz-hero done">' +
        '<div class="wz-mascot" id="doneMascot">' + M.svg({ pose: 'cheer', size: 130 }) + '</div>' +
        '<h1 class="wz-title">' + esc(s('done.title')) + '</h1>' +
        '<p class="wz-lead">' + esc(s('done.body')) + '</p>' +
      '</div>' +
      '<ol class="wz-tips">' +
        tip(1, s('done.tip1')) + tip(2, s('done.tip2')) + tip(3, s('done.tip3')) +
      '</ol>' + bg
    );
  }
  function tip(n, text) {
    return '<li class="d' + n + '"><span class="wz-num">' + n + '</span><span>' + esc(text) + '</span></li>';
  }

  function header(title, body) {
    return '<h2 class="wz-h2">' + esc(title) + '</h2><p class="wz-sub">' + esc(body) + '</p>';
  }
  function option(group, value, icon, label, hint, selected) {
    return (
      '<button class="opt' + (selected ? ' is-on' : '') + '" role="radio" aria-checked="' + selected + '" data-group="' + group + '" data-value="' + value + '">' +
        '<span class="opt-ic">' + icon + '</span>' +
        '<span class="opt-label">' + esc(label) + '</span>' +
        (hint ? '<span class="opt-hint">' + esc(hint) + '</span>' : '') +
        '<span class="opt-check">' + I('check') + '</span>' +
      '</button>'
    );
  }
  function toggle(key, icon, label, hint, on, disabled) {
    return (
      '<button class="tg' + (on ? ' is-on' : '') + '" role="switch" aria-checked="' + !!on + '" data-key="' + key + '"' + (disabled ? ' disabled' : '') + '>' +
        '<span class="tg-ic">' + icon + '</span>' +
        '<span class="tg-text"><span class="tg-label">' + esc(label) + '</span><span class="tg-hint">' + esc(hint) + '</span></span>' +
        '<span class="tg-switch"><i></i></span>' +
      '</button>'
    );
  }

  var renderers = [stepWelcome, stepLang, stepTheme, stepNotify, stepFrequency, stepTest, stepDone];

  // ---------- Shell ----------
  function shell() {
    app.innerHTML =
      '<div class="wz">' +
        '<header class="wz-top">' +
          '<div class="wz-brand">' + M.svg({ pose: 'idle', size: 26 }) + '<span>PushPal</span></div>' +
          '<div class="wz-progress" aria-hidden="true"><div class="wz-bar"><i id="bar"></i></div></div>' +
          '<div class="wz-steplabel" id="stepLabel"></div>' +
        '</header>' +
        '<main class="wz-stage" id="stage">' +
          STEPS.map(function (id, i) { return '<section class="wz-step" data-step="' + i + '" id="step-' + id + '" aria-hidden="true"></section>'; }).join('') +
        '</main>' +
        '<footer class="wz-foot">' +
          '<button class="btn btn-ghost" id="back">' + I('left') + '<span></span></button>' +
          '<div class="wz-spacer"></div>' +
          '<button class="btn btn-ghost" id="skip"><span></span></button>' +
          '<button class="btn btn-primary btn-lg" id="next"><span></span>' + I('right') + '</button>' +
        '</footer>' +
      '</div>';
    document.getElementById('back').addEventListener('click', function () { go(state.step - 1); });
    document.getElementById('skip').addEventListener('click', function () {
      if (state.step === 0) finish(); else go(state.step + 1);
    });
    document.getElementById('next').addEventListener('click', function () {
      if (state.step === STEPS.length - 1) return post({ type: 'close' });
      if (state.step === STEPS.length - 2) return finish();
      go(state.step + 1);
    });
    document.getElementById('stage').addEventListener('click', onStageClick);
  }

  function fillStep(i) {
    var el = document.querySelector('[data-step="' + i + '"]');
    el.innerHTML = '<div class="wz-step-inner">' + renderers[i]() + '</div>';
    el.querySelectorAll('.avatar[data-hue]').forEach(function (a) { a.style.setProperty('--hue', a.getAttribute('data-hue')); });
  }

  function fillAll() {
    document.documentElement.lang = state.lang;
    for (var i = 0; i < STEPS.length; i++) fillStep(i);
    updateChrome();
  }

  function updateChrome() {
    var n = STEPS.length;
    document.getElementById('bar').style.transform = 'scaleX(' + (state.step + 1) / n + ')';
    document.getElementById('stepLabel').textContent = s('step', state.step + 1, n);
    var back = document.getElementById('back');
    back.querySelector('span').textContent = s('back');
    back.hidden = state.step === 0 || state.step === n - 1;
    var skip = document.getElementById('skip');
    skip.querySelector('span').textContent = state.step === 0 ? s('skipAll') : s('skip');
    skip.hidden = state.step >= n - 2;
    var next = document.getElementById('next');
    next.querySelector('span').textContent = state.step === 0 ? s('start') : state.step === n - 1 ? s('finish') : s('next');
  }

  function go(target, instant) {
    if (target < 0 || target >= STEPS.length) return;
    var prev = state.step;
    var dir = target >= prev ? 1 : -1;
    state.step = target;
    vscode.setState({ step: target });
    document.querySelectorAll('.wz-step').forEach(function (el) {
      var i = Number(el.getAttribute('data-step'));
      el.classList.remove('is-active', 'from-left', 'from-right', 'to-left', 'to-right');
      el.setAttribute('aria-hidden', i === target ? 'false' : 'true');
      if (i === target) {
        if (!instant) {
          el.classList.add(dir > 0 ? 'from-right' : 'from-left');
          void el.offsetWidth; // restart the transition
        }
        el.classList.add('is-active');
        el.classList.remove('from-left', 'from-right');
      } else if (i === prev && !instant) {
        el.classList.add(dir > 0 ? 'to-left' : 'to-right');
      }
    });
    // Replay the step's entrance animations each time it's shown.
    if (STEPS[target] === 'welcome' || STEPS[target] === 'done') fillStep(target);
    if (STEPS[target] === 'done') {
      setTimeout(function () { M.confetti(document.getElementById('step-done'), 48); }, 180);
    }
    updateChrome();
    var focusTarget = document.querySelector('.wz-step.is-active .wz-title, .wz-step.is-active .wz-h2');
    if (focusTarget) { focusTarget.setAttribute('tabindex', '-1'); focusTarget.focus({ preventScroll: true }); }
  }

  function finish() {
    post({ type: 'finish' });
    go(STEPS.length - 1);
  }

  function onStageClick(e) {
    var card = e.target.closest('.mode-card');
    if (card) {
      var mode = card.getAttribute('data-mode');
      Modes.pick(card);
      state.freq.mode = mode;
      if (mode === 'custom') post({ type: 'openSettings' });
      post({ type: 'setMode', mode: mode });
      return;
    }
    var opt = e.target.closest('.opt');
    if (opt) {
      var group = opt.getAttribute('data-group');
      var value = opt.getAttribute('data-value');
      if (group === 'lang') {
        state.lang = value;
        post({ type: 'setLang', lang: value });
        fillAll();
      } else if (group === 'theme') {
        state.theme = value;
        post({ type: 'setTheme', theme: value });
        applyTheme(value);
        var preview = document.getElementById('preview');
        preview.className = 'wz-preview theme-' + value + ' swap';
        opt.parentNode.querySelectorAll('.opt').forEach(function (o) {
          var on = o === opt;
          o.classList.toggle('is-on', on);
          o.setAttribute('aria-checked', String(on));
        });
      }
      return;
    }
    var tg = e.target.closest('.tg');
    if (tg && !tg.disabled) {
      var key = tg.getAttribute('data-key');
      var on = !tg.classList.contains('is-on');
      state.notify[key] = on;
      tg.classList.toggle('is-on', on);
      tg.setAttribute('aria-checked', String(on));
      post({ type: 'setNotify', key: key, value: on });
      return;
    }
    var act = e.target.closest('[data-act]');
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'test') post({ type: 'test' });
      if (a === 'installAlerter') post({ type: 'installAlerter' });
      if (a === 'openSettings') post({ type: 'openSettings' });
    }
  }

  function applyTheme(theme) {
    var root = document.documentElement;
    root.className = root.className.replace(/\btheme-[a-z]+\b/, 'theme-' + theme);
  }

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (m.type === 'theme') {
      state.theme = m.theme;
      applyTheme(m.theme);
    } else if (m.type === 'testResult') {
      state.backend = m.backend;
      state.testSent = true;
      fillStep(STEPS.indexOf('test'));
    } else if (m.type === 'finished') {
      state.finished = m.background;
      fillStep(STEPS.indexOf('done'));
    } else if (m.type === 'freq') {
      // Keep the picked card's animation running; only refresh the text.
      state.freq = m.freq;
      var host = document.getElementById('freqCards');
      if (host) {
        host.querySelectorAll('.mode-card').forEach(function (b) {
          var fresh = document.createElement('div');
          fresh.innerHTML = Modes.cards(s, m.freq);
          var twin = fresh.querySelector('[data-mode="' + b.getAttribute('data-mode') + '"]');
          b.querySelector('.mode-every').textContent = twin.querySelector('.mode-every').textContent;
          b.querySelector('.mode-est').innerHTML = twin.querySelector('.mode-est').innerHTML;
          var on = m.freq.mode === b.getAttribute('data-mode');
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-checked', String(on));
        });
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'ArrowRight' && e.altKey) document.getElementById('next').click();
    if (e.key === 'ArrowLeft' && e.altKey && !document.getElementById('back').hidden) go(state.step - 1);
  });

  shell();
  fillAll();
  go(state.step, true);
})();
