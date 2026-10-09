// Recall — memory-enhancing word game
// Based on research: spaced retrieval, guess-before-reveal, generative production,
// variable contexts, typed gap-fill, interleaving, streaks
(function() {
'use strict';

function registerView() {
  if (typeof VIEWS === 'undefined') { setTimeout(registerView, 200); return; }
  if (VIEWS.indexOf('recall') === -1) VIEWS.push('recall');
  if (typeof VIEW_IDS !== 'undefined') VIEW_IDS.recall = 'view-recall';
  if (typeof VIEW_TITLES !== 'undefined') VIEW_TITLES.recall = 'Recall';

  if (!document.getElementById('view-recall')) {
    const main = document.createElement('main');
    main.id = 'view-recall';
    main.className = 'view hidden';
    const grammar = document.getElementById('view-grammar');
    if (grammar && grammar.parentNode) grammar.parentNode.insertBefore(main, grammar.nextSibling);
    else document.body.appendChild(main);
  }

  const menuBtn = document.querySelector('[data-view="grammar"]');
  if (menuBtn && !document.querySelector('[data-view="recall"]')) {
    const btn = document.createElement('button');
    btn.setAttribute('data-view', 'recall');
    btn.className = 'view-link sub';
    btn.textContent = 'Recall';
    menuBtn.parentNode.insertBefore(btn, menuBtn.nextSibling);
    btn.addEventListener('click', () => { if (typeof switchView === 'function') switchView('recall'); });
  }

  const homeBtn = document.querySelector('[data-go="grammar"]');
  if (homeBtn && !document.querySelector('[data-go="recall"]')) {
    const btn = document.createElement('button');
    btn.setAttribute('type', 'button');
    btn.setAttribute('data-go', 'recall');
    btn.textContent = 'Recall';
    homeBtn.parentNode.insertBefore(btn, homeBtn.nextSibling);
    btn.addEventListener('click', () => { if (typeof switchView === 'function') switchView('recall'); });
  }
}

// Word bank: professional + academic vocabulary
// Format: {w: word, def: definition, ctx: [contexts], theme: category}
const RECALL_WORDS = [
  {w: "ubiquitous", def: "present everywhere", theme: "adjectives",
   ctx: ["Smartphones have become ___ in modern life.", "The ___ hum of the server room filled the office."]},
  {w: "pragmatic", def: "practical rather than idealistic", theme: "adjectives",
   ctx: ["We need a ___ approach to this migration.", "She took a ___ view of the budget cuts."]},
  {w: "meticulous", def: "extremely careful about details", theme: "adjectives",
   ctx: ["His ___ code reviews catch every edge case.", "The audit requires ___ documentation."]},
  {w: "resilient", def: "able to recover quickly", theme: "adjectives",
   ctx: ["We need a ___ architecture that survives failures.", "The team proved ___ after the outage."]},
  {w: "candid", def: "honest and straightforward", theme: "adjectives",
   ctx: ["Let me be ___ about the timeline risks.", "I appreciate your ___ feedback on the design."]},
  {w: "leverage", def: "use something to maximum advantage", theme: "verbs",
   ctx: ["We can ___ the existing API for this feature.", "He ___ his network to find a mentor."]},
  {w: "streamline", def: "make more efficient", theme: "verbs",
   ctx: ["Let's ___ the deployment process.", "The new tool will ___ our workflow."]},
  {w: "escalate", def: "raise to a higher level of urgency", theme: "verbs",
   ctx: ["We may need to ___ this to the VP.", "Don't ___ minor issues unnecessarily."]},
  {w: "synthesize", def: "combine into a coherent whole", theme: "verbs",
   ctx: ["Can you ___ these reports into one summary?", "The AI will ___ the data sources."]},
  {w: "mitigate", def: "reduce the severity of", theme: "verbs",
   ctx: ["We need to ___ the risk of downtime.", "Caching will ___ the latency issue."]},
  {w: "paradigm", def: "a typical pattern or model", theme: "nouns",
   ctx: ["This represents a ___ shift in how we build.", "The old ___ no longer applies."]},
  {w: "bottleneck", def: "a point of congestion", theme: "nouns",
   ctx: ["The database is our biggest ___.", "We identified a ___ in the pipeline."]},
  {w: "milestone", def: "a significant stage", theme: "nouns",
   ctx: ["We hit a major ___ last sprint.", "The next ___ is the beta release."]},
  {w: "stakeholder", def: "someone with an interest in the outcome", theme: "nouns",
   ctx: ["We need ___ buy-in before proceeding.", "All ___ were invited to the review."]},
  {w: "deliverable", def: "something to be provided", theme: "nouns",
   ctx: ["What's the ___ for this sprint?", "The main ___ is the API spec."]},
  {w: "ambiguous", def: "open to multiple interpretations", theme: "adjectives",
   ctx: ["The requirements are still ___.", "His response was deliberately ___."]},
  {w: "coherent", def: "logical and consistent", theme: "adjectives",
   ctx: ["We need a ___ strategy for Q4.", "Her argument was clear and ___."]},
  {w: "empirical", def: "based on observation/experiment", theme: "adjectives",
   ctx: ["We need ___ evidence, not opinions.", "The ___ data supports this approach."]},
  {w: "facilitate", def: "make easier", theme: "verbs",
   ctx: ["This tool will ___ collaboration.", "She ___ the workshop discussion."]},
  {w: "articulate", def: "express clearly", theme: "verbs",
   ctx: ["Can you ___ your concerns?", "He ___ the vision well."]},
];

let rcQueue = [], rcIdx = 0, rcScore = 0, rcTotal = 0, rcStreak = 0;
let rcSeen = {}; // word -> times seen (for spacing)
let rcMode = 'recall'; // 'recall', 'produce', 'guess'

function rcShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rcBuildUI() {
  const view = document.getElementById('view-recall');
  if (!view || view.hasAttribute('data-rc-built')) return;
  view.setAttribute('data-rc-built', '1');

  view.innerHTML = `
    <div class="game-header">
      <h2>Recall</h2>
      <div class="game-stats">
        <span>Score: <span id="rc-score">0</span></span>
        <span>Streak: <span id="rc-streak">0</span> 🔥</span>
      </div>
    </div>
    <div class="rc-mode-tabs">
      <button id="rc-tab-recall" class="rc-tab active">Recall</button>
      <button id="rc-tab-produce" class="rc-tab">Use It</button>
      <button id="rc-tab-guess" class="rc-tab">New Words</button>
    </div>
    <div id="rc-card" class="rc-card"></div>
    <div id="rc-controls" class="rc-controls"></div>
    <p class="game-hint">💡 Type the word from memory BEFORE revealing. The struggle is what builds the memory.</p>
  `;

  document.getElementById('rc-tab-recall').addEventListener('click', () => rcSetMode('recall'));
  document.getElementById('rc-tab-produce').addEventListener('click', () => rcSetMode('produce'));
  document.getElementById('rc-tab-guess').addEventListener('click', () => rcSetMode('guess'));

  // Load progress from localStorage
  try {
    const saved = JSON.parse(localStorage.getItem('rc-progress') || '{}');
    rcSeen = saved.seen || {};
    rcStreak = saved.streak || 0;
  } catch (e) {}

  rcStart();
}

function rcSetMode(mode) {
  rcMode = mode;
  ['recall', 'produce', 'guess'].forEach(m => {
    document.getElementById('rc-tab-' + m).classList.toggle('active', m === mode);
  });
  rcStart();
}

function rcStart() {
  rcIdx = 0;
  // Interleave: mix themes, prioritize less-seen words, include 40% reviews
  let words = [...RECALL_WORDS];
  // Sort by seen count (less seen first), then shuffle within groups
  words.sort((a, b) => (rcSeen[a.w] || 0) - (rcSeen[b.w] || 0));
  // Take 10 for this session, interleaved by theme
  let byTheme = {};
  words.forEach(w => {
    if (!byTheme[w.theme]) byTheme[w.theme] = [];
    byTheme[w.theme].push(w);
  });
  let themes = Object.keys(byTheme);
  rcQueue = [];
  let ti = 0;
  while (rcQueue.length < 10 && themes.some(t => byTheme[t].length > 0)) {
    const theme = themes[ti % themes.length];
    if (byTheme[theme].length > 0) {
      rcQueue.push(byTheme[theme].shift());
    }
    ti++;
  }
  rcQueue = rcShuffle(rcQueue);
  rcRender();
}

function rcRender() {
  const card = document.getElementById('rc-card');
  const controls = document.getElementById('rc-controls');
  if (!card || !controls) return;

  if (rcIdx >= rcQueue.length) {
    // Save progress
    try {
      localStorage.setItem('rc-progress', JSON.stringify({ seen: rcSeen, streak: rcStreak }));
    } catch (e) {}
    card.innerHTML = `<div class="rc-done"><h3>Session complete!</h3><p>Score: ${rcScore}/${rcTotal}</p><button id="rc-again" class="btn-primary">Again</button></div>`;
    controls.innerHTML = '';
    document.getElementById('rc-again').addEventListener('click', () => { rcScore = 0; rcTotal = 0; rcUpdateStats(); rcStart(); });
    return;
  }

  const word = rcQueue[rcIdx];
  rcSeen[word.w] = (rcSeen[word.w] || 0) + 1;

  if (rcMode === 'recall') {
    // Show definition, type the word (meaning → form, the conversational direction)
    const ctxIdx = Math.floor(Math.random() * word.ctx.length);
    const blanked = word.ctx[ctxIdx].replace('___', '_____');
    card.innerHTML = `
      <div class="rc-theme">${word.theme}</div>
      <div class="rc-def">"${word.def}"</div>
      <div class="rc-ctx">${blanked}</div>
      <div class="rc-prompt">Type the word from memory:</div>
      <input id="rc-input" type="text" class="rc-input" autocomplete="off" autocapitalize="off" placeholder="...">
      <div id="rc-feedback" class="rc-feedback hidden"></div>
    `;
    controls.innerHTML = `<button id="rc-check" class="btn-primary">Check</button>`;
    const input = document.getElementById('rc-input');
    input.focus();
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') rcCheckRecall(word); });
    document.getElementById('rc-check').addEventListener('click', () => rcCheckRecall(word));

  } else if (rcMode === 'produce') {
    // Show word, write a sentence using it (generative production)
    card.innerHTML = `
      <div class="rc-theme">${word.theme}</div>
      <div class="rc-word-big">${word.w}</div>
      <div class="rc-def">"${word.def}"</div>
      <div class="rc-prompt">Write a sentence using this word (about work):</div>
      <textarea id="rc-sentence" class="rc-textarea" rows="2" placeholder="Type your sentence..."></textarea>
      <div id="rc-model" class="rc-feedback hidden"></div>
    `;
    controls.innerHTML = `<button id="rc-submit-sent" class="btn-primary">Done</button>`;
    document.getElementById('rc-submit-sent').addEventListener('click', () => {
      const ctxIdx = Math.floor(Math.random() * word.ctx.length);
      const model = word.ctx[ctxIdx].replace('___', word.w);
      document.getElementById('rc-model').innerHTML = `<div class="rc-model-sent">Example: "${model}"</div>`;
      document.getElementById('rc-model').classList.remove('hidden');
      controls.innerHTML = `<button id="rc-next" class="btn-primary">Next →</button>`;
      document.getElementById('rc-next').addEventListener('click', () => {
        rcTotal++; rcScore++; rcStreak++; rcUpdateStats(); rcIdx++; rcRender();
      });
    });

  } else if (rcMode === 'guess') {
    // New word: guess before reveal (only show unseen words)
    const unseen = RECALL_WORDS.filter(w => !(rcSeen[w.w] > 1));
    const w = unseen.length > 0 ? unseen[rcIdx % unseen.length] : word;
    const ctxIdx = Math.floor(Math.random() * w.ctx.length);
    card.innerHTML = `
      <div class="rc-theme">${w.theme} · new word</div>
      <div class="rc-ctx-guess">${w.ctx[ctxIdx].replace('___', '_____')}</div>
      <div class="rc-prompt">Guess the word that fits. Then tap reveal:</div>
      <input id="rc-guess-input" type="text" class="rc-input" autocomplete="off" placeholder="Your guess...">
      <div id="rc-guess-answer" class="rc-feedback hidden">
        <div class="rc-word-big">${w.w}</div>
        <div class="rc-def">"${w.def}"</div>
      </div>
    `;
    controls.innerHTML = `<button id="rc-reveal-word" class="btn-primary">Reveal</button>`;
    document.getElementById('rc-reveal-word').addEventListener('click', () => {
      document.getElementById('rc-guess-answer').classList.remove('hidden');
      document.getElementById('rc-reveal-word').classList.add('hidden');
      controls.innerHTML += `<button id="rc-guess-next" class="btn-primary" style="margin-left:0.5rem">Next →</button>`;
      document.getElementById('rc-guess-next').addEventListener('click', () => {
        rcTotal++; rcScore++; rcIdx++; rcRender();
      });
    });
  }
}

function rcCheckRecall(word) {
  const input = document.getElementById('rc-input');
  const feedback = document.getElementById('rc-feedback');
  const guess = input.value.trim().toLowerCase();
  const correct = word.w.toLowerCase();
  rcTotal++;

  if (guess === correct) {
    rcScore++; rcStreak++;
    feedback.innerHTML = `<span class="rc-ok">✓ Correct!</span>`;
  } else {
    rcStreak = 0;
    feedback.innerHTML = `<span class="rc-miss">✗ It was "<strong>${word.w}</strong>"</span><div class="rc-def">"${word.def}"</div>`;
    // Recycle missed words: add back to queue
    rcQueue.push(word);
  }
  feedback.classList.remove('hidden');
  rcUpdateStats();

  const controls = document.getElementById('rc-controls');
  controls.innerHTML = `<button id="rc-next" class="btn-primary">Next →</button>`;
  document.getElementById('rc-next').addEventListener('click', () => { rcIdx++; rcRender(); });
}

function rcUpdateStats() {
  const s = document.getElementById('rc-score');
  const st = document.getElementById('rc-streak');
  if (s) s.textContent = rcScore + '/' + rcTotal;
  if (st) st.textContent = rcStreak;
}

function hookView() {
  if (typeof switchView === 'undefined') { setTimeout(hookView, 200); return; }
  const _sw = window.switchView;
  window.switchView = function(name, ...args) {
    const r = _sw.call(this, name, ...args);
    if (name === 'recall') setTimeout(rcBuildUI, 100);
    return r;
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { registerView(); hookView(); });
} else {
  registerView(); hookView();
}

})();
