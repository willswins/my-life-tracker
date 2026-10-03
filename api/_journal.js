// Journal API, backed by Supabase Postgres. One row per calendar date per
// user; writes are always upserts. Scoped to the signed-in user's email.
const { getSessionEmail } = require('./_session');
const { readBody, sb } = require('./_db');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}`;
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
    const date = url.searchParams.get('date');
    const month = url.searchParams.get('month');
    const scope = `user_email=eq.${encodeURIComponent(email)}`;

    if (req.method === 'GET' && date) {
      if (!DATE_RE.test(date)) return send(400, { ok: false, error: 'bad date' });
      const rows = await sb('GET', `/rest/v1/journal_entries?${scope}&date=eq.${date}`);
      // Send JSON null explicitly — the shared send() helper turns null into an
      // empty body, which would break the client's response.json().
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(rows[0] || null));
      return;
    }
    if (req.method === 'GET' && month) {
      if (!MONTH_RE.test(month)) return send(400, { ok: false, error: 'bad month' });
      const rows = await sb(
        'GET',
        `/rest/v1/journal_entries?${scope}&date=gte.${month}-01&date=lt.${nextMonth(month)}-01&select=date&order=date.asc`
      );
      return send(200, rows.map((r) => r.date));
    }
    if (req.method === 'GET' && url.searchParams.get('list') !== null) {
      let n = parseInt(url.searchParams.get('list') || '60', 10);
      if (!Number.isFinite(n) || n < 1) n = 60;
      n = Math.min(n, 200);
      const rows = await sb(
        'GET',
        `/rest/v1/journal_entries?${scope}&select=date,body&order=date.desc&limit=${n}`
      );
      return send(
        200,
        rows.map((r) => ({
          date: r.date,
          preview: (r.body || '').replace(/\s+/g, ' ').trim().slice(0, 140),
        }))
      );
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const d = body.date;
      if (!d || !DATE_RE.test(d)) return send(400, { ok: false, error: 'date required (YYYY-MM-DD)' });
      const now = new Date().toISOString();
      const fields = {
        body: typeof body.body === 'string' ? body.body.slice(0, 20000) : '',
        updated_at: now,
      };
      if (body.auto_summary === null || typeof body.auto_summary === 'string') {
        fields.auto_summary = body.auto_summary ? body.auto_summary.slice(0, 5000) : null;
      }
      // Upsert via PATCH-then-POST (no upsert helper in _db.js).
      const patched = await sb('PATCH', `/rest/v1/journal_entries?${scope}&date=eq.${d}`, fields);
      if (patched.length) return send(200, patched[0]);
      const inserted = await sb('POST', '/rest/v1/journal_entries', {
        user_email: email,
        date: d,
        ...fields,
      });
      return send(201, inserted[0]);
    }
    if (req.method === 'DELETE' && date) {
      if (!DATE_RE.test(date)) return send(400, { ok: false, error: 'bad date' });
      await sb('DELETE', `/rest/v1/journal_entries?${scope}&date=eq.${date}`);
      return send(200, { ok: true });
    }
    return send(405, { ok: false });
  } catch (e) {
    console.error('journal api failed:', e.message);
    return send(500, { ok: false });
  }
};
