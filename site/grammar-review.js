// Grammar Quiz post-round review — patches gramAnswer/gramStart/gramEnd at runtime
(function() {
  let gramReview = [];

  function initReview() {
    if (typeof gramAnswer === 'undefined') { setTimeout(initReview, 200); return; }

    const _answer = gramAnswer, _start = gramStart, _end = gramEnd;

    gramAnswer = function(oi, btn) {
      try {
        const q = gramQs[gramQi];
        if (q) gramReview.push({prompt: q[0], options: q[1].slice(), correct: q[2], userIdx: oi, source: q[3] || 'seed'});
      } catch (e) {}
      return _answer.call(this, oi, btn);
    };

    gramStart = function() {
      gramReview = [];
      const rv = document.getElementById('gram-review');
      if (rv) { rv.innerHTML = ''; rv.classList.add('hidden'); }
      return _start.call(this);
    };

    gramEnd = function() {
      const r = _end.call(this);
      showReview();
      return r;
    };

    function showReview() {
      const rv = document.getElementById('gram-review');
      if (!rv) return;
      rv.classList.remove('hidden');
      if (!gramReview.length) { rv.innerHTML = '<p class="game-hint">No questions answered this round.</p>'; return; }
      let html = '<h3>Review — ' + gramReview.length + ' questions</h3>';
      gramReview.forEach((it, i) => {
        const ok = it.userIdx === it.correct;
        const src = it.source === 'luttu' ? 'From your messages' : 'Starter set';
        html += '<div class="gram-review-item' + (ok ? ' ok' : ' miss') + '">';
        html += '<div class="gram-review-q">' + (i+1) + '. ' + escHtml(it.prompt) + '</div>';
        html += '<div class="gram-review-a">You: ' + escHtml(it.options[it.userIdx]) + (ok ? ' ✓' : ' ✗') + '</div>';
        if (!ok) html += '<div class="gram-review-c">Correct: ' + escHtml(it.options[it.correct]) + '</div>';
        html += '<div class="gram-review-src">' + src + '</div>';
        html += '</div>';
      });
      rv.innerHTML = html;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReview);
  } else {
    initReview();
  }
})();
