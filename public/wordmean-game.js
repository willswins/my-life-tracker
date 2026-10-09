// Word Meaning game — registrations and logic
(function() {
'use strict';

function initRegistrations() {
  // Register the view
  if (typeof VIEWS !== 'undefined' && VIEWS.indexOf('wordmean') === -1) {
    VIEWS.push('wordmean');
  }
  if (typeof VIEW_IDS !== 'undefined') VIEW_IDS['wordmean'] = 'view-wordmean';
  if (typeof VIEW_TITLES !== 'undefined') VIEW_TITLES['wordmean'] = 'Word Meaning';
  
  // Add timer toggle button
  const diffRow = document.querySelector('#view-wordmean .spell-difficulty');
  if (diffRow && !document.getElementById('wm-timer-toggle')) {
    const tgl = document.createElement('button');
    tgl.id = 'wm-timer-toggle';
    tgl.textContent = '\u23f1 Timer: On';
    tgl.addEventListener('click', () => {
      wmTimed = !wmTimed;
      tgl.textContent = wmTimed ? '\u23f1 Timer: On' : '\u23f1 Timer: Off';
      tgl.classList.toggle('active', !wmTimed);
      initWordMean();
    });
    diffRow.appendChild(tgl);
  }
  // Hook the menu button to init our game after view switches
  const menuBtn = document.querySelector('[data-view="wordmean"]');
  if (menuBtn && !menuBtn._wmHooked) {
    menuBtn._wmHooked = true;
    menuBtn.addEventListener('click', () => {
      // Let the default handler run first, then init
      setTimeout(() => { initWordMean(); }, 50);
    });
  }
  
  // Also handle direct hash navigation
  window.addEventListener('hashchange', () => {
    if (location.hash === '#/wordmean') {
      setTimeout(() => { initWordMean(); }, 50);
    }
  });
  
  // If we're already on the wordmean view (page load with hash), init
  if (location.hash === '#/wordmean') {
    setTimeout(() => { initWordMean(); }, 500);
  }
}

// Wait for app.js to load, then register
function tryInit() {
  if (typeof VIEWS === 'undefined') {
    setTimeout(tryInit, 200);
    return;
  }
  initRegistrations();
}

const WORDMEAN_TIME = 60;
function wordMeanBank() { return (typeof WORD_MEANING_QS !== 'undefined') ? WORD_MEANING_QS : {simple: [], medium: [], complex: []}; }
let wmDiff = 'medium', wmScore = 0, wmStreak = 0, wmBest = 0;
let wmLeft = WORDMEAN_TIME, wmTimer = null, wmQs = [], wmQi = 0, wmLock = false, wmPlaying = false;
let wmTimed = true;
let wmHistory = [];
function wmSet(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function wmShuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function wmStats() {
  wmSet('wm-score', String(wmScore));
  wmSet('wm-streak', String(wmStreak));
  wmSet('wm-time', wmTimed ? wmLeft + 's' : '\u221e');
  wmSet('wm-best', String(wmBest));
  const fill = document.getElementById('wm-timer-fill');
  if (fill) fill.style.width = Math.max(0, (wmLeft / WORDMEAN_TIME) * 100) + '%';
}
function wmRenderQ() {
  const q = wmQs[wmQi];
  if (!q) { wordMeanEnd(); return; }
  wmSet('wm-word', q[0]);
  wmSet('wm-pos', q[1]);
  wmSet('wm-sentence', '\u201c' + q[2] + '\u201d');
  // Shuffle options so the correct answer isn't always first
  const opts = q[3].map((text, idx) => ({ text: text, isCorrect: idx === q[4] }));
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  // Store the shuffled correct index for answer checking
  q._shuffledCorrect = opts.findIndex(o => o.isCorrect);
  const box = document.getElementById('wm-options');
  if (box) {
    box.innerHTML = '';
    opts.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'game-opt';
      b.textContent = opt.text;
      b.addEventListener('click', () => wmAnswer(i, b));
      box.appendChild(b);
    });
  }
  const fb = document.getElementById('wm-feedback');
  if (fb) { fb.textContent = ''; fb.className = 'game-feedback'; }
}
function wmAnswer(oi, btn) {
  if (wmLock || !wmPlaying) return;
  wmLock = true;
  const q = wmQs[wmQi];
  const correct = (typeof q._shuffledCorrect === 'number') ? q._shuffledCorrect : q[4];
  const box = document.getElementById('wm-options');
  const fb = document.getElementById('wm-feedback');
  const isRight = oi === correct;
  const pickedText = btn ? btn.textContent : '';
  wmHistory.push({ word: q[0], pos: q[1], sentence: q[2], options: q[3], correct: q[4], pickedText: pickedText, ok: isRight, explanation: q[6] });
  if (isRight) {
    const pts = 10 + Math.min(wmStreak, 5) * 2;
    wmScore += pts;
    wmStreak++;
    if (btn) btn.classList.add('correct');
    if (fb) { fb.textContent = '+' + pts; fb.className = 'game-feedback good'; }
  } else {
    wmStreak = 0;
    if (btn) btn.classList.add('wrong');
    if (box) {
      const kids = box.children;
      if (kids[correct]) kids[correct].classList.add('correct');
    }
    if (fb) { fb.textContent = 'Answer: ' + q[3][q[4]]; fb.className = 'game-feedback bad'; }
  }
  wmStats();
  setTimeout(() => {
    wmQi++;
    wmLock = false;
    if (wmPlaying) wmRenderQ();
  }, 900);
}
function wmStart() {
  wmScore = 0; wmStreak = 0; wmLeft = WORDMEAN_TIME;
  wmQi = 0; wmLock = false; wmPlaying = true; wmHistory = [];
  wmQs = wmShuffle(wordMeanBank()[wmDiff].slice());
  const tb = document.getElementById('wm-timer');
  if (tb) tb.classList.remove('hidden');
  const sb = document.getElementById('wm-start');
  if (sb) sb.classList.add('hidden');
  const rb = document.getElementById('wm-review-btn');
  if (rb) rb.classList.add('hidden');
  const rv = document.getElementById('wm-review');
  if (rv) { rv.classList.add('hidden'); rv.innerHTML = ''; }
  const eb = document.getElementById('wm-end');
  if (eb) eb.classList.add('hidden');
  wmStats();
  wmRenderQ();
  clearInterval(wmTimer);
  if (wmTimed) {
    wmTimer = setInterval(() => {
      wmLeft--;
      wmStats();
      if (wmLeft <= 0) wordMeanEnd();
    }, 1000);
  }
  // Show End button in untimed mode
  let endBtn = document.getElementById('wm-end');
  if (!wmTimed) {
    if (!endBtn && sb && sb.parentNode) {
      endBtn = document.createElement('button');
      endBtn.id = 'wm-end';
      endBtn.className = 'game-next';
      endBtn.style.display = 'block';
      endBtn.style.margin = '0.75rem auto 0';
      endBtn.textContent = 'End Game';
      endBtn.addEventListener('click', () => wordMeanEnd());
      sb.parentNode.insertBefore(endBtn, sb.nextSibling);
    }
    if (endBtn) endBtn.classList.remove('hidden');
  } else if (endBtn) {
    endBtn.classList.add('hidden');
  }
}
function wordMeanEnd() {
  wmPlaying = false;
  clearInterval(wmTimer);
  if (wmScore > wmBest) {
    wmBest = wmScore;
    try { localStorage.setItem('wordmean_best', String(wmBest)); } catch (e) {}
  }
  wmSet('wm-word', "Time's up!");
  wmSet('wm-pos', '');
  wmSet('wm-sentence', '');
  const box = document.getElementById('wm-options');
  if (box) box.innerHTML = '';
  const fb = document.getElementById('wm-feedback');
  if (fb) { fb.textContent = 'Score: ' + wmScore + '  \u2022  Best: ' + wmBest; fb.className = 'game-feedback'; }
  const sb = document.getElementById('wm-start');
  if (sb) { sb.textContent = 'Play Again'; sb.classList.remove('hidden'); }
  // Review button
  let rb = document.getElementById('wm-review-btn');
  if (!rb && sb && sb.parentNode) {
    rb = document.createElement('button');
    rb.id = 'wm-review-btn';
    rb.className = 'game-next';
    rb.style.display = 'block';
    rb.style.margin = '0.75rem auto 0';
    rb.textContent = 'Review Words';
    rb.addEventListener('click', wmToggleReview);
    sb.parentNode.insertBefore(rb, sb.nextSibling);
  }
  if (rb) rb.classList.remove('hidden');
  wmStats();
}
function wmToggleReview() {
  const rv = document.getElementById('wm-review');
  const rb = document.getElementById('wm-review-btn');
  if (!rv || !rb) return;
  if (rv.classList.contains('hidden')) {
    let h = '<h4>Review Words</h4>';
    wmHistory.forEach((it) => {
      const mark = it.ok ? '\u2713' : '\u2717';
      const cls = it.ok ? 'good' : 'bad';
      h += '<div class="review-item"><span class="review-mark ' + cls + '">' + mark + '</span> ';
      h += '<strong>' + it.word + '</strong> <em>(' + it.pos + ')</em><br>';
      h += '<span class="review-sent">\u201c' + it.sentence + '\u201d</span><br>';
      h += 'Meaning: ' + it.options[it.correct];
      if (!it.ok) h += '<br>You picked: \u201c' + it.pickedText + '\u201d';
      if (it.explanation) h += '<br><span class="review-exp">' + it.explanation + '</span>';
      h += '</div>';
    });
    if (!wmHistory.length) h += '<p class="empty-note">No words attempted.</p>';
    rv.innerHTML = h;
    rv.classList.remove('hidden');
    rb.textContent = 'Hide Review';
  } else {
    rv.classList.add('hidden');
    rb.textContent = 'Review Words';
  }
}
function initWordMean() {
  try { wmBest = parseInt(localStorage.getItem('wordmean_best') || '0', 10) || 0; } catch (e) { wmBest = 0; }
  wmPlaying = false;
  clearInterval(wmTimer);
  wmSet('wm-best', String(wmBest));
  wmSet('wm-score', '0');
  wmSet('wm-streak', '0');
  wmSet('wm-time', WORDMEAN_TIME + 's');
  wmSet('wm-word', '…');
  wmSet('wm-pos', '');
  wmSet('wm-sentence', '');
  const box = document.getElementById('wm-options');
  if (box) box.innerHTML = '';
  const tb = document.getElementById('wm-timer');
  if (tb) tb.classList.add('hidden');
  const sb = document.getElementById('wm-start');
  if (sb) { sb.textContent = 'Start'; sb.classList.remove('hidden'); }
  const rb = document.getElementById('wm-review-btn');
  if (rb) rb.classList.add('hidden');
  const rv = document.getElementById('wm-review');
  if (rv) { rv.classList.add('hidden'); rv.innerHTML = ''; }
  const eb = document.getElementById('wm-end');
  if (eb) eb.classList.add('hidden');
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el && !el._wmBound) { el._wmBound = true; el.addEventListener('click', fn); }
  };
  bind('wm-start', wmStart);
}
document.querySelectorAll('[data-wm-diff]').forEach((b) => {
  if (b._wmBound) return;
  b._wmBound = true;
  b.addEventListener('click', () => {
    wmDiff = b.getAttribute('data-wm-diff') || 'medium';
    document.querySelectorAll('[data-wm-diff]').forEach((x) => x.classList.toggle('active', x === b));
    initWordMean();
  });
});

// Expose globally
window.initWordMean = initWordMean;

// Start registration
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryInit);
else tryInit();
})();
