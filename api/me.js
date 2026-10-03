// GET /api/me — returns the signed-in email and admin flag, or 401.
const { getSessionEmail } = require('./_session');
const { isAdmin } = require('./_authz');

module.exports = async (req, res) => {
  const email = getSessionEmail(req, process.env.SESSION_SECRET || '');
  if (!email) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ ok: true, email, admin: await isAdmin(email) }));
};
