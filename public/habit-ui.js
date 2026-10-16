// Habit Tracker — UI Layer
// View registration, rendering, and interactions.
// IIFE wrapper to avoid global collisions.
(function() {
'use strict';

// ---------------------------------------------------------------------------
// View registration
// ---------------------------------------------------------------------------

function initRegistrations() {
  if (typeof VIEWS !== 'undefined' && VIEWS.indexOf('habits') === -1) {
    VIEWS.push('habits');
  }
  if (typeof VIEW_IDS !== 'undefined') VIEW_IDS['habits'] = 'view-habits';
  if (typeof VIEW_TITLES !== 'undefined') VIEW_TITLES['habits'] = 'Habits';

  // Hook menu button
  const menuBtn = document.querySelector('[data-view="habits"]');
  if (menuBtn && !menuBtn._habitHooked) {
    menuBtn._habitHooked = true;
    menuBtn.addEventListener('click', () => {
      setTimeout(() => { renderHabits(); }, 50);
    });
  }

  // Handle hash navigation
  window.addEventListener('hashchange', () => {
    if (location.hash === '#/habits') {
      setTimeout(() => { renderHabits(); }, 50);
    }
  });

  if (location.hash === '#/habits') {
    setTimeout(() => { renderHabits(); }, 500);
  }

  // Bind add button
  const addBtn = document.getElementById('habit-add');
  if (addBtn && !addBtn._habitBound) {
    addBtn._habitBound = true;
    addBtn.addEventListener('click', () => openHabitModal(null));
  }

  // Bind modal
  const cancelBtn = document.getElementById('habit-cancel');
  if (cancelBtn && !cancelBtn._habitBound) {
    cancelBtn._habitBound = true;
    cancelBtn.addEventListener('click', closeHabitModal);
  }
  const backdrop = document.getElementById('habit-backdrop');
  if (backdrop && !backdrop._habitBound) {
    backdrop._habitBound = true;
    backdrop.addEventListener('click', (e) => {
      if (e.target.id === 'habit-backdrop') closeHabitModal();
    });
  }
  const form = document.getElementById('habit-form');
  if (form && !form._habitBound) {
    form._habitBound = true;
    form.addEventListener('submit', saveHabit);
  }

  // Bind delete confirmation modal
  const delCancel = document.getElementById('habit-delete-cancel');
  if (delCancel && !delCancel._habitBound) {
    delCancel._habitBound = true;
    delCancel.addEventListener('click', cancelDeleteHabit);
  }
  const delConfirm = document.getElementById('habit-delete-confirm');
  if (delConfirm && !delConfirm._habitBound) {
    delConfirm._habitBound = true;
    delConfirm.addEventListener('click', confirmDeleteHabit);
  }
  const delBackdrop = document.getElementById('habit-delete-backdrop');
  if (delBackdrop && !delBackdrop._habitBound) {
    delBackdrop._habitBound = true;
    delBackdrop.addEventListener('click', (e) => {
      if (e.target.id === 'habit-delete-backdrop') cancelDeleteHabit();
    });
  }
}

function tryInit() {
  if (typeof VIEWS === 'undefined' || typeof window.Habits === 'undefined') {
    setTimeout(tryInit, 200);
    return;
  }
  initRegistrations();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

let habitsCache = [];
let editingHabitId = null;
let pendingDeleteId = null;

async function renderHabits() {
  const listEl = document.getElementById('habit-list');
  const emptyEl = document.getElementById('habit-empty');
  if (!listEl) return;

  try {
    habitsCache = await window.Habits.list();
  } catch (e) {
    listEl.innerHTML = '<p class="empty-note">Could not load habits. Please try again.</p>';
    return;
  }

  if (habitsCache.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }
  if (emptyEl) emptyEl.classList.add('hidden');

  listEl.innerHTML = '';
  habitsCache.forEach(habit => {
    listEl.appendChild(createHabitCard(habit));
  });
}

function createHabitCard(habit) {
  const streak = window.Habits._calculateStreak(habit.checkins, habit.frequency);
  const rate = window.Habits._completionRate(habit.checkins, 30);
  const today = window.Habits._todayStr();
  const isDone = window.Habits.isCheckedIn(habit, today);

  const card = document.createElement('div');
  card.className = 'habit-card';
  card.style.borderLeftColor = habit.color;

  card.innerHTML = `
    <div class="habit-header">
      <span class="habit-icon">${escapeHtml(habit.icon)}</span>
      <div class="habit-title-wrap">
        <h3 class="habit-name">${escapeHtml(habit.name)}</h3>
        <span class="habit-freq">${habit.frequency}</span>
      </div>
      <button class="habit-check ${isDone ? 'done' : ''}" data-habit-id="${habit.id}" aria-label="${isDone ? `Mark ${escapeHtml(habit.name)} as not done today` : `Check in ${escapeHtml(habit.name)} for today`}" aria-pressed="${isDone}">
        ${isDone ? '✓' : '○'}
      </button>
    </div>
    <div class="habit-stats">
      <div class="habit-stat">
        <span class="habit-stat-val">${streak.current}</span>
        <span class="habit-stat-label">day streak</span>
      </div>
      <div class="habit-stat">
        <span class="habit-stat-val">${streak.longest}</span>
        <span class="habit-stat-label">best</span>
      </div>
      <div class="habit-stat">
        <span class="habit-stat-val">${rate}%</span>
        <span class="habit-stat-label">30-day</span>
      </div>
    </div>
    <div class="habit-grid" data-habit-id="${habit.id}"></div>
    <div class="habit-actions">
      <button class="habit-edit" data-habit-id="${habit.id}">Edit</button>
      <button class="habit-delete danger" data-habit-id="${habit.id}">Delete</button>
    </div>
  `;

  // Render streak grid
  const gridEl = card.querySelector('.habit-grid');
  renderStreakGrid(gridEl, habit);

  // Bind check-in button (look up fresh habit from cache at click time
  // to avoid stale closures if the list re-rendered)
  const checkBtn = card.querySelector('.habit-check');
  const habitId = habit.id;
  checkBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await toggleCheckIn(habitId);
  });

  // Bind edit/delete (fresh lookup by id at click time)
  card.querySelector('.habit-edit').addEventListener('click', () => {
    const fresh = habitsCache.find(h => String(h.id) === String(habitId));
    openHabitModal(fresh || habit);
  });
  card.querySelector('.habit-delete').addEventListener('click', () => {
    const fresh = habitsCache.find(h => String(h.id) === String(habitId));
    if (!fresh) {
      // Habit no longer exists (deleted elsewhere) — refresh the list
      renderHabits();
      return;
    }
    deleteHabit(fresh);
  });

  return card;
}

function renderStreakGrid(container, habit) {
  if (!container) return;
  
  const weeks = 12;
  const today = window.Habits._parseDate(window.Habits._todayStr());
  // Anchor the grid so the LAST column is the current week (Sun-Sat),
  // ensuring today is always visible. Start 11 weeks before this Sunday.
  const thisSunday = new Date(today);
  thisSunday.setDate(thisSunday.getDate() - thisSunday.getDay());
  const start = new Date(thisSunday);
  start.setDate(start.getDate() - ((weeks - 1) * 7));

  // Accessibility: summarize the grid for screen readers
  const streak = window.Habits._calculateStreak(habit.checkins, habit.frequency);
  const totalChecked = Object.keys(habit.checkins).filter(d => habit.checkins[d]).length;
  container.setAttribute('role', 'img');
  container.setAttribute('aria-label',
    `${habit.name}: ${totalChecked} days completed in the last ${weeks} weeks. ` +
    `Current streak ${streak.current} days, longest streak ${streak.longest} days.`);

  let html = '';
  for (let w = 0; w < weeks; w++) {
    html += '<div class="habit-week" role="presentation">';
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(date.getDate() + (w * 7) + d);
      const ds = window.Habits._formatDate(date);
      const isFuture = date > today;
      const checked = habit.checkins[ds] === true;
      
      let cls = 'habit-day';
      if (isFuture) cls += ' future';
      else if (checked) cls += ' done';

      // Per-day accessible description
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const status = isFuture ? 'upcoming' : (checked ? 'completed' : 'missed');
      const ariaLabel = `${dayName}: ${status}`;
      
      const style = checked ? `background:${habit.color};` : '';
      html += `<div class="${cls}" style="${style}" title="${ds}" role="img" aria-label="${ariaLabel}"></div>`;
    }
    html += '</div>';
  }
  
  container.innerHTML = html;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

async function toggleCheckIn(habitId) {
  const habit = habitsCache.find(h => String(h.id) === String(habitId));
  if (!habit) return;

  const today = window.Habits._todayStr();
  const isDone = window.Habits.isCheckedIn(habit, today);

  try {
    if (isDone) {
      await window.Habits.checkOut(habitId, today);
    } else {
      await window.Habits.checkIn(habitId, today);
    }
    await renderHabits();
  } catch (e) {
    if (typeof toast === 'function') toast('Could not update. Please try again.');
  }
}

function openHabitModal(habit) {
  editingHabitId = habit ? habit.id : null;
  document.getElementById('habit-modal-title').textContent = habit ? 'Edit Habit' : 'New Habit';
  document.getElementById('h-name').value = habit ? habit.name : '';
  document.getElementById('h-frequency').value = habit ? habit.frequency : 'daily';
  document.getElementById('h-icon').value = habit ? habit.icon : '✅';
  document.getElementById('h-color').value = habit ? habit.color : '#4CAF50';
  
  document.getElementById('habit-backdrop').classList.remove('hidden');
}

function closeHabitModal() {
  document.getElementById('habit-backdrop').classList.add('hidden');
  editingHabitId = null;
}

async function saveHabit(e) {
  e.preventDefault();
  
  const name = document.getElementById('h-name').value.trim();
  if (!name) return;

  const data = {
    name: name,
    frequency: document.getElementById('h-frequency').value || 'daily',
    icon: document.getElementById('h-icon').value.trim() || '✅',
    color: document.getElementById('h-color').value || '#4CAF50',
  };

  try {
    if (editingHabitId) {
      await window.Habits.update(editingHabitId, data);
    } else {
      await window.Habits.create(data);
    }
    closeHabitModal();
    await renderHabits();
  } catch (e) {
    if (typeof toast === 'function') toast('Could not save. Please try again.');
  }
}

async function deleteHabit(habit) {
  // Use custom modal instead of native confirm() for UX consistency and testability.
  // Defensive: verify modal elements exist (logs to console if the DOM is unexpected).
  const backdrop = document.getElementById('habit-delete-backdrop');
  const msg = document.getElementById('habit-delete-msg');
  if (!backdrop || !msg) {
    console.error('[Habits] Delete modal elements missing from DOM');
    if (typeof toast === 'function') toast('Could not open delete dialog. Please reload.');
    return;
  }
  pendingDeleteId = habit.id;
  msg.textContent =
    `Delete "${habit.name}" and all its history? This cannot be undone.`;
  backdrop.classList.remove('hidden');
}

async function confirmDeleteHabit() {
  const id = pendingDeleteId;
  pendingDeleteId = null;
  document.getElementById('habit-delete-backdrop').classList.add('hidden');
  if (!id) return;

  try {
    await window.Habits.delete(id);
    await renderHabits();
  } catch (e) {
    if (typeof toast === 'function') toast('Could not delete. Please try again.');
  }
}

function cancelDeleteHabit() {
  pendingDeleteId = null;
  document.getElementById('habit-delete-backdrop').classList.add('hidden');
}

// Expose for testing
window.HabitUI = {
  renderHabits,
  calculateStreak: (c, f) => window.Habits._calculateStreak(c, f),
};

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', tryInit);
} else {
  tryInit();
}

})();
