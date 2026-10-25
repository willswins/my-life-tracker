// Shop API — grocery stores and items in their own tables
// (shop_stores / shop_items, migration-008). Items are DB rows, never code
// and never piggybacked on board cards. Scoped to the signed-in user's
// email, same convention as the other DayBook handlers.
const { getSessionEmail } = require('./_session');
const { readBody, sb } = require('./_db');

function cleanStore(body) {
  const out = {};
  if (typeof body.name === 'string' && body.name.trim()) out.name = body.name.trim().slice(0, 120);
  if (Array.isArray(body.zones)) out.zones = body.zones;
  if (body.category_map && typeof body.category_map === 'object' && !Array.isArray(body.category_map)) out.category_map = body.category_map;
  if (body.lat === null || typeof body.lat === 'number') out.lat = body.lat;
  if (body.lng === null || typeof body.lng === 'number') out.lng = body.lng;
  if (typeof body.preferred === 'boolean') out.preferred = body.preferred;
  return out;
}

function cleanItem(body) {
  const out = {};
  if (typeof body.name === 'string' && body.name.trim()) out.name = body.name.trim().slice(0, 160);
  if (typeof body.category === 'string' && body.category.trim()) out.category = body.category.trim().slice(0, 60);
  if (typeof body.qty === 'string') out.qty = body.qty.slice(0, 40);
  if (typeof body.done === 'boolean') out.done = body.done;
  if (typeof body.store_id === 'string' && body.store_id) out.store_id = body.store_id;
  return out;
}

const CATEGORIES = ['Produce', 'Bakery', 'Meat & Deli', 'Dairy & Eggs', 'Pantry', 'Snacks & Drinks', 'Frozen', 'Household', 'Personal Care', 'Electronics', 'Other'];
const MAX_ZONES = 40;

// Validate + normalize a store layout. Returns an error string, or null
// after normalizing row.zones / row.category_map in place. Only touches
// fields the caller actually sent.
function validateStoreLayout(row, body) {
  if (body.zones !== undefined) {
    if (!Array.isArray(body.zones) || body.zones.length < 1 || body.zones.length > MAX_ZONES) {
      return 'zones must be an array of 1-' + MAX_ZONES + ' zones';
    }
    const zones = [];
    for (const z of body.zones) {
      if (!Array.isArray(z) || typeof z[0] !== 'string' || !z[0].trim()) return 'each zone needs a name';
      zones.push([z[0].trim().slice(0, 60), typeof z[1] === 'string' ? z[1].trim().slice(0, 30) : '']);
    }
    row.zones = zones;
  }
  if (body.category_map !== undefined && row.category_map) {
    const zoneCount = Array.isArray(row.zones) ? row.zones.length : null;
    const map = {};
    for (const [cat, idx] of Object.entries(row.category_map)) {
      if (!CATEGORIES.includes(cat)) return 'unknown category in category_map: ' + cat;
      if (!Number.isInteger(idx)) return 'category_map values must be zone indexes';
      // Clamp into the valid range when the zone count is known.
      map[cat] = zoneCount ? Math.min(Math.max(idx, 0), zoneCount - 1) : idx;
    }
    row.category_map = map;
  }
  if ((body.lat !== undefined && body.lat !== null && typeof body.lat !== 'number') ||
      (body.lng !== undefined && body.lng !== null && typeof body.lng !== 'number')) {
    return 'lat/lng must be numbers';
  }
  return null;
}

module.exports = async (req, res) => {
  const email = getSessionEmail(req, process.env.SESSION_SECRET || '');
  if (!email) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(data === null ? '' : JSON.stringify(data));
  };
  try {
    const url = new URL(req.url, 'https://localhost');
    const id = url.searchParams.get('id');
    const kind = url.searchParams.get('kind');
    const scope = `user_email=eq.${encodeURIComponent(email)}`;
    const now = new Date().toISOString();

    if (req.method === 'GET') {
      const stores = await sb('GET', `/rest/v1/shop_stores?${scope}&deleted_at=is.null&order=created_at.asc`);
      const items = await sb('GET', `/rest/v1/shop_items?${scope}&deleted_at=is.null&order=created_at.asc`);
      // Catalog deals (shop_deals table, refreshed by the shop watch).
      // Tolerate a missing table so the app runs before the table exists.
      let deals = [];
      try {
        const rows = await sb('GET', `/rest/v1/shop_deals?${scope}&select=item_key,sellers,updated_at`);
        if (Array.isArray(rows)) deals = rows;
      } catch (e) { /* table not created yet */ }
      return send(200, { stores, items, deals });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      if (body.kind === 'store') {
        const row = cleanStore(body);
        if (!row.name) return send(400, { ok: false, error: 'name required' });
        const layoutErr = validateStoreLayout(row, body);
        if (layoutErr) return send(400, { ok: false, error: layoutErr });
        row.user_email = email;
        const inserted = await sb('POST', '/rest/v1/shop_stores', row);
        if (row.preferred) {
          await sb('PATCH', `/rest/v1/shop_stores?${scope}&id=neq.${inserted[0].id}&deleted_at=is.null`, { preferred: false, updated_at: now });
        }
        return send(201, inserted[0]);
      }
      if (body.kind === 'item') {
        const row = cleanItem(body);
        if (!row.name) return send(400, { ok: false, error: 'name required' });
        if (typeof body.name === 'string' && body.name.trim().length > 160) return send(400, { ok: false, error: 'name too long (max 160)' });
        // Stores were removed from the app (Winny, 2026-10-25): items are
        // not assigned to any store. Any store_id sent (e.g. a stale
        // client) is dropped so new items land on the one list.
        delete row.store_id;
        if (row.category && !CATEGORIES.includes(row.category)) return send(400, { ok: false, error: 'unknown category' });
        if (!row.category) row.category = 'Other';
        // One unchecked row per item name — duplicates are a
        // client bug; reject instead of silently stacking rows.
        const existing = await sb('GET', `/rest/v1/shop_items?${scope}&deleted_at=is.null&done=eq.false&select=name`);
        const wanted = row.name.trim().toLowerCase();
        if (existing.some((it) => (it.name || '').trim().toLowerCase() === wanted)) {
          return send(409, { ok: false, error: 'already on the list' });
        }
        if (!row.qty) row.qty = '';
        if (typeof row.done !== 'boolean') row.done = false;
        // Bucket for the NOT NULL store_id column: the app no longer has
        // stores, but the column still requires a value. New items point
        // at the earliest non-deleted store row, which never appears
        // anywhere in the app. TODO: drop the NOT NULL constraint via
        // dashboard SQL, then delete this block.
        let bucket = await sb('GET', `/rest/v1/shop_stores?${scope}&deleted_at=is.null&order=created_at.asc&limit=1&select=id`);
        if (!bucket.length) {
          bucket = await sb('POST', '/rest/v1/shop_stores', { name: 'List', user_email: email });
        }
        row.store_id = bucket[0].id;
        row.user_email = email;
        const inserted = await sb('POST', '/rest/v1/shop_items', row);
        return send(201, inserted[0]);
      }
      if (body.kind === 'deal') {
        const key = (typeof body.item_key === 'string') ? body.item_key.trim().toLowerCase() : '';
        if (!key) return send(400, { ok: false, error: 'item_key required' });
        if (!Array.isArray(body.sellers)) return send(400, { ok: false, error: 'sellers must be an array' });
        const sellers = body.sellers.slice(0, 3).map(function(s) {
          return {
            store: String((s && s.store) || ''),
            price: (s && typeof s.price === 'number') ? s.price : null,
            text: String((s && s.text) || '')
          };
        }).filter(function(s) { return s.store; });
        const row = { user_email: email, item_key: key, sellers: sellers, updated_at: now };
        const existing = await sb('GET', `/rest/v1/shop_deals?${scope}&item_key=eq.${encodeURIComponent(key)}&select=id`);
        if (existing && existing.length) {
          const updated = await sb('PATCH', `/rest/v1/shop_deals?${scope}&item_key=eq.${encodeURIComponent(key)}`, row);
          return send(200, updated[0] || row);
        }
        const inserted = await sb('POST', '/rest/v1/shop_deals', row);
        return send(201, inserted[0]);
      }
      return send(400, { ok: false, error: 'kind must be store or item' });
    }

    if ((req.method === 'PATCH' || req.method === 'PUT') && id && (kind === 'store' || kind === 'item')) {
      const body = await readBody(req);
      const table = kind === 'store' ? 'shop_stores' : 'shop_items';
      const row = kind === 'store' ? cleanStore(body) : cleanItem(body);
      if (kind === 'store') {
        const layoutErr = validateStoreLayout(row, body);
        if (layoutErr) return send(400, { ok: false, error: layoutErr });
      } else {
        if (typeof body.name === 'string' && body.name.trim().length > 160) return send(400, { ok: false, error: 'name too long (max 160)' });
        if (row.category && !CATEGORIES.includes(row.category)) return send(400, { ok: false, error: 'unknown category' });
      }
      delete row.user_email;
      delete row.store_id;
      row.updated_at = now;
      const updated = await sb('PATCH', `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&${scope}&deleted_at=is.null`, row);
      if (!updated.length) return send(404, { ok: false });
      if (kind === 'store' && row.preferred) {
        await sb('PATCH', `/rest/v1/shop_stores?${scope}&id=neq.${encodeURIComponent(id)}&deleted_at=is.null`, { preferred: false, updated_at: now });
      }
      return send(200, updated[0]);
    }

    if (req.method === 'DELETE' && id && (kind === 'store' || kind === 'item')) {
      if (kind === 'item') {
        await sb('PATCH', `/rest/v1/shop_items?id=eq.${encodeURIComponent(id)}&${scope}`, { deleted_at: now, updated_at: now });
      } else {
        // Deleting a store soft-deletes its items too.
        await sb('PATCH', `/rest/v1/shop_items?store_id=eq.${encodeURIComponent(id)}&${scope}`, { deleted_at: now, updated_at: now });
        await sb('PATCH', `/rest/v1/shop_stores?id=eq.${encodeURIComponent(id)}&${scope}`, { deleted_at: now, updated_at: now });
      }
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    return send(405, { ok: false });
  } catch (e) {
    console.error('shop api failed:', e.message);
    return send(500, { ok: false });
  }
};
