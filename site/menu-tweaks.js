// Menu tweaks: Games submenu toggle, profile menu buttons.
// Loads after app.js.
(function() {
'use strict';

function closeProfileMenu() {
  var pm = document.getElementById('profile-menu');
  if (pm) pm.classList.add('hidden');
}

function wireMenuTweaks() {
  // Games submenu toggle
  var toggle = document.getElementById('games-toggle');
  var submenu = document.getElementById('games-submenu');
  if (toggle && submenu && !toggle.dataset.wired) {
    toggle.dataset.wired = '1';
    toggle.addEventListener('click', function(e) {
      e.stopPropagation();
      submenu.classList.toggle('hidden');
      toggle.classList.toggle('open', !submenu.classList.contains('hidden'));
    });
  }
  // Profile Refresh: delegate to the hidden menu-refresh button (keeps app.js logic)
  var pr = document.getElementById('profile-refresh');
  var mr = document.getElementById('menu-refresh');
  if (pr && !pr.dataset.wired) {
    pr.dataset.wired = '1';
    pr.addEventListener('click', function() {
      closeProfileMenu();
      if (mr) mr.click();
    });
  }
  // Invite & Connectors now live in the profile menu — close it when clicked
  // (app.js handlers still run via getElementById and open their modals)
  ['menu-invite', 'menu-connectors'].forEach(function(id) {
    var b = document.getElementById(id);
    if (b && !b.dataset.pmWired) {
      b.dataset.pmWired = '1';
      b.addEventListener('click', closeProfileMenu);
    }
  });
  // About moved to profile menu — navigate via switchView
  var ab = document.getElementById('profile-about');
  if (ab && !ab.dataset.wired) {
    ab.dataset.wired = '1';
    ab.addEventListener('click', function() {
      closeProfileMenu();
      if (typeof switchView === 'function') switchView('about');
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireMenuTweaks);
} else {
  wireMenuTweaks();
}
})();
