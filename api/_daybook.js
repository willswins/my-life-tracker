// DayBook views dispatcher (consolidated version).
const handlers = {
  reminders: require('./_reminders'),
  journal: require('./_journal'),
  links: require('./_links'),
  inbox: require('./_inbox'),
  tags: require('./_tags'),
};

module.exports = async (req, res) => {
  // Try multiple sources for the view parameter
  let view = null;
  if (req.query && req.query.view) {
    view = req.query.view;
  } else if (req.url) {
    try {
      const url = new URL(req.url, 'https://localhost');
      view = url.searchParams.get('view');
    } catch (e) {}
  }
  
  const handler = handlers[view];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'unknown view: ' + view }));
    return;
  }
  return handler(req, res);
};
