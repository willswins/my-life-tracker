// Long Term view: simple boxes for long-term reminders. No dates.
// Cards tagged 'longterm' (excluded from My Board). Uses existing cards API.
// Loads after app.js.
(function() {
'use strict';

var LT_TAG = 'longterm';
var ltEditingId = null;
var ltCardsCache = null;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Get longterm cards: sync from window.cards if available, else fetch from API
async function getLtCards() {
  // Try window.cards first (populated by app.js or previous saves)
  var wc = window.cards || [];
  var fromWindow = wc.filter(function(c) {
    return (c.tags || []).indexOf(LT_TAG) !== -1 && !c.deleted_at;
  });
  if (fromWindow.length > 0 || ltCardsCache) {
    return ltCardsCache || fromWindow;
  }
  // Fallback: fetch directly from API
  try {
    if (typeof api === 'function') {
      var all = await api('GET', '/api/app?r=cards');
      ltCardsCache = all.filter(function(c) {
        return (c.tags || []).indexOf(LT_TAG) !== -1 && !c.deleted_at;
      });
      // Sync to window.cards for consistency
      window.cards = all;
      return ltCardsCache;
    }
  } catch (e) {}
  return [];
}

// Global: called by app.js switchView
window.renderLongTerm = async function() {
  var grid = document.getElementById('lt-grid');
  if (!grid) return;
  var items = await getLtCards();
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = '<p class="lt-empty">Nothing here yet. Add your first long-term reminder — the things you want to see every day and never forget.</p>';
    return;
  }
  items.forEach(function(c) {
    var box = document.createElement('div');
    box.className = 'lt-box';
    box.innerHTML =
      '<div class="lt-box-title">' + esc(c.title) + '</div>' +
      (c.details ? '<div class="lt-box-notes">' + esc(c.details) + '</div>' : '') +
      '<button class="lt-to-task" data-id="' + esc(c.id) + '" title="Move to My Board">→ Tasks</button>';
    box.querySelector('.lt-box-title').addEventListener('click', function(e) {
      e.stopPropagation();
      openLtModal(c.id);
    });
    var moveBtn = box.querySelector('.lt-to-task');
    if (moveBtn) moveBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      moveToTasks(c.id);
    });
    grid.appendChild(box);
  });
};

// Move a long-term card back to My Board (remove longterm tag)
async function moveToTasks(id) {
  try {
    var c = (window.cards || []).find(function(x) { return x.id === id; });
    var tags = ((c && c.tags) || []).filter(function(t) { return t !== LT_TAG; });
    await api('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(id), { tags: tags });
    if (c) c.tags = tags;
    ltCardsCache = null;
    window.renderLongTerm();
    if (typeof toast === 'function') toast('Moved to My Board');
  } catch (e) {
    if (typeof toast === 'function') toast('Could not move. Please try again.');
  }
}

function openLtModal(id) {
  ltEditingId = id || null;
  var c = id ? (window.cards || []).find(function(x) { return x.id === id; }) : null;
  ensureLtModal();
  document.getElementById('ltm-title').value = c ? (c.title || '') : '';
  document.getElementById('ltm-notes').value = c ? (c.details || '') : '';
  document.getElementById('ltm-delete').style.display = c ? '' : 'none';
  document.getElementById('ltm-modal').classList.remove('hidden');
  setTimeout(function() { document.getElementById('ltm-title').focus(); }, 50);
}

function closeLtModal() {
  document.getElementById('ltm-modal').classList.add('hidden');
  ltEditingId = null;
}

function ensureLtModal() {
  if (document.getElementById('ltm-modal')) return;
  var div = document.createElement('div');
  div.id = 'ltm-modal';
  div.className = 'modal-backdrop hidden';
  div.innerHTML =
    '<div class="modal">' +
      '<h3>Long-term reminder</h3>' +
      '<label>Title<input id="ltm-title" type="text" maxlength="120"></label>' +
      '<label>Notes<textarea id="ltm-notes" rows="3"></textarea></label>' +
      '<div class="modal-actions">' +
        '<button id="ltm-delete" class="btn-danger">Delete</button>' +
        '<button id="ltm-cancel" class="btn-secondary">Cancel</button>' +
        '<button id="ltm-save" class="btn-primary">Save</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(div);
  document.getElementById('ltm-save').addEventListener('click', saveLt);
  document.getElementById('ltm-cancel').addEventListener('click', closeLtModal);
  document.getElementById('ltm-delete').addEventListener('click', deleteLt);
  div.addEventListener('click', function(e) { if (e.target === div) closeLtModal(); });
}

async function saveLt() {
  var title = document.getElementById('ltm-title').value.trim();
  var notes = document.getElementById('ltm-notes').value.trim();
  if (!title) {
    document.getElementById('ltm-title').focus();
    return;
  }
  try {
    if (ltEditingId) {
      var updated = await api('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(ltEditingId), {
        title: title, details: notes
      });
      var c = (window.cards || []).find(function(x) { return x.id === ltEditingId; });
      if (c) Object.assign(c, updated);
    } else {
      var created = await api('POST', '/api/app?r=cards', {
        title: title, details: notes, lane: 'now', tags: [LT_TAG]
      });
      (window.cards = window.cards || []).push(created);
    }
    ltCardsCache = null;
    closeLtModal();
    window.renderLongTerm();
  } catch (e) {
    if (typeof toast === 'function') toast('Could not save. Please try again.');
  }
}

async function deleteLt() {
  if (!ltEditingId) return;
  if (!confirm('Delete this long-term reminder?')) return;
  try {
    await api('DELETE', '/api/app?r=cards&id=' + encodeURIComponent(ltEditingId));
    var c = (window.cards || []).find(function(x) { return x.id === ltEditingId; });
    if (c) c.deleted_at = new Date().toISOString();
    ltCardsCache = null;
    closeLtModal();
    window.renderLongTerm();
  } catch (e) {
    if (typeof toast === 'function') toast('Could not delete. Please try again.');
  }
}

// Expose moveToTasks for task board integration
window.ltMoveToTasks = moveToTasks;
// Expose modal opener for the + Add button
window.ltOpenAdd = function() { openLtModal(null); };

// Wire up the + Add button
function wireLtAdd() {
  var btn = document.getElementById('lt-add');
  if (btn && !btn.hasAttribute('data-lt-wired')) {
    btn.setAttribute('data-lt-wired', '1');
    btn.addEventListener('click', function() { openLtModal(null); });
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireLtAdd);
else wireLtAdd();

})();
