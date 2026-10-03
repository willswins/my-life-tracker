/* My Kanban Board — client logic. Cards live in Supabase Postgres and are
   loaded/saved through /api/cards. No board data is stored in the browser
   or in git. */
'use strict';

const LANES = ['now', 'next', 'waiting', 'done'];
const LANE_LABELS = { now: 'Now', next: 'Next', waiting: 'Waiting on others', done: 'Done' };
const SIZE_LABELS = { high: 'Big rock', normal: 'Medium', low: 'Small' };
const ITYPE_LABELS = { task: 'Task', story: 'Story', bug: 'Bug' };
const ITYPE_GLYPH = { task: '\u2713', story: '\u25ae', bug: '\u25cf' };

let cards = [];
let filter = 'all';
let searchText = '';
let editingId = null;
let detailId = null;
let showDeleted = false;
let isAdmin = false;
let compactView = false;

async function api(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401) {
    location.href = '/login';
    throw new Error('unauthorized');
  }
  if (!r.ok) throw new Error('request failed: ' + r.status);
  return r.status === 204 ? null : r.json();
}

async function loadCards() {
  cards = await api('GET', '/api/cards' + (showDeleted ? '?deleted=only' : ''));
}

async function init() {
  try {
    const me = await api('GET', '/api/me');
    isAdmin = !!me.admin;
    if (!isAdmin) document.getElementById('menu-invite').style.display = 'none';
  } catch (e) { /* non-fatal */ }
  try {
    await loadCards();
  } catch (e) {
    document.querySelector('#board').innerHTML =
      '<p style="color:#b91c1c">Could not load cards. Please refresh.</p>';
    return;
  }
  render();
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isOverdue(c) {
  if (!c.due_date || c.lane === 'done') return false;
  const today = new Date().toISOString().slice(0, 10);
  return c.due_date < today;
}

function render() {
  document.querySelectorAll('.lane').forEach((laneEl) => {
    const lane = laneEl.dataset.lane;
    const box = laneEl.querySelector('.cards');
    const q = searchText.trim().toLowerCase();
    const list = cards.filter((c) => c.lane === lane && (filter === 'all' || c.tag === filter) &&
      (!q || (c.title + ' ' + (c.details || '') + ' ' + (c.owner || '')).toLowerCase().includes(q)));
    laneEl.querySelector('h2').innerHTML =
      escHtml(LANE_LABELS[lane]) + ' <span class="count">(' + list.length + ')</span>';
    box.innerHTML = '';
    list.forEach((c) => box.appendChild(cardEl(c)));
  });
  document.querySelectorAll('.filters button[data-filter]').forEach((b) =>
    b.classList.toggle('active', b.dataset.filter === filter));
  document.querySelectorAll('.lane').forEach((laneEl) => {
    const box = laneEl.querySelector('.cards');
    box.ondragover = (e) => { e.preventDefault(); box.classList.add('dragover'); };
    box.ondragleave = () => box.classList.remove('dragover');
    box.ondrop = async (e) => {
      e.preventDefault();
      box.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/plain');
      const c = cards.find((x) => String(x.id) === id);
      if (!c || c.lane === laneEl.dataset.lane) return;
      try {
        const updated = await api('PATCH', '/api/cards?id=' + encodeURIComponent(c.id), { lane: laneEl.dataset.lane });
        Object.assign(c, updated);
        render();
      } catch (err) { alert('Could not move the card. Please try again.'); }
    };
  });
}

function cardEl(c) {
  const el = document.createElement('div');
  el.className = `card tag-${c.tag} size-${c.priority}` + (showDeleted ? ' is-deleted' : '');
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(c.id));
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  el.addEventListener('click', () => openDetail(c.id));
  const idx = LANES.indexOf(c.lane);
  const leftBtn = idx > 0 ? `<button data-act="left" title="Move to ${escHtml(LANE_LABELS[LANES[idx - 1]])}">\u2190</button>` : '';
  const rightBtn = idx < LANES.length - 1 ? `<button data-act="right" title="Move to ${escHtml(LANE_LABELS[LANES[idx + 1]])}">\u2192</button>` : '';
  const doneBtn = c.lane !== 'done' ? `<button data-act="done" title="Mark completed">\u2713 Done</button>` : '';
  const due = c.due_date
    ? `<div class="meta">${isOverdue(c) ? '<span class="overdue">Overdue: ' : 'Due: '}${escHtml(c.due_date)}${isOverdue(c) ? '</span>' : ''}${c.owner ? ' \u00b7 ' + escHtml(c.owner) : ''}</div>`
    : (c.owner ? `<div class="meta">${escHtml(c.owner)}</div>` : '');
  const it = c.issue_type || 'task';
  el.innerHTML =
    `<div class="card-top"><span class="itype itype-${it}" title="${escHtml(ITYPE_LABELS[it] || it)}">${ITYPE_GLYPH[it] || ''}</span>` +
    `<span class="pill tag-${c.tag}">${c.tag === 'work' ? 'Work' : 'Personal'}</span>` +
    `<span class="pill size-${c.priority}">${escHtml(SIZE_LABELS[c.priority] || c.priority)}</span>` +
    (showDeleted ? `<span class="pill size-low">Deleted</span>` : '') + `</div>` +
    `<h3>${escHtml(c.title)}</h3>` +
    (c.details ? `<p class="details">${escHtml(c.details)}</p>` : '') +
    due +
    (showDeleted
      ? `<div class="actions"><button data-act="restore">Restore</button></div>`
      : `<div class="actions">${leftBtn}${rightBtn}${doneBtn}<button data-act="edit">Edit</button></div>`);
  el.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', (e) => { e.stopPropagation(); act(c.id, b.dataset.act); });
  });
  return el;
}

async function act(id, action) {
  const c = cards.find((x) => x.id === id);
  if (!c) return;
  try {
    if (action === 'left' || action === 'right') {
      const idx = LANES.indexOf(c.lane) + (action === 'right' ? 1 : -1);
      if (idx >= 0 && idx < LANES.length) {
        const updated = await api('PATCH', '/api/cards?id=' + encodeURIComponent(id), { lane: LANES[idx] });
        Object.assign(c, updated);
        render();
      }
    } else if (action === 'edit') {
      openModal(c);
    } else if (action === 'done') {
      const updated = await api('PATCH', '/api/cards?id=' + encodeURIComponent(id), { lane: 'done' });
      Object.assign(c, updated);
      render();
    } else if (action === 'restore') {
      const updated = await api('PATCH', '/api/cards?id=' + encodeURIComponent(id), { restore: true });
      cards = cards.filter((x) => x.id !== id);
      render();
    }
  } catch (e) {
    alert('Could not save that change. Please try again.');
  }
}

function openModal(c) {
  editingId = c ? c.id : null;
  document.getElementById('modal-title').textContent = c ? 'Edit card' : 'Add card';
  document.getElementById('f-title').value = c ? c.title : '';
  document.getElementById('f-details').value = c ? (c.details || '') : '';
  document.getElementById('f-tag').value = c ? c.tag : 'work';
  document.getElementById('f-issue-type').value = c ? (c.issue_type || 'task') : 'task';
  document.getElementById('f-priority').value = c ? c.priority : 'normal';
  document.getElementById('f-lane').value = c ? c.lane : 'now';
  document.getElementById('f-due').value = c && c.due_date ? c.due_date : '';
  document.getElementById('f-owner').value = c && c.owner ? c.owner : '';
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById('f-title').focus();
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  editingId = null;
}

document.getElementById('add-card').addEventListener('click', () => openModal(null));
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modal-backdrop') closeModal();
});
document.getElementById('card-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    title: document.getElementById('f-title').value.trim(),
    details: document.getElementById('f-details').value.trim(),
    tag: document.getElementById('f-tag').value,
    issue_type: document.getElementById('f-issue-type').value,
    priority: document.getElementById('f-priority').value,
    lane: document.getElementById('f-lane').value,
    due_date: document.getElementById('f-due').value || null,
    owner: document.getElementById('f-owner').value.trim() || null,
  };
  if (!data.title) return;
  try {
    if (editingId != null) {
      const updated = await api('PATCH', '/api/cards?id=' + encodeURIComponent(editingId), data);
      const c = cards.find((x) => x.id === editingId);
      if (c) Object.assign(c, updated);
    } else {
      const created = await api('POST', '/api/cards', data);
      cards.push(created);
    }
    render(); closeModal();
  } catch (e) {
    alert('Could not save the card. Please try again.');
  }
});
document.querySelectorAll('.filters button[data-filter]').forEach((b) =>
  b.addEventListener('click', () => { filter = b.dataset.filter; render(); }));
document.getElementById('trash-toggle').addEventListener('click', async (e) => {
  showDeleted = !showDeleted;
  e.target.classList.toggle('active', showDeleted);
  try { await loadCards(); } catch (err) { alert('Could not load deleted cards. Please try again.'); showDeleted = false; e.target.classList.remove('active'); }
});
document.getElementById('search').addEventListener('input', (e) => {
  searchText = e.target.value;
  render();
});

function metaLine(c) {
  const bits = [];
  if (c.due_date) bits.push(isOverdue(c) ? '<span class="overdue">Overdue: ' + escHtml(c.due_date) + '</span>' : 'Due: ' + escHtml(c.due_date));
  if (c.owner) bits.push(escHtml(c.owner));
  bits.push('In ' + escHtml(LANE_LABELS[c.lane] || c.lane));
  return bits.join(' \u00b7 ');
}

async function openDetail(id) {
  const c = cards.find((x) => String(x.id) === String(id));
  if (!c) return;
  detailId = c.id;
  const it = c.issue_type || 'task';
  document.getElementById('d-pills').innerHTML =
    `<span class="itype itype-${it}" title="${escHtml(ITYPE_LABELS[it] || it)}">${ITYPE_GLYPH[it] || ''}</span>` +
    `<span class="pill tag-${c.tag}">${c.tag === 'work' ? 'Work' : 'Personal'}</span>` +
    `<span class="pill size-${c.priority}">${escHtml(SIZE_LABELS[c.priority] || c.priority)}</span>`;
  document.getElementById('d-title').textContent = c.title;
  document.getElementById('d-meta').innerHTML = metaLine(c);
  document.getElementById('d-details').textContent = c.details || '';
  const isDel = !!c.deleted_at;
  document.getElementById('d-edit').classList.toggle('hidden', isDel);
  document.getElementById('d-delete').classList.toggle('hidden', isDel);
  document.getElementById('d-restore').classList.toggle('hidden', !isDel);
  document.getElementById('d-purge').classList.toggle('hidden', !isDel);
  document.getElementById('d-comments').innerHTML = '<p class="empty-note">Loading comments…</p>';
  document.getElementById('detail-backdrop').classList.remove('hidden');
  try {
    const comments = await api('GET', '/api/comments?card_id=' + encodeURIComponent(c.id));
    const box = document.getElementById('d-comments');
    if (detailId !== c.id) return;
    box.innerHTML = '';
    if (!comments.length) box.innerHTML = '<p class="empty-note">No comments yet.</p>';
    comments.forEach((cm) => {
      const d = document.createElement('div');
      d.className = 'comment';
      const when = cm.created_at ? new Date(cm.created_at).toLocaleString() : '';
      d.innerHTML = `<div class="who">${escHtml(cm.user_email || '')} \u00b7 ${escHtml(when)}</div>`;
      const p = document.createElement('p');
      p.textContent = cm.body;
      d.appendChild(p);
      box.appendChild(d);
    });
  } catch (e) {
    if (detailId === c.id) document.getElementById('d-comments').innerHTML = '<p class="empty-note">Could not load comments.</p>';
  }
}

function closeDetail() {
  document.getElementById('detail-backdrop').classList.add('hidden');
  detailId = null;
}

document.getElementById('d-close').addEventListener('click', closeDetail);
document.getElementById('detail-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'detail-backdrop') closeDetail();
});
document.getElementById('d-edit').addEventListener('click', () => {
  const c = cards.find((x) => x.id === detailId);
  closeDetail();
  if (c) openModal(c);
});
document.getElementById('d-delete').addEventListener('click', async () => {
  const c = cards.find((x) => x.id === detailId);
  if (!c) return;
  const yes = await confirmAction({
    title: 'Delete this card?',
    message: `"${c.title}" will move to Deleted. You can restore it anytime from the Deleted filter.`,
    confirmLabel: 'Delete',
  });
  if (!yes) return;
  try {
    await api('DELETE', '/api/cards?id=' + encodeURIComponent(c.id));
    cards = cards.filter((x) => x.id !== c.id);
    closeDetail();
    render();
  } catch (e) { alert('Could not delete the card. Please try again.'); }
});
document.getElementById('d-restore').addEventListener('click', async () => {
  const c = cards.find((x) => x.id === detailId);
  if (!c) return;
  try {
    await api('PATCH', '/api/cards?id=' + encodeURIComponent(c.id), { restore: true });
    cards = cards.filter((x) => x.id !== c.id);
    closeDetail();
    render();
  } catch (e) { alert('Could not restore the card. Please try again.'); }
});
document.getElementById('d-purge').addEventListener('click', async () => {
  const c = cards.find((x) => x.id === detailId);
  if (!c) return;
  const yes = await confirmAction({
    title: 'Delete forever?',
    message: `"${c.title}" will be permanently removed. This cannot be undone.`,
    confirmLabel: 'Delete forever',
  });
  if (!yes) return;
  try {
    await api('DELETE', '/api/cards?id=' + encodeURIComponent(c.id) + '&hard=true');
    cards = cards.filter((x) => x.id !== c.id);
    closeDetail();
    render();
  } catch (e) { alert('Could not delete the card. Please try again.'); }
});
document.getElementById('comment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('c-body');
  const text = input.value.trim();
  if (!text || detailId == null) return;
  try {
    await api('POST', '/api/comments', { card_id: detailId, body: text });
    input.value = '';
    openDetail(detailId);
  } catch (err) { alert('Could not post the comment. Please try again.'); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closeDetail(); closeKeys(); closeInvite(); }
});

// ---- In-app confirmation for destructive actions ----
function confirmAction({ title, message, confirmLabel }) {
  return new Promise((resolve) => {
    const bd = document.getElementById('confirm-backdrop');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-ok').textContent = confirmLabel || 'Delete';
    bd.classList.remove('hidden');
    const done = (v) => {
      bd.classList.add('hidden');
      document.getElementById('confirm-ok').onclick = null;
      document.getElementById('confirm-cancel').onclick = null;
      bd.onclick = null;
      resolve(v);
    };
    document.getElementById('confirm-ok').onclick = () => done(true);
    document.getElementById('confirm-cancel').onclick = () => done(false);
    bd.onclick = (e) => { if (e.target.id === 'confirm-backdrop') done(false); };
  });
}

// ---- Connectors: API key management ----
function openKeys() {
  document.getElementById('keys-backdrop').classList.remove('hidden');
  document.getElementById('new-key').classList.add('hidden');
  loadKeys();
}
function closeKeys() {
  document.getElementById('keys-backdrop').classList.add('hidden');
}

async function loadKeys() {
  const box = document.getElementById('keys-list');
  box.innerHTML = '<p class="empty-note">Loading…</p>';
  try {
    const keys = await api('GET', '/api/keys');
    box.innerHTML = '';
    if (!keys.length) box.innerHTML = '<p class="empty-note">No connector keys yet.</p>';
    keys.forEach((k) => {
      const row = document.createElement('div');
      row.className = 'key-row' + (k.revoked_at ? ' revoked' : '');
      const when = k.created_at ? new Date(k.created_at).toLocaleDateString() : '';
      const used = k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'never';
      row.innerHTML = `<div class="grow"><strong></strong><div class="sub"></div></div>`;
      row.querySelector('strong').textContent = k.name + (k.revoked_at ? ' (revoked)' : '');
      row.querySelector('.sub').textContent = `${k.key_prefix}… · created ${when} · last used ${used}`;
      if (!k.revoked_at) {
        const btn = document.createElement('button');
        btn.textContent = 'Revoke';
        btn.addEventListener('click', async () => {
          const yes = await confirmAction({
            title: 'Revoke this key?',
            message: `The "${k.name}" connector will stop working immediately.`,
            confirmLabel: 'Revoke key',
          });
          if (!yes) return;
          try { await api('DELETE', '/api/keys?id=' + encodeURIComponent(k.id)); loadKeys(); }
          catch (e) { alert('Could not revoke the key. Please try again.'); }
        });
        row.appendChild(btn);
      }
      box.appendChild(row);
    });
  } catch (e) {
    box.innerHTML = '<p class="empty-note">Could not load keys.</p>';
  }
}

const menuEl = document.getElementById('menu');
document.getElementById('menu-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  menuEl.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!menuEl.classList.contains('hidden') && !e.target.closest('.menu-wrap')) {
    menuEl.classList.add('hidden');
  }
});
document.getElementById('menu-invite').addEventListener('click', () => {
  menuEl.classList.add('hidden');
  openInvite();
});
document.getElementById('menu-connectors').addEventListener('click', () => {
  menuEl.classList.add('hidden');
  openKeys();
});

// ---- Compact / detailed view toggle ----
document.getElementById('view-toggle').addEventListener('click', (e) => {
  compactView = !compactView;
  document.body.classList.toggle('compact', compactView);
  e.target.textContent = compactView ? '\u25a6' : '\u2261';
  e.target.title = compactView ? 'Switch to detailed view' : 'Switch to compact view';
});

// ---- Invite management (admin) ----
function openInvite() {
  document.getElementById('invite-backdrop').classList.remove('hidden');
  loadInvites();
}
function closeInvite() {
  document.getElementById('invite-backdrop').classList.add('hidden');
}
async function loadInvites() {
  const box = document.getElementById('invites-list');
  box.innerHTML = '<p class="empty-note">Loading…</p>';
  try {
    const users = await api('GET', '/api/invites');
    box.innerHTML = '';
    if (!users.length) box.innerHTML = '<p class="empty-note">Nobody invited yet.</p>';
    users.forEach((u) => {
      const row = document.createElement('div');
      row.className = 'key-row';
      const when = u.created_at ? new Date(u.created_at).toLocaleDateString() : '';
      row.innerHTML = `<div class="grow"><strong></strong><div class="sub"></div></div>`;
      row.querySelector('strong').textContent = u.email + (u.role === 'admin' ? ' (admin)' : '');
      row.querySelector('.sub').textContent = `invited ${when}` + (u.invited_by ? ` by ${u.invited_by}` : '');
      if (u.role !== 'admin') {
        const btn = document.createElement('button');
        btn.textContent = 'Remove';
        btn.addEventListener('click', async () => {
          const yes = await confirmAction({
            title: 'Remove this person?',
            message: `${u.email} will lose access to the board immediately. Their cards stay saved in case they are re-invited.`,
            confirmLabel: 'Remove',
          });
          if (!yes) return;
          try { await api('DELETE', '/api/invites?email=' + encodeURIComponent(u.email)); loadInvites(); }
          catch (e) { alert('Could not remove. Please try again.'); }
        });
        row.appendChild(btn);
      }
      box.appendChild(row);
    });
  } catch (e) {
    box.innerHTML = '<p class="empty-note">Could not load invites.</p>';
  }
}
document.getElementById('invite-close').addEventListener('click', closeInvite);
document.getElementById('invite-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'invite-backdrop') closeInvite();
});
document.getElementById('invite-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('i-email');
  const email = input.value.trim();
  if (!email) return;
  try {
    await api('POST', '/api/invites', { email });
    input.value = '';
    loadInvites();
  } catch (err) { alert('Could not invite. Check the email address and try again.'); }
});
document.getElementById('keys-close').addEventListener('click', closeKeys);
document.getElementById('keys-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'keys-backdrop') closeKeys();
});
document.getElementById('key-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('k-name');
  try {
    const created = await api('POST', '/api/keys', { name: input.value.trim() });
    input.value = '';
    document.getElementById('new-key-value').textContent = created.key;
    document.getElementById('new-key').classList.remove('hidden');
    loadKeys();
  } catch (err) { alert('Could not create the key. Please try again.'); }
});

init();
