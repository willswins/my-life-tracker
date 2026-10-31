// Supabase Storage helper for card attachments (receipts, bills, etc.).
// Server-side only: uses the service_role key from env vars.
// The bucket is PRIVATE; files are accessed via long-lived signed URLs,
// so no world-readable public bucket is ever created.
const BUCKET = 'receipts';
const SIGNED_URL_TTL = 31536000; // 1 year

function sbBase() {
  return (process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

function svcHeaders(contentType) {
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  const h = { apikey: key, Authorization: 'Bearer ' + key };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}

async function ensureBucket() {
  const base = sbBase();
  if (!base) throw new Error('SUPABASE_URL not configured');
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  const check = await fetch(`${base}/storage/v1/bucket/${BUCKET}`, {
    headers: { apikey: key, Authorization: 'Bearer ' + key },
  });
  if (check.ok) return;
  const create = await fetch(`${base}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...svcHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  if (!create.ok && create.status !== 409) {
    const t = await create.text().catch(() => '');
    throw new Error('create bucket failed: ' + create.status + ' ' + t.slice(0, 200));
  }
}

async function uploadFile(storagePath, buffer, contentType) {
  await ensureBucket();
  const base = sbBase();
  const r = await fetch(`${base}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: { ...svcHeaders(contentType), 'x-upsert': 'true' },
    body: buffer,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('storage upload failed: ' + r.status + ' ' + t.slice(0, 200));
  }
}

async function signedUrl(storagePath) {
  const base = sbBase();
  const r = await fetch(`${base}/storage/v1/object/sign/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: { ...svcHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('sign url failed: ' + r.status + ' ' + t.slice(0, 200));
  }
  const j = await r.json();
  if (!j.signedURL) throw new Error('sign url: no signedURL in response');
  return base + '/storage/v1' + j.signedURL;
}

// Recover the storage path from a signed URL this module produced, so a
// discarded item's file can be deleted. Returns null for foreign URLs.
function pathFromSignedUrl(url) {
  try {
    const marker = `/storage/v1/object/sign/${BUCKET}/`;
    const i = String(url || '').indexOf(marker);
    if (i === -1) return null;
    const rest = String(url).slice(i + marker.length).split('?')[0];
    return decodeURIComponent(rest) || null;
  } catch {
    return null;
  }
}

async function deleteFile(storagePath) {
  const base = sbBase();
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  const r = await fetch(`${base}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: 'Bearer ' + key },
  });
  if (!r.ok && r.status !== 404) {
    const t = await r.text().catch(() => '');
    throw new Error('storage delete failed: ' + r.status + ' ' + t.slice(0, 200));
  }
}

// Upload a base64-encoded file and return a signed URL good for ~1 year.
// Images for captures; PDFs for email attachments (Winny, 2026-10-31).
async function uploadBase64({ userEmail, cardId, filename, contentType, base64 }) {
  if (!/^(image\/(jpeg|png|gif|webp|heic|heif)|application\/pdf)$/i.test(contentType || '')) {
    throw new Error('only image and PDF uploads are supported');
  }
  const buf = Buffer.from(base64, 'base64');
  if (!buf.length || buf.length > 8 * 1024 * 1024) {
    throw new Error('file is empty or larger than 8 MB');
  }
  const safe = String(filename || 'upload')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80) || 'upload';
  const stamp = Date.now();
  // URL-safe path segments: no encoding needed, avoids double-encoding bugs
  // between the upload and sign endpoints.
  const safeEmail = String(userEmail).toLowerCase().replace(/[^a-z0-9]/g, '-');
  const safeCard = String(cardId).replace(/[^a-zA-Z0-9-]/g, '');
  const storagePath = `${safeEmail}/${safeCard}/${stamp}_${safe}`;
  await uploadFile(storagePath, buf, contentType);
  return signedUrl(storagePath);
}

module.exports = { uploadBase64, signedUrl, deleteFile, pathFromSignedUrl, BUCKET };
