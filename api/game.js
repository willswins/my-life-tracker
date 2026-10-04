// Sum It Up game API — high score tracking.
//   GET  /api/game?action=best  -> {best}
//   POST /api/game {score}      -> {best} (updates if higher)
const { getSessionEmail } = require('./_session');
const { sb } = require('./_db');

module.exports = async (req, res) => {
  const email = getSessionEmail(req, process.env.SESSION_SECRET || '');
  if (!email) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }

  const url = new URL(req.url, 'https://localhost');
  const action = url.searchParams.get('action');

  if (req.method === 'GET' && action === 'best') {
    // Get best from a simple key-value approach using a dedicated table or user metadata
    // For now, use localStorage fallback — server stores in a game_scores table if exists
    try {
      const rows = await sb('GET', `/rest/v1/game_scores?user_email=eq.${encodeURIComponent(email)}&select=best_score`);
      const best = rows.length ? rows[0].best_score : 0;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, best }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, best: 0 }));
    }
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { score } = JSON.parse(body || '{}');
    try {
      const rows = await sb('GET', `/rest/v1/game_scores?user_email=eq.${encodeURIComponent(email)}&select=best_score`);
      const current = rows.length ? rows[0].best_score : 0;
      const best = Math.max(current, score || 0);
      if (rows.length) {
        await sb('PATCH', `/rest/v1/game_scores?user_email=eq.${encodeURIComponent(email)}`, { best_score: best });
      } else {
        await sb('POST', '/rest/v1/game_scores', { user_email: email, best_score: best });
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, best }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, best: score || 0 }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false }));
};
