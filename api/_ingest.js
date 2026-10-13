// Connector ingest API: lets external sources (journal app, email automation)
// create cards without a browser session. Auth is a per-connector API key
// (validated by the router in api/app.js, or directly here as a fallback);
// authz is inherent: a key acts only as the user it was issued to.
//
//   POST /api/app?r=ingest   {title, details?, tag?, priority?, issue_type?, lane?, due_date?, owner?}
//   GET  /api/app?r=ingest   -> { ok, user, cards } (latest 50 active, for dedup)
//
// Auth:  Authorization: Bearer mlt_...   (or X-API-Key: mlt_...)
const { keyAuth } = require('./_keyauth');
const { readBody, sb, cleanCard } = require('./_db');
const { uploadBase64 } = require('./_storage');

module.exports = async (req, res) => {
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  try {
    // The router (api/app.js) already key-auths, rate-limits, and books
    // usage; fall back to a direct check if invoked without it.
    const k = req.keyAuth || await keyAuth(req);
    if (!k) {
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'WWW-Authenticate': 'Bearer realm="ingest"',
      });
      res.end(JSON.stringify({ ok: false, error: 'invalid or revoked API key' }));
      return;
    }
    const email = encodeURIComponent(k.user_email);

    if (req.method === 'GET') {
      const rows = await sb(
        'GET',
        `/rest/v1/cards?user_email=eq.${email}&deleted_at=is.null&select=id,title,lane,tag,priority,created_at&order=created_at.desc&limit=50`
      );
      return send(200, { ok: true, user: k.user_email, connector: k.name, cards: rows });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      // Attachment upload: { action:'upload', card_id, filename, content_type, data (base64) }
      // Stores the image in private Supabase Storage and appends a signed-URL
      // markdown image to the card's details.
      // Attachment removal: { action:'remove-upload', card_id, filename }
      if (body.action === 'remove-upload') {
        const cardId = String(body.card_id || '').trim();
        const filename = String(body.filename || '').replace(/[\[\]]/g, '');
        if (!cardId || !filename) return send(400, { ok: false, error: 'card_id and filename are required' });
        const rows = await sb(
          'GET',
          `/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}&user_email=eq.${email}&deleted_at=is.null&select=id,details`
        );
        if (!rows.length) return send(404, { ok: false, error: 'card not found' });
        const pat = new RegExp('\\n*!\\[' + filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]\\([^)]+\\)', 'g');
        const next = (rows[0].details || '').replace(pat, '').trim();
        await sb('PATCH', `/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}&user_email=eq.${email}`, {
          details: next.slice(-2000),
          updated_at: new Date().toISOString(),
        });
        return send(200, { ok: true, card_id: cardId, removed: filename });
      }
      if (body.action === 'upload') {
        const cardId = String(body.card_id || '').trim();
        const filename = String(body.filename || 'receipt').slice(0, 120);
        const contentType = String(body.content_type || '');
        const data = String(body.data || '');
        if (!cardId || !data) return send(400, { ok: false, error: 'card_id and data (base64) are required' });
        const rows = await sb(
          'GET',
          `/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}&user_email=eq.${email}&deleted_at=is.null&select=id,details`
        );
        if (!rows.length) return send(404, { ok: false, error: 'card not found' });
        try {
          const url = await uploadBase64({ userEmail: k.user_email, cardId, filename, contentType, base64: data });
          const altText = filename.replace(/[\[\]]/g, '');
          const cur = rows[0].details || '';
          // Dedupe: replace any existing attachment with the same filename
          const pat = new RegExp('\\n*!\\[' + altText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]\\([^)]+\\)', 'g');
          const deduped = cur.replace(pat, '').trim();
          const next = (deduped ? deduped + '\n\n' : '') + `![${altText}](${url})`;
          await sb('PATCH', `/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}&user_email=eq.${email}`, {
            details: next.slice(-2000),
            updated_at: new Date().toISOString(),
          });
          return send(200, { ok: true, card_id: cardId, url });
        } catch (e) {
          console.error('upload failed:', e.message);
          return send(400, { ok: false, error: e.message });
        }
      }
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
