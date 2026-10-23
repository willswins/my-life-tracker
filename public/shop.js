// Shop — grocery list with store-layout route optimization.
// Pick a store (preferred, or nearest with a saved location), and your list
// is re-sorted into the order you walk past everything — no backtracking.
// Data: dedicated DB tables — shop_stores / shop_items, via
// /api/app?r=daybook&view=shop (migration-008). Items are database rows,
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

var CATEGORIES = [
  'Produce', 'Bakery', 'Meat & Deli', 'Dairy & Eggs', 'Pantry',
  'Snacks & Drinks', 'Frozen', 'Household', 'Personal Care', 'Other'
];

// Standard grocery walk order: fresh first, cold last before checkout.
var TEMPLATE_ZONES = [
  ['Produce', 'Front'],
  ['Bakery', 'Front'],
  ['Meat & Deli', 'Back wall'],
  ['Pantry', 'Aisles 1-4'],
  ['Snacks & Drinks', 'Aisles 5-6'],
  ['Household', 'Aisles 7-8'],
  ['Personal Care', 'Aisle 9'],
  ['Dairy & Eggs', 'Back'],
  ['Frozen', 'Last aisles'],
  ['Checkout', 'Front']
];

var TEMPLATE_MAP = {
  'Produce': 0, 'Bakery': 1, 'Meat & Deli': 2, 'Dairy & Eggs': 7,
  'Pantry': 3, 'Snacks & Drinks': 4, 'Frozen': 8, 'Household': 5,
  'Personal Care': 6, 'Other': 3
};

// Keyword rules for auto-categorizing typed items. Checked in order.
var GUESS_RULES = [
  ['Frozen', ['frozen', 'ice cream', 'icecream']],
  ['Dairy & Eggs', ['milk', 'egg', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cream', 'paneer', 'curd']],
  ['Produce', ['apple', 'banana', 'orange', 'lemon', 'lime', 'grape', 'berr', 'lettuce', 'salad', 'spinach', 'tomato', 'potato', 'onion', 'carrot', 'cucumber', 'pepper', 'avocado', 'garlic', 'ginger', 'cilantro', 'mint', 'herb', 'fruit', 'veg', 'mango', 'peach', 'pear', 'melon', 'broccoli', 'cauliflower', 'cabbage', 'mushroom', 'corn', 'peas', 'eggplant']],
  ['Bakery', ['bread', 'bagel', 'muffin', 'cake', 'cookie', 'croissant', 'bun', 'tortilla', 'donut', 'pie', 'roll']],
  ['Meat & Deli', ['chicken', 'beef', 'pork', 'fish', 'salmon', 'shrimp', 'turkey', 'ham', 'bacon', 'sausage', 'steak', 'meat', 'deli', 'mutton', 'lamb']],
  ['Personal Care', ['shampoo', 'conditioner', 'toothpaste', 'toothbrush', 'deodorant', 'lotion', 'razor', 'vitamin', 'medicine', 'bandage', 'soap bar', 'body wash', 'sunscreen']],
  ['Household', ['detergent', 'dish soap', 'soap', 'cleaner', 'tissue', 'paper towel', 'trash bag', 'foil', 'wrap', 'battery', 'batteries', 'bulb', 'sponge', 'bleach', 'wipes']],
  ['Snacks & Drinks', ['chips', 'soda', 'juice', 'coffee', 'tea', 'chocolate', 'candy', 'nuts', 'popcorn', 'beer', 'wine', 'water', 'snack', 'crackers', 'granola']],
  ['Pantry', ['rice', 'pasta', 'flour', 'sugar', 'salt', 'oil', 'cereal', 'oats', 'lentil', 'dal', 'beans', 'canned', 'sauce', 'spice', 'honey', 'peanut butter', 'jam', 'atta', 'noodle', 'soup', 'ketchup', 'vinegar']]
];

function guessCategory(name) {
  var raw = ' ' + String(name || '').toLowerCase().trim() + ' ';
  var i, j;
  // 'Frozen' is a state, not a head noun — it wins from any position
  // ('frozen peas' is frozen food, not produce).
  if (raw.indexOf(' frozen ') !== -1) return 'Frozen';
  // Pass 1: multi-word phrases are the most specific signal
  // ('ice cream', 'peanut butter', 'dish soap', 'eggplant' as a phrase-length word).
  for (i = 0; i < GUESS_RULES.length; i++) {
    var words = GUESS_RULES[i][1];
    for (j = 0; j < words.length; j++) {
      if (words[j].indexOf(' ') !== -1 && raw.indexOf(' ' + words[j] + ' ') !== -1) {
        return GUESS_RULES[i][0];
      }
    }
  }
  // Pass 2: single words. The head noun is usually the LAST word
  // ('potato chips' is a snack, 'egg noodles' is pasta), so a match on a
  // later word beats an earlier one; rule order breaks ties. Prefix match
  // covers plurals ('eggs' -> 'egg') without substring traps
  // ('shampoo' must not match 'ham').
  var tokens = raw.trim().split(/\s+/);
  var best = null;
  for (i = 0; i < GUESS_RULES.length; i++) {
    var kws = GUESS_RULES[i][1];
    for (j = 0; j < kws.length; j++) {
      if (kws[j].indexOf(' ') !== -1) continue;
      for (var t = 0; t < tokens.length; t++) {
        if (tokens[t] === kws[j] || tokens[t].indexOf(kws[j]) === 0) {
          if (!best || t > best.pos || (t === best.pos && i < best.rule)) {
            best = { pos: t, rule: i, cat: GUESS_RULES[i][0] };
          }
        }
      }
    }
  }
  return best ? best.cat : 'Other';
}

// ---------------------------------------------------------------------------
// Pure helpers (exposed on window.Shop for testing)
// ---------------------------------------------------------------------------

function haversineMi(lat1, lng1, lat2, lng2) {
  var R = 3958.8;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

// store: {zones: [[name, aisle], ...], map: {cat: zoneIdx}}
// items: [{id, name, cat, qty, done}]
// Returns [{zone, aisle, items}] in walk order; empty zones skipped.
// Unmapped categories land in a trailing "Anywhere else" group.
function buildRoute(store, items) {
  var zones = (store && store.zones) || [];
  var map = (store && store.map) || {};
  var byZone = {};
  var unmapped = [];
  items.forEach(function(it) {
    var zi = map[it.cat];
    if (typeof zi === 'number' && zi >= 0 && zi < zones.length) {
      (byZone[zi] = byZone[zi] || []).push(it);
    } else {
      unmapped.push(it);
    }
  });
  function sortItems(list) {
    return list.slice().sort(function(a, b) {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return String(a.name).localeCompare(String(b.name));
    });
  }
  var out = [];
  Object.keys(byZone).map(Number).sort(function(a, b) { return a - b; }).forEach(function(zi) {
    out.push({ zone: zones[zi][0], aisle: zones[zi][1] || '', items: sortItems(byZone[zi]) });
  });
  if (unmapped.length) {
    out.push({ zone: 'Anywhere else', aisle: '', items: sortItems(unmapped) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// API layer — keep a raw reference so our own calls bypass the shop filter
// ---------------------------------------------------------------------------

// Turn Overpass API elements into a clean, deduped, distance-sorted
// place list: [{name, addr, lat, lng, distMi}].
function parsePlaces(elements, lat, lng) {
  var seen = {};
  var out = [];
  (elements || []).forEach(function(el) {
    var tags = el.tags || {};
    var name = tags.name || tags.brand || '';
    if (!name) return;
    var pLat = (typeof el.lat === 'number') ? el.lat : (el.center && el.center.lat);
    var pLng = (typeof el.lon === 'number') ? el.lon : (el.center && el.center.lon);
    if (typeof pLat !== 'number' || typeof pLng !== 'number') return;
    var addrParts = [];
    var street = ((tags['addr:housenumber'] || '') + ' ' + (tags['addr:street'] || '')).trim();
    if (street) addrParts.push(street);
    if (tags['addr:city']) addrParts.push(tags['addr:city']);
    if (tags['addr:state']) addrParts.push(tags['addr:state']);
    var key = name.toLowerCase() + '@' + pLat.toFixed(3) + ',' + pLng.toFixed(3);
    if (seen[key]) return;
    seen[key] = true;
    out.push({
      name: name,
      addr: addrParts.join(', '),
      lat: pLat,
      lng: pLng,
      distMi: haversineMi(lat, lng, pLat, pLng)
    });
  });
  out.sort(function(a, b) { return a.distMi - b.distMi; });
  return out.slice(0, 15);
}

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

function rowToStore(row) {
  return {
    id: row.id,
    name: row.name || 'Store',
    zones: Array.isArray(row.zones) && row.zones.length ? row.zones : TEMPLATE_ZONES.slice(),
    map: (row.category_map && typeof row.category_map === 'object') ? row.category_map : Object.assign({}, TEMPLATE_MAP),
    lat: (typeof row.lat === 'number') ? row.lat : null,
    lng: (typeof row.lng === 'number') ? row.lng : null,
    pref: !!row.preferred
  };
}

function storeToBody(store) {
  return {
    kind: 'store',
    name: store.name,
    zones: store.zones,
    category_map: store.map,
    lat: store.lat != null ? store.lat : null,
    lng: store.lng != null ? store.lng : null,
    preferred: !!store.pref
  };
}

function rowToItem(row) {
  return {
    id: row.id,
    name: row.name || '',
    cat: row.category || 'Other',
    qty: row.qty || '',
    done: !!row.done,
    storeId: row.store_id || null
  };
}

var shopStores = [];
var shopItems = [];
var currentStoreId = null;
var storeWhy = '';

// Navigator state (in-memory only; derived from item check-offs)
var navMode = false;
var navSkipped = {};
var navWakeLock = null;

async function loadShopData() {
  var data = await shopApi('GET', SHOP_API);
  data = (data && typeof data === 'object') ? data : {};
  shopStores = (Array.isArray(data.stores) ? data.stores : []).map(rowToStore);
  shopItems = (Array.isArray(data.items) ? data.items : []).map(rowToItem);
  if (!shopStores.length) {
    var created = await shopApi('POST', SHOP_API, storeToBody({
      name: 'My Store',
      zones: TEMPLATE_ZONES.slice(), map: Object.assign({}, TEMPLATE_MAP),
      lat: null, lng: null, pref: true
    }));
    shopStores = [rowToStore(created)];
  }
  if (!currentStoreId || !shopStores.some(function(s) { return String(s.id) === String(currentStoreId); })) {
    pickInitialStore();
  }
}

function pickInitialStore() {
  var pref = shopStores.find(function(s) { return s.pref; });
  if (pref) {
    currentStoreId = pref.id;
    storeWhy = '★ your preferred store';
    return;
  }
  currentStoreId = shopStores[0].id;
  storeWhy = '';
  // If geolocation is already granted, silently switch to the nearest
  // store that has a saved location.
  var withLoc = shopStores.filter(function(s) { return s.lat != null && s.lng != null; });
  if (withLoc.length && navigator.geolocation && navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(function(p) {
      if (p.state !== 'granted') return;
      navigator.geolocation.getCurrentPosition(function(pos) {
        var best = null, bestD = Infinity;
        withLoc.forEach(function(s) {
          var d = haversineMi(pos.coords.latitude, pos.coords.longitude, s.lat, s.lng);
          if (d < bestD) { bestD = d; best = s; }
        });
        if (best && String(best.id) !== String(currentStoreId)) {
          currentStoreId = best.id;
          storeWhy = '📍 nearest store (' + bestD.toFixed(1) + ' mi)';
          renderShop();
        }
      }, function() {}, { timeout: 5000 });
    }).catch(function() {});
  }
}

function currentStore() {
  return shopStores.find(function(s) { return String(s.id) === String(currentStoreId); }) || shopStores[0];
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function storeOptionsHtml() {
  return shopStores.map(function(s) {
    return '<option value="' + esc(s.id) + '"' +
      (String(s.id) === String(currentStoreId) ? ' selected' : '') + '>' +
      esc(s.name) + (s.pref ? ' ★' : '') + '</option>';
  }).join('');
}

function renderShop() {
  var rootEl = document.getElementById('shop-root');
  if (!rootEl) return;
  var store = currentStore();
  if (!store) {
    rootEl.innerHTML = '<p class="empty-note">Loading…</p>';
    return;
  }
  if (navMode) {
    renderNavigator(rootEl, store);
    return;
  }
  var items = shopItems.filter(function(it) { return String(it.storeId) === String(store.id); });
  var route = buildRoute(store, items);
  var doneCount = items.filter(function(it) { return it.done; }).length;
  var catOptions = CATEGORIES.map(function(c) { return '<option>' + c + '</option>'; }).join('');

  var h = '';
  h += '<div class="shop-storebar">';
  h += '<select id="shop-store-sel" class="shop-store-sel">' + storeOptionsHtml() + '</select>';
  h += '<button type="button" id="shop-edit-layout" class="shop-btn">Edit layout</button>';
  h += '<button type="button" id="shop-add-store" class="shop-btn">+ Store</button>';
  h += '</div>';
  if (storeWhy) h += '<p class="shop-why">Using ' + esc(store.name) + ' — ' + esc(storeWhy) + '</p>';

  h += '<form id="shop-add-form" class="shop-add">';
  h += '<input id="shop-new-name" type="text" maxlength="80" placeholder="Add an item…" autocomplete="off">';
  h += '<select id="shop-new-cat" class="shop-cat-sel">' + catOptions + '</select>';
  h += '<input id="shop-new-qty" type="text" maxlength="12" placeholder="Qty" autocomplete="off">';
  h += '<button type="submit" class="primary">Add</button>';
  h += '</form>';

  if (!items.length) {
    h += '<p class="empty-note">Your list is empty. Add items above and they will be sorted into walking order for ' + esc(store.name) + '.</p>';
  } else {
    h += '<div class="shop-progress"><div class="shop-progress-bar" style="width:' +
      Math.round(doneCount / items.length * 100) + '%"></div></div>';
    h += '<p class="shop-progress-text">' + doneCount + ' of ' + items.length + ' picked · listed in walking order — top to bottom, entrance to checkout</p>';
    if (doneCount < items.length) {
      h += '<button type="button" id="shop-start-nav" class="shop-nav-start">Start navigation →</button>';
    }
    route.forEach(function(group) {
      h += '<div class="shop-zone">';
      h += '<div class="shop-zone-head"><span class="shop-zone-name">' + esc(group.zone) + '</span>' +
        (group.aisle ? '<span class="shop-zone-aisle">' + esc(group.aisle) + '</span>' : '') + '</div>';
      group.items.forEach(function(it) {
        h += '<label class="shop-item' + (it.done ? ' done' : '') + '">';
        h += '<input type="checkbox" class="shop-check" data-id="' + esc(it.id) + '"' + (it.done ? ' checked' : '') + '>';
        h += '<span class="shop-item-name">' + esc(it.name) + '</span>';
        if (it.qty) h += '<span class="shop-item-qty">' + esc(it.qty) + '</span>';
        h += '<button type="button" class="shop-del" data-id="' + esc(it.id) + '" title="Remove">×</button>';
        h += '</label>';
      });
      h += '</div>';
    });
    h += '<div class="shop-actions">';
    h += '<button type="button" id="shop-clear-done" class="shop-btn">Clear picked</button>';
    h += '<button type="button" id="shop-clear-all" class="shop-btn danger-btn">Clear list</button>';
    h += '</div>';
  }
  rootEl.innerHTML = h;
  wireShop(rootEl);
}

function wireShop(rootEl) {
  var startNav = rootEl.querySelector('#shop-start-nav');
  if (startNav) startNav.addEventListener('click', function() {
    navMode = true;
    navSkipped = {};
    requestNavWakeLock();
    renderShop();
    window.scrollTo(0, 0);
  });
  var sel = rootEl.querySelector('#shop-store-sel');
  if (sel) sel.addEventListener('change', function() {
    currentStoreId = sel.value;
    var s = currentStore();
    storeWhy = s && s.pref ? '★ your preferred store' : '';
    renderShop();
  });
  var editBtn = rootEl.querySelector('#shop-edit-layout');
  if (editBtn) editBtn.addEventListener('click', function() { openLayoutEditor(null); });
  var addStoreBtn = rootEl.querySelector('#shop-add-store');
  if (addStoreBtn) addStoreBtn.addEventListener('click', function() { openStoreFinder(); });

  var form = rootEl.querySelector('#shop-add-form');
  if (form) {
    var nameInput = form.querySelector('#shop-new-name');
    var catSel = form.querySelector('#shop-new-cat');
    nameInput.addEventListener('input', function() {
      catSel.value = guessCategory(nameInput.value);
    });
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      var name = nameInput.value.trim();
      if (!name) return;
      await addShopItem(name, catSel.value, form.querySelector('#shop-new-qty').value.trim());
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
    var store = currentStore();
    var done = shopItems.filter(function(it) { return it.done && String(it.storeId) === String(store.id); });
    for (var i = 0; i < done.length; i++) {
      try { await shopApi('DELETE', SHOP_API + '&kind=item&id=' + encodeURIComponent(done[i].id)); } catch (e) {}
    }
    shopItems = shopItems.filter(function(it) { return !(it.done && String(it.storeId) === String(store.id)); });
    renderShop();
    if (typeof toast === 'function') toast('Picked items cleared');
  });
  var clearAll = rootEl.querySelector('#shop-clear-all');
  if (clearAll) clearAll.addEventListener('click', async function() {
    if (!confirm('Clear the whole list for this store?')) return;
    var store = currentStore();
    var mine = shopItems.filter(function(it) { return String(it.storeId) === String(store.id); });
    for (var i = 0; i < mine.length; i++) {
      try { await shopApi('DELETE', SHOP_API + '&kind=item&id=' + encodeURIComponent(mine[i].id)); } catch (e) {}
    }
    shopItems = shopItems.filter(function(it) { return String(it.storeId) !== String(store.id); });
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

async function addShopItem(name, cat, qty) {
  var store = currentStore();
  var item = { name: name, cat: cat || guessCategory(name), qty: qty || '', done: false, storeId: store.id };
  try {
    var created = await shopApi('POST', SHOP_API, {
      kind: 'item', store_id: store.id,
      name: item.name, category: item.cat, qty: item.qty, done: false
    });
    item.id = created.id;
    shopItems.push(item);
    renderShop();
  } catch (e) {
    if (typeof toast === 'function') toast('Could not add that item. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// Navigator — visual stop-by-stop guidance through the store
// ---------------------------------------------------------------------------

function requestNavWakeLock() {
  try {
    if (navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request('screen').then(function(lock) {
        navWakeLock = lock;
      }).catch(function() {});
    }
  } catch (e) {}
}

function releaseNavWakeLock() {
  try {
    if (navWakeLock && navWakeLock.release) navWakeLock.release();
  } catch (e) {}
  navWakeLock = null;
}

// Schematic map: zones in walking order on a serpentine grid — first zone
// bottom-left (by the entrance), order snakes upward to the back of the
// store. State per zone: 'current' | 'todo' | 'done' | 'empty'.
function buildNavMap(store, stateByZone) {
  var zones = store.zones || [];
  var cols = 3, cellW = 124, cellH = 58, gap = 10;
  var rows = Math.max(1, Math.ceil(zones.length / cols));
  var W = cols * cellW + (cols + 1) * gap;
  var H = rows * cellH + (rows + 1) * gap + 26; // + entrance strip
  function cellPos(i) {
    var rowFromBottom = Math.floor(i / cols);
    var inRow = i % cols;
    var col = (rowFromBottom % 2 === 0) ? inRow : (cols - 1 - inRow);
    var x = gap + col * (cellW + gap);
    var y = H - 26 - gap - (rowFromBottom + 1) * cellH - rowFromBottom * gap;
    return { x: x, y: y };
  }
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="nav-map" role="img" aria-label="Store navigation map">';
  // Path through zone centers in walking order
  var pts = zones.map(function(z, i) {
    var p = cellPos(i);
    return (p.x + cellW / 2) + ',' + (p.y + cellH / 2);
  }).join(' ');
  s += '<polyline points="' + pts + '" fill="none" stroke="#2563eb" stroke-width="2" stroke-dasharray="5 4" opacity="0.5"/>';
  zones.forEach(function(z, i) {
    var p = cellPos(i);
    var state = stateByZone[z[0]] || 'empty';
    var cls = 'nav-cell nav-cell-' + state;
    var label = z[0].length > 17 ? z[0].slice(0, 16) + '…' : z[0];
    s += '<g class="' + cls + '">' +
      '<rect x="' + p.x + '" y="' + p.y + '" width="' + cellW + '" height="' + cellH + '" rx="8"/>' +
      '<text x="' + (p.x + cellW / 2) + '" y="' + (p.y + 26) + '" text-anchor="middle" class="nav-cell-name">' + esc(label) + '</text>' +
      (z[1] ? '<text x="' + (p.x + cellW / 2) + '" y="' + (p.y + 42) + '" text-anchor="middle" class="nav-cell-aisle">' + esc(z[1]) + '</text>' : '') +
      '<circle cx="' + (p.x + 13) + '" cy="' + (p.y + 13) + '" r="9" class="nav-badge"/>' +
      '<text x="' + (p.x + 13) + '" y="' + (p.y + 17) + '" text-anchor="middle" class="nav-badge-text">' + (state === 'done' ? '✓' : (i + 1)) + '</text>' +
      '</g>';
  });
  s += '<text x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle" class="nav-entrance">— ENTRANCE —</text>';
  s += '</svg>';
  return s;
}

function renderNavigator(rootEl, store) {
  var items = shopItems.filter(function(it) { return String(it.storeId) === String(store.id); });
  var route = buildRoute(store, items);
  var stops = route.filter(function(g) { return g.items.length > 0; });

  // Zone states for the map
  var stateByZone = {};
  (store.zones || []).forEach(function(z) { stateByZone[z[0]] = 'empty'; });
  stops.forEach(function(g) {
    stateByZone[g.zone] = g.items.some(function(it) { return !it.done; }) ? 'todo' : 'done';
  });

  // Current stop: first with unchecked items, preferring un-skipped ones
  var pending = stops.filter(function(g) { return g.items.some(function(it) { return !it.done; }); });
  var current = null;
  for (var i = 0; i < pending.length; i++) {
    if (!navSkipped[pending[i].zone]) { current = pending[i]; break; }
  }
  if (!current && pending.length) current = pending[0];
  if (current) stateByZone[current.zone] = 'current';

  var pickedCount = items.filter(function(it) { return it.done; }).length;
  var h = '';
  h += '<div class="nav-topbar"><strong>Navigating ' + esc(store.name) + '</strong>' +
    '<button type="button" id="nav-end" class="shop-btn">End</button></div>';
  h += buildNavMap(store, stateByZone);
  h += '<p class="shop-progress-text">' + pickedCount + ' of ' + items.length + ' picked</p>';

  if (!current) {
    h += '<div class="nav-done"><p class="nav-done-title">Everything picked</p>' +
      '<p>Head to checkout — you\'re done.</p></div>';
  } else {
    var stopNum = stops.indexOf(current) + 1;
    h += '<div class="nav-panel">';
    h += '<p class="nav-stop-label">Stop ' + stopNum + ' of ' + stops.length + '</p>';
    h += '<p class="nav-stop-title">' + esc(current.zone) +
      (current.aisle ? ' <span class="nav-stop-aisle">' + esc(current.aisle) + '</span>' : '') + '</p>';
    current.items.forEach(function(it) {
      h += '<label class="shop-item' + (it.done ? ' done' : '') + '">' +
        '<input type="checkbox" class="shop-check" data-id="' + esc(it.id) + '"' + (it.done ? ' checked' : '') + '>' +
        '<span class="shop-item-name">' + esc(it.name) + '</span>' +
        (it.qty ? '<span class="shop-item-qty">' + esc(it.qty) + '</span>' : '') +
        '</label>';
    });
    h += '<div class="nav-actions">';
    if (pending.length > 1) h += '<button type="button" id="nav-skip" class="shop-btn">Skip this stop →</button>';
    h += '</div></div>';
    var remaining = pending.filter(function(g) { return g !== current; });
    if (remaining.length) {
      h += '<p class="nav-next">Next: ' + remaining.map(function(g) { return esc(g.zone); }).join(' → ') + '</p>';
    }
  }
  rootEl.innerHTML = h;

  var endBtn = rootEl.querySelector('#nav-end');
  if (endBtn) endBtn.addEventListener('click', function() {
    navMode = false;
    navSkipped = {};
    releaseNavWakeLock();
    renderShop();
  });
  var skipBtn = rootEl.querySelector('#nav-skip');
  if (skipBtn && current) skipBtn.addEventListener('click', function() {
    navSkipped[current.zone] = true;
    renderShop();
  });
  rootEl.querySelectorAll('.shop-check').forEach(function(cb) {
    cb.addEventListener('change', function() {
      toggleShopItem(cb.dataset.id, cb.checked);
    });
  });
}

// ---------------------------------------------------------------------------
// Store finder — how other sites do it: use my location (or an address),
// list the grocery stores nearby, pick one, and its layout is generated
// and cached on the store card. No manual coordinates anywhere.
// ---------------------------------------------------------------------------

function ensureFinderModal() {
  if (document.getElementById('shop-finder')) return;
  var div = document.createElement('div');
  div.id = 'shop-finder';
  div.className = 'modal-backdrop hidden';
  div.innerHTML =
    '<div class="modal shop-modal">' +
      '<h3>Find a store</h3>' +
      '<button type="button" id="sf-geo" class="shop-nav-start">Use my location</button>' +
      '<p class="sf-or">or enter an address</p>' +
      '<div class="sf-addr-row">' +
        '<input id="sf-address" type="text" maxlength="120" placeholder="Street, city, or ZIP" autocomplete="off">' +
        '<button type="button" id="sf-search" class="shop-btn">Search</button>' +
      '</div>' +
      '<p id="sf-status" class="shop-hint"></p>' +
      '<div id="sf-results"></div>' +
      '<label class="shop-check-label"><input type="checkbox" id="sf-pref" checked> Make this my preferred store</label>' +
      '<div class="modal-actions">' +
        '<button type="button" id="sf-cancel">Cancel</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(div);
  document.getElementById('sf-cancel').addEventListener('click', closeFinder);
  document.getElementById('sf-geo').addEventListener('click', finderUseLocation);
  document.getElementById('sf-search').addEventListener('click', finderSearchAddress);
  document.getElementById('sf-address').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); finderSearchAddress(); }
  });
  div.addEventListener('click', function(e) { if (e.target === div) closeFinder(); });
}

function openStoreFinder() {
  ensureFinderModal();
  document.getElementById('sf-status').textContent = '';
  document.getElementById('sf-results').innerHTML = '';
  document.getElementById('shop-finder').classList.remove('hidden');
}

function closeFinder() {
  document.getElementById('shop-finder').classList.add('hidden');
}

function finderStatus(msg) {
  var el = document.getElementById('sf-status');
  if (el) el.textContent = msg;
}

function finderUseLocation() {
  if (!navigator.geolocation) {
    finderStatus('Location is not available on this device — enter an address instead.');
    return;
  }
  finderStatus('Getting your location…');
  navigator.geolocation.getCurrentPosition(function(pos) {
    finderSearchNearby(pos.coords.latitude, pos.coords.longitude);
  }, function() {
    finderStatus('Could not get your location — enter an address instead.');
  }, { timeout: 10000 });
}

async function finderSearchAddress() {
  var q = document.getElementById('sf-address').value.trim();
  if (!q) { document.getElementById('sf-address').focus(); return; }
  finderStatus('Finding that address…');
  try {
    var resp = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(q));
    var results = await resp.json();
    if (!results.length) {
      finderStatus('Address not found — check it and try again.');
      return;
    }
    finderSearchNearby(parseFloat(results[0].lat), parseFloat(results[0].lon));
  } catch (e) {
    finderStatus('Address lookup failed — check your connection and try again.');
  }
}

// Overpass mirrors, tried in order — the first that answers wins. The
// main instance occasionally refuses or stalls; mirrors keep this working.
var OVERPASS_HOSTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

async function finderSearchNearby(lat, lng) {
  finderStatus('Looking for grocery stores near you…');
  var query = '[out:json][timeout:25];(' +
    'node["shop"="supermarket"](around:12000,' + lat + ',' + lng + ');' +
    'node["shop"="grocery"](around:12000,' + lat + ',' + lng + ');' +
    'way["shop"="supermarket"](around:12000,' + lat + ',' + lng + ');' +
    'way["shop"="grocery"](around:12000,' + lat + ',' + lng + ');' +
    ');out center 60;';
  for (var i = 0; i < OVERPASS_HOSTS.length; i++) {
    try {
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, 35000) : null;
      var resp = await fetch(OVERPASS_HOSTS[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: ctrl ? ctrl.signal : undefined
      });
      if (timer) clearTimeout(timer);
      if (!resp.ok) continue;
      var data = await resp.json();
      var places = parsePlaces(data.elements || [], lat, lng);
      renderFinderResults(places);
      return;
    } catch (e) { /* try the next mirror */ }
  }
  finderStatus('Store search failed — check your connection and try again.');
}

function renderFinderResults(places) {
  var box = document.getElementById('sf-results');
  box.innerHTML = '';
  if (!places.length) {
    finderStatus('No grocery stores found within about 7 miles. Try another address.');
    return;
  }
  finderStatus(places.length + ' stores found — tap one to use it:');
  places.forEach(function(place) {
    var row = document.createElement('div');
    row.className = 'sf-result';
    row.innerHTML =
      '<div class="sf-result-main">' +
        '<div class="sf-result-name">' + esc(place.name) + '</div>' +
        (place.addr ? '<div class="sf-result-addr">' + esc(place.addr) + '</div>' : '') +
      '</div>' +
      '<div class="sf-result-dist">' + place.distMi.toFixed(1) + ' mi</div>' +
      '<button type="button" class="shop-btn sf-select">Select</button>';
    row.querySelector('.sf-select').addEventListener('click', function() {
      selectFoundStore(place);
    });
    box.appendChild(row);
  });
}

// Selecting a place: if we already have a store with this name, enrich it
// with the location (layout kept as-is); otherwise create the store with a
// generated layout and cache it in the shop_stores table.
async function selectFoundStore(place) {
  var makePref = document.getElementById('sf-pref').checked;
  var existing = shopStores.find(function(s) {
    return s.name.trim().toLowerCase() === place.name.trim().toLowerCase();
  });
  try {
    var store;
    if (existing) {
      store = Object.assign({}, existing, {
        lat: place.lat, lng: place.lng,
        pref: makePref ? true : existing.pref
      });
      await shopApi('PATCH', SHOP_API + '&kind=store&id=' + encodeURIComponent(store.id), storeToBody(store));
      var idx = shopStores.findIndex(function(s) { return String(s.id) === String(store.id); });
      if (idx >= 0) shopStores[idx] = store;
    } else {
      store = {
        name: place.name,
        zones: TEMPLATE_ZONES.map(function(z) { return z.slice(); }),
        map: Object.assign({}, TEMPLATE_MAP),
        lat: place.lat, lng: place.lng,
        pref: makePref
      };
      var created = await shopApi('POST', SHOP_API, storeToBody(store));
      store.id = created.id;
      shopStores.push(store);
    }
    if (makePref) {
      shopStores.forEach(function(s) { if (String(s.id) !== String(store.id)) s.pref = false; });
      storeWhy = '★ your preferred store';
    }
    currentStoreId = store.id;
    closeFinder();
    renderShop();
    if (typeof toast === 'function') {
      toast(existing ? 'Store updated — ' + store.name : 'Added ' + store.name + ' — layout generated');
    }
  } catch (e) {
    finderStatus('Could not save that store. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// Layout editor
// ---------------------------------------------------------------------------

var editorState = null; // {storeId|null('new'), name, zones, map, lat, lng, pref}

function ensureShopModal() {
  if (document.getElementById('shop-modal')) return;
  var div = document.createElement('div');
  div.id = 'shop-modal';
  div.className = 'modal-backdrop hidden';
  div.innerHTML =
    '<div class="modal shop-modal">' +
      '<h3 id="shop-modal-title">Store layout</h3>' +
      '<label>Store name<input id="she-name" type="text" maxlength="60"></label>' +
      '<label class="shop-check-label"><input type="checkbox" id="she-pref"> ★ Preferred store (always use this one)</label>' +
      '<h4>Walking order (top = first)</h4>' +
      '<div id="she-zones"></div>' +
      '<button type="button" id="she-add-zone" class="shop-btn">+ Add zone</button>' +
      '<h4>Where each category lives</h4>' +
      '<div id="she-catmap"></div>' +
      '<div class="modal-actions">' +
        '<button type="button" id="she-delete" class="danger-btn">Delete store</button>' +
        '<button type="button" id="she-cancel">Cancel</button>' +
        '<button type="button" id="she-save" class="primary">Save</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(div);
  document.getElementById('she-cancel').addEventListener('click', closeShopModal);
  document.getElementById('she-save').addEventListener('click', saveShopEditor);
  document.getElementById('she-delete').addEventListener('click', deleteShopStore);
  document.getElementById('she-add-zone').addEventListener('click', function() {
    editorState.zones.push(['New zone', '']);
    renderEditorZones();
    renderEditorCatmap();
  });
  div.addEventListener('click', function(e) { if (e.target === div) closeShopModal(); });
}

function openLayoutEditor(which) {
  ensureShopModal();
  if (which === 'new') {
    editorState = {
      storeId: null, name: '',
      zones: TEMPLATE_ZONES.map(function(z) { return z.slice(); }),
      map: Object.assign({}, TEMPLATE_MAP),
      lat: null, lng: null, pref: false
    };
    document.getElementById('shop-modal-title').textContent = 'New store';
    document.getElementById('she-delete').style.display = 'none';
  } else {
    var s = currentStore();
    if (!s) return;
    editorState = {
      storeId: s.id, name: s.name,
      zones: s.zones.map(function(z) { return z.slice(); }),
      map: Object.assign({}, s.map),
      lat: s.lat, lng: s.lng, pref: s.pref
    };
    document.getElementById('shop-modal-title').textContent = 'Store layout';
    document.getElementById('she-delete').style.display = shopStores.length > 1 ? '' : 'none';
  }
  document.getElementById('she-name').value = editorState.name;
  document.getElementById('she-pref').checked = !!editorState.pref;
  renderEditorZones();
  renderEditorCatmap();
  document.getElementById('shop-modal').classList.remove('hidden');
}

function renderEditorZones() {
  var box = document.getElementById('she-zones');
  box.innerHTML = '';
  editorState.zones.forEach(function(z, idx) {
    var row = document.createElement('div');
    row.className = 'she-zone-row';
    row.innerHTML =
      '<button type="button" class="she-move" data-dir="-1" title="Move up">↑</button>' +
      '<button type="button" class="she-move" data-dir="1" title="Move down">↓</button>' +
      '<input type="text" class="she-zone-name" maxlength="40" value="' + esc(z[0]) + '" placeholder="Zone name">' +
      '<input type="text" class="she-zone-aisle" maxlength="20" value="' + esc(z[1] || '') + '" placeholder="Aisle">' +
      '<button type="button" class="she-zone-del" title="Remove zone">×</button>';
    row.querySelectorAll('.she-move').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var dir = Number(btn.dataset.dir);
        var j = idx + dir;
        if (j < 0 || j >= editorState.zones.length) return;
        syncEditorZonesFromDom();
        var tmp = editorState.zones[idx];
        editorState.zones[idx] = editorState.zones[j];
        editorState.zones[j] = tmp;
        // Remap category indices to follow the swap
        Object.keys(editorState.map).forEach(function(cat) {
          if (editorState.map[cat] === idx) editorState.map[cat] = j;
          else if (editorState.map[cat] === j) editorState.map[cat] = idx;
        });
        renderEditorZones();
        renderEditorCatmap();
      });
    });
    row.querySelector('.she-zone-del').addEventListener('click', function() {
      if (editorState.zones.length <= 1) return;
      syncEditorZonesFromDom();
      editorState.zones.splice(idx, 1);
      // Remap: categories pointing at the removed zone go to Pantry-ish first zone;
      // indices above the removed one shift down.
      Object.keys(editorState.map).forEach(function(cat) {
        if (editorState.map[cat] === idx) editorState.map[cat] = 0;
        else if (editorState.map[cat] > idx) editorState.map[cat] -= 1;
      });
      renderEditorZones();
      renderEditorCatmap();
    });
    box.appendChild(row);
  });
}

function syncEditorZonesFromDom() {
  var rows = document.querySelectorAll('#she-zones .she-zone-row');
  rows.forEach(function(row, i) {
    if (!editorState.zones[i]) return;
    editorState.zones[i][0] = row.querySelector('.she-zone-name').value.trim() || editorState.zones[i][0];
    editorState.zones[i][1] = row.querySelector('.she-zone-aisle').value.trim();
  });
}

function renderEditorCatmap() {
  var box = document.getElementById('she-catmap');
  box.innerHTML = '';
  CATEGORIES.forEach(function(cat) {
    var row = document.createElement('label');
    row.className = 'she-cat-row';
    var opts = editorState.zones.map(function(z, i) {
      return '<option value="' + i + '"' + (editorState.map[cat] === i ? ' selected' : '') + '>' + esc(z[0]) + '</option>';
    }).join('');
    row.innerHTML = '<span>' + esc(cat) + '</span><select data-cat="' + esc(cat) + '">' + opts + '</select>';
    row.querySelector('select').addEventListener('change', function(e) {
      editorState.map[cat] = Number(e.target.value);
    });
    box.appendChild(row);
  });
}

function closeShopModal() {
  document.getElementById('shop-modal').classList.add('hidden');
  editorState = null;
}

async function saveShopEditor() {
  if (!editorState) return;
  syncEditorZonesFromDom();
  var name = document.getElementById('she-name').value.trim();
  if (!name) { document.getElementById('she-name').focus(); return; }
  var store = {
    id: editorState.storeId,
    name: name,
    zones: editorState.zones,
    map: editorState.map,
    lat: (editorState.lat != null) ? editorState.lat : null,
    lng: (editorState.lng != null) ? editorState.lng : null,
    pref: document.getElementById('she-pref').checked
  };
  try {
    if (store.id) {
      await shopApi('PATCH', SHOP_API + '&kind=store&id=' + encodeURIComponent(store.id), storeToBody(store));
      var idx = shopStores.findIndex(function(s) { return String(s.id) === String(store.id); });
      if (idx >= 0) shopStores[idx] = store;
    } else {
      var created = await shopApi('POST', SHOP_API, storeToBody(store));
      store.id = created.id;
      shopStores.push(store);
      currentStoreId = store.id;
    }
    // Preferred is exclusive — the API clears it on other stores.
    if (store.pref) {
      shopStores.forEach(function(s) { if (String(s.id) !== String(store.id)) s.pref = false; });
      storeWhy = '★ your preferred store';
    }
    closeShopModal();
    renderShop();
    if (typeof toast === 'function') toast('Store saved');
  } catch (e) {
    if (typeof toast === 'function') toast('Could not save the store. Please try again.');
  }
}

async function deleteShopStore() {
  if (!editorState || !editorState.storeId) return;
  if (!confirm('Delete this store and its shopping list?')) return;
  var id = editorState.storeId;
  try {
    await shopApi('DELETE', SHOP_API + '&kind=store&id=' + encodeURIComponent(id));
    shopItems = shopItems.filter(function(it) { return String(it.storeId) !== String(id); });
    shopStores = shopStores.filter(function(s) { return String(s.id) !== String(id); });
    if (String(currentStoreId) === String(id)) { currentStoreId = null; pickInitialStore(); }
    closeShopModal();
    renderShop();
  } catch (e) {
    if (typeof toast === 'function') toast('Could not delete the store.');
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
    // one load, or the first-run store seeding fires twice.
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
      if (rootEl) rootEl.innerHTML = '<p class="empty-note">Could not load your stores. Please try again.</p>';
      return;
    }
  }
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
  buildRoute: buildRoute,
  guessCategory: guessCategory,
  haversineMi: haversineMi,
  parsePlaces: parsePlaces,
  CATEGORIES: CATEGORIES,
  TEMPLATE_ZONES: TEMPLATE_ZONES,
  TEMPLATE_MAP: TEMPLATE_MAP
};

})();
