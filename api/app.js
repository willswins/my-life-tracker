// Consolidated DayBook API — ONE Vercel function for all non-auth capabilities.
//
// Auth: browser session cookie (kb_session) OR connector API key
// (Authorization: Bearer mlt_... / X-API-Key: mlt_...). A key acts only as
// the user it was issued to, with full access to that user's data — cards,
// comments, reminders, journal, links, inbox, tags — except key management
// (?r=keys) and invites (?r=invites), which stay session-only so a leaked
// key can never mint new keys or invite new users.
//
// How it works: when there is no valid session but a valid API key, the
// router mints a short-lived (120s) in-memory session for the key owner and
// presents it to downstream handlers via the request headers. The cookie
// never leaves the server, and every handler keeps scoping by user_email,
// so the security guarantee is identical to the old ?r=ingest route.
const { getSessionEmail, createSession } = require('./_session');
const { keyAuth, rateLimit, noteKeyUse } = require('./_keyauth');

const handlers = {
  cards: require('./_cards'),
  comments: require('./_comments'),
  ingest: require('./_ingest'),
  invites: require('./_invites'),
  keys: require('./_keys'),
  daybook: require('./_daybook'),
};

// Resources a connector key may never touch (session-only).
const SESSION_ONLY = new Set(['keys', 'invites']);

module.exports = async (req, res) => {
  const url = new URL(req.url, 'https://localhost');
  const r = url.searchParams.get('r');
  const handler = handlers[r];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'unknown resource' }));
    return;
  }

  const secret = process.env.SESSION_SECRET || '';
  let viaKey = false;
  if (!getSessionEmail(req, secret)) {
    // No valid session: try connector key auth (fails closed on error).
    const k = await keyAuth(req).catch(() => null);
    if (k) {
      if (!rateLimit(k.hash)) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: false, error: 'rate limited, try again shortly' }));
        return;
      }
      noteKeyUse(k.id);
      viaKey = true;
      req.keyAuth = k;
      // Present the key owner's identity to downstream handlers as a normal
      // session. New headers object to avoid mutating frozen objects.
      req.headers = Object.assign({}, req.headers, {
        cookie: `kb_session=${createSession(k.user_email, secret, 120)}`,
      });
    }
  }
  if (viaKey && SESSION_ONLY.has(r)) {
    res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'session required' }));
    return;
  }

  // For daybook, ensure the view is available via req.query
  // Vercel populates req.query from the URL, but we set it explicitly to be safe
  if (r === 'daybook') {
    const view = url.searchParams.get('view');
    // Create a new query object to avoid mutating frozen objects
    req.query = Object.assign({}, req.query, { view: view });
  }
  return handler(req, res);
};
