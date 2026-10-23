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

// How supermarkets typically arrange departments, used as the sort order
// for every list: fresh perimeter first (produce at the entrance, meat and
// dairy along the back wall), center aisles next, frozen last so it thaws
// least, then checkout. No store-specific aisle claims.
var TEMPLATE_ZONES = [
  ['Produce', 'Entrance'],
  ['Bakery', 'Fresh'],
  ['Meat & Deli', 'Back wall'],
  ['Dairy & Eggs', 'Back wall'],
  ['Pantry', 'Center aisles'],
  ['Snacks & Drinks', 'Center aisles'],
  ['Household', 'Center aisles'],
  ['Personal Care', 'Near pharmacy'],
  ['Frozen', 'Last section'],
  ['Checkout', 'Front']
];

var TEMPLATE_MAP = {
  'Produce': 0, 'Bakery': 1, 'Meat & Deli': 2, 'Dairy & Eggs': 3,
  'Pantry': 4, 'Snacks & Drinks': 5, 'Frozen': 8, 'Household': 6,
  'Personal Care': 7, 'Other': 4
};

// Keyword rules for auto-categorizing typed items. Checked in order.
var GUESS_RULES = [
  ['Frozen', ['frozen', 'ice cream', 'icecream']],
  ['Dairy & Eggs', ['milk', 'egg', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cream', 'paneer', 'curd']],
  ['Produce', ['apple', 'banana', 'orange', 'lemon', 'lime', 'grape', 'berr', 'lettuce', 'salad', 'spinach', 'tomato', 'potato', 'onion', 'carrot', 'cucumber', 'pepper', 'avocado', 'garlic', 'ginger', 'cilantro', 'mint', 'basil', 'parsley', 'dill', 'thyme', 'rosemary', 'chive', 'herb', 'fruit', 'veg', 'mango', 'peach', 'pear', 'melon', 'broccoli', 'cauliflower', 'cabbage', 'mushroom', 'corn', 'peas', 'eggplant']],
  ['Bakery', ['bread', 'bagel', 'muffin', 'cake', 'cookie', 'croissant', 'bun', 'tortilla', 'donut', 'pie', 'roll']],
  ['Meat & Deli', ['chicken', 'beef', 'pork', 'fish', 'salmon', 'shrimp', 'turkey', 'ham', 'bacon', 'sausage', 'steak', 'meat', 'deli', 'mutton', 'lamb', 'hot dog', 'hot dogs', 'hotdog']],
  ['Personal Care', ['shampoo', 'conditioner', 'toothpaste', 'toothbrush', 'deodorant', 'lotion', 'razor', 'vitamin', 'medicine', 'bandage', 'soap bar', 'body wash', 'sunscreen']],
  ['Household', ['detergent', 'dish soap', 'soap', 'cleaner', 'tissue', 'paper towel', 'towel', 'paper', 'laundry', 'napkin', 'trash bag', 'foil', 'wrap', 'battery', 'batteries', 'bulb', 'sponge', 'bleach', 'wipes']],
  ['Snacks & Drinks', ['chips', 'soda', 'juice', 'coffee', 'tea', 'chocolate', 'candy', 'nuts', 'popcorn', 'beer', 'wine', 'water', 'snack', 'crackers', 'granola']],
  ['Pantry', ['rice', 'pasta', 'flour', 'sugar', 'salt', 'oil', 'cereal', 'oats', 'lentil', 'dal', 'beans', 'canned', 'sauce', 'spice', 'honey', 'peanut butter', 'jam', 'atta', 'noodle', 'soup', 'ketchup', 'vinegar', 'rice paper']]
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
  storeWhy = shopStores.length > 1 ? 'no preferred store set — showing the first store' : '';
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
  var items = shopItems.filter(function(it) { return String(it.storeId) === String(store.id); });
  var spReady = specialsState.key === specialsItemKey() && !!specialsState.byItem;
  var route = buildRoute(store, items);
  var doneCount = items.filter(function(it) { return it.done; }).length;
  var catOptions = CATEGORIES.map(function(c) { return '<option>' + c + '</option>'; }).join('');

  var h = '';
  h += '<div class="shop-storebar">';
  h += '<div class="shop-store-chip" id="shop-store-chip" role="button" title="Your store — tap to change">';
  h += '<span class="shop-store-icon">\u{1F3EC}</span>';
  h += '<span class="shop-store-meta"><span class="shop-store-name">' + esc(store.name) + (store.pref ? ' \u2605' : '') + '</span>';
  h += '<span class="shop-store-addr" id="shop-store-addr"></span></span>';
  h += '<span class="shop-store-change" aria-hidden="true">\u270E</span>';
  h += '</div>';
  h += '<div class="shop-store-menu" id="shop-store-menu" hidden>';
  shopStores.forEach(function(s) {
    var cur = String(s.id) === String(store.id);
    h += '<button type="button" class="shop-store-opt' + (cur ? ' current' : '') + '" data-store-id="' + esc(s.id) + '">' +
      (cur ? '\u2713 ' : '') + esc(s.name) + (s.pref ? ' \u2605' : '') + '</button>';
  });
  h += '<div class="shop-store-menu-actions">';
  h += '<button type="button" id="shop-menu-finder" class="shop-store-opt">\uFF0B Find a store</button>';
  h += '<button type="button" id="shop-menu-layout" class="shop-store-opt">\u270E Edit layout</button>';
  h += '</div></div></div>';

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
    h += '<p class="shop-progress-text">' + doneCount + ' of ' + items.length + ' picked · sorted the way stores arrange things — fresh first, frozen last</p>';
    route.forEach(function(group) {
      h += '<div class="shop-zone">';
      h += '<div class="shop-zone-head"><span class="shop-zone-name">' + esc(group.zone) + '</span>' +
        (group.aisle ? '<span class="shop-zone-aisle">' + esc(group.aisle) + '</span>' : '') + '</div>';
      group.items.forEach(function(it) {
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
      h += '</div>';
    });
    h += '<div class="shop-actions">';
    h += '<button type="button" id="shop-clear-done" class="shop-btn">Clear picked</button>';
    h += '<button type="button" id="shop-clear-all" class="shop-btn danger-btn">Clear list</button>';
    h += '</div>';
  }
  rootEl.innerHTML = h;
  wireShop(rootEl);
  fillStoreAddress(store);
  updateSpecialsInline();
}

function fillStoreAddress(store) {
  var el = document.getElementById('shop-store-addr');
  if (!el) return;
  if (!store.lat || !store.lng) { el.textContent = ''; return; }
  var key = 'shopAddrV1:' + store.id + ':' + Number(store.lat).toFixed(4) + ',' + Number(store.lng).toFixed(4);
  try { var c = localStorage.getItem(key); if (c) { el.textContent = c; return; } } catch (e) {}
  fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + store.lat + '&lon=' + store.lng)
    .then(function(r) { return r.json(); })
    .then(function(j) {
      var a = (j && j.address) || {};
      var line = ((a.house_number ? a.house_number + ' ' : '') + (a.road || '')).trim();
      var city = a.city || a.town || a.village || '';
      var text = line ? (line + (city ? ', ' + city : '')) :
        (j && j.display_name ? j.display_name.split(',').slice(0, 2).join(',') : '');
      if (text) {
        try { localStorage.setItem(key, text); } catch (e) {}
        var live = document.getElementById('shop-store-addr');
        if (live) live.textContent = text;
      }
    }).catch(function() {});
}

function wireShop(rootEl) {
  var chip = rootEl.querySelector('#shop-store-chip');
  var menu = rootEl.querySelector('#shop-store-menu');
  if (chip && menu) {
    chip.addEventListener('click', function(e) { e.stopPropagation(); menu.hidden = !menu.hidden; });
    menu.querySelectorAll('[data-store-id]').forEach(function(b) {
      b.addEventListener('click', function() {
        currentStoreId = b.getAttribute('data-store-id');
        var s = currentStore();
        storeWhy = s && s.pref ? '★ your preferred store' : '';
        renderShop();
      });
    });
    var fBtn = menu.querySelector('#shop-menu-finder');
    if (fBtn) fBtn.addEventListener('click', function() { menu.hidden = true; openStoreFinder(); });
    var lBtn = menu.querySelector('#shop-menu-layout');
    if (lBtn) lBtn.addEventListener('click', function() { menu.hidden = true; openLayoutEditor(null); });
    if (window.__shopMenuCloser) document.removeEventListener('click', window.__shopMenuCloser);
    window.__shopMenuCloser = function(e) {
      var m = document.getElementById('shop-store-menu');
      if (m && !m.hidden && !(e.target.closest && e.target.closest('.shop-storebar'))) m.hidden = true;
    };
    document.addEventListener('click', window.__shopMenuCloser);
  }

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
    if (!clearAll.dataset.armed) {
      clearAll.dataset.armed = '1';
      clearAll.textContent = 'Tap again to clear the whole list';
      setTimeout(function() { delete clearAll.dataset.armed; clearAll.textContent = 'Clear list'; }, 4000);
      return;
    }
    delete clearAll.dataset.armed;
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
  var dup = shopItems.some(function(x) {
    return String(x.storeId) === String(store.id) && !x.done &&
      x.name.trim().toLowerCase() === name.trim().toLowerCase();
  });
  if (dup) {
    if (typeof toast === 'function') toast('Already on your list');
    return;
  }
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
// Specials — automatic, no button (Winny, 2026-10-23). Whenever the Shop
// view shows the list, this checks the unchecked items against this week's
// Harris Teeter and Publix ads and renders a panel under the list. Deals
// are parsed from the public ad listings and cached for 12h.
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
  var strong = toks.filter(function(t) { return !SPECIALS_GENERIC[t] && t.length >= 3; });
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

function specialsIndexByItem(itemNames, sources) {
  var byItem = {};
  Object.keys(sources).forEach(function(store) {
    var matches = specialsMatch(itemNames, sources[store].deals || []);
    Object.keys(matches).forEach(function(item) {
      var key = item.trim().toLowerCase();
      if (!byItem[key]) byItem[key] = [];
      byItem[key].push({ store: store, text: matches[item][0].text });
    });
  });
  return byItem;
}

function specialsLineFor(name) {
  if (!specialsState.byItem) return '';
  var entries = specialsState.byItem[name.trim().toLowerCase()];
  if (!entries || !entries.length) return '';
  var parts = entries.slice(0, 4).map(function(e) {
    var t = e.text.length > 90 ? e.text.slice(0, 90) + '…' : e.text;
    return esc(e.store) + ': ' + esc(t);
  });
  return '💲 ' + parts.join(' · ');
}

async function updateSpecialsInline() {
  var key = specialsItemKey();
  if (!key) return;
  if (specialsState.key === key && specialsState.byItem) return;
  if (specialsState.loading) return;
  specialsState.loading = true;
  try {
    var names = {};
    shopItems.forEach(function(it) { if (!it.done) names[it.name.trim().toLowerCase()] = it.name.trim(); });
    var sources = await specialsGetDeals();
    specialsState = { key: key, byItem: specialsIndexByItem(Object.values(names), sources), loading: false };
    if (location.hash === '#/shop' && specialsItemKey() === key) renderShop();
  } catch (e) {
    specialsState.loading = false;
  }
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
      '<button type="button" id="sf-stop" class="shop-btn" style="display:none">Stop searching</button>' +
      '<div id="sf-results"></div>' +
      '<label class="shop-check-label"><input type="checkbox" id="sf-pref" checked> Make this my preferred store</label>' +
      '<div class="modal-actions">' +
        '<button type="button" id="sf-cancel">Cancel</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(div);
  document.getElementById('sf-cancel').addEventListener('click', closeFinder);
  document.getElementById('sf-stop').addEventListener('click', function() {
    finderCancelled = true;
    if (finderAbort) { try { finderAbort.abort(); } catch (e) {} }
  });
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

var finderAbort = null;
var finderCancelled = false;

function finderStopBtn(show) {
  var b = document.getElementById('sf-stop');
  if (b) b.style.display = show ? '' : 'none';
}

async function finderSearchNearby(lat, lng) {
  finderCancelled = false;
  finderStopBtn(true);
  finderStatus('Looking for grocery stores near you…');
  var query = '[out:json][timeout:20];(' +
    'node["shop"="supermarket"](around:12000,' + lat + ',' + lng + ');' +
    'node["shop"="grocery"](around:12000,' + lat + ',' + lng + ');' +
    'node["shop"="department_store"](around:12000,' + lat + ',' + lng + ');' +
    'way["shop"="supermarket"](around:12000,' + lat + ',' + lng + ');' +
    'way["shop"="grocery"](around:12000,' + lat + ',' + lng + ');' +
    'way["shop"="department_store"](around:12000,' + lat + ',' + lng + ');' +
    ');out center 60;';
  for (var i = 0; i < OVERPASS_HOSTS.length; i++) {
    if (finderCancelled) break;
    if (i > 0) finderStatus('Still looking — trying another source…');
    try {
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      finderAbort = ctrl;
      var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, 12000) : null;
      var resp = await fetch(OVERPASS_HOSTS[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: ctrl ? ctrl.signal : undefined
      });
      if (timer) clearTimeout(timer);
      finderAbort = null;
      if (finderCancelled) break;
      if (!resp.ok) continue;
      var data = await resp.json();
      var places = parsePlaces(data.elements || [], lat, lng);
      finderStopBtn(false);
      renderFinderResults(places);
      return;
    } catch (e) { finderAbort = null; /* try the next mirror */ }
  }
  finderStopBtn(false);
  if (finderCancelled) {
    finderStatus('Search stopped.');
  } else {
    finderStatus('The store database didn\'t answer — it may be busy. Try again in a moment.');
  }
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
    if (s.name.trim().toLowerCase() !== place.name.trim().toLowerCase()) return false;
    if (s.lat == null || s.lng == null) return true; // no location yet — enrich it
    // Same chain, different branch (>0.5 mi away) is a NEW store, not a match.
    return haversineMi(s.lat, s.lng, place.lat, place.lng) < 0.5;
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
  var delBtn = document.getElementById('she-delete');
  if (delBtn) delBtn.textContent = 'Delete store';
  deleteArmUntil = 0;
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

var deleteArmUntil = 0;
async function deleteShopStore() {
  if (!editorState || !editorState.storeId) return;
  // Two-tap arm instead of a native confirm — a store delete cascades to
  // its whole list, so it must never be one accidental tap.
  if (Date.now() > deleteArmUntil) {
    deleteArmUntil = Date.now() + 4000;
    var armBtn = document.getElementById('she-delete');
    if (armBtn) armBtn.textContent = 'Tap again to delete this store + its list';
    return;
  }
  deleteArmUntil = 0;
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
