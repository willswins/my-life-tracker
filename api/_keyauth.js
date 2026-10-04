// Shared connector-key auth for the DayBook API.
//
// A key (`mlt_...`, via `Authorization: Bearer` or `X-API-Key`) acts only as
// the user it was issued to. Validation: sha256(key) must match a non-revoked
// row in api_keys. There is no scope column — scope is enforced by the router
// (api/app.js): a key gets full access to its owner's data except key
// management (?r=keys) and invites (?r=invites), which stay session-only.
const crypto = require('crypto');
const { sb } = require('./_db');

// Tiny per-key rate limiter (120 req/min). Best-effort on serverless.
const BUCKETS = new Map();
function rateLimit(id) {
  const now = Date.now();
  const b = BUCKETS.get(id);
  if (!b || now > b.reset) {
    BUCKETS.set(id, { count: 1, reset: now + 60000 });
    return true;
  }
  b.count += 1;
  return b.count <= 120;
}

async function keyAuth(req) {
  const raw = req.headers['authorization'] || req.headers['x-api-key'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  const key = (m ? m[1] : raw).trim();
  if (!key.startsWith('mlt_')) return null;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const rows = await sb(
    'GET',
    `/rest/v1/api_keys?key_hash=eq.${hash}&revoked_at=is.null&select=id,user_email,name`
  );
  return rows.length ? { ...rows[0], hash } : null;
}

// Best-effort last-used bookkeeping; never blocks the request.
function noteKeyUse(id) {
  sb('PATCH', `/rest/v1/api_keys?id=eq.${id}`, { last_used_at: new Date().toISOString() }).catch(() => {});
}

module.exports = { keyAuth, rateLimit, noteKeyUse };
