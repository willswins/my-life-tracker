// DayBook dark theme (Winny, 2026-10-31). The app's surfaces are mostly
// CSS-variable driven, so dark mode = a variable flip on <html
// data-theme="dark"> plus targeted overrides for the hardcoded light
// surfaces (header, menus, inputs, status tints, patch styles).
// Default follows the phone's system setting until Winny toggles; the
// choice persists in localStorage. Toggle lives in the main menu.
(function () {
  'use strict';

  var KEY = 'daybook-theme';

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
    ':root[data-theme="dark"] .home-stat{background:#17181c;}',
    ':root[data-theme="dark"] .about-card{background:var(--card);}',
    ':root[data-theme="dark"] .toast{background:#e8eaed;color:#141518;}',
    // Status tints: same meaning, dark-appropriate depth.
    ':root[data-theme="dark"] .pill.size-high{background:rgba(220,38,38,.22);color:#fca5a5;}',
    ':root[data-theme="dark"] #trash-toggle.active{background:rgba(220,38,38,.22);border-color:#7f1d1d;color:#fca5a5;}',
    ':root[data-theme="dark"] .badge.hot{background:rgba(220,38,38,.25);color:#fca5a5;}',
    ':root[data-theme="dark"] .card .meta .overdue{color:#f87171;}',
    // Patch-injected light surfaces.
    ':root[data-theme="dark"] .ib-sec-head{background:#22242a;}',
    ':root[data-theme="dark"] .ib-att{background:#1e2126;}',
    ':root[data-theme="dark"] .pay-table-wrap tr.pay-row-attn td{background:rgba(220,38,38,.20);}',
    ':root[data-theme="dark"] .pay-table-wrap tr.pay-row-ack td{background:rgba(22,163,74,.20);}',
    ':root[data-theme="dark"] .due2-card{background:#1b1d21;color:var(--ink);}',
    // Links and accents stay visible on dark.
    ':root[data-theme="dark"] .ib-h-meta{color:#8b93a0;}',
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
    if (btn) btn.textContent = name === 'dark' ? '☀️ Light theme' : '🌙 Dark theme';
  }
  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  }

  function injectStyle() {
    if (document.getElementById('theme-dark-style')) return;
    var st = document.createElement('style');
    st.id = 'theme-dark-style';
    st.textContent = DARK_CSS;
    document.head.appendChild(st);
  }

  function addToggle() {
    var menu = document.getElementById('menu');
    if (!menu || document.getElementById('theme-toggle')) return !!menu;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'theme-toggle';
    btn.textContent = currentTheme() === 'dark' ? '☀️ Light theme' : '🌙 Dark theme';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleTheme();
    });
    menu.appendChild(btn);
    return true;
  }

  function tryInit() {
    injectStyle();
    applyTheme(storedTheme() || systemTheme(), false);
    if (addToggle()) return;
    setTimeout(tryInit, 300);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DARK_CSS: DARK_CSS, KEY: KEY };
    return;
  }
  // Apply before the app's first render (scripts sit at the end of
  // <body>, ahead of the async init), so there is no light flash.
  tryInit();
})();
