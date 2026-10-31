// DayBook dark theme (Winny, 2026-10-31; QA pass + toggle moved to the
// header the same day). The app's surfaces are mostly CSS-variable
// driven, so dark mode = a variable flip on <html data-theme="dark">
// plus overrides for hardcoded light surfaces. The QA pass (rendered
// fixtures of every view, ~/workspace/theme-qa/) found a systemic bug
// class: components styled "ink background + white text" (primary
// buttons, active pills/tabs) invert to white-on-white in dark mode —
// they are all flipped to a light pill with dark text below. Date
// inputs get a real field treatment (Winny: Payments From/To were
// hardly visible), and the legacy .rem-overdue row gets a dark tint
// (it rendered as a pale strip).
// Default follows the phone's system setting until Winny toggles; the
// choice persists in localStorage. Toggle = icon button in the header,
// immediately left of the profile button.
(function () {
  'use strict';

  var KEY = 'daybook-theme';

  var TOGGLE_CSS = [
    '#theme-toggle{width:44px;height:44px;border-radius:50%;border:1px solid var(--line);',
    'background:var(--lane);cursor:pointer;font-size:19px;line-height:1;',
    'display:flex;align-items:center;justify-content:center;padding:0;flex:none;}',
  ].join('\n');

  var DARK_CSS = [
    ':root[data-theme="dark"]{color-scheme:dark;',
    '--ink:#eceff3;--muted:#9ba1a9;--line:#2e3138;--card:#1b1d21;--lane:#101114;',
    '--work:#5b9dff;--work-bg:#1c3050;--personal:#3ecf6f;--personal-bg:#12351f;}',
    ':root[data-theme="dark"] body{background:#0a0b0d;}',
    ':root[data-theme="dark"] header{background:#121316;}',
    ':root[data-theme="dark"] #menu,:root[data-theme="dark"] #profile-menu,:root[data-theme="dark"] #dd-menu{background:#1b1d21;box-shadow:0 8px 24px rgba(0,0,0,.5);}',
    ':root[data-theme="dark"] #view-toggle,:root[data-theme="dark"] #menu-btn{background:#1b1d21;color:var(--ink);}',
    ':root[data-theme="dark"] .filters button.active{background:#2b2e35;color:var(--ink);}',
    ':root[data-theme="dark"] input,:root[data-theme="dark"] textarea,:root[data-theme="dark"] select{background:#141518;color:var(--ink);border-color:var(--line);}',
    ':root[data-theme="dark"] .modal{background:var(--card);color:var(--ink);}',
    ':root[data-theme="dark"] .card .details{color:#c3c9d1;}',
    ':root[data-theme="dark"] .card .actions button{background:#22242a;color:var(--muted);}',
    ':root[data-theme="dark"] .tag-filter{background:#1b1d21;}',
    ':root[data-theme="dark"] .tag-bubble{background:#26282e;color:#c3c9d1;}',
    ':root[data-theme="dark"] .home-stat{background:#17181c;}',
    ':root[data-theme="dark"] .about-card{background:var(--card);}',
    ':root[data-theme="dark"] .toast{background:#e8eaed;color:#141518;}',
    ':root[data-theme="dark"] .pill{background:#26282e;}',
    ':root[data-theme="dark"] .link-btn{color:#5b9dff;}',
    // The ink-background class: light pill + dark text in dark mode.
    ':root[data-theme="dark"] button.primary,',
    ':root[data-theme="dark"] .modal-actions button.primary,',
    ':root[data-theme="dark"] .day-cell.selected,',
    ':root[data-theme="dark"] .tag-filter.active,',
    ':root[data-theme="dark"] .tag-filter-wrap #trash-toggle.active,',
    ':root[data-theme="dark"] .game-next,',
    ':root[data-theme="dark"] .spell-difficulty button.active,',
    ':root[data-theme="dark"] .bee-actions button.primary,',
    ':root[data-theme="dark"] .sir-tab.active,',
    ':root[data-theme="dark"] .rc-tab.active,',
    ':root[data-theme="dark"] #view-journal .filters button.active,',
    ':root[data-theme="dark"] #view-mood .mood-save{background:#e8eaed;color:#141518;border-color:#e8eaed;}',
    ':root[data-theme="dark"] .modal-actions button{background:#22242a;color:var(--ink);border-color:var(--line);}',
    ':root[data-theme="dark"] #view-journal .filters button{background:#1b1d21;color:var(--muted);}',
    // Date/time fields: a visible box + light field text (Payments QA).
    ':root[data-theme="dark"] input[type="date"],:root[data-theme="dark"] input[type="time"],:root[data-theme="dark"] input[type="datetime-local"]{background:#1b1d21;border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--ink);color-scheme:dark;}',
    ':root[data-theme="dark"] input[type="date"]::-webkit-datetime-edit,:root[data-theme="dark"] input[type="time"]::-webkit-datetime-edit{color:var(--ink);}',
    // Status tints: same meaning, dark-appropriate depth.
    ':root[data-theme="dark"] .pill.size-high{background:rgba(220,38,38,.22);color:#fca5a5;}',
    ':root[data-theme="dark"] #trash-toggle.active{background:rgba(220,38,38,.22);border-color:#7f1d1d;color:#fca5a5;}',
    ':root[data-theme="dark"] .badge.hot{background:rgba(220,38,38,.25);color:#fca5a5;}',
    ':root[data-theme="dark"] .overdue{color:#f87171;}',
    ':root[data-theme="dark"] .rem-overdue{background:rgba(220,38,38,.16);}',
    ':root[data-theme="dark"] .rem-overdue .rem-title{color:#fca5a5;}',
    // Patch-injected light surfaces.
    ':root[data-theme="dark"] .ib-sec-head{background:#22242a;}',
    ':root[data-theme="dark"] .ib-att{background:#1e2126;}',
    ':root[data-theme="dark"] .ib-h-meta{color:#8b93a0;}',
    ':root[data-theme="dark"] .ib-sheet{background:var(--card);}',
    ':root[data-theme="dark"] .ib-sheet button{background:#22242a;color:var(--ink);}',
    ':root[data-theme="dark"] .ib-sheet button.ib-danger{color:#f87171;}',
    ':root[data-theme="dark"] .pay-table-wrap tr.pay-row-attn td{background:rgba(220,38,38,.20);}',
    ':root[data-theme="dark"] .pay-table-wrap tr.pay-row-ack td{background:rgba(22,163,74,.20);}',
    ':root[data-theme="dark"] .due2-card{background:#1b1d21;color:var(--ink);}',
    ':root[data-theme="dark"] .mood-btn{background:#22242a;color:var(--ink);border-color:var(--line);}',
    ':root[data-theme="dark"] .mood-btns{background:transparent;}',
    ':root[data-theme="dark"] .shop-btn{background:#22242a;color:var(--ink);}',
    ':root[data-theme="dark"] #shop-list-select{background:#1b1d21;color:var(--ink);}',
    // Games: dark tiles, tint semantics kept.
    ':root[data-theme="dark"] .game-option{background:#1b1d21;color:var(--ink);}',
    ':root[data-theme="dark"] .game-option.correct{background:rgba(22,163,74,.20);color:#4ade80;border-color:#16a34a;}',
    ':root[data-theme="dark"] .game-option.wrong{background:rgba(220,38,38,.20);color:#fca5a5;border-color:#dc2626;}',
    ':root[data-theme="dark"] .spell-difficulty button{background:#1b1d21;color:var(--muted);}',
    ':root[data-theme="dark"] .bee-actions button{background:#22242a;color:var(--ink);}',
    ':root[data-theme="dark"] .bee-foundhead{background:#1b1d21;color:var(--muted);}',
    ':root[data-theme="dark"] .spell-review-item{background:#1b1d21;color:var(--ink);}',
  ].join('\n');

  function storedTheme() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function systemTheme() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) { return 'light'; }
  }
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(name, save) {
    document.documentElement.setAttribute('data-theme', name);
    if (save) {
      try { window.localStorage.setItem(KEY, name); } catch (e) { /* private mode */ }
    }
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.textContent = name === 'dark' ? '☀️' : '🌙';
      btn.title = name === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
      btn.setAttribute('aria-label', btn.title);
    }
  }
  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  }

  function injectStyle() {
    if (document.getElementById('theme-dark-style')) return;
    var st = document.createElement('style');
    st.id = 'theme-dark-style';
    st.textContent = TOGGLE_CSS + '\n' + DARK_CSS;
    document.head.appendChild(st);
  }

  function addToggle() {
    var profile = document.getElementById('profile-btn');
    if (!profile || !profile.parentNode) return false;
    // The first version put the toggle in the hamburger menu; remove
    // any leftover copy there so there is exactly one control.
    var menu = document.getElementById('menu');
    if (menu) {
      var stale = menu.querySelector('#theme-toggle');
      if (stale) stale.remove();
    }
    if (document.getElementById('theme-toggle')) return true;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'theme-toggle';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleTheme();
    });
    profile.parentNode.insertBefore(btn, profile);
    applyTheme(currentTheme(), false);
    return true;
  }

  function tryInit() {
    injectStyle();
    applyTheme(storedTheme() || systemTheme(), false);
    if (addToggle()) return;
    setTimeout(tryInit, 300);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DARK_CSS: DARK_CSS, TOGGLE_CSS: TOGGLE_CSS, KEY: KEY };
    return;
  }
  // Apply before the app's first render (scripts sit at the end of
  // <body>, ahead of the async init), so there is no light flash.
  tryInit();
})();
