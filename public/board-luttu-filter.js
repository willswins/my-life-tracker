// Board filter: keep Luttu's own operating cards off Winny's board.
// Winny, 2026-10-25 — the Work board was cluttered with Luttu's standing
// cards (watches, heartbeats, reviews). Luttu doesn't work from the board,
// so his cards don't belong on it. This does NOT delete anything: the
// cards stay in the DB and in the `cards` array; only the board paint
// excludes them. Delete them only on Winny's explicit order.
// site/app.js (127KB) exceeds the API push size limit, so this lives here
// (same pattern as longterm-patch.js): wrap the global render().
(function() {
  'use strict';
  if (typeof window.render !== 'function' || window.__luttuBoardFilter) return;
  window.__luttuBoardFilter = true;
  var origRender = window.render;
  window.render = function() {
    var saved = (typeof cards !== 'undefined') ? cards : null;
    if (!saved) { origRender(); return; }
    cards = saved.filter(function(c) { return !(c.tags || []).includes('luttu'); });
    try {
      origRender();
    } finally {
      cards = saved;
    }
  };
})();
