// Payments view (Winny, 2026-10-27): payments, debts, and monthly items
// moved out of the Inbox into their own page, shown as a table. No totals
// by design — this page is a record, not a tally.
(function () {
  'use strict';
  if (typeof VIEWS !== 'undefined' && VIEWS.indexOf('payments') === -1) VIEWS.push('payments');
  if (typeof VIEW_IDS !== 'undefined') VIEW_IDS['payments'] = 'view-payments';
  if (typeof VIEW_TITLES !== 'undefined') VIEW_TITLES['payments'] = 'Payments';

  var state = { rows: [], status: 'all', kind: 'all', q: '', from: '', to: '', openId: null, page: 1, pageSig: null };

  // ---------------- payments pagination ----------------
  // Ported from the Inbox pager (20 rows per page, Prev/Next plus
  // "Page X of Y · Showing A–B of N"). Payments renders its own table
  // from state.rows, so slice the data before building HTML instead of
  // hiding DOM rows after render. A filter/search change restarts at
  // page 1; action and load refreshes keep the page (clamped).
  var PAY_PAGE_SIZE = 20;

  // Pure: clamp page into range and compute the visible slice. Node-tested.
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
  // Two-line date cell (Winny, 2026-10-28): month-day on line 1, year on
  // line 2, so the Date column stays narrow on the phone. Pure, tested.
  function payDateCell(d) {
    var f = fmtDate(d);
    var parts = f.split(', ');
    if (parts.length === 2) return esc(parts[0]) + '<br>' + esc(parts[1]);
    return esc(f);
  }
  function fmtAmt(n) {
    if (n === null || n === undefined || n === '') return '—';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function statusColor(s) {
    return s === 'paid' ? '#2e7d32' : s === 'overdue' ? '#c62828' : '#b7791f';
  }
  // Display label for a row's source. New rows carry a precise source at
  // capture (email, parentsquare, infinite-campus, manual). Older email
  // rows predate that, so classify them from the message text: ParentSquare
  // mail carries "posted in" snippets or parentsquare references.
  function paySourceLabel(r) {
    var s = String(r.source || '').toLowerCase();
    if (s === 'parentsquare') return 'ParentSquare';
    if (s === 'infinite-campus' || s === 'infinite_campus') return 'Infinite Campus';
    if (s === 'manual') return 'Manual';
    if (s === 'chat') return 'Chat';
    if (s === 'email') {
      var hay = ((r.description || '') + ' ' + (r.payee || '')).toLowerCase();
      if (hay.indexOf('parentsquare') !== -1 || hay.indexOf('posted in ') !== -1) return 'ParentSquare';
      return 'Email';
    }
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function ensureShell() {
    if (document.getElementById('view-payments')) return;
    var sec = document.createElement('main');
    sec.id = 'view-payments';
    sec.className = 'view hidden';
    sec.innerHTML =
      '<div class="view-head">' +
        '<input class="pay-f-q" type="search" placeholder="Search payee or note" aria-label="Search payments">' +
        '<button type="button" class="primary" id="pay-add-btn">+ Add</button>' +
      '</div>' +
      '<div class="tag-filter-row pay-f-status" role="group" aria-label="Filter by status">' +
        '<button type="button" class="tag-filter active" data-v="all">All</button>' +
        '<button type="button" class="tag-filter" data-v="paid">Paid</button>' +
        '<button type="button" class="tag-filter" data-v="due">Due</button>' +
        '<button type="button" class="tag-filter" data-v="overdue">Overdue</button></div>' +
      '<div class="tag-filter-row pay-f-kind" role="group" aria-label="Filter by kind">' +
        '<button type="button" class="tag-filter active" data-v="all">All</button>' +
        '<button type="button" class="tag-filter" data-v="payment">Payment</button>' +
        '<button type="button" class="tag-filter" data-v="debt">Debt</button>' +
        '<button type="button" class="tag-filter" data-v="monthly">Monthly</button></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0.6rem 0;">' +
        '<span style="font-size:14px;color:var(--muted);">From</span><input class="pay-f-from" type="date" aria-label="From date">' +
        '<span style="font-size:14px;color:var(--muted);">To</span><input class="pay-f-to" type="date" aria-label="To date">' +
      '</div>' +
      '<div class="pay-table-wrap" style="overflow-x:auto;"></div>' +
      '<div class="pay-pager" style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin:12px 0;flex-wrap:wrap;"></div>';
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

    // Board-style tag-filter pills (the bubbles on the work board).
    function bindPayFilter(groupSel, key) {
      var g = sec.querySelector(groupSel);
      g.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-v]');
        if (!b) return;
        state[key] = b.getAttribute('data-v');
        g.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
        renderPayments();
      });
    }
    bindPayFilter('.pay-f-status', 'status');
    bindPayFilter('.pay-f-kind', 'kind');
    sec.querySelector('#pay-add-btn').addEventListener('click', openPayModal);
    sec.querySelector('.pay-f-q').addEventListener('input', function (ev) {
      state.q = ev.target.value.trim().toLowerCase();
      renderPayments();
    });
    sec.querySelector('.pay-f-from').addEventListener('change', function (ev) {
      state.from = ev.target.value;
      renderPayments();
    });
    sec.querySelector('.pay-f-to').addEventListener('change', function (ev) {
      state.to = ev.target.value;
      renderPayments();
    });
    sec.querySelector('.pay-pager').addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-pay-page]');
      if (!btn || btn.disabled) return;
      if (btn.getAttribute('data-pay-page') === 'prev') state.page--;
      else state.page++;
      renderPayments();
      window.scrollTo(0, 0);
    });
    sec.querySelector('.pay-table-wrap').addEventListener('click', async function (ev) {
      var btn = ev.target.closest('[data-pay-act]');
      if (btn) {
        var id = btn.getAttribute('data-pay-id');
        var act = btn.getAttribute('data-pay-act');
        try {
          var base = '/api/app?r=daybook&view=payments&id=' + encodeURIComponent(id);
          if (act === 'paid') await api('PATCH', base, { status: 'paid' });
          else if (act === 'ack') await api('PATCH', base, { acknowledged: true });
          else if (act === 'att') await api('PATCH', base, { attention: true });
          else if (act === 'unatt') await api('PATCH', base, { attention: false });
          else if (act === 'comment') {
            var detailRow = btn.closest('tr');
            var ta = detailRow ? detailRow.querySelector('.pay-comment-input') : null;
            await api('PATCH', base, { comments: ta ? ta.value : '' });
          }
          else if (act === 'del' && confirm('Delete this payment record?')) {
            await api('DELETE', base);
          }
          loadPayments();
        } catch (e) {
          alert('That did not go through. Please try again.');
        }
        return;
      }
      var row = ev.target.closest('tr[data-pay-id]');
      if (row) {
        var rid = row.getAttribute('data-pay-id');
        state.openId = state.openId === rid ? null : rid;
        renderPayments();
      }
    });
  }

  // ---------------- + button + popup modal ----------------
  // Unification (2026-10-28): the add flow uses the SHARED system — the
  // centered .modal, opened from the board-style + Add header button.
  // The injected CSS below only centers this modal's own backdrop (the
  // #modal-backdrop id belongs to the task modal), keeps modal inputs at
  // 16px so iOS does not auto-zoom on focus, and formats the table
  // (muted uppercase headers, comfortable cell padding).
  function injectPayStyles() {
    if (document.getElementById('pay-ux-style')) return;
    var st = document.createElement('style');
    st.id = 'pay-ux-style';
    st.textContent = [
      '.pay-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:50;',
      'display:flex;align-items:center;justify-content:center;padding:1rem;}',
      '.pay-modal input,.pay-modal select{font-size:16px;padding:10px;}',
      '.pay-table-wrap th{text-align:left;color:var(--muted);font-size:0.75rem;text-transform:uppercase;letter-spacing:.04em;padding:0.6rem 0.5rem;border-bottom:1px solid var(--line);}',
      '.pay-table-wrap td{padding:0.6rem 0.5rem;vertical-align:top;}',
      '.pay-table-wrap tr.pay-row-attn td{background:#fee2e2;}',
      '.pay-table-wrap tr.pay-row-ack td{background:#dcfce7;}',
    ].join('\n');
    document.head.appendChild(st);
  }

  function buildPayModal() {
    if (document.getElementById('pay-modal-backdrop')) return;
    var bd = document.createElement('div');
    bd.id = 'pay-modal-backdrop';
    bd.className = 'pay-backdrop hidden';
    bd.innerHTML =
      '<div class="modal pay-modal" role="dialog" aria-label="New payment">' +
      '<h3>New payment</h3>' +
      '<form id="pay-modal-form">' +
      '<label>Date</label><input name="item_date" type="date">' +
      '<label>Payee</label><input name="payee" type="text" required>' +
      '<label>Amount</label><input name="amount" type="number" step="0.01" min="0">' +
      '<label>Status</label><select name="status"><option value="paid">Paid</option><option value="due">Due</option><option value="overdue">Overdue</option></select>' +
      '<label>Type</label><select name="kind"><option value="payment">Payment</option><option value="debt">Debt</option><option value="monthly">Monthly</option></select>' +
      '<label>Note (optional)</label><input name="description" type="text">' +
      '<label>Comment (optional)</label><input name="comments" type="text">' +
      '<div class="modal-actions"><button type="submit" class="primary">Save</button><button type="button" id="pay-modal-cancel">Cancel</button></div>' +
      '</form></div>';
    document.body.appendChild(bd);
    bd.addEventListener('click', function (ev) { if (ev.target === bd) closePayModal(); });
    document.getElementById('pay-modal-cancel').addEventListener('click', closePayModal);
    document.getElementById('pay-modal-form').addEventListener('submit', savePayModal);
  }
  function openPayModal() {
    var bd = document.getElementById('pay-modal-backdrop');
    if (!bd) return;
    var f = document.getElementById('pay-modal-form');
    if (f) {
      f.reset();
      f.item_date.value = todayISO();
    }
    bd.classList.remove('hidden');
    setTimeout(function () { var p = f ? f.payee : null; if (p) p.focus(); }, 0);
  }
  function closePayModal() {
    var bd = document.getElementById('pay-modal-backdrop');
    if (bd) bd.classList.add('hidden');
  }
  // Pure: POST body for a new manual row. Node-tested.
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
  async function savePayModal(ev) {
    ev.preventDefault();
    var f = document.getElementById('pay-modal-form');
    if (!f) return;
    var body = payNewRowBody({
      item_date: f.item_date.value,
      payee: f.payee.value,
      amount: f.amount.value,
      status: f.status.value,
      kind: f.kind.value,
      description: f.description.value,
      comments: f.comments.value,
    });
    if (!body.payee) { f.payee.focus(); return; }
    try {
      await api('POST', '/api/app?r=daybook&view=payments', body);
      closePayModal();
      loadPayments();
    } catch (e) {
      alert('Could not save this payment.');
    }
  }

  // Pure: does one row match the filters? Node-tested. Dates are
  // YYYY-MM-DD strings, so plain string comparison works; a row with no
  // date cannot be shown inside a range, so it is excluded when a bound
  // is set. Bounds are inclusive.
  function payRowMatches(r, f) {
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
  // Row tint (Winny, 2026-10-30): attention rows paint light red, rows
  // still needing acknowledgement paint light green. Attention wins when
  // a row is both.
  function payRowClass(r) {
    if (r && r.attention) return 'pay-row-attn';
    if (r && !r.acknowledged) return 'pay-row-ack';
    return '';
  }

  function filteredRows() {
    var f = { status: state.status, kind: state.kind, q: state.q, from: state.from, to: state.to };
    return state.rows.filter(function (r) { return payRowMatches(r, f); });
  }

  function renderPayments() {
    var sec = document.getElementById('view-payments');
    if (!sec) return;
    var wrap = sec.querySelector('.pay-table-wrap');
    var rows = filteredRows();
    if (!rows.length) {
      wrap.innerHTML = '<p>No payment records match. The daily sweep adds receipts and bills here automatically.</p>';
      try { var pg0 = sec.querySelector('.pay-pager'); if (pg0) pg0.style.display = 'none'; } catch (e) {}
      return;
    }
    var sig = state.status + '|' + state.kind + '|' + state.q + '|' + state.from + '|' + state.to;
    if (state.pageSig !== null && sig !== state.pageSig) state.page = 1;
    state.pageSig = sig;
    var s = payPageSlice(rows.length, PAY_PAGE_SIZE, state.page);
    state.page = s.page;
    var pageRows = rows.slice(s.start, s.end);
    var html = '<table style="width:100%;border-collapse:collapse;">' +
      '<thead><tr><th style="text-align:left;">Date</th><th style="text-align:left;">Payee</th>' +
      '<th style="text-align:left;">Note</th><th style="text-align:right;">Amount</th>' +
      '<th style="text-align:left;">Status</th><th style="text-align:left;">Comments</th><th style="text-align:left;">Source</th></tr></thead><tbody>';
    pageRows.forEach(function (r) {
      var note = (r.description || '').split('\n')[0] || '';
      if (note.length > 60) note = note.slice(0, 60) + '…';
      var comment = r.comments || '';
      if (comment.length > 40) comment = comment.slice(0, 40) + '…';
      html += '<tr class="' + payRowClass(r) + '" data-pay-id="' + esc(r.id) + '" style="cursor:pointer;border-top:1px solid var(--line);">' +
        '<td>' + payDateCell(r.item_date) + '</td>' +
        '<td>' + esc(r.payee || '—') +
          (!r.acknowledged ? ' <span style="font-weight:700;color:#b7791f;">NEW</span>' : '') +
          (r.attention ? ' <span title="Marked for attention">★</span>' : '') + '</td>' +
        '<td>' + esc(note) + '</td>' +
        '<td style="text-align:right;white-space:nowrap;">' + esc(fmtAmt(r.amount)) + '</td>' +
        '<td style="color:' + statusColor(r.status) + ';font-weight:600;">' + esc(r.status) + '</td>' +
        '<td>' + esc(comment) + '</td>' +
        '<td style="white-space:nowrap;">' + esc(paySourceLabel(r)) + '</td></tr>';
      if (state.openId === String(r.id)) {
        html += '<tr><td colspan="7" style="background:var(--lane);">' +
          '<div style="white-space:pre-wrap;">' + esc(r.description || '') + '</div>' +
          '<div style="color:var(--muted);">Source: ' + esc(paySourceLabel(r)) + '</div>' +
          '<div style="margin-top:8px;"><textarea class="pay-comment-input" placeholder="Add a comment…" style="width:100%;box-sizing:border-box;">' + esc(r.comments || '') + '</textarea>' +
          '<button data-pay-act="comment" data-pay-id="' + esc(r.id) + '" style="margin-top:4px;">Save comment</button></div>' +
          '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">' +
          (r.status !== 'paid'
            ? '<button data-pay-act="paid" data-pay-id="' + esc(r.id) + '">Mark paid</button>'
            : '') +
          (!r.acknowledged
            ? '<button data-pay-act="ack" data-pay-id="' + esc(r.id) + '">Acknowledge</button>'
            : '') +
          (r.attention
            ? '<button data-pay-act="unatt" data-pay-id="' + esc(r.id) + '">Remove attention</button>'
            : '<button data-pay-act="att" data-pay-id="' + esc(r.id) + '">Mark for attention</button>') +
          '<button data-pay-act="del" data-pay-id="' + esc(r.id) + '">Delete</button>' +
          '</div></td></tr>';
      }
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    try {
      var pager = sec.querySelector('.pay-pager');
      if (pager) {
        if (s.maxPage <= 1) {
          pager.style.display = 'none';
        } else {
          pager.style.display = '';
          pager.innerHTML =
            '<button data-pay-page="prev"' + (s.page <= 1 ? ' disabled' : '') + '>← Prev</button>' +
            '<span>' + payPagerText(s, rows.length) + '</span>' +
            '<button data-pay-page="next"' + (s.page >= s.maxPage ? ' disabled' : '') + '>Next →</button>';
        }
      }
    } catch (e) { /* pagination must never break render */ }
  }

  async function loadPayments() {
    ensureShell();
    var sec = document.getElementById('view-payments');
    var wrap = sec.querySelector('.pay-table-wrap');
    try {
      var rows = await api('GET', '/api/app?r=daybook&view=payments');
      state.rows = Array.isArray(rows) ? rows : [];
      renderPayments();
      paintBadgeFromState();
    } catch (e) {
      wrap.innerHTML = '<p>Could not load payments.</p>';
    }
  }

  // Bubble rule: unacknowledged new items PLUS items marked for attention.
  // Opening the page never clears it — only Acknowledge (for new items)
  // and Remove attention change the number.
  function bubbleCount(rows) {
    return rows.filter(function (r) { return !r.acknowledged || r.attention; }).length;
  }
  function paintBadgeFromState() {
    var n = bubbleCount(state.rows);
    var badge = document.getElementById('badge-payments');
    if (badge) { badge.textContent = n; badge.classList.toggle('zero', n === 0); }
    var home = document.getElementById('home-payments');
    if (home) { home.textContent = n; home.classList.toggle('zero', n === 0); }
  }
  async function refreshPaymentsBadge() {
    try {
      var rows = await api('GET', '/api/app?r=daybook&view=payments');
      var n = bubbleCount(rows);
      var badge = document.getElementById('badge-payments');
      if (badge) { badge.textContent = n; badge.classList.toggle('zero', n === 0); }
      var home = document.getElementById('home-payments');
      if (home) { home.textContent = n; home.classList.toggle('zero', n === 0); }
    } catch (e) { /* leave the last count showing */ }
  }
  function wrapBadges() {
    if (typeof window.updateBadges !== 'function') return false;
    if (window.updateBadges.__paymentsWrapped) return true;
    var orig = window.updateBadges;
    var wrapped = async function () {
      await orig();
      await refreshPaymentsBadge();
    };
    wrapped.__paymentsWrapped = true;
    window.updateBadges = wrapped;
    return true;
  }

  function wrapSwitch() {
    if (typeof window.switchView !== 'function') return false;
    if (window.switchView.__paymentsWrapped) return true;
    var orig = window.switchView;
    var wrapped = async function (name, push) {
      await orig(name, push);
      if (name === 'payments') loadPayments();
    };
    wrapped.__paymentsWrapped = true;
    window.switchView = wrapped;
    return true;
  }
  if (typeof window !== 'undefined') {
    if (!wrapSwitch()) {
      window.addEventListener('load', wrapSwitch);
    }
  }

  // Build the shell at load so the menu entry exists before anyone can
  // navigate to it. (First version built it lazily on first open, which
  // meant the entry never appeared at all.)
  // Home Screen link (Winny, 2026-10-28): a Payments tile in the Home
  // "At a glance" row, built at load like the menu entry, so Payments is
  // reachable from Home without editing the generated api/index.js.
  // It spans the full stats row and shows the same attention bubble as
  // the menu badge (unacknowledged + attention items, never a total).
  function buildHomeLink() {
    var stats = document.querySelector('#view-home .home-stats');
    if (!stats || document.getElementById('home-payments')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'home-stat';
    b.style.gridColumn = '1 / -1';
    b.setAttribute('aria-label', 'Payments');
    b.innerHTML = '<span class="home-stat-num" id="home-payments">0</span>' +
      '<span class="home-stat-label">Payments</span>';
    b.addEventListener('click', function () { window.switchView('payments'); });
    stats.appendChild(b);
  }
  function initPayments() {
    ensureShell();
    injectPayStyles();
    buildPayModal();
    buildHomeLink();
    wrapBadges();
    refreshPaymentsBadge();
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPayments);
    } else {
      initPayments();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { paySourceLabel: paySourceLabel, payPageSlice: payPageSlice, payPagerText: payPagerText, payNewRowBody: payNewRowBody, payRowMatches: payRowMatches, payDateCell: payDateCell, payRowClass: payRowClass };
  }
})();
