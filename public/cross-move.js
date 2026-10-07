// Cross-move: copy/move items between My Board and Reminders.
// Loads after app.js and reminder-views.js.
(function() {
'use strict';

// --- Reminder -> Board ---
async function reminderToBoard(id, move) {
  const r = (window.reminders || []).find((x) => String(x.id) === String(id));
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
      const idx = window.reminders.findIndex((x) => String(x.id) === String(id));
      if (idx >= 0) window.reminders.splice(idx, 1);
      renderReminders();
    }
    // Refresh board data if the function exists
    if (typeof loadCards === 'function') { await loadCards(); }
    toast(move ? 'Moved to Board (Now).' : 'Copied to Board (Now).');
  } catch (e) {
    toast('Could not move to Board. Please try again.');
  }
}

// --- Card -> Reminder ---
async function cardToReminder(cardId, move) {
  const c = (window.cards || []).find((x) => String(x.id) === String(cardId));
  if (!c) { toast('Card not found.'); return; }
  try {
    // Default: tomorrow, same time; reminder 1 hour before (standing rule)
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
      const idx = window.cards.findIndex((x) => String(x.id) === String(cardId));
      if (idx >= 0) window.cards.splice(idx, 1);
      if (typeof render === 'function') render();
    }
    if (typeof updateBadges === 'function') { await updateBadges(); }
    if (typeof renderReminders === 'function') { renderReminders(); }
    // Close the detail modal
    const bd = document.getElementById('detail-backdrop');
    if (bd) bd.classList.add('hidden');
    toast(move ? 'Moved to Reminders (tomorrow).' : 'Copied to Reminders (tomorrow).');
  } catch (e) {
    toast('Could not move to Reminders. Please try again.');
  }
}

// --- Wire into remAct (reminder ⋮ menu) ---
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
  // detailId is the global set by openDetail()
  if (copyBtn && !copyBtn.dataset.wired) {
    copyBtn.dataset.wired = '1';
    copyBtn.addEventListener('click', () => {
      const cid = (typeof detailId !== 'undefined') ? detailId : null;
      if (cid) cardToReminder(cid, false);
    });
  }
  if (moveBtn && !moveBtn.dataset.wired) {
    moveBtn.dataset.wired = '1';
    moveBtn.addEventListener('click', () => {
      const cid = (typeof detailId !== 'undefined') ? detailId : null;
      if (cid) cardToReminder(cid, true);
    });
  }
}
// Wire on load and re-wire when detail opens (in case DOM was re-rendered)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireCardDetailButtons);
} else {
  wireCardDetailButtons();
}
// Also hook openDetail to re-wire
const origOpenDetail = window.openDetail;
if (origOpenDetail) {
  window.openDetail = async function(id) {
    const r = await origOpenDetail(id);
    wireCardDetailButtons();
    return r;
  };
}
})();
