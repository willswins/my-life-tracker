// Add "Move to Long Term" action to task cards
(function() {
  function init() {
    // Use event delegation on the board
    document.addEventListener('click', async function(e) {
      var btn = e.target.closest('[data-act="to-longterm"]');
      if (!btn) return;
      e.stopPropagation();
      var cardEl = btn.closest('[data-card-id]');
      if (!cardEl) return;
      var id = cardEl.getAttribute('data-card-id');
      try {
        // Get current tags, add longterm
        var card = null;
        if (typeof cards !== 'undefined') {
          card = cards.find(function(c) { return c.id === id; });
        }
        var tags = ((card && card.tags) || []).slice();
        if (tags.indexOf('longterm') === -1) tags.push('longterm');
        await api('PATCH', '/api/app?r=cards&id=' + encodeURIComponent(id), { tags: tags });
        if (card) card.tags = tags;
        if (typeof toast === 'function') toast('Moved to Long Term');
        // Re-render current view
        if (typeof switchView === 'function' && typeof currentView !== 'undefined') {
          switchView(currentView, false);
        }
      } catch (err) {
        if (typeof toast === 'function') toast('Could not move. Please try again.');
      }
    });

    // Inject the button into card actions via MutationObserver
    var obs = new MutationObserver(function() { injectButtons(); });
    obs.observe(document.body, { childList: true, subtree: true });
    injectButtons();
  }

  function injectButtons() {
    document.querySelectorAll('.card .actions:not([data-lt-injected])').forEach(function(actions) {
      // Skip if already has the button or if it's a longterm card
      var cardEl = actions.closest('[data-card-id]');
      if (!cardEl) return;
      actions.setAttribute('data-lt-injected', '1');
      var btn = document.createElement('button');
      btn.setAttribute('data-act', 'to-longterm');
      btn.title = 'Move to Long Term';
      btn.textContent = '→ Long Term';
      // Insert before the Edit button if present
      var editBtn = actions.querySelector('[data-act="edit"]');
      if (editBtn) actions.insertBefore(btn, editBtn);
      else actions.appendChild(btn);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
