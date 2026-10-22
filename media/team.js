// "ทีมของฉัน / My Team" sidebar. Plain JS; keeps DOM nodes alive between
// updates so new commits can slide in and the mascot can change pose smoothly.
(function () {
  'use strict';
  var vscode = acquireVsCodeApi();
  var init = JSON.parse(document.getElementById('pp-init').textContent);
  var M = window.PushPalMascot;
  var I = window.PushPalIcon;
  var S = init.strings;
  var lang = init.lang;
  var view = init.view;
  var app = document.getElementById('app');

  var seenShas = null; // shas already rendered (null = first render, no entrance animation)
  var celebratedAt = (vscode.getState() || {}).celebratedAt || 0;
  var successUntil = 0;
  var currentMode = '';
  var currentRoot = '';

  function s(key) {
    var args = Array.prototype.slice.call(arguments, 1);
    return (S[key] || key).replace(/\{(\d+)\}/g, function (m, i) { return args[i] !== undefined ? args[i] : m; });
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function post(m) { vscode.postMessage(m); }

  var rtf = (function () { try { return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }); } catch (e) { return null; } })();
  function ago(sec) {
    var d = Math.round(sec - Date.now() / 1000);
    var a = Math.abs(d);
    if (a < 45 || !rtf) return lang === 'th' ? 'เมื่อสักครู่' : 'just now';
    if (a < 3600) return rtf.format(Math.round(d / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(d / 3600), 'hour');
    if (a < 86400 * 30) return rtf.format(Math.round(d / 86400), 'day');
    return new Date(sec * 1000).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short' });
  }

  // Same person → same colour, always.
  function hue(key) {
    var h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  function initials(name) {
    var parts = String(name || '?').trim().split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 0) return '?';
    var first = Array.from(parts[0])[0] || '?';
    var second = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] : (Array.from(parts[0])[1] || '');
    // Thai: a single leading consonant reads better than two letters.
    if (/[฀-๿]/.test(first)) return first;
    return (first + second).toUpperCase();
  }
  function avatar(c) {
    return '<span class="avatar" data-hue="' + hue((c.email || c.author || '').toLowerCase()) + '" title="' + esc(c.author) + '">' + esc(initials(c.author)) + '</span>';
  }
  function applyHues(root) {
    root.querySelectorAll('[data-hue]').forEach(function (el) { el.style.setProperty('--hue', el.getAttribute('data-hue')); });
  }
  function uniqueAuthors(commits) {
    var seen = {}, out = [];
    commits.forEach(function (c) { var k = (c.email || c.author).toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(c); } });
    return out;
  }
  function basename(p) { return String(p).split('/').pop(); }
  function dirname(p) { var i = String(p).lastIndexOf('/'); return i > 0 ? p.slice(0, i) : ''; }

  // ---------- Mode ----------
  function repo() { return view.repos[view.selected] || view.repos[0]; }

  function modeOf(r) {
    if (!r) return 'empty';
    if (r.phase === 'pulling') return 'pulling';
    if (r.lastResult && r.lastResult.kind === 'ok' && r.lastResult.at > celebratedAt && Date.now() - r.lastResult.at < 8000) {
      celebratedAt = r.lastResult.at;
      vscode.setState({ celebratedAt: celebratedAt });
      successUntil = Date.now() + 3600; // long enough for the pug's jump-spin-land
      setTimeout(update, 2650);
      return 'success';
    }
    if (Date.now() < successUntil) return 'success';
    if (r.state === 'checking') return 'checking';
    if (r.state === 'conflict') return r.conflict && r.conflict.kind === 'merge' && r.conflict.files.length === 0 ? 'mergeReady' : 'conflict';
    if (r.state === 'behind') return 'behind';
    if (r.state === 'error') return 'error';
    if (r.state === 'noUpstream') return 'noUpstream';
    if (r.state === 'detached') return 'detached';
    return 'upToDate';
  }

  // Pug poses (media/mascot.js) for each hero state.
  var POSE = {
    empty: 'welcome', checking: 'check', pulling: 'merge', success: 'success', conflict: 'conflict', mergeReady: 'pass',
    behind: 'alert', error: 'fail', noUpstream: 'check', detached: 'conflict', upToDate: 'sleep'
  };
  /** Up to date, but GitHub Actions just finished: show how it went. */
  function poseFor(mode, r) {
    if (mode === 'upToDate' && r && r.ci) {
      if (r.ci.state === 'failure') return 'fail';
      if (r.ci.state === 'success') return 'pass';
      if (r.ci.state === 'running') return 'check';
    }
    return POSE[mode] || 'sit';
  }

  // ---------- Pieces ----------
  function mergeArt() {
    // Two branch lanes meet; commit dots travel along them (transform only).
    return (
      '<svg class="merge-art" viewBox="0 0 168 64" aria-hidden="true">' +
        '<path class="lane lane-a" d="M8 14 L84 32 L160 32"/>' +
        '<path class="lane lane-b" d="M8 50 L84 32"/>' +
        '<g class="flow flow-a"><circle r="4.5" class="dot dot-a" /></g>' +
        '<g class="flow flow-a f2"><circle r="4.5" class="dot dot-a" /></g>' +
        '<g class="flow flow-b"><circle r="4.5" class="dot dot-b" /></g>' +
        '<g class="flow flow-b f2"><circle r="4.5" class="dot dot-b" /></g>' +
        '<circle class="meet" cx="84" cy="32" r="7"/>' +
        '<circle class="end" cx="160" cy="32" r="5.5"/>' +
      '</svg>'
    );
  }
  function checkArt() {
    return (
      '<svg class="check-art" viewBox="0 0 64 64" aria-hidden="true">' +
        '<defs><clipPath id="ckclip"><rect class="ck-reveal" x="0" y="0" width="64" height="64"/></clipPath></defs>' +
        '<circle class="ck-ring" cx="32" cy="32" r="28"/>' +
        '<path class="ck-mark" clip-path="url(#ckclip)" d="M19 33.5 L28.5 43 L46 23"/>' +
      '</svg>'
    );
  }

  function heroHtml(mode, r) {
    var title = '', sub = '', actions = '', art = '';
    switch (mode) {
      case 'empty':
        title = s('team.noRepo.title'); sub = s('team.noRepo.body');
        actions = btn('primary', 'folder', s('team.openFolder'), 'cmd', 'openFolder') + btn('', 'cloud', s('team.clone'), 'cmd', 'clone');
        break;
      case 'checking':
        title = '…'; sub = '';
        break;
      case 'upToDate':
        title = s('team.upToDate'); sub = s('team.upToDateSub');
        break;
      case 'behind': {
        var who = uniqueAuthors(r.incoming).map(function (c) { return c.author; });
        title = r.behind === 1 ? s('team.behindOne', r.behind) : s('team.behindMany', r.behind);
        sub = who.length ? s('team.behindSub', who.join(', ')) : '';
        actions = btn('primary btn-lg btn-block', 'pull', s('team.pull'), 'pull');
        break;
      }
      case 'pulling':
        art = mergeArt();
        title = s('team.pulling'); sub = s('team.pullingSub');
        break;
      case 'success':
        art = checkArt();
        title = s('team.success'); sub = s('team.successSub', r.lastResult ? r.lastResult.pulled : 0);
        break;
      case 'conflict':
        title = s('team.conflict.' + (r.conflict ? r.conflict.kind : 'other'));
        sub = r.conflict && r.conflict.kind === 'autostash' ? s('team.conflict.autostashSub') : s('team.conflict.mergeSub');
        break;
      case 'mergeReady':
        title = s('team.conflict.ready'); sub = '';
        actions = btn('primary btn-lg btn-block', 'check', s('team.finishMerge'), 'finishMerge');
        break;
      case 'error':
        title = s('team.error.title'); sub = r.error ? r.error.text : '';
        actions = btn('', 'refresh', s('team.retry'), 'check');
        break;
      case 'noUpstream':
        title = s('team.noUpstream.title'); sub = s('team.noUpstream.body', r.branch || '');
        actions = btn('primary', 'cloud', s('team.publish'), 'cmd', 'publish');
        break;
      case 'detached':
        title = s('team.detached.title'); sub = s('team.detached.body');
        actions = btn('primary', 'branch', s('team.switchBranch'), 'cmd', 'switchBranch');
        break;
    }
    return (
      '<div class="hero-art">' +
        '<div class="hero-mascot" id="mascotHost"></div>' +
        (art ? '<div class="hero-extra">' + art + '</div>' : '') +
      '</div>' +
      '<div class="hero-text">' +
        '<h2 class="hero-title">' + esc(title) + '</h2>' +
        (sub ? '<p class="hero-sub">' + esc(sub) + '</p>' : '') +
      '</div>' +
      (actions ? '<div class="hero-actions">' + actions + '</div>' : '')
    );
  }

  function btn(kind, icon, label, act, arg) {
    return '<button class="btn ' + (kind ? kind.split(' ').map(function (k) { return k.indexOf('btn') === 0 ? k : 'btn-' + k; }).join(' ') : '') + '" data-act="' + act + '"' + (arg ? ' data-arg="' + esc(arg) + '"' : '') + '>' + I(icon) + '<span>' + esc(label) + '</span></button>';
  }

  function sameFileHtml(r) {
    if (!r || r.state !== 'behind' || !r.overlap.length) return '';
    var who = uniqueAuthors(r.incoming)[0];
    return (
      '<section class="alert-card warn" role="alert">' +
        '<div class="alert-head">' + I('warn') + '<strong>' + esc(s('team.sameFile')) + '</strong></div>' +
        '<p>' + esc(s('team.sameFileBody', who ? who.author : '')) + '</p>' +
        '<ul class="files">' + r.overlap.slice(0, 6).map(function (f) {
          return '<li><button class="file-link" data-act="openFile" data-arg="' + esc(f) + '">' + I('file') + '<span class="fname">' + esc(basename(f)) + '</span><span class="fdir">' + esc(dirname(f)) + '</span></button></li>';
        }).join('') + '</ul>' +
      '</section>'
    );
  }

  function conflictHtml(r, mode) {
    if (mode !== 'conflict' || !r.conflict) return '';
    var auto = r.conflict.kind === 'autostash';
    var files = r.conflict.files;
    return (
      '<section class="alert-card danger">' +
        '<div class="files-label">' + esc(s('team.conflict.files')) + ' · ' + files.length + '</div>' +
        '<ul class="cf-files">' + files.map(function (f) {
          return '<li><span class="cf-ic">' + I('file') + '</span><span class="cf-name"><span class="fname">' + esc(basename(f)) + '</span><span class="fdir">' + esc(dirname(f)) + '</span></span>' +
            '<button class="btn btn-sm" data-act="openFile" data-arg="' + esc(f) + '">' + esc(s('team.conflict.open')) + '</button></li>';
        }).join('') + '</ul>' +
        (files.length ? '<button class="btn btn-primary btn-block" data-act="mergeEditor" data-arg="' + esc(files[0]) + '">' + I('merge') + '<span>' + esc(s('team.conflict.mergeEditor')) + '</span></button>' : '') +
      '</section>' +
      '<details class="help card" open>' +
        '<summary>' + I('help') + '<span>' + esc(s('team.help.title')) + '</span></summary>' +
        '<dl>' +
          '<div><dt><span class="tag cur">' + esc(s('team.help.current')) + '</span></dt><dd>' + esc(s(auto ? 'team.help.autoCurrent' : 'team.help.mergeCurrent')) + '</dd></div>' +
          '<div><dt><span class="tag inc">' + esc(s('team.help.incoming')) + '</span></dt><dd>' + esc(s(auto ? 'team.help.autoIncoming' : 'team.help.mergeIncoming')) + '</dd></div>' +
          '<div><dt><span class="tag both">' + esc(s('team.help.bothLabel')) + '</span></dt><dd>' + esc(s('team.help.both')) + '</dd></div>' +
        '</dl>' +
        '<p class="help-tip">' + esc(s('team.help.tip')) + '</p>' +
      '</details>'
    );
  }

  function itemHtml(c) {
    return (
      '<li class="tl-item' + (c.isNew ? ' is-new' : '') + '" data-sha="' + esc(c.sha) + '">' +
        avatar(c) +
        '<div class="tl-body">' +
          '<div class="tl-subject">' + esc(c.subject) + '</div>' +
          '<div class="tl-meta"><span class="tl-author">' + esc(c.author) + '</span><span class="sep">·</span><time>' + esc(ago(c.time)) + '</time><span class="sep">·</span><span class="mono">' + esc(c.sha.slice(0, 7)) + '</span></div>' +
        '</div>' +
        (c.isNew ? '<span class="tl-new"><i class="pulse"></i>' + esc(s('team.new')) + '</span>' : '') +
      '</li>'
    );
  }

  function timelineHtml(r, mode) {
    if (!r || mode === 'empty' || mode === 'noUpstream' || mode === 'detached' || mode === 'checking') return '';
    var fresh = r.recent.filter(function (c) { return c.isNew; });
    var old = r.recent.filter(function (c) { return !c.isNew; });
    var html = '';
    if (fresh.length) html += '<h3 class="tl-title"><span class="live-dot"></span>' + esc(s('team.newSection')) + '</h3><ol class="tl">' + fresh.map(itemHtml).join('') + '</ol>';
    html += '<h3 class="tl-title">' + esc(s('team.recentSection', r.upstream || r.branch || '')) + '</h3>';
    html += old.length ? '<ol class="tl">' + old.map(itemHtml).join('') + '</ol>' : '<p class="tl-empty">' + esc(s('team.empty', r.upstream || '')) + '</p>';
    return html;
  }

  function reposHtml() {
    if (view.repos.length < 2) return '';
    return (
      '<nav class="repos" aria-label="' + esc(s('team.repos')) + '">' +
        view.repos.map(function (r, i) {
          var dot = r.state === 'conflict' ? 'danger' : r.state === 'behind' ? 'warn' : r.state === 'error' ? 'muted' : 'ok';
          return '<button class="repo-pill' + (i === view.selected ? ' is-on' : '') + '" data-act="select" data-arg="' + esc(r.root) + '" aria-pressed="' + (i === view.selected) + '">' +
            '<i class="state-dot ' + dot + '"></i><span>' + esc(r.name) + '</span>' + (r.behind ? '<b>' + r.behind + '</b>' : '') + '</button>';
        }).join('') +
      '</nav>'
    );
  }

  function footerHtml(r) {
    if (!r || !r.checkedAt) return '';
    return '<footer class="foot"><span>' + esc(s('team.checked', ago(r.checkedAt / 1000))) + '</span>' +
      '<button class="icon-btn" data-act="check" title="' + esc(s('team.checkNow')) + '" aria-label="' + esc(s('team.checkNow')) + '">' + I('refresh') + '</button></footer>';
  }

  // ---------- Render ----------
  function shell() {
    app.innerHTML =
      '<div class="tm">' +
        '<div id="repos"></div>' +
        '<section class="hero card" id="hero" aria-live="polite"></section>' +
        '<div id="alerts"></div>' +
        '<div id="timeline"></div>' +
        '<div id="foot"></div>' +
      '</div>';
    app.addEventListener('click', onClick);
  }

  var mascotEl = null;
  function ensureMascot(pose, firstTime) {
    var host = document.getElementById('mascotHost');
    if (!host) return;
    if (!mascotEl) {
      host.innerHTML = M.svg({ pose: pose, size: 92, enter: firstTime, label: 'Pal' });
      mascotEl = host.firstChild;
    } else {
      host.appendChild(mascotEl);
      M.setPose(mascotEl, pose);
    }
  }

  function update() {
    var r = repo();
    var mode = modeOf(r);
    var root = r ? r.root : '';
    document.getElementById('repos').innerHTML = reposHtml();

    var hero = document.getElementById('hero');
    var heroKey = mode + '|' + root + '|' + (r ? r.behind + '|' + (r.conflict ? r.conflict.files.length : '') + '|' + (r.error ? r.error.code : '') + '|' + (r.ci ? r.ci.state : '') : '');
    if (heroKey !== hero.getAttribute('data-key')) {
      var changed = currentMode && (mode !== currentMode || root !== currentRoot);
      var firstTime = !currentMode;
      hero.setAttribute('data-key', heroKey);
      hero.setAttribute('data-mode', mode);
      if (mascotEl && mascotEl.parentNode) mascotEl.parentNode.removeChild(mascotEl);
      hero.innerHTML = heroHtml(mode, r);
      ensureMascot(poseFor(mode, r), firstTime);
      if (changed) {
        hero.classList.remove('swap');
        void hero.offsetWidth;
        hero.classList.add('swap');
      }
      if (mode === 'success') setTimeout(function () { M.confetti(hero, 40); }, 260);
    }
    document.getElementById('alerts').innerHTML = sameFileHtml(r) + conflictHtml(r, mode);
    renderTimeline(r, mode);
    document.getElementById('foot').innerHTML = footerHtml(r);
    applyHues(app);
    currentMode = mode;
    currentRoot = root;
  }

  function renderTimeline(r, mode) {
    var host = document.getElementById('timeline');
    var key = r ? r.root : '';
    if (host.getAttribute('data-root') !== key) seenShas = null; // switching repo: no slide-in storm
    host.setAttribute('data-root', key);
    host.innerHTML = timelineHtml(r, mode);
    var items = host.querySelectorAll('.tl-item');
    var nextSeen = {};
    var delay = 0;
    items.forEach(function (li) {
      var sha = li.getAttribute('data-sha');
      nextSeen[sha] = true;
      if (seenShas && !seenShas[sha]) {
        li.classList.add('enter');
        li.style.setProperty('--d', delay + 'ms');
        delay += 70;
      }
    });
    seenShas = nextSeen;
  }

  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var arg = el.getAttribute('data-arg');
    var r = repo();
    switch (act) {
      case 'pull': post({ type: 'pull', root: r.root }); break;
      case 'check':
        el.classList.add('spin');
        post({ type: 'check' });
        break;
      case 'openFile': post({ type: 'openFile', root: r.root, file: arg }); break;
      case 'mergeEditor': post({ type: 'mergeEditor', root: r.root, file: arg }); break;
      case 'finishMerge': post({ type: 'finishMerge', root: r.root }); break;
      case 'select':
        view.selected = view.repos.findIndex(function (x) { return x.root === arg; });
        update();
        post({ type: 'select', root: arg });
        break;
      case 'cmd': post({ type: 'command', id: arg }); break;
    }
  }

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (m.type === 'view') {
      view = m.view;
      update();
    } else if (m.type === 'theme') {
      var root = document.documentElement;
      root.className = root.className.replace(/\btheme-[a-z]+\b/, 'theme-' + m.theme);
    }
  });

  // Keep relative times fresh.
  setInterval(function () {
    document.querySelectorAll('.tl-item time').forEach(function (t, i) {
      var li = t.closest('.tl-item');
      var c = repo() && repo().recent.filter(function (x) { return x.sha === li.getAttribute('data-sha'); })[0];
      if (c) t.textContent = ago(c.time);
    });
    var r = repo();
    var foot = document.querySelector('.foot span');
    if (r && foot) foot.textContent = s('team.checked', ago(r.checkedAt / 1000));
  }, 30000);

  shell();
  update();
  post({ type: 'ready' });
})();
