/* ==========================================================================
   LK OS — messages.js
   Messages Center: customer list, conversation workspace, context panel,
   composer, communication log, and the follow-up queue. No live texting
   provider — this is the honest "basic texting mode": copy, open the OS
   SMS app, and a manual LOG AS SENT that's the only thing that writes to
   the timeline. Opening the SMS app never proves delivery.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let selectedCustomerId = null;
  let listFilterStage = '', listFilterFollowUp = false, listSort = 'recent';

  function el(id) { return document.getElementById(id); }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }

  /* ---------------- follow-up detection (real signals only) ---------------- */
  function detectCandidates() {
    const today = LK.todayISO();
    const tomorrow = LK.addDays(today, 1);
    const candidates = [];
    LK.db.jobs.filter(j => !j.archived).forEach(j => {
      if (j.stage === 'new') {
        const hasComm = LK.db.communications.some(c => c.customerId === j.customerId);
        if (!hasComm) candidates.push({ customerId: j.customerId, reason: 'New lead not contacted', sourceType: 'job', sourceId: j.id });
      }
      if (j.depositStatus === 'requested') candidates.push({ customerId: j.customerId, reason: 'Deposit requested', sourceType: 'job', sourceId: j.id });
      if (j.stage === 'completed' && LK.jobBalance(j) > 0) candidates.push({ customerId: j.customerId, reason: 'Final balance outstanding', sourceType: 'job', sourceId: j.id });
      if (j.stage === 'completed') {
        const c = LK.getCustomer(j.customerId);
        if (c && c.reviewStatus === 'none') candidates.push({ customerId: j.customerId, reason: 'Review not requested', sourceType: 'job', sourceId: j.id });
      }
    });
    LK.db.quotes.filter(q => q.status === 'pending').forEach(q => {
      if (daysBetween(q.sentDate, today) >= (LK.db.settings.messaging.followUpDays || 3)) {
        candidates.push({ customerId: q.customerId, reason: 'Estimate sent with no response', sourceType: 'quote', sourceId: q.id });
      }
    });
    LK.db.events.filter(e => e.date === tomorrow && e.customerId).forEach(e => {
      candidates.push({ customerId: e.customerId, reason: 'Appointment tomorrow', sourceType: 'event', sourceId: e.id });
    });
    return candidates;
  }
  function refreshFollowUps() {
    const today = LK.todayISO();
    detectCandidates().forEach(c => {
      const exists = LK.db.followUps.find(f => f.customerId === c.customerId && f.reason === c.reason && !f.completed);
      if (!exists) LK.db.followUps.push(Object.assign({ id: LK.uid(), dueDate: today, snoozedUntil: null, completed: false }, c));
    });
    LK.saveDB(true);
  }
  function pendingFollowUps() {
    refreshFollowUps();
    const today = LK.todayISO();
    return LK.db.followUps.filter(f => !f.completed && (!f.snoozedUntil || f.snoozedUntil <= today) && LK.getCustomer(f.customerId));
  }

  function renderFollowUpQueue() {
    const wrap = el('followUpQueue');
    if (!wrap) return;
    const items = pendingFollowUps().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    wrap.innerHTML = items.length ? items.map(f => {
      const c = LK.getCustomer(f.customerId);
      const job = LK.db.jobs.find(j => j.customerId === f.customerId && !j.archived);
      const days = daysBetween(f.dueDate, LK.todayISO());
      return '<div class="followup-card">' +
        '<div class="kc-top"><span class="kc-name">' + c.name + '</span><span class="kc-value">' + (job ? LK.fmtMoney(job.value) : '') + '</span></div>' +
        '<div class="kc-row">' + f.reason + ' &middot; ' + (days > 0 ? days + 'd waiting' : 'today') + '</div>' +
        '<div class="panel-actions">' +
          '<button type="button" class="hud-btn tiny fu-open" data-id="' + f.customerId + '">TEXT</button>' +
          '<button type="button" class="hud-btn tiny fu-call" data-tel="' + c.phone + '">CALL</button>' +
          '<button type="button" class="hud-btn tiny fu-snooze" data-id="' + f.id + '">SNOOZE</button>' +
          '<button type="button" class="hud-btn tiny fu-done" data-id="' + f.id + '">COMPLETE</button>' +
        '</div></div>';
    }).join('') : '<div class="log-empty">NO FOLLOW-UPS DUE</div>';

    wrap.querySelectorAll('.fu-open').forEach(b => b.addEventListener('click', () => selectCustomer(b.dataset.id)));
    wrap.querySelectorAll('.fu-call').forEach(b => b.addEventListener('click', () => window.open('tel:' + b.dataset.tel.replace(/[^0-9+]/g, ''))));
    wrap.querySelectorAll('.fu-snooze').forEach(b => b.addEventListener('click', () => { const f = LK.db.followUps.find(x => x.id === b.dataset.id); if (f) { f.snoozedUntil = LK.addDays(LK.todayISO(), 2); LK.saveDB(); } }));
    wrap.querySelectorAll('.fu-done').forEach(b => b.addEventListener('click', () => { const f = LK.db.followUps.find(x => x.id === b.dataset.id); if (f) { f.completed = true; LK.saveDB(); } }));
  }

  /* ---------------- customer list ---------------- */
  function customerRowMeta(c) {
    const job = LK.db.jobs.find(j => j.customerId === c.id && !j.archived);
    const stats = LK.customerStats(c.id);
    const lastComm = LK.db.communications.filter(m => m.customerId === c.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
    const fu = LK.db.followUps.find(f => f.customerId === c.id && !f.completed);
    return { job, stats, lastComm, fu };
  }

  function renderCustomerList() {
    const wrap = el('msgCustList');
    let items = LK.db.customers.slice();
    if (listFilterStage) items = items.filter(c => { const j = LK.db.jobs.find(j2 => j2.customerId === c.id && !j2.archived); return j && j.stage === listFilterStage; });
    if (listFilterFollowUp) items = items.filter(c => LK.db.followUps.some(f => f.customerId === c.id && !f.completed));
    const metaFor = c => customerRowMeta(c);
    if (listSort === 'value') items.sort((a, b) => metaFor(b).stats.totalRevenue - metaFor(a).stats.totalRevenue);
    else if (listSort === 'newest') items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    else items.sort((a, b) => { const ma = metaFor(a).lastComm, mb = metaFor(b).lastComm; return ((mb ? mb.date + mb.time : '')).localeCompare(ma ? ma.date + ma.time : ''); });

    wrap.innerHTML = items.length ? items.map(c => {
      const m = metaFor(c);
      return '<div class="cust-row' + (c.id === selectedCustomerId ? ' active' : '') + '" data-id="' + c.id + '">' +
        '<div class="cust-row-name">' + c.name + (m.fu ? ' <span class="status-pill status-lead">FOLLOW-UP</span>' : '') + '</div>' +
        '<div class="cust-row-sub">' + c.phone + (m.job ? ' &middot; ' + m.job.service + ' — ' + m.job.stage : '') + (m.stats.outstandingBalance ? ' &middot; <span class="warn">' + LK.fmtMoney(m.stats.outstandingBalance) + ' due</span>' : '') + '</div>' +
      '</div>';
    }).join('') : '<div class="log-empty">NO CUSTOMERS YET</div>';
    wrap.querySelectorAll('.cust-row').forEach(row => row.addEventListener('click', () => selectCustomer(row.dataset.id)));
  }

  /* ---------------- conversation + context ---------------- */
  function selectCustomer(id) {
    selectedCustomerId = id;
    LK.nav.go('messages');
    renderCustomerList();
    renderConversation();
    renderContext();
    el('composerBody').focus();
  }

  function renderConversation() {
    const wrap = el('conversationBody');
    const c = selectedCustomerId ? LK.getCustomer(selectedCustomerId) : null;
    if (!c) { wrap.innerHTML = '<div class="log-empty">SELECT A CUSTOMER TO START</div>'; el('conversationHeader').innerHTML = ''; return; }
    el('conversationHeader').innerHTML = '<div class="panel-title">' + c.name + '</div><div class="cust-contact">' + c.phone + ' &middot; ' + (c.preferredContact || 'Call') + ' preferred</div>';
    const history = LK.db.communications.filter(m => m.customerId === c.id).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    wrap.innerHTML = history.length ? history.map(m =>
      '<div class="comm-row comm-' + (m.direction || 'outbound') + '"><div class="comm-meta">' + m.type + ' &middot; ' + LK.fmtDate(m.date) + ' ' + m.time + (m.status ? ' &middot; ' + m.status : '') + '</div><div class="comm-text">' + escapeHtml(m.summary) + '</div></div>'
    ).join('') : '<div class="log-empty">NO COMMUNICATION LOGGED YET</div>';
    wrap.scrollTop = wrap.scrollHeight;
    updateComposerContext();
  }

  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  function renderContext() {
    const wrap = el('customerContext');
    const c = selectedCustomerId ? LK.getCustomer(selectedCustomerId) : null;
    if (!c) { wrap.innerHTML = ''; return; }
    const job = LK.db.jobs.find(j => j.customerId === c.id && !j.archived);
    const quote = LK.db.quotes.filter(q => q.customerId === c.id).sort((a, b) => b.sentDate.localeCompare(a.sentDate))[0];
    const lastPayment = LK.db.payments.filter(p => p.customerId === c.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    const stats = LK.customerStats(c.id);
    const nextEvent = LK.db.events.filter(e => e.customerId === c.id && e.date >= LK.todayISO()).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0];

    wrap.innerHTML =
      '<div class="cust-sub-title">Upcoming Appointment</div>' + (nextEvent ? '<div class="cust-line"><span>' + LK.fmtDate(nextEvent.date) + ' ' + nextEvent.startTime + '</span><span>' + nextEvent.type + '</span></div>' : '<div class="log-empty">NONE</div>') +
      '<div class="cust-sub-title">Latest Estimate</div>' + (quote ? '<div class="cust-line"><span>' + quote.service + '</span><span>' + LK.fmtMoney(quote.amount) + ' — ' + quote.status + '</span></div>' : '<div class="log-empty">NONE</div>') +
      '<div class="cust-sub-title">Last Payment</div>' + (lastPayment ? '<div class="cust-line"><span>' + LK.fmtDate(lastPayment.date) + '</span><span>' + LK.fmtMoney(lastPayment.amount) + '</span></div>' : '<div class="log-empty">NONE</div>') +
      '<div class="cust-sub-title">Outstanding Balance</div><div class="cust-line"><span></span><span class="' + (stats.outstandingBalance ? 'warn' : '') + '">' + LK.fmtMoney(stats.outstandingBalance) + '</span></div>' +
      '<div class="cust-sub-title">Job Status</div>' + (job ? '<div class="cust-line"><span>' + job.service + '</span><span>' + job.stage + '</span></div>' : '<div class="log-empty">NO ACTIVE JOB</div>') +
      '<div class="cust-sub-title">Warranty</div>' + (c.warrantyExpires ? '<div class="wx-note ' + (new Date(c.warrantyExpires) > new Date() ? 'good' : 'warn') + '">THRU ' + LK.fmtDate(c.warrantyExpires) + '</div>' : '<div class="log-empty">NONE</div>') +
      '<div class="cust-sub-title">Internal Notes</div><textarea class="hud-input" id="msgCustNotes" rows="3">' + (c.notes || '') + '</textarea>';

    el('msgCustNotes').addEventListener('change', e => { c.notes = e.target.value; LK.saveDB(true); LK.logCommEntry(c.id, null, 'Internal note', 'internal', e.target.value, null, null); renderConversation(); });
  }

  /* ---------------- composer ---------------- */
  function updateComposerContext() {
    const c = selectedCustomerId ? LK.getCustomer(selectedCustomerId) : null;
    el('composerPhone').textContent = c ? c.phone : '—';
    el('composerCustSelect').value = selectedCustomerId || '';
    renderPreview();
  }
  function populateCustomerSelect() {
    el('composerCustSelect').innerHTML = '<option value="">Select customer…</option>' + LK.db.customers.map(c => '<option value="' + c.id + '">' + c.name + '</option>').join('');
  }
  function insertTemplate(id) {
    const t = LK.db.messageTemplates.find(x => x.id === id);
    if (!t) return;
    el('composerBody').value = t.body;
    renderPreview();
  }
  function renderPreview() {
    const body = el('composerBody').value;
    el('composerCount').textContent = body.length + ' chars';
    if (!selectedCustomerId) { el('composerPreview').innerHTML = '<div class="log-empty">SELECT A CUSTOMER TO PREVIEW</div>'; return; }
    const ctx = LK.templates.buildContext(selectedCustomerId);
    const { text, missing } = LK.templates.resolve(body, ctx);
    el('composerPreview').innerHTML = '<div class="comm-text">' + escapeHtml(text) + '</div>' +
      (missing.length ? '<div class="wx-note warn">MISSING: ' + missing.join(', ') + ' — will not be filled in.</div>' : '');
  }

  function currentResolvedText() {
    const ctx = LK.templates.buildContext(selectedCustomerId);
    return LK.templates.resolve(el('composerBody').value, ctx);
  }

  function requireCustomer() {
    if (!selectedCustomerId) { alert('Select a customer first.'); return null; }
    return LK.getCustomer(selectedCustomerId);
  }

  function copyMessage() {
    const c = requireCustomer(); if (!c) return;
    const { text, missing } = currentResolvedText();
    if (missing.length && !confirm('Some tokens are unresolved (' + missing.join(', ') + '). Copy anyway?')) return;
    navigator.clipboard?.writeText(text)
      .then(() => LK.bus.emit('notify', { type: 'messages', text: 'Message copied to clipboard.' }))
      .catch(() => LK.bus.emit('notify', { type: 'messages', text: 'Could not copy — clipboard unavailable.' }));
  }
  function openSmsApp() {
    const c = requireCustomer(); if (!c) return;
    const { text, missing } = currentResolvedText();
    if (missing.length && !confirm('Some tokens are unresolved (' + missing.join(', ') + '). Continue?')) return;
    if (!c.phone) { alert('This customer has no phone number on file.'); return; }
    LK.sms.activeAdapter().openCompose(c.phone, text);
    LK.bus.emit('notify', { type: 'messages', text: 'Opened SMS app — remember to press Log As Sent after you actually send it.' });
  }
  function saveDraft() {
    const c = requireCustomer(); if (!c) return;
    let d = LK.db.messageDrafts.find(x => x.customerId === c.id);
    if (!d) { d = { id: LK.uid(), customerId: c.id }; LK.db.messageDrafts.push(d); }
    d.body = el('composerBody').value; d.updatedAt = LK.nowISO();
    LK.saveDB(true);
    LK.bus.emit('notify', { type: 'messages', text: 'Draft saved.' });
  }
  function logAsSent() {
    const c = requireCustomer(); if (!c) return;
    const { text } = currentResolvedText();
    if (!text.trim()) { alert('Nothing to log — write a message first.'); return; }
    if (LK.db.settings.messaging.confirmBeforeLogging && !confirm('Log this message as sent to ' + c.name + '? Only do this after you\'ve actually sent it.')) return;
    LK.logCommEntry(c.id, null, 'Text sent', 'outbound', text, 'sent', null);
    LK.db.messageDrafts = LK.db.messageDrafts.filter(d => d.customerId !== c.id);
    el('composerBody').value = '';
    LK.saveDB();
    LK.audit.log('Message logged', { entityType: 'customer', entityId: c.id, summary: c.name, newValue: text.slice(0, 60) });
    renderConversation();
    renderPreview();
    LK.bus.emit('notify', { type: 'messages', text: 'Logged as sent to ' + c.name + '.' });
  }
  function scheduleFollowUp() {
    const c = requireCustomer(); if (!c) return;
    const days = parseInt(prompt('Follow up in how many days?', LK.db.settings.messaging.followUpDays)) || LK.db.settings.messaging.followUpDays;
    LK.db.followUps.push({ id: LK.uid(), customerId: c.id, reason: 'Manual follow-up date reached', dueDate: LK.addDays(LK.todayISO(), days), snoozedUntil: null, completed: false, sourceType: 'manual', sourceId: null });
    LK.saveDB();
    renderFollowUpQueue();
    LK.bus.emit('notify', { type: 'messages', text: 'Follow-up scheduled in ' + days + ' days.' });
  }
  function addInternalNote() {
    const c = requireCustomer(); if (!c) return;
    const note = prompt('Internal note (not sent to customer):');
    if (!note) return;
    LK.logCommEntry(c.id, null, 'Internal note', 'internal', note, null, null);
    renderConversation();
  }
  function markFollowUpComplete() {
    const c = requireCustomer(); if (!c) return;
    LK.db.followUps.filter(f => f.customerId === c.id && !f.completed).forEach(f => f.completed = true);
    LK.saveDB();
    LK.audit.log('Follow-up completed', { entityType: 'customer', entityId: c.id, summary: c.name });
    renderFollowUpQueue();
    LK.bus.emit('notify', { type: 'messages', text: 'Follow-ups cleared for ' + c.name + '.' });
  }

  LK.logCommEntry = function (customerId, jobId, type, direction, summary, status, followUpDate) {
    const now = new Date();
    LK.db.communications.push({
      id: LK.uid(), customerId, jobId: jobId || null, type, direction, date: LK.todayISO(),
      time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      summary, status: status || null, followUpDate: followUpDate || null, loggedBy: LK.db.settings.business.owner || 'Edel',
    });
    LK.saveDB(true);
    if (customerId) LK.logActivity(customerId, type, summary.slice(0, 60));
  };

  /* ---------------- quick actions (used by pipeline/calendar/estimator/palette) ---------------- */
  const QUICK_TEMPLATE_MAP = {
    newLead: 'tpl-new-lead', confirmAppointment: 'tpl-estimate-confirm', onMyWay: 'tpl-on-my-way',
    quoteFollowUp: 'tpl-quote-followup', depositRequest: 'tpl-deposit-request', rainDelay: 'tpl-rain-delay',
    finalPayment: 'tpl-final-balance', reviewRequest: 'tpl-review-request',
    // v2.3 — connected workflow suggestions (workflows.js)
    quoteSent: 'tpl-quote-sent', depositReceived: 'tpl-deposit-received', jobScheduled: 'tpl-job-scheduled',
    jobCompleted: 'tpl-job-completed', thankYou: 'tpl-thank-you',
    // v2.3 — weather-aware (Weather Impact panel)
    possibleWeatherDelay: 'tpl-possible-weather-delay', confirmDespiteWeather: 'tpl-confirm-despite-weather',
    severeWeatherReschedule: 'tpl-severe-weather-reschedule', heatAdjustment: 'tpl-heat-adjustment', updatedArrival: 'tpl-updated-arrival',
  };
  function quickAction(key, customerId) {
    LK.nav.go('messages');
    selectCustomer(customerId);
    const tplId = QUICK_TEMPLATE_MAP[key];
    if (tplId) insertTemplate(tplId);
    el('composerBody').scrollIntoView({ block: 'nearest' });
  }

  function wire() {
    populateCustomerSelect();
    el('msgFilterStage').addEventListener('change', e => { listFilterStage = e.target.value; renderCustomerList(); });
    el('msgFilterFollowUp').addEventListener('change', e => { listFilterFollowUp = e.target.checked; renderCustomerList(); });
    el('msgSort').addEventListener('change', e => { listSort = e.target.value; renderCustomerList(); });
    el('msgSearch').addEventListener('input', () => {
      const q = el('msgSearch').value.toLowerCase();
      document.querySelectorAll('#msgCustList .cust-row').forEach(row => {
        const c = LK.getCustomer(row.dataset.id);
        row.style.display = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) ? '' : 'none';
      });
    });
    el('composerCustSelect').addEventListener('change', e => { if (e.target.value) selectCustomer(e.target.value); });
    el('composerBody').addEventListener('input', renderPreview);
    el('composerCopy').addEventListener('click', copyMessage);
    el('composerSms').addEventListener('click', openSmsApp);
    el('composerDraft').addEventListener('click', saveDraft);
    el('composerLogSent').addEventListener('click', logAsSent);
    el('composerFollowUp').addEventListener('click', scheduleFollowUp);
    el('composerNote').addEventListener('click', addInternalNote);
    el('composerMarkDone').addEventListener('click', markFollowUpComplete);

    LK.bus.on('template:selected', insertTemplate);
    renderCustomerList();
    renderConversation();
    renderContext();
    renderFollowUpQueue();
    LK.bus.on('db:changed', () => { renderCustomerList(); renderFollowUpQueue(); if (selectedCustomerId) { renderConversation(); renderContext(); } });
  }

  LK.messages = { quickAction, selectCustomer, pendingFollowUps, refreshFollowUps, renderFollowUpQueue };
  document.addEventListener('DOMContentLoaded', () => { document.getElementById('msgCustList') && wire(); }, { once: true });
})();
