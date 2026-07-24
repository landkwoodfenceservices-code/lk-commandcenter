/* ==========================================================================
   LK OS — workflows.js  (v2.3)
   Connects existing features so information flows through the system
   without duplicate data entry. Every function here is called additively
   from an existing save point elsewhere (customers.js, pipeline.js,
   finance.js, calendar.js, estimator.js) — this file never re-implements
   saving logic, it only reacts after a real save already happened.

   Nothing here auto-sends a message or silently creates multiple records:
   record-creating suggestions are confirm-gated by settings.workflows.
   confirmBeforeConnected; message suggestions always just open Messages
   with the right customer + template preloaded, never send anything.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  function confirmEnabled() { return LK.db.settings.workflows.confirmBeforeConnected; }
  function offerRecord(question, onAccept) {
    if (confirmEnabled()) { if (confirm(question)) onAccept(); }
    else onAccept();
  }
  function offerMessage(customerId, templateKey, promptText) {
    if (!LK.messages || !customerId) return;
    if (!LK.db.settings.workflows.autoSuggestMessages) return;
    if (!confirm(promptText)) return;
    LK.messages.quickAction(templateKey, customerId);
  }
  function record(type, customerId, jobId, summary) {
    LK.db.workflowHistory.push({ id: LK.uid(), workflowType: type, customerId: customerId || null, jobId: jobId || null, date: LK.todayISO(), summary });
    LK.db.workflowHistory = LK.db.workflowHistory.slice(-300);
    LK.saveDB(true);
  }
  function scheduleFollowUp(customer, reason) {
    const days = LK.db.settings.messaging.followUpDays || 3;
    offerRecord('Schedule a follow-up for ' + customer.name + ' in ' + days + ' days?', () => {
      LK.db.followUps.push({ id: LK.uid(), customerId: customer.id, reason: reason, dueDate: LK.addDays(LK.todayISO(), days), snoozedUntil: null, completed: false, sourceType: 'manual', sourceId: null });
      LK.saveDB();
      LK.bus.emit('notify', { type: 'workflow', text: 'Follow-up scheduled for ' + customer.name + '.' });
    });
  }

  /* ---------------- 1. New Lead ---------------- */
  function onNewLead(customer) {
    if (!customer) return;
    if (LK.logCommEntry) LK.logCommEntry(customer.id, null, 'Lead received', 'internal', 'New lead — source: ' + (customer.source || 'Unknown'), null, null);
    record('newLead', customer.id, null, customer.name);
    scheduleFollowUp(customer, 'New lead not contacted');
    offerMessage(customer.id, 'newLead', 'Open Messages to send ' + customer.name + ' the New Lead Response now?');
  }

  /* ---------------- 2. Estimate ---------------- */
  function onEstimateSaved(quote, customer, job) {
    if (!customer) return;
    if (LK.logCommEntry) LK.logCommEntry(customer.id, job ? job.id : null, 'Estimate delivered', 'outbound', quote.service + ' estimate — ' + LK.fmtMoney(quote.amount), 'sent', null);
    record('estimate', customer.id, job ? job.id : null, quote.service + ' — ' + LK.fmtMoney(quote.amount));
    offerMessage(customer.id, 'quoteSent', 'Open Messages to send ' + customer.name + ' the Quote Sent message now?');
    scheduleFollowUp(customer, 'Estimate sent with no response');
  }

  /* ---------------- 3. Approval ---------------- */
  function onApproved(job) {
    const customer = LK.getCustomer(job.customerId);
    if (!customer) return;
    const depositPct = LK.db.settings.workflows.defaultDepositPct != null ? LK.db.settings.workflows.defaultDepositPct : LK.db.settings.business.depositPct;
    const depositAmt = Math.round((Number(job.approvedAmount || job.value) || 0) * (depositPct / 100));
    record('approval', customer.id, job.id, job.service + ' approved — deposit ' + LK.fmtMoney(depositAmt));
    offerRecord('Set the deposit request to ' + LK.fmtMoney(depositAmt) + ' (' + depositPct + '%) on this job?', () => {
      job.depositAmount = depositAmt;
      job.depositStatus = 'requested';
      LK.saveDB();
    });
    offerMessage(customer.id, 'depositRequest', 'Open Messages to send ' + customer.name + ' the Deposit Request now?');
  }

  /* ---------------- 4. Deposit ---------------- */
  function onDepositPaid(job, payment) {
    const customer = LK.getCustomer(job.customerId);
    if (!customer) return;
    job.depositStatus = 'paid';
    if (job.stage === 'approved') job.stage = 'deposit-paid';
    LK.saveDB();
    record('deposit', customer.id, job.id, LK.fmtMoney(payment.amount) + ' deposit received');
    offerMessage(customer.id, 'depositReceived', 'Open Messages to send ' + customer.name + ' the Deposit Received message now?');
  }

  /* ---------------- 5. Scheduling ---------------- */
  function onScheduled(job, event) {
    const customer = LK.getCustomer(job.customerId);
    if (!customer) return;
    record('scheduling', customer.id, job.id, job.service + ' scheduled ' + event.date + ' ' + event.startTime);
    offerMessage(customer.id, 'jobScheduled', 'Open Messages to send ' + customer.name + ' the Job Scheduled message now?');
  }

  /* ---------------- 6. Completion ---------------- */
  function onCompleted(job) {
    const customer = LK.getCustomer(job.customerId);
    if (!customer) return;
    const balance = LK.jobBalance(job);
    record('completion', customer.id, job.id, job.service + ' completed — balance ' + LK.fmtMoney(balance));
    if (balance > 0) {
      offerMessage(customer.id, 'jobCompleted', 'Open Messages to send ' + customer.name + ' the Job Completed message now?');
      offerMessage(customer.id, 'finalPayment', 'Open Messages to send ' + customer.name + ' the Final Balance Request now?');
    } else {
      offerMessage(customer.id, 'reviewRequest', job.service + ' is complete and paid in full — open Messages to send ' + customer.name + ' a Review Request now?');
    }
  }

  /* ---------------- 7. Final Payment ---------------- */
  function onFinalPayment(job, payment) {
    const customer = LK.getCustomer(job.customerId);
    if (!customer) return;
    record('payment', customer.id, job.id, LK.fmtMoney(payment.amount) + ' final payment — job paid in full');
    offerMessage(customer.id, 'reviewRequest', 'Balance is now paid in full — open Messages to send ' + customer.name + ' a Thank You / Review Request now?');
  }

  LK.workflows = { onNewLead, onEstimateSaved, onApproved, onDepositPaid, onScheduled, onCompleted, onFinalPayment };
})();
