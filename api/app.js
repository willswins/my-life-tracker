// Consolidated DayBook API — ONE Vercel function for all non-auth capabilities.
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
  // For daybook, ensure the view is available via req.query
  // Vercel populates req.query from the URL, but we set it explicitly to be safe
  if (r === 'daybook') {
    const view = url.searchParams.get('view');
    // Create a new query object to avoid mutating frozen objects
    req.query = Object.assign({}, req.query, { view: view });
  }
  return handler(req, res);
};
