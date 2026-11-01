// public/board2.js — the Board, rebuilt as ONE module (Winny,
// 2026-10-31: "My board and its sub menus are all messed up... Drop the
// entire page... implement an intuitive screen"). Spec:
// ~/workspace/design-mockups/Board-Functionality-Spec.md
//
// This module replaces window.render (the board paint). It keeps the
// app's DOM skeleton (#board, #lanes, lane sections, h2 + .count) so
// the design layer's lane switcher, badges and refresh keep working,
// and it keeps every capability of the old stack: tag filter + Deleted
// toggle (via the app's renderTagFilter), search (the app's #search
// binding feeds the searchText global), compact toggle (body.compact),
// drag & drop, detail modal (the app's openDetail), edit modal, and
// the cross-screen sends — Long Term, Copy/Move to Reminders — on the
// same APIs with the same defaults as cross-move.js/task-to-lt.js.
// Cards are minimized by default (Winny, 2026-10-31); tap expands.
//
// app.js declares cards/boardTagFilter/searchText/showDeleted with
// top-level let: they are lexical globals — read/write them bare,
// never as window.* (the cross-move.js lesson).
(function () {
  'use strict';

  var LANES = [
    { id: 'now', label: 'Now', color: '#6c5ce7' },
    { id: 'next', label: 'Next', color: '#2563eb' },
    { id: 'waiting', label: 'Waiting on others', color: '#d97706' },
    { id: 'done', label: 'Done', color: '#16a34a' },
  ];
  var HIDDEN_TAGS = ['luttu', 'mood', 'news', 'longterm'];
  var TAG_COLORS = { work: '#6c5ce7', personal: '#12a150', eben: '#f59e0b', Irwin: '#0284c7', Santhi: '#db2777' };
  var SIZE_LABELS_LOCAL = { high: 'Big rock', normal: 'Medium', low: 'Small' };

  var CSS = [
    ':root{--b2-surface:#ffffff;--b2-line:#e3e0ee;--b2-ink:#1d1a2e;--b2-ink2:#4c4763;--b2-muted:#6f6a85;--b2-chipbg:#eceaf4;--b2-chipink:#4c4763;}',
    ':root[data-theme="dark"]{--b2-surface:#1c1a26;--b2-line:#2b2838;--b2-ink:#f2f0fa;--b2-ink2:#c9c4dd;--b2-muted:#9d97b5;--b2-chipbg:#232130;--b2-chipink:#c9c4dd;}',
    '@media (min-width:1280px){#lanes{grid-template-columns:repeat(4,1fr);}}',
    '@media (min-width:900px) and (max-width:1279px){#lanes{grid-template-columns:repeat(2,1fr);}}',
    '#lanes .lane h2{display:flex;align-items:center;gap:8px;}',
    '.b2-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;}',
    '#lanes .lane h2 .count{background:var(--b2-chipbg);color:var(--b2-chipink);border-radius:999px;padding:1px 9px;font-size:12px;font-weight:700;}',
    '.b2-card{position:relative;background:var(--b2-surface);border:1px solid var(--b2-line);border-radius:16px;',
    'padding:10px 34px 10px 16px;margin-bottom:8px;cursor:pointer;overflow:hidden;color:var(--b2-ink);}',
    '.b2-card.dragging{opacity:.5;}',
    '.b2-bar{position:absolute;left:0;top:0;bottom:0;width:5px;}',
    '.b2-title{font-size:14.5px;font-weight:650;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
    '.b2-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;align-items:center;}',
    '.b2-chip{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--b2-chipbg);color:var(--b2-chipink);line-height:1.5;}',
    '.b2-chip.due-over{background:#dc2626;color:#fff;}',
    '.b2-chip.due-today{background:#f59e0b;color:#3a2a00;}',
    '.b2-chev{position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:8px;border:0;background:var(--b2-chipbg);',
    'color:var(--b2-muted);font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;font-family:inherit;}',
    '.b2-details{margin-top:8px;font-size:13.5px;line-height:1.45;color:var(--b2-ink2);white-space:pre-wrap;word-break:break-word;}',
    '.b2-tags{margin-top:8px;}',
    '.b2-actions{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;}',
    '.b2-abtn{border:1px solid var(--b2-line);background:var(--b2-chipbg);color:var(--b2-ink);border-radius:999px;',
    'padding:6px 13px;min-height:34px;font-size:12.5px;font-weight:650;cursor:pointer;font-family:inherit;}',
    '.b2-abtn.done{background:#16a34a;border-color:#16a34a;color:#fff;}',
    '.b2-abtn.restore{background:#6c5ce7;border-color:#6c5ce7;color:#fff;}',
    '.b2-empty{border:1.5px dashed var(--b2-line);border-radius:12px;padding:16px 10px;text-align:center;color:var(--b2-muted);font-size:12.5px;}',
    '.b2-card.is-deleted{opacity:.72;}',
    '#board .cards.dragover{outline:2px dashed #6c5ce7;outline-offset:-4px;border-radius:12px;}',
    'body.compact .b2-card{padding:7px 32px 7px 15px;}',
    'body.compact .b2-meta{margin-top:4px;}',
    'body.compact .b2-chip:not(.due-over){display:none;}',
    '#lanes{padding-bottom:calc(84px + env(safe-area-inset-bottom,0px));}',
    '@media (pointer:coarse){.b2-chev{width:44px;height:44px;top:2px;right:2px;}.b2-abtn{min-height:44px;}}',
  ].join('\n');

  var expanded = {}; // card id -> true, session only
  var menuCardId = null;

  // ---- pure helpers (exported for tests) --------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function tagColor(c) {
    var t = c.tag || (c.tags || [])[0] || '';
    return TAG_COLORS[t] || '#9d97b5';
  }
  function visibleCards(list, opts) {
    var q = (opts.q || '').trim().toLowerCase();
    return (list || []).filter(function (c) {
      var tags = c.tags || [];
      for (var i = 0; i < HIDDEN_TAGS.length; i++) if (tags.includes(HIDDEN_TAGS[i])) return false;
      if (opts.tagFilter && !tags.includes(opts.tagFilter)) return false;
      if (q && !((c.title || '') + ' ' + (c.details || '') + ' ' + (c.owner || '')).toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function dueChip(c, today) {
    if (!c.due_date || c.lane === 'done') return null;
    var due = String(c.due_date).slice(0, 10);
    var label = 'Due ' + due.slice(5).replace('-', '/');
    try {
      var d = new Date(due + 'T12:00:00');
      label = 'Due ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) {}
    if (due < today) return { cls: 'due-over', text: 'Overdue · ' + label.replace('Due ', '') };
    if (due === today) return { cls: 'due-today', text: 'Due today' };
    return { cls: '', text: label };
  }
  function todayStr() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  // No dates on the Board screen (Winny, 2026-10-31) — expanded details
  // included: capture chrome lines (From:/Date:/Gmail ID:/Source:) are
  // dropped and date tokens are stripped from the RENDERED text. The
  // stored card is untouched; the detail modal still shows everything.
  var MONTH_RX = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+20\\d{2})?';
  function boardDetails(text) {
    var t = String(text == null ? '' : text);
    t = t.split('\n').filter(function (l) { return !/^(From|Date|Gmail ID|Source):/.test(l.trim()); }).join('\n');
    t = t.replace(new RegExp('\\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\\s+(?=' + MONTH_RX + ')', 'g'), '');
    t = t.replace(new RegExp('\\b' + MONTH_RX + '\\b', 'g'), '');
    t = t.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, '');
    t = t.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '');
    t = t.replace(/\(due\s*\)/gi, '');
    t = t.replace(/\(\s*\)/g, '');
    t = t.split('\n').map(function (l) {
      return l.replace(/[ \t]{2,}/g, ' ').replace(/^\s*[:\-–—]\s*/, '').trim();
    }).filter(function (l) { return l.length > 0; }).join('\n');
    return t;
  }
  function reminderPayload(c, nowMs) {
    var ev = new Date(nowMs + 24 * 3600 * 1000);
    var remindAt = new Date(ev.getTime() - 3600 * 1000);
    return {
      title: c.title,
      detail: c.details || '',
      event_at: ev.toISOString(),
      remind_at: remindAt.toISOString(),
      recurrence: null,
      tag: (c.tags && c.tags[0]) || c.tag || null,
      tags: c.tags || [],
      status: 'active',
    };
  }
  function cardHTML(c, opts) {
    var open = !!opts.open;
    // No dates on the Board screen (Winny, 2026-10-31): due dates live
    // on the card's detail/edit screens and in Reminders, not here.
    var sizeLabel = (typeof SIZE_LABELS !== 'undefined' && SIZE_LABELS[c.priority]) || SIZE_LABELS_LOCAL[c.priority] || c.priority;
    var h = '<div class="b2-bar" style="background:' + tagColor(c) + '"></div>';
    h += '<div class="b2-title">' + esc(c.title) + '</div>';
    var meta = '';
    if (c.priority === 'high') meta += '<span class="b2-chip">' + esc(sizeLabel) + '</span>';
    if (c.owner) meta += '<span class="b2-chip">👤 ' + esc(c.owner) + '</span>';
    if (opts.deleted) meta += '<span class="b2-chip due-over">Deleted</span>';
    if (meta) h += '<div class="b2-meta">' + meta + '</div>';
    if (open) {
      if (c.details) {
        var cleaned = boardDetails(c.details);
        var det = (typeof renderDetails === 'function') ? renderDetails(cleaned) : esc(cleaned);
        if (cleaned) h += '<div class="b2-details">' + det + '</div>';
      }
      if ((c.tags || []).length && typeof tagBubblesHtml === 'function') {
        h += '<div class="b2-tags">' + tagBubblesHtml(c.tags) + '</div>';
      }
      h += '<div class="b2-actions">';
      if (opts.deleted) {
        h += '<button type="button" class="b2-abtn restore" data-b2act="restore">Restore</button>';
      } else {
        var idx = LANES.findIndex(function (l) { return l.id === c.lane; });
        if (idx > 0) h += '<button type="button" class="b2-abtn" data-b2act="left">← ' + esc(LANES[idx - 1].label) + '</button>';
        if (idx >= 0 && idx < LANES.length - 1) h += '<button type="button" class="b2-abtn" data-b2act="right">' + esc(LANES[idx + 1].label) + ' →</button>';
        if (c.lane !== 'done') h += '<button type="button" class="b2-abtn done" data-b2act="done">✓ Done</button>';
        h += '<button type="button" class="b2-abtn" data-b2act="edit">Edit</button>';
        h += '<button type="button" class="b2-abtn" data-b2act="menu">⋯ Send to</button>';
      }
      h += '</div>';
    }
    h += '<button type="button" class="b2-chev" data-b2act="chev" aria-label="Expand or minimize">' + (open ? '▴' : '▾') + '</button>';
    return h;
  }

  // ---- app-state access ---------------------------------------------------
  function getCards() { try { return (typeof cards !== 'undefined') ? cards : []; } catch (e) { return []; } }
  function isDeletedMode() { try { return (typeof showDeleted !== 'undefined') ? !!showDeleted : false; } catch (e) { return false; } }
  function notify(msg) { if (typeof toast === 'function') toast(msg); }

  // ---- render ---------------------------------------------------------------
  function render() {
    var board = document.getElementById('board');
    if (!board) return;
    var deleted = isDeletedMode();
    // tag filter row (the app's builder also adds the Deleted toggle)
    var tfBox = document.getElementById('board-tag-filter');
    if (tfBox && typeof renderTagFilter === 'function') {
      try {
        renderTagFilter(tfBox, (typeof boardTagFilter !== 'undefined' ? boardTagFilter : ''), function (v) {
          boardTagFilter = v;
          render();
        }, true);
      } catch (e) { /* filter row is best-effort */ }
    }
    var q = ''; try { q = (typeof searchText !== 'undefined') ? searchText : ''; } catch (e) {}
    var tagF = ''; try { tagF = (typeof boardTagFilter !== 'undefined') ? boardTagFilter : ''; } catch (e) {}
    var list = visibleCards(getCards(), { q: q, tagFilter: tagF });
    var today = todayStr();
    document.querySelectorAll('#lanes .lane').forEach(function (laneEl) {
      var lane = laneEl.dataset.lane;
      var meta = LANES.filter(function (l) { return l.id === lane; })[0] || { label: lane, color: '#9d97b5' };
      var items = list.filter(function (c) { return c.lane === lane; });
      var h2 = laneEl.querySelector('h2');
      if (h2) h2.innerHTML = '<span class="b2-dot" style="background:' + meta.color + '"></span>' + esc(meta.label) + ' <span class="count">(' + items.length + ')</span>';
      var box = laneEl.querySelector('.cards');
      if (!box) return;
      box.innerHTML = '';
      if (!items.length) {
        var empty = document.createElement('div');
        empty.className = 'b2-empty';
        empty.textContent = deleted ? 'Nothing deleted here' : 'No cards';
        box.appendChild(empty);
      }
      items.forEach(function (c) {
        var el = document.createElement('div');
        el.className = 'b2-card' + (deleted ? ' is-deleted' : '');
        el.dataset.cid = c.id;
        el.draggable = !deleted;
        el.innerHTML = cardHTML(c, { open: !!expanded[c.id], deleted: deleted, today: today });
        el.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/plain', String(c.id));
          el.classList.add('dragging');
        });
        el.addEventListener('dragend', function () { el.classList.remove('dragging'); });
        box.appendChild(el);
      });
      box.ondragover = function (e) { e.preventDefault(); box.classList.add('dragover'); };
      box.ondragleave = function () { box.classList.remove('dragover'); };
      box.ondrop = async function (e) {
        e.preventDefault();
        box.classList.remove('dragover');
        var id = e.dataTransfer.getData('text/plain');
        var c = getCards().find(function (x) { return String(x.id) === id; });
        if (!c || c.lane === lane) return;
        await moveLane(c, lane);
      };
    });
  }

  // ---- actions ---------------------------------------------------------------
  async function patchCard(c, body) {
    var updated = await api('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(c.id), body);
    if (updated && typeof updated === 'object') Object.assign(c, updated);
  }
  async function moveLane(c, lane) {
    try { await patchCard(c, { lane: lane }); render(); }
    catch (e) { notify('Could not move the card. Please try again.'); }
  }
  async function doAct(id, act, el) {
    var c = getCards().find(function (x) { return String(x.id) === String(id); });
    if (!c) return;
    try {
      if (act === 'chev') { expanded[c.id] = !expanded[c.id]; render(); return; }
      if (act === 'left' || act === 'right') {
        var idx = LANES.findIndex(function (l) { return l.id === c.lane; }) + (act === 'right' ? 1 : -1);
        if (idx >= 0 && idx < LANES.length) await moveLane(c, LANES[idx].id);
        return;
      }
      if (act === 'done') { await patchCard(c, { lane: 'done' }); render(); return; }
      if (act === 'edit') { if (typeof openModal === 'function') openModal(c); return; }
      if (act === 'restore') {
        await patchCard(c, { restore: true });
        if (typeof loadCards === 'function') await loadCards();
        render();
        return;
      }
      if (act === 'menu') { openMenu(c, el); return; }
    } catch (e) {
      notify('Could not save that change. Please try again.');
    }
  }
  async function sendTo(id, kind) {
    var c = getCards().find(function (x) { return String(x.id) === String(id); });
    if (!c) return;
    try {
      if (kind === 'longterm') {
        var tags = (c.tags || []).slice();
        if (!tags.includes('longterm')) tags.push('longterm');
        await patchCard(c, { tags: tags });
        notify('Moved to Long Term');
        render();
      } else if (kind === 'rem-copy' || kind === 'rem-move') {
        await api('POST', '/api/app?r=daybook&view=reminders', reminderPayload(c, Date.now()));
        if (kind === 'rem-move') {
          await api('DELETE', '/api/app?r=cards&id=' + encodeURIComponent(c.id));
          var list = getCards();
          var ix = list.findIndex(function (x) { return String(x.id) === String(c.id); });
          if (ix >= 0) list.splice(ix, 1);
          notify('Moved to Reminders (tomorrow).');
        } else {
          notify('Copied to Reminders (tomorrow).');
        }
        if (typeof updateBadges === 'function') await updateBadges();
        if (typeof renderReminders === 'function') renderReminders();
        render();
      } else if (kind === 'delete') {
        await api('DELETE', '/api/app?r=cards&id=' + encodeURIComponent(c.id));
        if (typeof loadCards === 'function') await loadCards();
        render();
      }
    } catch (e) {
      notify('Could not complete that. Please try again.');
    }
  }

  // ---- ⋯ Send-to menu (reuses the themed .popup-menu surface) ----------------
  function ensureMenu() {
    var m = document.getElementById('b2-menu');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'b2-menu';
    m.className = 'popup-menu hidden';
    m.setAttribute('role', 'menu');
    m.innerHTML =
      '<button type="button" data-b2send="longterm">→ Long Term</button>' +
      '<button type="button" data-b2send="rem-copy">Copy to Reminders</button>' +
      '<button type="button" data-b2send="rem-move">Move to Reminders</button>' +
      '<button type="button" data-b2send="delete" class="danger">Delete</button>';
    m.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = menuCardId;
        closeMenu();
        if (id != null) sendTo(id, b.dataset.b2send);
      });
    });
    document.body.appendChild(m);
    return m;
  }
  function openMenu(c, anchor) {
    var m = ensureMenu();
    menuCardId = c.id;
    m.classList.remove('hidden');
    var r = anchor.getBoundingClientRect();
    var mw = m.offsetWidth, mh = m.offsetHeight;
    var x = Math.min(r.right - mw, window.innerWidth - mw - 8);
    var y = r.bottom + 6;
    if (y + mh > window.innerHeight - 8) y = Math.max(8, r.top - mh - 6);
    m.style.left = Math.max(8, x) + 'px';
    m.style.top = y + 'px';
  }
  function closeMenu() {
    var m = document.getElementById('b2-menu');
    if (m) m.classList.add('hidden');
    menuCardId = null;
  }

  // ---- wiring -------------------------------------------------------------------
  function onBoardClick(e) {
    var btn = e.target;
    while (btn && btn !== document.body && !(btn.dataset && btn.dataset.b2act)) btn = btn.parentNode;
    var cardEl = e.target;
    while (cardEl && cardEl !== document.body && !(cardEl.classList && cardEl.classList.contains('b2-card'))) cardEl = cardEl.parentNode;
    if (btn && btn.dataset && btn.dataset.b2act && cardEl && cardEl.dataset.cid) {
      e.stopPropagation();
      doAct(cardEl.dataset.cid, btn.dataset.b2act, btn);
      return;
    }
    if (cardEl && cardEl.dataset.cid) {
      closeMenu();
      var id = cardEl.dataset.cid;
      if (!expanded[id]) { expanded[id] = true; render(); }
      else if (typeof openDetail === 'function') openDetail(id);
    }
  }
  function tryInit() {
    if (!document.getElementById('b2-style')) {
      var st = document.createElement('style');
      st.id = 'b2-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var board = document.getElementById('board');
    if (board && !board._b2Wired) {
      board._b2Wired = true;
      board.addEventListener('click', onBoardClick);
      document.addEventListener('click', function (e) {
        var m = document.getElementById('b2-menu');
        if (m && !m.classList.contains('hidden') && !m.contains(e.target)) closeMenu();
      }, true);
    }
    if (typeof window.render === 'function' && !window.render._b2) {
      window.render = render;
      window.render._b2 = true;
      try { render(); } catch (e) {}
      return;
    }
    if (window.render && window.render._b2) return;
    setTimeout(tryInit, 300);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CSS: CSS, LANES: LANES, HIDDEN_TAGS: HIDDEN_TAGS,
      visibleCards: visibleCards, dueChip: dueChip, reminderPayload: reminderPayload,
      cardHTML: cardHTML, tagColor: tagColor, boardDetails: boardDetails, render: render };
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
