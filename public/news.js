// News view — loaded as a static file (like grammar.js) to keep site/app.js small.
// Depends on globals from app.js: cards, escHtml. Called via renderNews() from switchView.
let newsSelectedId = null;
function newsCards() {
  return cards
    .filter((c) => (c.tags || []).includes('news'))
    .map((c) => {
      let data = null;
      try { data = JSON.parse(c.details || ''); } catch (e) { /* skip malformed */ }
      if (!data || !Array.isArray(data.items) || !data.items.length) return null;
      return { id: c.id, title: c.title || '', date: data.d || '', items: data.items };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
function renderNews() {
  const datesBox = document.getElementById('news-dates');
  const box = document.getElementById('news-list');
  if (!datesBox || !box) return;
  const list = newsCards();
  datesBox.innerHTML = '';
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<p class="empty-note">No news yet. The daily digest lands here every afternoon at 4 PM.</p>';
    return;
  }
  if (!newsSelectedId || !list.some((n) => n.id === newsSelectedId)) newsSelectedId = list[0].id;
  list.forEach((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'news-date-pill' + (n.id === newsSelectedId ? ' active' : '');
    b.textContent = n.title.replace(/^News · /, '') || n.date;
    b.addEventListener('click', () => { newsSelectedId = n.id; renderNews(); });
    datesBox.appendChild(b);
  });
  const cur = list.find((n) => n.id === newsSelectedId);
  if (!cur) return;
  cur.items.forEach((it) => {
    if (!it || !it.h || !it.u) return;
    const el = document.createElement('div');
    el.className = 'news-story';
    el.innerHTML =
      '<a class="news-headline" href="' + escHtml(it.u) + '" target="_blank" rel="noopener">' + escHtml(it.h) + '</a>' +
      (it.s ? '<div class="news-summary">' + escHtml(it.s) + '</div>' : '') +
      (it.src ? '<div class="news-source">' + escHtml(it.src) + '</div>' : '');
    box.appendChild(el);
  });
}
