// Inbox UX v2 — client patch (replaces the v1 photo-row patch).
// site/app.js (127KB) exceeds the API push size limit, so all of this lives
// here. It changes two things Winny flagged:
//
//  1) Per-item actions: the old row showed 5 buttons (To task / reminder /
//     journal / link / Discard) wrapping onto 2 lines. Modern apps (iOS Mail,
//     Gmail, Google Messages) do NOT put every action inline — they show one
//     overflow affordance and reveal actions in a bottom sheet. So each row
//     now shows a single ⋯ button that opens a bottom action sheet with the
//     same 5 actions (Discard styled destructive). Triaged rows keep their
//     one-line "Filed as X · Open" line.
//
//  2) Adding: the old inline text box is replaced by a + floating button
//     (the Keep/Notes-style composer entry point) that opens a popup editor:
//     a contenteditable area with a Bold / Italic / List toolbar, inline
//     photo insert, and paste that keeps formatting. Content is stored as
//     markdown in the item's text field (no schema change, no raw HTML in
//     storage); rows render the markdown back to formatted text, so copying
//     out of a row carries the formatting with it.
//
// Photos still ride the existing path: one photo per capture, uploaded to
// private Supabase Storage via the inbox create call (see api wrap below).
// v1 limits carried over: a capture still needs a text note (the server
// requires text), and triaging does not carry the photo along.
(function() {
'use strict';

// ---------------- pure helpers (node-testable via module.exports) ----------------

function ibEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hasMarkdown(t) {
  return /\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:[^)\s]+\)|^-\s/m.test(String(t || ''));
}

// Markdown (as stored in the item text) -> safe HTML for row rendering.
// Escapes first, then applies bold, italic, links, and "- " lists.
function mdToHtml(md) {
  let html = ibEsc(md);
  html = html.replace(/\*\*([^\*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^\*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const lines = html.split('\n');
  let out = '';
  let inList = false;
  for (const line of lines) {
    const m = /^- (.+)$/.exec(line);
    if (m) {
      if (!inList) { out += '<ul>'; inList = true; }
      out += '<li>' + m[1] + '</li>';
    } else {
      if (inList) { out += '</ul>'; inList = false; }
      out += line + '<br>';
    }
  }
  if (inList) out += '</ul>';
  return out.replace(/(<br>)+$/, '');
}

// Editor/clipboard HTML -> markdown for storage. String-based (no DOM), so
// it is testable in node. Strips scripts/styles entirely (their text must
// not leak into the note), drops images (photos travel separately), keeps
// the text of any other tag.
function htmlToMd(html) {
  let s = String(html || '');
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n\n').replace(/<\/div>/gi, '\n');
  s = s.replace(/<li[^>]*>/gi, '- ').replace(/<\/li>/gi, '\n');
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, '**$2**');
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, '*$2*');
  s = s.replace(/<img[^>]*>/gi, '');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  s = s.replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
  return s;
}

// ---------------- photo helpers ----------------

let pendingImage = null; // {filename, contentType, base64}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

// Downscale via canvas. Null when the browser cannot decode the image
// (e.g. HEIC outside Safari) — the caller then uploads the original.
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

function toastMsg(msg) {
  if (typeof toast === 'function') toast(msg);
}

function clearPhoto() {
  pendingImage = null;
  const input = document.getElementById('ib-editor-file');
  if (input) input.value = '';
  const ed = document.getElementById('ib-editor');
  if (ed) ed.querySelectorAll('img').forEach((im) => im.remove());
  const rm = document.getElementById('ib-editor-photo-remove');
  if (rm) rm.classList.add('hidden');
}

// ---------------- styles ----------------

function injectStyles() {
  if (document.getElementById('ib-ux-style')) return;
  const st = document.createElement('style');
  st.id = 'ib-ux-style';
  st.textContent = [
    // Unification (2026-10-28): the FAB uses the shared .fab class from
    // styles.css; editor + action sheets use the shared centered .modal
    // geometry (dim .4, 14px radius, 480px). Only the sheet/input details
    // that differ stay injected.
    '.ib-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:50;',
    'display:flex;align-items:center;justify-content:center;padding:1rem;}',
    '.ib-sheet{background:var(--card);width:100%;max-width:480px;max-height:90vh;overflow:auto;',
    'border-radius:14px;padding:1.25rem;}',
    '.ib-sheet-title{font-size:15px;color:var(--muted);margin:4px 0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.ib-sheet button.ib-act{display:block;width:100%;text-align:left;padding:14px 4px;font-size:17px;',
    'background:none;border:none;border-bottom:1px solid var(--line);cursor:pointer;}',
    '.ib-sheet button.ib-danger{color:#b91c1c;}',
    '.ib-toolbar{display:flex;gap:6px;margin:10px 0;flex-wrap:wrap;}',
    '.ib-toolbar button{padding:8px 12px;font-size:16px;cursor:pointer;}',
    '#ib-editor{min-height:140px;border:1px solid var(--line);border-radius:8px;padding:10px;outline:none;font-size:16px;}',
    '#ib-editor:empty:before{content:attr(data-placeholder);color:var(--muted);}',
    '#ib-editor img{max-width:100%;border-radius:8px;margin:6px 0;}',
    '.ib-row-actions{margin-left:auto;display:block;}',
    '.ib-row-actions button{font-size:20px;padding:2px 10px;cursor:pointer;}',
    // Compact mail-style rows (Winny, 2026-10-30): collapsed row shows
    // date, subject, tags, source; unread rows are bold; the
    // detail opens on header tap.
    '.ib-head{display:flex;align-items:flex-start;gap:8px;cursor:pointer;}',
    '.ib-head-main{flex:1;min-width:0;}',
    '.ib-line1{display:flex;align-items:baseline;gap:10px;}',
    '.ib-subject{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;}',
    '.ib-date{color:var(--muted);font-size:12px;white-space:nowrap;}',
    '.ib-line2{display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap;}',
    '.ib-source{color:var(--muted);font-size:12px;}',
    '.ib-compact.ib-new .ib-subject{font-weight:700;}',
    '.ib-compact.ib-new .ib-date{font-weight:700;color:var(--ink);}',
    '.ib-detail{display:none;margin-top:8px;}',
    '.ib-compact.ib-open .ib-detail{display:block;}',
    '.ib-compact.ib-open .ib-subject{white-space:normal;}',
  ].join('\n');
  document.head.appendChild(st);
}

// ---------------- + FAB + editor modal ----------------

function editorEl() { return document.getElementById('ib-editor'); }

function openEditor() {
  const bd = document.getElementById('ib-editor-backdrop');
  if (!bd) return;
  bd.classList.remove('hidden');
  const fab = document.getElementById('inbox-fab');
  if (fab) fab.style.display = 'none';
  setTimeout(() => { const ed = editorEl(); if (ed) ed.focus(); }, 0);
}

function closeEditor() {
  const bd = document.getElementById('ib-editor-backdrop');
  if (bd) bd.classList.add('hidden');
  const ed = editorEl();
  if (ed) ed.innerHTML = '';
  clearPhoto();
  updateFabVisibility();
}

async function saveEditor() {
  const ed = editorEl();
  if (!ed) return;
  const md = htmlToMd(ed.innerHTML);
  if (!md.trim()) {
    toastMsg('Add a note first.');
    return;
  }
  try {
    await api('POST', '/api/app?r=daybook&view=inbox', { text: md, source: 'manual' });
    closeEditor();
    if (typeof updateBadges === 'function') await updateBadges();
    if (typeof loadInbox === 'function') await loadInbox();
  } catch (e) {
    toastMsg('Could not capture. Please try again.');
  }
}

// Keep only safe formatting tags from pasted HTML; drop styles, classes,
// scripts, and web images (photos come from the picker only).
function sanitizePasteHtml(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const allowed = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, A: 1, UL: 1, OL: 1, LI: 1, BR: 1, P: 1, DIV: 1 };
  const walk = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 1) {
        if (!allowed[child.tagName]) {
          // Replace disallowed element with its (cleaned) children.
          walk(child);
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
        } else {
          if (child.tagName === 'A') {
            const href = child.getAttribute('href') || '';
            Array.from(child.attributes).forEach((a) => child.removeAttribute(a.name));
            if (/^https?:\/\//i.test(href)) child.setAttribute('href', href);
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          } else {
            Array.from(child.attributes).forEach((a) => child.removeAttribute(a.name));
          }
          walk(child);
        }
      }
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

async function onEditorPhotoPicked(file) {
  if (!file) return;
  try {
    const resized = await resizeImage(file);
    let preview;
    if (resized) {
      pendingImage = { filename: resized.filename, contentType: resized.contentType, base64: resized.base64 };
      preview = resized.preview;
    } else {
      const dataUrl = await readAsDataURL(file);
      const base64 = dataUrl.split(',')[1] || '';
      if (!base64) throw new Error('empty file');
      pendingImage = { filename: file.name || 'photo', contentType: file.type || 'image/jpeg', base64 };
      preview = dataUrl;
    }
    const ed = editorEl();
    if (ed) {
      ed.querySelectorAll('img').forEach((im) => im.remove());
      const img = document.createElement('img');
      img.src = preview;
      img.alt = 'Photo to attach';
      ed.appendChild(img);
    }
    const rm = document.getElementById('ib-editor-photo-remove');
    if (rm) rm.classList.remove('hidden');
  } catch (e) {
    toastMsg('Could not read that photo. Please try another.');
  }
}

function buildEditor() {
  if (document.getElementById('ib-editor-backdrop')) return;
  const bd = document.createElement('div');
  bd.id = 'ib-editor-backdrop';
  bd.className = 'ib-backdrop hidden';
  bd.innerHTML =
    '<div class="ib-sheet" role="dialog" aria-label="New capture">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
    '<strong>New capture</strong>' +
    '<span class="modal-actions"><button id="ib-editor-save" class="primary">Save</button> <button id="ib-editor-close">✕</button></span>' +
    '</div>' +
    '<div class="ib-toolbar">' +
    '<button type="button" data-cmd="bold"><b>B</b></button>' +
    '<button type="button" data-cmd="italic"><i>I</i></button>' +
    '<button type="button" data-cmd="insertUnorderedList">• List</button>' +
    '<button type="button" id="ib-editor-photo">📷 Photo</button>' +
    '<button type="button" id="ib-editor-photo-remove" class="hidden">Remove photo</button>' +
    '</div>' +
    '<div id="ib-editor" contenteditable="true" data-placeholder="Capture anything — text, a link, a note…"></div>' +
    '<input type="file" id="ib-editor-file" accept="image/*" style="display:none">' +
    '</div>';
  document.body.appendChild(bd);
  bd.addEventListener('click', (e) => { if (e.target === bd) closeEditor(); });
  document.getElementById('ib-editor-close').addEventListener('click', closeEditor);
  document.getElementById('ib-editor-save').addEventListener('click', saveEditor);
  bd.querySelectorAll('[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editorEl().focus();
      document.execCommand(btn.getAttribute('data-cmd'), false, null);
    });
  });
  const fileInput = document.getElementById('ib-editor-file');
  document.getElementById('ib-editor-photo').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => onEditorPhotoPicked(fileInput.files && fileInput.files[0]));
  document.getElementById('ib-editor-photo-remove').addEventListener('click', clearPhoto);
  editorEl().addEventListener('paste', (e) => {
    const html = e.clipboardData && e.clipboardData.getData('text/html');
    if (!html) return; // plain-text paste: let the browser handle it
    e.preventDefault();
    editorEl().focus();
    document.execCommand('insertHTML', false, sanitizePasteHtml(html));
  });
}

// Alignment (Winny, 2026-10-30): the Inbox Add follows the shared page
// pattern — a dark + Add button in the header search row — instead of
// the floating action button the other pages never had. The composer it
// opens is unchanged.
function buildInboxAddBtn() {
  const fab = document.getElementById('inbox-fab');
  if (fab) fab.remove();
  const row = document.querySelector('#view-inbox .search-add');
  if (!row || document.getElementById('ib-add-btn')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'ib-add-btn';
  b.className = 'primary';
  b.textContent = '+ Add';
  b.addEventListener('click', openEditor);
  row.appendChild(b);
}

function buildFab() {
  if (document.getElementById('inbox-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'inbox-fab';
  fab.className = 'fab';
  fab.type = 'button';
  fab.textContent = '+';
  fab.setAttribute('aria-label', 'New capture');
  fab.addEventListener('click', openEditor);
  document.body.appendChild(fab);
}

function updateFabVisibility() {
  const fab = document.getElementById('inbox-fab');
  if (!fab) return;
  const view = document.getElementById('view-inbox');
  const editorOpen = document.getElementById('ib-editor-backdrop') &&
    !document.getElementById('ib-editor-backdrop').classList.contains('hidden');
  fab.style.display = (view && !view.classList.contains('hidden') && !editorOpen) ? '' : 'none';
}

function wrapSwitchView() {
  if (typeof window.switchView !== 'function' || window.switchView._ibUxPatched) return;
  const orig = window.switchView;
  window.switchView = function() {
    const out = orig.apply(this, arguments);
    setTimeout(updateFabVisibility, 0);
    return out;
  };
  window.switchView._ibUxPatched = true;
}

// ---------------- bottom action sheet ----------------

function closeSheet() {
  const bd = document.getElementById('ib-sheet-backdrop');
  if (bd) bd.classList.add('hidden');
}

function openActionSheet(it) {
  let bd = document.getElementById('ib-sheet-backdrop');
  if (!bd) {
    bd = document.createElement('div');
    bd.id = 'ib-sheet-backdrop';
    bd.className = 'ib-backdrop hidden';
    bd.innerHTML = '<div class="ib-sheet" role="dialog" aria-label="Actions">' +
      '<div class="ib-sheet-title" id="ib-sheet-title"></div>' +
      '<div id="ib-sheet-actions"></div>' +
      '<button type="button" class="ib-act" id="ib-sheet-cancel">Cancel</button>' +
      '</div>';
    document.body.appendChild(bd);
    bd.addEventListener('click', (e) => { if (e.target === bd) closeSheet(); });
    document.getElementById('ib-sheet-cancel').addEventListener('click', closeSheet);
  }
  document.getElementById('ib-sheet-title').textContent = (it.text || '').slice(0, 80);
  const box = document.getElementById('ib-sheet-actions');
  box.innerHTML = '';
  const add = (label, danger, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ib-act' + (danger ? ' ib-danger' : '');
    b.textContent = label;
    b.addEventListener('click', () => { closeSheet(); fn(); });
    box.appendChild(b);
  };
  add('File as Task', false, () => window.openTriage(it, 'task'));
  add('File as Reminder', false, () => window.openTriage(it, 'reminder'));
  add('File as Journal', false, () => window.openTriage(it, 'journal'));
  add('File as Link', false, () => window.openTriage(it, 'link'));
  add('Discard', true, () => window.discardInbox(it.id));
  bd.classList.remove('hidden');
}

// ---------------- api wrap (attach pending photo to inbox creates) ----------------

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

// ---------------- compact mail-style rows (Winny, 2026-10-30) ----------------

// Subject = first non-empty line of the capture. Email captures store
// "Subject\nFrom: ...\nDate: ...\nbody"; manual logs lead with the log
// line. Markdown markers are stripped for the one-line header. Pure.
function ibSubject(text) {
  var lines = String(text || '').split('\n');
  var line = '';
  for (var i = 0; i < lines.length; i++) { if (lines[i].trim()) { line = lines[i].trim(); break; } }
  line = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/\*/g, '');
  if (line.length > 100) line = line.slice(0, 100).trimEnd() + '…';
  return line || '(no subject)';
}

// Short header date ("Oct 30", year added when not the current year). Pure.
function ibDateShort(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var out = months[d.getMonth()] + ' ' + d.getDate();
  if (d.getFullYear() !== new Date().getFullYear()) out += ', ' + d.getFullYear();
  return out;
}

// Header source label. ParentSquare mail (stored as email) reads as
// ParentSquare — same text classification as the Payments page. Pure.
function ibSourceLabel(it) {
  var s = String((it && it.source) || '').toLowerCase();
  if (s === 'parentsquare') return 'ParentSquare';
  if (s === 'infinite-campus' || s === 'infinite_campus') return 'Infinite Campus';
  if (s === 'manual') return 'Manual';
  if (s === 'chat') return 'Chat';
  if (s === 'email') {
    var hay = String((it && it.text) || '').toLowerCase();
    if (hay.indexOf('parentsquare') !== -1 || hay.indexOf('posted in ') !== -1) return 'ParentSquare';
    return 'Email';
  }
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// Restructure one rendered row into header + collapsible detail. The
// header carries date, subject, tags (the core row's bubbles, moved)
// and source; the ⋯ actions stay in the header; everything else (full
// text, photo, meta, filed-as) moves into the detail.
function compactInboxRow(el, it) {
  if (!it || !el.querySelector('p')) return;
  el.classList.add('ib-compact');
  if (!it.is_read) el.classList.add('ib-new');
  var head = document.createElement('div');
  head.className = 'ib-head';
  var main = document.createElement('div');
  main.className = 'ib-head-main';
  var line1 = document.createElement('div');
  line1.className = 'ib-line1';
  var subj = document.createElement('span');
  subj.className = 'ib-subject';
  subj.textContent = ibSubject(it.text);
  var date = document.createElement('span');
  date.className = 'ib-date';
  date.textContent = ibDateShort(it.created_at);
  line1.appendChild(subj);
  line1.appendChild(date);
  var line2 = document.createElement('div');
  line2.className = 'ib-line2';
  var src = document.createElement('span');
  src.className = 'ib-source';
  src.textContent = ibSourceLabel(it);
  line2.appendChild(src);
  main.appendChild(line1);
  main.appendChild(line2);
  head.appendChild(main);
  var bubbles = el.querySelector('.tag-bubbles');
  if (bubbles) line2.appendChild(bubbles);
  var actions = el.querySelector('.ib-row-actions');
  if (actions) head.appendChild(actions);
  var detail = document.createElement('div');
  detail.className = 'ib-detail';
  Array.prototype.slice.call(el.children).forEach(function (child) { detail.appendChild(child); });
  el.appendChild(head);
  el.appendChild(detail);
  head.addEventListener('click', function (e) {
    if (e.target.closest('button, a, textarea, input, select')) return;
    if (el.classList.toggle('ib-open')) markInboxRead(el, it);
  });
}

// Opening a row marks the capture read (2026-10-30): the row un-bolds
// immediately and the flag is saved through the inbox PATCH route, so
// the read state survives reloads and devices. Best-effort — a failed
// save just means the row may show bold again on the next load.
function markInboxRead(el, it) {
  if (!it || it.is_read) return;
  it.is_read = true;
  el.classList.remove('ib-new');
  try {
    api('PATCH', '/api/app?r=daybook&view=inbox&id=' + encodeURIComponent(it.id), { is_read: true })
      .then(function () { try { updateBadges(); } catch (e) { /* badge refresh is best-effort */ } })
      .catch(function () { /* keep the local un-bold */ });
  } catch (e) { /* read state is best-effort */ }
}

// ---------------- inboxRow wrap (photo + markdown + ⋯ menu) ----------------

function wrapInboxRow() {
  if (typeof window.inboxRow !== 'function' || window.inboxRow._ibUxPatched) return;
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
    // Render stored markdown back to formatted text — only for the user's
    // own manual captures, so email/chat items (which may contain stray
    // asterisks) always render as plain text exactly as before.
    if (it && it.source === 'manual' && hasMarkdown(it.text)) {
      const p = el.querySelector('p');
      if (p) p.innerHTML = mdToHtml(it.text);
    }
    if (it && !it.triaged) {
      const bar = el.querySelector('.triage-btns');
      if (bar) bar.remove();
      const wrap = document.createElement('div');
      wrap.className = 'ib-row-actions';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '⋯';
      btn.setAttribute('aria-label', 'Actions');
      btn.addEventListener('click', () => openActionSheet(it));
      wrap.appendChild(btn);
      el.appendChild(wrap);
    }
    // Compact restructure last, so photo/markdown/actions are settled.
    // A failure here must never break the row — keep the classic look.
    try { compactInboxRow(el, it); } catch (e) { /* classic row */ }
    return el;
  };
  window.inboxRow._ibUxPatched = true;
}

// ---------------- inbox pagination ----------------
// app.js renderInbox() renders every matching row into #inbox-list. With
// full-message bodies that is a long page, so paginate in the client:
// 20 rows per page, Prev/Next plus "Page X of Y · Showing A–B of N".
// Wrapping renderInbox (not loadInbox) covers every refresh trigger —
// filter, tag, search, triage, discard all funnel through renderInbox.
var INBOX_PAGE_SIZE = 20;
var inboxPage = 1;
var inboxPageSig = null;

// Pure: clamp page into range and compute the visible slice. Node-tested.
function ibPageSlice(n, size, page) {
  var maxPage = n > 0 ? Math.ceil(n / size) : 1;
  if (page < 1) page = 1;
  if (page > maxPage) page = maxPage;
  return { page: page, maxPage: maxPage, start: (page - 1) * size, end: Math.min(page * size, n) };
}

function paginateInbox() {
  var list = document.getElementById('inbox-list');
  if (!list) return;
  var rows = [];
  for (var i = 0; i < list.children.length; i++) {
    var c = list.children[i];
    if (c.className && c.className.indexOf('inbox-row') !== -1) rows.push(c);
  }
  var bar = document.getElementById('inbox-pager');
  if (!rows.length) {
    if (bar) bar.style.display = 'none';
    return;
  }
  // A filter/search/triaged-toggle change restarts at page 1; triage and
  // discard refreshes keep the page (clamped to the new length). The
  // app.js filter globals are top-level lets, so read them via typeof
  // guards rather than window properties (lets never attach to window).
  var sig = [
    typeof inboxShowTriaged !== 'undefined' ? inboxShowTriaged : '',
    typeof inboxTagFilter !== 'undefined' ? inboxTagFilter : '',
    typeof inboxSearch !== 'undefined' ? inboxSearch : '',
  ].join('|');
  if (inboxPageSig !== null && sig !== inboxPageSig) inboxPage = 1;
  inboxPageSig = sig;
  var s = ibPageSlice(rows.length, INBOX_PAGE_SIZE, inboxPage);
  inboxPage = s.page;
  rows.forEach(function (row, idx) {
    row.style.display = (idx >= s.start && idx < s.end) ? '' : 'none';
  });
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'inbox-pager';
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:space-between;margin:12px 0;flex-wrap:wrap;';
    var prev = document.createElement('button');
    prev.textContent = '← Prev';
    prev.addEventListener('click', function () { inboxPage--; paginateInbox(); window.scrollTo(0, 0); });
    var info = document.createElement('span');
    info.id = 'inbox-pager-info';
    var next = document.createElement('button');
    next.textContent = 'Next →';
    next.addEventListener('click', function () { inboxPage++; paginateInbox(); window.scrollTo(0, 0); });
    bar.appendChild(prev);
    bar.appendChild(info);
    bar.appendChild(next);
    if (list.parentNode) list.parentNode.insertBefore(bar, list.nextSibling);
  }
  bar.style.display = s.maxPage > 1 ? '' : 'none';
  var btns = bar.getElementsByTagName('button');
  if (btns[0]) btns[0].disabled = s.page <= 1;
  if (btns[1]) btns[1].disabled = s.page >= s.maxPage;
  var infoEl = document.getElementById('inbox-pager-info');
  if (infoEl) infoEl.textContent = 'Page ' + s.page + ' of ' + s.maxPage + ' · Showing ' + (s.start + 1) + '–' + s.end + ' of ' + rows.length;
}

function wrapRenderInbox() {
  var orig = window.renderInbox;
  if (typeof orig !== 'function' || orig._ibPaginated) return;
  var wrapped = function () {
    var out = orig.apply(this, arguments);
    try { paginateInbox(); } catch (e) { /* pagination must never break render */ }
    return out;
  };
  wrapped._ibPaginated = true;
  window.renderInbox = wrapped;
}

// ---------------- init ----------------

let initAttempts = 0;

function tryInit() {
  initAttempts++;
  const ready = document.getElementById('view-inbox') &&
    typeof window.api === 'function' &&
    typeof window.inboxRow === 'function' &&
    typeof window.switchView === 'function' &&
    typeof window.openTriage === 'function' &&
    typeof window.discardInbox === 'function';
  if (!ready) {
    if (initAttempts < 100) setTimeout(tryInit, 200);
    return;
  }
  try {
    injectStyles();
    buildInboxAddBtn();
    buildEditor();
    wrapApi();
    wrapInboxRow();
    wrapSwitchView();
    wrapRenderInbox();
    // If the app booted straight onto the inbox, its rows predated the
    // wrap; paginate them once instead of waiting for the next render.
    const inboxView = document.getElementById('view-inbox');
    if (inboxView && !inboxView.classList.contains('hidden')) paginateInbox();
    // Hide the old inline form ONLY after the new composer is in place, so
    // a failure here can never leave the inbox without any way to add.
    const form = document.getElementById('inbox-form');
    if (form) form.style.display = 'none';
    updateFabVisibility();
  } catch (e) {
    if (typeof console !== 'undefined') console.error('[inbox-ux] init failed:', e);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mdToHtml, htmlToMd, hasMarkdown, ibPageSlice, ibSubject, ibDateShort, ibSourceLabel };
}

})();
