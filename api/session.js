// POST /api/session — verifies a Google ID token (RS256, Google's public certs),
// checks the email against ALLOWED_EMAILS, and sets a signed session cookie.
// No client secret needed: the ID token signature is verified directly.
const crypto = require('crypto');
const { createSession } = require('./_session');

let certsCache = null;
let certsExpiresAt = 0;

async function getGoogleCerts() {
  if (certsCache && Date.now() < certsExpiresAt) return certsCache;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('certs_fetch_failed');
  certsCache = await r.json();
  certsExpiresAt = Date.now() + 3600 * 1000;
  return certsCache;
}

function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const { credential } = JSON.parse(body || '{}');
    if (!credential) throw new Error('no_credential');

    const parts = credential.split('.');
    if (parts.length !== 3) throw new Error('bad_token');
    const header = JSON.parse(b64urlDecode(parts[0]).toString('utf8'));
    const payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));

    const certs = await getGoogleCerts();
    const jwk = (certs.keys || []).find((k) => k.kid === header.kid);
    if (!jwk) throw new Error('unknown_kid');
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const signed = Buffer.from(parts[0] + '.' + parts[1], 'utf8');
    const signatureOk = crypto.verify('sha256', signed, key, b64urlDecode(parts[2]));
    if (!signatureOk) throw new Error('bad_signature');

    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
      throw new Error('bad_iss');
    }
    if (payload.aud !== (process.env.GOOGLE_CLIENT_ID || '')) throw new Error('bad_aud');
    if (typeof payload.exp !== 'number' || payload.exp < now) throw new Error('expired');

    const allowed = (process.env.ALLOWED_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const email = (payload.email || '').toLowerCase();
    if (!payload.email_verified || !email || !allowed.includes(email)) {
      res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: 'not_allowed' }));
      return;
    }

    const session = createSession(email, process.env.SESSION_SECRET || '');
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `kb_session=${encodeURIComponent(session)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    console.error('session failed:', e.message);
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false }));
  }
};
