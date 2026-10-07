// Long Term view: simple boxes for long-term reminders. No dates.
// Cards tagged 'longterm' (excluded from My Board). Uses existing cards API.
// Loads after app.js.
// Build trigger: force fresh Vercel build.
(function() {
'use strict';

var LT_TAG = 'longterm';
var ltEditingId = null;

function ltCards() {
  return (window.cards || []).filter(function(c) {
    return (c.tags || []).indexOf(LT_TAG) !== -1 && !c.deleted_at;
  });
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Global: called by app.js switchView
window.renderLongTerm = function() {
  var grid = document.getElementById('lt-grid');
  if (!grid) return;
  var items = ltCards();
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
      (c.details ? '<div class="lt-box-notes">' + esc(c.details) + '</div>' : '');
    box.addEventListener('click', function() { openLtModal(c.id); });
    grid.appendChild(box);
  });
};

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
  var m = document.createElement('div');
  m.id = 'ltm-modal';
  m.className = 'modal-backdrop hidden';
  m.innerHTML =
    '<div class="modal ltm-modal">' +
      '<h3 id="ltm-heading">Long-term reminder</h3>' +
      '<label>Title<input id="ltm-title" type="text" maxlength="120" placeholder="e.g. NCSSM — 2 year plan"></label>' +
      '<label>Notes<textarea id="ltm-notes" rows="4" placeholder="What should you remember when you glance at this?"></textarea></label>' +
      '<div class="ltm-actions">' +
        '<button id="ltm-delete" class="btn-danger">Delete</button>' +
        '<span class="ltm-spacer"></span>' +
        '<button id="ltm-cancel" class="btn-secondary">Cancel</button>' +
        '<button id="ltm-save" class="btn-primary">Save</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  m.addEventListener('click', function(e) {
    if (e.target === m) closeLtModal();
  });
  document.getElementById('ltm-cancel').addEventListener('click', closeLtModal);
  document.getElementById('ltm-save').addEventListener('click', saveLt);
  document.getElementById('ltm-delete').addEventListener('click', deleteLt);
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
    window.cards = (window.cards || []).filter(function(x) { return x.id !== ltEditingId; });
    closeLtModal();
    window.renderLongTerm();
  } catch (e) {
    if (typeof toast === 'function') toast('Could not delete. Please try again.');
  }
}

function wireLongTerm() {
  var addBtn = document.getElementById('lt-add');
  if (addBtn && !addBtn.dataset.wired) {
    addBtn.dataset.wired = '1';
    addBtn.addEventListener('click', function() { openLtModal(null); });
  }
  // Escape closes the modal
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var m = document.getElementById('ltm-modal');
      if (m && !m.classList.contains('hidden')) closeLtModal();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireLongTerm);
} else {
  wireLongTerm();
}
})();
