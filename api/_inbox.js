// Inbox API, backed by Supabase Postgres. The single ingestion path: every
// capture lands here untriaged, then one tap files it as a task, reminder,
// journal entry, or link. Scoped to the signed-in user's email.
const { getSessionEmail } = require('./_session');
const { readBody, sb, cleanCard } = require('./_db');

const SOURCES = ['manual', 'email', 'chat', 'parentsquare', 'infinite-campus'];
const DESTS = ['task', 'reminder', 'journal', 'link'];
const TAGS = ['work', 'personal'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ATTACHMENTS = 6;

// Upload PDF attachments (sweep-captured email, Winny 2026-10-31) to
// private Storage; returns [{name, url}] for the item's attachments
// column. Non-fatal per file: a failed upload is skipped so the text
// capture is never lost over an attachment.
async function uploadAttachments(email, itemId, list) {
  const { uploadBase64 } = require('./_storage');
  const out = [];
  const arr = Array.isArray(list) ? list.slice(0, MAX_ATTACHMENTS) : [];
  for (const a of arr) {
    if (!a || typeof a !== 'object' || typeof a.base64 !== 'string') continue;
    const name = (typeof a.filename === 'string' && a.filename.trim() ? a.filename.trim() : 'attachment.pdf').slice(0, 120);
    try {
      const url = await uploadBase64({
        userEmail: email,
        cardId: itemId,
        filename: name,
        contentType: 'application/pdf',
        base64: a.base64,
      });
      out.push({ name, url });
    } catch (e) {
      console.error('inbox attachment upload failed:', e.message);
    }
  }
  return out;
}

function cleanTriageReminder(b) {
  const out = {};
  if (typeof b.title === 'string' && b.title.trim()) out.title = b.title.trim().slice(0, 160);
  if (typeof b.detail === 'string') out.detail = b.detail.slice(0, 5000);
  if (b.remind_at !== undefined) {
    const d = new Date(b.remind_at);
    if (isNaN(d)) throw new Error('bad remind_at');
    out.remind_at = d.toISOString();
  }
  if (b.recurrence === null || typeof b.recurrence === 'string') {
    out.recurrence = b.recurrence ? b.recurrence.trim().slice(0, 120) : null;
  }
  if (b.tag === null || TAGS.includes(b.tag)) out.tag = b.tag;
  out.status = 'active';
  out.updated_at = new Date().toISOString();
  return out;
}

async function createDestination(email, to, data) {
  const now = new Date().toISOString();
  if (to === 'task') {
    const row = cleanCard(data || {});
    if (!row.title) throw Object.assign(new Error('title required'), { status: 400 });
    row.user_email = email;
    if (!row.lane) row.lane = 'next';
    if (!row.tag) row.tag = 'work';
    if (!row.priority) row.priority = 'normal';
    const ins = await sb('POST', '/rest/v1/cards', row);
    return ins[0].id;
  }
  if (to === 'reminder') {
    let row;
    try {
      row = cleanTriageReminder(data || {});
    } catch {
      throw Object.assign(new Error('bad remind_at'), { status: 400 });
    }
    if (!row.title || !row.remind_at) {
      throw Object.assign(new Error('title and remind_at required'), { status: 400 });
    }
    row.user_email = email;
    const ins = await sb('POST', '/rest/v1/reminders', row);
    return ins[0].id;
  }
  if (to === 'journal') {
    const d = data && data.date;
    if (!d || !DATE_RE.test(d)) throw Object.assign(new Error('date required (YYYY-MM-DD)'), { status: 400 });
    const text = typeof data.text === 'string' ? data.text : '';
    const scope = `user_email=eq.${encodeURIComponent(email)}`;
    const existing = await sb('GET', `/rest/v1/journal_entries?${scope}&date=eq.${d}`);
    const body = (existing[0] && existing[0].body ? existing[0].body + '\n\n' : '') + text;
    let row;
    if (existing[0]) {
      const p = await sb('PATCH', `/rest/v1/journal_entries?${scope}&date=eq.${d}`, { body, updated_at: now });
      row = p[0];
    } else {
      const ins = await sb('POST', '/rest/v1/journal_entries', { user_email: email, date: d, body });
      row = ins[0];
    }
    return row.id;
  }
  if (to === 'link') {
    const u = data && typeof data.url === 'string' ? data.url.trim() : '';
    if (!u) throw Object.assign(new Error('url required'), { status: 400 });
    const scope = `user_email=eq.${encodeURIComponent(email)}`;
    const found = await sb('GET', `/rest/v1/links?${scope}&url=eq.${encodeURIComponent(u)}`);
    if (found[0]) return found[0].id;
    const ins = await sb('POST', '/rest/v1/links', {
      user_email: email,
      url: u.slice(0, 2000),
      title: (typeof data.title === 'string' && data.title.trim() ? data.title.trim() : u).slice(0, 200),
      source: typeof data.source === 'string' ? data.source.slice(0, 300) : null,
      tags: typeof data.tags === 'string' ? data.tags.slice(0, 500) : '',
      notes: typeof data.notes === 'string' ? data.notes.slice(0, 2000) : '',
    });
    return ins[0].id;
  }
  throw Object.assign(new Error('unknown destination'), { status: 400 });
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

    if (req.method === 'GET' && url.searchParams.get('badge') === '1') {
      const rows = await sb('GET', `/rest/v1/inbox_items?${scope}&triaged=eq.false&is_read=eq.false&select=id`);
      return send(200, { count: rows.length });
    }
    if (req.method === 'GET') {
      const t = url.searchParams.get('triaged') || 'false';
      const f = t === 'all' ? '' : `&triaged=eq.${t === 'true'}`;
      const rows = await sb('GET', `/rest/v1/inbox_items?${scope}${f}&order=created_at.desc`);
      return send(200, rows);
    }
    if (req.method === 'POST' && !id) {
      const body = await readBody(req);
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) return send(400, { ok: false, error: 'text required' });
      const source = SOURCES.includes(body.source) ? body.source : 'manual';
      const inserted = await sb('POST', '/rest/v1/inbox_items', {
        user_email: email,
        text: text.slice(0, 20000),
        source,
        source_ref: typeof body.source_ref === 'string' ? body.source_ref.slice(0, 300) : null,
      });
      const item = inserted[0];
      // Optional photo: upload to private Supabase Storage, store the signed
      // URL on the item. The text capture is never lost because of a photo
      // failure — a failed upload only adds image_error.
      if (body.image && typeof body.image === 'object') {
        try {
          const { uploadBase64 } = require('./_storage');
          const url = await uploadBase64({
            userEmail: email,
            cardId: item.id,
            filename: body.image.filename,
            contentType: body.image.contentType,
            base64: body.image.base64,
          });
          const patched = await sb('PATCH', `/rest/v1/inbox_items?id=eq.${encodeURIComponent(item.id)}&${scope}`, { image_url: url });
          item.image_url = (patched[0] && patched[0].image_url) || url;
        } catch (e) {
          console.error('inbox image upload failed:', e.message);
          item.image_error = 'photo could not be saved';
        }
      }
      // Optional PDF attachments (email captures): same non-fatal pattern
      // as the photo — uploaded to private Storage, signed URLs stored in
      // the item's attachments column as [{name, url}].
      if (Array.isArray(body.attachments) && body.attachments.length) {
        const atts = await uploadAttachments(email, item.id, body.attachments);
        if (atts.length) {
          const patched = await sb('PATCH', `/rest/v1/inbox_items?id=eq.${encodeURIComponent(item.id)}&${scope}`, { attachments: atts });
          item.attachments = (patched[0] && patched[0].attachments) || atts;
        } else {
          item.attachments_error = 'attachments could not be saved';
        }
      }
      return send(201, item);
    }
    if (req.method === 'POST' && id) {
      const body = await readBody(req);
      const to = body.to;
      if (!DESTS.includes(to)) return send(400, { ok: false, error: 'to must be task|reminder|journal|link' });
      const items = await sb('GET', `/rest/v1/inbox_items?id=eq.${encodeURIComponent(id)}&${scope}&triaged=eq.false`);
      if (!items[0]) return send(404, { ok: false, error: 'item not found or already triaged' });
      let destId;
      try {
        destId = await createDestination(email, to, body.data);
      } catch (e) {
        return send(e.status || 500, { ok: false, error: e.status ? e.message : undefined });
      }
      // Sequential calls are fine here; the triaged=eq.false guard keeps it safe.
      const now = new Date().toISOString();
      await sb('PATCH', `/rest/v1/inbox_items?id=eq.${encodeURIComponent(id)}&${scope}&triaged=eq.false`, {
        triaged: true,
        triaged_to_type: to,
        triaged_to_id: destId,
        triaged_at: now,
        updated_at: now,
      });
      return send(200, { ok: true, to, id: destId });
    }
    if (req.method === 'PATCH' && id) {
      // Text-only update (used by the body backfill): the owner can replace
      // an item's text, nothing else. Triage still goes through POST.
      const body = await readBody(req);
      // Read-state update (2026-10-30): opening a capture marks it read,
      // which un-bolds its row. Only the flag may change this way.
      if (typeof body.is_read === 'boolean') {
        const nowRead = new Date().toISOString();
        const readPatched = await sb('PATCH', `/rest/v1/inbox_items?id=eq.${encodeURIComponent(id)}&${scope}`, {
          is_read: body.is_read,
          updated_at: nowRead,
        });
        if (!readPatched[0]) return send(404, { ok: false, error: 'item not found' });
        return send(200, readPatched[0]);
      }
      // Attachments update (2026-10-31): append uploaded PDFs to the
      // item's attachments (used by the Sara attachment pass, which finds
      // the PDFs behind a ParentSquare post after the capture exists).
      if (Array.isArray(body.attachments)) {
        const existing = await sb('GET', `/rest/v1/inbox_items?id=eq.${encodeURIComponent(id)}&${scope}&select=attachments`);
        if (!existing[0]) return send(404, { ok: false, error: 'item not found' });
        const cur = Array.isArray(existing[0].attachments) ? existing[0].attachments : [];
        const added = await uploadAttachments(email, id, body.attachments);
        const merged = cur.concat(added).slice(0, MAX_ATTACHMENTS);
        const attPatched = await sb('PATCH', `/rest/v1/inbox_items?id=eq.${encodeURIComponent(id)}&${scope}`, {
          attachments: merged,
          updated_at: new Date().toISOString(),
        });
        if (!attPatched[0]) return send(404, { ok: false, error: 'item not found' });
        return send(200, attPatched[0]);
      }
      if (typeof body.text !== 'string' || !body.text.trim()) {
        return send(400, { ok: false, error: 'text required' });
      }
      const now = new Date().toISOString();
      const patched = await sb('PATCH', `/rest/v1/inbox_items?id=eq.${encodeURIComponent(id)}&${scope}`, {
        text: body.text.slice(0, 20000),
        updated_at: now,
      });
      if (!patched[0]) return send(404, { ok: false, error: 'item not found' });
      return send(200, patched[0]);
    }
    if (req.method === 'DELETE' && id) {
      // Best-effort: remove stored files too (photo + PDF attachments),
      // so discards don't orphan files in Storage. Row deletion must
      // never fail over this.
      try {
        const rows = await sb('GET', `/rest/v1/inbox_items?id=eq.${encodeURIComponent(id)}&${scope}&select=image_url,attachments`);
        const row0 = rows[0] || {};
        const urls = [];
        if (row0.image_url) urls.push(row0.image_url);
        if (Array.isArray(row0.attachments)) {
          row0.attachments.forEach((a) => { if (a && a.url) urls.push(a.url); });
        }
        if (urls.length) {
          const { deleteFile, pathFromSignedUrl } = require('./_storage');
          for (const u of urls) {
            const p = pathFromSignedUrl(u);
            if (p) await deleteFile(p);
          }
        }
      } catch (e) {
        console.error('inbox file cleanup failed:', e.message);
      }
      await sb('DELETE', `/rest/v1/inbox_items?id=eq.${encodeURIComponent(id)}&${scope}`);
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    return send(405, { ok: false });
  } catch (e) {
    console.error('inbox api failed:', e.message);
    return send(500, { ok: false });
  }
};
