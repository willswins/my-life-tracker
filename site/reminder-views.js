// Reminder Views: completed view, priority display, overdue styling.
// Loads after app.js; overrides renderReminders/remRow with enhanced versions.
(function() {
'use strict';

let showCompleted = false;

// --- Toggle button ---
const tglBtn = document.getElementById('rem-show-completed');
if (tglBtn) {
  tglBtn.addEventListener('click', () => {
    showCompleted = !showCompleted;
    tglBtn.textContent = showCompleted ? 'Hide' : 'Show';
    renderReminders();
  });
}

// --- Enhanced renderReminders (completed filter) ---
window.renderReminders = function() {
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
  const groups = showCompleted ? { Completed: [] } : { Overdue: [], Today: [], Tomorrow: [], 'This week': [], Later: [] };
  const q = reminderSearch.trim().toLowerCase();
  reminders
    .filter((r) => showCompleted ? r.status === 'completed' : (r.status === 'active' || r.status === 'snoozed'))
    .filter((r) => (!reminderTagFilter || (r.tags || []).includes(reminderTagFilter)))
    .filter((r) => !q || ((r.title || '') + ' ' + (r.detail || '')).toLowerCase().includes(q))
    .sort((a, b) => new Date(remEventAt(a)) - new Date(remEventAt(b)))
    .forEach((r) => {
      if (showCompleted) { groups.Completed.push(r); return; }
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
  if (!any) box.innerHTML = '<p class="empty-note">' + (showCompleted ? 'No completed reminders.' : 'No active reminders.') + '</p>';
};

// --- Enhanced remRow (priority, overdue, completed) ---
window.remRow = function(r) {
  const el = document.createElement('div');
  const sod = new Date();
  sod.setHours(0, 0, 0, 0);
  const isOd = new Date(remEventAt(r)) < sod && r.status !== 'completed';
  const pri = r.priority || 'none';
  el.className = 'rem-row' +
    (isOd ? ' is-overdue rem-overdue' : '') +
    (r.status === 'snoozed' ? ' is-snoozed' : '') +
    (r.status === 'completed' ? ' rem-completed-row' : '');
  const label = rruleLabel(r.recurrence);
  const at = new Date(remEventAt(r));
  const dateStr = at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeStr = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  const priDot = pri === 'none' ? '' : '<span class="pri-dot pri-' + pri + '" title="' + pri + '"></span>';
  let metaBits = [label, r.status === 'snoozed' ? 'Snoozed' : ''].filter(Boolean).join(' · ');
  if (r.status === 'completed' && r.completed_at) {
    metaBits += (metaBits ? ' · ' : '') + 'Done ' + new Date(r.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  el.innerHTML =
    '<div class="rem-when"><span class="d">' + escHtml(dateStr) + '</span><span class="t">' + escHtml(timeStr) + '</span></div>' +
    '<div class="rem-main"><div class="link-title">' + priDot + escHtml(r.title) + '</div>' +
    (metaBits ? '<div class="link-line2">' + escHtml(metaBits) + '</div>' : '') +
    (r.detail ? '<div class="rem-detail-full">' + escHtml(r.detail) + '</div>' : '') +
    tagBubblesHtml(r.tags) +
    '</div>' +
    '<div class="rem-actions"><button class="link-menu-btn" aria-label="Reminder actions" title="Actions">⋮</button></div>';
  el.querySelector('.link-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRemMenu(r.id, e.currentTarget);
  });
  return el;
};

// --- Patch remAct for restore ---
const origRemAct = window.remAct;
window.remAct = async function(id, a) {
  if (a === 'restore') {
    try {
      const rr = reminders.find((x) => x.id === id);
      if (rr) { rr.status = 'active'; rr.completed_at = null; renderReminders(); }
      await api('POST', '/api/app?r=daybook&view=reminders&id=' + encodeURIComponent(id), { action: 'restore' });
      await updateBadges();
      renderReminders();
    } catch (e) {
      toast('Could not restore the reminder. Please try again.');
      await updateBadges();
      renderReminders();
    }
    return;
  }
  return origRemAct(id, a);
};

// --- Priority dropdown wiring (DD_DEFS patch) ---
// The r-priority dropdown is defined in HTML; wire its options here.
if (typeof DD_DEFS !== 'undefined') {
  DD_DEFS['r-priority'] = () => [['none','None'],['low','Low'],['medium','Medium'],['high','High']];
}

// Populate + save priority via modal hooks
const origOpenModal = window.openReminderModal;
if (origOpenModal) {
  window.openReminderModal = function(r) {
    origOpenModal(r);
    try { setDropdown('r-priority', r && r.priority ? r.priority : 'none'); } catch (e) {}
  };
}

// --- Inject priority on reminder save (api wrapper) ---
const origApi = window.api;
window.api = async function(method, path, body) {
  try {
    if (body && typeof body === 'object' && path.indexOf('view=reminders') >= 0 && body.title !== undefined) {
      const priEl = document.getElementById('r-priority');
      if (priEl) body.priority = priEl.value || 'none';
    }
  } catch (e) {}
  return origApi(method, path, body);
};

})();
