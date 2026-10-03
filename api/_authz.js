// Shared access control: invite-table + ALLOWED_EMAILS bootstrap fallback.
const { sb } = require('./_db');

function envAllowed() {
  return (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function isAllowed(email) {
  const e = (email || '').toLowerCase();
  if (!e) return false;
  if (envAllowed().includes(e)) return true;
  try {
    const rows = await sb(
      'GET',
      `/rest/v1/allowed_users?email=eq.${encodeURIComponent(e)}&select=email`
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function isAdmin(email) {
  const e = (email || '').toLowerCase();
  if (!e) return false;
  try {
    const rows = await sb(
      'GET',
      `/rest/v1/allowed_users?email=eq.${encodeURIComponent(e)}&role=eq.admin&select=email`
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

module.exports = { isAllowed, isAdmin };
