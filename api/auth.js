// Consolidated auth API — merges /api/me, /api/session, /api/config, /api/logout
// into a single serverless function to stay under Vercel's Hobby limit.
// Dispatch via ?action=me|session|config|logout
const { getSessionEmail } = require('./_session');
const { isAdmin } = require('./_authz');
const { createSession } = require('./_session');
const { isAllowed } = require('./_authz');
const crypto = require('crypto');

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

async function handleMe(req, res) {
  const email = getSessionEmail(req, process.env.SESSION_SECRET || '');
  if (!email) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ ok: true, email, admin: await isAdmin(email) }));
}

async function handleSession(req, res) {
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

    const email = (payload.email || '').toLowerCase();
    if (!payload.email_verified || !email || !/^[^\s@]+@(gmail|googlemail)\.com$/.test(email)) {
      res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: 'gmail_only' }));
      return;
    }
    if (!(await isAllowed(email))) {
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
}

function handleConfig(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ clientId: process.env.GOOGLE_CLIENT_ID || '' }));
}

function handleLogout(req, res) {
  res.writeHead(302, {
    Location: '/login',
    'Set-Cookie': 'kb_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    'Cache-Control': 'no-store',
  });
  res.end();
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'https://localhost');
  const action = url.searchParams.get('action');
  
  switch (action) {
    case 'me':
      return handleMe(req, res);
    case 'session':
      return handleSession(req, res);
    case 'config':
      return handleConfig(req, res);
    case 'logout':
      return handleLogout(req, res);
    default:
      res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: 'unknown action' }));
  }
};
