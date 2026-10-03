// Cards API, backed by Supabase Postgres. Every request is scoped to the
// signed-in user's email from the session cookie; the service_role key
// never leaves the server.
const { getSessionEmail } = require('./_session');
const { readBody, sb, cleanCard: clean } = require('./_db');

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
    const scope = `user_email=eq.${encodeURIComponent(email)}`;

    if (req.method === 'GET') {
      const mode = url.searchParams.get('deleted');
      const del = mode === 'only' ? 'deleted_at=not.is.null' : mode === 'all' ? '' : 'deleted_at=is.null';
      const rows = await sb('GET', `/rest/v1/cards?${scope}${del ? '&' + del : ''}&order=created_at.asc`);
      return send(200, rows);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const row = clean(body);
      if (!row.title) return send(400, { ok: false, error: 'title required' });
      row.user_email = email;
      if (!row.tag) row.tag = 'work';
      if (!row.priority) row.priority = 'normal';
      if (!row.lane) row.lane = 'now';
      const inserted = await sb('POST', '/rest/v1/cards', row);
      return send(201, inserted[0]);
    }
    if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
      const body = await readBody(req);
      const row = clean(body);
      delete row.user_email;
      if (body.restore === true) row.deleted_at = null;
      const updated = await sb('PATCH', `/rest/v1/cards?id=eq.${encodeURIComponent(id)}&${scope}`, row);
      if (!updated.length) return send(404, { ok: false });
      return send(200, updated[0]);
    }
    if (req.method === 'DELETE' && id) {
      const q = `id=eq.${encodeURIComponent(id)}&${scope}`;
      if (url.searchParams.get('hard') === 'true') {
        await sb('DELETE', `/rest/v1/cards?${q}`);
      } else {
        await sb('PATCH', `/rest/v1/cards?${q}`, { deleted_at: new Date().toISOString() });
      }
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    return send(405, { ok: false });
  } catch (e) {
    console.error('cards api failed:', e.message);
    return send(500, { ok: false });
  }
};
