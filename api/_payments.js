// Payments API, backed by Supabase Postgres. The record of money:
// payments made, debts/bills owed, and monthly recurring items. By design
// (Winny, 2026-10-27) this is a record, not a tally — no totals are kept
// or computed here. Scoped to the signed-in user's email.
const { getSessionEmail } = require('./_session');
const { readBody, sb } = require('./_db');

const STATUSES = ['paid', 'due', 'overdue'];
const KINDS = ['payment', 'debt', 'monthly'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanPayment(b) {
  const out = {};
  if (b.item_date === null || DATE_RE.test(b.item_date || '')) out.item_date = b.item_date || null;
  if (typeof b.payee === 'string' && b.payee.trim()) out.payee = b.payee.trim().slice(0, 160);
  if (typeof b.description === 'string') out.description = b.description.slice(0, 20000);
  if (typeof b.comments === 'string') out.comments = b.comments.slice(0, 5000);
  if (b.amount === null || b.amount === '' || !isNaN(Number(b.amount))) {
    out.amount = (b.amount === null || b.amount === '') ? null : Number(b.amount);
  }
  if (STATUSES.includes(b.status)) out.status = b.status;
  if (KINDS.includes(b.kind)) out.kind = b.kind;
  if (typeof b.source === 'string') out.source = b.source.slice(0, 50);
  if (typeof b.source_ref === 'string') out.source_ref = b.source_ref.slice(0, 300);
  if (typeof b.acknowledged === 'boolean') out.acknowledged = b.acknowledged;
  if (typeof b.attention === 'boolean') out.attention = b.attention;
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
      const rows = await sb('GET', `/rest/v1/payment_items?${scope}&order=item_date.desc.nullslast,created_at.desc`);
      return send(200, rows);
    }
    if (req.method === 'POST' && !id) {
      const body = await readBody(req);
      const row = cleanPayment(body);
      if (!row.payee && !row.description) return send(400, { ok: false, error: 'payee or description required' });
      if (!row.status) row.status = 'paid';
      if (!row.kind) row.kind = 'payment';
      row.user_email = email;
      const ins = await sb('POST', '/rest/v1/payment_items', row);
      return send(201, ins[0]);
    }
    if (req.method === 'PATCH' && id) {
      // Status, acknowledgement, and attention updates only. Viewing the
      // page never changes these — only explicit actions do, so the menu
      // bubble count stays until the user acts.
      const body = await readBody(req);
      const patch = { updated_at: new Date().toISOString() };
      if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) {
          return send(400, { ok: false, error: 'status must be paid|due|overdue' });
        }
        patch.status = body.status;
      }
      if (body.acknowledged !== undefined) {
        if (typeof body.acknowledged !== 'boolean') {
          return send(400, { ok: false, error: 'acknowledged must be boolean' });
        }
        patch.acknowledged = body.acknowledged;
      }
      if (body.attention !== undefined) {
        if (typeof body.attention !== 'boolean') {
          return send(400, { ok: false, error: 'attention must be boolean' });
        }
        patch.attention = body.attention;
      }
      if (body.comments !== undefined) {
        if (typeof body.comments !== 'string') {
          return send(400, { ok: false, error: 'comments must be a string' });
        }
        patch.comments = body.comments.slice(0, 5000);
      }
      if (Object.keys(patch).length === 1) {
        return send(400, { ok: false, error: 'nothing to update' });
      }
      const patched = await sb('PATCH', `/rest/v1/payment_items?id=eq.${encodeURIComponent(id)}&${scope}`, patch);
      if (!patched[0]) return send(404, { ok: false, error: 'item not found' });
      return send(200, patched[0]);
    }
    if (req.method === 'DELETE' && id) {
      await sb('DELETE', `/rest/v1/payment_items?id=eq.${encodeURIComponent(id)}&${scope}`);
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    return send(405, { ok: false });
  } catch (e) {
    console.error('payments api failed:', e.message);
    return send(500, { ok: false });
  }
};
