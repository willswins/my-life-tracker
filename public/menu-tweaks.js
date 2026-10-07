// Menu tweaks: Games submenu toggle, profile Refresh button.
// Loads after app.js.
(function() {
'use strict';

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
      var pm = document.getElementById('profile-menu');
      if (pm) pm.classList.add('hidden');
      if (mr) mr.click();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireMenuTweaks);
} else {
  wireMenuTweaks();
}
})();
