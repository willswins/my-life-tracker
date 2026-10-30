// Pattern alignment (Winny, 2026-10-30): bring the pages that drifted
// back to the shared DayBook pattern the board set — header search +
// dark + Add, tag-filter pills for filters, shared button/input styling.
//   Links:     tag-filter pills replace the tag dropdown.
//   Journal:   All / This Month filters restyled to tag-filter pills (CSS).
//   Habits:    header search (index.html) filters the habit cards.
//   Long Term: header search (index.html) filters the goal cards.
//   Mood:      Save check-in + note input take the shared primary/input look (CSS).
// Everything here is additive and guarded: a failure leaves the page as-is.
(function () {
  'use strict';

  // Pure: does an item's text match the search query? Node-tested.
  function alignTextMatch(text, q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return true;
    return String(text || '').toLowerCase().indexOf(q) !== -1;
  }

  function injectAlignStyles() {
    if (document.getElementById('align-style')) return;
    var st = document.createElement('style');
    st.id = 'align-style';
    st.textContent = [
      '#view-links [data-dd="link-tag-filter"]{display:none;}',
      '#view-journal .filters{background:transparent;padding:0;gap:0.5rem;border-radius:0;}',
      '#view-journal .filters button{font-size:0.95rem;border:1px solid var(--line);background:#fff;border-radius:999px;padding:0.45rem 1.1rem;color:var(--muted);font-weight:600;box-shadow:none;}',
      '#view-journal .filters button.active{background:var(--ink);color:#fff;border-color:var(--ink);box-shadow:none;}',
      '#view-mood .mood-save{background:var(--ink);color:#fff;border:0;border-radius:8px;}',
      '#view-mood .mood-note{border:1px solid var(--line);border-radius:8px;}',
    ].join('\n');
    document.head.appendChild(st);
  }

  // ---- Links: pills instead of the tag dropdown ----
  function buildLinkPills() {
    var view = document.getElementById('view-links');
    if (!view || typeof linkTagItems !== 'function') return;
    var row = document.getElementById('link-tag-pills');
    if (!row) {
      row = document.createElement('div');
      row.className = 'tag-filter-row';
      row.id = 'link-tag-pills';
      var head = view.querySelector('.view-head');
      if (head && head.parentNode) head.parentNode.insertBefore(row, head.nextSibling);
      else view.insertBefore(row, view.firstChild);
      row.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-v]');
        if (!b) return;
        try { linkTag = b.getAttribute('data-v'); loadLinks(); } catch (err) { /* app internals changed */ }
      });
    }
    var cur = '';
    try { cur = linkTag || ''; } catch (e) { cur = ''; }
    var vals = [''].concat(linkTagItems());
    row.innerHTML = '';
    vals.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tag-filter' + (v === cur ? ' active' : '');
      b.setAttribute('data-v', v);
      b.textContent = v === '' ? 'All tags' : v;
      row.appendChild(b);
    });
  }
  function wrapRenderLinks() {
    if (typeof window.renderLinks !== 'function' || window.renderLinks._alignPatched) return;
    var orig = window.renderLinks;
    var wrapped = function () {
      var out = orig.apply(this, arguments);
      try { buildLinkPills(); } catch (e) { /* pills must never break render */ }
      return out;
    };
    wrapped._alignPatched = true;
    window.renderLinks = wrapped;
  }

  // ---- Habits + Long Term: header search filters the rendered cards ----
  function bindCardSearch(inputId, listId, renderFnName) {
    var input = document.getElementById(inputId);
    var list = document.getElementById(listId);
    if (!input || !list) return false;
    var apply = function () {
      var q = input.value;
      Array.prototype.forEach.call(list.children, function (child) {
        child.style.display = alignTextMatch(child.textContent, q) ? '' : 'none';
      });
    };
    if (!input.hasAttribute('data-align-bound')) {
      input.setAttribute('data-align-bound', '1');
      input.addEventListener('input', apply);
    }
    var fn = window[renderFnName];
    if (typeof fn === 'function' && !fn._alignPatched) {
      var wrapped = async function () {
        var out = await fn.apply(this, arguments);
        try { apply(); } catch (e) { /* filter must never break render */ }
        return out;
      };
      wrapped._alignPatched = true;
      window[renderFnName] = wrapped;
    }
    return true;
  }

  var alignAttempts = 0;
  function tryAlignInit() {
    alignAttempts++;
    var ready = document.getElementById('view-links') &&
      typeof window.renderLinks === 'function' &&
      typeof window.renderHabits === 'function' &&
      typeof window.renderLongTerm === 'function';
    if (!ready) {
      if (alignAttempts < 100) setTimeout(tryAlignInit, 200);
      return;
    }
    try {
      injectAlignStyles();
      wrapRenderLinks();
      buildLinkPills();
      bindCardSearch('habit-search', 'habit-list', 'renderHabits');
      bindCardSearch('lt-search', 'lt-grid', 'renderLongTerm');
    } catch (e) { /* alignment is cosmetic; never break the app */ }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryAlignInit);
    else tryAlignInit();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { alignTextMatch: alignTextMatch };
  }
})();
