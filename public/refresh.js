// DayBook freshness (Winny, 2026-10-31): the app loaded its cards once
// at startup, so the board, Home counts, Habits and Long Term showed
// session-old data until a full reload — sweep-created cards never
// appeared. This patch makes navigation always land on fresh data and
// refreshes reminders every hour:
//  1. Switching to a card-driven view reloads the cards first (single-
//     flight), then the normal switch runs — it already re-fetches
//     reminders, links and the inbox count on every switch.
//  2. An hourly tick reloads cards + reminders/badges and re-renders
//     the Reminders or Home view when one of them is on screen.
(function () {
  'use strict';

  var CARD_VIEWS = { tasks: true, home: true, longterm: true, habits: true };
  var HOUR_MS = 60 * 60 * 1000;

  var cardsFlight = null;
  function freshCards() {
    if (typeof loadCards !== 'function') return Promise.resolve();
    if (!cardsFlight) {
      cardsFlight = Promise.resolve()
        .then(function () { return loadCards(); })
        .then(function () { cardsFlight = null; }, function () { cardsFlight = null; });
    }
    return cardsFlight;
  }

  function wrapSwitchView() {
    if (typeof window.switchView !== 'function' || window.switchView._freshPatched) return false;
    var orig = window.switchView;
    window.switchView = async function (name, push) {
      if (CARD_VIEWS[name]) {
        try { await freshCards(); } catch (e) { /* stale beats blank */ }
      }
      return orig.apply(this, arguments);
    };
    window.switchView._freshPatched = true;
    return true;
  }

  async function hourlyTick() {
    if (typeof document !== 'undefined' && document.hidden) return;
    try { await freshCards(); } catch (e) { /* keep current data */ }
    try { if (typeof updateBadges === 'function') await updateBadges(); } catch (e) { /* badges retry next switch */ }
    try {
      var view = (typeof currentView !== 'undefined') ? currentView : '';
      if (view === 'reminders' && typeof renderReminders === 'function') renderReminders();
      else if (view === 'home' && typeof renderHome === 'function') renderHome();
    } catch (e) { /* render is best-effort */ }
  }

  function startHourly() {
    if (window._freshHourlyStarted) return;
    window._freshHourlyStarted = true;
    setInterval(hourlyTick, HOUR_MS);
  }

  function tryInit() {
    if (wrapSwitchView()) { startHourly(); return; }
    setTimeout(tryInit, 300);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CARD_VIEWS: CARD_VIEWS, HOUR_MS: HOUR_MS, freshCards: freshCards, wrapSwitchView: wrapSwitchView, hourlyTick: hourlyTick };
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
