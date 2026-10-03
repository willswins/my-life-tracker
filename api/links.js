// Links API, backed by Supabase Postgres. The link shelf: searchable,
// tag-filtered, de-duplicated per user on (user_email, url).
const { getSessionEmail } = require('./_session');
const { readBody, sb } = require('./_db');

function cleanLink(b) {
  const out = {};
  if (typeof b.url === 'string' && b.url.trim()) out.url = b.url.trim().slice(0, 2000);
  if (typeof b.title === 'string' && b.title.trim()) out.title = b.title.trim().slice(0, 200);
  if (b.source === null || typeof b.source === 'string') out.source = b.source ? b.source.slice(0, 300) : null;
  if (typeof b.tags === 'string') out.tags = b.tags.slice(0, 500);
  if (typeof b.notes === 'string') out.notes = b.notes.slice(0, 2000);
  out.updated_at = new Date().toISOString();
  return out;
}

async function findByUrl(email, url) {
  const scope = `user_email=eq.${encodeURIComponent(email)}`;
  const rows = await sb('GET', `/rest/v1/links?${scope}&url=eq.${encodeURIComponent(url)}`);
  return rows[0] || null;
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
    const q = url.searchParams.get('q');
    const tag = url.searchParams.get('tag');
    const scope = `user_email=eq.${encodeURIComponent(email)}`;

    if (req.method === 'GET') {
      let f = scope;
      if (q) {
        // PostgREST `or` syntax: structure stays literal, the search term is
        // encoded so & , ( ) inside it cannot break the query.
        const t = encodeURIComponent(q);
        f += `&or=(title.ilike.*${t}*,url.ilike.*${t}*,source.ilike.*${t}*,tags.ilike.*${t}*,notes.ilike.*${t}*)`;
      }
      if (tag) f += `&tags=ilike.*${encodeURIComponent(tag)}*`;
      const rows = await sb('GET', `/rest/v1/links?${f}&order=captured_at.desc`);
      return send(200, rows);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const row = cleanLink(body);
      if (!row.url || !row.title) return send(400, { ok: false, error: 'url and title required' });
      const existing = await findByUrl(email, row.url);
      if (existing) return send(200, { ...existing, alreadySaved: true });
      row.user_email = email;
      if (!row.tags) row.tags = '';
      if (!row.notes) row.notes = '';
      const inserted = await sb('POST', '/rest/v1/links', row);
      return send(201, inserted[0]);
    }
    if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
      const body = await readBody(req);
      const row = cleanLink(body);
      delete row.user_email;
      if (row.url) {
        const clash = await sb(
          'GET',
          `/rest/v1/links?${scope}&url=eq.${encodeURIComponent(row.url)}&id=neq.${encodeURIComponent(id)}&select=id`
        );
        if (clash.length) return send(409, { ok: false, error: 'url already saved' });
      }
      const updated = await sb('PATCH', `/rest/v1/links?id=eq.${encodeURIComponent(id)}&${scope}`, row);
      if (!updated.length) return send(404, { ok: false });
      return send(200, updated[0]);
    }
    if (req.method === 'DELETE' && id) {
      await sb('DELETE', `/rest/v1/links?id=eq.${encodeURIComponent(id)}&${scope}`);
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    return send(405, { ok: false });
  } catch (e) {
    console.error('links api failed:', e.message);
    return send(500, { ok: false });
  }
};
