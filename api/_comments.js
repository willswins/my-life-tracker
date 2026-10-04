// Comments API, backed by Supabase Postgres. A comment is always verified
// against a card owned by the signed-in user before read or write.
const { getSessionEmail } = require('./_session');
const { readBody, sb } = require('./_db');

async function ownsCard(id, email) {
  const rows = await sb(
    'GET',
    `/rest/v1/cards?id=eq.${encodeURIComponent(id)}&user_email=eq.${encodeURIComponent(email)}&select=id`
  );
  return rows.length > 0;
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
    res.end(JSON.stringify(data));
  };
  try {
    const url = new URL(req.url, 'https://localhost');
    const cardId = url.searchParams.get('card_id');

    if (req.method === 'GET' && cardId) {
      if (!(await ownsCard(cardId, email))) return send(404, { ok: false });
      const rows = await sb(
        'GET',
        `/rest/v1/comments?card_id=eq.${encodeURIComponent(cardId)}&order=created_at.asc&select=id,body,user_email,created_at`
      );
      return send(200, rows);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const text = (body.body || '').trim().slice(0, 2000);
      if (!body.card_id || !text) return send(400, { ok: false, error: 'card_id and body required' });
      if (!(await ownsCard(body.card_id, email))) return send(404, { ok: false });
      const inserted = await sb('POST', '/rest/v1/comments', {
        card_id: body.card_id,
        user_email: email,
        body: text,
      });
      return send(201, inserted[0]);
    }
    return send(405, { ok: false });
  } catch (e) {
    console.error('comments api failed:', e.message);
    return send(500, { ok: false });
  }
};
