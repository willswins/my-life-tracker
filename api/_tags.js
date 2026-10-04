// Tags API, backed by Supabase Postgres. Master list of the user's tags.
// Scoped to the signed-in user's email.
const { getSessionEmail } = require('./_session');
const { readBody, sb } = require('./_db');

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
      const rows = await sb('GET', `/rest/v1/tags?${scope}&order=name.asc`);
      return send(200, rows);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 50) : '';
      if (!name) return send(400, { ok: false, error: 'name required' });
      const row = {
        user_email: email,
        name,
        color: typeof body.color === 'string' ? body.color.slice(0, 20) : null,
      };
      const inserted = await sb('POST', '/rest/v1/tags', row, { upsert: true });
      return send(201, inserted[0]);
    }
    if (req.method === 'DELETE' && id) {
      await sb('DELETE', `/rest/v1/tags?id=eq.${encodeURIComponent(id)}&${scope}`);
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    return send(405, { ok: false });
  } catch (e) {
    console.error('tags api failed:', e.message);
    return send(500, { ok: false });
  }
};
