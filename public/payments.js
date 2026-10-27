// Payments view (Winny, 2026-10-27): payments, debts, and monthly items
// moved out of the Inbox into their own page, shown as a table. No totals
// by design — this page is a record, not a tally.
(function () {
  'use strict';
  if (typeof VIEWS !== 'undefined' && VIEWS.indexOf('payments') === -1) VIEWS.push('payments');
  if (typeof VIEW_IDS !== 'undefined') VIEW_IDS['payments'] = 'view-payments';
  if (typeof VIEW_TITLES !== 'undefined') VIEW_TITLES['payments'] = 'Payments';

  var state = { rows: [], status: 'all', kind: 'all', q: '', openId: null };

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
  function fmtAmt(n) {
    if (n === null || n === undefined || n === '') return '—';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function statusColor(s) {
    return s === 'paid' ? '#2e7d32' : s === 'overdue' ? '#c62828' : '#b7791f';
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
      '<form class="pay-add" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' +
        '<input name="item_date" type="date" value="' + todayISO() + '" style="flex:1 1 120px;">' +
        '<input name="payee" type="text" placeholder="Payee" required style="flex:2 1 140px;">' +
        '<input name="amount" type="number" step="0.01" min="0" placeholder="Amount" style="flex:1 1 100px;">' +
        '<select name="status"><option value="paid">Paid</option><option value="due">Due</option><option value="overdue">Overdue</option></select>' +
        '<select name="kind"><option value="payment">Payment</option><option value="debt">Debt</option><option value="monthly">Monthly</option></select>' +
        '<input name="description" type="text" placeholder="Note (optional)" style="flex:3 1 200px;">' +
        '<button type="submit">Add</button>' +
      '</form>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
        '<select class="pay-f-status"><option value="all">All statuses</option><option value="paid">Paid</option><option value="due">Due</option><option value="overdue">Overdue</option></select>' +
        '<select class="pay-f-kind"><option value="all">All kinds</option><option value="payment">Payment</option><option value="debt">Debt</option><option value="monthly">Monthly</option></select>' +
        '<input class="pay-f-q" type="text" placeholder="Search payee or note" style="flex:1;">' +
      '</div>' +
      '<div class="pay-table-wrap" style="overflow-x:auto;"></div>';
    document.body.appendChild(sec);

    var menu = document.getElementById('menu');
    if (menu && !menu.querySelector('[data-view="payments"]')) {
      var b = document.createElement('button');
      b.className = 'view-link';
      b.dataset.view = 'payments';
      b.textContent = 'Payments';
      b.addEventListener('click', function () { window.switchView('payments'); });
      var inboxBtn = menu.querySelector('[data-view="inbox"]');
      if (inboxBtn) inboxBtn.insertAdjacentElement('afterend', b);
      else menu.appendChild(b);
    }

    sec.querySelector('.pay-add').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var f = ev.target;
      var body = {
        item_date: f.item_date.value || null,
        payee: f.payee.value.trim(),
        amount: f.amount.value === '' ? null : Number(f.amount.value),
        status: f.status.value,
        kind: f.kind.value,
        description: f.description.value.trim(),
        source: 'manual',
      };
      try {
        await api('POST', '/api/app?r=daybook&view=payments', body);
        f.payee.value = '';
        f.amount.value = '';
        f.description.value = '';
        f.item_date.value = todayISO();
        loadPayments();
      } catch (e) {
        alert('Could not save this payment.');
      }
    });
    sec.querySelector('.pay-f-status').addEventListener('change', function (ev) {
      state.status = ev.target.value;
      renderPayments();
    });
    sec.querySelector('.pay-f-kind').addEventListener('change', function (ev) {
      state.kind = ev.target.value;
      renderPayments();
    });
    sec.querySelector('.pay-f-q').addEventListener('input', function (ev) {
      state.q = ev.target.value.trim().toLowerCase();
      renderPayments();
    });
    sec.querySelector('.pay-table-wrap').addEventListener('click', async function (ev) {
      var btn = ev.target.closest('[data-pay-act]');
      if (btn) {
        var id = btn.getAttribute('data-pay-id');
        var act = btn.getAttribute('data-pay-act');
        try {
          if (act === 'paid') await api('PATCH', '/api/app?r=daybook&view=payments&id=' + encodeURIComponent(id), { status: 'paid' });
          if (act === 'del' && confirm('Delete this payment record?')) {
            await api('DELETE', '/api/app?r=daybook&view=payments&id=' + encodeURIComponent(id));
          }
          if (act === 'paid' || (act === 'del' && state.rows.some(function (r) { return String(r.id) === id; }))) loadPayments();
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

  function filteredRows() {
    return state.rows.filter(function (r) {
      if (state.status !== 'all' && r.status !== state.status) return false;
      if (state.kind !== 'all' && r.kind !== state.kind) return false;
      if (state.q) {
        var hay = ((r.payee || '') + ' ' + (r.description || '')).toLowerCase();
        if (hay.indexOf(state.q) === -1) return false;
      }
      return true;
    });
  }

  function renderPayments() {
    var sec = document.getElementById('view-payments');
    if (!sec) return;
    var wrap = sec.querySelector('.pay-table-wrap');
    var rows = filteredRows();
    if (!rows.length) {
      wrap.innerHTML = '<p>No payment records match. The daily sweep adds receipts and bills here automatically.</p>';
      return;
    }
    var html = '<table style="width:100%;border-collapse:collapse;">' +
      '<thead><tr><th style="text-align:left;">Date</th><th style="text-align:left;">Payee</th>' +
      '<th style="text-align:left;">Note</th><th style="text-align:right;">Amount</th>' +
      '<th style="text-align:left;">Status</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var note = (r.description || '').split('\n')[0] || '';
      if (note.length > 60) note = note.slice(0, 60) + '…';
      html += '<tr data-pay-id="' + esc(r.id) + '" style="cursor:pointer;border-top:1px solid #ddd;">' +
        '<td style="white-space:nowrap;">' + esc(fmtDate(r.item_date)) + '</td>' +
        '<td>' + esc(r.payee || '—') + '</td>' +
        '<td>' + esc(note) + '</td>' +
        '<td style="text-align:right;white-space:nowrap;">' + esc(fmtAmt(r.amount)) + '</td>' +
        '<td style="color:' + statusColor(r.status) + ';font-weight:600;">' + esc(r.status) + '</td></tr>';
      if (state.openId === String(r.id)) {
        html += '<tr><td colspan="5" style="background:#f7f7f7;">' +
          '<div style="white-space:pre-wrap;">' + esc(r.description || '') + '</div>' +
          '<div style="margin-top:8px;display:flex;gap:8px;">' +
          (r.status !== 'paid'
            ? '<button data-pay-act="paid" data-pay-id="' + esc(r.id) + '">Mark paid</button>'
            : '') +
          '<button data-pay-act="del" data-pay-id="' + esc(r.id) + '">Delete</button>' +
          '</div></td></tr>';
      }
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  async function loadPayments() {
    ensureShell();
    var sec = document.getElementById('view-payments');
    var wrap = sec.querySelector('.pay-table-wrap');
    try {
      var rows = await api('GET', '/api/app?r=daybook&view=payments');
      state.rows = Array.isArray(rows) ? rows : [];
      renderPayments();
    } catch (e) {
      wrap.innerHTML = '<p>Could not load payments.</p>';
    }
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
  if (!wrapSwitch()) {
    window.addEventListener('load', wrapSwitch);
  }

  // Build the shell at load so the menu entry exists before anyone can
  // navigate to it. (First version built it lazily on first open, which
  // meant the entry never appeared at all.)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureShell);
  } else {
    ensureShell();
  }
})();
