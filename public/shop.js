// Shop — one plain grocery list.
// Items are not assigned to any store (Winny, 2026-10-25); the store
// finder is removed too. Specials lines still show best prices per item.
// Data: dedicated DB table — shop_items, via
// /api/app?r=daybook&view=shop (migration-008). Shop_stores rows remain in
// the DB but are unused. Catalog prices for non-grocery items arrive via
// shop_deals rows (same API), refreshed by the shop watch, and render
// inline like ad specials. Items are database rows,
// never code and never board cards. The api() wrapper below still strips
// any legacy shop cards (gstore/gitem) from other views during transition.
// Loads after app.js.
(function() {
'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Legacy card tags — used only by the transition filter that keeps any
// pre-migration shop cards off My Board. New data never writes cards.
var STORE_TAG = 'gstore';
var ITEM_TAG = 'gitem';

var SHOP_API = '/api/app?r=daybook&view=shop';


// ---------------------------------------------------------------------------
// Pure helpers (exposed on window.Shop for testing)
// ---------------------------------------------------------------------------


// Flat list order (no store layout, no walking route — Winny, 2026-10-25):
// unchecked first, then alphabetical; checked items last.
function sortShopItems(items) {
  return items.slice().sort(function(a, b) {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    return String(a.name).localeCompare(String(b.name));
  });
}

// ---------------------------------------------------------------------------
// Sections — basic categorization, display-only grouping (Winny, 2026-10-25).
// Two sources: instant keyword rules from the item name (this file), and the
// stored item.category (set by the watch from online catalog categories for
// items the keywords miss). Keywords win; stored category is the fallback;
// anything else lands in Others, always last. This is NOT zones, walking
// order, or store assignment — those stay removed.
// ---------------------------------------------------------------------------
var SECTION_ORDER = ['Produce', 'Dairy & Eggs', 'Bakery', 'Meat & Deli', 'Pantry', 'Frozen', 'Snacks & Drinks', 'Household', 'Personal Care', 'Electronics', 'Others'];

var SECTION_WORDS = {
  'Produce': ['banana', 'apple', 'mango', 'orange', 'lemon', 'lime', 'grape', 'grapefruit', 'strawberry', 'blueberry', 'raspberry', 'blackberry', 'cherry', 'plum', 'pear', 'melon', 'watermelon', 'cantaloupe', 'pineapple', 'kiwi', 'avocado', 'tomato', 'potato', 'onion', 'garlic', 'carrot', 'celery', 'cucumber', 'lettuce', 'spinach', 'kale', 'broccoli', 'cauliflower', 'cabbage', 'pepper', 'zucchini', 'squash', 'eggplant', 'corn', 'pea', 'bean', 'mushroom', 'beet', 'radish', 'turnip', 'yam', 'ginger', 'basil', 'cilantro', 'parsley', 'mint', 'dill', 'rosemary', 'thyme', 'oregano', 'leaf', 'leaves', 'herb', 'fruit', 'vegetable', 'veggie', 'produce', 'salad'],
  'Dairy & Eggs': ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'egg'],
  'Bakery': ['bread', 'bagel', 'muffin', 'croissant', 'tortilla', 'bun', 'roll', 'donut', 'doughnut', 'cake'],
  'Meat & Deli': ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'fish', 'salmon', 'tuna', 'shrimp', 'crab', 'lobster', 'sausage', 'bacon', 'ham', 'steak', 'chop', 'breast', 'thigh', 'wing', 'leg', 'loin', 'fillet', 'rib', 'meat', 'seafood', 'deli'],
  'Pantry': ['rice', 'pasta', 'noodle', 'flour', 'sugar', 'salt', 'oil', 'vinegar', 'sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'dressing', 'jam', 'jelly', 'honey', 'syrup', 'cereal', 'oatmeal', 'oats', 'granola', 'soup', 'broth', 'stock', 'gravy', 'marinade', 'seasoning', 'spice', 'cocoa', 'vanilla', 'cinnamon', 'coffee', 'tea', 'hummus', 'salsa', 'guacamole', 'dip', 'applesauce', 'pancake', 'waffle'],
  'Frozen': ['frozen', 'ice'],
  'Snacks & Drinks': ['juice', 'soda', 'water', 'lemonade', 'chip', 'cracker', 'pretzel', 'popcorn', 'candy', 'chocolate', 'snack', 'cookie', 'nut', 'peanut', 'almond', 'walnut', 'cashew', 'pistachio'],
  'Household': ['towel', 'tissue', 'paper', 'detergent', 'soap', 'trash', 'bag', 'cleaner', 'bleach', 'sponge', 'foil', 'wrap', 'napkin', 'plate', 'bulb', 'battery', 'vacuum', 'mop', 'broom', 'light'],
  'Personal Care': ['shampoo', 'conditioner', 'toothpaste', 'toothbrush', 'lotion', 'deodorant', 'razor', 'sunscreen', 'vitamin', 'medicine', 'wash'],
  'Electronics': ['macbook', 'mac', 'notebook', 'laptop', 'computer', 'phone', 'iphone', 'ipad', 'tablet', 'tv', 'monitor', 'keyboard', 'mouse', 'headphones', 'earbuds', 'airpods', 'charger', 'cable', 'camera', 'printer', 'router', 'speaker', 'console', 'watch', 'drone', 'kindle', 'pixel', 'galaxy']
};

var SECTION_WORD_MAP = {};
Object.keys(SECTION_WORDS).forEach(function(sec) {
  SECTION_WORDS[sec].forEach(function(w) { SECTION_WORD_MAP[w] = sec; });
});

function shopSingular(w) {
  if (w.length > 4 && w.slice(-3) === 'ies') return w.slice(0, -3) + 'y';
  if (w.length > 3 && (w.slice(-4) === 'ches' || w.slice(-4) === 'shes' || w.slice(-4) === 'sses' || w.slice(-3) === 'xes' || w.slice(-3) === 'zes' || w.slice(-3) === 'oes')) return w.slice(0, -2);
  if (w.length > 3 && w.slice(-1) === 's') return w.slice(0, -1);
  return w;
}

// Section for one item. Phrase rules first, then the head noun (last word),
// scanning right-to-left, then the stored category, else Others.
function shopSectionFor(name, stored) {
  var lower = String(name || '').toLowerCase();
  if (lower.indexOf('ice cream') !== -1) return 'Frozen';
  if (lower.indexOf('hot dog') !== -1) return 'Meat & Deli';
  var words = lower.match(/[a-z0-9]+/g) || [];
  if (words.indexOf('frozen') !== -1) return 'Frozen';
  for (var i = words.length - 1; i >= 0; i--) {
    var sec = SECTION_WORD_MAP[words[i]] || SECTION_WORD_MAP[shopSingular(words[i])];
    if (sec) return sec;
  }
  if (stored && stored !== 'Other' && SECTION_ORDER.indexOf(stored) !== -1) return stored;
  return 'Others';
}

function groupShopItems(items) {
  var buckets = {};
  items.forEach(function(it) {
    var sec = shopSectionFor(it.name, it.category);
    (buckets[sec] = buckets[sec] || []).push(it);
  });
  return SECTION_ORDER.filter(function(sec) { return buckets[sec] && buckets[sec].length; })
    .map(function(sec) { return { section: sec, items: buckets[sec] }; });
}

// ---------------------------------------------------------------------------
// API layer — keep a raw reference so our own calls bypass the shop filter
// ---------------------------------------------------------------------------


var rawApi = null;

function shopApi(method, path, body) {
  var fn = rawApi || window.api;
  if (typeof fn !== 'function') return Promise.reject(new Error('API not available'));
  return fn.call(window, method, path, body);
}

// Strip shop cards from GET r=cards responses for every other consumer
// (board, badges, other views). Our own calls use rawApi.
function installApiFilter() {
  if (typeof window.api !== 'function' || window.api._shopFiltered) return;
  var inner = window.api;
  rawApi = inner;
  var wrapped = async function(method, path, body) {
    var res = await inner.apply(this, arguments);
    if (method === 'GET' && /r=cards/.test(path) && Array.isArray(res)) {
      return res.filter(function(c) {
        var tags = c.tags || [];
        return tags.indexOf(STORE_TAG) === -1 && tags.indexOf(ITEM_TAG) === -1;
      });
    }
    return res;
  };
  wrapped._shopFiltered = true;
  window.api = wrapped;
}

// Purge any shop cards that reached the global `cards` array before this
// script loaded (app.js boots first), so the board never shows them.
function purgeGlobalCards() {
  try {
    if (typeof cards !== 'undefined' && Array.isArray(cards)) {
      for (var i = cards.length - 1; i >= 0; i--) {
        var tags = cards[i].tags || [];
        if (tags.indexOf(STORE_TAG) !== -1 || tags.indexOf(ITEM_TAG) !== -1) {
          cards.splice(i, 1);
        }
      }
    }
  } catch (e) { /* global not ready yet */ }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------


function rowToItem(row) {
  return {
    id: row.id,
    name: row.name || '',
    cat: row.category || 'Other',
    category: row.category || 'Other',
    list_id: row.list_id || null,
    qty: row.qty || '',
    done: !!row.done
  };
}

var shopItems = [];
var shopDeals = {};
var shopLists = [];
var shopCurrentListId = null;

// Multiple lists (Winny, 2026-10-25): one default list plus user-named
// lists. Pure helpers (exported for tests); the stateful current list is
// resolved on load and persisted in localStorage. A null current id means
// legacy single-list mode (the server returned no lists).
function shopResolveListId(lists, storedId) {
  if (!lists || !lists.length) return null;
  if (storedId && lists.some(function(l) { return String(l.id) === String(storedId); })) return storedId;
  var d = lists.filter(function(l) { return l.is_default; })[0];
  return d ? d.id : lists[0].id;
}
function shopDefaultId() {
  return shopResolveListId(shopLists, null);
}
function shopItemListId(it, defaultId) {
  return (it && it.list_id) || defaultId || null;
}
function shopVisibleItems(items, currentId, defaultId) {
  if (currentId == null) return items;
  return items.filter(function(it) { return shopItemListId(it, defaultId) === currentId; });
}
function shopResolveCurrentList() {
  var stored = null;
  try { stored = localStorage.getItem('shopCurrentListId'); } catch (e) {}
  shopCurrentListId = shopResolveListId(shopLists, stored);
}
function shopSaveCurrentList() {
  try { localStorage.setItem('shopCurrentListId', shopCurrentListId); } catch (e) {}
}

async function loadShopData() {
  var data = await shopApi('GET', SHOP_API);
  data = (data && typeof data === 'object') ? data : {};
  shopItems = (Array.isArray(data.items) ? data.items : []).map(rowToItem);
  shopLists = Array.isArray(data.lists) ? data.lists : [];
  shopResolveCurrentList();
  shopDeals = {};
  (Array.isArray(data.deals) ? data.deals : []).forEach(function(d) {
    if (d.item_key) shopDeals[String(d.item_key).trim().toLowerCase()] = d.sellers || [];
  });
}


// Menu badge + home tile: unchecked items across all lists.
// Reuses app.js setBadge() so the bubble behaves like the other menu badges.
function updateShopBadge() {
  if (!shopLoaded) return;
  var n = shopItems.filter(function(it) { return !it.done; }).length;
  var badgeEl = document.getElementById('badge-shop');
  if (badgeEl && typeof setBadge === 'function') setBadge('badge-shop', n, false);
  var homeEl = document.getElementById('home-shop');
  if (homeEl) homeEl.textContent = n;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


function renderShop() {
  var rootEl = document.getElementById('shop-root');
  if (!rootEl) return;
  if (!shopLoaded) {
    rootEl.innerHTML = '<p class="empty-note">Loading…</p>';
    return;
  }
  var defaultId = shopDefaultId();
  var items = sortShopItems(shopVisibleItems(shopItems, shopCurrentListId, defaultId));
  var spReady = specialsState.key === specialsItemKey() && !!specialsState.byItem;
  var doneCount = items.filter(function(it) { return it.done; }).length;

  var h = '';

  if (shopLists.length) {
    h += '<div class="shop-lists">';
    h += '<select id="shop-list-select">';
    shopLists.forEach(function(l) {
      var n = shopItems.filter(function(it) { return !it.done && shopItemListId(it, defaultId) === l.id; }).length;
      h += '<option value="' + esc(l.id) + '"' + (String(l.id) === String(shopCurrentListId) ? ' selected' : '') + '>' + esc(l.name) + ' (' + n + ')</option>';
    });
    h += '</select>';
    h += '<button type="button" id="shop-new-list-btn" class="shop-btn">+ New list</button>';
    var curList = shopLists.filter(function(l) { return String(l.id) === String(shopCurrentListId); })[0];
    if (curList && !curList.is_default) h += '<button type="button" id="shop-del-list-btn" class="shop-btn danger-btn">Delete list</button>';
    h += '</div>';
    h += '<div id="shop-new-list-form" class="shop-new-list" style="display:none">';
    h += '<input id="shop-new-list-name" type="text" maxlength="80" placeholder="List name…" autocomplete="off">';
    h += '<button type="button" id="shop-new-list-add" class="primary">Add</button>';
    h += '<button type="button" id="shop-new-list-cancel" class="shop-btn">Cancel</button>';
    h += '</div>';
  }

  h += '<form id="shop-add-form" class="shop-add">';
  h += '<input id="shop-new-name" type="text" maxlength="80" placeholder="Add an item…" autocomplete="off">';
  h += '<input id="shop-new-qty" type="text" maxlength="12" placeholder="Qty" autocomplete="off">';
  h += '<button type="submit" class="primary">Add</button>';
  h += '</form>';

  if (!items.length) {
    h += '<p class="empty-note">Your list is empty. Add items above.</p>';
  } else {
    h += '<div class="shop-progress"><div class="shop-progress-bar" style="width:' +
      Math.round(doneCount / items.length * 100) + '%"></div></div>';
    h += '<p class="shop-progress-text">' + doneCount + ' of ' + items.length + ' picked</p>';
    h += '<div class="shop-list">';
    groupShopItems(items).forEach(function(g) {
      h += '<div class="shop-section-header">' + esc(g.section) + '<span class="shop-section-count">' + g.items.length + '</span></div>';
      g.items.forEach(function(it) {
        h += '<label class="shop-item' + (it.done ? ' done' : '') + '">';
        h += '<input type="checkbox" class="shop-check" data-id="' + esc(it.id) + '"' + (it.done ? ' checked' : '') + '>';
        h += '<span class="shop-item-main"><span class="shop-item-name">' + esc(it.name) + '</span>';
        if (!it.done && spReady) {
          var spLine = specialsLineFor(it.name);
          if (spLine) h += '<span class="shop-item-special">' + spLine + '</span>';
        }
        h += '</span>';
        if (it.qty) h += '<span class="shop-item-qty">' + esc(it.qty) + '</span>';
        h += '<button type="button" class="shop-del" data-id="' + esc(it.id) + '" title="Remove">×</button>';
        h += '</label>';
      });
    });
    h += '</div>';
    h += '<div class="shop-actions">';
    h += '<button type="button" id="shop-clear-done" class="shop-btn">Clear picked</button>';
    h += '<button type="button" id="shop-clear-all" class="shop-btn danger-btn">Clear list</button>';
    h += '</div>';
  }
  rootEl.innerHTML = h;
  wireShop(rootEl);
  updateSpecialsInline();
  updateShopBadge();
}


function wireShop(rootEl) {

  var form = rootEl.querySelector('#shop-add-form');
  if (form) {
    var nameInput = form.querySelector('#shop-new-name');
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      if (form.dataset.adding) return;
      var name = nameInput.value.trim();
      if (!name) return;
      form.dataset.adding = '1';
      try {
        await addShopItem(name, form.querySelector('#shop-new-qty').value.trim());
      } finally {
        delete form.dataset.adding;
      }
      var ni = document.getElementById('shop-new-name');
      if (ni) ni.focus();
    });
  }

  rootEl.querySelectorAll('.shop-check').forEach(function(cb) {
    cb.addEventListener('change', function() {
      toggleShopItem(cb.dataset.id, cb.checked);
    });
  });
  rootEl.querySelectorAll('.shop-del').forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      e.preventDefault();
      var id = btn.dataset.id;
      shopItems = shopItems.filter(function(x) { return String(x.id) !== String(id); });
      renderShop();
      try { await shopApi('DELETE', SHOP_API + '&kind=item&id=' + encodeURIComponent(id)); } catch (err) {}
    });
  });
  var clearDone = rootEl.querySelector('#shop-clear-done');
  if (clearDone) clearDone.addEventListener('click', async function() {
    var done = shopVisibleItems(shopItems, shopCurrentListId, shopDefaultId()).filter(function(it) { return it.done; });
    var doneIds = {};
    done.forEach(function(it) { doneIds[String(it.id)] = true; });
    for (var i = 0; i < done.length; i++) {
      try { await shopApi('DELETE', SHOP_API + '&kind=item&id=' + encodeURIComponent(done[i].id)); } catch (e) {}
    }
    shopItems = shopItems.filter(function(it) { return !doneIds[String(it.id)]; });
    renderShop();
    if (typeof toast === 'function') toast('Picked items cleared');
  });
  var clearAll = rootEl.querySelector('#shop-clear-all');
  if (clearAll) clearAll.addEventListener('click', async function() {
    if (!clearAll.dataset.armed) {
      clearAll.dataset.armed = '1';
      clearAll.textContent = 'Tap again to clear this list';
      setTimeout(function() { delete clearAll.dataset.armed; clearAll.textContent = 'Clear list'; }, 4000);
      return;
    }
    delete clearAll.dataset.armed;
    var mine = shopVisibleItems(shopItems, shopCurrentListId, shopDefaultId());
    var mineIds = {};
    mine.forEach(function(it) { mineIds[String(it.id)] = true; });
    for (var i = 0; i < mine.length; i++) {
      try { await shopApi('DELETE', SHOP_API + '&kind=item&id=' + encodeURIComponent(mine[i].id)); } catch (e) {}
    }
    shopItems = shopItems.filter(function(it) { return !mineIds[String(it.id)]; });
    renderShop();
  });

  var listSel = rootEl.querySelector('#shop-list-select');
  if (listSel) listSel.addEventListener('change', function() {
    shopCurrentListId = listSel.value;
    shopSaveCurrentList();
    renderShop();
  });
  var newListBtn = rootEl.querySelector('#shop-new-list-btn');
  var newListForm = rootEl.querySelector('#shop-new-list-form');
  if (newListBtn && newListForm) {
    newListBtn.addEventListener('click', function() {
      newListForm.style.display = 'flex';
      var ni = rootEl.querySelector('#shop-new-list-name');
      if (ni) ni.focus();
      newListBtn.style.display = 'none';
    });
    var newListCancel = rootEl.querySelector('#shop-new-list-cancel');
    if (newListCancel) newListCancel.addEventListener('click', function() {
      newListForm.style.display = 'none';
      newListBtn.style.display = '';
    });
    var newListAdd = rootEl.querySelector('#shop-new-list-add');
    if (newListAdd) newListAdd.addEventListener('click', async function() {
      var ni = rootEl.querySelector('#shop-new-list-name');
      var name = ni ? ni.value.trim() : '';
      if (!name) return;
      try {
        var created = await shopApi('POST', SHOP_API, { kind: 'list', name: name });
        if (created && created.id) {
          shopLists.push(created);
          shopCurrentListId = created.id;
          shopSaveCurrentList();
        }
        renderShop();
      } catch (e) {
        if (typeof toast === 'function') toast('Could not create that list. Please try again.');
      }
    });
  }
  var delListBtn = rootEl.querySelector('#shop-del-list-btn');
  if (delListBtn) delListBtn.addEventListener('click', async function() {
    if (!delListBtn.dataset.armed) {
      delListBtn.dataset.armed = '1';
      delListBtn.textContent = 'Tap again to delete this list';
      setTimeout(function() { delete delListBtn.dataset.armed; delListBtn.textContent = 'Delete list'; }, 4000);
      return;
    }
    delete delListBtn.dataset.armed;
    var id = shopCurrentListId;
    var def = shopDefaultId();
    try { await shopApi('DELETE', SHOP_API + '&kind=list&id=' + encodeURIComponent(id)); } catch (e) {}
    shopLists = shopLists.filter(function(l) { return String(l.id) !== String(id); });
    shopItems = shopItems.filter(function(it) { return shopItemListId(it, def) !== id; });
    shopCurrentListId = def;
    shopSaveCurrentList();
    renderShop();
  });
}

async function toggleShopItem(id, done) {
  var it = shopItems.find(function(x) { return String(x.id) === String(id); });
  if (!it) return;
  it.done = done;
  try {
    await shopApi('PATCH', SHOP_API + '&kind=item&id=' + encodeURIComponent(it.id), { done: it.done });
  } catch (e) { /* keep local state; next load resyncs */ }
  renderShop();
}

async function addShopItem(name, qty) {
  var defaultId = shopDefaultId();
  var dup = shopItems.some(function(x) {
    return !x.done &&
      x.name.trim().toLowerCase() === name.trim().toLowerCase() &&
      shopItemListId(x, defaultId) === shopCurrentListId;
  });
  if (dup) {
    if (typeof toast === 'function') toast('Already on your list');
    return;
  }
  var item = { name: name, qty: qty || '', done: false };
  try {
    var body = {
      kind: 'item',
      name: item.name, qty: item.qty, done: false
    };
    if (shopCurrentListId) body.list_id = shopCurrentListId;
    var created = await shopApi('POST', SHOP_API, body);
    item.id = created.id;
    item.list_id = created.list_id || shopCurrentListId || null;
    item.category = created.category || 'Other';
    shopItems.push(item);
    renderShop();
  } catch (e) {
    if (typeof toast === 'function') toast('Could not add that item. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// Specials — automatic, no button (Winny, 2026-10-23). Whenever the Shop
// view shows the list, this checks the unchecked items against this week's
// weekly ads from nearby chains and renders one line under each item:
// its BEST price across all chains (no distance cap, not anchored on the
// preferred store), with up to 3 stores shown, best first (Winny, 2026-10-24).
// Deals are parsed from the public ad listings and cached for 12h.
// ---------------------------------------------------------------------------

var SPECIALS_SOURCES = [
  { store: 'Harris Teeter', site: 'www.southernsavers.com', search: 'harris teeter', hint: 'harris-teeter-weekly-ad', mode: 'list', coverage: 'full ad list' },
  { store: 'Publix', site: 'www.iheartpublix.com', search: 'publix ad coupons', hint: 'publix-ad-coupons', mode: 'list', coverage: 'full ad list' },
  { store: 'Publix', site: 'weeklyadguide.com', search: 'publix weekly ad', hint: 'publix-weekly-ad', mode: 'prose', coverage: 'highlights only', fallback: true },
  { store: 'Food Lion', site: 'www.southernsavers.com', search: 'food lion', hint: 'food-lion-ad', mode: 'list', coverage: 'full ad list' },
  { store: 'Lowes Foods', site: 'www.southernsavers.com', search: 'lowes foods', hint: 'lowes-foods-weekly-ad', mode: 'list', coverage: 'full ad list' },
  { store: 'Target', site: 'www.southernsavers.com', search: 'target', hint: 'target-weekly-ad', mode: 'list', coverage: 'full ad list', sunday: true },
  { store: 'Walmart', site: 'www.southernsavers.com', search: 'walmart', hint: 'walmart-ad-deals', mode: 'list', coverage: 'full ad list' },
  { store: 'Aldi', site: 'weeklyadguide.com', search: 'aldi weekly ad', hint: 'aldi-weekly-ad', mode: 'prose', coverage: 'highlights only' }
];
var specialsState = { key: '', byItem: null, loading: false };

function specialsItemKey() {
  var names = {};
  shopItems.forEach(function(it) {
    if (!it.done) names[it.name.trim().toLowerCase()] = it.name.trim();
  });
  return Object.keys(names).sort().join('|');
}

function specialsCleanText(frag) {
  var div = document.createElement('div');
  div.innerHTML = frag || '';
  return (div.textContent || '').replace(/\s+/g, ' ').replace(/^[\s*\-•]+/, '').trim();
}

var SPECIALS_PRICE_HINT = /(\$\s?\d|\d\s?¢|\d+\.\d{2}|BOGO|buy[ -]one[ -]get|buy[ -]two[ -]get|buy 1 get|buy 2 get|get[ -]one[ -]free|% off|\d+ for \$\d)/i;
var SPECIALS_COUPON_CUT = /\s(-\$|-\d+\s?\/|-?\d+ points WYB|"Manufacturer|\(use |\(buy \(|\(makes it (a|\$?\d+.*after))/i;

function specialsParseDeals(contentHtml, mode) {
  var deals = [];
  if (mode === 'list') {
    var section = '';
    var re = /<h\d[^>]*>([\s\S]*?)<\/h\d>|<li[^>]*>([\s\S]*?)<\/li>/gi;
    var m;
    while ((m = re.exec(contentHtml)) !== null) {
      if (m[1] !== undefined) { section = specialsCleanText(m[1]); continue; }
      var text = specialsCleanText(m[2] || '');
      if (text.length < 6 || !SPECIALS_PRICE_HINT.test(text)) continue;
      var cut = SPECIALS_COUPON_CUT.exec(text);
      if (cut) text = text.slice(0, cut.index).replace(/[ ,]+$/, '');
      if (text.length < 6) continue;
      deals.push({ text: text.slice(0, 170), section: section,
        bogo: /buy one get|buy two get|buy 1 get|buy 2 get|BOGO/i.test(text + ' ' + section) });
    }
  } else {
    specialsCleanText(contentHtml).split(/(?<=[.!?])\s+/).forEach(function(sent) {
      sent = sent.trim();
      if (sent.length < 12 || !SPECIALS_PRICE_HINT.test(sent)) return;
      deals.push({ text: sent.slice(0, 220), section: '',
        bogo: /buy[ -]one[ -]get|BOGO|get[ -]one[ -]free/i.test(sent) });
    });
  }
  return deals;
}

var SPECIALS_STOP = { fresh: 1, big: 1, pack: 1, set: 1, non: 1, white: 1, pkts: 1, pkt: 1, ct: 1, oz: 1, lb: 1, the: 1, for: 1, if: 1, available: 1 };
var SPECIALS_GENERIC = { frozen: 1, canned: 1, organic: 1, snack: 1, snacks: 1, water: 1, juice: 1, soda: 1 };
var SPECIALS_DENY = [['orange', 'orange juice'], ['orange', 'bell pepper'], ['orange', 'pepper'],
  ['bread', 'snack bar'], ['bread', 'bread pan'], ['bread', 'loaf pan'], ['bread', 'cast-iron'],
  ['bread', 'bagel'], ['bread', 'muffin']];
var SPECIALS_NONFOOD = { dog: 1, cat: 1, pet: 1, toothpaste: 1, medicine: 1, lego: 1, toy: 1, nail: 1, shampoo: 1, lotion: 1, vitamin: 1, book: 1 };
// Item tokens that are tech/brand fragments, not grocery words (Winny,
// 2026-10-24: 'Mac book pro' matched Mac & Cheese on 'mac' and a PRO
// cooker on 'pro'). Stripped from an item's strong tokens before scoring.
// Deliberately NOT 'apple' (fruit) or 'mini' (mini peppers).
var SPECIALS_TECH = { mac: 1, macbook: 1, pro: 1, book: 1, laptop: 1, notebook: 1,
  computer: 1, phone: 1, iphone: 1, ipad: 1, tablet: 1, tv: 1, monitor: 1,
  keyboard: 1, mouse: 1, headphones: 1, earbuds: 1, airpods: 1, camera: 1,
  printer: 1, router: 1, charger: 1, cable: 1, watch: 1, console: 1, speaker: 1,
  drone: 1, kindle: 1, pixel: 1, galaxy: 1, samsung: 1, dell: 1, lenovo: 1, sony: 1 };

function specialsSingular(tok) {
  if (tok.length > 4 && /ies$/.test(tok)) return tok.slice(0, -3) + 'y';
  if (/oes$/.test(tok)) return tok.slice(0, -2);
  if (tok.length > 3 && /s$/.test(tok)) return tok.slice(0, -1);
  return tok;
}

function specialsKeywords(name) {
  var base = name.replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  var toks = base.split(/\s+/).filter(function(t) { return t && !SPECIALS_STOP[t] && !/^\d+$/.test(t); })
    .map(specialsSingular);
  var phrase = (toks.indexOf('ice') >= 0 && toks.indexOf('cream') >= 0) ? 'ice cream' : null;
  var strong = toks.filter(function(t) { return !SPECIALS_GENERIC[t] && !SPECIALS_TECH[t] && t.length >= 3; });
  return { strong: strong, all: toks, phrase: phrase };
}

function specialsMatch(items, deals) {
  var out = {};
  items.forEach(function(item) {
    var kw = specialsKeywords(item);
    if (!kw.strong.length && !kw.phrase) return;
    var scored = [];
    deals.forEach(function(d) {
      var dl = d.text.toLowerCase();
      var itoks = {};
      kw.all.forEach(function(t) { itoks[t] = 1; });
      for (var di = 0; di < SPECIALS_DENY.length; di++) {
        var dTok = SPECIALS_DENY[di][0], dBad = SPECIALS_DENY[di][1];
        if (kw.strong.indexOf(dTok) < 0 || dl.indexOf(dBad) < 0) continue;
        var badInItem = dBad.split(' ').some(function(t) { return itoks[t]; });
        if (!badInItem) return;
      }
      var dtoks = {};
      dl.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).forEach(function(t) { dtoks[specialsSingular(t)] = 1; });
      var nonfood = Object.keys(dtoks).some(function(t) { return SPECIALS_NONFOOD[t] && !itoks[t]; });
      if (nonfood) return;
      if (kw.all.indexOf('juice') >= 0 && dl.indexOf('juice') < 0 && dl.indexOf('cider') < 0) return;
      var score;
      if (kw.phrase) score = dl.indexOf(kw.phrase) >= 0 ? 2 : 0;
      else score = kw.strong.filter(function(t) { return dtoks[t]; }).length;
      if (kw.all.indexOf('popsicle') >= 0 &&
          (dl.indexOf('bomb pops') >= 0 || dl.indexOf('ice pops') >= 0 || dl.indexOf('popsicles') >= 0)) score += 2;
      if (score) scored.push({ score: score, bogo: d.bogo ? 1 : 0, deal: d });
    });
    scored.sort(function(a, b) { return (b.score - a.score) || (b.bogo - a.bogo); });
    if (scored.length) out[item] = scored.slice(0, 3).map(function(s) { return s.deal; });
  });
  return out;
}

function specialsTitleRange(title) {
  var t = (title || '').replace(/&#8211;|&ndash;/g, '-').replace(/&#038;|&amp;/g, '&');
  var m = /(\d{1,2})\/(\d{1,2})\s*[-]\s*(\d{1,2})\/(\d{1,2})/.exec(t);
  if (!m) return null;
  var y = new Date().getFullYear();
  return [new Date(y, +m[1] - 1, +m[2]), new Date(y, +m[3] - 1, +m[4])];
}

function specialsPickPost(posts, hint) {
  var cands = (posts || []).filter(function(p) { return (p.slug || '').indexOf(hint) >= 0; });
  if (!cands.length) return (posts || [])[0] || null;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var i, r;
  for (i = 0; i < cands.length; i++) {
    r = specialsTitleRange(cands[i].title && cands[i].title.rendered);
    if (r && r[0] <= today && today <= r[1]) return cands[i];
  }
  var started = cands.filter(function(p) {
    var rr = specialsTitleRange(p.title && p.title.rendered);
    return rr && rr[0] <= today;
  }).sort(function(a, b) {
    return specialsTitleRange(b.title.rendered)[0] - specialsTitleRange(a.title.rendered)[0];
  });
  return started[0] || cands[0];
}

function specialsSundaySlugs(hint) {
  var d = new Date(); d.setHours(0, 0, 0, 0);
  var sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
  var f = function(x) { return (x.getMonth() + 1) + '-' + x.getDate(); };
  var mk = function(s) { var e = new Date(s); e.setDate(s.getDate() + 6); return hint + '-' + f(s) + '-' + f(e); };
  var prev = new Date(sun); prev.setDate(sun.getDate() - 7);
  return [mk(sun), mk(prev)];
}

async function specialsFetchBySlug(site, slug) {
  var full = await (await fetch('https://' + site + '/wp-json/wp/v2/posts?slug=' +
    encodeURIComponent(slug) + '&_fields=content')).json();
  return full && full[0] && full[0].content && full[0].content.rendered;
}

async function specialsFetchSource(src) {
  if (src.sunday) {
    var guesses = specialsSundaySlugs(src.hint);
    for (var gi = 0; gi < guesses.length; gi++) {
      try {
        var gContent = await specialsFetchBySlug(src.site, guesses[gi]);
        if (gContent) return { deals: specialsParseDeals(gContent, src.mode), coverage: src.coverage };
      } catch (e) { /* try next guess */ }
    }
  }
  var searchUrl = 'https://' + src.site + '/wp-json/wp/v2/posts?search=' +
    encodeURIComponent(src.search) + '&per_page=20&orderby=date&order=desc&_fields=slug,link,title';
  var posts = await (await fetch(searchUrl)).json();
  var post = specialsPickPost(posts, src.hint);
  if (!post) throw new Error('no ad post');
  var content = await specialsFetchBySlug(src.site, post.slug);
  if (!content) throw new Error('empty ad');
  return { deals: specialsParseDeals(content, src.mode), coverage: src.coverage };
}

async function specialsGetDeals() {
  var cache = null;
  try { cache = JSON.parse(localStorage.getItem('shopAdsCacheV2') || 'null'); } catch (e) {}
  if (cache && (Date.now() - cache.ts) < 12 * 3600 * 1000) return cache.sources;
  var sources = {};
  var done = {};
  for (var i = 0; i < SPECIALS_SOURCES.length; i++) {
    var src = SPECIALS_SOURCES[i];
    if (done[src.store]) continue;
    try {
      sources[src.store] = await specialsFetchSource(src);
      done[src.store] = true;
    } catch (e) { /* source unreadable this time; fallbacks follow */ }
  }
  if (Object.keys(sources).length) {
    try { localStorage.setItem('shopAdsCacheV2', JSON.stringify({ ts: Date.now(), sources: sources })); } catch (e) {}
  }
  return sources;
}

// Effective per-unit $ for a deal line, else null (mirrors check_specials
// deal_price). '2 for $5' -> 2.50; BOGO -> half; buy-2-get-1 -> two-thirds.
// Ranking only — the original text is always what gets shown.
function specialsPrice(text) {
  var t = text || '';
  var m = /(\d+)\s+for\s+\$([\d,]+(?:\.\d{2})?)/i.exec(t);
  if (m) return parseFloat(m[2].replace(/,/g, '')) / parseInt(m[1], 10);
  m = /\$([\d,]+(?:\.\d{2})?)/.exec(t);
  if (!m) { var c = /(\d+)\s?¢/.exec(t); return c ? parseInt(c[1], 10) / 100 : null; }
  var p = parseFloat(m[1].replace(/,/g, ''));
  if (/buy[ -]one[ -]get|buy 1 get|BOGO|get[ -]one[ -]free/i.test(t)) p /= 2;
  else if (/buy[ -]two[ -]get|buy 2 get/i.test(t)) p *= 2 / 3;
  return p;
}

function specialsIndexByItem(itemNames, sources) {
  var byItem = {};
  Object.keys(sources).forEach(function(store) {
    var matches = specialsMatch(itemNames, sources[store].deals || []);
    Object.keys(matches).forEach(function(item) {
      var key = item.trim().toLowerCase();
      var list = matches[item];
      var cand = null;
      for (var i = 0; i < list.length; i++) {
        if (specialsPrice(list[i].text) !== null) { cand = list[i]; break; }
      }
      if (!cand) cand = list[0];
      if (!cand) return;
      if (!byItem[key]) byItem[key] = [];
      byItem[key].push({ store: store, text: cand.text, price: specialsPrice(cand.text) });
    });
  });
  // Best price first (unpriced deals last), at most 3 stores per item.
  Object.keys(byItem).forEach(function(key) {
    byItem[key].sort(function(a, b) {
      if (a.price === null && b.price === null) return 0;
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return a.price - b.price;
    });
    byItem[key] = byItem[key].slice(0, 3);
  });
  return byItem;
}

function specialsLineFor(name) {
  if (!specialsState.byItem) return '';
  var entries = specialsState.byItem[name.trim().toLowerCase()];
  if (!entries || !entries.length) return '';
  var best = entries[0];
  var t = best.text.length > 90 ? best.text.slice(0, 90) + '…' : best.text;
  var line = '💲 Best: ' + esc(best.store) + (best.price !== null ? ' $' + best.price.toFixed(2) : '') + ' — ' + esc(t);
  for (var i = 1; i < entries.length; i++) {
    line += ' · also ' + esc(entries[i].store) + (entries[i].price !== null ? ' $' + entries[i].price.toFixed(2) : '');
  }
  return line;
}

// Catalog deals (shop_deals table, refreshed by the shop watch) fill in
// items the weekly ads don't cover. Same {store, text, price} shape, so
// specialsLineFor renders them identically, inline under the item.
// Ads always win when present; deals never override an ad line.
function mergeDealLines(byItem, itemKeys, deals) {
  itemKeys.forEach(function(key) {
    if (byItem[key] && byItem[key].length) return;
    var sellers = deals[key];
    if (!Array.isArray(sellers) || !sellers.length) return;
    var entries = sellers.slice(0, 3).map(function(s) {
      return { store: s.store || '', text: s.text || '', price: (typeof s.price === 'number') ? s.price : null };
    }).filter(function(e) { return e.store; });
    if (entries.length) byItem[key] = entries;
  });
  return byItem;
}

// Recomputes price lines: weekly ads + fresh catalog deals. Deals are
// re-fetched here (not just at page load) so a price the watch wrote a
// minute ago shows on add/toggle without reopening the app. Ad-feed
// failures must not hide deal lines, and vice versa.
async function updateSpecialsInline() {
  var key = specialsItemKey();
  if (!key) return;
  if (specialsState.key === key && specialsState.byItem) return;
  if (specialsState.loading) return;
  specialsState.loading = true;
  try {
    var names = {};
    shopItems.forEach(function(it) { if (!it.done) names[it.name.trim().toLowerCase()] = it.name.trim(); });
    try {
      var fresh = await shopApi('GET', SHOP_API);
      if (fresh && typeof fresh === 'object' && Array.isArray(fresh.deals)) {
        shopDeals = {};
        fresh.deals.forEach(function(d) {
          if (d.item_key) shopDeals[String(d.item_key).trim().toLowerCase()] = d.sellers || [];
        });
      }
    } catch (e2) { /* keep the snapshot; lines still render from ads */ }
    var byItem = {};
    try {
      var sources = await specialsGetDeals();
      byItem = specialsIndexByItem(Object.values(names), sources);
    } catch (e3) { /* ads down: deals still render */ }
    mergeDealLines(byItem, Object.keys(names), shopDeals);
    specialsState = { key: key, byItem: byItem, loading: false };
    if (location.hash === '#/shop' && specialsItemKey() === key) renderShop();
  } catch (e) {
    specialsState.loading = false;
  }
}

// ---------------------------------------------------------------------------
// View registration (same pattern as habit-ui.js)
// ---------------------------------------------------------------------------

var shopLoaded = false;
var shopLoadPromise = null;

async function openShop() {
  purgeGlobalCards();
  if (!shopLoaded) {
    var rootEl = document.getElementById('shop-root');
    if (rootEl) rootEl.innerHTML = '<p class="empty-note">Loading…</p>';
    // Single-flight: concurrent opens (menu click + hashchange) must share
    // one load, or the first-run load fires twice.
    if (!shopLoadPromise) {
      shopLoadPromise = (async function() {
        await loadShopData();
        shopLoaded = true;
      })();
    }
    try {
      await shopLoadPromise;
    } catch (e) {
      shopLoadPromise = null;
      if (rootEl) rootEl.innerHTML = '<p class="empty-note">Could not load your list. Please try again.</p>';
      return;
    }
  }
  // Every Shop open recomputes price lines (ad feeds are cached 12h, so
  // this is cheap): deals the watch wrote since this page loaded show
  // without waiting for a list change.
  specialsState.key = '';
  renderShop();
}

function initShop() {
  if (typeof VIEWS !== 'undefined' && VIEWS.indexOf('shop') === -1) VIEWS.push('shop');
  if (typeof VIEW_IDS !== 'undefined') VIEW_IDS['shop'] = 'view-shop';
  if (typeof VIEW_TITLES !== 'undefined') VIEW_TITLES['shop'] = 'Shop';

  var menuBtn = document.querySelector('[data-view="shop"]');
  if (menuBtn && !menuBtn._shopHooked) {
    menuBtn._shopHooked = true;
    menuBtn.addEventListener('click', function() { setTimeout(openShop, 50); });
  }
  window.addEventListener('hashchange', function() {
    if (location.hash === '#/shop') setTimeout(openShop, 50);
  });
  if (location.hash === '#/shop') setTimeout(openShop, 500);
  // Prefetch so the menu badge + home tile are live before Shop is opened.
  // Shares openShop's single-flight promise; a failed prefetch clears it so
  // opening Shop later retries cleanly.
  if (!shopLoaded && !shopLoadPromise) {
    shopLoadPromise = (async function() {
      await loadShopData();
      shopLoaded = true;
      updateShopBadge();
    })();
    shopLoadPromise.catch(function() { shopLoadPromise = null; });
  }
}

function tryInit() {
  installApiFilter();
  if (typeof VIEWS === 'undefined') {
    setTimeout(tryInit, 200);
    return;
  }
  purgeGlobalCards();
  initShop();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', tryInit);
} else {
  tryInit();
}

// Exposed for testing and debugging.
window.Shop = {
  updateShopBadge: updateShopBadge,
  sortShopItems: sortShopItems,
  specialsKeywords: specialsKeywords,
  specialsMatch: specialsMatch,
  specialsPrice: specialsPrice,
  specialsIndexByItem: specialsIndexByItem,
  mergeDealLines: mergeDealLines,
  shopSectionFor: shopSectionFor,
  groupShopItems: groupShopItems,
  SECTION_ORDER: SECTION_ORDER,
  shopResolveListId: shopResolveListId,
  shopItemListId: shopItemListId,
  shopVisibleItems: shopVisibleItems
};

})();
