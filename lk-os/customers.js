/* ==========================================================================
   LK OS — customers.js  (v2.1)
   Full customer CRUD: search, filter, sort, activity timeline, computed
   revenue/balance (derived from payments + jobs, never stored redundantly),
   and payment/expense shortcuts into finance.js.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let selectedId = null;
  let filterStatus = '';
  let sortBy = 'newest';
  let enrichmentFilter = '';

  function matches(c, q) {
    q = q.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.address || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
  }

  function sortedFiltered() {
    const q = (document.getElementById('custSearch').value || '').trim();
    let list = q ? LK.db.customers.filter(c => matches(c, q)) : LK.db.customers.slice();
    if (filterStatus) list = list.filter(c => c.status === filterStatus);
    if (enrichmentFilter && LK.excelImport) list = list.filter(c => LK.excelImport.matchesEnrichmentFilter(c, enrichmentFilter));
    const stats = (c) => LK.customerStats(c.id);
    switch (sortBy) {
      case 'value': list.sort((a, b) => stats(b).totalRevenue - stats(a).totalRevenue); break;
      case 'balance': list.sort((a, b) => stats(b).outstandingBalance - stats(a).outstandingBalance); break;
      case 'contact': list.sort((a, b) => (b.lastContactDate || '').localeCompare(a.lastContactDate || '')); break;
      default: list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }
    return list;
  }

  function renderList() {
    const list = document.getElementById('custList');
    const results = sortedFiltered();
    list.innerHTML = results.map(c => {
      const stats = LK.customerStats(c.id);
      const needsJob = LK.excelImport && LK.excelImport.needsJobDetails(c);
      return '<div class="cust-row' + (c.id === selectedId ? ' active' : '') + '" data-id="' + c.id + '">' +
        '<div class="cust-row-name">' + c.name + ' <span class="status-pill status-' + c.status + '">' + c.status + '</span>' + (needsJob ? ' <span class="status-pill" style="color:var(--holo); border-color:var(--holo-line)">NEEDS JOB DETAILS</span>' : '') + '</div>' +
        '<div class="cust-row-sub">' + c.phone + ' &middot; ' + stats.activeJobs.length + ' active &middot; ' + (stats.outstandingBalance ? '<span class="warn">' + LK.fmtMoney(stats.outstandingBalance) + ' due</span>' : 'paid up') + '</div>' +
      '</div>';
    }).join('') || '<div class="log-empty">NO MATCHES</div>';

    list.querySelectorAll('.cust-row').forEach(row => {
      row.addEventListener('click', () => { selectedId = row.dataset.id; renderList(); renderDetail(); });
    });
  }

  function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

  function renderDetail() {
    const el = document.getElementById('custDetail');
    const c = selectedId ? LK.getCustomer(selectedId) : null;
    if (!c) { el.innerHTML = '<div class="log-empty">SELECT A CUSTOMER, OR CLICK NEW CUSTOMER</div>'; return; }
    const stats = LK.customerStats(c.id);
    const jobs = LK.db.jobs.filter(j => j.customerId === c.id);
    const payments = LK.db.payments.filter(p => p.customerId === c.id);
    const invoices = LK.db.invoices.filter(i => i.customerId === c.id);

    el.innerHTML =
      '<div class="cust-detail-top">' +
        '<div class="panel-title">' + c.name + '</div>' +
        '<div class="panel-actions">' +
          '<button type="button" class="hud-btn" id="custTextBtn">💬 TEXT</button>' +
          '<button type="button" class="hud-btn" id="custEditBtn">EDIT</button>' +
          '<button type="button" class="hud-btn" id="custDeleteBtn" style="border-color:var(--danger); color:var(--danger)">DELETE</button>' +
        '</div>' +
      '</div>' +
      '<div class="cust-contact">' +
        '<a href="tel:' + c.phone.replace(/[^0-9+]/g, '') + '">' + c.phone + '</a>' +
        (c.email ? ' &middot; <a href="mailto:' + c.email + '">' + c.email + '</a>' : '') +
      '</div>' +
      '<div class="cust-contact">' + (c.address || '') + (c.city ? ', ' + c.city : '') + (c.zip ? ' ' + c.zip : '') + '</div>' +
      '<div class="cust-contact">Source: ' + (c.source || '—') + ' &middot; Prefers: ' + (c.preferredContact || '—') + '</div>' +
      (c.importFingerprint ? '<div class="cust-contact log-empty">IMPORTED FROM ' + (c.importSourceMonth || 'workbook').toUpperCase() +
        (c.importOriginalStatus ? ' &middot; ORIGINAL STATUS: ' + c.importOriginalStatus + (c.importLeadStatusLabel ? ' (' + c.importLeadStatusLabel + ')' : '') : '') +
        (c.leadDate ? ' &middot; LEAD DATE: ' + LK.fmtDate(c.leadDate) : '') +
        (c.costOfLead != null ? ' &middot; COST OF LEAD: ' + LK.fmtMoney2(c.costOfLead) : '') +
        (c.leadReviewStatus ? ' &middot; REVIEW: ' + c.leadReviewStatus : '') + '</div>' : '') +

      '<div class="brief-grid cust-stat-grid">' +
        '<div class="brief-stat good"><label>TOTAL REVENUE</label><span>' + LK.fmtMoney(stats.totalRevenue) + '</span></div>' +
        '<div class="brief-stat' + (stats.outstandingBalance ? ' warn' : '') + '"><label>OUTSTANDING</label><span>' + LK.fmtMoney(stats.outstandingBalance) + '</span></div>' +
        '<div class="brief-stat"><label>ACTIVE JOBS</label><span>' + stats.activeJobs.length + '</span></div>' +
        '<div class="brief-stat"><label>PAST JOBS</label><span>' + stats.pastJobs.length + '</span></div>' +
      '</div>' +

      (c.warrantyExpires ? '<div class="wx-note ' + (new Date(c.warrantyExpires) > new Date() ? 'good' : 'warn') + '">WARRANTY THRU ' + LK.fmtDate(c.warrantyExpires) + '</div>' : '') +

      '<div class="panel-actions" style="margin-top:12px">' +
        '<button type="button" class="hud-btn" id="custAddPayment">+ ADD PAYMENT</button>' +
        '<button type="button" class="hud-btn" id="custAddExpense">+ ADD EXPENSE</button>' +
        (LK.excelImport && LK.excelImport.needsJobDetails(c) ? '<button type="button" class="hud-btn" id="custAddJobDetails">+ ADD JOB DETAILS</button>' : '') +
      '</div>' +

      '<div class="cust-sub-title">Job History</div>' +
      (jobs.length ? jobs.map(j => '<div class="cust-line"><span>' + j.service + ' — ' + j.stage + '</span><span>' + LK.fmtMoney(j.value) + '</span></div>').join('') : '<div class="log-empty">NO JOBS YET</div>') +

      '<div class="cust-sub-title">Payments</div>' +
      (payments.length ? payments.map(p => '<div class="cust-line"><span>' + LK.fmtDate(p.date) + ' &middot; ' + p.method + '</span><span>' + LK.fmtMoney(p.amount) + '</span></div>').join('') : '<div class="log-empty">NO PAYMENTS LOGGED</div>') +

      '<div class="cust-sub-title">Open Invoices</div>' +
      (invoices.length ? invoices.map(i => '<div class="cust-line"><span>' + i.status.toUpperCase() + '</span><span>' + LK.fmtMoney(i.amount) + '</span></div>').join('') : '<div class="log-empty">NONE</div>') +

      '<div class="cust-sub-title">Reviews</div>' +
      (c.reviews.length ? c.reviews.map(r => '<div class="cust-line"><span class="cust-stars">' + stars(r.rating) + '</span></div><div class="cust-review-text">"' + r.text + '"</div>').join('') : '<div class="log-empty">NO REVIEWS YET</div>') +

      '<div class="cust-sub-title">Activity Timeline</div>' +
      '<div class="timeline">' + (c.activity && c.activity.length
        ? c.activity.map(a => '<div class="timeline-row"><span class="timeline-dot"></span><div><div>' + a.type + (a.note ? ' — ' + a.note : '') + '</div><div class="notif-time">' + new Date(a.date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '</div></div></div>').join('')
        : '<div class="log-empty">NO ACTIVITY YET</div>') + '</div>' +

      '<div class="cust-sub-title">Notes</div>' +
      '<textarea class="hud-input cust-notes" id="custNotesBox" rows="3">' + (c.notes || '') + '</textarea>';

    document.getElementById('custNotesBox').addEventListener('change', e => { c.notes = e.target.value; LK.saveDB(true); });
    document.getElementById('custTextBtn').addEventListener('click', () => LK.messages && LK.messages.selectCustomer(c.id));
    document.getElementById('custEditBtn').addEventListener('click', () => openCustomerModal(c.id));
    document.getElementById('custDeleteBtn').addEventListener('click', () => deleteCustomer(c.id));
    document.getElementById('custAddPayment').addEventListener('click', () => LK.finance.openPaymentModal({ customerId: c.id }));
    document.getElementById('custAddExpense').addEventListener('click', () => LK.finance.openExpenseModal({}));
    const addJobBtn = document.getElementById('custAddJobDetails');
    if (addJobBtn) addJobBtn.addEventListener('click', () => { if (LK.pipeline) LK.pipeline.openJobModal(null, 'new', { customerId: c.id }); });
  }

  /* ---------------- add / edit modal ---------------- */
  function openCustomerModal(id) {
    const c = id ? LK.getCustomer(id) : null;
    document.getElementById('cmTitle').textContent = c ? 'Edit Customer' : 'New Customer';
    document.getElementById('cmName').value = c ? c.name : '';
    document.getElementById('cmPhone').value = c ? c.phone : '';
    document.getElementById('cmEmail').value = c ? c.email : '';
    document.getElementById('cmAddress').value = c ? c.address : '';
    document.getElementById('cmCity').value = c ? c.city : '';
    document.getElementById('cmZip').value = c ? (c.zip || '') : '';
    document.getElementById('cmSource').value = c ? (c.source || '') : '';
    document.getElementById('cmPreferred').value = c ? (c.preferredContact || 'Call') : 'Call';
    document.getElementById('cmStatus').value = c ? c.status : 'lead';
    document.getElementById('cmWarranty').value = c && c.warrantyExpires ? c.warrantyExpires : '';
    document.getElementById('cmLeadDate').value = c ? (c.leadDate || '') : '';
    document.getElementById('cmCostOfLead').value = c && c.costOfLead != null ? c.costOfLead : '';
    document.getElementById('cmReviewStatus').value = c ? (c.leadReviewStatus || '') : '';
    document.getElementById('cmNotes').value = c ? (c.notes || '') : '';
    const importInfo = document.getElementById('cmImportInfo');
    if (c && c.importFingerprint) {
      importInfo.style.display = 'block';
      importInfo.className = 'full log-empty';
      importInfo.textContent = 'Imported from ' + (c.importSourceMonth || 'workbook') + (c.importOriginalStatus ? ' — original status: ' + c.importOriginalStatus : '') + '. Fields above are editable.';
    } else {
      importInfo.style.display = 'none';
    }
    document.getElementById('customerModal').dataset.id = id || '';
    document.getElementById('customerModal').classList.add('open');
    document.getElementById('cmName').focus();
  }
  function closeCustomerModal() { document.getElementById('customerModal').classList.remove('open'); }

  function saveCustomerModal() {
    const name = document.getElementById('cmName').value.trim();
    if (!name) { document.getElementById('cmName').focus(); return; }
    const id = document.getElementById('customerModal').dataset.id;
    let c = id ? LK.getCustomer(id) : null;
    const isNew = !c;
    if (!c) {
      c = { id: LK.uid(), createdAt: LK.todayISO(), reviews: [], photos: [], activity: [], reviewStatus: 'none' };
      LK.db.customers.push(c);
    }
    c.name = name;
    c.phone = document.getElementById('cmPhone').value.trim();
    c.email = document.getElementById('cmEmail').value.trim();
    c.address = document.getElementById('cmAddress').value.trim();
    c.city = document.getElementById('cmCity').value.trim();
    c.zip = document.getElementById('cmZip').value.trim();
    c.source = document.getElementById('cmSource').value.trim();
    c.preferredContact = document.getElementById('cmPreferred').value;
    c.status = document.getElementById('cmStatus').value;
    c.warrantyExpires = document.getElementById('cmWarranty').value || null;
    c.leadDate = document.getElementById('cmLeadDate').value || '';
    const costOfLeadVal = document.getElementById('cmCostOfLead').value;
    c.costOfLead = costOfLeadVal !== '' ? parseFloat(costOfLeadVal) : null;
    c.leadReviewStatus = document.getElementById('cmReviewStatus').value.trim();
    c.notes = document.getElementById('cmNotes').value.trim();
    c.lastContactDate = LK.todayISO();
    if (isNew) LK.logActivity(c.id, 'Lead received');

    LK.saveDB();
    selectedId = c.id;
    renderList(); renderDetail();
    LK.audit.log(isNew ? 'Customer created' : 'Customer updated', { entityType: 'customer', entityId: c.id, summary: c.name });
    LK.bus.emit('notify', { type: 'customer', text: (isNew ? 'Customer added: ' : 'Customer updated: ') + c.name });
    closeCustomerModal();
    if (isNew && LK.workflows) LK.workflows.onNewLead(c);
  }

  function deleteCustomer(id) {
    const c = LK.getCustomer(id);
    if (!c) return;
    if (!confirm('Delete ' + c.name + '? This does not delete their jobs/payments, but unlinks them.')) return;
    LK.db.customers = LK.db.customers.filter(x => x.id !== id);
    if (selectedId === id) selectedId = null;
    LK.saveDB();
    renderList(); renderDetail();
    LK.bus.emit('notify', { type: 'customer', text: 'Customer deleted: ' + c.name });
  }

  function wire() {
    document.getElementById('custSearch').addEventListener('input', renderList);
    document.getElementById('custFilterStatus').addEventListener('change', e => { filterStatus = e.target.value; renderList(); });
    document.getElementById('custSort').addEventListener('change', e => { sortBy = e.target.value; renderList(); });
    document.getElementById('custNewBtn').addEventListener('click', () => openCustomerModal(null));
    const enrichmentSelect = document.getElementById('custEnrichmentFilter');
    if (enrichmentSelect) enrichmentSelect.addEventListener('change', e => { enrichmentFilter = e.target.value; renderList(); });
    document.getElementById('cmSave').addEventListener('click', saveCustomerModal);
    document.getElementById('cmCancel').addEventListener('click', closeCustomerModal);
    document.getElementById('customerModal').addEventListener('click', e => { if (e.target.id === 'customerModal') closeCustomerModal(); });

    renderList();
    renderDetail();
    LK.bus.on('db:changed', () => { renderList(); if (selectedId) renderDetail(); });
  }

  LK.customers = { render: () => { renderList(); renderDetail(); }, openCustomerModal };
  document.addEventListener('DOMContentLoaded', wire, { once: true });
})();
