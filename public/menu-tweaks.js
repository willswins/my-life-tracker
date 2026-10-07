// Menu tweaks: Games submenu toggle, profile menu buttons, iOS popup-menu close.
// Loads after app.js.
(function() {
'use strict';

function closeProfileMenu() {
  var pm = document.getElementById('profile-menu');
  if (pm) pm.classList.add('hidden');
}

function closeAllPopups() {
  if (typeof closeRemMenu === 'function') closeRemMenu();
  if (typeof closeLinkMenu === 'function') closeLinkMenu();
  if (typeof closeDropdown === 'function') closeDropdown();
  closeProfileMenu();
  var gm = document.getElementById('menu');
  // Don't auto-close the main hamburger menu on outside tap (user may be scrolling);
  // popup menus (rem-menu, link-menu, dd-menu) are the ones that must dismiss.
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
  // iOS Safari: click events don't bubble to document from non-interactive
  // elements, so popup menus (rem-menu, link-menu, dd-menu) stay open on tap.
  // Use touchstart (passive) as well — close only when the tap is outside
  // the open popup and outside its toggle button.
  if (!document.dataset.popupTouchWired) {
    document.dataset.popupTouchWired = '1';
    document.addEventListener('touchstart', function(e) {
      var t = e.target;
      var inRem = t.closest && (t.closest('#rem-menu') || t.closest('.link-menu-btn'));
      var inLink = t.closest && (t.closest('#link-menu') || t.closest('.link-menu-btn'));
      var inDd = t.closest && (t.closest('#dd-menu') || t.closest('.dd-field'));
      var inProfile = t.closest && (t.closest('#profile-menu') || t.closest('#profile-btn'));
      if (!inRem) {
        var rm = document.getElementById('rem-menu');
        if (rm && !rm.classList.contains('hidden') && typeof closeRemMenu === 'function') closeRemMenu();
      }
      if (!inLink) {
        var lm = document.getElementById('link-menu');
        if (lm && !lm.classList.contains('hidden') && typeof closeLinkMenu === 'function') closeLinkMenu();
      }
      if (!inDd) {
        var dd = document.getElementById('dd-menu');
        if (dd && !dd.classList.contains('hidden') && typeof closeDropdown === 'function') closeDropdown();
      }
      if (!inProfile) closeProfileMenu();
    }, { passive: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireMenuTweaks);
} else {
  wireMenuTweaks();
}
})();
