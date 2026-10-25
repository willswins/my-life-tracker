// Board filter: keep non-task cards off Winny's board.
// Winny, 2026-10-25 — the Work board was cluttered with Luttu's standing
// cards (watches, heartbeats, reviews). Luttu doesn't work from the board,
// so his cards don't belong on it. This does NOT delete anything: the
// cards stay in the DB and in the `cards` array; only the board paint
// excludes them. Delete them only on Winny's explicit order.
//
// 2026-10-25 (second fix): the same spill class — Mood check-ins
// (public/mood.js + public/home-mood.js save one card per tap, tags
// ["mood"]) and the daily news digest (daybook-news/fetch_news.py, tags
// ["news"]) — also land on the board. Mood and news are logs, never
// tasks, so they are excluded from the board paint too. The Mood view
// itself reads tag=mood cards via its own fetch and is unaffected; the
// news view is removed and its cron is disabled, so the news tag here
// only covers stragglers.
// site/app.js (127KB) exceeds the API push size limit, so this lives here
// (same pattern as longterm-patch.js): wrap the global render().
(function() {
  'use strict';
  if (typeof window.render !== 'function' || window.__luttuBoardFilter) return;
  window.__luttuBoardFilter = true;
  var HIDDEN_TAGS = ['luttu', 'mood', 'news'];
  var origRender = window.render;
  window.render = function() {
    var saved = (typeof cards !== 'undefined') ? cards : null;
    if (!saved) { origRender(); return; }
    cards = saved.filter(function(c) {
      var tags = c.tags || [];
      for (var i = 0; i < HIDDEN_TAGS.length; i++) {
        if (tags.includes(HIDDEN_TAGS[i])) return false;
      }
      return true;
    });
    try {
      origRender();
    } finally {
      cards = saved;
    }
  };
})();
