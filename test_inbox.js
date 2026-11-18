// Node test for public/inbox-images.js — the structured Inbox body
// formatter (Winny, 2026-11-17). Minimal DOM shim: the formatter only
// needs createElement / createTextNode / appendChild / textContent /
// replaceWith / after, so a small stub covers it. Run: node test_inbox.js
// Exits non-zero on any failure (and always exits — the module's init
// retry loop would otherwise keep node alive).
'use strict';

// ---------- minimal DOM shim ----------
function makeTextNode(text) {
  return { nodeType: 3, textContent: String(text), serialize: function () { return esc(this.textContent); } };
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function makeElement(tag) {
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    className: '',
    children: [],
    childNodes: [],
    parentNode: null,
    href: '', target: '', rel: '',
    appendChild: function (child) {
      child.parentNode = el;
      el.childNodes.push(child);
      if (child.nodeType === 1) el.children.push(child);
      return child;
    },
    replaceWith: function (node) {
      const p = el.parentNode;
      if (!p) return;
      const i = p.childNodes.indexOf(el);
      if (i >= 0) { p.childNodes.splice(i, 1, node); node.parentNode = p; }
      const j = p.children.indexOf(el);
      if (j >= 0) p.children.splice(j, 1, node);
    },
    after: function (node) {
      const p = el.parentNode;
      if (!p) return;
      const i = p.childNodes.indexOf(el);
      if (i >= 0) { p.childNodes.splice(i + 1, 0, node); node.parentNode = p; }
      const j = p.children.indexOf(el);
      if (j >= 0) p.children.splice(j + 1, 0, node);
    },
    serialize: function () {
      const cls = el.className ? ' class="' + el.className + '"' : '';
      const extra = el.tagName === 'A' && el.href ? ' href="' + esc(el.href) + '"' : '';
      if (el.tagName === 'BR') return '<br>';
      return '<' + el.tagName.toLowerCase() + cls + extra + '>' +
        el.childNodes.map((c) => c.serialize()).join('') +
        '</' + el.tagName.toLowerCase() + '>';
    },
  };
  Object.defineProperty(el, 'textContent', {
    get: function () { return el.childNodes.map((c) => c.textContent).join(''); },
    set: function (v) {
      el.childNodes = [];
      el.children = [];
      if (v !== '' && v != null) el.appendChild(makeTextNode(v));
    },
  });
  return el;
}
global.document = {
  createElement: makeElement,
  createTextNode: makeTextNode,
  getElementById: () => null,
  addEventListener: () => {},
  readyState: 'loading', // keeps tryInit on DOMContentLoaded (never fires in node)
  head: makeElement('head'),
};

// ---------- load module ----------
const inbox = require('./public/inbox-images.js');
const { sectionInboxDetail } = inbox;

// ---------- helpers ----------
let fails = 0;
function check(name, cond, extra) {
  if (cond) { console.log('PASS', name); }
  else { fails++; console.log('FAIL', name, extra || ''); }
}
function renderDetail(text) {
  const detail = makeElement('div');
  const p = makeElement('p');
  p.textContent = text;
  detail.appendChild(p);
  sectionInboxDetail(detail);
  return detail.serialize();
}

// ---------- real samples from the live inbox (2026-11-17 dump) ----------
const dump = require('./test-inbox-samples.json');
const byId = {};
dump.forEach((i) => { byId[i.id.slice(0, 8)] = i.text; });

// 1. Email capture with header band + Thread summary bullets (Star League)
const star = renderDetail(byId['d437c398']);
check('email: header band present', star.includes('ib-sec-head'));
check('email: subject bold in band', star.includes('ib-h-subject'));
check('email: body has paragraphs', (star.match(/<p>/g) || []).length >= 2);
check('email: "- " lines become a list', star.includes('<ul>') && star.includes('<li>'));
check('email: "Thread summary:" is a bold label', star.includes('ib-label') && star.includes('<strong>Thread summary:</strong>'));
check('email: no raw <script> passthrough', !star.includes('<script'));

// 2. Markdown-heavy manual item (Cavli one-pager) — the old code garbled
// these: mdToHtml ran first, then sectionInboxDetail read textContent and
// dropped <br>/<li> boundaries, running lines together.
const cavli = renderDetail(byId['f73e5987']);
check('markdown: **bold** renders', cavli.includes('<strong>'));
check('markdown: *italic* renders', cavli.includes('<em>'));
check('markdown: paragraphs split (no run-together lines)', (cavli.match(/<p>/g) || []).length >= 3);

// 3. Plain email capture (Academic Excellence) — paragraphs + link
const acad = renderDetail(byId['49ecdf37']);
check('plain email: paragraphs split', (acad.match(/<p>/g) || []).length >= 2);
check('plain email: bare URL linkified', acad.includes('<a href='));

// 4. Short manual action log — single paragraph, no crash
const swim = renderDetail(byId['470ce255']);
check('short log: renders as paragraph', swim.includes('<p>') && swim.includes('SafeSplash'));
check('short log: no header band', !swim.includes('ib-sec-head'));

// 5. Injection safety: markup in capture text must render as text
const evil = renderDetail('Hello <script>alert(1)</script>\n\n- item <b>bold</b>');
check('xss: script tag escaped', evil.includes('&lt;script&gt;') && !evil.includes('<script>alert'));
check('xss: b tag escaped', evil.includes('&lt;b&gt;'));

// 6. Numbered list
const numbered = renderDetail('Steps:\n1. First\n2. Second\n\nDone.');
check('numbered list renders', numbered.includes('<ol>') && (numbered.match(/<li>/g) || []).length === 2);
check('label line bold', numbered.includes('<strong>Steps:</strong>'));

console.log(fails === 0 ? 'ALL PASS' : fails + ' FAILURES');
process.exit(fails ? 1 : 0);
