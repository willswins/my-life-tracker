// Reminders API, backed by Supabase Postgres. Scoped to the signed-in user's
// email from the session cookie; the service_role key never leaves the server.
const { getSessionEmail } = require('./_session');
const { readBody, sb } = require('./_db');

const TAGS = ['work', 'personal'];
const STATUSES = ['active', 'dismissed', 'snoozed'];

function cleanReminder(b) {
  const out = {};
  if (typeof b.title === 'string' && b.title.trim()) out.title = b.title.trim().slice(0, 160);
  if (typeof b.detail === 'string') out.detail = b.detail.slice(0, 2000);
  if (b.remind_at !== undefined) {
    const d = new Date(b.remind_at);
    if (isNaN(d)) throw new Error('bad remind_at');
    out.remind_at = d.toISOString();
  }
  if (b.recurrence === null) out.recurrence = null;
  else if (typeof b.recurrence === 'string') out.recurrence = b.recurrence.trim().slice(0, 120) || null;
  if (b.tag === null || TAGS.includes(b.tag)) out.tag = b.tag;
  if (STATUSES.includes(b.status)) out.status = b.status;
  out.updated_at = new Date().toISOString();
  return out;
}

// --- Minimal RRULE next-occurrence (RFC 5545 subset) ---
// Supports FREQ DAILY/WEEKLY/MONTHLY/YEARLY + INTERVAL + BYDAY + BYMONTHDAY + UNTIL.
// WEEKLY advances +7*INTERVAL days on the instant (DST edge acceptable for v1).
function parseRrule(s) {
  const o = {};
  String(s || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) o[p.slice(0, i).trim().toUpperCase()] = p.slice(i + 1).trim();
  });
  return o;
}

function nextRrule(fromIso, rrule) {
  const r = parseRrule(rrule);
  const freq = r.FREQ || '';
  const interval = Math.max(1, parseInt(r.INTERVAL || '1', 10) || 1);
  const from = new Date(fromIso);
  if (isNaN(from)) return null;
  let next;
  if (freq === 'DAILY') {
    next = new Date(from);
    next.setDate(next.getDate() + interval);
  } else if (freq === 'WEEKLY') {
    next = new Date(from);
    next.setDate(next.getDate() + 7 * interval);
  } else if (freq === 'MONTHLY') {
    next = new Date(from);
    next.setMonth(next.getMonth() + interval);
  } else if (freq === 'YEARLY') {
    next = new Date(from);
    next.setFullYear(next.getFullYear() + interval);
  } else {
    return null;
  }
  if (r.UNTIL) {
    const u = new Date(r.UNTIL);
    if (!isNaN(u) && next > u) return null;
  }
  return next.toISOString();
}

module.exports = async (req, res) => {
  const email = getSessionEmail(req, process.env.SESSION_SECRET || '');
  if (!email) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(data === null ? '' : JSON.stringify(data));
  };
  try {
    const url = new URL(req.url, 'https://localhost');
    const id = url.searchParams.get('id');
    const scope = `user_email=eq.${encodeURIComponent(email)}`;

    if (req.method === 'GET') {
      const rows = await sb('GET', `/rest/v1/reminders?${scope}&order=remind_at.asc`);
      return send(200, rows);
    }
    if (req.method === 'POST' && !id) {
      const body = await readBody(req);
      let row;
      try {
        row = cleanReminder(body);
      } catch {
        return send(400, { ok: false, error: 'bad remind_at' });
      }
      if (!row.title || !row.remind_at) return send(400, { ok: false, error: 'title and remind_at required' });
      row.user_email = email;
      if (!row.status) row.status = 'active';
      const inserted = await sb('POST', '/rest/v1/reminders', row);
      return send(201, inserted[0]);
    }
    if (req.method === 'POST' && id) {
      const body = await readBody(req);
      const action = body.action;
      const rows = await sb('GET', `/rest/v1/reminders?id=eq.${encodeURIComponent(id)}&${scope}`);
      const cur = rows[0];
      if (!cur) return send(404, { ok: false });
      const now = new Date().toISOString();
      if (action === 'dismiss') {
        let patch;
        if (cur.recurrence) {
          const next = nextRrule(cur.remind_at, cur.recurrence);
          patch = next
            ? { remind_at: next, status: 'active', last_fired_at: now, updated_at: now }
            : { status: 'dismissed', last_fired_at: now, updated_at: now };
        } else {
          patch = { status: 'dismissed', last_fired_at: now, updated_at: now };
        }
        const updated = await sb('PATCH', `/rest/v1/reminders?id=eq.${encodeURIComponent(id)}&${scope}`, patch);
        return send(200, updated[0]);
      }
      if (action === 'snooze') {
        const minutes = Math.max(1, Math.min(60 * 24 * 7, parseInt(body.minutes || '30', 10) || 30));
        const at = new Date(Date.now() + minutes * 60000).toISOString();
        const updated = await sb('PATCH', `/rest/v1/reminders?id=eq.${encodeURIComponent(id)}&${scope}`, {
          remind_at: at, status: 'snoozed', updated_at: now,
        });
        return send(200, updated[0]);
      }
      return send(400, { ok: false, error: 'unknown action' });
    }
    if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
      const body = await readBody(req);
      let row;
      try {
        row = cleanReminder(body);
      } catch {
        return send(400, { ok: false, error: 'bad remind_at' });
      }
      delete row.user_email;
      const updated = await sb('PATCH', `/rest/v1/reminders?id=eq.${encodeURIComponent(id)}&${scope}`, row);
      if (!updated.length) return send(404, { ok: false });
      return send(200, updated[0]);
    }
    if (req.method === 'DELETE' && id) {
      await sb('DELETE', `/rest/v1/reminders?id=eq.${encodeURIComponent(id)}&${scope}`);
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    return send(405, { ok: false });
  } catch (e) {
    console.error('reminders api failed:', e.message);
    return send(500, { ok: false });
  }
};

module.exports.nextRrule = nextRrule;
module.exports.parseRrule = parseRrule;
