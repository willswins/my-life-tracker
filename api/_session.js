// Shared session helpers: HMAC-signed tokens, no dependencies.
const crypto = require('crypto');

function b64urlEncode(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

function sign(email, expiry, secret) {
  return crypto.createHmac('sha256', secret).update(`${email}.${expiry}`).digest('base64url');
}

function createSession(email, secret, maxAgeSec = 60 * 60 * 24 * 30) {
  const expiry = Math.floor(Date.now() / 1000) + maxAgeSec;
  return `${b64urlEncode(email)}.${b64urlEncode(String(expiry))}.${sign(email, expiry, secret)}`;
}

function verifySession(token, secret) {
  try {
    if (!token || !secret) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const email = Buffer.from(parts[0], 'base64url').toString('utf8');
    const expiry = parseInt(Buffer.from(parts[1], 'base64url').toString('utf8'), 10);
    if (!email || !expiry || Number.isNaN(expiry)) return null;
    if (expiry < Math.floor(Date.now() / 1000)) return null;
    const expected = sign(email, expiry, secret);
    const a = Buffer.from(parts[2]);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return email;
  } catch {
    return null;
  }
}

function getSessionEmail(req, secret) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)kb_session=([^;]+)/);
  if (!m) return null;
  return verifySession(decodeURIComponent(m[1]), secret);
}

module.exports = { createSession, verifySession, getSessionEmail };
