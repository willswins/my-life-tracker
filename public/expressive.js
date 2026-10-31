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
    'padding-bottom:env(safe-area-inset-bottom, 0px);}',
    '.bnav-it{flex:1;background:none;border:0;cursor:pointer;color:var(--b-muted);',
    'font-size:10.5px;font-family:inherit;display:flex;flex-direction:column;align-items:center;',
    'gap:2px;padding:8px 0 10px;position:relative;}',
    '.bnav-ic{font-size:21px;line-height:1;padding:3px 16px;border-radius:999px;}',
    '.bnav-it.on{color:var(--b-ink);font-weight:700;}',
    '.bnav-it.on .bnav-ic{background:var(--b-surface2);}',
    '.bnav-badge{position:absolute;top:2px;right:calc(50% - 23px);background:#ff5d47;color:#fff;',
    'font-size:10px;font-weight:800;min-width:17px;height:17px;border-radius:9px;line-height:17px;padding:0 4px;text-align:center;}',
    '.bnav-badge.zero{display:none;}',
    // ---- FAB --------------------------------------------------------------
    '#bfab{position:fixed;right:16px;bottom:calc(96px + 14px);z-index:70;width:58px;height:58px;',
    'border-radius:20px;background:#ff5d47;color:#fff;font-size:30px;font-weight:700;border:0;cursor:pointer;',
    'display:flex;align-items:center;justify-content:center;box-shadow:0 12px 28px rgba(255,93,71,.35);}',
    '#bfab[hidden]{display:none;}',
    // ---- Board lane switcher (phone widths) -------------------------------
    '#blane-bar{display:none;}',
    '@media (max-width:899px){',
    '#blane-bar{display:flex;gap:8px;padding:10px 12px 2px;overflow-x:auto;}',
    '.blane-chip{flex:none;font-family:inherit;font-size:14.5px;font-weight:700;padding:9px 16px;',
    'border-radius:999px;border:0;background:var(--b-surface2);color:var(--b-muted);cursor:pointer;}',
    '.blane-chip.on{background:#6c5ce7;color:#fff;}',
    '#view-tasks #lanes .lane{display:none;}',
    '#view-tasks #lanes .lane.b-on{display:block;}',
    // ---- Payments: card rows (phone widths) ------------------------------
    '.pay-table-wrap{overflow:visible;}',
    '.pay-table-wrap table,.pay-table-wrap tbody,.pay-table-wrap tr,.pay-table-wrap td{display:block;width:100%;}',
    '.pay-table-wrap thead{display:none;}',
    '.pay-table-wrap tr.pay-row{background:var(--b-surface);border:1px solid var(--b-line);',
    'border-radius:22px;padding:12px 14px;margin-bottom:12px;}',
    // the expanded detail row is a classless tr whose td carries an
    // inline var(--lane) surface — style it as a card, and give its
    // plain buttons a theme-aware look (they rendered as gray slabs)
    '.pay-table-wrap tbody tr:not(.pay-row){margin:-6px 0 12px;}',
    '.pay-table-wrap tbody tr:not(.pay-row) td{border-radius:22px;padding:14px 16px;}',
    '.pay-table-wrap td button{background:var(--b-surface2);color:var(--b-ink);',
    'border:1px solid var(--b-line);border-radius:10px;padding:8px 12px;font-family:inherit;cursor:pointer;}',
    // row tints live on the tds in table layout; as cards they must sit
    // on the tr itself or they paint a framed inner rectangle. Scoped to
    // .pay-row cells so the detail td keeps its inline surface.
    '.pay-table-wrap tr.pay-row td{background:transparent !important;}',
    // payments.js paints status text and the NEW badge with light-theme
    // colors (#2e7d32 / #b7791f / #c62828) inline — on dark cards they
    // fall under the contrast floor; lift them, hues intact
    ':root[data-theme="dark"] .pay-table-wrap tr.pay-row td:nth-child(5){filter:brightness(1.8) saturate(1.25);}',
    ':root[data-theme="dark"] .pay-table-wrap tr.pay-row td:nth-child(2) span{filter:brightness(1.8) saturate(1.25);}',
    '.pay-table-wrap tr.pay-row-attn{background:#fee2e2;}',
    '.pay-table-wrap tr.pay-row-ack{background:#dcfce7;}',
    ':root[data-theme="dark"] .pay-table-wrap tr.pay-row-attn{background:#3a1d22;}',
    ':root[data-theme="dark"] .pay-table-wrap tr.pay-row-ack{background:#14301f;}',
    '.pay-table-wrap td{border:0 !important;padding:2px 0;}',
    '.pay-table-wrap td:nth-child(2){font-size:17px;font-weight:800;}',
    '.pay-table-wrap td:nth-child(4){font-size:17px;font-weight:800;}',
    '.pay-table-wrap td:nth-child(1){color:var(--b-muted);font-size:13px;font-weight:700;}',
    '.pay-table-wrap td:nth-child(7){color:var(--b-muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em;}',
    // ---- Bottom sheets for add/edit (phone widths) -------------------------
    '#modal-backdrop,#reminder-backdrop,#detail-backdrop,#invite-backdrop,#keys-backdrop,.pay-backdrop{align-items:flex-end;padding:0;}',
    '.modal,.pay-modal{max-width:none;width:100%;border-radius:24px 24px 0 0;max-height:92vh;}',
    '}',
  ].join('\n');

  var NAV = [
    { view: 'home', icon: '🏠', label: 'Home' },
    { view: 'tasks', icon: '🗂️', label: 'Board' },
    { view: 'reminders', icon: '⏰', label: 'Reminders' },
    { view: 'inbox', icon: '📥', label: 'Inbox', badge: true },
    { view: '__more', icon: '•••', label: 'More' },
  ];
  var TAB_VIEWS = { home: 1, tasks: 1, reminders: 1, inbox: 1 };
  var LANES = [
    { id: 'now', label: 'Now' },
    { id: 'next', label: 'Next' },
    { id: 'waiting', label: 'Waiting' },
    { id: 'done', label: 'Done' },
  ];
  var FAB_VIEWS = { home: 1, tasks: 1, reminders: 1, inbox: 1, payments: 1, links: 1, journal: 1, shop: 1, longterm: 1, habits: 1 };
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
      b.innerHTML = '<span class="bnav-ic">' + item.icon + '</span><span>' + item.label + '</span>' +
        (item.badge ? '<span class="bnav-badge zero" id="bnav-badge">0</span>' : '');
      b.addEventListener('click', function (ev) {
        if (item.view === '__more') {
          // app.js closes the menu on any document click outside
          // .menu-wrap — the real tap that opens it here would bubble
          // up and close it again in the same tap. Stop it, then use
          // the app's own toggle.
          if (ev && ev.stopPropagation) ev.stopPropagation();
          var mb = document.getElementById('menu-btn');
          if (mb) mb.click();
          return;
        }
        if (typeof window.switchView === 'function') window.switchView(item.view);
      });
      nav.appendChild(b);
    });
    document.body.appendChild(nav);
    return true;
  }

  function buildFab() {
    if (document.getElementById('bfab')) return true;
    if (!document.body) return false;
    var f = document.createElement('button');
    f.type = 'button';
    f.id = 'bfab';
    f.textContent = '+';
    f.title = 'Add';
    f.setAttribute('aria-label', 'Add');
    f.addEventListener('click', fabAction);
    document.body.appendChild(f);
    return true;
  }

  function clickFirst(sel) {
    var el = $(sel);
    if (el) { el.click(); return true; }
    return false;
  }
  function fabAction() {
    var v = currentViewName();
    try {
      if (v === 'tasks' && typeof openModal === 'function') openModal(null);
      else if (v === 'reminders' && typeof openReminderModal === 'function') openReminderModal(null);
      else if (v === 'inbox') clickFirst('#ib-add-btn');
      else if (v === 'payments') clickFirst('#view-payments .search-add button') || clickFirst('#view-payments button.primary');
      else if (v === 'links' && typeof openLinkModal === 'function') openLinkModal(null);
      else if (v === 'journal') clickFirst('#j-add');
      else if (v === 'shop') { var inp = $('#shop-new-name'); if (inp) inp.focus(); }
      else if (v === 'longterm') clickFirst('#lt-add');
      else if (v === 'habits') clickFirst('#view-habits .search-add button');
      else if (v === 'home' && typeof window.switchView === 'function') {
        window.switchView('tasks').then(function () { if (typeof openModal === 'function') openModal(null); });
      }
    } catch (e) { /* the view's own Add button remains available */ }
  }

  function syncChrome() {
    var v = currentViewName();
    var nav = document.getElementById('bnav');
    if (nav) {
      nav.querySelectorAll('.bnav-it').forEach(function (b) {
        var bv = b.dataset.view;
        b.classList.toggle('on', bv === v || (bv === '__more' && !TAB_VIEWS[v]));
      });
      var src = document.getElementById('badge-inbox');
      var mine = document.getElementById('bnav-badge');
      if (src && mine) {
        mine.textContent = src.textContent;
        mine.classList.toggle('zero', !src.textContent || src.textContent === '0');
      }
    }
    var fab = document.getElementById('bfab');
    if (fab) fab.hidden = !FAB_VIEWS[v];
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
    var ready = buildNav() & buildFab();
    if (ready && wrap()) {
      syncChrome();
      return;
    }
    setTimeout(tryInit, 300);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CSS: CSS, NAV: NAV, LANES: LANES, FAB_VIEWS: FAB_VIEWS, ACCENT: ACCENT, CORAL: CORAL,
      buildNav: buildNav, buildFab: buildFab, syncChrome: syncChrome, fabAction: fabAction,
      applyLane: applyLane, ensureLaneBar: ensureLaneBar, wrap: wrap, injectStyle: injectStyle };
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
