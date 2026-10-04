// DayBook views dispatcher (consolidated version).
// Per-view logic in api/_reminders.js, api/_journal.js, api/_links.js,
// api/_inbox.js, api/_tags.js (underscore prefix = not counted as functions).
const handlers = {
  reminders: require('./_reminders'),
  journal: require('./_journal'),
  links: require('./_links'),
  inbox: require('./_inbox'),
  tags: require('./_tags'),
};

module.exports = async (req, res) => {
  const view = req.query && req.query.view;
  const handler = handlers[view];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'unknown view' }));
    return;
  }
  return handler(req, res);
};
