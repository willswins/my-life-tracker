// GET /api/logout — clear the session cookie.
module.exports = (req, res) => {
  res.writeHead(302, {
    Location: '/login',
    'Set-Cookie': 'kb_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    'Cache-Control': 'no-store',
  });
  res.end();
};
