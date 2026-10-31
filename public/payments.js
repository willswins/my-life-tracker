// Payments view — REBUILT 2026-10-31 (Winny's order: record the
// functionality, remove the entire old code, re-implement after
// research). Spec: ~/workspace/design-mockups/Payments-Functionality-Spec.md
//
// What changed vs the old implementation:
// - No table. The list is semantic cards end to end (the old client
//   rendered a desktop table that patch layers bent into cards).
// - No inline styles and no baked-in colors anywhere. All colors come
//   from this module's own theme tokens, defined for light AND dark in
//   this one stylesheet — status is a filled pill whose background and
//   text are paired per theme, so contrast holds by construction.
// - The expanded detail lives INSIDE its card (it used to be a sibling
//   table row whose surface other patches could strip).
// - Research applied: rows consolidated to date / payee / status /
//   amount (the elements banking UX studies say people scan for);
//   status is never bare colored text (Baymard: 43% of users struggle
//   to identify provisional transactions when status is subtle);
//   filters stay visible above the list; data reloads on every open.
// Behavior preserved from the spec: filters (status, kind, search,
// From/To), 20-per-page pagination, one open detail, Mark paid /
// Acknowledge / attention / comment / delete actions, add modal,
// bubble = unacknowledged OR attention on the menu badge and the Home
// tile, rolling 2-year window (undated rows kept), NO totals anywhere.
(function () {
  'use strict';
  if (typeof VIEWS !== 'undefined' && VIEWS.indexOf('payments') === -1) VIEWS.push('payments');
  if (typeof VIEW_IDS !== 'undefined') VIEW_IDS['payments'] = 'view-payments';
  if (typeof VIEW_TITLES !== 'undefined') VIEW_TITLES['payments'] = 'Payments';

  var PAGE_SIZE = 20;
  var state = { rows: [], status: 'all', kind: 'all', q: '', from: '', to: '', openId: null, page: 1, pageSig: null };

  var CSS = [
    // ---- module theme tokens (both themes, owned here) ---------------
    ':root{--pv-attn-bg:#fee2e2;--pv-ack-bg:#dcfce7;--pv-attn-bar:#dc2626;--pv-ack-bar:#16a34a;',
    '--pv-paid-bg:#dcfce7;--pv-paid-tx:#15803d;--pv-due-bg:#fef3c7;--pv-due-tx:#92400e;',
    '--pv-over-bg:#fee2e2;--pv-over-tx:#b91c1c;--pv-new-bg:#fef3c7;--pv-new-tx:#92400e;}',
    ':root[data-theme="dark"]{--pv-attn-bg:rgba(220,38,38,.16);--pv-ack-bg:rgba(22,163,74,.16);',
    '--pv-attn-bar:#f87171;--pv-ack-bar:#3ecf6f;',
    '--pv-paid-bg:#12351f;--pv-paid-tx:#3ecf6f;--pv-due-bg:#3a2e10;--pv-due-tx:#fbbf24;',
    '--pv-over-bg:#3a1d22;--pv-over-tx:#f87171;--pv-new-bg:#3a2e10;--pv-new-tx:#fbbf24;}',
    // ---- shell ---------------------------------------------------------
    '.pv-dates{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0.6rem 0;}',
    '.pv-dates label{font-size:14px;color:var(--muted);}',
    '.pv-dates input{flex:1;min-width:130px;}',
    '.pv-list{display:flex;flex-direction:column;gap:12px;padding:0 12px;}',
    '.pv-empty{color:var(--muted);padding:0 12px;}',
    // ---- row card --------------------------------------------------------
    '.pv-row{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:12px 14px;cursor:pointer;}',
    '.pv-row.pv-attn{background:var(--pv-attn-bg);box-shadow:inset 5px 0 0 var(--pv-attn-bar);}',
    '.pv-row.pv-ack{background:var(--pv-ack-bg);box-shadow:inset 5px 0 0 var(--pv-ack-bar);}',
    '.pv-top{display:flex;gap:12px;align-items:flex-start;}',
    '.pv-date{flex:none;width:52px;text-align:center;}',
    '.pv-date .d1{display:block;font-size:16px;font-weight:800;color:var(--ink);}',
    '.pv-date .d2{display:block;font-size:12px;color:var(--muted);}',
    '.pv-main{flex:1;min-width:0;}',
    '.pv-payee{font-size:16.5px;font-weight:800;color:var(--ink);}',
    '.pv-new{display:inline-block;vertical-align:2px;margin-left:6px;background:var(--pv-new-bg);color:var(--pv-new-tx);',
    'font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:999px;letter-spacing:.03em;}',
    '.pv-star{color:var(--pv-due-tx);margin-left:4px;}',
    '.pv-note{font-size:14px;color:var(--ink);margin-top:1px;}',
    '.pv-meta{font-size:12.5px;color:var(--muted);margin-top:3px;}',
    '.pv-right{flex:none;text-align:right;}',
    '.pv-amt{font-size:16.5px;font-weight:800;color:var(--ink);white-space:nowrap;}',
    '.pv-st{display:inline-block;margin-top:5px;font-size:11.5px;font-weight:800;padding:4px 10px;border-radius:999px;text-transform:capitalize;}',
    '.pv-st-paid{background:var(--pv-paid-bg);color:var(--pv-paid-tx);}',
    '.pv-st-due{background:var(--pv-due-bg);color:var(--pv-due-tx);}',
    '.pv-st-overdue{background:var(--pv-over-bg);color:var(--pv-over-tx);}',
    // ---- expanded detail (inside the card) -------------------------------
    '.pv-detail{border-top:1px solid var(--line);margin-top:12px;padding-top:12px;cursor:default;}',
    '.pv-desc{white-space:pre-wrap;font-size:14.5px;color:var(--ink);}',
    '.pv-src{color:var(--muted);font-size:13px;margin-top:6px;}',
    '.pv-comment{width:100%;box-sizing:border-box;margin-top:10px;}',
    '.pv-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}',
    '.pv-actions button{background:var(--lane);color:var(--ink);border:1px solid var(--line);',
    'border-radius:10px;padding:8px 12px;font-family:inherit;font-size:14px;cursor:pointer;}',
    '.pv-actions button.pv-danger{color:var(--pv-over-tx);}',
    // ---- pager -------------------------------------------------------------
    '.pv-pager{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:12px;flex-wrap:wrap;}',
    '.pv-pager button{background:var(--card);color:var(--ink);border:1px solid var(--line);',
    'border-radius:10px;padding:8px 14px;font-family:inherit;cursor:pointer;}',
    '.pv-pager button[disabled]{opacity:.45;cursor:default;}',
    // ---- add modal inputs ----------------------------------------------------
    '.pv-modal input,.pv-modal select{font-size:16px;padding:10px;}',
  ].join('\n');

  // ---------------- pure helpers (node-tested) ------------------------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function fmtDate(d) {
    if (!d) return '—';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return d;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[Number(m[2]) - 1] + ' ' + Number(m[3]) + ', ' + m[1];
  }
  function dateParts(d) {
    var f = fmtDate(d);
    var p = f.split(', ');
    return p.length === 2 ? { d1: p[0], d2: p[1] } : { d1: f, d2: '' };
  }
  function fmtAmt(n) {
    if (n === null || n === undefined || n === '') return '—';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function paySourceLabel(r) {
    var s = String(r.source || '').toLowerCase();
    if (s === 'parentsquare') return 'ParentSquare';
    if (s === 'infinite-campus' || s === 'infinite_campus') return 'Infinite Campus';
    if (s === 'manual') return 'Manual';
    if (s === 'chat') return 'Luttu';
    if (s === 'email') {
      var hay = ((r.description || '') + ' ' + (r.payee || '')).toLowerCase();
      if (hay.indexOf('parentsquare') !== -1 || hay.indexOf('posted in ') !== -1) return 'ParentSquare';
      return 'Email';
    }
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
  }
  function kindLabel(r) {
    if (r.kind === 'monthly') return '↻ Recurring payment';
    if (r.kind === 'debt') return 'Debt';
    return '';
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function twoYearCutoff() {
    var d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Spec §4 filters + §1 rolling 2-year window (undated rows kept).
  function payRowMatches(r, f) {
    if (r.item_date && r.item_date < f.cutoff) return false;
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (f.kind !== 'all' && r.kind !== f.kind) return false;
    if (f.q) {
      var hay = ((r.payee || '') + ' ' + (r.description || '')).toLowerCase();
      if (hay.indexOf(f.q) === -1) return false;
    }
    if (f.from && (!r.item_date || r.item_date < f.from)) return false;
    if (f.to && (!r.item_date || r.item_date > f.to)) return false;
    return true;
  }
  function pvRowClass(r) {
    if (r && r.attention) return 'pv-attn';
    if (r && !r.acknowledged) return 'pv-ack';
    return '';
  }
  function bubbleCount(rows) {
    return rows.filter(function (r) { return !r.acknowledged || r.attention; }).length;
  }
  function payPageSlice(n, size, page) {
    var maxPage = n > 0 ? Math.ceil(n / size) : 1;
    if (page < 1) page = 1;
    if (page > maxPage) page = maxPage;
    return { page: page, maxPage: maxPage, start: (page - 1) * size, end: Math.min(page * size, n) };
  }
  function payPagerText(s, n) {
    if (n === 0) return 'Page 1 of 1 · Showing 0 of 0';
    return 'Page ' + s.page + ' of ' + s.maxPage + ' · Showing ' + (s.start + 1) + '–' + s.end + ' of ' + n;
  }
  function payNewRowBody(f) {
    return {
      item_date: f.item_date || null,
      payee: (f.payee || '').trim(),
      amount: (f.amount === '' || f.amount == null) ? null : Number(f.amount),
      status: f.status,
      kind: f.kind,
      description: (f.description || '').trim(),
      comments: (f.comments || '').trim(),
      source: 'manual',
      acknowledged: true,
    };
  }
  function filteredRows() {
    var f = { status: state.status, kind: state.kind, q: state.q, from: state.from, to: state.to, cutoff: twoYearCutoff() };
    return state.rows.filter(function (r) { return payRowMatches(r, f); });
  }

  // ---------------- rendering ------------------------------------------
  function rowHTML(r) {
    var dp = dateParts(r.item_date);
    var note = (r.description || '').split('\n')[0] || '';
    if (note.length > 60) note = note.slice(0, 60) + '…';
    var comment = r.comments || '';
    if (comment.length > 40) comment = comment.slice(0, 40) + '…';
    var meta = [paySourceLabel(r), kindLabel(r), comment ? '💬 ' + comment : ''].filter(Boolean).join(' · ');
    var h = '<article class="pv-row ' + pvRowClass(r) + '" data-pv-id="' + esc(r.id) + '">' +
      '<div class="pv-top">' +
      '<div class="pv-date"><span class="d1">' + esc(dp.d1) + '</span><span class="d2">' + esc(dp.d2) + '</span></div>' +
      '<div class="pv-main"><div class="pv-payee">' + esc(r.payee || '—') +
      (!r.acknowledged ? '<span class="pv-new">NEW</span>' : '') +
      (r.attention ? '<span class="pv-star" title="Marked for attention">★</span>' : '') +
      '</div>' +
      (note ? '<div class="pv-note">' + esc(note) + '</div>' : '') +
      (meta ? '<div class="pv-meta">' + esc(meta) + '</div>' : '') +
      '</div>' +
      '<div class="pv-right"><div class="pv-amt">' + esc(fmtAmt(r.amount)) + '</div>' +
      '<span class="pv-st pv-st-' + esc(r.status) + '">' + esc(r.status) + '</span></div>' +
      '</div>';
    if (state.openId === String(r.id)) {
      h += '<div class="pv-detail">' +
        '<div class="pv-desc">' + esc(r.description || '') + '</div>' +
        '<div class="pv-src">Source: ' + esc(paySourceLabel(r)) + (kindLabel(r) ? ' · ' + esc(kindLabel(r)) : '') + '</div>' +
        '<textarea class="pv-comment" placeholder="Add a comment…">' + esc(r.comments || '') + '</textarea>' +
        '<div class="pv-actions">' +
        '<button type="button" data-pv-act="comment">Save comment</button>' +
        (r.status !== 'paid' ? '<button type="button" data-pv-act="paid">Mark paid</button>' : '') +
        (!r.acknowledged ? '<button type="button" data-pv-act="ack">Acknowledge</button>' : '') +
        (r.attention
          ? '<button type="button" data-pv-act="unatt">Remove attention</button>'
          : '<button type="button" data-pv-act="att">Mark for attention</button>') +
        '<button type="button" class="pv-danger" data-pv-act="del">Delete</button>' +
        '</div></div>';
    }
    return h + '</article>';
  }

  function renderPayments() {
    var sec = document.getElementById('view-payments');
    if (!sec) return;
    var list = sec.querySelector('.pv-list');
    var pager = sec.querySelector('.pv-pager');
    var rows = filteredRows();
    if (!rows.length) {
      list.innerHTML = '<p class="pv-empty">No payment records match. The daily sweep adds receipts and bills here automatically.</p>';
      if (pager) pager.style.display = 'none';
      return;
    }
    var sig = state.status + '|' + state.kind + '|' + state.q + '|' + state.from + '|' + state.to;
    if (state.pageSig !== null && sig !== state.pageSig) state.page = 1;
    state.pageSig = sig;
    var s = payPageSlice(rows.length, PAGE_SIZE, state.page);
    state.page = s.page;
    list.innerHTML = rows.slice(s.start, s.end).map(rowHTML).join('');
    if (pager) {
      if (s.maxPage <= 1) pager.style.display = 'none';
      else {
        pager.style.display = '';
        pager.innerHTML =
          '<button type="button" data-pv-page="prev"' + (s.page <= 1 ? ' disabled' : '') + '>← Prev</button>' +
          '<span>' + payPagerText(s, rows.length) + '</span>' +
          '<button type="button" data-pv-page="next"' + (s.page >= s.maxPage ? ' disabled' : '') + '>Next →</button>';
      }
    }
  }

  // ---------------- shell -----------------------------------------------
  function injectStyles() {
    if (document.getElementById('pv-style')) return;
    var st = document.createElement('style');
    st.id = 'pv-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function ensureShell() {
    if (document.getElementById('view-payments')) return;
    var sec = document.createElement('main');
    sec.id = 'view-payments';
    sec.className = 'view hidden';
    sec.innerHTML =
      '<div class="view-head search-add pv-head">' +
        '<input class="pv-q" type="search" placeholder="Search payee or note" aria-label="Search payments">' +
        '<button type="button" class="primary" id="pv-add-btn">+ Add</button>' +
      '</div>' +
      '<div class="tag-filter-row pv-f-status" role="group" aria-label="Filter by status">' +
        '<button type="button" class="tag-filter active" data-v="all">All</button>' +
        '<button type="button" class="tag-filter" data-v="paid">Paid</button>' +
        '<button type="button" class="tag-filter" data-v="due">Due</button>' +
        '<button type="button" class="tag-filter" data-v="overdue">Overdue</button></div>' +
      '<div class="tag-filter-row pv-f-kind" role="group" aria-label="Filter by kind">' +
        '<button type="button" class="tag-filter active" data-v="all">All</button>' +
        '<button type="button" class="tag-filter" data-v="payment">Payment</button>' +
        '<button type="button" class="tag-filter" data-v="debt">Debt</button>' +
        '<button type="button" class="tag-filter" data-v="monthly">Recurring</button></div>' +
      '<div class="pv-dates">' +
        '<label for="pv-from">From</label><input id="pv-from" class="pv-from" type="date" aria-label="From date">' +
        '<label for="pv-to">To</label><input id="pv-to" class="pv-to" type="date" aria-label="To date">' +
      '</div>' +
      '<div class="pv-list"></div>' +
      '<div class="pv-pager"></div>';
    document.body.appendChild(sec);

    var menu = document.getElementById('menu');
    if (menu && !menu.querySelector('[data-view="payments"]')) {
      var b = document.createElement('button');
      b.className = 'view-link';
      b.dataset.view = 'payments';
      b.innerHTML = 'Payments <span class="badge" id="badge-payments"></span>';
      b.addEventListener('click', function () { window.switchView('payments'); });
      var inboxBtn = menu.querySelector('[data-view="inbox"]');
      if (inboxBtn) inboxBtn.insertAdjacentElement('afterend', b);
      else menu.appendChild(b);
    }

    function bindFilter(sel, key) {
      var g = sec.querySelector(sel);
      g.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button[data-v]');
        if (!btn) return;
        state[key] = btn.getAttribute('data-v');
        g.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === btn); });
        renderPayments();
      });
    }
    bindFilter('.pv-f-status', 'status');
    bindFilter('.pv-f-kind', 'kind');
    sec.querySelector('#pv-add-btn').addEventListener('click', openModal);
    sec.querySelector('.pv-q').addEventListener('input', function (ev) {
      state.q = ev.target.value.trim().toLowerCase();
      renderPayments();
    });
    sec.querySelector('.pv-from').addEventListener('change', function (ev) { state.from = ev.target.value; renderPayments(); });
    sec.querySelector('.pv-to').addEventListener('change', function (ev) { state.to = ev.target.value; renderPayments(); });
    sec.querySelector('.pv-pager').addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-pv-page]');
      if (!btn || btn.disabled) return;
      if (btn.getAttribute('data-pv-page') === 'prev') state.page--;
      else state.page++;
      renderPayments();
      window.scrollTo(0, 0);
    });
    sec.querySelector('.pv-list').addEventListener('click', async function (ev) {
      var card = ev.target.closest('[data-pv-id]');
      if (!card) return;
      var id = card.getAttribute('data-pv-id');
      var btn = ev.target.closest('[data-pv-act]');
      if (btn) {
        ev.stopPropagation();
        var act = btn.getAttribute('data-pv-act');
        try {
          var base = '/api/app?r=daybook&view=payments&id=' + encodeURIComponent(id);
          if (act === 'paid') await api('PATCH', base, { status: 'paid' });
          else if (act === 'ack') await api('PATCH', base, { acknowledged: true });
          else if (act === 'att') await api('PATCH', base, { attention: true });
          else if (act === 'unatt') await api('PATCH', base, { attention: false });
          else if (act === 'comment') {
            var ta = card.querySelector('.pv-comment');
            await api('PATCH', base, { comments: ta ? ta.value : '' });
          } else if (act === 'del') {
            if (!confirm('Delete this payment record?')) return;
            await api('DELETE', base);
            if (state.openId === String(id)) state.openId = null;
          }
          loadPayments();
        } catch (e) {
          alert('That did not go through. Please try again.');
        }
        return;
      }
      if (ev.target.closest('.pv-detail')) return; // taps inside the detail don't collapse
      state.openId = state.openId === id ? null : id;
      renderPayments();
    });
  }

  // ---------------- add modal ----------------------------------------------
  function buildModal() {
    if (document.getElementById('pv-modal-backdrop')) return;
    var bd = document.createElement('div');
    bd.id = 'pv-modal-backdrop';
    bd.className = 'pay-backdrop hidden';
    bd.innerHTML =
      '<div class="modal pv-modal" role="dialog" aria-label="New payment">' +
      '<h3>New payment</h3>' +
      '<form id="pv-modal-form">' +
      '<label>Date</label><input name="item_date" type="date">' +
      '<label>Payee</label><input name="payee" type="text" required>' +
      '<label>Amount</label><input name="amount" type="number" step="0.01" min="0">' +
      '<label>Status</label><select name="status"><option value="paid">Paid</option><option value="due">Due</option><option value="overdue">Overdue</option></select>' +
      '<label>Type</label><select name="kind"><option value="payment">Payment</option><option value="debt">Debt</option><option value="monthly">Recurring</option></select>' +
      '<label>Note (optional)</label><input name="description" type="text">' +
      '<label>Comment (optional)</label><input name="comments" type="text">' +
      '<div class="modal-actions"><button type="submit" class="primary">Save</button><button type="button" id="pv-modal-cancel">Cancel</button></div>' +
      '</form></div>';
    document.body.appendChild(bd);
    bd.addEventListener('click', function (ev) { if (ev.target === bd) closeModal(); });
    bd.querySelector('#pv-modal-cancel').addEventListener('click', closeModal);
    bd.querySelector('#pv-modal-form').addEventListener('submit', saveModal);
  }
  function openModal() {
    var bd = document.getElementById('pv-modal-backdrop');
    if (!bd) return;
    var f = bd.querySelector('#pv-modal-form');
    if (f) {
      f.reset();
      f.item_date.value = todayISO();
    }
    bd.classList.remove('hidden');
    setTimeout(function () { if (f && f.payee) f.payee.focus(); }, 0);
  }
  function closeModal() {
    var bd = document.getElementById('pv-modal-backdrop');
    if (bd) bd.classList.add('hidden');
  }
  async function saveModal(ev) {
    ev.preventDefault();
    var f = document.getElementById('pv-modal-form');
    if (!f) return;
    var body = payNewRowBody({
      item_date: f.item_date.value, payee: f.payee.value, amount: f.amount.value,
      status: f.status.value, kind: f.kind.value,
      description: f.description.value, comments: f.comments.value,
    });
    if (!body.payee) { f.payee.focus(); return; }
    try {
      await api('POST', '/api/app?r=daybook&view=payments', body);
      closeModal();
      loadPayments();
    } catch (e) {
      alert('Could not save this payment.');
    }
  }

  // ---------------- data + badges ---------------------------------------------
  async function loadPayments() {
    ensureShell();
    var list = document.querySelector('#view-payments .pv-list');
    try {
      var rows = await api('GET', '/api/app?r=daybook&view=payments');
      state.rows = Array.isArray(rows) ? rows : [];
      renderPayments();
      paintBadge();
    } catch (e) {
      if (list) list.innerHTML = '<p class="pv-empty">Could not load payments.</p>';
    }
  }
  function paintBadge() {
    var n = bubbleCount(state.rows);
    var badge = document.getElementById('badge-payments');
    if (badge) { badge.textContent = n; badge.classList.toggle('zero', n === 0); }
    var home = document.getElementById('home-payments');
    if (home) home.textContent = n;
  }
  async function refreshBadge() {
    try {
      var rows = await api('GET', '/api/app?r=daybook&view=payments');
      if (Array.isArray(rows)) { state.rows = rows; }
      paintBadge();
    } catch (e) { /* leave the last count showing */ }
  }

  // Home tile — a plain stat like the others (NO inline span; the Home
  // grid CSS owns placement now).
  function buildHomeTile() {
    var stats = document.querySelector('#view-home .home-stats');
    if (!stats || document.getElementById('home-payments')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'home-stat';
    b.setAttribute('aria-label', 'Payments');
    b.innerHTML = '<span class="home-stat-num" id="home-payments">0</span>' +
      '<span class="home-stat-label">Payments</span>';
    b.addEventListener('click', function () { window.switchView('payments'); });
    stats.appendChild(b);
  }

  function wrapSwitch() {
    if (typeof window.switchView !== 'function' || window.switchView.__pvWrapped) return typeof window.switchView === 'function';
    var orig = window.switchView;
    var wrapped = async function (name, push) {
      await orig(name, push);
      if (name === 'payments') loadPayments();
    };
    wrapped.__pvWrapped = true;
    window.switchView = wrapped;
    return true;
  }
  function wrapBadges() {
    if (typeof window.updateBadges !== 'function' || window.updateBadges.__pvWrapped) return typeof window.updateBadges === 'function';
    var orig = window.updateBadges;
    var wrapped = async function () {
      await orig();
      await refreshBadge();
    };
    wrapped.__pvWrapped = true;
    window.updateBadges = wrapped;
    return true;
  }

  function init() {
    injectStyles();
    ensureShell();
    buildModal();
    buildHomeTile();
    wrapSwitch();
    wrapBadges();
    refreshBadge();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CSS: CSS, payRowMatches: payRowMatches, pvRowClass: pvRowClass, bubbleCount: bubbleCount,
      payPageSlice: payPageSlice, payPagerText: payPagerText, payNewRowBody: payNewRowBody,
      paySourceLabel: paySourceLabel, kindLabel: kindLabel, fmtAmt: fmtAmt, dateParts: dateParts,
      rowHTML: rowHTML, twoYearCutoff: twoYearCutoff,
      _setState: function (s) { Object.keys(s).forEach(function (k) { state[k] = s[k]; }); },
    };
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
