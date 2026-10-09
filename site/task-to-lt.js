// Add "→ Long Term" button to task cards by wrapping cardEl and act
(function() {
  function init() {
    if (typeof cardEl === 'undefined' || typeof act === 'undefined') {
      setTimeout(init, 200);
      return;
    }

    // Patch act() to handle 'to-longterm'
    const _act = window.act;
    window.act = async function(id, action) {
      if (action === 'to-longterm') {
        try {
          const all = await api('GET', '/api/app?r=cards');
          const card = all.find(function(c) { return String(c.id) === String(id); });
          if (!card) { if (typeof toast === 'function') toast('Card not found'); return; }
          const tags = (card.tags || []).slice();
          if (tags.indexOf('longterm') === -1) tags.push('longterm');
          await api('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(id), { tags: tags });
          if (typeof toast === 'function') toast('Moved to Long Term');
          if (typeof render === 'function') render();
        } catch (e) {
          if (typeof toast === 'function') toast('Could not move. Please try again.');
        }
        return;
      }
      return _act.call(this, id, action);
    };

    // Wrap cardEl to inject the button
    const _cardEl = window.cardEl;
    window.cardEl = function(c) {
      const el = _cardEl(c);
      const actions = el.querySelector('.actions');
      // Skip deleted cards (have restore button) and already-injected
      if (actions && !actions.querySelector('[data-act="restore"]') && !actions.querySelector('[data-act="to-longterm"]')) {
        const btn = document.createElement('button');
        btn.setAttribute('data-act', 'to-longterm');
        btn.title = 'Move to Long Term';
        btn.textContent = '\u2192 Long Term';
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          window.act(c.id, 'to-longterm');
        });
        const editBtn = actions.querySelector('[data-act="edit"]');
        if (editBtn) actions.insertBefore(btn, editBtn);
        else actions.appendChild(btn);
      }
      return el;
    };

    // Re-render to apply to existing cards
    if (typeof render === 'function') {
      try { render(); } catch (e) {}
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
