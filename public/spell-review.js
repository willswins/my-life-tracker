/* DayBook Spell It — game-over word review (static file, no API fn). */
function renderSpellReview() {
  var rl = document.getElementById('spell-review');
  if (!rl || typeof spellHistory === 'undefined') return;
  var total = spellHistory.length;
  var missed = 0, i, h;
  for (i = 0; i < total; i++) if (!spellHistory[i].ok) missed++;
  var html = '<div class="spell-review-head">' + total + ' word' + (total === 1 ? '' : 's') +
    ' · ' + (total - missed) + ' ✓ · ' + missed + ' ✗</div><div class="spell-review-list">';
  for (i = 0; i < total; i++) {
    h = spellHistory[i];
    var word = escHtml(String(h.w).toUpperCase());
    if (h.ok) {
      html += '<div class="spell-review-item ok"><span class="spell-review-mark">✓</span>' +
        '<span class="spell-review-word">' + word + '</span></div>';
    } else {
      var g = h.guess ? escHtml(String(h.guess).toUpperCase()) : 'timed out';
      html += '<div class="spell-review-item miss"><span class="spell-review-mark">✗</span>' +
        '<span class="spell-review-word">' + word + '</span>' +
        '<span class="spell-review-guess">you typed “' + g + '”</span></div>';
    }
  }
  html += '</div>';
  rl.innerHTML = html;
  rl.classList.remove('hidden');
  var srb = document.getElementById('spell-review-btn');
  if (srb) srb.textContent = 'Hide Review';
}
(function () {
  var btn = document.getElementById('spell-review-btn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var rl = document.getElementById('spell-review');
    if (!rl) return;
    if (rl.classList.contains('hidden')) {
      renderSpellReview();
    } else {
      rl.classList.add('hidden');
      btn.textContent = 'Review Words';
    }
  });
})();
