// Long Term checkbox wiring patch.
// The f-longterm checkbox exists in site/index.html (card edit modal) but
// site/app.js (127KB) exceeds the API push size limit, so the wiring lives
// here. This patches the global api() to sync the 'longterm' tag based on
// the checkbox state, and sets the checkbox when the edit modal opens.
// TODO: Fold into site/app.js when pushing large files is supported.
(function() {
'use strict';

function syncCheckboxFromCard() {
  // Called after openModal populates the form. We don't have the card object,
  // so we find it via the editingId global.
  try {
    if (typeof editingId === 'undefined' || editingId == null) {
      const cb = document.getElementById('f-longterm');
      if (cb) cb.checked = false;
      return;
    }
    const cardsList = (typeof cards !== 'undefined') ? cards : [];
    const c = cardsList.find((x) => String(x.id) === String(editingId));
    const cb = document.getElementById('f-longterm');
    if (cb) cb.checked = !!(c && (c.tags || []).includes('longterm'));
  } catch (e) {
    console.error('[longterm-patch] syncCheckbox failed:', e);
  }
}

// Wrap openModal to sync the checkbox after the form is populated.
function wrapOpenModal() {
  if (typeof window.openModal !== 'function' || window.openModal._ltPatched) return;
  const orig = window.openModal;
  window.openModal = function(c) {
    const r = orig.apply(this, arguments);
    // Defer to ensure the modal DOM is populated
    setTimeout(syncCheckboxFromCard, 0);
    return r;
  };
  window.openModal._ltPatched = true;
}

// Wrap api() to inject/remove the 'longterm' tag on card saves.
// IMPORTANT: Only touch tags when the caller explicitly sent a tags array
// (e.g. the card edit form). Habit check-ins PATCH only {details} — wiping
// tags there would strip the 'habit' tag and make habits vanish.
function wrapApi() {
  if (typeof window.api !== 'function' || window.api._ltPatched) return;
  const origApi = window.api;
  window.api = async function(method, path, body) {
    if (body && typeof body === 'object' && Array.isArray(body.tags) &&
        /^\/api\/app\?r=cards/.test(path)) {
      const cb = document.getElementById('f-longterm');
      if (cb) {
        const tags = body.tags.slice();
        const hasLt = tags.includes('longterm');
        if (cb.checked && !hasLt) tags.push('longterm');
        if (!cb.checked && hasLt) {
          const i = tags.indexOf('longterm');
          tags.splice(i, 1);
        }
        body.tags = tags;
      }
    }
    return origApi.apply(this, arguments);
  };
  window.api._ltPatched = true;
}

function init() {
  // app.js defines openModal and api as globals; retry until available
  if (typeof window.openModal === 'undefined' || typeof window.api === 'undefined') {
    setTimeout(init, 200);
    return;
  }
  wrapOpenModal();
  wrapApi();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();
