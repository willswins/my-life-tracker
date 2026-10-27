// Minimal Supabase REST helper (no dependencies). Uses the service_role key,
// which lives only in server-side env vars and bypasses RLS.
async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}


function sbBase() {
  return (process.env.SUPABASE_URL || '').replace(/\/$/, '');
}


function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  return {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}


async function sb(method, path, body) {
  const base = sbBase();
  if (!base) throw new Error('SUPABASE_URL not configured');
  const r = await fetch(base + path, {
    method,
    headers: sbHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error('supabase ' + r.status + ': ' + text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}


module.exports = { readBody, sb, cleanCard };


// Shared card field validation, used by the board API and the ingest API.
const TAGS = ['work', 'personal'];
const PRIORITIES = ['high', 'normal', 'low'];
const LANES = ['now', 'next', 'waiting', 'done'];
const ISSUE_TYPES = ['task', 'bug', 'story'];


function cleanCard(card) {
  const out = {};
  if (typeof card.title === 'string' && card.title.trim()) out.title = card.title.trim().slice(0, 160);
  if (typeof card.details === 'string') out.details = card.details.slice(0, 5000);
  if (TAGS.includes(card.tag)) out.tag = card.tag;
  // tags column is an array: accept arrays natively (UI sends pickedTags as an array).
  if (Array.isArray(card.tags)) out.tags = card.tags.map(t => String(t).slice(0, 50)).slice(0, 20);
  if (PRIORITIES.includes(card.priority)) out.priority = card.priority;
  if (LANES.includes(card.lane)) out.lane = card.lane;
  if (ISSUE_TYPES.includes(card.issue_type)) out.issue_type = card.issue_type;
  if (card.due_date === null || /^\d{4}-\d{2}-\d{2}$/.test(card.due_date || '')) out.due_date = card.due_date || null;
  if (card.owner === null || typeof card.owner === 'string') out.owner = (card.owner || '').slice(0, 120) || null;
  out.updated_at = new Date().toISOString();
  return out;
}
