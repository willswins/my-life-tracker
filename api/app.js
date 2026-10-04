// Consolidated DayBook API — ONE Vercel function for all non-auth capabilities.
//
// Vercel Hobby limit: 12 functions. This dispatcher + auth.js + game.js +
// index.js + login.js = 5, well under the limit.
//
// Dispatch via ?r= parameter:
//   ?r=cards      -> card CRUD (was /api/cards)
//   ?r=comments   -> comments (was /api/comments)
//   ?r=daybook&view=reminders|journal|links|inbox|tags (was /api/daybook/[view])
//   ?r=ingest     -> connector ingest (was /api/ingest)
//   ?r=invites    -> invite management (was /api/invites)
//   ?r=keys       -> API key management (was /api/keys)
const handlers = {
  cards: require('./_cards'),
  comments: require('./_comments'),
  ingest: require('./_ingest'),
  invites: require('./_invites'),
  keys: require('./_keys'),
  daybook: require('./_daybook'),
};

module.exports = async (req, res) => {
  const url = new URL(req.url, 'https://localhost');
  const r = url.searchParams.get('r');
  const handler = handlers[r];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'unknown resource' }));
    return;
  }
  // For daybook, pass through with view param
  if (r === 'daybook') {
    req.query = req.query || {};
    req.query.view = url.searchParams.get('view');
  }
  return handler(req, res);
};
