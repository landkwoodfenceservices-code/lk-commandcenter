/* ==========================================================================
   LK OS — pipeline.js  (v2.1)
   Job pipeline Kanban: 12 stages, drag-and-drop, full edit modal (deposit
   status, balance due, crew, source), duplicate/archive/delete. Archived
   jobs are hidden from the board by default (toggle to reveal).
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let showArchived = false;

  const STAGES = [
    { key: 'new', label: 'New Lead' },
    { key: 'contacted', label: 'Contacted' },
    { key: 'estimate-scheduled', label: 'Estimate Scheduled' },
    { key: 'quoted', label: 'Quote Sent' },
    { key: 'follow-up', label: 'Follow-Up' },
    { key: 'approved', label: 'Approved' },
    { key: 'deposit-paid', label: 'Deposit Paid' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'progress', label: 'In Progress' },
    { key: 'waiting', label: 'Waiting' },
    { key: 'completed', label: 'Completed' },
    { key: 'lost', label: 'Lost' },
  ];
  const PRIORITY_COLOR = { high: '#FF5C5C', med: 'var(--holo)', low: 'var(--text-dim)' };

  function customerName(job) { const c = LK.getCustomer(job.customerId); return c ? c.name : (job.customerName || 'Unnamed'); }
  function crewName(job) { const c = job.crewId && LK.getCrew(job.crewId); return c ? c.name : 'Unassigned'; }

  function cardHtml(job) {
    const balance = LK.jobBalance(job);
    return (
      '<div class="kanban-card' + (job.archived ? ' archived' : '') + '" draggable="true" data-id="' + job.id + '" style="--pc:' + PRIORITY_COLOR[job.priority || 'med'] + '">' +
        '<div class="kc-top"><span class="kc-name">' + customerName(job) + '</span><span class="kc-value">' + LK.fmtMoney(job.value) + '</span></div>' +
        '<div class="kc-service">' + job.service + (job.archived ? ' &middot; ARCHIVED' : '') + '</div>' +
        '<div class="kc-row">' + (job.address || '') + '</div>' +
        '<div class="kc-row">' + (job.phone || '') + '</div>' +
        '<div class="kc-row">Deposit: ' + job.depositStatus + (balance ? ' &middot; Balance: ' + LK.fmtMoney(balance) : '') + '</div>' +
        '<div class="kc-foot"><span>' + (job.dueDate ? LK.fmtDate(job.dueDate) : 'No date') + '</span><span>' + crewName(job) + '</span></div>' +
      '</div>'
    );
  }

  function render() {
    const board = document.getElementById('kanbanBoard');
    if (!board) return;
    board.innerHTML = STAGES.map(st => {
      const jobs = LK.db.jobs.filter(j => j.stage === st.key && (showArchived || !j.archived));
      const value = jobs.reduce((s, j) => s + (Number(j.value) || 0), 0);
      return (
        '<div class="kanban-col" data-stage="' + st.key + '">' +
          '<div class="kc-head"><span>' + st.label + '</span><span class="kc-count">' + jobs.length + ' &middot; ' + LK.fmtMoney(value) + '</span></div>' +
          '<div class="kc-body" data-stage="' + st.key + '">' + jobs.map(cardHtml).join('') + '</div>' +
          '<button type="button" class="hud-btn kc-add" data-stage="' + st.key + '">+ ADD</button>' +
        '</div>'
      );
    }).join('');
    const archivedCount = LK.db.jobs.filter(j => j.archived).length;
    const toggle = document.getElementById('pipelineArchiveToggle');
    if (toggle) toggle.textContent = (showArchived ? 'HIDE ARCHIVED' : 'SHOW ARCHIVED') + ' (' + archivedCount + ')';
    wireDrag();
    LK.bus.emit('pipeline:rendered');
  }

  function wireDrag() {
    document.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', card.dataset.id); card.classList.add('dragging'); });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('click', () => openJobModal(card.dataset.id));
    });
    document.querySelectorAll('.kc-body').forEach(body => {
      body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('drag-over'); });
      body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
      body.addEventListener('drop', e => {
        e.preventDefault();
        body.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        const job = LK.getJob(id);
        if (!job) return;
        const newStage = body.dataset.stage;
        if (job.stage !== newStage) {
          const fromLabel = STAGES.find(s => s.key === job.stage).label;
          const toLabel = STAGES.find(s => s.key === newStage).label;
          job.stage = newStage;
          job.lastContact = LK.todayISO();
          if (job.customerId) LK.logActivity(job.customerId, toLabel);
          LK.saveDB();
          render();
          LK.audit.log('Job moved', { entityType: 'job', entityId: job.id, summary: customerName(job) + ' — ' + job.service, previousValue: fromLabel, newValue: toLabel });
          LK.bus.emit('notify', { type: 'pipeline', text: customerName(job) + ' moved: ' + fromLabel + ' → ' + toLabel });
          if (newStage === 'completed') { LK.audio.chimeBlip(); if (LK.workflows) LK.workflows.onCompleted(job); }
          if (newStage === 'approved' && LK.workflows) LK.workflows.onApproved(job);
        }
      });
    });
  }

  /* ---------------- add/edit modal ---------------- */
  function crewOptions(selected) {
    return '<option value="">Unassigned</option>' + LK.db.crew.map(c => '<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>' + c.name + '</option>').join('');
  }
  function serviceOptions(selected) {
    const services = LK.db.settings.business.services;
    return services.map(s => '<option' + (s === selected ? ' selected' : '') + '>' + s + '</option>').join('');
  }

  function openJobModal(jobId, presetStage, prefill) {
    const modal = document.getElementById('jobModal');
    const job = jobId ? LK.getJob(jobId) : null;
    const prefillCustomer = !job && prefill && prefill.customerId ? LK.getCustomer(prefill.customerId) : null;
    const customer = job ? LK.getCustomer(job.customerId) : prefillCustomer;

    document.getElementById('jmTitle').textContent = job ? 'Edit Job' : 'New Job';
    document.getElementById('jmCustomer').value = customer ? customer.name : '';
    document.getElementById('jmService').innerHTML = serviceOptions(job ? job.service : null);
    document.getElementById('jmAddress').value = job ? job.address : (customer ? (customer.address || '') : '');
    document.getElementById('jmPhone').value = job ? job.phone : (customer ? (customer.phone || '') : '');
    document.getElementById('jmValue').value = job ? job.value : '';
    document.getElementById('jmDeposit').value = job ? job.depositAmount : '';
    document.getElementById('jmDepositStatus').value = job ? job.depositStatus : 'none';
    document.getElementById('jmDue').value = job ? job.dueDate : '';
    document.getElementById('jmCrew').innerHTML = crewOptions(job ? job.crewId : null);
    document.getElementById('jmSource').value = job ? (job.source || '') : (customer ? (customer.source || '') : '');
    document.getElementById('jmNotes').value = job ? job.notes : '';
    document.getElementById('jmLat').value = job && job.lat != null ? job.lat : '';
    document.getElementById('jmLng').value = job && job.lng != null ? job.lng : '';
    document.getElementById('jmPriority').value = job ? (job.priority || 'med') : 'med';
    document.getElementById('jmStage').innerHTML = STAGES.map(s => '<option value="' + s.key + '"' + ((job ? job.stage : (presetStage || 'new')) === s.key ? ' selected' : '') + '>' + s.label + '</option>').join('');
    // v2.4 — job-detail / billing / date fields. Blank when unknown, never 0.
    document.getElementById('jmFenceType').value = job ? (job.fenceType || '') : '';
    document.getElementById('jmFenceStyle').value = job ? (job.fenceStyle || '') : '';
    document.getElementById('jmLinearFeet').value = job && job.linearFeet != null ? job.linearFeet : '';
    document.getElementById('jmGateCount').value = job && job.gateCount != null ? job.gateCount : '';
    document.getElementById('jmAssignedCrewName').value = job ? (job.assignedCrewName || '') : '';
    document.getElementById('jmCrewLeader').value = job ? (job.crewLeader || '') : '';
    document.getElementById('jmEstStart').value = job ? (job.estimatedStartDate || '') : '';
    document.getElementById('jmActualStart').value = job ? (job.actualStartDate || '') : '';
    document.getElementById('jmCompletionDate').value = job ? (job.completionDate || '') : '';
    document.getElementById('jmDepositRequired').value = job && job.depositRequired != null ? job.depositRequired : '';
    document.getElementById('jmDepositDate').value = job ? (job.depositDate || '') : '';
    document.getElementById('jmFinalInvoice').value = job && job.finalInvoiceAmount != null ? job.finalInvoiceAmount : '';
    document.getElementById('jmFinalPayment').value = job && job.finalPaymentAmount != null ? job.finalPaymentAmount : '';
    document.getElementById('jmPaymentStatus').value = job ? (job.paymentStatus || '') : '';
    document.getElementById('jmDelete').style.display = job ? 'inline-block' : 'none';
    document.getElementById('jmDuplicate').style.display = job ? 'inline-block' : 'none';
    document.getElementById('jmArchive').style.display = job ? 'inline-block' : 'none';
    const textBtn = document.getElementById('jmText');
    if (textBtn) textBtn.style.display = job ? 'inline-block' : 'none';
    document.getElementById('jmArchive').textContent = job && job.archived ? 'UNARCHIVE' : 'ARCHIVE';
    modal.dataset.jobId = jobId || '';
    modal.classList.add('open');
    document.getElementById('jmCustomer').focus();
  }
  function closeJobModal() { document.getElementById('jobModal').classList.remove('open'); }

  function findOrCreateCustomer(name, phone, address) {
    let c = LK.db.customers.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!c) {
      c = { id: LK.uid(), name, phone, email: '', address, city: '', source: '', preferredContact: 'Call', status: 'lead', notes: '', createdAt: LK.todayISO(), lastContactDate: LK.todayISO(), warrantyExpires: null, photos: [], reviews: [], activity: [], reviewStatus: 'none' };
      LK.db.customers.push(c);
      LK.logActivity(c.id, 'Lead received');
      if (LK.workflows) LK.workflows.onNewLead(c);
    }
    return c;
  }

  function saveJobModal() {
    const modal = document.getElementById('jobModal');
    const name = document.getElementById('jmCustomer').value.trim();
    if (!name) { document.getElementById('jmCustomer').focus(); return; }
    const phone = document.getElementById('jmPhone').value.trim();
    const address = document.getElementById('jmAddress').value.trim();
    const customer = findOrCreateCustomer(name, phone, address);

    const id = modal.dataset.jobId;
    let job = id ? LK.getJob(id) : null;
    const isNew = !job;
    if (!job) { job = { id: LK.uid(), createdAt: LK.todayISO(), archived: false, materialCost: 0, laborCost: 0, otherExpenses: 0, approvedAmount: 0 }; LK.db.jobs.push(job); }

    const prevCrewId = job.crewId;
    const prevStage = job.stage;
    job.customerId = customer.id;
    job.service = document.getElementById('jmService').value;
    job.address = address;
    job.phone = phone;
    job.value = parseFloat(document.getElementById('jmValue').value) || 0;
    job.approvedAmount = job.approvedAmount || job.value;
    job.depositAmount = parseFloat(document.getElementById('jmDeposit').value) || 0;
    job.depositStatus = document.getElementById('jmDepositStatus').value;
    job.dueDate = document.getElementById('jmDue').value || null;
    job.crewId = document.getElementById('jmCrew').value || null;
    job.source = document.getElementById('jmSource').value.trim();
    job.notes = document.getElementById('jmNotes').value.trim();
    job.priority = document.getElementById('jmPriority').value;
    job.stage = document.getElementById('jmStage').value;
    const latVal = document.getElementById('jmLat').value, lngVal = document.getElementById('jmLng').value;
    job.lat = latVal !== '' ? parseFloat(latVal) : null;
    job.lng = lngVal !== '' ? parseFloat(lngVal) : null;
    job.lastContact = LK.todayISO();

    // v2.4 — job-detail / billing / date fields. Left blank when the input is
    // empty rather than coerced to 0, so an unrecorded value never displays
    // as a fabricated zero.
    const numOrNull = (id) => { const v = document.getElementById(id).value; return v !== '' ? parseFloat(v) : null; };
    job.fenceType = document.getElementById('jmFenceType').value.trim();
    job.fenceStyle = document.getElementById('jmFenceStyle').value.trim();
    job.linearFeet = numOrNull('jmLinearFeet');
    job.gateCount = numOrNull('jmGateCount');
    job.assignedCrewName = document.getElementById('jmAssignedCrewName').value.trim();
    job.crewLeader = document.getElementById('jmCrewLeader').value.trim();
    job.estimatedStartDate = document.getElementById('jmEstStart').value || '';
    job.actualStartDate = document.getElementById('jmActualStart').value || '';
    job.completionDate = document.getElementById('jmCompletionDate').value || '';
    job.depositRequired = numOrNull('jmDepositRequired');
    job.depositDate = document.getElementById('jmDepositDate').value || '';
    job.finalInvoiceAmount = numOrNull('jmFinalInvoice');
    job.finalPaymentAmount = numOrNull('jmFinalPayment');
    job.paymentStatus = document.getElementById('jmPaymentStatus').value;

    // v2.4 — enriching an imported record's job details is a real contact
    // event for that customer, so reflect it on the customer record too
    // (not just the job). Regular manually-created jobs are unaffected.
    if (customer.importFingerprint) {
      customer.lastContactDate = LK.todayISO();
      LK.logActivity(customer.id, isNew ? 'Job details added' : 'Job details updated', job.service || '');
    }

    LK.saveDB();
    render();
    LK.audit.log(isNew ? 'Job created' : 'Job updated', { entityType: 'job', entityId: job.id, summary: customer.name + ' — ' + job.service });
    if (prevCrewId !== job.crewId) {
      LK.audit.log('Crew assigned', { entityType: 'job', entityId: job.id, summary: customer.name + ' — ' + job.service, previousValue: (LK.getCrew(prevCrewId) || {}).name || 'Unassigned', newValue: (LK.getCrew(job.crewId) || {}).name || 'Unassigned' });
    }
    LK.bus.emit('notify', { type: 'pipeline', text: (isNew ? 'New lead added: ' : 'Job updated: ') + customer.name });
    closeJobModal();
    if (!isNew && prevStage !== job.stage && LK.workflows) {
      if (job.stage === 'approved') LK.workflows.onApproved(job);
      if (job.stage === 'completed') LK.workflows.onCompleted(job);
    }
  }

  function deleteJobModal() {
    const modal = document.getElementById('jobModal');
    const id = modal.dataset.jobId;
    if (!id) return;
    if (!confirm('Delete this job? This cannot be undone.')) return;
    LK.db.jobs = LK.db.jobs.filter(j => j.id !== id);
    LK.saveDB();
    render();
    closeJobModal();
  }
  function duplicateJobModal() {
    const id = document.getElementById('jobModal').dataset.jobId;
    const job = LK.getJob(id);
    if (!job) return;
    const copy = Object.assign({}, job, { id: LK.uid(), createdAt: LK.todayISO(), stage: 'new', archived: false });
    LK.db.jobs.push(copy);
    LK.saveDB();
    render();
    LK.bus.emit('notify', { type: 'pipeline', text: 'Job duplicated for ' + customerName(copy) });
    closeJobModal();
  }
  function archiveJobModal() {
    const id = document.getElementById('jobModal').dataset.jobId;
    const job = LK.getJob(id);
    if (!job) return;
    job.archived = !job.archived;
    LK.saveDB();
    render();
    closeJobModal();
  }

  function textCustomer() {
    const job = LK.getJob(document.getElementById('jobModal').dataset.jobId);
    if (job && job.customerId && LK.messages) { closeJobModal(); LK.messages.selectCustomer(job.customerId); }
  }

  function wire() {
    document.getElementById('kanbanBoard').addEventListener('click', e => {
      const addBtn = e.target.closest('.kc-add');
      if (addBtn) openJobModal(null, addBtn.dataset.stage);
    });
    const textBtn = document.getElementById('jmText');
    if (textBtn) textBtn.addEventListener('click', textCustomer);
    document.getElementById('jmSave').addEventListener('click', saveJobModal);
    document.getElementById('jmDelete').addEventListener('click', deleteJobModal);
    document.getElementById('jmDuplicate').addEventListener('click', duplicateJobModal);
    document.getElementById('jmArchive').addEventListener('click', archiveJobModal);
    document.getElementById('jmCancel').addEventListener('click', closeJobModal);
    document.getElementById('jobModal').addEventListener('click', e => { if (e.target.id === 'jobModal') closeJobModal(); });
    document.getElementById('pipelineArchiveToggle').addEventListener('click', () => { showArchived = !showArchived; render(); });
    render();
  }

  LK.pipeline = { render, STAGES, openJobModal, findOrCreateCustomer };
  LK.bus.on('db:changed', () => {});
  document.addEventListener('DOMContentLoaded', wire, { once: true });
})();
