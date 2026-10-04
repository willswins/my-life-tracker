// Connector ingest API: lets external sources (journal app, email automation)
// create cards without a browser session. Auth is a per-connector API key;
// authz is inherent: a key acts only as the user it was issued to, and can
// only list active cards and create new ones — never delete or touch others.
//
//   POST /api/ingest   {title, details?, tag?, priority?, issue_type?, lane?, due_date?, owner?}
//   GET  /api/ingest   -> { ok, user, cards } (latest 50 active, for dedup)
//
// Auth:  Authorization: Bearer mlt_...   (or X-API-Key: mlt_...)
const crypto = require('crypto');
const { readBody, sb, cleanCard } = require('./_db');

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

module.exports = async (req, res) => {
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  try {
    const k = await keyAuth(req);
    if (!k) {
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'WWW-Authenticate': 'Bearer realm="ingest"',
      });
      res.end(JSON.stringify({ ok: false, error: 'invalid or revoked API key' }));
      return;
    }
    if (!rateLimit(k.hash)) return send(429, { ok: false, error: 'rate limited, try again shortly' });
    const email = encodeURIComponent(k.user_email);
    // Best-effort usage bookkeeping; never blocks the request.
    sb('PATCH', `/rest/v1/api_keys?id=eq.${k.id}`, { last_used_at: new Date().toISOString() }).catch(() => {});

    if (req.method === 'GET') {
      const rows = await sb(
        'GET',
        `/rest/v1/cards?user_email=eq.${email}&deleted_at=is.null&select=id,title,lane,tag,priority,created_at&order=created_at.desc&limit=50`
      );
      return send(200, { ok: true, user: k.user_email, connector: k.name, cards: rows });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const row = cleanCard(body);
      if (!row.title) return send(400, { ok: false, error: 'title is required' });
      row.user_email = k.user_email;
      if (!row.tag) row.tag = 'work';
      if (!row.priority) row.priority = 'normal';
      if (!row.lane) row.lane = 'now';
      const inserted = await sb('POST', '/rest/v1/cards', row);
      return send(201, { ok: true, card: inserted[0] });
    }
    return send(405, { ok: false });
  } catch (e) {
    console.error('ingest api failed:', e.message);
    return send(500, { ok: false });
  }
};
