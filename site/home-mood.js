// Home page mood check-in widget
// Adds quick mood faces to the landing page so Winny doesn't need to open the Mood view
(function() {
'use strict';

var MOODS = [
  { v: 1, e: "😢", label: "Terrible" },
  { v: 2, e: "😕", label: "Bad" },
  { v: 3, e: "😐", label: "Okay" },
  { v: 4, e: "🙂", label: "Good" },
  { v: 5, e: "😄", label: "Great" },
];

function moodIso(d) {
  var p = function(n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function init() {
  // Wait for home view to exist
  var home = document.getElementById('view-home');
  if (!home) { setTimeout(init, 500); return; }

  // Don't inject twice
  if (document.getElementById('home-mood-widget')) return;

  // Find the Quick add section to insert after
  var quickAdd = null;
  var sections = home.querySelectorAll('.home-section');
  for (var i = 0; i < sections.length; i++) {
    var title = sections[i].querySelector('.home-section-title');
    if (title && title.textContent.trim() === 'Quick add') {
      quickAdd = sections[i];
      break;
    }
  }

  var widget = document.createElement('div');
  widget.id = 'home-mood-widget';
  widget.className = 'home-section';
  widget.innerHTML =
    '<div class="home-section-title">How are you feeling?</div>' +
    '<div id="home-mood-row" class="home-mood-row"></div>' +
    '<div id="home-mood-status" class="home-mood-status"></div>';

  if (quickAdd && quickAdd.parentNode) {
    quickAdd.parentNode.insertBefore(widget, quickAdd);
  } else {
    home.querySelector('.home-wrap').appendChild(widget);
  }

  renderMoodRow();
}

function renderMoodRow() {
  var row = document.getElementById('home-mood-row');
  if (!row) return;
  row.innerHTML = '';
  MOODS.forEach(function(m) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'home-mood-face';
    btn.setAttribute('data-mood', m.v);
    btn.setAttribute('title', m.label);
    btn.setAttribute('aria-label', m.label);
    btn.textContent = m.e;
    btn.addEventListener('click', function() { saveMood(m.v); });
    row.appendChild(btn);
  });
  checkToday();
}

async function checkToday() {
  var status = document.getElementById('home-mood-status');
  if (!status || typeof api !== 'function') return;
  try {
    var today = moodIso(new Date());
    var cards = await api('GET', '/api/app?r=cards');
    var todays = (cards || []).filter(function(c) {
      if (!(c.tags || []).some(function(t) { return String(t).toLowerCase() === 'mood'; })) return false;
      try {
        var d = JSON.parse(c.details || '{}');
        return d.d === today;
      } catch (e) { return false; }
    });
    if (todays.length > 0) {
      // Highlight the most recent mood
      var latest = todays.sort(function(a, b) {
        try {
          var da = JSON.parse(a.details || '{}'), db = JSON.parse(b.details || '{}');
          return (db.ts || 0) - (da.ts || 0);
        } catch (e) { return 0; }
      })[0];
      try {
        var dm = JSON.parse(latest.details || '{}');
        var mood = MOODS.find(function(m) { return m.v === dm.m; });
        if (mood) {
          status.textContent = 'Today: ' + mood.e + ' ' + mood.label;
          // Highlight the selected face
          var btns = document.querySelectorAll('#home-mood-row .home-mood-face');
          btns.forEach(function(b) {
            b.classList.toggle('selected', parseInt(b.getAttribute('data-mood')) === dm.m);
          });
        }
      } catch (e) {}
    }
  } catch (e) {}
}

async function saveMood(v) {
  var status = document.getElementById('home-mood-status');
  var mood = MOODS.find(function(m) { return m.v === v; });
  if (!mood || typeof api !== 'function') return;

  // Visual feedback
  var btns = document.querySelectorAll('#home-mood-row .home-mood-face');
  btns.forEach(function(b) {
    b.classList.toggle('selected', parseInt(b.getAttribute('data-mood')) === v);
  });
  if (status) status.textContent = 'Saving...';

  var now = new Date();
  var dayLabel = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  try {
    await api('POST', '/api/app?r=cards', {
      title: 'Mood: ' + mood.label + ' · ' + dayLabel,
      tags: ['mood'],
      lane: 'done',
      details: JSON.stringify({ d: moodIso(now), m: v, note: '', ts: now.getTime() }),
    });
    if (status) status.textContent = 'Today: ' + mood.e + ' ' + mood.label + ' ✓';
    if (typeof toast === 'function') toast('Mood saved: ' + mood.label);
  } catch (e) {
    if (status) status.textContent = 'Could not save. Try again.';
    btns.forEach(function(b) { b.classList.remove('selected'); });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1000); });
} else {
  setTimeout(init, 1000);
}

})();
