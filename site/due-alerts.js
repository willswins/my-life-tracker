// Foreground due-reminder alerts (no push notifications).
// Shows an in-app banner when the app becomes visible with due reminders.
(function() {
let _dueShown = false;
function checkDue() {
  if (_dueShown || typeof reminders === 'undefined') return;
  try {
    const t = Date.now();
    const d = reminders.filter((r) => (r.status === 'active' || r.status === 'snoozed') && new Date(r.remind_at).getTime() <= t);
    if (!d.length) return;
    _dueShown = true;
    const n = d.length;
    const ti = d.slice(0, 3).map((r) => r.title || '(untitled)').join(', ');
    showBanner(`${n} reminder${n > 1 ? 's' : ''} due: ${ti}${n > 3 ? ` +${n - 3} more` : ''}`);
  } catch (e) {}
}
function showBanner(m) {
  let b = document.getElementById('due-banner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'due-banner';
    b.className = 'due-banner hidden';
    b.innerHTML = '<span class="due-banner-text"></span><button type="button" class="due-banner-view">View</button><button type="button" class="due-banner-x">\u00d7</button>';
    document.body.appendChild(b);
    b.querySelector('.due-banner-x').addEventListener('click', () => b.classList.add('hidden'));
    b.querySelector('.due-banner-view').addEventListener('click', () => { b.classList.add('hidden'); location.hash = '#/reminders'; });
  }
  b.querySelector('.due-banner-text').textContent = m;
  b.classList.remove('hidden');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.add('hidden'), 12000);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkDue(); });
window.addEventListener('focus', () => checkDue());
setTimeout(checkDue, 2000);
})();
