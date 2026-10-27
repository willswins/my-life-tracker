// Inbox photo attachments — client patch.
// The inbox form in site/index.html is text-only, and site/app.js (127KB)
// exceeds the API push size limit, so the photo UI lives here. It:
//  - injects an "Add photo" picker + preview into the inbox form,
//  - downscales the photo in-browser (max 1600px, JPEG) so uploads stay small,
//  - attaches the photo to the inbox create call by wrapping the global api(),
//  - renders stored photos in inbox rows by wrapping the global inboxRow().
// Photos are stored in private Supabase Storage; the server returns a signed
// URL on the item (image_url). v1: a photo accompanies a text note — the
// form still requires text.
(function() {
'use strict';

let pendingImage = null; // {filename, contentType, base64}
let pendingPreviewUrl = null;
let initAttempts = 0;

function toastMsg(msg) {
  if (typeof toast === 'function') toast(msg);
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

// Downscale via canvas. Returns null when the browser cannot decode the
// image (e.g. HEIC outside Safari) — the caller then uploads the original.
async function resizeImage(file) {
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    bitmap = null;
  }
  if (!bitmap) return null;
  try {
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) return null;
    const dataUrl = await readAsDataURL(blob);
    const base64 = dataUrl.split(',')[1] || '';
    if (!base64) return null;
    const base = String(file.name || 'photo').replace(/\.[^.]*$/, '') || 'photo';
    return { filename: base + '.jpg', contentType: 'image/jpeg', base64, preview: dataUrl };
  } catch (e) {
    return null;
  } finally {
    try { if (bitmap && bitmap.close) bitmap.close(); } catch (e) {}
  }
}

function showPreview(dataUrl) {
  const img = document.getElementById('inbox-photo-preview');
  const rm = document.getElementById('inbox-photo-remove');
  if (img) {
    img.src = dataUrl;
    img.classList.remove('hidden');
  }
  if (rm) rm.classList.remove('hidden');
}

function clearPhoto() {
  pendingImage = null;
  pendingPreviewUrl = null;
  const input = document.getElementById('inbox-photo');
  if (input) input.value = '';
  const img = document.getElementById('inbox-photo-preview');
  if (img) {
    img.removeAttribute('src');
    img.classList.add('hidden');
  }
  const rm = document.getElementById('inbox-photo-remove');
  if (rm) rm.classList.add('hidden');
}

async function onFilePicked(file) {
  if (!file) return;
  try {
    const resized = await resizeImage(file);
    if (resized) {
      pendingImage = { filename: resized.filename, contentType: resized.contentType, base64: resized.base64 };
      pendingPreviewUrl = resized.preview;
      showPreview(resized.preview);
      return;
    }
    const dataUrl = await readAsDataURL(file);
    const base64 = dataUrl.split(',')[1] || '';
    if (!base64) throw new Error('empty file');
    pendingImage = { filename: file.name || 'photo', contentType: file.type || 'image/jpeg', base64 };
    pendingPreviewUrl = dataUrl;
    showPreview(dataUrl);
  } catch (e) {
    toastMsg('Could not read that photo. Please try another.');
  }
}

function injectPhotoUI() {
  const form = document.getElementById('inbox-form');
  if (!form || document.getElementById('inbox-photo-row')) return;
  const row = document.createElement('div');
  row.id = 'inbox-photo-row';
  row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '📷 Add photo';
  const input = document.createElement('input');
  input.type = 'file';
  input.id = 'inbox-photo';
  input.accept = 'image/*';
  input.style.display = 'none';
  const preview = document.createElement('img');
  preview.id = 'inbox-photo-preview';
  preview.alt = 'Photo to attach';
  preview.className = 'hidden';
  preview.style.cssText = 'max-height:120px;border-radius:8px;display:block;';
  const rm = document.createElement('button');
  rm.type = 'button';
  rm.id = 'inbox-photo-remove';
  rm.textContent = '✕ Remove';
  rm.className = 'hidden';
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => onFilePicked(input.files && input.files[0]));
  rm.addEventListener('click', clearPhoto);
  row.appendChild(btn);
  row.appendChild(input);
  row.appendChild(preview);
  row.appendChild(rm);
  form.appendChild(row);
}

// Wrap api() to attach the pending photo to inbox creates only.
// Triage POSTs (which carry an id) and all other calls pass through untouched.
function wrapApi() {
  if (typeof window.api !== 'function' || window.api._ibImgPatched) return;
  const orig = window.api;
  window.api = async function(method, path, body) {
    let sendBody = body;
    const isInboxCreate = method === 'POST' && typeof path === 'string' &&
      path.indexOf('r=daybook') !== -1 && path.indexOf('view=inbox') !== -1 &&
      path.indexOf('id=') === -1;
    if (isInboxCreate && pendingImage && body && typeof body === 'object') {
      sendBody = Object.assign({}, body, { image: pendingImage });
    }
    const out = await orig.call(this, method, path, sendBody);
    if (isInboxCreate) {
      if (out && out.image_error) {
        toastMsg('Captured, but the photo could not be saved.');
      } else if (pendingImage) {
        clearPhoto();
      }
    }
    return out;
  };
  window.api._ibImgPatched = true;
}

// Wrap inboxRow() to render a stored photo under the item text.
function wrapInboxRow() {
  if (typeof window.inboxRow !== 'function' || window.inboxRow._ibImgPatched) return;
  const orig = window.inboxRow;
  window.inboxRow = function(it) {
    const el = orig.apply(this, arguments);
    if (it && it.image_url) {
      const img = document.createElement('img');
      img.src = it.image_url;
      img.alt = 'Inbox photo';
      img.loading = 'lazy';
      img.style.cssText = 'max-width:100%;border-radius:8px;margin:6px 0;display:block;';
      const meta = el.querySelector('.inbox-meta');
      if (meta) el.insertBefore(img, meta);
      else el.appendChild(img);
    }
    return el;
  };
  window.inboxRow._ibImgPatched = true;
}

function tryInit() {
  initAttempts++;
  const form = document.getElementById('inbox-form');
  if (!form || typeof window.api !== 'function' || typeof window.inboxRow !== 'function') {
    if (initAttempts < 100) setTimeout(tryInit, 200);
    return;
  }
  injectPhotoUI();
  wrapApi();
  wrapInboxRow();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', tryInit);
} else {
  tryInit();
}

})();
