// GET /api/config — public: returns the Google OAuth client ID for the sign-in button.
module.exports = (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ clientId: process.env.GOOGLE_CLIENT_ID || '' }));
};
