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

async function init() {
  try {
    cards = await api('GET', '/api/cards');
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
  document.querySelectorAll('.filters button').forEach((b) =>
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
  el.className = `card tag-${c.tag} size-${c.priority}`;
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
  const due = c.due_date
    ? `<div class="meta">${isOverdue(c) ? '<span class="overdue">Overdue: ' : 'Due: '}${escHtml(c.due_date)}${isOverdue(c) ? '</span>' : ''}${c.owner ? ' \u00b7 ' + escHtml(c.owner) : ''}</div>`
    : (c.owner ? `<div class="meta">${escHtml(c.owner)}</div>` : '');
  const it = c.issue_type || 'task';
  el.innerHTML =
    `<div class="card-top"><span class="itype itype-${it}" title="${escHtml(ITYPE_LABELS[it] || it)}">${ITYPE_GLYPH[it] || ''}</span>` +
    `<span class="pill tag-${c.tag}">${c.tag === 'work' ? 'Work' : 'Personal'}</span>` +
    `<span class="pill size-${c.priority}">${escHtml(SIZE_LABELS[c.priority] || c.priority)}</span></div>` +
    `<h3>${escHtml(c.title)}</h3>` +
    (c.details ? `<p class="details">${escHtml(c.details)}</p>` : '') +
    due +
    `<div class="actions">${leftBtn}${rightBtn}<button data-act="edit">Edit</button><button data-act="del" class="danger">Delete</button></div>`;
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
    } else if (action === 'del') {
      if (confirm(`Delete "${c.title}"?`)) {
        await api('DELETE', '/api/cards?id=' + encodeURIComponent(id));
        cards = cards.filter((x) => x.id !== id);
        render();
      }
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
document.querySelectorAll('.filters button').forEach((b) =>
  b.addEventListener('click', () => { filter = b.dataset.filter; render(); }));
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
  if (!c || !confirm(`Delete "${c.title}"?`)) return;
  try {
    await api('DELETE', '/api/cards?id=' + encodeURIComponent(c.id));
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
  if (e.key === 'Escape') { closeModal(); closeDetail(); }
});

init();
