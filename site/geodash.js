// GeoDash — Geometry Dash style game (Levels 1-3)
// Auto-run, tap/click/space to jump. Avoid spikes.
(function() {
'use strict';

// Register the view (VIEWS/VIEW_IDS/VIEW_TITLES are const but mutable)
function registerView() {
  if (typeof VIEWS === 'undefined') { setTimeout(registerView, 200); return; }
  if (VIEWS.indexOf('geodash') === -1) VIEWS.push('geodash');
  if (typeof VIEW_IDS !== 'undefined') VIEW_IDS.geodash = 'view-geodash';
  if (typeof VIEW_TITLES !== 'undefined') VIEW_TITLES.geodash = 'GeoDash';

  // Inject view HTML if not present
  if (!document.getElementById('view-geodash')) {
    const main = document.createElement('main');
    main.id = 'view-geodash';
    main.className = 'view hidden';
    // Insert after grammar view or at end of views container
    const grammar = document.getElementById('view-grammar');
    if (grammar && grammar.parentNode) grammar.parentNode.insertBefore(main, grammar.nextSibling);
    else document.body.appendChild(main);
  }

  // Inject menu items if not present
  const menuBtn = document.querySelector('[data-view="grammar"]');
  if (menuBtn && !document.querySelector('[data-view="geodash"]')) {
    const btn = document.createElement('button');
    btn.setAttribute('data-view', 'geodash');
    btn.className = 'view-link sub';
    btn.textContent = 'GeoDash';
    menuBtn.parentNode.insertBefore(btn, menuBtn.nextSibling);
    // Wire up click via the existing view system
    btn.addEventListener('click', () => {
      if (typeof switchView === 'function') switchView('geodash');
    });
  }

  // Home screen game button
  const homeGames = document.querySelector('[data-go="grammar"]');
  if (homeGames && !document.querySelector('[data-go="geodash"]')) {
    const btn = document.createElement('button');
    btn.setAttribute('type', 'button');
    btn.setAttribute('data-go', 'geodash');
    btn.textContent = 'GeoDash';
    homeGames.parentNode.insertBefore(btn, homeGames.nextSibling);
    btn.addEventListener('click', () => {
      if (typeof switchView === 'function') switchView('geodash');
    });
  }
}

const GD_LEVELS = [
  { name: 'Level 1', speed: 5, obstacles: [
    {x: 400, type: 'spike'}, {x: 600, type: 'spike'}, {x: 900, type: 'block'},
    {x: 1100, type: 'spike'}, {x: 1300, type: 'spike'}, {x: 1350, type: 'spike'},
    {x: 1700, type: 'block'}, {x: 1750, type: 'block'}, {x: 2000, type: 'spike'},
    {x: 2300, type: 'spike'}, {x: 2500, type: 'block'}, {x: 2700, type: 'spike'},
    {x: 3000, type: 'spike'}, {x: 3050, type: 'spike'}, {x: 3400, type: 'end'},
  ]},
  { name: 'Level 2', speed: 6, obstacles: [
    {x: 350, type: 'spike'}, {x: 550, type: 'block'}, {x: 750, type: 'spike'},
    {x: 950, type: 'spike'}, {x: 1000, type: 'spike'}, {x: 1250, type: 'block'},
    {x: 1300, type: 'block'}, {x: 1350, type: 'block'}, {x: 1600, type: 'spike'},
    {x: 1800, type: 'spike'}, {x: 2000, type: 'block'}, {x: 2200, type: 'spike'},
    {x: 2250, type: 'spike'}, {x: 2500, type: 'spike'}, {x: 2700, type: 'block'},
    {x: 2750, type: 'block'}, {x: 3000, type: 'spike'}, {x: 3200, type: 'spike'},
    {x: 3250, type: 'spike'}, {x: 3500, type: 'end'},
  ]},
  { name: 'Level 3', speed: 7, obstacles: [
    {x: 300, type: 'spike'}, {x: 500, type: 'spike'}, {x: 550, type: 'spike'},
    {x: 800, type: 'block'}, {x: 850, type: 'block'}, {x: 1100, type: 'spike'},
    {x: 1300, type: 'spike'}, {x: 1350, type: 'spike'}, {x: 1400, type: 'spike'},
    {x: 1650, type: 'block'}, {x: 1700, type: 'block'}, {x: 1750, type: 'block'},
    {x: 2000, type: 'spike'}, {x: 2200, type: 'block'}, {x: 2400, type: 'spike'},
    {x: 2450, type: 'spike'}, {x: 2650, type: 'spike'}, {x: 2850, type: 'block'},
    {x: 2900, type: 'block'}, {x: 3100, type: 'spike'}, {x: 3300, type: 'spike'},
    {x: 3350, type: 'spike'}, {x: 3400, type: 'spike'}, {x: 3650, type: 'end'},
  ]},
];

let gdCanvas, gdCtx, gdRunning = false, gdLevel = 0;
let gdPlayer, gdObstacles, gdCamX, gdAnimId, gdAttempts = 0;

function gdBuildUI() {
  const view = document.getElementById('view-geodash');
  if (!view || view.hasAttribute('data-gd-built')) return;
  view.setAttribute('data-gd-built', '1');
  view.innerHTML = `
    <div class="game-header">
      <h2>GeoDash</h2>
      <div class="game-stats">
        <span id="gd-level-name">Level 1</span>
        <span>Attempts: <span id="gd-attempts">0</span></span>
      </div>
    </div>
    <div class="gd-level-select">
      <button data-gd-level="0" class="gd-lvl-btn active">1</button>
      <button data-gd-level="1" class="gd-lvl-btn">2</button>
      <button data-gd-level="2" class="gd-lvl-btn">3</button>
    </div>
    <canvas id="gd-canvas" width="800" height="300" style="width:100%;max-width:800px;"></canvas>
    <p class="game-hint">Tap, click, or press SPACE to jump. Don't hit the spikes!</p>
    <button id="gd-start" class="btn-primary">Start</button>
  `;

  gdCanvas = document.getElementById('gd-canvas');
  gdCtx = gdCanvas.getContext('2d');

  view.querySelectorAll('[data-gd-level]').forEach(btn => {
    btn.addEventListener('click', () => {
      view.querySelectorAll('[data-gd-level]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gdLevel = parseInt(btn.dataset.gdLevel);
      document.getElementById('gd-level-name').textContent = GD_LEVELS[gdLevel].name;
      gdStop();
      gdDrawIdle();
    });
  });

  document.getElementById('gd-start').addEventListener('click', gdStart);
  gdCanvas.addEventListener('click', gdJump);
  gdCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); gdJump(); }, {passive: false});

  gdDrawIdle();
}

function gdDrawIdle() {
  if (!gdCtx) return;
  gdCtx.fillStyle = '#0a0a1a';
  gdCtx.fillRect(0, 0, 800, 300);
  gdCtx.fillStyle = '#1a1a3a';
  gdCtx.fillRect(0, 250, 800, 50);
  gdCtx.fillStyle = '#00ff88';
  gdCtx.fillRect(100, 210, 40, 40);
}

function gdStart() {
  gdStop();
  gdAttempts++;
  const attEl = document.getElementById('gd-attempts');
  if (attEl) attEl.textContent = gdAttempts;
  const lvl = GD_LEVELS[gdLevel];
  gdPlayer = { x: 100, y: 210, w: 40, h: 40, vy: 0, grounded: true, rotation: 0 };
  gdObstacles = JSON.parse(JSON.stringify(lvl.obstacles));
  gdCamX = 0;
  gdRunning = true;
  gdLoop();
}

function gdStop() {
  gdRunning = false;
  if (gdAnimId) cancelAnimationFrame(gdAnimId);
}

function gdJump() {
  if (!gdRunning || !gdPlayer || !gdPlayer.grounded) return;
  gdPlayer.vy = -13;
  gdPlayer.grounded = false;
}

function gdLoop() {
  if (!gdRunning) return;
  const lvl = GD_LEVELS[gdLevel];
  gdCamX += lvl.speed;

  gdPlayer.vy += 0.7;
  gdPlayer.y += gdPlayer.vy;
  if (gdPlayer.y >= 210) {
    gdPlayer.y = 210; gdPlayer.vy = 0; gdPlayer.grounded = true; gdPlayer.rotation = 0;
  } else {
    gdPlayer.rotation += 0.15;
  }

  const px = gdPlayer.x + gdCamX;
  for (const ob of gdObstacles) {
    const ox = ob.x;
    if (ob.type === 'end') {
      if (px + gdPlayer.w > ox) { gdWin(); return; }
      continue;
    }
    const oy = 210, ow = 40, oh = 40;
    if (px < ox + ow && px + gdPlayer.w > ox && gdPlayer.y < oy + oh && gdPlayer.y + gdPlayer.h > oy) {
      if (ob.type === 'spike') {
        if (px + gdPlayer.w > ox + 10 && px < ox + 30 && gdPlayer.y + gdPlayer.h > oy + 10) { gdDie(); return; }
      } else {
        if (gdPlayer.vy > 0 && gdPlayer.y + gdPlayer.h - gdPlayer.vy <= oy + 5) {
          gdPlayer.y = oy - gdPlayer.h; gdPlayer.vy = 0; gdPlayer.grounded = true; gdPlayer.rotation = 0;
        } else { gdDie(); return; }
      }
    }
  }

  gdDraw();
  gdAnimId = requestAnimationFrame(gdLoop);
}

function gdDraw() {
  const ctx = gdCtx;
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, 800, 300);
  ctx.strokeStyle = '#1a1a3a'; ctx.lineWidth = 1;
  const off = -(gdCamX % 50);
  for (let x = off; x < 800; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 300); ctx.stroke();
  }
  ctx.fillStyle = '#1a1a3a';
  ctx.fillRect(0, 250, 800, 50);
  ctx.fillStyle = '#00ff88';
  ctx.fillRect(0, 248, 800, 2);

  for (const ob of gdObstacles) {
    const sx = ob.x - gdCamX;
    if (sx < -50 || sx > 850) continue;
    if (ob.type === 'spike') {
      ctx.fillStyle = '#ff3355';
      ctx.beginPath();
      ctx.moveTo(sx, 250); ctx.lineTo(sx + 20, 210); ctx.lineTo(sx + 40, 250);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ff8899'; ctx.stroke();
    } else if (ob.type === 'block') {
      ctx.fillStyle = '#3388ff';
      ctx.fillRect(sx, 210, 40, 40);
      ctx.strokeStyle = '#88bbff'; ctx.strokeRect(sx, 210, 40, 40);
    } else if (ob.type === 'end') {
      ctx.fillStyle = '#ffdd00';
      ctx.fillRect(sx, 150, 10, 100);
      ctx.fillStyle = '#00ff88';
      ctx.font = '20px sans-serif';
      ctx.fillText('FINISH', sx - 20, 140);
    }
  }

  ctx.save();
  ctx.translate(gdPlayer.x + 20, gdPlayer.y + 20);
  ctx.rotate(gdPlayer.rotation);
  ctx.fillStyle = '#00ff88';
  ctx.fillRect(-20, -20, 40, 40);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
  ctx.strokeRect(-20, -20, 40, 40);
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(-10, -10, 20, 20);
  ctx.restore();
}

function gdDie() {
  gdRunning = false;
  if (gdCtx) {
    gdCtx.fillStyle = 'rgba(255,0,0,0.3)';
    gdCtx.fillRect(0, 0, 800, 300);
  }
  setTimeout(() => { if (!gdRunning) gdStart(); }, 800);
}

function gdWin() {
  gdRunning = false;
  if (gdCtx) {
    gdCtx.fillStyle = '#00ff88';
    gdCtx.font = 'bold 42px sans-serif';
    gdCtx.textAlign = 'center';
    gdCtx.fillText('LEVEL COMPLETE!', 400, 150);
  }
  if (gdLevel < 2) {
    setTimeout(() => {
      gdLevel++;
      const view = document.getElementById('view-geodash');
      if (view) {
        view.querySelectorAll('[data-gd-level]').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.gdLevel) === gdLevel);
        });
        const nameEl = document.getElementById('gd-level-name');
        if (nameEl) nameEl.textContent = GD_LEVELS[gdLevel].name;
      }
      gdDrawIdle();
    }, 2000);
  }
}

// Global key handler
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    const view = document.getElementById('view-geodash');
    if (view && !view.classList.contains('hidden')) {
      e.preventDefault();
      gdJump();
    }
  }
});

// Hook into view switching to build UI when shown
function hookView() {
  if (typeof switchView === 'undefined') { setTimeout(hookView, 200); return; }
  const _sw = window.switchView;
  window.switchView = function(name, ...args) {
    const r = _sw.call(this, name, ...args);
    if (name === 'geodash') setTimeout(gdBuildUI, 100);
    return r;
  };
}

// Init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { registerView(); hookView(); setTimeout(gdBuildUI, 1000); });
} else {
  registerView(); hookView(); setTimeout(gdBuildUI, 1000);
}

})();
