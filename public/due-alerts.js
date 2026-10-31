// Foreground due-reminder alerts (no push notifications).
// Shows an in-app banner when the app becomes visible with due reminders.
//
// Redesigned 2026-10-31 (Winny: "Notification popup is not readable").
// The old banner was one flex row — text span (flex:1 = basis 0) beside
// the View/× buttons inside a shrink-to-fit fixed container — so the
// text was crushed into a ~110px column and wrapped every two words,
// with all titles run together in one comma string. The new card is a
// block layout: a header ("N reminders due" + ×), one row per reminder
// (title clamped to 2 lines, due time at the right, hairline between
// rows, "+N more" when over the cap), and a full-width View button.
(function () {
  'use strict';

  var MAX_ITEMS = 3;

  // ---------------- pure helpers (node-testable) ----------------

  // "8:00 AM" for today, "Oct 28, 8:00 AM" for earlier days.
  function dueWhen(iso, now) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    var sameDay = d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) return time;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + time;
  }

  // View model for the card from the due-reminder list.
  function dueModel(due, now) {
    var n = due.length;
    return {
      heading: n + ' reminder' + (n > 1 ? 's' : '') + ' due',
      items: due.slice(0, MAX_ITEMS).map(function (r) {
        return { title: r.title || '(untitled)', when: dueWhen(r.remind_at, now) };
      }),
      more: n > MAX_ITEMS ? n - MAX_ITEMS : 0,
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { dueWhen: dueWhen, dueModel: dueModel };
  }
  if (typeof document === 'undefined') return;

  // ---------------- styles (override the old .due-banner rules) ----------------

  function injectStyles() {
    if (document.getElementById('due2-style')) return;
    var css = [
      '.due-banner{position:fixed;top:calc(10px + env(safe-area-inset-top, 0px));left:12px;right:12px;transform:none;z-index:9999;display:block;background:#1e293b;color:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:14px 16px 12px;font-size:14px;line-height:1.4;max-width:none;}',
      '.due-banner.hidden{display:none;}',
      '.due2-head{display:flex;align-items:center;gap:10px;margin-bottom:4px;}',
      '.due2-title{flex:1;font-size:15px;font-weight:700;letter-spacing:.01em;}',
      '.due2-x{background:none;border:none;color:#94a3b8;font-size:22px;line-height:1;cursor:pointer;padding:2px 4px;}',
      '.due2-item{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-top:1px solid rgba(255,255,255,.14);}',
      '.due2-item-title{flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14.5px;line-height:1.35;}',
      '.due2-item-when{flex:none;color:#cbd5e1;font-size:12.5px;padding-top:2px;white-space:nowrap;}',
      '.due2-more{padding:6px 0 2px;color:#94a3b8;font-size:13px;}',
      '.due2-view{display:block;width:100%;margin-top:10px;background:#3b82f6;color:#fff;border:none;border-radius:9px;padding:10px 12px;font-size:14px;font-weight:600;cursor:pointer;}',
    ].join('\n');
    var st = document.createElement('style');
    st.id = 'due2-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------------- banner ----------------

  var _dueShown = false;

  function checkDue() {
    if (_dueShown || typeof reminders === 'undefined') return;
    try {
      var t = Date.now();
      var d = reminders.filter(function (r) {
        return (r.status === 'active' || r.status === 'snoozed')
          && new Date(r.remind_at).getTime() <= t;
      });
      if (!d.length) return;
      _dueShown = true;
      showBanner(dueModel(d, new Date()));
    } catch (e) { /* the banner must never break the app */ }
  }

  function showBanner(model) {
    injectStyles();
    var b = document.getElementById('due-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'due-banner';
      b.className = 'due-banner hidden';
      document.body.appendChild(b);
      b.addEventListener('click', function (e) {
        if (e.target.closest('.due2-x')) b.classList.add('hidden');
        if (e.target.closest('.due2-view')) {
          b.classList.add('hidden');
          location.hash = '#/reminders';
        }
      });
    }
    b.textContent = '';
    var head = document.createElement('div');
    head.className = 'due2-head';
    var title = document.createElement('span');
    title.className = 'due2-title';
    title.textContent = model.heading;
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'due2-x';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = '×';
    head.appendChild(title);
    head.appendChild(x);
    b.appendChild(head);
    model.items.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'due2-item';
      var tt = document.createElement('span');
      tt.className = 'due2-item-title';
      tt.textContent = it.title;
      row.appendChild(tt);
      if (it.when) {
        var w = document.createElement('span');
        w.className = 'due2-item-when';
        w.textContent = it.when;
        row.appendChild(w);
      }
      b.appendChild(row);
    });
    if (model.more) {
      var more = document.createElement('div');
      more.className = 'due2-more';
      more.textContent = '+' + model.more + ' more';
      b.appendChild(more);
    }
    var view = document.createElement('button');
    view.type = 'button';
    view.className = 'due2-view';
    view.textContent = 'View reminders';
    b.appendChild(view);
    b.classList.remove('hidden');
    clearTimeout(b._t);
    b._t = setTimeout(function () { b.classList.add('hidden'); }, 12000);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkDue();
  });
  window.addEventListener('focus', checkDue);
  setTimeout(checkDue, 2000);
})();
