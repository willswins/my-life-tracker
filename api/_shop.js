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
      return send(200, { stores, items });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      if (body.kind === 'store') {
        const row = cleanStore(body);
        if (!row.name) return send(400, { ok: false, error: 'name required' });
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
        if (!row.store_id) return send(400, { ok: false, error: 'store_id required' });
        const stores = await sb('GET', `/rest/v1/shop_stores?id=eq.${encodeURIComponent(row.store_id)}&${scope}&deleted_at=is.null&select=id`);
        if (!stores.length) return send(404, { ok: false, error: 'store not found' });
        if (!row.category) row.category = 'Other';
        if (!row.qty) row.qty = '';
        if (typeof row.done !== 'boolean') row.done = false;
        row.user_email = email;
        const inserted = await sb('POST', '/rest/v1/shop_items', row);
        return send(201, inserted[0]);
      }
      return send(400, { ok: false, error: 'kind must be store or item' });
    }

    if ((req.method === 'PATCH' || req.method === 'PUT') && id && (kind === 'store' || kind === 'item')) {
      const body = await readBody(req);
      const table = kind === 'store' ? 'shop_stores' : 'shop_items';
      const row = kind === 'store' ? cleanStore(body) : cleanItem(body);
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
