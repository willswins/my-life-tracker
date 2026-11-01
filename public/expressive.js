// DayBook "Expressive" design — Alternative B (Winny's pick, 2026-10-31).
// Material 3 Expressive direction: violet accent + coral action color,
// oversized shapes, filled tonal chips, bento Home, a solid bottom
// navigation bar with a pill indicator, a coral FAB in the thumb zone,
// board lanes behind a chip switcher on phone widths, Payments as card
// rows on phone widths, and bottom sheets for add/edit on phones.
// Implemented as a patch (like theme.js/refresh.js): a stylesheet that
// re-skins the app's variables and components in BOTH light and dark,
// plus the nav/FAB/lane DOM. Uninstall = remove the script tag.
(function () {
  'use strict';

  var ACCENT = '#6c5ce7';
  var CORAL = '#ff5d47';

  var CSS = [
    // ---- B palette mapped onto the app's variables -------------------
    ':root{--card:#ffffff;--lane:#eceaf4;--line:#e3e0ee;--ink:#1d1a2e;--muted:#6f6a85;',
    '--work:#6c5ce7;--work-bg:#e3defc;--personal:#12a150;--personal-bg:#d7f2e0;',
    '--b-bg:#f6f5fa;--b-surface:#ffffff;--b-surface2:#eceaf4;--b-ink:#1d1a2e;--b-muted:#6f6a85;--b-line:#e3e0ee;}',
    ':root[data-theme="dark"]{--card:#1c1a26;--lane:#232130;--line:#2b2838;--ink:#f2f0fa;--muted:#9d97b5;',
    '--work:#a79bff;--work-bg:#35304d;--personal:#3ecf6f;--personal-bg:#12351f;',
    '--b-bg:#0e0d13;--b-surface:#1c1a26;--b-surface2:#232130;--b-ink:#f2f0fa;--b-muted:#9d97b5;--b-line:#2b2838;}',
    'body{background:var(--b-bg);padding-bottom:96px;}',
    'header{background:var(--b-surface);}',
    // ---- Shapes & components ------------------------------------------
    '.card{border-radius:24px;box-shadow:0 2px 10px rgba(20,16,50,.07);}',
    '.lane{background:transparent;padding:0.25rem;}',
    '.rem-row{border-radius:20px;}',
    '.inbox-row{border-radius:18px;}',
    '.modal{border-radius:24px;}',
    'button.primary{background:#6c5ce7 !important;color:#fff !important;border-color:#6c5ce7 !important;border-radius:12px;}',
    '.tag-filter{background:var(--b-surface2);border-color:transparent;color:var(--b-muted);}',
    '.tag-filter.active{background:#6c5ce7 !important;color:#fff !important;border-color:#6c5ce7 !important;}',
    '#view-journal .filters button.active{background:#6c5ce7 !important;color:#fff !important;border-color:#6c5ce7 !important;}',
    '.pill.size-high{background:#ffdf6b;color:#4a3b00;}',
    ':root[data-theme="dark"] .pill.size-high{background:#ffdf6b;color:#4a3b00;}',
    'input[type="search"],.search-add input{border-radius:14px;}',
    '.toast{bottom:calc(96px + 1rem);}',
    // ---- Home: bento ---------------------------------------------------
    '.home-hello{font-size:1.9rem;font-weight:800;letter-spacing:-0.01em;}',
    '.home-stats{grid-template-columns:1fr 1fr;gap:12px;}',
    // payments.js builds its Home tile with an inline gridColumn span
    // (an Oct 28 design). Winny (Oct 31): no spanning tile — every stat
    // is one equal box in the 2x3, Payments included.
    '.home-stats .home-stat{grid-column:auto !important;}',
    '.home-stat{min-height:104px;justify-content:center;}',
    '.home-stat{border-radius:28px;padding:16px 10px;background:var(--b-surface);}',
    '.home-stat-num{font-size:34px;font-weight:800;}',
    '.home-stat-num.hot{color:#ff5d47;}',
    ':root[data-theme="dark"] .home-stat-num.hot{color:#ff8a7a;}',
    '.home-stat-label{font-size:0.8rem;}',
    '#home-upnext{background:#6c5ce7;border-radius:28px;padding:10px 18px;}',
    '.home-up-item{background:transparent;border:0;border-bottom:1px solid rgba(255,255,255,.18);color:#fff;width:100%;text-align:left;padding:10px 0;cursor:pointer;}',
    '.home-up-item:last-child{border-bottom:0;}',
    '.home-up-title{color:#fff;font-weight:700;}',
    '.home-up-when{color:#d9d2ff;}',
    '#home-upnext .home-empty{color:#d9d2ff;}',
    // ---- Bottom navigation ----------------------------------------------
    '#bnav{position:fixed;left:0;right:0;bottom:0;z-index:70;display:flex;',
    'background:var(--b-surface);border-top:1px solid var(--b-line);',
    'padding-bottom:env(safe-area-inset-bottom, 0px);transform:translate3d(0,0,0);}',
    // iOS anti-zoom (Winny, 2026-11-01 — "on the reminder page once I
    // scroll, the bottom menu bar also scrolls up"): form fields under
    // 16px make iOS auto-zoom the page on focus, and a zoomed page drags
    // position:fixed bars (the bottom nav) with the content. The app's
    // search/modal fields were 0.85-0.9rem (13.6-14.4px). Forcing every
    // field to 16px removes the zoom at the source; the translate3d on
    // #bnav above additionally keeps the bar on its own layer.
    'input,textarea,select{font-size:16px !important;}',
    // The header hamburger is retired (Winny, 2026-10-31): the bottom nav
    // + More sheet carry every destination it had. The .menu-wrap element
    // stays in the DOM (app.js binds it at load; modules file badge spans
    // into it — updateBadges still feeds our tab badges from there).
    '.menu-wrap{display:none !important;}',
    '.bnav-it{flex:1;background:none;border:0;cursor:pointer;color:var(--b-muted);',
    'font-size:10.5px;font-family:inherit;display:flex;flex-direction:column;align-items:center;',
    'gap:2px;padding:8px 0 10px;position:relative;}',
    '.bnav-ic{font-size:21px;line-height:1;padding:3px 16px;border-radius:999px;}',
    '.bnav-it.on{color:var(--b-ink);font-weight:700;}',
    '.bnav-it.on .bnav-ic{background:var(--b-surface2);}',
    '.bnav-badge{position:absolute;top:2px;right:calc(50% - 23px);background:#ff5d47;color:#fff;',
    'font-size:10px;font-weight:800;min-width:17px;height:17px;border-radius:9px;line-height:17px;padding:0 4px;text-align:center;}',
    '.bnav-badge.zero{display:none;}',
    // ---- More sheet (opened by the bottom-nav More tab) --------------------
    '#bmore{position:fixed;inset:0;z-index:85;background:rgba(10,8,20,.45);}',
    '#bmore[hidden]{display:none;}',
    '.bmore-panel{position:absolute;left:0;right:0;bottom:0;background:var(--b-surface);',
    'border-radius:24px 24px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom, 0px));}',
    '.bmore-title{font-size:17px;font-weight:800;color:var(--b-ink);padding:2px 2px 12px;}',
    '.bmore-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px 8px;}',
    '.bmore-it{background:none;border:0;cursor:pointer;font-family:inherit;display:flex;',
    'flex-direction:column;align-items:center;gap:6px;color:var(--b-ink);font-size:11.5px;',
    'font-weight:600;padding:0;position:relative;}',
    '.bmore-ic{font-size:24px;line-height:1;background:var(--b-surface2);width:54px;height:54px;',
    'border-radius:17px;display:flex;align-items:center;justify-content:center;}',
    '.bmore-badge{position:absolute;top:-4px;right:calc(50% - 30px);background:#ff5d47;color:#fff;',
    'font-size:10px;font-weight:800;min-width:17px;height:17px;border-radius:9px;line-height:17px;padding:0 4px;text-align:center;}',
    '.bmore-badge.zero{display:none;}',
    // ---- Board lane switcher (phone widths) -------------------------------
    '#blane-bar{display:none;}',
    '@media (max-width:899px){',
    '#blane-bar{display:flex;gap:8px;padding:10px 12px 2px;overflow-x:auto;}',
    '.blane-chip{flex:none;font-family:inherit;font-size:14.5px;font-weight:700;padding:9px 16px;',
    'border-radius:999px;border:0;background:var(--b-surface2);color:var(--b-muted);cursor:pointer;}',
    '.blane-chip.on{background:#6c5ce7;color:#fff;}',
    '#view-tasks #lanes .lane{display:none;}',
    '#view-tasks #lanes .lane.b-on{display:block;}',
    // ---- Bottom sheets for add/edit (phone widths) -------------------------
    '#modal-backdrop,#reminder-backdrop,#detail-backdrop,#invite-backdrop,#keys-backdrop,.pay-backdrop{align-items:flex-end;padding:0;}',
    '.modal,.pay-modal{max-width:none;width:100%;border-radius:24px 24px 0 0;max-height:92vh;}',
    '}',
  ].join('\n');

  var NAV = [
    { view: 'home', icon: '🏠', label: 'Home' },
    { view: 'tasks', icon: '🗂️', label: 'Board', badge: 'badge-tasks' },
    { view: 'reminders', icon: '⏰', label: 'Reminders', badge: 'badge-reminders' },
    { view: 'inbox', icon: '📥', label: 'Inbox', badge: 'badge-inbox' },
    { view: '__more', icon: '•••', label: 'More' },
  ];
  var TAB_VIEWS = { home: 1, tasks: 1, reminders: 1, inbox: 1 };
  var LANES = [
    { id: 'now', label: 'Now' },
    { id: 'next', label: 'Next' },
    { id: 'waiting', label: 'Waiting' },
    { id: 'done', label: 'Done' },
  ];
  // Everything not on the bottom nav, in one sheet (Winny, 2026-10-31).
  // badge = id of the header-menu badge span to mirror, when one exists.
  var MORE_ITEMS = [
    { view: 'journal', icon: '📓', label: 'Journal' },
    { view: 'links', icon: '🔗', label: 'Links', badge: 'badge-links' },
    { view: 'payments', icon: '💳', label: 'Payments', badge: 'badge-payments' },
    { view: 'mood', icon: '🙂', label: 'Mood' },
    { view: 'habits', icon: '🔥', label: 'Habits' },
    { view: 'shop', icon: '🛒', label: 'Shop', badge: 'badge-shop' },
    { view: 'longterm', icon: '🌱', label: 'Long Term' },
    { view: 'game', icon: '🎮', label: 'Sum It Up' },
    { view: 'spell', icon: '🔤', label: 'Spell It' },
    { view: 'bee', icon: '🐝', label: 'Spelling Bee' },
    { view: 'grammar', icon: '✏️', label: 'Grammar Quiz' },
    { view: 'wordmean', icon: '📖', label: 'Word Meaning' },
    { view: 'about', icon: 'ℹ️', label: 'About' },
  ];
  var laneSel = 'now';

  function $(sel) { return document.querySelector(sel); }
  function currentViewName() {
    try { return (typeof currentView !== 'undefined' && currentView) || 'home'; } catch (e) { return 'home'; }
  }

  function injectStyle() {
    if (document.getElementById('b-style')) return;
    var st = document.createElement('style');
    st.id = 'b-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function buildNav() {
    if (document.getElementById('bnav')) return true;
    if (!document.body) return false;
    var nav = document.createElement('nav');
    nav.id = 'bnav';
    nav.setAttribute('aria-label', 'Primary');
    NAV.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'bnav-it';
      b.dataset.view = item.view;
      var ic = document.createElement('span');
      ic.className = 'bnav-ic';
      ic.textContent = item.icon;
      b.appendChild(ic);
      var lb = document.createElement('span');
      lb.textContent = item.label;
      b.appendChild(lb);
      if (item.badge) {
        var bg = document.createElement('span');
        bg.className = 'bnav-badge zero';
        bg.dataset.src = item.badge;
        if (item.view === 'inbox') bg.id = 'bnav-badge';
        bg.textContent = '0';
        b.appendChild(bg);
      }
      b.addEventListener('click', function (ev) {
        if (item.view === '__more') {
          // The More sheet is ours (the old design proxied to the header
          // ☰ menu, whose open/close race with app.js's document closer
          // made the tap look dead). Open the sheet; keep the tap from
          // bubbling into other handlers.
          if (ev && ev.stopPropagation) ev.stopPropagation();
          openMore();
          return;
        }
        if (typeof window.switchView === 'function') window.switchView(item.view);
      });
      nav.appendChild(b);
    });
    document.body.appendChild(nav);
    return true;
  }

  // ---- More sheet ---------------------------------------------------------
  // (The coral + FAB was removed at Winny's order, 2026-10-31 — every
  // view keeps its own header Add button.)
  function buildMoreSheet() {
    if (document.getElementById('bmore')) return true;
    if (!document.body) return false;
    var bd = document.createElement('div');
    bd.id = 'bmore';
    bd.hidden = true;
    var panel = document.createElement('div');
    panel.className = 'bmore-panel';
    var title = document.createElement('div');
    title.className = 'bmore-title';
    title.textContent = 'More';
    panel.appendChild(title);
    var grid = document.createElement('div');
    grid.className = 'bmore-grid';
    MORE_ITEMS.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'bmore-it';
      b.dataset.view = item.view;
      var ic = document.createElement('span');
      ic.className = 'bmore-ic';
      ic.textContent = item.icon;
      b.appendChild(ic);
      var lb = document.createElement('span');
      lb.textContent = item.label;
      b.appendChild(lb);
      if (item.badge) {
        var bg = document.createElement('span');
        bg.className = 'bmore-badge zero';
        bg.dataset.badgeFor = item.badge;
        bg.textContent = '0';
        b.appendChild(bg);
      }
      b.addEventListener('click', function () {
        closeMore();
        if (typeof window.switchView === 'function') window.switchView(item.view);
      });
      grid.appendChild(b);
    });
    panel.appendChild(grid);
    bd.appendChild(panel);
    bd.addEventListener('click', function (ev) { if (ev.target === bd) closeMore(); });
    document.body.appendChild(bd);
    return true;
  }
  function syncMoreBadges() {
    document.querySelectorAll('.bmore-badge').forEach(function (bg) {
      var src = document.getElementById(bg.dataset.badgeFor);
      var t = src ? src.textContent : '';
      bg.textContent = t || '0';
      bg.classList.toggle('zero', !t || t === '0');
    });
  }
  function openMore() {
    var bd = document.getElementById('bmore');
    if (!bd) return;
    syncMoreBadges();
    bd.hidden = false;
  }
  function closeMore() {
    var bd = document.getElementById('bmore');
    if (bd) bd.hidden = true;
  }

  function syncChrome() {
    var v = currentViewName();
    var nav = document.getElementById('bnav');
    if (nav) {
      nav.querySelectorAll('.bnav-it').forEach(function (b) {
        var bv = b.dataset.view;
        b.classList.toggle('on', bv === v || (bv === '__more' && !TAB_VIEWS[v]));
      });
      nav.querySelectorAll('.bnav-badge').forEach(function (mine) {
        var src = document.getElementById(mine.dataset.src);
        if (src) {
          mine.textContent = src.textContent;
          mine.classList.toggle('zero', !src.textContent || src.textContent === '0');
        }
      });
    }
  }

  function ensureLaneBar() {
    var lanes = document.getElementById('lanes');
    if (!lanes || document.getElementById('blane-bar')) return !!lanes;
    var bar = document.createElement('div');
    bar.id = 'blane-bar';
    LANES.forEach(function (l) {
      var c = document.createElement('button');
      c.type = 'button';
      c.className = 'blane-chip';
      c.dataset.lane = l.id;
      c.textContent = l.label;
      c.addEventListener('click', function () { laneSel = l.id; applyLane(); });
      bar.appendChild(c);
    });
    lanes.parentNode.insertBefore(bar, lanes);
    return true;
  }
  function applyLane() {
    ensureLaneBar();
    document.querySelectorAll('#lanes .lane').forEach(function (sec) {
      sec.classList.toggle('b-on', sec.dataset.lane === laneSel);
    });
    document.querySelectorAll('.blane-chip').forEach(function (c) {
      var lane = document.querySelector('#lanes .lane[data-lane="' + c.dataset.lane + '"]');
      var count = '';
      if (lane) {
        var h = lane.querySelector('h2 .count');
        if (h) count = ' ' + h.textContent.replace(/[()]/g, '');
      }
      var base = LANES.filter(function (l) { return l.id === c.dataset.lane; })[0];
      c.textContent = (base ? base.label : c.dataset.lane) + (count ? ' · ' + count : '');
      c.classList.toggle('on', c.dataset.lane === laneSel);
    });
  }

  function wrap() {
    var ok = true;
    if (typeof window.switchView === 'function' && !window.switchView._bWrapped) {
      var origSwitch = window.switchView;
      window.switchView = async function () {
        var r = await origSwitch.apply(this, arguments);
        try { syncChrome(); if (currentViewName() === 'tasks') applyLane(); } catch (e) {}
        return r;
      };
      window.switchView._bWrapped = true;
    } else if (typeof window.switchView !== 'function') ok = false;
    if (typeof window.updateBadges === 'function' && !window.updateBadges._bWrapped) {
      var origBadges = window.updateBadges;
      window.updateBadges = async function () {
        var r = await origBadges.apply(this, arguments);
        try { syncChrome(); } catch (e) {}
        return r;
      };
      window.updateBadges._bWrapped = true;
    }
    if (typeof window.render === 'function' && !window.render._bWrapped) {
      var origRender = window.render;
      window.render = function () {
        var r = origRender.apply(this, arguments);
        try { if (currentViewName() === 'tasks') applyLane(); } catch (e) {}
        return r;
      };
      window.render._bWrapped = true;
    }
    return ok;
  }

  function tryInit() {
    injectStyle();
    var ready = buildNav() & buildMoreSheet();
    if (ready && wrap()) {
      syncChrome();
      return;
    }
    setTimeout(tryInit, 300);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CSS: CSS, NAV: NAV, LANES: LANES, MORE_ITEMS: MORE_ITEMS, ACCENT: ACCENT, CORAL: CORAL,
      buildNav: buildNav, buildMoreSheet: buildMoreSheet, openMore: openMore, closeMore: closeMore,
      syncChrome: syncChrome, syncMoreBadges: syncMoreBadges,
      applyLane: applyLane, ensureLaneBar: ensureLaneBar, wrap: wrap, injectStyle: injectStyle };
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
