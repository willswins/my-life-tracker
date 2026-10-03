// Invite management. Admin-only: the signed-in user must have the admin role.
//   GET    /api/invites          -> [{email, role, invited_by, created_at}]
//   POST   /api/invites {email}  -> invites as member
//   DELETE /api/invites?email=.. -> removes (never self, never the last admin)
const { getSessionEmail } = require('./_session');
const { isAdmin } = require('./_authz');
const { readBody, sb } = require('./_db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  const email = getSessionEmail(req, process.env.SESSION_SECRET || '');
  if (!email) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  if (!(await isAdmin(email))) {
    res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'admin_only' }));
    return;
  }
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  try {
    const url = new URL(req.url, 'https://localhost');

    if (req.method === 'GET') {
      const rows = await sb(
        'GET',
        '/rest/v1/allowed_users?select=email,role,invited_by,created_at&order=created_at.asc'
      );
      return send(200, rows);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const target = (body.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(target)) return send(400, { ok: false, error: 'valid email required' });
      const existing = await sb(
        'GET',
        `/rest/v1/allowed_users?email=eq.${encodeURIComponent(target)}&select=email`
      );
      if (existing.length) return send(409, { ok: false, error: 'already_invited' });
      const inserted = await sb('POST', '/rest/v1/allowed_users', {
        email: target,
        role: 'member',
        invited_by: email,
      });
      return send(201, inserted[0]);
    }
    if (req.method === 'DELETE') {
      const target = (url.searchParams.get('email') || '').trim().toLowerCase();
      if (!target) return send(400, { ok: false, error: 'Missing email' });
      if (target === email.toLowerCase()) return send(400, { ok: false, error: 'cannot_remove_self' });
      const targetRow = await sb(
        'GET',
        `/rest/v1/allowed_users?email=eq.${encodeURIComponent(target)}&select=role`
      );
      if (!targetRow.length) return send(404, { ok: false });
      if (targetRow[0].role === 'admin') {
        const admins = await sb('GET', '/rest/v1/allowed_users?role=eq.admin&select=email');
        if (admins.length <= 1) return send(400, { ok: false, error: 'cannot_remove_last_admin' });
      }
      await sb('DELETE', `/rest/v1/allowed_users?email=eq.${encodeURIComponent(target)}`);
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    return send(405, { ok: false });
  } catch (e) {
    console.error('invites api failed:', e.message);
    return send(500, { ok: false });
  }
};
