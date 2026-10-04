// DayBook views dispatcher — ONE Vercel function serving the four views.
//
// WHY THIS EXISTS: Vercel's Hobby plan allows at most 12 serverless functions
// per deployment (every non-underscore .js file under api/ counts). The board
// already uses 11, so the four views share this single dispatcher instead of
// four separate files. DO NOT add new top-level files under api/ without
// consolidating — going over 12 fails every deploy.
// The per-view logic lives in api/_reminders.js, api/_journal.js,
// api/_links.js, api/_inbox.js (underscore prefix = not counted as functions).
const handlers = {
  reminders: require('../_reminders'),
  journal: require('../_journal'),
  links: require('../_links'),
  inbox: require('../_inbox'),
  tags: require('../_tags'),
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
