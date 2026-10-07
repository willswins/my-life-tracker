'use strict';

const LANES = ['now', 'next', 'waiting', 'done'];
const LANE_LABELS = { now: 'Now', next: 'Next', waiting: 'Waiting on others', done: 'Done' };
const SIZE_LABELS = { high: 'Big rock', normal: 'Medium', low: 'Small' };
const APP_VERSION = '1.2.0';

let cards = [];
let searchText = '';
let editingId = null;
let detailId = null;
let showDeleted = false;
let isAdmin = false;
let compactView = false;
let allTags = [];
let boardTagFilter = '';

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
  cards = await api('GET', '/api/app?r=cards' + (showDeleted ? '&deleted=only' : ''));
}

async function init() {
  try {
    const me = await api('GET', '/api/auth?action=me');
    isAdmin = !!me.admin;
    if (!isAdmin) document.getElementById('menu-invite').style.display = 'none';
    const meEmail = me.email || '';
    const pi = document.getElementById('profile-initial');
    if (pi) pi.textContent = (meEmail.charAt(0) || '?').toUpperCase();
    const pe = document.getElementById('profile-email');
    if (pe) pe.textContent = meEmail;
  } catch (e) {  }
  try {
    allTags = await api('GET', '/api/app?r=daybook&view=tags');
  } catch (e) {  }
  try {
    await loadCards();
  } catch (e) {
    document.querySelector('#lanes').innerHTML =
      '<p style="color:#b91c1c">Could not load cards. Please refresh.</p>';
    return;
  }
  render();
  const hm = location.hash.match(/^#\/(\w+)/);
  await switchView(hm ? hm[1] : 'home', false);
}

function tagBubblesHtml(tags) {
  if (!Array.isArray(tags) || !tags.length) return '';
  return '<span class="tag-bubbles">' + tags.map((t) =>
    '<span class="tag-bubble">' + escHtml(t) + '</span>'
  ).join('') + '</span>';
}

function renderTagFilter(box, selected, onPick, includeDelete) {
  box.innerHTML = '';
  const mk = (label, val) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tag-filter' + (selected === val ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => onPick(val));
    box.appendChild(b);
  };
  mk('All tags', '');
  allTags.forEach((t) => mk(t.name, t.name));
  if (includeDelete) {
    const del = document.createElement('button');
    del.type = 'button';
    del.id = 'trash-toggle';
    del.className = 'tag-filter' + (showDeleted ? ' active' : '');
    del.textContent = 'Deleted';
    del.title = 'Show deleted cards';
    del.addEventListener('click', toggleDeleted);
    box.appendChild(del);
  }
}

function renderTagPicker(box, selectedTags) {
  box.innerHTML = '';
  const sel = new Set(selectedTags || []);
  allTags.forEach((t) => {
    const label = document.createElement('label');
    label.className = 'tag-pick' + (sel.has(t.name) ? ' selected' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = t.name;
    cb.checked = sel.has(t.name);
    cb.addEventListener('change', () => {
      label.classList.toggle('selected', cb.checked);
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(t.name));
    box.appendChild(label);
  });
  if (!allTags.length) {
    box.innerHTML = '<span class="empty-note">No tags yet — add them from the menu.</span>';
  }
}

function pickedTags(box) {
  return Array.from(box.querySelectorAll('input[type="checkbox"]:checked')).map((c) => c.value);
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
  renderTagFilter(document.getElementById('board-tag-filter'), boardTagFilter, (v) => {
    boardTagFilter = v;
    render();
  }, true);
  document.querySelectorAll('.lane').forEach((laneEl) => {
    const lane = laneEl.dataset.lane;
    const box = laneEl.querySelector('.cards');
    const q = searchText.trim().toLowerCase();
    const list = cards.filter((c) => c.lane === lane &&
      !(c.tags || []).includes('news') &&
      !(c.tags || []).includes('mood') &&
      (!boardTagFilter || (c.tags || []).includes(boardTagFilter)) &&
      (!q || (c.title + ' ' + (c.details || '') + ' ' + (c.owner || '')).toLowerCase().includes(q)));
    laneEl.querySelector('h2').innerHTML =
      escHtml(LANE_LABELS[lane]) + ' <span class="count">(' + list.length + ')</span>';
    box.innerHTML = '';
    list.forEach((c) => box.appendChild(cardEl(c)));
  });

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
        const updated = await api('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(c.id), { lane: laneEl.dataset.lane });
        Object.assign(c, updated);
        render();
      } catch (err) { toast('Could not move the card. Please try again.'); }
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
  el.innerHTML =
    `<div class="card-top">` +
    `<span class="pill size-${c.priority}">${escHtml(SIZE_LABELS[c.priority] || c.priority)}</span>` +
    (showDeleted ? `<span class="pill size-low">Deleted</span>` : '') + `</div>` +
    `<h3>${escHtml(c.title)}</h3>` +
    (c.details ? `<p class="details">${escHtml(c.details)}</p>` : '') +
    due +
    tagBubblesHtml(c.tags) +
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
        const updated = await api('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(id), { lane: LANES[idx] });
        Object.assign(c, updated);
        render();
      }
    } else if (action === 'edit') {
      openModal(c);
    } else if (action === 'done') {
      const updated = await api('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(id), { lane: 'done' });
      Object.assign(c, updated);
      render();
    } else if (action === 'restore') {
      const updated = await api('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(id), { restore: true });
      cards = cards.filter((x) => x.id !== id);
      render();
    }
  } catch (e) {
    toast('Could not save that change. Please try again.');
  }
}

function openModal(c) {
  editingId = c ? c.id : null;
  document.getElementById('modal-title').textContent = c ? 'Edit card' : 'Add card';
  document.getElementById('f-title').value = c ? c.title : '';
  document.getElementById('f-details').value = c ? (c.details || '') : '';
  setDropdown('f-tag', c ? c.tag : 'work');
  setDropdown('f-priority', c ? c.priority : 'normal');
  setDropdown('f-lane', c ? c.lane : 'now');
  setDueDate(c && c.due_date ? c.due_date : '');
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
  const tagVal = document.getElementById('f-tag').value;
  const data = {
    title: document.getElementById('f-title').value.trim(),
    details: document.getElementById('f-details').value.trim(),
    tag: tagVal,
    tags: tagVal ? [tagVal] : [],
    priority: document.getElementById('f-priority').value,
    lane: document.getElementById('f-lane').value,
    due_date: document.getElementById('f-due').value || null,
    owner: document.getElementById('f-owner').value.trim() || null,
  };
  if (!data.title) return;
  try {
    if (editingId != null) {
      const updated = await api('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(editingId), data);
      const c = cards.find((x) => x.id === editingId);
      if (c) Object.assign(c, updated);
    } else {
      const created = await api('POST', '/api/app?r=cards', data);
      cards.push(created);
    }
    render(); closeModal();
  } catch (e) {
    toast('Could not save the card. Please try again.');
  }
});

async function toggleDeleted(e) {
  showDeleted = !showDeleted;
  if (e && e.target) e.target.classList.toggle('active', showDeleted);
  try { await loadCards(); render(); } catch (err) { toast('Could not load deleted cards. Please try again.'); showDeleted = false; if (e && e.target) e.target.classList.remove('active'); }
}
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
  document.getElementById('d-pills').innerHTML =
    `<span class="pill size-${c.priority}">${escHtml(SIZE_LABELS[c.priority] || c.priority)}</span>` +
    '';
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
    const comments = await api('GET', '/api/app?r=comments&card_id=' + encodeURIComponent(c.id));
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
    await api('DELETE', '/api/app?r=cards&id=' + encodeURIComponent(c.id));
    cards = cards.filter((x) => x.id !== c.id);
    closeDetail();
    render();
  } catch (e) { toast('Could not delete the card. Please try again.'); }
});
document.getElementById('d-restore').addEventListener('click', async () => {
  const c = cards.find((x) => x.id === detailId);
  if (!c) return;
  try {
    await api('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(c.id), { restore: true });
    cards = cards.filter((x) => x.id !== c.id);
    closeDetail();
    render();
  } catch (e) { toast('Could not restore the card. Please try again.'); }
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
    await api('DELETE', '/api/app?r=cards&id=' + encodeURIComponent(c.id) + '&hard=true');
    cards = cards.filter((x) => x.id !== c.id);
    closeDetail();
    render();
  } catch (e) { toast('Could not delete the card. Please try again.'); }
});
document.getElementById('comment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('c-body');
  const text = input.value.trim();
  if (!text || detailId == null) return;
  try {
    await api('POST', '/api/app?r=comments', { card_id: detailId, body: text });
    input.value = '';
    openDetail(detailId);
  } catch (err) { toast('Could not post the comment. Please try again.'); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closeDetail(); closeKeys(); closeInvite(); closeReminderModal(); closeLinkModal(); closeTriage(); document.getElementById('confirm-backdrop').classList.add('hidden'); }
});

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
    const keys = await api('GET', '/api/app?r=keys');
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
          try { await api('DELETE', '/api/app?r=keys&id=' + encodeURIComponent(k.id)); loadKeys(); }
          catch (e) { toast('Could not revoke the key. Please try again.'); }
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
  closeLinkMenu();
  closeRemMenu();
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
document.getElementById('menu-refresh').addEventListener('click', async () => {
  menuEl.classList.add('hidden');
  try { await loadCards(); await switchView(currentView, false); }
  catch (e) { toast('Could not refresh. Please try again.'); }
});

document.getElementById('view-toggle').addEventListener('click', (e) => {
  compactView = !compactView;
  document.body.classList.toggle('compact', compactView);
  e.target.textContent = compactView ? '\u25a6' : '\u2261';
  e.target.title = compactView ? 'Switch to detailed view' : 'Switch to compact view';
});

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
    const users = await api('GET', '/api/app?r=invites');
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
          try { await api('DELETE', '/api/app?r=invites&email=' + encodeURIComponent(u.email)); loadInvites(); }
          catch (e) { toast('Could not remove. Please try again.'); }
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
    await api('POST', '/api/app?r=invites', { email });
    input.value = '';
    loadInvites();
  } catch (err) { toast('Could not invite. Check the email address and try again.'); }
});
document.getElementById('keys-close').addEventListener('click', closeKeys);
document.getElementById('keys-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'keys-backdrop') closeKeys();
});
document.getElementById('key-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('k-name');
  try {
    const created = await api('POST', '/api/app?r=keys', { name: input.value.trim() });
    input.value = '';
    document.getElementById('new-key-value').textContent = created.key;
    document.getElementById('new-key').classList.remove('hidden');
    loadKeys();
  } catch (err) { toast('Could not create the key. Please try again.'); }
});

init();

'use strict';

const VIEWS = ['home', 'tasks', 'reminders', 'journal', 'links', 'inbox', 'news', 'mood', 'game', 'spell', 'bee', 'grammar', 'about'];
const VIEW_IDS = {
  home: 'view-home',
  tasks: 'board',
  reminders: 'view-reminders',
  journal: 'view-journal',
  links: 'view-links',
  inbox: 'view-inbox',
  news: 'view-news',
  mood: 'view-mood',
  game: 'view-game',
  spell: 'view-spell',
  bee: 'view-bee',
  grammar: 'view-grammar',
  about: 'view-about',
};
const VIEW_TITLES = {
  home: 'DayBook',
  tasks: 'DayBook',
  reminders: 'Reminders',
  journal: 'Journal',
  links: 'Links',
  inbox: 'Inbox',
  news: 'News',
  mood: 'Mood',
  game: 'Sum It Up',
  spell: 'Spell It',
  bee: 'Spelling Bee',
  grammar: 'Grammar Quiz',
  about: 'About',
};
let currentView = 'tasks';

let reminders = [];
let inboxCount = 0;
let reminderTagFilter = '';
let editingReminderId = null;
let reminderSearch = '';
let reminderSearchTimer = null;

let journalDate = null; // set below after helpers

let links = [];
let allLinks = [];
let linkSearch = '';
let linkTag = '';
let editingLinkId = null;
let linkSearchTimer = null;

let inboxItems = [];
let inboxTagFilter = '';
let inboxShowTriaged = false;
let inboxSearch = '';
let inboxSearchTimer = null;
let triageItem = null;
let triageDest = 'task';

function pad2(n) { return String(n).padStart(2, '0'); }
function localDateStr(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function addDaysLocal(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function toLocalInput(d) {
  return localDateStr(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function fromLocalInput(v) {
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}
function fmtTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s)>\]]+/);
  return m ? m[0] : '';
}
journalDate = localDateStr(new Date());

const GAME_WORDS = ['apple','brain','cloud','dance','eagle','flame','grape','happy','ivory','jungle','kite','lemon','magic','night','ocean','piano','queen','river','sunny','tiger','unity','vivid','water','xenon','youth','zebra','pizza','jazz','quiz','box','fox','dog','cat','sun','moon','star','tree','book','game','play','code','data','logic','sharp','brave','swift','candy','delta','ember','frost','globe','hazel','index','joker','karma','lunar','mango','north','olive','pilot','quartz','radar','storm','thorn','ultra','vapor','whale','xray','yearn','zip'];
let gameScore = 0, gameStreak = 0, gameBest = 0, gameStartTime = 0, gameAnswered = false;
let gameTimer = null;

function letterValue(ch) {
  const c = ch.toLowerCase().charCodeAt(0);
  return (c >= 97 && c <= 122) ? c - 96 : 0;
}
function wordSum(w) {
  return [...w].reduce((a, ch) => a + letterValue(ch), 0);
}
function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function initGame() {
  gameBest = parseInt(localStorage.getItem('sumitup_best') || '0', 10);
  document.getElementById('game-best').textContent = gameBest;
  document.getElementById('game-score').textContent = gameScore;
  document.getElementById('game-streak').textContent = gameStreak;
  newRound();
}
function newRound() {
  gameAnswered = false;
  const word = GAME_WORDS[Math.floor(Math.random() * GAME_WORDS.length)];
  const correct = wordSum(word);
  document.getElementById('game-word').textContent = word.toUpperCase();
  document.getElementById('game-feedback').textContent = '';
  document.getElementById('game-feedback').className = 'game-feedback';
  document.getElementById('game-next').classList.add('hidden');
  const opts = new Set([correct]);
  while (opts.size < 4) {
    const delta = Math.floor(Math.random() * 20) - 10;
    const v = correct + delta;
    if (v > 0 && v !== correct) opts.add(v);
  }
  const shuffled = shuffleArr([...opts]);
  const box = document.getElementById('game-options');
  box.innerHTML = '';
  shuffled.forEach((v) => {
    const b = document.createElement('button');
    b.className = 'game-option';
    b.textContent = v;
    b.addEventListener('click', () => answerGame(v, correct, b));
    box.appendChild(b);
  });
  gameStartTime = Date.now();
  clearInterval(gameTimer);
  gameTimer = setInterval(() => {
    const s = Math.floor((Date.now() - gameStartTime) / 1000);
    document.getElementById('game-time').textContent = s + 's';
  }, 500);
}
function answerGame(picked, correct, btn) {
  if (gameAnswered) return;
  gameAnswered = true;
  clearInterval(gameTimer);
  const secs = Math.floor((Date.now() - gameStartTime) / 1000);
  const fb = document.getElementById('game-feedback');
  document.querySelectorAll('.game-option').forEach((b) => {
    b.disabled = true;
    if (parseInt(b.textContent, 10) === correct) b.classList.add('correct');
  });
  if (picked === correct) {
    btn.classList.add('correct');
    const pts = Math.max(10, 100 - secs * 5);
    gameScore += pts;
    gameStreak++;
    fb.textContent = `✓ +${pts} pts (${secs}s)`;
    fb.className = 'game-feedback good';
  } else {
    btn.classList.add('wrong');
    fb.textContent = `✗ The answer was ${correct} (${secs}s)`;
    fb.className = 'game-feedback bad';
    gameStreak = 0;
    if (gameScore > gameBest) {
      gameBest = gameScore;
      localStorage.setItem('sumitup_best', String(gameBest));
    }
    gameScore = 0;
  }
  document.getElementById('game-score').textContent = gameScore;
  document.getElementById('game-streak').textContent = gameStreak;
  document.getElementById('game-best').textContent = gameBest;
  document.getElementById('game-next').classList.remove('hidden');
}
const gameNextBtn = document.getElementById('game-next');
if (gameNextBtn) gameNextBtn.addEventListener('click', newRound);

const SPELL_WORDS = {
  simple: ['apple','tiger','house','water','happy','green','chair','smile','bread','cloud','train','light','music','dance','beach','stone','flame','grape','lemon','magic','north','ocean','piano','queen','river','sunny','table','uncle','ivory','joker'],
  medium: ['beautiful','rhythm','chocolate','elephant','purple','enough','people','because','friend','school','answer','break','catch','doubt','earth','faith','ghost','honor','image','jungle','knife','layer','night','oasis','proud','quiet','rough','storm','taste','window'],
  complex: ['accommodate','conscience','embarrass','fluorescent','guarantee','maintenance','necessary','occasion','receive','separate','calendar','definite','existence','foreign','government','hierarchy','immediate','jewelry','knowledge','liaison','millennium','noticeable','occurred','questionnaire','siege','threshold','vacuum','weird','playwright','rhythm'],
};
const SPELL_FLASH_MS = { simple: 2000, medium: 1200, complex: 700 };
const SPELL_TYPE_SEC = { simple: 15, medium: 10, complex: 8 };
const SPELL_LIVES = 3;
let spellScore = 0, spellStreak = 0, spellBest = 0, spellWord = '', spellDiff = 'medium';
let spellLives = SPELL_LIVES, spellFlashTimer = null, spellTickTimer = null, spellAutoTimer = null;
let spellAccepting = false, spellTypeLeft = 0;
let spellHistory = []; // spell-it game-over review

function spellSet(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}
function fitSpellWord(word) {
  const el = document.getElementById('spell-word');
  if (!el) return;
  const n = (word || '').length;
  el.style.fontSize = n <= 6 ? '3rem' : n <= 8 ? '2.4rem' : n <= 10 ? '2rem' : '1.6rem';
}
function spellLivesStr() {
  return '❤'.repeat(spellLives) + '🖤'.repeat(Math.max(0, SPELL_LIVES - spellLives));
}
function spellAutoNext() {
  clearTimeout(spellAutoTimer);
  spellAutoTimer = setTimeout(() => {
    if (typeof currentView !== 'undefined' && currentView === 'spell') startSpellRound();
  }, 1800);
}
function initSpell() {
  spellBest = parseInt(localStorage.getItem('spellit_best') || '0', 10);
  spellScore = 0; spellStreak = 0; spellWord = ''; spellAccepting = false;
  spellLives = SPELL_LIVES;
  spellHistory = [];
  const srb = document.getElementById('spell-review-btn');
  if (srb) { srb.classList.add('hidden'); srb.textContent = 'Review Words'; }
  const srl = document.getElementById('spell-review');
  if (srl) { srl.classList.add('hidden'); srl.innerHTML = ''; }
  clearTimeout(spellFlashTimer);
  clearInterval(spellTickTimer);
  clearTimeout(spellAutoTimer);
  spellSet('spell-best', spellBest);
  spellSet('spell-score', '0');
  spellSet('spell-streak', '0');
  spellSet('spell-lives', spellLivesStr());
  spellSet('spell-word', '…');
  spellSet('spell-hint', 'Tap Start, memorize the word, then type it and hit Go.');
  spellSet('spell-feedback', '');
  const fb = document.getElementById('spell-feedback');
  if (fb) fb.className = 'game-feedback';
  const timer = document.getElementById('spell-timer');
  if (timer) timer.classList.add('hidden');
  const row = document.getElementById('spell-input-row');
  if (row) row.classList.add('hidden');
  const start = document.getElementById('spell-start');
  if (start) { start.classList.remove('hidden'); start.textContent = 'Start'; }
}
function startSpellRound() {
  clearTimeout(spellFlashTimer);
  clearInterval(spellTickTimer);
  clearTimeout(spellAutoTimer);
  const pool = SPELL_WORDS[spellDiff] || SPELL_WORDS.medium;
  spellWord = pool[Math.floor(Math.random() * pool.length)];
  spellAccepting = false;
  spellSet('spell-word', spellWord.toUpperCase());
  fitSpellWord(spellWord);
  spellSet('spell-hint', 'Memorize!');
  spellSet('spell-feedback', '');
  const fb = document.getElementById('spell-feedback');
  if (fb) fb.className = 'game-feedback';
  const timer = document.getElementById('spell-timer');
  if (timer) timer.classList.add('hidden');
  const start = document.getElementById('spell-start');
  if (start) start.classList.add('hidden');
  const row = document.getElementById('spell-input-row');
  if (row) row.classList.remove('hidden');
  const input0 = document.getElementById('spell-input');
  if (input0) {
    input0.value = '';
    input0.disabled = false;
    try { input0.focus({ preventScroll: true }); } catch (e) { input0.focus(); }
  }
  spellFlashTimer = setTimeout(hideSpellWord, SPELL_FLASH_MS[spellDiff] || 1200);
}
function hideSpellWord() {
  spellSet('spell-word', '?');
  spellSet('spell-hint', 'Type it and hit Go ⏎');
  const input = document.getElementById('spell-input');
  if (input) {
    input.disabled = false;
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
  }
  const timer = document.getElementById('spell-timer');
  if (timer) timer.classList.remove('hidden');
  const limit = SPELL_TYPE_SEC[spellDiff] || 10;
  spellTypeLeft = limit;
  spellAccepting = true;
  updateSpellTimer(limit);
  spellTickTimer = setInterval(() => {
    spellTypeLeft -= 0.1;
    if (spellTypeLeft <= 0) {
      spellTypeLeft = 0;
      updateSpellTimer(limit);
      spellMiss(true);
    } else {
      updateSpellTimer(limit);
    }
  }, 100);
}
function updateSpellTimer(limit) {
  const fill = document.getElementById('spell-timer-fill');
  if (fill) {
    const pct = Math.max(0, (spellTypeLeft / limit) * 100);
    fill.style.width = pct + '%';
    fill.classList.toggle('low', spellTypeLeft < 3);
  }
}
function spellMiss(timeout, guess) {
  if (!spellAccepting) return;
  spellAccepting = false;
  clearInterval(spellTickTimer);
  spellHistory.push({ w: spellWord, ok: false, guess: guess || '' });
  spellLives--;
  spellStreak = 0;
  const fb = document.getElementById('spell-feedback');
  if (fb) {
    fb.textContent = timeout ? `⏰ Time! It was "${spellWord.toUpperCase()}"` : `✗ It was "${spellWord.toUpperCase()}"`;
    fb.className = 'game-feedback bad';
  }
  spellSet('spell-streak', '0');
  spellSet('spell-lives', spellLivesStr());
  const timer = document.getElementById('spell-timer');
  if (timer) timer.classList.add('hidden');
  if (spellLives <= 0) {
    spellGameOver();
  } else {
    spellAutoNext();
  }
}
function spellGameOver() {
  spellSet('spell-word', '💀');
  spellSet('spell-hint', `Game over! Final score: ${spellScore}`);
  const start = document.getElementById('spell-start');
  if (start) { start.textContent = 'Play Again'; start.classList.remove('hidden'); }
  const srb = document.getElementById('spell-review-btn');
  if (srb && spellHistory.length && typeof renderSpellReview === 'function') srb.classList.remove('hidden');
}
function checkSpell() {
  if (!spellAccepting) return;
  clearInterval(spellTickTimer);
  const limit = SPELL_TYPE_SEC[spellDiff] || 10;
  const input = document.getElementById('spell-input');
  const guess = (input ? input.value : '').trim().toLowerCase();
  const fb = document.getElementById('spell-feedback');
  if (guess === spellWord && spellWord) {
    spellAccepting = false;
    spellHistory.push({ w: spellWord, ok: true, guess: guess });
    const speedBonus = Math.round(100 * Math.max(0, spellTypeLeft) / limit);
    const pts = 100 + speedBonus + spellStreak * 10;
    spellScore += pts;
    spellStreak++;
    if (spellScore > spellBest) {
      spellBest = spellScore;
      try { localStorage.setItem('spellit_best', String(spellBest)); } catch (e) {}
    }
    if (fb) {
      fb.textContent = `✓ +${pts} pts` + (speedBonus >= 80 ? ' ⚡' : '');
      fb.className = 'game-feedback good';
    }
    spellSet('spell-score', String(spellScore));
    spellSet('spell-streak', String(spellStreak));
    spellSet('spell-best', String(spellBest));
  } else {
    spellMiss(false, guess);
    return;
  }
  const timer = document.getElementById('spell-timer');
  if (timer) timer.classList.add('hidden');
  spellAutoNext();
}
document.querySelectorAll('[data-spell-diff]').forEach((b) => {
  b.addEventListener('click', () => {
    spellDiff = b.getAttribute('data-spell-diff') || 'medium';
    document.querySelectorAll('[data-spell-diff]').forEach((x) => x.classList.toggle('active', x === b));
    initSpell();
  });
});
const spellStartBtn = document.getElementById('spell-start');
if (spellStartBtn) spellStartBtn.addEventListener('click', () => {
  if (spellLives <= 0) initSpell();
  startSpellRound();
});
const spellInputEl = document.getElementById('spell-input');
if (spellInputEl) spellInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') checkSpell();
});

const BEE_WORDS = "that this with from your have more will home about page search free other information time they site what which their news there only when contact here business also help view online first been would were services some these click like service than find price date back people list name just over state year into email health world next used work last most products music data make them should product system post city policy number such please available copyright support message after best software then good video well where info rights public books high school through each links review years order very privacy book items company read group need many user said does under general research university january mail full reviews program life know games days management part could great united hotel real item international center ebay must store travel comments made development report member details line terms before hotels send right type because local those using results office education national design take posted internet address community within states area want phone shipping reserved subject between forum family long based code show even black check special prices website index being women much sign file link open today technology south case project same pages version section found sports house related security both county american photo game members power while care network down computer systems three total place following download without access think north resources current posts media control water history pictures size personal since including guide shop directory board location change white text small rating rate government children during return students shopping account times sites level digital profile previous form events love john main call hours image department title description insurance another shall property class still money quality every listing content country private little visit save tools reply customer december compare movies include college value article york card jobs provide food source author different press learn sale around print course canada process teen room stock training credit point join science categories advanced west sales look english left team estate conditions select windows photos thread week category note live large gallery table register however june october november market library really action start series model features industry plan human provided required second accessories cost movie forums march september better questions july yahoo going medical test friend come server study application cart staff articles feedback again play looking issues april never users complete street topic comment financial things working against standard person below mobile less blog party payment equipment login student programs offers legal above recent park stores side problem give memory performance social august quote language story sell options experience rates create body young america important field east paper single activities club example girls additional password latest something road gift question changes night hard texas four poker status browse issue range building seller court february always result audio light write offer blue groups easy given files event release analysis request china making picture needs possible might professional month major star areas future space committee hand cards problems london washington meeting become interest child keep enter california share similar garden schools million added reference companies listed baby learning energy delivery popular term film stories computers journal reports welcome central images president notice original head radio until cell color self council away includes track australia discussion archive once others entertainment agreement format least society months safety friends sure trade edition cars messages marketing tell further updated association able having provides david already green studies close common drive specific several gold living collection called short arts display limited powered solutions means director daily beach past natural whether electronics five upon period planning database says official weather land average done technical window france region island record direct microsoft conference environment records district calendar costs style front statement update parts ever downloads early miles sound resource present applications either document word works material bill written talk federal hosting rules final adult tickets thing centre requirements cheap kids finance true minutes else mark third rock gifts europe reading topics individual tips plus auto cover usually edit together videos percent fast function fact unit getting global tech meet economic player projects lyrics often subscribe submit germany amount watch included feel though bank risk thanks everything deals various words linux production commercial james weight town heart advertising received choose treatment newsletter archives points knowledge magazine error camera girl currently construction toys registered clear golf receive domain methods chapter makes protection policies loan wide beauty manager india position taken sort listings models michael known half cases step engineering florida simple quick none wireless license paul friday lake whole annual published later basic sony shows corporate google church method purchase customers active response practice hardware figure materials fire holiday chat enough designed along among death writing speed html countries loss face brand discount higher effects created remember standards yellow political increase advertise kingdom base near environmental thought stuff french storage japan doing loans shoes entry stay nature orders availability africa summary turn mean growth notes agency king monday european activity copy although drug pics western income force cash employment overall river commission package contents seen players engine port album regional stop supplies started administration institute views plans double build screen exchange types soon sponsored lines electronic continue across benefits needed season apply someone held anything printer condition effective believe organization effect asked mind sunday selection casino lost tour menu volume cross anyone mortgage hope silver corporation wish inside solution mature role rather weeks addition came supply nothing certain executive running lower necessary union jewelry according clothing particular fine names robert homepage hour skills bush islands advice career military rental decision leave british teens huge woman facilities kind sellers middle move cable opportunities taking values division coming tuesday object lesbian appropriate machine logo length actually nice score statistics client returns capital follow sample investment sent shown saturday christmas england culture band flash lead george choice went starting registration thursday courses consumer airport foreign artist outside furniture levels channel letter mode phones ideas wednesday structure fund summer allow degree contract button releases homes super male matter custom virginia almost took located multiple asian distribution editor industrial cause potential song cnet focus late fall featured idea rooms female responsible communications associated thomas primary cancer numbers reason tool browser spring foundation answer voice friendly schedule documents communication purpose feature comes police everyone independent approach cameras brown physical operating hill maps medicine deal hold ratings chicago forms glass happy smith wanted developed thank safe unique survey prior telephone sport ready feed animal sources mexico population regular secure navigation operations therefore simply evidence station christian round paypal favorite understand option master valley recently probably rentals built publications blood worldwide improve connection publisher hall larger anti networks earth parents nokia impact transfer introduction kitchen strong carolina wedding properties hospital ground overview ship accommodation owners disease excellent paid italy perfect hair opportunity classic basis command cities william express award distance tree peter assessment ensure thus wall involved extra especially interface partners budget rated guides success maximum operation existing quite selected amazon patients restaurants beautiful warning wine locations horse vote forward flowers stars significant lists technologies owner retail animals useful directly manufacturer ways providing rule housing takes bring catalog searches trying mother authority considered told traffic programme joined input strategy feet agent valid modern senior ireland teaching door grand testing trial charge units instead canadian cool normal wrote enterprise ships entire educational leading metal positive fitness chinese opinion asia football abstract uses output funds greater likely develop employees artists alternative processing responsibility resolution java guest seems publication pass relations trust contains session multi photography republic fees components vacation century academic assistance completed skin graphics indian prev mary expected ring grade dating pacific mountain organizations filter mailing vehicle longer consider northern behind panel floor german buying match proposed default require iraq boys outdoor deep morning otherwise allows rest protein plant reported transportation pool mini politics partner disclaimer authors boards faculty parties fish membership mission string sense modified pack released stage internal goods recommended born unless richard detailed japanese race approved background target except character maintenance ability maybe functions moving brands places pretty trademarks phentermine spain southern yourself winter battery youth pressure submitted boston debt keywords medium television interested core break purposes throughout sets dance wood itself defined papers playing awards studio reader virtual device established answers rent remote dark programming external apple regarding instructions offered theory enjoy remove surface minimum visual host variety teachers isbn martin manual block subjects agents increased repair fair civil steel understanding songs fixed wrong beginning hands associates finally updates desktop classes paris ohio gets sector capacity requires jersey fully father electric instruments quotes officer driver businesses dead respect unknown specified restaurant mike trip worth procedures poor teacher eyes relationship workers farm georgia peace traditional campus showing creative coast benefit progress funding devices lord grant agree fiction hear sometimes watches careers beyond goes families museum themselves transport interesting blogs wife evaluation accepted former implementation hits zone complex galleries references presented jack flat flow agencies literature respective parent spanish michigan columbia setting scale stand economy highest helpful monthly critical frame musical definition secretary angeles networking path australian employee chief gives bottom magazines packages detail francisco laws changed heard begin individuals colorado royal clean switch russian largest african titles relevant guidelines justice connect bible basket applied weekly installation described demand suite vegas square chris attention advance skip diet army auction gear difference allowed correct charles nation selling lots piece sheet firm seven older illinois regulations elements species jump cells module resort facility random pricing dvds certificate minister motion looks fashion directions visitors documentation monitor trading forest calls whose coverage couple giving chance vision ball ending clients actions listen discuss accept automotive naked goal successful sold wind communities clinical situation sciences markets lowest highly publishing appear emergency developing lives currency leather determine temperature palm announcements patient actual historical stone commerce ringtones perhaps persons difficult scientific satellite tests village accounts amateur pain xbox particularly factors coffee settings buyer cultural steve easily oral ford poster edge functional root closed holidays pink zealand balance monitoring graduate replies shot architecture initial label thinking scott recommend canon league waste minute provider optional dictionary cold accounting manufacturing sections chair fishing effort phase fields fantasy letters motor professor context install shirt apparel generally continued foot mass crime count breast techniques johnson quickly dollars websites religion claim driving permission surgery patch heat wild measures generation kansas miss chemical doctor task reduce brought himself component enable exercise santa guarantee leader diamond israel processes soft servers alone meetings seconds jones arizona keyword interests flight congress fuel username walk produced italian paperback classifieds wait supported pocket saint rose freedom argument competition creating drugs joint premium providers fresh characters attorney upgrade factor growing thousands stream apartments pick hearing eastern auctions therapy entries dates generated signed upper administrative serious prime samsung limit began louis steps errors shops efforts informed thoughts creek worked quantity urban practices sorted reporting essential myself tours platform load affiliate labor immediately admin nursing defense machines designated tags heavy covered recovery guys integrated configuration merchant comprehensive expert universal protect drop solid presentation languages became orange compliance vehicles prevent theme rich campaign marine improvement guitar finding pennsylvania examples ipod saying spirit claims challenge motorola acceptance strategies seem affairs touch intended towards goals hire election suggest branch charges serve affiliates reasons magic mount smart talking gave ones latin multimedia avoid certified manage corner rank computing oregon element birth virus abuse interactive requests separate quarter procedure leadership tables define racing religious facts breakfast kong column plants faith chain developer identify avenue missing died approximately domestic sitemap recommendations moved houston reach comparison mental viewed moment extended sequence inch attack sorry centers opening damage reserve recipes gamma plastic produce snow placed truth counter failure follows weekend dollar camp ontario automatically minnesota films bridge native fill williams movement printing baseball owned approval draft chart played contacts jesus readers clubs jackson equal adventure matching offering shirts profit leaders posters institutions assistant variable advertisement expect parking headlines yesterday compared determined wholesale workshop russia gone codes kinds extension seattle statements golden completely teams fort lighting senate forces funny brother gene turned portable tried electrical applicable disc returned pattern boat named theatre laser earlier manufacturers sponsor classical icon warranty dedicated indiana direction harry basketball objects ends delete evening assembly nuclear taxes mouse signal criminal issued brain sexual wisconsin powerful dream obtained false cast flower felt personnel passed supplied identified falls soul aids opinions promote stated stats hawaii professionals appears carry flag decided covers advantage hello designs maintain tourism priority newsletters adults clips savings graphic atom payments estimated binding brief ended winning eight anonymous iron straight script served wants miscellaneous prepared void dining alert integration atlanta dakota interview framework disk installed queen credits clearly handle sweet desk criteria pubmed dave massachusetts diego hong vice associate truck behavior enlarge frequently revenue measure changing votes duty looked discussions bear gain festival laboratory ocean flights experts signs lack depth iowa whatever logged laptop vintage train exactly explore maryland concept nearly eligible checkout reality forgot handling origin knew gaming feeds billion destination scotland faster intelligence dallas bought nations route followed specifications broken tripadvisor frank alaska zoom blow battle residential anime speak decisions industries protocol query clip partnership editorial expression equity provisions speech wire principles suggestions rural shared sounds replacement tape strategic judge spam economics acid bytes cent forced compatible fight apartment height null zero speaker filed netherlands obtain consulting recreation offices designer remain managed failed marriage roll korea banks participants secret bath kelly leads negative austin favorites toronto theater springs missouri andrew perform healthy translation estimates font assets injury joseph ministry drivers lawyer figures married protected proposal sharing philadelphia portal waiting birthday beta fail gratis banking officials brian toward slightly assist conduct contained lingerie legislation calling parameters jazz serving bags profiles miami comics matters houses postal relationships tennessee wear controls breaking combined ultimate wales representative frequency introduced minor finish departments residents noted displayed reduced physics rare spent performed extreme samples davis daniel bars reviewed forecast removed helps singles administrator cycle amounts contain accuracy dual rise sleep bird pharmacy brazil creation static scene hunter addresses lady crystal famous writer chairman violence fans oklahoma speakers drink academy dynamic gender permanent agriculture dell cleaning constitutes portfolio practical delivered collectibles infrastructure exclusive seat concerns vendor originally intel utilities philosophy regulation officers reduction bids referred supports nutrition recording regions junior toll cape rings meaning secondary wonderful mine ladies henry ticket announced guess agreed prevention whom soccer math import posting presence instant mentioned".split(" ");
const BEE_SEEDS = BEE_WORDS.filter(w => new Set(w).size === 7);
const BEE_RANKS = [[0,'Beginner'],[0.02,'Good Start'],[0.05,'Moving Up'],[0.08,'Good'],[0.15,'Solid'],[0.25,'Nice'],[0.40,'Great'],[0.50,'Amazing'],[0.70,'Genius'],[1,'Queen Bee']];
let beeLetters=[], beeCenter='', beeValid=new Set(), beeFound=new Set(), beeScore=0, beeMax=1, beeCur='', beeBest=0;

function beeWordScore(w, letters) {
  let s = w.length === 4 ? 1 : w.length;
  if (letters.every(ch => w.indexOf(ch) !== -1)) s += 7; // pangram bonus
  return s;
}
function beeNewPuzzle() {
  for (let a = 0; a < 200; a++) {
    const s = BEE_SEEDS[(Math.random() * BEE_SEEDS.length) | 0];
    const L = Array.from(new Set(s.split('')));
    const center = L[(Math.random() * L.length) | 0];
    const set = new Set(L);
    const valid = BEE_WORDS.filter(w => w.indexOf(center) !== -1 && w.split('').every(ch => set.has(ch)));
    if (valid.length >= 15) {
      beeLetters = L; beeCenter = center; beeValid = new Set(valid);
      beeFound = new Set(); beeScore = 0; beeCur = '';
      beeMax = valid.reduce((t, w) => t + beeWordScore(w, L), 0);
      beeRenderHive();
      beeRender();
      return;
    }
  }
  beeFlash('Could not make a puzzle — try again', false);
}
function beeRank() {
  const pct = beeMax ? beeScore / beeMax : 0;
  let r = BEE_RANKS[0][1];
  for (let i = 0; i < BEE_RANKS.length; i++) if (pct >= BEE_RANKS[i][0]) r = BEE_RANKS[i][1];
  return r;
}
function beeSet(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}
function beeFlash(msg, good) {
  const fb = document.getElementById('bee-feedback');
  if (!fb) return;
  fb.textContent = msg;
  fb.className = 'game-feedback' + (good ? ' good' : ' bad');
  clearTimeout(beeFlash._t);
  beeFlash._t = setTimeout(() => { fb.textContent = ''; fb.className = 'game-feedback'; }, 1600);
}
function beeRenderHive() {
  const hive = document.getElementById('bee-hive');
  if (!hive) return;
  hive.innerHTML = '';
  const outer = beeLetters.filter(l => l !== beeCenter);
  const rows = [[outer[0], outer[1]], [outer[2], 'CENTER', outer[3]], [outer[4], outer[5]]];
  rows.forEach(r => {
    const div = document.createElement('div');
    div.className = 'bee-row';
    r.forEach(t => {
      const b = document.createElement('button');
      const isC = t === 'CENTER';
      b.className = 'bee-tile' + (isC ? ' center' : '');
      const ch = isC ? beeCenter : t;
      b.textContent = ch.toUpperCase();
      b.setAttribute('aria-label', 'letter ' + ch);
      b.addEventListener('click', () => beeTap(ch));
      div.appendChild(b);
    });
    hive.appendChild(div);
  });
}
function beeRender() {
  beeSet('bee-score', String(beeScore));
  beeSet('bee-rank', beeRank());
  beeSet('bee-count', String(beeFound.size));
  beeSet('bee-best', String(beeBest));
  const pct = beeMax ? Math.min(100, (beeScore / beeMax) * 100) : 0;
  const fill = document.getElementById('bee-rankfill');
  if (fill) fill.style.width = pct + '%';
  const cur = document.getElementById('bee-cur');
  if (cur) {
    cur.innerHTML = '';
    beeCur.toUpperCase().split('').forEach(ch => {
      const s = document.createElement('span');
      s.textContent = ch;
      cur.appendChild(s);
    });
    const c = document.createElement('span');
    c.className = 'bee-cursor';
    cur.appendChild(c);
  }
  const n = document.getElementById('bee-foundn');
  if (n) n.textContent = String(beeFound.size);
  const wl = document.getElementById('bee-words');
  if (wl) {
    const arr = Array.from(beeFound).sort();
    wl.innerHTML = '';
    arr.forEach(w => {
      const s = document.createElement('span');
      s.className = 'bee-word' + (beeLetters.every(ch => w.indexOf(ch) !== -1) ? ' pangram' : '');
      s.textContent = w;
      wl.appendChild(s);
    });
  }
}
function beeTap(ch) {
  if (beeCur.length >= 15) return;
  beeCur += ch;
  beeRender();
}
function beeDelete() {
  beeCur = beeCur.slice(0, -1);
  beeRender();
}
function beeShuffle() {
  const outer = beeLetters.filter(l => l !== beeCenter);
  for (let i = outer.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = outer[i]; outer[i] = outer[j]; outer[j] = t;
  }
  beeLetters = [outer[0], outer[1], outer[2], beeCenter, outer[3], outer[4], outer[5]];
  beeRenderHive();
}
function beeSubmit() {
  const w = beeCur.toLowerCase();
  if (!w) return;
  if (w.length < 4) { beeFlash('Too short — 4+ letters', false); return; }
  if (w.indexOf(beeCenter) === -1) { beeFlash('Must use the center letter', false); return; }
  if (beeFound.has(w)) { beeFlash('Already found', false); return; }
  if (!beeValid.has(w)) { beeFlash('Not in word list', false); return; }
  beeFound.add(w);
  const pts = beeWordScore(w, beeLetters);
  const isPang = beeLetters.every(ch => w.indexOf(ch) !== -1);
  beeScore += pts;
  if (beeScore > beeBest) {
    beeBest = beeScore;
    try { localStorage.setItem('bee_best', String(beeBest)); } catch (e) {}
  }
  beeCur = '';
  beeRender();
  if (beeFound.size === beeValid.size) beeFlash('Queen Bee! Every word found!', true);
  else beeFlash((isPang ? 'Pangram! +' : '+') + pts, true);
}
function initBee() {
  try { beeBest = parseInt(localStorage.getItem('bee_best') || '0', 10) || 0; } catch (e) { beeBest = 0; }
  if (!beeLetters.length) beeNewPuzzle();
  else beeRender();
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el && !el._beeBound) { el._beeBound = true; el.addEventListener('click', fn); }
  };
  bind('bee-delete', beeDelete);
  bind('bee-shuffle', beeShuffle);
  bind('bee-submit', beeSubmit);
  bind('bee-new', () => { beeNewPuzzle(); });
  const fh = document.getElementById('bee-foundhead');
  if (fh && !fh._beeBound) {
    fh._beeBound = true;
    fh.addEventListener('click', () => {
      const wl = document.getElementById('bee-words');
      if (wl) wl.classList.toggle('hidden');
    });
  }
}

const GRAMMAR_TIME = 60;
function gramBank() {
  return (typeof GRAMMAR_QS !== 'undefined') ? GRAMMAR_QS : {simple: [], medium: [], complex: []};
}
let gramDiff = 'medium', gramScore = 0, gramStreak = 0, gramBest = 0;
let gramLeft = GRAMMAR_TIME, gramTimer = null, gramQs = [], gramQi = 0;
let gramLock = false, gramPlaying = false;

function gramSet(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}
function gramShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function gramStats() {
  gramSet('gram-score', String(gramScore));
  gramSet('gram-streak', String(gramStreak));
  gramSet('gram-best', String(gramBest));
  gramSet('gram-time', gramLeft + 's');
  const fill = document.getElementById('gram-timer-fill');
  if (fill) fill.style.width = (gramLeft / GRAMMAR_TIME * 100) + '%';
}
function gramRenderQ() {
  if (gramQi >= gramQs.length) { gramQs = gramShuffle(gramBank()[gramDiff].slice()); gramQi = 0; }
  const q = gramQs[gramQi];
  gramSet('gram-q', q[0]);
  const box = document.getElementById('gram-options');
  if (!box) return;
  box.innerHTML = '';
  const order = gramShuffle([0, 1, 2, 3]);
  order.forEach(oi => {
    const b = document.createElement('button');
    b.className = 'game-option';
    b.textContent = q[1][oi];
    b.addEventListener('click', () => gramAnswer(oi, b));
    box.appendChild(b);
  });
  const fb = document.getElementById('gram-feedback');
  if (fb) { fb.textContent = ''; fb.className = 'game-feedback'; }
}
function gramAnswer(oi, btn) {
  if (gramLock || !gramPlaying) return;
  gramLock = true;
  const q = gramQs[gramQi];
  const correct = q[2];
  const box = document.getElementById('gram-options');
  const fb = document.getElementById('gram-feedback');
  if (oi === correct) {
    const pts = 10 + Math.min(gramStreak, 5) * 2;
    gramScore += pts;
    gramStreak++;
    if (btn) btn.classList.add('correct');
    if (fb) { fb.textContent = '+' + pts; fb.className = 'game-feedback good'; }
  } else {
    gramStreak = 0;
    if (btn) btn.classList.add('wrong');
    if (box) {
      const kids = box.children;
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].textContent === q[1][correct]) kids[i].classList.add('correct');
      }
    }
    if (fb) { fb.textContent = 'Answer: ' + q[1][correct]; fb.className = 'game-feedback bad'; }
  }
  gramStats();
  setTimeout(() => {
    gramQi++;
    gramLock = false;
    if (gramPlaying) gramRenderQ();
  }, 650);
}
function gramStart() {
  gramScore = 0; gramStreak = 0; gramLeft = GRAMMAR_TIME;
  gramQi = 0; gramLock = false; gramPlaying = true;
  gramQs = gramShuffle(gramBank()[gramDiff].slice());
  const tb = document.getElementById('gram-timer');
  if (tb) tb.classList.remove('hidden');
  const sb = document.getElementById('gram-start');
  if (sb) sb.classList.add('hidden');
  gramStats();
  gramRenderQ();
  clearInterval(gramTimer);
  gramTimer = setInterval(() => {
    gramLeft--;
    gramStats();
    if (gramLeft <= 0) gramEnd();
  }, 1000);
}
function gramEnd() {
  gramPlaying = false;
  clearInterval(gramTimer);
  if (gramScore > gramBest) {
    gramBest = gramScore;
    try { localStorage.setItem('grammar_best', String(gramBest)); } catch (e) {}
  }
  gramSet('gram-q', "Time's up!");
  const box = document.getElementById('gram-options');
  if (box) box.innerHTML = '';
  const fb = document.getElementById('gram-feedback');
  if (fb) { fb.textContent = 'Score: ' + gramScore + '  •  Best: ' + gramBest; fb.className = 'game-feedback'; }
  const sb = document.getElementById('gram-start');
  if (sb) { sb.textContent = 'Play Again'; sb.classList.remove('hidden'); }
  gramStats();
}
function initGrammar() {
  try { gramBest = parseInt(localStorage.getItem('grammar_best') || '0', 10) || 0; } catch (e) { gramBest = 0; }
  gramPlaying = false;
  clearInterval(gramTimer);
  gramSet('gram-best', String(gramBest));
  gramSet('gram-score', '0');
  gramSet('gram-streak', '0');
  gramSet('gram-time', GRAMMAR_TIME + 's');
  gramSet('gram-q', '…');
  const box = document.getElementById('gram-options');
  if (box) box.innerHTML = '';
  const tb = document.getElementById('gram-timer');
  if (tb) tb.classList.add('hidden');
  const sb = document.getElementById('gram-start');
  if (sb) { sb.textContent = 'Start'; sb.classList.remove('hidden'); }
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el && !el._gramBound) { el._gramBound = true; el.addEventListener('click', fn); }
  };
  bind('gram-start', gramStart);
}
document.querySelectorAll('[data-gram-diff]').forEach((b) => {
  if (b._gramBound) return;
  b._gramBound = true;
  b.addEventListener('click', () => {
    gramDiff = b.getAttribute('data-gram-diff') || 'medium';
    document.querySelectorAll('[data-gram-diff]').forEach((x) => x.classList.toggle('active', x === b));
    initGrammar();
  });
});

async function switchView(name, push = true) {
  if (!VIEWS.includes(name)) name = 'tasks';
  currentView = name;
  document.body.dataset.view = name;
  Object.entries(VIEW_IDS).forEach(([v, id]) => {
    const sec = document.getElementById(id);
    if (sec) sec.classList.toggle('hidden', v !== name);
  });
  document.querySelectorAll('#menu .view-link').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === name));
  document.getElementById('view-title').textContent = VIEW_TITLES[name] || 'DayBook';
  menuEl.classList.add('hidden');
  if (push && location.hash !== '#/' + name) location.hash = '#/' + name;
  try {
    await updateBadges();
    if (name === 'reminders') renderReminders();
    else if (name === 'journal') await showJournalList();
    else if (name === 'links') await loadLinks();
    else if (name === 'inbox') await loadInbox();
    else if (name === 'news') renderNews();
    else if (name === 'mood') renderMood();
    else if (name === 'game') initGame();
    else if (name === 'spell') initSpell();
    else if (name === 'bee') initBee();
    else if (name === 'grammar') initGrammar();
    else if (name === 'about') renderAbout();
    else if (name === 'home') renderHome();
    else render();
  } catch (e) {
    console.error('view load failed:', e);
  }
}

window.addEventListener('hashchange', () => {
  const m = location.hash.match(/^#\/(\w+)/);
  const name = m ? m[1] : 'tasks';
  if (name !== currentView) switchView(name, false);
});

document.querySelectorAll('#menu .view-link').forEach((b) =>
  b.addEventListener('click', () => switchView(b.dataset.view)));

document.querySelectorAll('#view-home [data-go]').forEach((b) =>
  b.addEventListener('click', () => switchView(b.dataset.go)));
document.querySelectorAll('#view-home [data-add]').forEach((b) =>
  b.addEventListener('click', () => homeQuickAdd(b.dataset.add)));

async function homeQuickAdd(kind) {
  if (kind === 'task') { await switchView('tasks'); openModal(null); }
  else if (kind === 'reminder') { await switchView('reminders'); openReminderModal(null); }
  else if (kind === 'journal') { await switchView('journal'); openJournalDay(localDateStr(new Date())); }
  else if (kind === 'link') { await switchView('links'); openLinkModal(null); }
}

function renderHome() {
  try {
    const now = new Date();
    const h = now.getHours();
    const greet = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const hh = document.getElementById('home-hello');
    if (hh) hh.textContent = greet;
    const hd = document.getElementById('home-date');
    if (hd) hd.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const setNum = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setNum('home-now', cards.filter((c) => c.lane === 'now' && !c.deleted_at).length);
    const nowMs = Date.now();
    const isLive = (r) => (r.status === 'active' || r.status === 'snoozed');
    setNum('home-due', reminders.filter((r) => isLive(r) && new Date(r.remind_at).getTime() <= nowMs).length);
    setNum('home-inbox', inboxCount);
    setNum('home-links', allLinks.length);
    const up = document.getElementById('home-upnext');
    if (up) {
      const upcoming = reminders.filter((r) => isLive(r) && new Date(remEventAt(r)).getTime() > nowMs)
        .sort((a, b) => new Date(remEventAt(a)) - new Date(remEventAt(b))).slice(0, 3);
      if (!upcoming.length) {
        up.innerHTML = '<p class="home-empty">Nothing coming up.</p>';
      } else {
        up.innerHTML = upcoming.map((r) => {
          const at = new Date(remEventAt(r));
          const when = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
            at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          return '<button type="button" class="home-up-item"><span class="home-up-title">' +
            escHtml(r.title || '(untitled)') + '</span><span class="home-up-when">' +
            escHtml(when) + '</span></button>';
        }).join('');
        up.querySelectorAll('.home-up-item').forEach((b) =>
          b.addEventListener('click', () => switchView('reminders')));
      }
    }
  } catch (e) {  }
}

const profileBtn = document.getElementById('profile-btn');
const profileMenu = document.getElementById('profile-menu');
if (profileBtn && profileMenu) {
  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    profileMenu.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!profileMenu.classList.contains('hidden') && !profileMenu.contains(e.target)) {
      profileMenu.classList.add('hidden');
    }
  });
}

function renderAbout() {
  document.getElementById('about-version').textContent = APP_VERSION;
  document.getElementById('about-build').textContent = BUILD_DATE;
}

function setBadge(id, n, hot) {
  const el = document.getElementById(id);
  el.textContent = n;
  el.classList.toggle('zero', n === 0);
  el.classList.toggle('hot', !!hot && n > 0);
}

async function updateBadges() {
  try {
    const [rems, lks, ib] = await Promise.all([
      api('GET', '/api/app?r=daybook&view=reminders'),
      api('GET', '/api/app?r=daybook&view=links'),
      api('GET', '/api/app?r=daybook&view=inbox&badge=1'),
    ]);
    reminders = rems;
    allLinks = lks;
    const nowMs = Date.now();
    const due = rems.filter((r) =>
      (r.status === 'active' || r.status === 'snoozed') && new Date(r.remind_at).getTime() <= nowMs
    ).length;
    const nowCount = cards.filter((c) => c.lane === 'now' && !c.deleted_at).length;
    inboxCount = ib.count || 0;
    setBadge('badge-tasks', nowCount, false);
    setBadge('badge-reminders', due, due > 0);
    const pb = document.getElementById('badge-profile-due');
    if (pb) { pb.textContent = due > 99 ? '99+' : String(due); pb.classList.toggle('show', due > 0); }
    setBadge('badge-links', lks.length, false);
    setBadge('badge-inbox', ib.count, ib.count > 0);
    const dot = document.getElementById('menu-dot');
    dot.textContent = ib.count > 99 ? '99+' : String(ib.count);
    dot.classList.toggle('hidden', ib.count === 0);
  } catch (e) {  }
}

function rruleLabel(rrule) {
  if (!rrule) return '';
  const p = {};
  rrule.split(';').forEach((x) => {
    const i = x.indexOf('=');
    if (i > 0) p[x.slice(0, i).toUpperCase()] = x.slice(i + 1);
  });
  const freq = (p.FREQ || '').toUpperCase();
  const interval = parseInt(p.INTERVAL || '1', 10) || 1;
  const dn = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' };
  const days = (p.BYDAY || '').split(',').map((d) => dn[d]).filter(Boolean).join(', ');
  const ev = (s) => (interval > 1 ? `Every ${interval} ${s}s` : s[0].toUpperCase() + s.slice(1));
  if (freq === 'WEEKLY') return `${ev('week')}${days ? ' · ' + days : ''}`;
  if (freq === 'DAILY') return ev('day');
  if (freq === 'MONTHLY') return `${ev('month')}${p.BYMONTHDAY ? ' · ' + p.BYMONTHDAY + 'th' : ''}`;
  if (freq === 'YEARLY') return ev('year');
  return rrule;
}

function renderReminders() {
  renderTagFilter(document.getElementById('rem-tag-filter'), reminderTagFilter, (v) => {
    reminderTagFilter = v;
    renderReminders();
  });
  const box = document.getElementById('reminder-timeline');
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const tmr = localDateStr(addDaysLocal(now, 1));
  const weekStart = addDaysLocal(startToday, -((startToday.getDay() + 6) % 7));
  const nextWeekStart = addDaysLocal(weekStart, 7);
  const groups = { Overdue: [], Today: [], Tomorrow: [], 'This week': [], Later: [] };
  const q = reminderSearch.trim().toLowerCase();
  reminders
    .filter((r) => r.status === 'active' || r.status === 'snoozed')
    .filter((r) => (!reminderTagFilter || (r.tags || []).includes(reminderTagFilter)))
    .filter((r) => !q || ((r.title || '') + ' ' + (r.detail || '')).toLowerCase().includes(q))
    .sort((a, b) => new Date(remEventAt(a)) - new Date(remEventAt(b)))
    .forEach((r) => {
      const at = new Date(remEventAt(r));
      const key = at < startToday ? 'Overdue'
        : localDateStr(at) === localDateStr(now) ? 'Today'
        : localDateStr(at) === tmr ? 'Tomorrow'
        : at < nextWeekStart ? 'This week' : 'Later';
      groups[key].push(r);
    });
  box.innerHTML = '';
  let any = false;
  Object.entries(groups).forEach(([name, list]) => {
    if (!list.length) return;
    any = true;
    const g = document.createElement('div');
    g.className = 'tl-group';
    const h = document.createElement('h3');
    h.textContent = name + ' (' + list.length + ')';
    g.appendChild(h);
    list.forEach((r) => g.appendChild(remRow(r)));
    box.appendChild(g);
  });
  if (!any) box.innerHTML = '<p class="empty-note">No active reminders.</p>';
}

function remRow(r) {
  const el = document.createElement('div');
  const sod = new Date();
  sod.setHours(0, 0, 0, 0);
  el.className = 'rem-row' +
    (new Date(remEventAt(r)) < sod ? ' is-overdue' : '') +
    (r.status === 'snoozed' ? ' is-snoozed' : '');
  const label = rruleLabel(r.recurrence);
  const at = new Date(remEventAt(r));
  const dateStr = at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeStr = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  const metaBits = [label, r.status === 'snoozed' ? 'Snoozed' : '']
    .filter(Boolean).join(' · ');
  el.innerHTML =
    `<div class="rem-when"><span class="d">${escHtml(dateStr)}</span><span class="t">${escHtml(timeStr)}</span></div>` +
    `<div class="rem-main"><div class="link-title">${escHtml(r.title)}</div>` +
    (metaBits ? `<div class="link-line2">${escHtml(metaBits)}</div>` : '') +
    (r.detail ? `<div class="rem-detail-full">${escHtml(r.detail)}</div>` : '') +
    tagBubblesHtml(r.tags) +
    `</div>` +
    `<div class="rem-actions"><button class="link-menu-btn" aria-label="Reminder actions" title="Actions">⋮</button></div>`;
  el.querySelector('.link-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRemMenu(r.id, e.currentTarget);
  });
  return el;
}

let remMenuFor = null;
function closeRemMenu() {
  const m = document.getElementById('rem-menu');
  if (m) m.classList.add('hidden');
  remMenuFor = null;
}
function toggleRemMenu(id, btn) {
  const menu = document.getElementById('rem-menu');
  if (remMenuFor === id) { closeRemMenu(); return; }
  remMenuFor = id;
  menu.querySelectorAll('button').forEach((b) => {
    b.onclick = () => { closeRemMenu(); remAct(id, b.dataset.a); };
  });
  menu.classList.remove('hidden');
  const r = btn.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = Math.min(r.right - mw, window.innerWidth - mw - 8);
  let y = r.bottom + 6;
  if (y + mh > window.innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  menu.style.left = Math.max(8, x) + 'px';
  menu.style.top = y + 'px';
}

async function remAct(id, a) {
  try {
    if (a === 'edit') {
      openReminderModal(reminders.find((x) => x.id === id));
      return;
    }
    if (a === 'snooze') {
      const mins = await askSnooze();
      if (mins === null) return;
      await api('POST', '/api/app?r=daybook&view=reminders&id=' + encodeURIComponent(id), {
        action: 'snooze', minutes: mins,
      });
    } else if (a === 'complete') {
      const rc = reminders.find((x) => x.id === id);
      if (rc) { rc.status = 'completed'; renderReminders(); }
      await api('POST', '/api/app?r=daybook&view=reminders&id=' + encodeURIComponent(id), { action: 'complete' });
    } else if (a === 'delete') {
      const r = reminders.find((x) => x.id === id);
      const yes = await confirmAction({
        title: 'Delete this reminder?',
        message: (r ? '“' + r.title + '”' : 'This reminder') + ' will be permanently deleted.',
        confirmLabel: 'Delete',
      });
      if (!yes) return;
      await api('DELETE', '/api/app?r=daybook&view=reminders&id=' + encodeURIComponent(id));
    } else if (a === 'dismiss') {
      const yes = await confirmAction({
        title: 'Dismiss this reminder?',
        message: 'Recurring reminders move to their next occurrence.',
        confirmLabel: 'Dismiss',
      });
      if (!yes) return;
      await api('POST', '/api/app?r=daybook&view=reminders&id=' + encodeURIComponent(id), { action: 'dismiss' });
    }
    await updateBadges();
    renderReminders();
  } catch (e) {
    toast('Could not update the reminder. Please try again.');
  }
}

const remEventAt=(r)=>r.event_at||r.remind_at; let remTimeTouched=false;
function openReminderModal(r) {
  editingReminderId = r ? r.id : null;
  document.getElementById('reminder-title').textContent = r ? 'Edit reminder' : 'Add reminder';
  document.getElementById('r-title').value = r ? r.title : '';
  document.getElementById('r-detail').value = r ? (r.detail || '') : '';
  remTimeTouched=false;
  const ev=r?new Date(remEventAt(r)):new Date(Date.now()+3600000); ev.setMinutes(0,0,0);
  const evv=toLocalInput(ev); document.getElementById('r-event').value=evv;
  const eb=document.querySelector('[data-dtdate="r-event"]'); eb.textContent=fmtDtButtonLabel(evv,eb);
  const d=r&&r.remind_at?new Date(r.remind_at):new Date(ev.getTime()-3600000); d.setMinutes(0,0,0);
  const dv=toLocalInput(d); document.getElementById('r-at').value=dv;
  const ab2=document.querySelector('[data-dtdate="r-at"]'); ab2.textContent=fmtDtButtonLabel(dv,ab2);
  const rv = r ? (r.recurrence || '') : '';
  setDropdown('r-rrule', rv);
  const endsV = r && r.recurrence_end_date ? 'ondate' : (r && r.recurrence_end_after ? 'after' : 'never');
  setDropdown('r-ends', endsV);
  if (r && r.recurrence_end_date) {
    document.getElementById('r-end-date').value = toLocalInput(new Date(r.recurrence_end_date)).split('T')[0];
    const db = document.querySelector('[data-dtdate="r-end-date"]');
    if (db) db.textContent = fmtDtButtonLabel(document.getElementById('r-end-date').value, db);
  } else {
    document.getElementById('r-end-date').value = '';
  }
  document.getElementById('r-end-after').value = r && r.recurrence_end_after ? r.recurrence_end_after : '';
  updateEndsVisibility();
  setDropdown('r-tag', r && r.tag ? r.tag : '');
  setDropdown('r-status', r ? r.status : 'active');
  document.getElementById('reminder-backdrop').classList.remove('hidden');
  document.getElementById('r-title').focus();
}
function closeReminderModal() {
  document.getElementById('reminder-backdrop').classList.add('hidden');
  editingReminderId = null;
  closeDropdown();
}

let dtState = null; // { y, m (0-11), d, hh (24h), mm }
let dtCtx = null;   // { mode: 'datetime'|'date', onDone }

function fmtDtButtonLabel(v, btn) {
  const isDT = btn.dataset.dtmode === 'datetime';
  if (!v) return btn.dataset.dtempty || (isDT ? 'Pick date & time' : 'No date');
  const d = new Date(v + (isDT ? '' : 'T12:00:00'));
  if (isNaN(d)) return btn.dataset.dtempty || 'No date';
  return d.toLocaleString(undefined, isDT
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}
function openDtPicker(opts) {
  closeDropdown();
  dtCtx = opts;
  const v = opts.initial || '';
  let d;
  if (opts.mode === 'date') d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : new Date();
  else d = v ? new Date(v) : new Date(Date.now() + 3600000);
  if (isNaN(d)) d = new Date();
  const q0 = [0, 15, 30, 45].reduce((a, b) => Math.abs(b - d.getMinutes()) < Math.abs(a - d.getMinutes()) ? b : a);
  dtState = { y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), hh: d.getHours(), mm: q0 };
  document.querySelector('#dt-backdrop .modal').classList.toggle('date-only', opts.mode === 'date');
  setDropdown('dt-hour', String(dtState.hh % 12 || 12));
  setDropdown('dt-min', String(dtState.mm).padStart(2, '0'));
  setDropdown('dt-ampm', dtState.hh < 12 ? 'AM' : 'PM');
  renderDtGrid();
  document.getElementById('dt-backdrop').classList.remove('hidden');
}
function renderDtGrid() {
  const label = document.getElementById('dt-month-label');
  label.textContent = new Date(dtState.y, dtState.m, 1)
    .toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const grid = document.getElementById('dt-grid');
  grid.innerHTML = '';
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((w) => {
    const s = document.createElement('span');
    s.className = 'dow'; s.textContent = w;
    grid.appendChild(s);
  });
  const first = new Date(dtState.y, dtState.m, 1).getDay();
  const daysIn = new Date(dtState.y, dtState.m + 1, 0).getDate();
  const today = localDateStr(new Date());
  for (let i = 0; i < first; i++) {
    const b = document.createElement('span');
    b.className = 'blank';
    grid.appendChild(b);
  }
  for (let day = 1; day <= daysIn; day++) {
    const ds = dtState.y + '-' + pad2(dtState.m + 1) + '-' + pad2(day);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'day-cell' +
      (ds === today ? ' today' : '') +
      (day === dtState.d ? ' selected' : '');
    b.textContent = day;
    b.addEventListener('click', () => { dtState.d = day; renderDtGrid(); });
    grid.appendChild(b);
  }
}
function closeDtPicker() {
  document.getElementById('dt-backdrop').classList.add('hidden');
  dtState = null; dtCtx = null;
}
function commitDtPicker() {
  let v;
  if (dtCtx.mode === 'date') {
    v = dtState.y + '-' + pad2(dtState.m + 1) + '-' + pad2(dtState.d);
  } else {
    const h12 = parseInt(document.getElementById('dt-hour').value, 10);
    const mm = parseInt(document.getElementById('dt-min').value, 10);
    const ap = document.getElementById('dt-ampm').value;
    const hh = (h12 % 12) + (ap === 'PM' ? 12 : 0);
    v = dtState.y + '-' + pad2(dtState.m + 1) + '-' + pad2(dtState.d) + 'T' + pad2(hh) + ':' + pad2(mm);
  }
  const cb = dtCtx.onDone;
  closeDtPicker();
  if (cb) cb(v);
}
document.getElementById('dt-prev').addEventListener('click', () => {
  dtState.m--; if (dtState.m < 0) { dtState.m = 11; dtState.y--; }
  const daysIn = new Date(dtState.y, dtState.m + 1, 0).getDate();
  if (dtState.d > daysIn) dtState.d = daysIn;
  renderDtGrid();
});
document.getElementById('dt-next').addEventListener('click', () => {
  dtState.m++; if (dtState.m > 11) { dtState.m = 0; dtState.y++; }
  const daysIn = new Date(dtState.y, dtState.m + 1, 0).getDate();
  if (dtState.d > daysIn) dtState.d = daysIn;
  renderDtGrid();
});
document.getElementById('dt-done').addEventListener('click', commitDtPicker);
document.getElementById('dt-cancel').addEventListener('click', closeDtPicker);
document.getElementById('dt-clear').addEventListener('click', () => {
  const cb = dtCtx.onDone;
  closeDtPicker();
  if (cb) cb('');
});
document.getElementById('dt-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'dt-backdrop') closeDtPicker();
});

const DD_DEFS = {
  'f-tag': () => allTags.length ? allTags.map(t => [t.name, t.name]) : [['work', 'Work'], ['personal', 'Personal']],
  'f-priority': () => [['high', 'Big rock'], ['normal', 'Medium'], ['low', 'Small']],
  'f-lane': () => [['now', 'Now'], ['next', 'Next'], ['waiting', 'Waiting on others'], ['done', 'Done']],
  'r-tag': () => [['', 'None'], ['work', 'Work'], ['personal', 'Personal']],
  'r-status': () => [['active', 'Active'], ['snoozed', 'Snoozed'], ['dismissed', 'Dismissed'], ['completed', 'Completed']],
  'r-rrule': () => rruleItems(),
  'r-ends': () => [['never','Never'],['ondate','On a date'],['after','After N occurrences']],
  't-lane': () => [['now', 'Now'], ['next', 'Next'], ['waiting', 'Waiting on others'], ['done', 'Done']],
  't-tag': () => [['work', 'Work'], ['personal', 'Personal']],
  't-rrule': () => rruleItems(),
  'link-tag-filter': () => [['', 'All tags']].concat(linkTagItems().map((x) => [x, x])),
  'dt-hour': () => Array.from({ length: 12 }, (_, i) => [String(i + 1), String(i + 1)]),
  'dt-min': () => [['00', '00'], ['15', '15'], ['30', '30'], ['45', '45']],
  'dt-ampm': () => [['AM', 'AM'], ['PM', 'PM']],
};
function linkTagItems() {
  const set = new Set();
  (allLinks || []).forEach((l) => (l.tags || '').split(',').forEach((x) => {
    x = x.trim(); if (x) set.add(x);
  }));
  return [...set].sort();
}
function ddLabel(id, value) {
  const hit = (DD_DEFS[id] ? DD_DEFS[id]() : []).find(([iv]) => iv === value);
  return hit ? hit[1] : value;
}
function setDropdown(id, value) {
  const hid = document.getElementById(id);
  if (hid) hid.value = value;
  const btn = document.querySelector('[data-dd="' + id + '"]');
  if (btn) btn.textContent = ddLabel(id, value);
}
function setDueDate(v) {
  document.getElementById('f-due').value = v || '';
  const btn = document.querySelector('[data-dtdate="f-due"]');
  if (btn) btn.textContent = fmtDtButtonLabel(v || '', btn);
}
function rruleItems() {
  return [['', 'None'], ['FREQ=DAILY', 'Daily'], ['FREQ=WEEKLY', 'Weekly'],
    ['FREQ=MONTHLY', 'Monthly'], ['FREQ=YEARLY', 'Yearly']];
}
function closeDropdown() {
  const m = document.getElementById('dd-menu');
  if (m) { m.classList.add('hidden'); m.dataset.for = ''; }
}
function openDropdown(btn, items, current, onPick) {
  const menu = document.getElementById('dd-menu');
  menu.innerHTML = '';
  items.forEach(([value, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.textContent = label;
    if (value === current) b.classList.add('dd-current');
    b.addEventListener('click', () => { closeDropdown(); onPick(value, label); });
    menu.appendChild(b);
  });
  menu.classList.remove('hidden');
  const r = btn.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = Math.min(r.left, window.innerWidth - mw - 8);
  let y = r.bottom + 6;
  if (y + mh > window.innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  menu.style.left = Math.max(8, x) + 'px';
  menu.style.top = y + 'px';
  menu.style.minWidth = Math.max(150, r.width) + 'px';
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.dd-field');
  if (!btn || !btn.dataset.dd || !DD_DEFS[btn.dataset.dd]) return;
  const id = btn.dataset.dd;
  const menu = document.getElementById('dd-menu');
  if (!menu.classList.contains('hidden') && menu.dataset.for === id) { closeDropdown(); return; }
  const cur = document.getElementById(id).value;
  let items = DD_DEFS[id]();
  if ((id === 'r-rrule' || id === 't-rrule') && cur && !items.some(([iv]) => iv === cur)) {
    items = items.concat([[cur, (rruleLabel(cur) || 'Custom') + ' (custom)']]);
  }
  menu.dataset.for = id;
  openDropdown(btn, items, cur, (val) => {
    if (id === 'link-tag-filter') { linkTag = val; loadLinks(); return; }
    setDropdown(id, val);
  });
});
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-dtdate]');
  if (!btn) return;
  const id = btn.dataset.dtdate;
  const isDT = btn.dataset.dtmode === 'datetime';
  openDtPicker({
    mode: isDT ? 'datetime' : 'date',
    initial: document.getElementById(id).value,
    onDone: (v) => {
      document.getElementById(id).value = v;
      btn.textContent = fmtDtButtonLabel(v, btn);
    },
  });
});

function askSnooze() {
  return new Promise((resolve) => {
    const bd = document.getElementById('snooze-backdrop');
    bd.classList.remove('hidden');
    const done = (v) => {
      bd.classList.add('hidden');
      bd.querySelectorAll('[data-m]').forEach((b) => { b.onclick = null; });
      document.getElementById('snooze-cancel').onclick = null;
      resolve(v);
    };
    bd.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => done(parseInt(b.dataset.m, 10)); });
    document.getElementById('snooze-cancel').onclick = () => done(null);
  });
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

document.getElementById('add-reminder').addEventListener('click', () => openReminderModal(null));
document.getElementById('reminder-search').addEventListener('input', (e) => {
  clearTimeout(reminderSearchTimer);
  reminderSearchTimer = setTimeout(() => {
    reminderSearch = e.target.value;
    renderReminders();
  }, 300);
});
document.getElementById('reminder-cancel').addEventListener('click', closeReminderModal);
document.getElementById('reminder-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'reminder-backdrop') closeReminderModal();
});
document.getElementById('r-event-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  openDtPicker({ mode: 'datetime', initial: document.getElementById('r-event').value, onDone: (v) => {
    document.getElementById('r-event').value = v;
    const b = document.querySelector('[data-dtdate="r-event"]'); b.textContent = fmtDtButtonLabel(v, b);
    if (!remTimeTouched && v) {
      const rv = toLocalInput(new Date(new Date(fromLocalInput(v)).getTime() - 3600000));
      document.getElementById('r-at').value = rv;
      const ab = document.querySelector('[data-dtdate="r-at"]'); ab.textContent = fmtDtButtonLabel(rv, ab);
    } } });
});
document.getElementById('r-at-btn').addEventListener('click', () => { remTimeTouched = true; });
function updateEndsVisibility(){const h=document.getElementById('r-rrule').value!=='';document.getElementById('r-ends-wrap').classList.toggle('hidden',!h);updateEndsFields();}
function updateEndsFields(){const v=document.getElementById('r-ends').value||'never';document.getElementById('r-end-date-wrap').classList.toggle('hidden',v!=='ondate');document.getElementById('r-end-after-wrap').classList.toggle('hidden',v!=='after');}
document.getElementById('r-rrule-btn').addEventListener('click', () => {
  setTimeout(updateEndsVisibility, 50);
});
document.getElementById('r-ends-btn').addEventListener('click', () => {
  setTimeout(updateEndsFields, 50);
});

document.getElementById('reminder-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const at=fromLocalInput(document.getElementById('r-at').value);
  const evAt=fromLocalInput(document.getElementById('r-event').value);
  if(!at){toast('Pick a valid date and time.');return;}
  const data = {
    title: document.getElementById('r-title').value.trim(),
    detail: document.getElementById('r-detail').value.trim(),
    event_at: evAt || null,
    remind_at: at,
    recurrence: document.getElementById('r-rrule').value.trim() || null,
    recurrence_end_date: document.getElementById('r-ends').value==='ondate'&&document.getElementById('r-end-date').value?new Date(document.getElementById('r-end-date').value+'T23:59:59').toISOString():null,
    recurrence_end_after: document.getElementById('r-ends').value==='after'?Math.max(1,parseInt(document.getElementById('r-end-after').value,10)||0)||null:null,
    tag: document.getElementById('r-tag').value || null,
    tags: pickedTags(document.getElementById('r-tags')),
    status: document.getElementById('r-status').value,
  };
  if (!data.title) return;
  try {
    if (editingReminderId) {
      await api('PATCH', '/api/app?r=daybook&view=reminders&id=' + encodeURIComponent(editingReminderId), data);
    } else {
      await api('POST', '/api/app?r=daybook&view=reminders', data);
    }
    closeReminderModal();
    await updateBadges();
    renderReminders();
  } catch (err) {
    toast('Could not save the reminder. Please try again.');
  }
});

let journalFilter = 'all';
let journalTagFilter = '';
let journalEntries = [];
let journalSearch = '';
let journalSearchTimer = null;

function fmtEntryDate(ds) {
  const d = new Date(ds + 'T12:00:00');
  return {
    date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
  };
}

async function loadJournalList() {
  const box = document.getElementById('j-entries');
  box.innerHTML = '<p class="empty-note">Loading entries…</p>';
  try {
    journalEntries = await api('GET', '/api/app?r=daybook&view=journal&list=100');
  } catch (e) {
    box.innerHTML = '<p class="empty-note">Could not load entries.</p>';
    return;
  }
  renderJournalList();
}

function renderJournalList() {
  renderTagFilter(document.getElementById('j-tag-filter'), journalTagFilter, (v) => {
    journalTagFilter = v;
    renderJournalList();
  });
  const box = document.getElementById('j-entries');
  const thisMonth = localDateStr(new Date()).slice(0, 7);
  const q = journalSearch.trim().toLowerCase();
  const items = (journalFilter === 'month'
    ? journalEntries.filter((e) => e.date.slice(0, 7) === thisMonth)
    : journalEntries).filter((e) => (!journalTagFilter || (e.tags || []).includes(journalTagFilter)) && (!q ||
      (e.preview || '').toLowerCase().includes(q) ||
      (e.title || '').toLowerCase().includes(q)));
  if (!items.length) {
    box.innerHTML = '<p class="empty-note">No entries yet. Tap + Add to write your first.</p>';
    return;
  }
  box.innerHTML = '';
  let lastDate = null;
  items.forEach((e) => {
    if (e.date !== lastDate) {
      lastDate = e.date;
      const f = fmtEntryDate(e.date);
      const h = document.createElement('div');
      h.className = 'journal-date-head';
      h.innerHTML = `<span class="d">${escHtml(f.date)}</span><span class="w">${escHtml(f.weekday)}</span>`;
      box.appendChild(h);
    }
    const b = document.createElement('button');
    b.className = 'soft-card entry-card entry-card-grouped';
    b.innerHTML =
      `<span class="entry-preview">${e.mood ? '<span class="entry-mood">' + escHtml(e.mood) + '</span> ' : ''}${e.title ? '<strong>' + escHtml(e.title) + '</strong><br>' : ''}${escHtml(e.preview || '—')}${tagBubblesHtml(e.tags)}</span>` +
      `<span class="entry-chev">›</span>`;
    b.addEventListener('click', () => openJournalDetail(e.id));
    box.appendChild(b);
  });
}

let journalDetailId = null;

async function openJournalDetail(id) {
  journalDetailId = id;
  document.getElementById('j-detail-date').textContent = '';
  document.getElementById('j-detail-body').textContent = 'Loading…';
  document.getElementById('j-list-screen').classList.add('hidden');
  document.getElementById('j-day-screen').classList.add('hidden');
  document.getElementById('j-detail-screen').classList.remove('hidden');
  try {
    const e = await api('GET', '/api/app?r=daybook&view=journal&id=' + id);
    if (!e) { document.getElementById('j-detail-body').textContent = 'Entry not found.'; return; }
    const f = fmtEntryDate(e.date);
    document.getElementById('j-detail-date').innerHTML =
      escHtml(f.date) + '<span class="w">' + escHtml(f.weekday) + '</span>';
    const card = document.querySelector('#j-detail-screen .soft-card');
    card.querySelectorAll('.detail-title,.detail-mood,.detail-tags,.detail-attach').forEach((n) => n.remove());
    if (e && e.title) {
      const t = document.createElement('div');
      t.className = 'detail-title';
      t.textContent = e.title;
      document.getElementById('j-detail-date').after(t);
    }
    if (e && e.mood) {
      const m = document.createElement('div');
      m.className = 'detail-mood';
      m.textContent = e.mood;
      const anchor = card.querySelector('.detail-title') || document.getElementById('j-detail-date');
      anchor.after(m);
    }
    document.getElementById('j-detail-body').innerHTML = sanitizeHtml((e && e.body) || '') || '—';
    if (e && Array.isArray(e.tags) && e.tags.length) {
      const tb = document.createElement('div');
      tb.className = 'detail-tags';
      tb.innerHTML = tagBubblesHtml(e.tags);
      document.getElementById('j-detail-body').after(tb);
    }
    if (e && Array.isArray(e.attachments) && e.attachments.length) {
      const wrap = document.createElement('div');
      wrap.className = 'detail-attach';
      e.attachments.forEach((a) => {
        const link = document.createElement('a');
        link.href = a.data || '#';
        link.download = a.name || 'file';
        link.textContent = '📎 ' + (a.name || 'file');
        wrap.appendChild(link);
      });
      card.appendChild(wrap);
    }
  } catch (err) {
    document.getElementById('j-detail-body').textContent = 'Could not load entry.';
  }
}

let journalEditId = null;

function openJournalForm(id, date) {
  journalEditId = id || null;
  journalDate = date || localDateStr(new Date());
  document.getElementById('j-list-screen').classList.add('hidden');
  document.getElementById('j-detail-screen').classList.add('hidden');
  document.getElementById('j-day-screen').classList.remove('hidden');
  loadJournalForm();
}

function openJournalDay(date) {
  openJournalForm(null, date);
}

function showJournalList() {
  document.getElementById('j-day-screen').classList.add('hidden');
  document.getElementById('j-detail-screen').classList.add('hidden');
  document.getElementById('j-list-screen').classList.remove('hidden');
  loadJournalList();
}

document.querySelectorAll('#view-journal .filters button').forEach((p) => {
  p.addEventListener('click', () => {
    document.querySelectorAll('#view-journal .filters button').forEach((x) => x.classList.remove('active'));
    p.classList.add('active');
    journalFilter = p.dataset.f;
    renderJournalList();
  });
});
document.getElementById('j-add').addEventListener('click', () => {
  openJournalDay(localDateStr(new Date()));
});
document.getElementById('j-detail-back').addEventListener('click', showJournalList);
document.getElementById('j-detail-edit').addEventListener('click', () => {
  if (journalDetailId) openJournalForm(journalDetailId);
});
document.getElementById('j-detail-delete').addEventListener('click', async () => {
  if (!journalDetailId) return;
  const yes = await confirmAction({
    title: 'Delete this entry?',
    message: 'The journal entry for this day will be permanently removed.',
    okText: 'Delete',
  });
  if (!yes) return;
  try {
    await api('DELETE', '/api/app?r=daybook&view=journal&id=' + journalDetailId);
    toast('Entry deleted.');
    showJournalList();
  } catch (err) {
    toast('Could not delete the entry. Please try again.');
  }
});
document.getElementById('journal-search').addEventListener('input', (e) => {
  clearTimeout(journalSearchTimer);
  journalSearchTimer = setTimeout(() => {
    journalSearch = e.target.value;
    renderJournalList();
  }, 300);
});
document.getElementById('j-back').addEventListener('click', showJournalList);

let journalAttachments = [];
let journalMood = '';

const JOURNAL_MOODS = ['😄', '🙂', '😐', '😟', '😢', '😡', '🤩', '😴'];

function renderMoodRow() {
  const row = document.getElementById('j-mood');
  row.innerHTML = '';
  JOURNAL_MOODS.forEach((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mood-btn' + (journalMood === m ? ' selected' : '');
    b.textContent = m;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', journalMood === m ? 'true' : 'false');
    b.addEventListener('click', () => {
      journalMood = journalMood === m ? '' : m;
      renderMoodRow();
    });
    row.appendChild(b);
  });
}

function resizeImage(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1200;
      let w = img.width, h = img.height;
      if (w > max || h > max) {
        const s = max / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html');
  const allowed = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
    'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE', 'CODE',
    'HR', 'DIV', 'SPAN', 'A', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
  const walk = (node) => {
    const kids = Array.from(node.childNodes);
    for (const k of kids) {
      if (k.nodeType === 8) { k.remove(); continue; }
      if (k.nodeType !== 1) continue;
      if (!allowed.has(k.tagName)) {
        while (k.firstChild) node.insertBefore(k.firstChild, k);
        k.remove();
        continue;
      }
      for (const a of Array.from(k.attributes)) {
        const n = a.name.toLowerCase();
        if (n.startsWith('on')) { k.removeAttribute(a.name); continue; }
        if ((k.tagName === 'A' || k.tagName === 'IMG') && (n === 'href' || n === 'src')) {
          const v = a.value.trim();
          if (!/^(https?:|data:image\/|mailto:)/i.test(v)) k.removeAttribute(a.name);
          continue;
        }
        if (n === 'style' || n === 'class' || n === 'id') { k.removeAttribute(a.name); continue; }
      }
      walk(k);
    }
  };
  const root = doc.body.firstChild || doc.body;
  walk(root);
  return root.innerHTML;
}

function setFormDate(ds) {
  document.getElementById('j-date-hid').value = ds;
  document.getElementById('j-date-btn').textContent =
    new Date(ds + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderAttachList() {
  const box = document.getElementById('j-attach-list');
  box.innerHTML = '';
  journalAttachments.forEach((a, i) => {
    const chip = document.createElement('span');
    chip.className = 'attach-chip';
    const label = document.createElement('span');
    label.textContent = a.name || 'file';
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '\u00d7';
    x.setAttribute('aria-label', 'Remove attachment');
    x.addEventListener('click', () => { journalAttachments.splice(i, 1); renderAttachList(); });
    chip.appendChild(label);
    chip.appendChild(x);
    box.appendChild(chip);
  });
}

async function loadJournalForm() {
  const ds = journalDate;
  setFormDate(ds);
  document.getElementById('j-title').value = '';
  document.getElementById('j-rich').innerHTML = '';
  journalAttachments = [];
  journalMood = '';
  renderMoodRow();
  renderTagPicker(document.getElementById('j-tags'), []);
  renderAttachList();
  if (!journalEditId) return; // new entry
  try {
    const e = await api('GET', '/api/app?r=daybook&view=journal&id=' + journalEditId);
    if (e) {
      journalDate = e.date;
      setFormDate(e.date);
      document.getElementById('j-title').value = e.title || '';
      journalMood = e.mood || '';
      renderMoodRow();
      renderTagPicker(document.getElementById('j-tags'), e.tags || []);
      document.getElementById('j-rich').innerHTML = sanitizeHtml(e.body || '');
      journalAttachments = Array.isArray(e.attachments) ? e.attachments : [];
      renderAttachList();
    }
  } catch (err) {  }
}

function insertImageAtCursor(dataUrl, name) {
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = name || 'image';
  const rich = document.getElementById('j-rich');
  rich.focus();
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(img);
    range.setStartAfter(img);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    rich.appendChild(img);
  }
}
function downscaleInlineImages() {
  const rich = document.getElementById('j-rich');
  rich.querySelectorAll('img:not([data-rs])').forEach((img) => {
    img.setAttribute('data-rs', '1');
    const probe = new Image();
    probe.onload = () => {
      const max = 1200;
      if (probe.width <= max && probe.height <= max) return;
      const s = max / Math.max(probe.width, probe.height);
      const c = document.createElement('canvas');
      c.width = Math.round(probe.width * s);
      c.height = Math.round(probe.height * s);
      c.getContext('2d').drawImage(probe, 0, 0, c.width, c.height);
      img.src = c.toDataURL('image/jpeg', 0.82);
    };
    probe.src = img.src;
  });
}

document.getElementById('j-rich').addEventListener('paste', (e) => {
  const cd = e.clipboardData;
  if (!cd) return;
  const files = Array.from(cd.files || []).filter((f) => f.type.startsWith('image/'));
  const items = Array.from(cd.items || [])
    .filter((it) => it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter(Boolean);
  const imgs = files.length ? files : items;
  if (imgs.length) {
    e.preventDefault();
    imgs.forEach(async (f) => {
      const dataUrl = await resizeImage(f);
      if (dataUrl) insertImageAtCursor(dataUrl, f.name);
    });
    return;
  }
  setTimeout(downscaleInlineImages, 50);
});

document.getElementById('j-attach-btn').addEventListener('click', () => {
  document.getElementById('j-file').click();
});
document.getElementById('j-file').addEventListener('change', (e) => {
  Array.from(e.target.files || []).forEach(async (f) => {
    if (f.size > 8 * 1024 * 1024) { toast('"' + f.name + '" is over 8 MB \u2014 skipped.'); return; }
    if (f.type.startsWith('image/')) {
      const dataUrl = await resizeImage(f);
      if (dataUrl) insertImageAtCursor(dataUrl, f.name);
    } else {
      const r = new FileReader();
      r.onload = () => {
        journalAttachments.push({ name: f.name, type: f.type, size: f.size, data: r.result });
        renderAttachList();
      };
      r.readAsDataURL(f);
    }
  });
  e.target.value = '';
});

document.getElementById('j-date-btn').addEventListener('click', () => {
  openDtPicker({
    initial: document.getElementById('j-date-hid').value,
    mode: 'date',
    onPick: (val) => {
      journalDate = val;
      setFormDate(val);
      loadJournalForm();
    },
  });
});

document.getElementById('j-save').addEventListener('click', async () => {
  const ds = document.getElementById('j-date-hid').value || journalDate;
  const payload = {
    id: journalEditId || undefined,
    date: ds,
    title: document.getElementById('j-title').value.trim(),
    mood: journalMood,
    tags: pickedTags(document.getElementById('j-tags')),
    body: sanitizeHtml(document.getElementById('j-rich').innerHTML),
    attachments: journalAttachments,
  };
  try {
    await api('POST', '/api/app?r=daybook&view=journal', payload);
    toast('Entry saved.');
    showJournalList();
  } catch (e) {
    toast('Could not save the journal entry. Please try again.');
  }
});

async function loadLinks() {
  const p = new URLSearchParams();
  if (linkSearch) p.set('q', linkSearch);
  if (linkTag) p.set('tag', linkTag);
  const qs = p.toString();
  links = await api('GET', '/api/app?r=daybook&view=links' + (qs ? '&' + qs : ''));
  renderLinks();
  refreshLinkTagFilter();
}

function refreshLinkTagFilter() {
  if (linkTag && !linkTagItems().includes(linkTag)) linkTag = '';
  setDropdown('link-tag-filter', linkTag);
}

function renderLinks() {
  const box = document.getElementById('links-list');
  box.innerHTML = '';
  if (!links.length) {
    box.innerHTML = '<p class="empty-note">No links yet. Save one above, or triage captures from the Inbox.</p>';
    return;
  }
  links.forEach((l) => box.appendChild(linkRow(l)));
}

function linkRow(l) {
  const el = document.createElement('div');
  el.className = 'link-row';
  el.dataset.id = l.id;
  let host = l.url;
  try { host = new URL(l.url).host; } catch (e) {  }
  const tags = Array.isArray(l.tags) ? l.tags : [];
  const date = l.captured_at ? new Date(l.captured_at).toLocaleDateString() : '';
  const metaBits = [host, l.source, date].filter(Boolean).join(' \u00b7 ');
  el.innerHTML =
    `<div class="link-main"><a class="link-title" href="${escHtml(l.url)}" target="_blank" rel="noopener">${escHtml(l.title)}</a>` +
    `<div class="link-line2">${escHtml(metaBits)}</div>` +
    (l.notes ? `<div class="link-line3">${escHtml(l.notes)}</div>` : '') +
    `<div class="link-detail">` +
    (l.notes ? `<div class="link-notes-full">${escHtml(l.notes)}</div>` : '') +
    (tags.length ? `<div class="link-tags">${tagBubblesHtml(tags)}</div>` : '') +
    `</div></div>` +
    `<div class="link-actions"><button class="link-menu-btn" aria-label="Link actions" title="Actions">\u22ee</button></div>`;
  el.querySelector('.link-main').addEventListener('click', (e) => {
    if (e.target.closest('a')) return; // let the title link navigate
    if (!l.notes && !tags.length) return; // nothing more to show
    el.classList.toggle('expanded');
  });
  el.querySelector('.link-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLinkMenu(l.id, e.currentTarget);
  });

let linkMenuFor = null;
function closeLinkMenu() {
  const m = document.getElementById('link-menu');
  if (m) m.classList.add('hidden');
  linkMenuFor = null;
}
function toggleLinkMenu(id, btn) {
  const menu = document.getElementById('link-menu');
  if (linkMenuFor === id) { closeLinkMenu(); return; }
  linkMenuFor = id;
  menu.querySelectorAll('button').forEach((b) => {
    b.onclick = () => { closeLinkMenu(); linkAct(id, b.dataset.a); };
  });
  menu.classList.remove('hidden');
  const r = btn.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = Math.min(r.right - mw, window.innerWidth - mw - 8);
  let y = r.bottom + 6;
  if (y + mh > window.innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  menu.style.left = Math.max(8, x) + 'px';
  menu.style.top = y + 'px';
}
document.addEventListener('click', (e) => {
  const menu = document.getElementById('link-menu');
  if (menu && !menu.classList.contains('hidden') &&
      !e.target.closest('#link-menu') && !e.target.closest('.link-menu-btn')) closeLinkMenu();
  const rmenu = document.getElementById('rem-menu');
  if (rmenu && !rmenu.classList.contains('hidden') &&
      !e.target.closest('#rem-menu') && !e.target.closest('.link-menu-btn')) closeRemMenu();
  const dd = document.getElementById('dd-menu');
  if (dd && !dd.classList.contains('hidden') &&
      !e.target.closest('#dd-menu') && !e.target.closest('.dd-field')) closeDropdown();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const sn = document.getElementById('snooze-backdrop');
  if (sn && !sn.classList.contains('hidden')) { document.getElementById('snooze-cancel').click(); return; }
  const ddm = document.getElementById('dd-menu');
  if (ddm && !ddm.classList.contains('hidden')) { closeDropdown(); return; }
  const dt = document.getElementById('dt-backdrop');
  if (dt && !dt.classList.contains('hidden')) { closeDtPicker(); return; }
  closeLinkMenu(); closeRemMenu();
});
  return el;
}

async function linkAct(id, a) {
  const l = links.find((x) => x.id === id) || allLinks.find((x) => x.id === id);
  if (!l) return;
  try {
    if (a === 'open') { window.open(l.url, '_blank', 'noopener'); return; }
    if (a === 'copy') {
      try {
        await navigator.clipboard.writeText(l.url);
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = l.url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      return;
    }
    if (a === 'edit') { openLinkModal(l); return; }
    if (a === 'delete') {
      const yes = await confirmAction({
        title: 'Delete this link?',
        message: `"${l.title}" will be removed from the shelf.`,
        confirmLabel: 'Delete',
      });
      if (!yes) return;
      await api('DELETE', '/api/app?r=daybook&view=links&id=' + encodeURIComponent(id));
      await updateBadges();
      await loadLinks();
    }
  } catch (e) {
    toast('Could not update the link. Please try again.');
  }
}

function openLinkModal(l) {
  editingLinkId = l ? l.id : null;
  document.getElementById('link-title').textContent = l ? 'Edit link' : 'Add link';
  document.getElementById('l-url').value = l ? l.url : '';
  document.getElementById('l-title').value = l ? l.title : '';
  renderTagPicker(document.getElementById('l-tags'), l && Array.isArray(l.tags) ? l.tags : []);
  document.getElementById('l-source').value = l ? (l.source || '') : '';
  document.getElementById('l-notes').value = l ? (l.notes || '') : '';
  document.getElementById('link-backdrop').classList.remove('hidden');
  document.getElementById('l-url').focus();
}
function closeLinkModal() {
  document.getElementById('link-backdrop').classList.add('hidden');
  editingLinkId = null;
}
document.getElementById('add-link').addEventListener('click', () => openLinkModal(null));
document.getElementById('link-cancel').addEventListener('click', closeLinkModal);
document.getElementById('link-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'link-backdrop') closeLinkModal();
});
document.getElementById('link-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    url: document.getElementById('l-url').value.trim(),
    title: document.getElementById('l-title').value.trim(),
    tags: pickedTags(document.getElementById('l-tags')),
    source: document.getElementById('l-source').value.trim() || null,
    notes: document.getElementById('l-notes').value.trim(),
  };
  if (!data.url || !data.title) return;
  try {
    const res = editingLinkId
      ? await api('PATCH', '/api/app?r=daybook&view=links&id=' + encodeURIComponent(editingLinkId), data)
      : await api('POST', '/api/app?r=daybook&view=links', data);
    closeLinkModal();
    const notice = document.getElementById('already-saved');
    if (res && res.alreadySaved) {
      notice.textContent = 'Already saved — showing the existing link instead of creating a duplicate.';
      notice.classList.remove('hidden');
    } else {
      notice.classList.add('hidden');
    }
    await updateBadges();
    await loadLinks();
    if (res && res.alreadySaved) {
      const row = document.querySelector(`.link-row[data-id="${res.id}"]`);
      if (row) {
        row.classList.add('flash');
        row.scrollIntoView({ block: 'center' });
      }
    }
  } catch (err) {
    toast('Could not save the link. Please try again.');
  }
});
document.getElementById('link-search').addEventListener('input', (e) => {
  clearTimeout(linkSearchTimer);
  linkSearchTimer = setTimeout(() => {
    linkSearch = e.target.value.trim();
    loadLinks();
  }, 300);
});

async function loadInbox() {
  inboxItems = await api('GET', '/api/app?r=daybook&view=inbox&triaged=' + (inboxShowTriaged ? 'all' : 'false'));
  renderInbox();
}

function renderInbox() {
  renderTagFilter(document.getElementById('inbox-tag-filter'), inboxTagFilter, (v) => {
    inboxTagFilter = v;
    renderInbox();
  });
  const box = document.getElementById('inbox-list');
  document.getElementById('inbox-toggle-triaged').textContent =
    inboxShowTriaged ? 'Hide triaged' : 'Show triaged';
  box.innerHTML = '';
  const q = inboxSearch.trim().toLowerCase();
  const list = (inboxShowTriaged ? inboxItems : inboxItems.filter((i) => !i.triaged))
    .filter((i) => (!inboxTagFilter || (i.tags || []).includes(inboxTagFilter)))
    .filter((i) => !q || (i.text || '').toLowerCase().includes(q));
  if (!list.length) {
    box.innerHTML = `<p class="empty-note">${inboxShowTriaged ? 'Nothing here yet.' : 'Inbox zero. Capture something above.'}</p>`;
    return;
  }
  list.forEach((it) => box.appendChild(inboxRow(it)));
}

function inboxRow(it) {
  const el = document.createElement('div');
  el.className = 'inbox-row';
  const when = it.created_at ? new Date(it.created_at).toLocaleString() : '';
  const srcLabel = { manual: 'Manual', email: 'Email', chat: 'Chat' }[it.source] || it.source;
  el.innerHTML = `<p></p><div class="inbox-meta"><span class="src-pill">${escHtml(srcLabel)}</span>${escHtml(when)}</div>` + tagBubblesHtml(it.tags);
  el.querySelector('p').textContent = it.text;
  if (it.triaged) {
    const d = document.createElement('div');
    d.className = 'triage-dest';
    const destLabel = { task: 'Task', reminder: 'Reminder', journal: 'Journal', link: 'Link' }[it.triaged_to_type] || it.triaged_to_type;
    d.textContent = `Filed as ${destLabel} · `;
    const btn = document.createElement('button');
    btn.textContent = 'Open';
    btn.addEventListener('click', () =>
      switchView(it.triaged_to_type === 'task' ? 'tasks' : it.triaged_to_type));
    d.appendChild(btn);
    el.appendChild(d);
  } else {
    const bar = document.createElement('div');
    bar.className = 'triage-btns';
    [['task', 'To task'], ['reminder', 'To reminder'], ['journal', 'To journal'], ['link', 'To link']]
      .forEach(([to, label]) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.addEventListener('click', () => openTriage(it, to));
        bar.appendChild(b);
      });
    const del = document.createElement('button');
    del.textContent = 'Discard';
    del.className = 'discard';
    del.addEventListener('click', () => discardInbox(it.id));
    bar.appendChild(del);
    el.appendChild(bar);
  }
  return el;
}

document.getElementById('inbox-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('inbox-text');
  const text = input.value.trim();
  if (!text) return;
  try {
    await api('POST', '/api/app?r=daybook&view=inbox', { text, source: 'manual' });
    input.value = '';
    await updateBadges();
    await loadInbox();
  } catch (err) {
    toast('Could not capture. Please try again.');
  }
});
document.getElementById('inbox-toggle-triaged').addEventListener('click', async () => {
  inboxShowTriaged = !inboxShowTriaged;
  await loadInbox();
});
document.getElementById('inbox-search').addEventListener('input', (e) => {
  clearTimeout(inboxSearchTimer);
  inboxSearchTimer = setTimeout(() => {
    inboxSearch = e.target.value;
    renderInbox();
  }, 300);
});
async function discardInbox(id) {
  const yes = await confirmAction({
    title: 'Discard this capture?',
    message: 'It will be removed from the Inbox.',
    confirmLabel: 'Discard',
  });
  if (!yes) return;
  try {
    await api('DELETE', '/api/app?r=daybook&view=inbox&id=' + encodeURIComponent(id));
    await updateBadges();
    await loadInbox();
  } catch (e) {
    toast('Could not discard. Please try again.');
  }
}

function triageField(label, html) {
  return `<label>${label}${html}</label>`;
}

function openTriage(item, to) {
  triageItem = item;
  triageDest = to;
  const destName = { task: 'task', reminder: 'reminder', journal: 'journal', link: 'link' }[to];
  document.getElementById('triage-title').textContent = 'Triage to ' + destName;
  document.getElementById('triage-source').textContent = 'From: ' + item.text.slice(0, 120);
  const firstLine = item.text.split('\n')[0].slice(0, 160);
  const f = document.getElementById('triage-fields');
  if (to === 'task') {
    f.innerHTML =
      triageField('Title', `<input id="t-title" required maxlength="160" value="${escHtml(firstLine)}">`) +
      triageField('Details', `<textarea id="t-details" rows="3" maxlength="2000">${escHtml(item.text)}</textarea>`) +
      `<div class="row">` +
      triageField('Lane', `<input type="hidden" id="t-lane" value="next"><button type="button" class="dd-field" data-dd="t-lane">Next</button>`) +
      triageField('Tag', `<input type="hidden" id="t-tag" value="work"><button type="button" class="dd-field" data-dd="t-tag">Work</button>`) +
      `</div>`;
  } else if (to === 'reminder') {
    const nh = new Date();
    nh.setMinutes(0, 0, 0);
    nh.setHours(nh.getHours() + 1);
    f.innerHTML =
      triageField('Title', `<input id="t-title" required maxlength="160" value="${escHtml(firstLine)}">`) +
      triageField('Detail', `<input id="t-detail" maxlength="2000">`) +
      triageField('Remind at', `<input type="hidden" id="t-at" value="${toLocalInput(nh)}"><button type="button" class="dd-field" data-dtdate="t-at" data-dtmode="datetime">${fmtDtButtonLabel(toLocalInput(nh), { dataset: { dtmode: "datetime" } })}</button>`) +
      triageField('Recurrence <span class="hint">(optional)</span>', `<input type="hidden" id="t-rrule"><button type="button" class="dd-field fit" data-dd="t-rrule">None</button>`);
  } else if (to === 'journal') {
    f.innerHTML =
      triageField('Date', `<input type="hidden" id="t-date" value="${localDateStr(new Date())}"><button type="button" class="dd-field" data-dtdate="t-date">${fmtDtButtonLabel(localDateStr(new Date()), { dataset: {} })}</button>`) +
      triageField('Append to journal', `<textarea id="t-text" rows="4">${escHtml(item.text)}</textarea>`);
  } else {
    const u = extractUrl(item.text);
    f.innerHTML =
      triageField('URL', `<input id="t-url" required maxlength="2000" value="${escHtml(u)}">`) +
      triageField('Title', `<input id="t-title" required maxlength="200" value="${escHtml(u ? firstLine : '')}">`) +
      `<div class="row">` +
      triageField('Tags <span class="hint">(comma-separated)</span>', `<input id="t-tags" maxlength="500" placeholder="school, forms">`) +
      triageField('Source', `<input id="t-source" maxlength="300" value="Inbox">`) +
      `</div>` +
      triageField('Notes', `<textarea id="t-notes" rows="2" maxlength="2000"></textarea>`);
  }
  document.getElementById('triage-backdrop').classList.remove('hidden');
  const first = f.querySelector('input, textarea, select');
  if (first) first.focus();
}
function closeTriage() {
  document.getElementById('triage-backdrop').classList.add('hidden');
  triageItem = null;
}
document.getElementById('triage-cancel').addEventListener('click', closeTriage);
document.getElementById('triage-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'triage-backdrop') closeTriage();
});
document.getElementById('triage-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!triageItem) return;
  const v = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  let data;
  if (triageDest === 'task') {
    data = { title: v('t-title'), details: v('t-details'), lane: v('t-lane'), tag: v('t-tag'), priority: 'normal' };
    if (!data.title) return;
  } else if (triageDest === 'reminder') {
    const at = fromLocalInput(document.getElementById('t-at').value);
    if (!at) { toast('Pick a valid date and time.'); return; }
    data = { title: v('t-title'), detail: v('t-detail'), remind_at: at, recurrence: v('t-rrule') || null, tag: null };
    if (!data.title) return;
  } else if (triageDest === 'journal') {
    const d = v('t-date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast('Pick a valid date.'); return; }
    data = { date: d, text: v('t-text') };
  } else {
    data = { url: v('t-url'), title: v('t-title'), tags: v('t-tags'), source: v('t-source'), notes: v('t-notes') };
    if (!data.url) return;
    if (!data.title) data.title = data.url;
  }
  try {
    await api('POST', '/api/app?r=daybook&view=inbox&id=' + encodeURIComponent(triageItem.id), { to: triageDest, data });
    closeTriage();
    await updateBadges();
    await loadInbox();
  } catch (err) {
    toast('Could not file this capture. Please try again.');
  }
});
