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

module.exports = { readBody, sb };
