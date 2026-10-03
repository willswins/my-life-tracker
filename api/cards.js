// Cards API, backed by Supabase Postgres. Every request is scoped to the
// signed-in user's email from the session cookie; the service_role key
// never leaves the server.
const { getSessionEmail } = require('./_session');
const { readBody, sb } = require('./_db');

const TAGS = ['work', 'personal'];
const PRIORITIES = ['high', 'normal', 'low'];
const LANES = ['now', 'next', 'waiting', 'done'];
const ISSUE_TYPES = ['task', 'bug', 'story'];

function clean(card) {
  const out = {};
  if (typeof card.title === 'string' && card.title.trim()) out.title = card.title.trim().slice(0, 160);
  if (typeof card.details === 'string') out.details = card.details.slice(0, 2000);
  if (TAGS.includes(card.tag)) out.tag = card.tag;
  if (PRIORITIES.includes(card.priority)) out.priority = card.priority;
  if (LANES.includes(card.lane)) out.lane = card.lane;
  if (ISSUE_TYPES.includes(card.issue_type)) out.issue_type = card.issue_type;
  if (card.due_date === null || /^\d{4}-\d{2}-\d{2}$/.test(card.due_date || '')) out.due_date = card.due_date || null;
  if (card.owner === null || typeof card.owner === 'string') out.owner = (card.owner || '').slice(0, 120) || null;
  out.updated_at = new Date().toISOString();
  return out;
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
      const rows = await sb('GET', `/rest/v1/cards?${scope}&order=created_at.asc`);
      return send(200, rows);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const row = clean(body);
      if (!row.title) return send(400, { ok: false, error: 'title required' });
      row.user_email = email;
      if (!row.tag) row.tag = 'work';
      if (!row.priority) row.priority = 'normal';
      if (!row.lane) row.lane = 'now';
      const inserted = await sb('POST', '/rest/v1/cards', row);
      return send(201, inserted[0]);
    }
    if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
      const body = await readBody(req);
      const row = clean(body);
      delete row.user_email;
      const updated = await sb('PATCH', `/rest/v1/cards?id=eq.${encodeURIComponent(id)}&${scope}`, row);
      if (!updated.length) return send(404, { ok: false });
      return send(200, updated[0]);
    }
    if (req.method === 'DELETE' && id) {
      await sb('DELETE', `/rest/v1/cards?id=eq.${encodeURIComponent(id)}&${scope}`);
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    return send(405, { ok: false });
  } catch (e) {
    console.error('cards api failed:', e.message);
    return send(500, { ok: false });
  }
};
