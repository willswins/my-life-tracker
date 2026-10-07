// Cross-move: copy/move items between My Board and Reminders.
// Loads after app.js and reminder-views.js.
//
// NOTE: app.js declares `cards`, `reminders`, `detailId` with top-level `let`,
// so they are global lexical bindings — NOT window properties. Access them as
// bare identifiers (they resolve through the scope chain), never window.cards.
(function() {
'use strict';

function getReminders() {
  try { return (typeof reminders !== 'undefined') ? reminders : []; }
  catch (e) { return []; }
}
function getCards() {
  try { return (typeof cards !== 'undefined') ? cards : []; }
  catch (e) { return []; }
}
function getDetailId() {
  try { return (typeof detailId !== 'undefined') ? detailId : null; }
  catch (e) { return null; }
}

// --- Reminder -> Board (lands in NOW column) ---
async function reminderToBoard(id, move) {
  const list = getReminders();
  const r = list.find((x) => String(x.id) === String(id));
  if (!r) { toast('Reminder not found.'); return; }
  try {
    const data = {
      title: r.title,
      details: r.detail || '',
      tag: r.tag || 'work',
      tags: r.tag ? [r.tag] : [],
      priority: 'normal',
      lane: 'now',
      due_date: null,
      owner: null,
    };
    await api('POST', '/api/app?r=cards', data);
    if (move) {
      await api('DELETE', '/api/app?r=daybook&view=reminders&id=' + encodeURIComponent(id));
      const idx = list.findIndex((x) => String(x.id) === String(id));
      if (idx >= 0) list.splice(idx, 1);
      if (typeof renderReminders === 'function') renderReminders();
    }
    if (typeof loadCards === 'function') { await loadCards(); }
    else if (typeof render === 'function') { render(); }
    toast(move ? 'Moved to Board (Now).' : 'Copied to Board (Now).');
  } catch (e) {
    toast('Could not move to Board. Please try again.');
  }
}

// --- Card -> Reminder (defaults to tomorrow, alert 1h before) ---
async function cardToReminder(cardId, move) {
  const list = getCards();
  const c = list.find((x) => String(x.id) === String(cardId));
  if (!c) { toast('Card not found.'); return; }
  try {
    const ev = new Date(Date.now() + 24 * 3600 * 1000);
    const remindAt = new Date(ev.getTime() - 3600 * 1000);
    const data = {
      title: c.title,
      detail: c.details || '',
      event_at: ev.toISOString(),
      remind_at: remindAt.toISOString(),
      recurrence: null,
      tag: (c.tags && c.tags[0]) || c.tag || null,
      tags: c.tags || [],
      status: 'active',
    };
    await api('POST', '/api/app?r=daybook&view=reminders', data);
    if (move) {
      await api('DELETE', '/api/app?r=cards&id=' + encodeURIComponent(cardId));
      const idx = list.findIndex((x) => String(x.id) === String(cardId));
      if (idx >= 0) list.splice(idx, 1);
      if (typeof render === 'function') render();
    }
    if (typeof updateBadges === 'function') { await updateBadges(); }
    if (typeof renderReminders === 'function') { renderReminders(); }
    const bd = document.getElementById('detail-backdrop');
    if (bd) bd.classList.add('hidden');
    toast(move ? 'Moved to Reminders (tomorrow).' : 'Copied to Reminders (tomorrow).');
  } catch (e) {
    toast('Could not move to Reminders. Please try again.');
  }
}

// --- Wire into remAct (reminder ⋮ menu) ---
// remAct is a function declaration in app.js -> available as window.remAct.
const origRemAct = window.remAct;
window.remAct = async function(id, a) {
  if (a === 'copy-to-board') { await reminderToBoard(id, false); return; }
  if (a === 'move-to-board') { await reminderToBoard(id, true); return; }
  if (origRemAct) return origRemAct(id, a);
};

// --- Wire card detail buttons ---
function wireCardDetailButtons() {
  const copyBtn = document.getElementById('d-copy-rem');
  const moveBtn = document.getElementById('d-move-rem');
  if (copyBtn && !copyBtn.dataset.wired) {
    copyBtn.dataset.wired = '1';
    copyBtn.addEventListener('click', () => {
      const cid = getDetailId();
      if (cid != null) cardToReminder(cid, false);
    });
  }
  if (moveBtn && !moveBtn.dataset.wired) {
    moveBtn.dataset.wired = '1';
    moveBtn.addEventListener('click', () => {
      const cid = getDetailId();
      if (cid != null) cardToReminder(cid, true);
    });
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireCardDetailButtons);
} else {
  wireCardDetailButtons();
}
const origOpenDetail = window.openDetail;
if (origOpenDetail) {
  window.openDetail = async function(id) {
    const r = await origOpenDetail(id);
    wireCardDetailButtons();
    return r;
  };
}
})();
