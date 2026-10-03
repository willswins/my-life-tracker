// API key management for connectors. Session-authenticated: a signed-in user
// can only manage their own keys.
//   GET    /api/keys        -> [{id, name, key_prefix, created_at, last_used_at, revoked_at}]
//   POST   /api/keys {name} -> {id, name, key}  (key plaintext shown ONCE)
//   DELETE /api/keys?id=... -> revokes the key
const crypto = require('crypto');
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
    res.end(JSON.stringify(data));
  };
  try {
    const url = new URL(req.url, 'https://localhost');
    const scope = `user_email=eq.${encodeURIComponent(email)}`;

    if (req.method === 'GET') {
      const rows = await sb(
        'GET',
        `/rest/v1/api_keys?${scope}&select=id,name,key_prefix,created_at,last_used_at,revoked_at&order=created_at.desc`
      );
      return send(200, rows);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = (body.name || '').trim().slice(0, 80) || 'Unnamed connector';
      const key = 'mlt_' + crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(key).digest('hex');
      const inserted = await sb('POST', '/rest/v1/api_keys', {
        user_email: email,
        name,
        key_prefix: key.slice(0, 12),
        key_hash: hash,
      });
      return send(201, { id: inserted[0].id, name: inserted[0].name, key });
    }
    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return send(400, { ok: false, error: 'Missing id' });
      await sb('PATCH', `/rest/v1/api_keys?id=eq.${encodeURIComponent(id)}&${scope}`, {
        revoked_at: new Date().toISOString(),
      });
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    return send(405, { ok: false });
  } catch (e) {
    console.error('keys api failed:', e.message);
    return send(500, { ok: false });
  }
};
