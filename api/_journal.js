// Journal API, backed by Supabase Postgres. Multiple entries per calendar
// date per user are allowed; entries are identified by UUID id.
// Scoped to the signed-in user's email.
const { getSessionEmail } = require('./_session');
const { readBody, sb } = require('./_db');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stripPreview(h) {
  return (h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
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
    const date = url.searchParams.get('date');
    const scope = `user_email=eq.${encodeURIComponent(email)}`;

    // Single entry by id.
    if (req.method === 'GET' && id) {
      if (!UUID_RE.test(id)) return send(400, { ok: false, error: 'bad id' });
      const rows = await sb('GET', `/rest/v1/journal_entries?${scope}&id=eq.${id}`);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(rows[0] || null));
      return;
    }
    // Entries for one date (array, newest first).
    if (req.method === 'GET' && date) {
      if (!DATE_RE.test(date)) return send(400, { ok: false, error: 'bad date' });
      const rows = await sb(
        'GET',
        `/rest/v1/journal_entries?${scope}&date=eq.${date}&select=id,date,title,mood,body,attachments&order=created_at.desc`
      );
      return send(200, rows);
    }
    // Full list for grouping (id, date, title, mood, preview).
    if (req.method === 'GET' && url.searchParams.get('list') !== null) {
      let n = parseInt(url.searchParams.get('list') || '200', 10);
      if (!Number.isFinite(n) || n < 1) n = 200;
      n = Math.min(n, 500);
      const rows = await sb(
        'GET',
        `/rest/v1/journal_entries?${scope}&select=id,date,title,mood,body&order=date.desc&order=created_at.desc&limit=${n}`
      );
      return send(
        200,
        rows.map((r) => ({
          id: r.id,
          date: r.date,
          title: r.title || '',
          mood: r.mood || '',
          preview: stripPreview(r.body),
        }))
      );
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const now = new Date().toISOString();
      const fields = {
        title: typeof body.title === 'string' ? body.title.slice(0, 200) : null,
        mood: typeof body.mood === 'string' ? body.mood.slice(0, 20) : null,
        body: typeof body.body === 'string' ? body.body.slice(0, 2000000) : '',
        updated_at: now,
      };
      if (Array.isArray(body.attachments)) {
        fields.attachments = body.attachments.slice(0, 20).map((a) => ({
          name: String(a.name || 'file').slice(0, 200),
          type: String(a.type || '').slice(0, 100),
          size: Number(a.size) || 0,
          data: typeof a.data === 'string' ? a.data.slice(0, 5000000) : '',
        }));
      }
      // Update an existing entry.
      if (body.id) {
        if (!UUID_RE.test(body.id)) return send(400, { ok: false, error: 'bad id' });
        const patched = await sb('PATCH', `/rest/v1/journal_entries?${scope}&id=eq.${body.id}`, fields);
        if (!patched.length) return send(404, { ok: false });
        return send(200, patched[0]);
      }
      // Create a new entry.
      const d = body.date;
      if (!d || !DATE_RE.test(d)) return send(400, { ok: false, error: 'date required (YYYY-MM-DD)' });
      const inserted = await sb('POST', '/rest/v1/journal_entries', {
        user_email: email,
        date: d,
        ...fields,
      });
      return send(201, inserted[0]);
    }
    if (req.method === 'DELETE' && id) {
      if (!UUID_RE.test(id)) return send(400, { ok: false, error: 'bad id' });
      await sb('DELETE', `/rest/v1/journal_entries?${scope}&id=eq.${id}`);
      return send(200, { ok: true });
    }
    return send(405, { ok: false });
  } catch (e) {
    console.error('journal api failed:', e.message);
    return send(500, { ok: false });
  }
};
