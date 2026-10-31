// public/board-min.js — board cards start minimized (Winny, 2026-10-31:
// "By default, I want to see items on my board minimized").
// A minimized card shows the size pill, the title (2 lines max) and the
// due line. Details, tag bubbles and action buttons stay hidden until
// the card is expanded: tap a minimized card to expand it in place (that
// one tap does NOT open the detail modal), tap the chevron on an
// expanded card to minimize it again. Expansion is remembered per card
// for the session only — a fresh load always starts minimized. The
// detail modal, card actions and drag-and-drop are untouched.
(function () {
  'use strict';

  var CSS = [
    '.card{position:relative;}',
    '.card.bmin{cursor:pointer;}',
    '.card.bmin .details{display:none;}',
    '.card.bmin .tag-bubbles{display:none;}',
    '.card.bmin .actions{display:none;}',
    '.card.bmin h3{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
    '.bmin-btn{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:8px;border:0;',
    'background:var(--b-surface2, var(--lane));color:var(--muted);font-size:12px;line-height:1;cursor:pointer;',
    'display:flex;align-items:center;justify-content:center;z-index:2;padding:0;font-family:inherit;}',
  ].join('\n');

  var expanded = {}; // card id -> true, session only

  function isExpanded(id) { return !!expanded[id]; }

  function injectStyle() {
    if (document.getElementById('board-min-style')) return;
    var st = document.createElement('style');
    st.id = 'board-min-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function findCard(el) {
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('card')) return el;
      el = el.parentNode;
    }
    return null;
  }

  function setState(el, id, open) {
    el.classList.toggle('bmin', !open);
    var btn = el.querySelector('.bmin-btn');
    if (btn) {
      btn.textContent = open ? '▴' : '▾';
      btn.title = open ? 'Minimize' : 'Expand';
    }
  }

  function decorate(el, id) {
    el.dataset.cid = id;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bmin-btn';
    btn.setAttribute('aria-label', 'Expand or minimize card');
    el.appendChild(btn);
    setState(el, id, isExpanded(id));
  }

  function wrapCardEl() {
    if (typeof window.cardEl !== 'function') return false;
    if (window.cardEl._bminWrapped) return true;
    var orig = window.cardEl;
    window.cardEl = function (c) {
      var el = orig.apply(this, arguments);
      try { decorate(el, c.id); } catch (e) { /* plain card still works */ }
      return el;
    };
    window.cardEl._bminWrapped = true;
    return true;
  }

  // Capture phase on document: runs before the card's own click handler
  // (which opens the detail modal), so an expanding tap can suppress
  // exactly that one open.
  function onClickCapture(e) {
    var card = findCard(e.target);
    if (!card || !card.dataset.cid) return;
    var id = card.dataset.cid;
    if (e.target.classList && e.target.classList.contains('bmin-btn')) {
      e.stopPropagation();
      e.preventDefault();
      var open = !isExpanded(id);
      expanded[id] = open;
      setState(card, id, open);
      return;
    }
    if (card.classList.contains('bmin')) {
      e.stopPropagation();
      e.preventDefault();
      expanded[id] = true;
      setState(card, id, true);
    }
  }

  function tryInit() {
    injectStyle();
    if (wrapCardEl()) return;
    setTimeout(tryInit, 300);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CSS: CSS, isExpanded: isExpanded, decorate: decorate,
      setState: setState, findCard: findCard, wrapCardEl: wrapCardEl,
      onClickCapture: onClickCapture, injectStyle: injectStyle,
      _setExpanded: function (id, v) { expanded[id] = v; } };
    return;
  }
  document.addEventListener('click', onClickCapture, true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
