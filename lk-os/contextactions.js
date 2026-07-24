/* ==========================================================================
   LK OS — contextactions.js  (v2.3)
   Reusable "Global Customer and Job Context" action set (spec section 6).
   One place that knows how to jump to a customer/job/appointment/estimate,
   record a payment/expense, set a follow-up, or pin a Primary Objective —
   every screen that needs these buttons asks this module for them instead
   of re-implementing navigation logic.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  function actionsFor(customerId, jobId) {
    const customer = customerId ? LK.getCustomer(customerId) : null;
    const job = jobId ? LK.getJob(jobId) : (customer ? LK.db.jobs.find(j => j.customerId === customer.id && !j.archived) : null);
    const list = [];

    if (customer) {
      list.push({ key: 'viewCustomer', label: 'View Customer', run: () => { LK.nav.go('customers'); if (LK.customers) LK.customers.render && setTimeout(() => document.getElementById('custSearch') && (document.getElementById('custSearch').value = customer.name, document.getElementById('custSearch').dispatchEvent(new Event('input'))), 30); } });
      list.push({ key: 'text', label: 'Text Customer', run: () => { if (LK.messages) LK.messages.selectCustomer(customer.id); } });
      list.push({ key: 'call', label: 'Call Customer', run: () => { if (customer.phone) window.open('tel:' + customer.phone.replace(/[^0-9+]/g, '')); } });
      list.push({
        key: 'followUp', label: 'Set Follow-Up', run: () => {
          const days = parseInt(prompt('Follow up in how many days?', LK.db.settings.messaging.followUpDays)) || LK.db.settings.messaging.followUpDays;
          LK.db.followUps.push({ id: LK.uid(), customerId: customer.id, reason: 'Manual follow-up date reached', dueDate: LK.addDays(LK.todayISO(), days), snoozedUntil: null, completed: false, sourceType: 'manual', sourceId: null });
          LK.saveDB();
          LK.bus.emit('notify', { type: 'workflow', text: 'Follow-up set for ' + customer.name + '.' });
        },
      });
      list.push({
        key: 'objective', label: 'Set Primary Objective', run: () => {
          if (LK.lounge) LK.lounge.setObjective('customer', customer.id, customer.name);
        },
      });
      list.push({ key: 'payment', label: 'Record Payment', run: () => { if (LK.finance) LK.finance.openPaymentModal({ customerId: customer.id, jobId: job ? job.id : null }); } });
      list.push({ key: 'expense', label: 'Record Expense', run: () => { if (LK.finance) LK.finance.openExpenseModal({ jobId: job ? job.id : null }); } });
    }

    if (job) {
      list.push({ key: 'viewJob', label: 'View Job', run: () => { LK.nav.go('pipeline'); if (LK.pipeline) LK.pipeline.openJobModal(job.id); } });
      const event = LK.db.events.find(e => e.jobId === job.id && e.date >= LK.todayISO());
      if (event) list.push({ key: 'appointment', label: 'Open Appointment', run: () => { LK.nav.go('calendar'); if (LK.calendar) LK.calendar.openEventModal(event.id); } });
      const quote = LK.db.quotes.filter(q => q.jobId === job.id).sort((a, b) => b.sentDate.localeCompare(a.sentDate))[0];
      if (quote) list.push({ key: 'estimate', label: 'Open Estimate', run: () => LK.nav.go('estimator') });
      list.push({ key: 'weather', label: 'Open Weather Impact', run: () => LK.nav.go('weather') });
    }

    return list;
  }

  // Renders a filtered subset (opts.only = ['text','call',...]) as a row of
  // .hud-btn.tiny buttons into `container` — callers pick only what's relevant
  // so no single screen gets crowded with all 11 possible actions at once.
  function renderButtons(container, customerId, jobId, opts) {
    if (!container) return;
    opts = opts || {};
    let actions = actionsFor(customerId, jobId);
    if (opts.only) actions = actions.filter(a => opts.only.includes(a.key));
    container.innerHTML = actions.map(a => '<button type="button" class="hud-btn tiny ctx-act" data-key="' + a.key + '">' + a.label + '</button>').join('');
    container.querySelectorAll('.ctx-act').forEach(btn => {
      const action = actions.find(a => a.key === btn.dataset.key);
      if (action) btn.addEventListener('click', action.run);
    });
  }

  LK.context = { actionsFor, renderButtons };
})();
