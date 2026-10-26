// Habit Tracker — Data Layer & Streak Engine
// Uses DayBook Cards API with 'habit' tag. No new endpoints.
// IIFE wrapper to avoid global namespace collisions (cf. MOODS incident 2026-10-06).
(function() {
'use strict';

// ---------------------------------------------------------------------------
// Date utilities (timezone-aware, America/New_York)
// ---------------------------------------------------------------------------

/**
 * Returns today's date as YYYY-MM-DD in the user's timezone.
 * Uses the browser's local timezone which should be America/New_York for Winny.
 */
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns yesterday's date as YYYY-MM-DD.
 */
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse YYYY-MM-DD to a Date at local midnight.
 */
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Format a Date to YYYY-MM-DD.
 */
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns the number of days between two YYYY-MM-DD strings.
 */
function daysBetween(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

/**
 * Check if two dates are consecutive for the given frequency.
 */
function isConsecutive(prevDateStr, currDateStr, frequency) {
  if (frequency === 'weekly') {
    // For weekly, check if they're in consecutive ISO weeks
    const prev = parseDate(prevDateStr);
    const curr = parseDate(currDateStr);
    const daysDiff = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
    // Consecutive weeks = 7 days apart (allowing same-week check-ins to not break streak)
    return daysDiff >= 1 && daysDiff <= 7;
  }
  // Daily: exactly 1 day apart
  return daysBetween(prevDateStr, currDateStr) === 1;
}

// ---------------------------------------------------------------------------
// Streak calculation engine
// ---------------------------------------------------------------------------

/**
 * Calculate current and longest streaks from check-in history.
 * @param {Object} checkins - Map of YYYY-MM-DD -> boolean
 * @param {string} frequency - 'daily' or 'weekly'
 * @returns {{current: number, longest: number}}
 */
function calculateStreak(checkins, frequency) {
  const dates = Object.keys(checkins)
    .filter(d => checkins[d] === true)
    .sort();

  if (dates.length === 0) {
    return { current: 0, longest: 0 };
  }

  let longest = 1;
  let temp = 1;

  for (let i = 1; i < dates.length; i++) {
    if (isConsecutive(dates[i - 1], dates[i], frequency)) {
      temp++;
    } else {
      longest = Math.max(longest, temp);
      temp = 1;
    }
  }
  longest = Math.max(longest, temp);

  // Current streak: only counts if the last check-in was today or yesterday
  // (for daily) or this week/last week (for weekly)
  const lastDate = dates[dates.length - 1];
  const today = todayStr();
  const yesterday = yesterdayStr();

  let current = 0;
  if (frequency === 'daily') {
    if (lastDate === today || lastDate === yesterday) {
      // Walk back to count the current streak
      current = 1;
      for (let i = dates.length - 1; i > 0; i--) {
        if (isConsecutive(dates[i - 1], dates[i], 'daily')) {
          current++;
        } else {
          break;
        }
      }
      // If last check-in was yesterday (not today), streak is still alive
      // but we don't want to penalize for today not being checked in yet
    }
  } else {
    // Weekly: if last check-in was within the last 7 days, streak is alive
    const daysSinceLast = daysBetween(lastDate, today);
    if (daysSinceLast <= 7) {
      current = temp; // temp holds the last run length
    }
  }

  return { current, longest };
}

/**
 * Calculate completion rate over the last N days.
 * @param {Object} checkins - Map of YYYY-MM-DD -> boolean
 * @param {number} days - Lookback period
 * @returns {number} Percentage 0-100
 */
function completionRate(checkins, days) {
  const today = parseDate(todayStr());
  let completed = 0;
  let total = 0;

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = formatDate(d);
    total++;
    if (checkins[ds] === true) completed++;
  }

  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

// ---------------------------------------------------------------------------
// Habit data model
// ---------------------------------------------------------------------------

/**
 * Parse a card into a Habit object.
 */
function cardToHabit(card) {
  let data = {};
  try {
    data = JSON.parse(card.details || '{}');
  } catch (e) {
    data = {};
  }

  return {
    id: card.id,
    name: card.title || 'Untitled Habit',
    frequency: data.frequency || 'daily',
    target: data.target || 1,
    color: data.color || '#4CAF50',
    icon: data.icon || '✅',
    checkins: data.checkins || {},
    // 21-day challenge state: {start: 'YYYY-MM-DD', days: 21} or null.
    // Stored on the card so checkIn/checkOut/update round-trips keep it.
    challenge: data.challenge || null,
    createdDate: data.created_date || card.created_at?.split('T')[0] || todayStr(),
    _card: card,
  };
}

/**
 * Serialize a Habit object to card details JSON.
 */
function habitToDetails(habit) {
  return JSON.stringify({
    frequency: habit.frequency,
    target: habit.target,
    color: habit.color,
    icon: habit.icon,
    checkins: habit.checkins,
    challenge: habit.challenge || null,
    created_date: habit.createdDate,
  });
}

// ---------------------------------------------------------------------------
// API layer
// ---------------------------------------------------------------------------

async function apiCall(method, path, body) {
  // Use the global api() function from app.js if available
  if (typeof api === 'function') {
    return api(method, path, body);
  }
  throw new Error('API not available');
}

const Habits = {
  /**
   * List all habits.
   * @returns {Promise<Array>} Array of Habit objects
   */
  async list() {
    const cards = await apiCall('GET', '/api/app?r=cards');
    return cards
      .filter(c => (c.tags || []).includes('habit') && !c.deleted_at)
      .map(cardToHabit);
  },

  /**
   * Create a new habit.
   */
  async create({ name, frequency, target, color, icon }) {
    const details = JSON.stringify({
      frequency: frequency || 'daily',
      target: target || 1,
      color: color || '#4CAF50',
      icon: icon || '✅',
      checkins: {},
      created_date: todayStr(),
    });

    const card = await apiCall('POST', '/api/app?r=cards', {
      title: name,
      tags: ['habit'],
      details: details,
    });

    return cardToHabit(card);
  },

  /**
   * Update a habit's metadata.
   */
  async update(id, updates) {
    const cards = await apiCall('GET', '/api/app?r=cards');
    const card = cards.find(c => String(c.id) === String(id));
    if (!card) throw new Error('Habit not found');

    const habit = cardToHabit(card);
    Object.assign(habit, updates);

    const updated = await apiCall('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(id), {
      title: habit.name,
      details: habitToDetails(habit),
    });

    return cardToHabit(updated);
  },

  /**
   * Delete a habit (soft delete via cards API).
   */
  async delete(id) {
    await apiCall('DELETE', '/api/app?r=cards&id=' + encodeURIComponent(id));
  },

  /**
   * Check in for a habit on a specific date (defaults to today).
   */
  async checkIn(id, dateStr) {
    const ds = dateStr || todayStr();
    const cards = await apiCall('GET', '/api/app?r=cards');
    const card = cards.find(c => String(c.id) === String(id));
    if (!card) throw new Error('Habit not found');

    const habit = cardToHabit(card);
    habit.checkins[ds] = true;

    const updated = await apiCall('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(id), {
      details: habitToDetails(habit),
    });

    return cardToHabit(updated);
  },

  /**
   * Remove a check-in (undo).
   */
  async checkOut(id, dateStr) {
    const ds = dateStr || todayStr();
    const cards = await apiCall('GET', '/api/app?r=cards');
    const card = cards.find(c => String(c.id) === String(id));
    if (!card) throw new Error('Habit not found');

    const habit = cardToHabit(card);
    delete habit.checkins[ds];

    const updated = await apiCall('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(id), {
      details: habitToDetails(habit),
    });

    return cardToHabit(updated);
  },

  /**
   * Start a 21-day challenge on a habit, beginning today.
   * Any previous challenge is replaced; check-in history is kept.
   */
  async startChallenge(id) {
    return this.update(id, { challenge: { start: todayStr(), days: 21 } });
  },

  /**
   * End (clear) the current challenge on a habit.
   */
  async endChallenge(id) {
    return this.update(id, { challenge: null });
  },

  /**
   * Check if a habit is checked in for a given date.
   */
  isCheckedIn(habit, dateStr) {
    return habit.checkins[dateStr || todayStr()] === true;
  },

  // Expose utilities for testing
  _calculateStreak: calculateStreak,
  _completionRate: completionRate,
  _todayStr: todayStr,
  _parseDate: parseDate,
  _formatDate: formatDate,
  _daysBetween: daysBetween,
};

// Expose globally
window.Habits = Habits;

})();
