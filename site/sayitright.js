// Say It Right — spoken grammar game
// Based on SLA research: pushed output, noticing, sentence frames, spaced retrieval
// Targets Indian English error patterns + user's real corrections
(function() {
'use strict';

// Register view
function registerView() {
  if (typeof VIEWS === 'undefined') { setTimeout(registerView, 200); return; }
  if (VIEWS.indexOf('sayitright') === -1) VIEWS.push('sayitright');
  if (typeof VIEW_IDS !== 'undefined') VIEW_IDS.sayitright = 'view-sayitright';
  if (typeof VIEW_TITLES !== 'undefined') VIEW_TITLES.sayitright = 'Say It Right';

  if (!document.getElementById('view-sayitright')) {
    const main = document.createElement('main');
    main.id = 'view-sayitright';
    main.className = 'view hidden';
    const grammar = document.getElementById('view-grammar');
    if (grammar && grammar.parentNode) grammar.parentNode.insertBefore(main, grammar.nextSibling);
    else document.body.appendChild(main);
  }

  const menuBtn = document.querySelector('[data-view="grammar"]');
  if (menuBtn && !document.querySelector('[data-view="sayitright"]')) {
    const btn = document.createElement('button');
    btn.setAttribute('data-view', 'sayitright');
    btn.className = 'view-link sub';
    btn.textContent = 'Say It Right';
    menuBtn.parentNode.insertBefore(btn, menuBtn.nextSibling);
    btn.addEventListener('click', () => {
      if (typeof switchView === 'function') switchView('sayitright');
    });
  }

  const homeBtn = document.querySelector('[data-go="grammar"]');
  if (homeBtn && !document.querySelector('[data-go="sayitright"]')) {
    const btn = document.createElement('button');
    btn.setAttribute('type', 'button');
    btn.setAttribute('data-go', 'sayitright');
    btn.textContent = 'Say It Right';
    homeBtn.parentNode.insertBefore(btn, homeBtn.nextSibling);
    btn.addEventListener('click', () => {
      if (typeof switchView === 'function') switchView('sayitright');
    });
  }
}

// Question bank: [flawed, correct, explanation, pattern]
// Patterns: articles, continuous, preposition, tense, agreement
const SIR_QS = [
  // Articles (Indian English: article omission)
  ["She bought book yesterday", "She bought a book yesterday",
    "Use 'a' before a singular countable noun you're mentioning for the first time.", "articles"],
  ["I am going to office", "I am going to the office",
    "'The office' — use 'the' for a specific place you go regularly.", "articles"],
  ["He is engineer at Fidelity", "He is an engineer at Fidelity",
    "'An' before vowel sounds. 'Engineer' starts with a vowel sound.", "articles"],

  // Present continuous overuse with state verbs
  ["I am knowing the answer", "I know the answer",
    "'Know' is a state verb — it doesn't take continuous form. Just 'I know'.", "continuous"],
  ["I am having a doubt about this", "I have a doubt about this",
    "'Have' for possession isn't continuous. Say 'I have a doubt'.", "continuous"],
  ["Are you understanding me?", "Do you understand me?",
    "'Understand' is a state verb. Use simple present: 'Do you understand?'", "continuous"],

  // Preposition errors
  ["We need to discuss about the timeline", "We need to discuss the timeline",
    "'Discuss' takes a direct object — no 'about' needed.", "preposition"],
  ["Please revert back by Friday", "Please revert by Friday",
    "'Revert' already means 'reply back'. The 'back' is redundant.", "preposition"],
  ["She is good in maths", "She is good at maths",
    "'Good at' for skills. 'Good in' is for being inside something.", "preposition"],
  ["I will cope up with the workload", "I will cope with the workload",
    "'Cope with' — no 'up'. 'Cope up' is a common Indian English error.", "preposition"],

  // Tense consistency
  ["I did not went to the meeting", "I did not go to the meeting",
    "After 'did', use the base form: 'go', not 'went'.", "tense"],
  ["She asked me what I am doing", "She asked me what I was doing",
    "In reported speech, shift the tense back: 'am' → 'was'.", "tense"],
  ["I have completed the task yesterday", "I completed the task yesterday",
    "With a specific past time ('yesterday'), use simple past, not present perfect.", "tense"],

  // Subject-verb agreement
  ["The data needs to be reconciled", "The data needs to be reconciled",
    "Correct as-is! 'Data' takes singular verb in business writing.", "agreement"],
  ["Each of the team members have submitted", "Each of the team members has submitted",
    "'Each' is singular — use 'has', not 'have'.", "agreement"],
  ["Neither John nor I is going", "Neither John nor I am going",
    "With 'neither/nor', the verb agrees with the nearer subject: 'I am'.", "agreement"],

  // From Winny's real messages
  ["Looking for a help", "Looking for help",
    "'Help' is uncountable — no 'a' needed.", "articles"],
  ["Go thru the calendar", "Go through the calendar",
    "'Through' is the correct spelling. 'Thru' is informal shorthand.", "spelling"],
  ["Use some these sentence corrections", "Use some of these sentence corrections",
    "Need 'of' before 'these': 'some of these'.", "preposition"],
  ["I am going to market", "I am going to the market",
    "Use 'the' for a specific place you go regularly.", "articles"],
  ["She don't like coffee", "She doesn't like coffee",
    "Third person singular takes 'doesn't', not 'don't'.", "agreement"],
  ["I have seen him yesterday", "I saw him yesterday",
    "With 'yesterday', use simple past 'saw', not present perfect.", "tense"],
  ["The movie was very bored", "The movie was very boring",
    "'Bored' describes people; 'boring' describes things.", "adjectives"],
  ["I am interested for music", "I am interested in music",
    "'Interested in', not 'interested for'.", "preposition"],
  ["We arrived to the airport late", "We arrived at the airport late",
    "'Arrive at' for specific places; 'arrive in' for cities/countries.", "preposition"],
  ["This soup tastes deliciously", "This soup tastes delicious",
    "After 'taste', use an adjective ('delicious'), not an adverb.", "adjectives"],
  ["He cooks good", "He cooks well",
    "'Well' (adverb) describes how he cooks; 'good' is an adjective.", "adverbs"],
];

const SIR_FRAMES = [
  { frame: "I've been working on ___ since ___",
    subs: [["the migration", "January"], ["the deck", "last week"], ["this bug", "morning"]] },
  { frame: "She asked me what I ___",
    subs: [["was doing", ""], ["had completed", ""], ["would present", ""]] },
  { frame: "If I ___ , I would ___",
    subs: [["had more time", "finish it today"], ["knew the answer", "tell you"], ["were you", "ask for help"]] },
  { frame: "By the time we ___, they ___",
    subs: [["arrived", "had left"], ["finished", "had already started"], ["got there", "were gone"]] },
];

let sirMode = 'fixit'; // 'fixit' or 'frames'
let sirIdx = 0, sirScore = 0, sirTotal = 0, sirStreak = 0;
let sirOrder = [];

function sirShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sirBuildUI() {
  const view = document.getElementById('view-sayitright');
  if (!view || view.hasAttribute('data-sir-built')) return;
  view.setAttribute('data-sir-built', '1');

  view.innerHTML = `
    <div class="game-header">
      <h2>Say It Right</h2>
      <div class="game-stats">
        <span>Score: <span id="sir-score">0</span></span>
        <span>Streak: <span id="sir-streak">0</span> 🔥</span>
      </div>
    </div>
    <div class="sir-mode-tabs">
      <button id="sir-tab-fixit" class="sir-tab active">Fix It</button>
      <button id="sir-tab-frames" class="sir-tab">Frames</button>
    </div>
    <div id="sir-card" class="sir-card"></div>
    <div id="sir-controls" class="sir-controls"></div>
    <p class="game-hint">🎤 Say the corrected sentence ALOUD before tapping reveal. That's how it sticks.</p>
  `;

  document.getElementById('sir-tab-fixit').addEventListener('click', () => sirSetMode('fixit'));
  document.getElementById('sir-tab-frames').addEventListener('click', () => sirSetMode('frames'));

  sirStart();
}

function sirSetMode(mode) {
  sirMode = mode;
  document.getElementById('sir-tab-fixit').classList.toggle('active', mode === 'fixit');
  document.getElementById('sir-tab-frames').classList.toggle('active', mode === 'frames');
  sirStart();
}

function sirStart() {
  sirIdx = 0;
  if (sirMode === 'fixit') {
    sirOrder = sirShuffle([...Array(SIR_QS.length).keys()]);
  } else {
    sirOrder = sirShuffle([...Array(SIR_FRAMES.length).keys()]);
  }
  sirRender();
}

function sirRender() {
  const card = document.getElementById('sir-card');
  const controls = document.getElementById('sir-controls');
  if (!card || !controls) return;

  if (sirMode === 'fixit') {
    if (sirIdx >= sirOrder.length) {
      card.innerHTML = `<div class="sir-done"><h3>Round complete!</h3><p>You scored ${sirScore}/${sirTotal}</p><button id="sir-again" class="btn-primary">Play Again</button></div>`;
      controls.innerHTML = '';
      document.getElementById('sir-again').addEventListener('click', () => { sirScore = 0; sirTotal = 0; sirUpdateStats(); sirStart(); });
      return;
    }
    const [flawed, correct, why, pattern] = SIR_QS[sirOrder[sirIdx]];
    card.innerHTML = `
      <div class="sir-pattern">${pattern}</div>
      <div class="sir-flawed">"${flawed}"</div>
      <div class="sir-prompt">☝️ Say the corrected version out loud, then tap reveal</div>
      <div id="sir-answer" class="sir-answer hidden">
        <div class="sir-correct">✅ "${correct}"</div>
        <div class="sir-why">${why}</div>
      </div>
    `;
    controls.innerHTML = `
      <button id="sir-reveal" class="btn-primary">Reveal</button>
      <div id="sir-selfscore" class="hidden">
        <p>Did you nail it?</p>
        <button id="sir-yes" class="sir-score-btn yes">✓ Got it</button>
        <button id="sir-no" class="sir-score-btn no">✗ Missed it</button>
      </div>
    `;
    document.getElementById('sir-reveal').addEventListener('click', () => {
      document.getElementById('sir-answer').classList.remove('hidden');
      document.getElementById('sir-reveal').classList.add('hidden');
      document.getElementById('sir-selfscore').classList.remove('hidden');
    });
    document.getElementById('sir-yes').addEventListener('click', () => sirAnswer(true));
    document.getElementById('sir-no').addEventListener('click', () => sirAnswer(false));

  } else {
    // Frames mode
    if (sirIdx >= sirOrder.length) {
      card.innerHTML = `<div class="sir-done"><h3>Frames complete!</h3><button id="sir-again" class="btn-primary">Again</button></div>`;
      controls.innerHTML = '';
      document.getElementById('sir-again').addEventListener('click', sirStart);
      return;
    }
    const f = SIR_FRAMES[sirOrder[sirIdx]];
    let subsHtml = f.subs.map(([a, b], i) => {
      const filled = f.frame.replace('___', `<strong>${a}</strong>`).replace('___', b ? `<strong>${b}</strong>` : '');
      return `<div class="sir-frame-sub">${i + 1}. ${filled}</div>`;
    }).join('');
    card.innerHTML = `
      <div class="sir-pattern">sentence frame</div>
      <div class="sir-frame">${f.frame}</div>
      <div class="sir-prompt">🎤 Say each one ALOUD at full speed, then tap next</div>
      <div class="sir-frame-subs">${subsHtml}</div>
    `;
    controls.innerHTML = `<button id="sir-next-frame" class="btn-primary">Next Frame →</button>`;
    document.getElementById('sir-next-frame').addEventListener('click', () => { sirIdx++; sirRender(); });
  }
}

function sirAnswer(gotIt) {
  sirTotal++;
  if (gotIt) {
    sirScore++;
    sirStreak++;
  } else {
    sirStreak = 0;
  }
  sirUpdateStats();
  sirIdx++;
  sirRender();
}

function sirUpdateStats() {
  const s = document.getElementById('sir-score');
  const st = document.getElementById('sir-streak');
  if (s) s.textContent = sirScore + '/' + sirTotal;
  if (st) st.textContent = sirStreak;
}

// Hook into view switching
function hookView() {
  if (typeof switchView === 'undefined') { setTimeout(hookView, 200); return; }
  const _sw = window.switchView;
  window.switchView = function(name, ...args) {
    const r = _sw.call(this, name, ...args);
    if (name === 'sayitright') setTimeout(sirBuildUI, 100);
    return r;
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { registerView(); hookView(); });
} else {
  registerView(); hookView();
}

})();
