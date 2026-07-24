/* ==========================================================================
   LK OS — missioncontrol.js  (v2.3)
   The Overview's Mission Control rows. Consolidates what used to be two
   separate renderers (assistant.js's stat grid, lounge.js's priority panel)
   into one real-data-only 4-row view: Executive Summary / Immediate Action /
   Operations / Shortcuts. Every value is computed from LK.db — nothing here
   is invented, and every metric has an honest empty state.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  function el(id) { return document.getElementById(id); }
  function card(label, value, opts) {
    opts = opts || {};
    return '<div class="brief-stat' + (opts.cls ? ' ' + opts.cls : '') + (opts.nav ? ' clickable' : '') + '"' + (opts.nav ? ' data-nav="' + opts.nav + '"' : '') + '><label>' + label + '</label><span>' + value + '</span>' +
      (opts.sub ? '<small class="mc-sub">' + opts.sub + '</small>' : '') + '</div>';
  }
  function wireNav(wrap) {
    wrap.querySelectorAll('.brief-stat[data-nav]').forEach(c => {
      const nav = c.dataset.nav;
      if (!nav) return;
      c.addEventListener('click', () => LK.nav.go(nav));
    });
  }
  function timeToMinutes(t) { if (!t || typeof t !== 'string') return 0; const parts = t.split(':'); const h = parseInt(parts[0], 10) || 0; const m = parseInt(parts[1], 10) || 0; return h * 60 + m; }

  function computeMetrics() {
    const db = LK.db;
    const todayIso = LK.todayISO();
    const weekStart = LK.addDays(todayIso, -7);
    const monthStart = LK.addDays(todayIso, -30);

    // Every card below reads from LK.metrics wherever a shared definition
    // exists, so Overview/Analytics/Pipeline/Marketing never disagree on
    // what "conversion rate" or "outstanding balance" means.
    const M = LK.metrics ? LK.metrics.overview() : null;

    const revenueWeek = db.payments.filter(p => p.date >= weekStart).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const revenueMonth = M ? M.financial.revenueMonth : db.payments.filter(p => p.date >= monthStart).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const outstandingBalance = M ? M.financial.outstandingBalance : db.jobs.filter(j => !j.archived && j.stage !== 'lost').reduce((s, j) => s + LK.jobBalance(j), 0);
    const depositsAwaiting = db.jobs.filter(j => !j.archived && j.depositStatus === 'requested').reduce((s, j) => s + (Number(j.depositAmount) || 0), 0);

    // A quote's status stays 'pending' for its whole life today (nothing in
    // the app currently flips it to accepted/declined once its job moves
    // forward), so once a quote's linked job has progressed past the
    // quoting stages, counting both the quote's value AND the job's value
    // in Pipeline Value would double-count the same real opportunity.
    const EARLY_STAGES = ['new', 'contacted', 'estimate-scheduled', 'quoted', 'follow-up'];
    const pendingQuoteValue = db.quotes.filter(q => {
      if (q.status !== 'pending') return false;
      if (!q.jobId) return true;
      const job = LK.getJob(q.jobId);
      if (!job) return true;
      return !job.archived && EARLY_STAGES.includes(job.stage);
    }).reduce((s, q) => s + (Number(q.amount) || 0), 0);

    const approvedJobValue = db.jobs.filter(j => !j.archived && ['approved', 'deposit-paid'].includes(j.stage)).reduce((s, j) => s + (Number(j.approvedAmount || j.value) || 0), 0);
    const scheduledWorkValue = db.jobs.filter(j => !j.archived && ['scheduled', 'progress', 'waiting'].includes(j.stage)).reduce((s, j) => s + (Number(j.approvedAmount || j.value) || 0), 0);
    const expensesMonth = db.expenses.filter(x => x.date >= monthStart).reduce((s, x) => s + (Number(x.amount) || 0), 0);

    // Estimated Monthly Profit = revenue collected this month, minus logged
    // expenses this month, minus the material/labor/other cost of any job
    // actually marked Completed this month (found via the audit log, which
    // carries a real date — job records themselves have no "cost incurred
    // on" date, so this is the only accurate way to keep it month-scoped).
    let completedJobCostsMonth = 0;
    if (LK.audit) {
      const completedIds = LK.audit.list({ action: 'Job moved' }).filter(e => e.newValue === 'Completed' && e.date >= monthStart).map(e => e.entityId);
      completedJobCostsMonth = db.jobs.filter(j => completedIds.includes(j.id)).reduce((s, j) => s + (Number(j.materialCost) || 0) + (Number(j.laborCost) || 0) + (Number(j.otherExpenses) || 0), 0);
    }
    const estProfitMonth = revenueMonth - expensesMonth - completedJobCostsMonth;

    const jobsToday = db.jobs.filter(j => j.dueDate === todayIso && !j.archived).length;
    const estimatesToday = db.events.filter(e => e.date === todayIso && e.type === 'Estimate').length;
    const followUps = LK.messages ? LK.messages.pendingFollowUps() : [];
    const followUpsDue = followUps.length;
    const overdueFollowUps = followUps.filter(f => f.dueDate < todayIso).length;
    const pipelineValue = pendingQuoteValue + approvedJobValue + scheduledWorkValue;

    const totalCustomers = M ? M.customers.totalCustomers : db.customers.length;
    const activeCustomers = M ? M.customers.wonHired : db.customers.filter(c => c.status === 'active').length;
    const leadCustomers = M ? M.customers.stillLead : db.customers.filter(c => c.status === 'lead').length;
    const needsJobDetailsCount = M ? M.customers.needsJobDetails : (LK.excelImport ? db.customers.filter(c => LK.excelImport.needsJobDetails(c)).length : 0);
    const needsFollowUpCount = M ? M.customers.needsFollowUp : 0;

    // Next future appointment — time-aware, not just date-aware, so a 9am
    // appointment doesn't still show as "next" at 3pm the same day.
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const nextAppointment = db.events
      .filter(e => !e.completed && (e.date > todayIso || (e.date === todayIso && timeToMinutes(e.startTime) >= nowMinutes)))
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0] || null;

    // Business Alerts — overdue balances, overdue follow-ups, scheduling
    // conflicts, missing deposits, jobs past due.
    const overdueJobs = M ? M.jobs.overdueJobs : db.jobs.filter(j => !j.archived && j.stage !== 'completed' && j.stage !== 'lost' && j.dueDate && j.dueDate < todayIso).length;
    const overdueBalanceJobs = db.jobs.filter(j => !j.archived && j.stage === 'completed' && LK.jobBalance(j) > 0).length;
    const missingDepositJobs = db.jobs.filter(j => !j.archived && ['scheduled', 'progress'].includes(j.stage) && j.depositStatus === 'none').length;
    let schedulingConflicts = 0;
    const byKey = {};
    db.events.filter(e => !e.completed && e.crewId).forEach(e => { const k = e.crewId + '|' + e.date; (byKey[k] = byKey[k] || []).push(e); });
    Object.values(byKey).forEach(list => {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const aStart = timeToMinutes(list[i].startTime), aEnd = timeToMinutes(list[i].endTime || list[i].startTime);
          const bStart = timeToMinutes(list[j].startTime), bEnd = timeToMinutes(list[j].endTime || list[j].startTime);
          if (aStart < bEnd && bStart < aEnd) schedulingConflicts++;
        }
      }
    });

    return {
      revenueWeek, revenueMonth, outstandingBalance, depositsAwaiting, pendingQuoteValue, approvedJobValue,
      scheduledWorkValue, expensesMonth, estProfitMonth, jobsToday, estimatesToday, followUpsDue, overdueFollowUps,
      pipelineValue, followUps, totalCustomers, activeCustomers, leadCustomers, needsJobDetailsCount, needsFollowUpCount, nextAppointment,
      overdueJobs, overdueBalanceJobs, missingDepositJobs, schedulingConflicts, M,
    };
  }

  /* ---------------- Row 1 — Executive Summary ---------------- */
  function renderRow1(m) {
    const wrap = el('briefingGrid');
    if (!wrap) return;
    wrap.innerHTML =
      card('REVENUE — MONTH', LK.fmtMoney(m.revenueMonth), { cls: m.revenueMonth ? 'good' : '', nav: 'analytics', sub: 'This week: ' + LK.fmtMoney(m.revenueWeek) }) +
      card('PIPELINE VALUE', LK.fmtMoney(m.pipelineValue), { nav: 'pipeline', sub: 'Quotes ' + LK.fmtMoney(m.pendingQuoteValue) + ' · Scheduled ' + LK.fmtMoney(m.scheduledWorkValue) }) +
      card('OUTSTANDING BALANCE', m.outstandingBalance ? LK.fmtMoney(m.outstandingBalance) : '$0 recorded', { cls: m.outstandingBalance ? 'warn' : 'good', nav: 'customers', sub: 'Deposits awaiting: ' + LK.fmtMoney(m.depositsAwaiting) }) +
      card('EST. MONTHLY PROFIT', LK.fmtMoney(m.estProfitMonth), { cls: m.estProfitMonth >= 0 ? 'good' : 'warn', nav: 'analytics', sub: 'Estimated · expenses ' + LK.fmtMoney(m.expensesMonth) });
    wireNav(wrap);
  }

  /* ---------------- Row 2 — Immediate Action ---------------- */
  function weatherImpactText() {
    if (LK.weather && LK.weather.assessRisk) {
      const risk = LK.weather.assessRisk();
      if (risk) return { text: risk.level, sub: risk.reason, warn: risk.level !== 'GOOD' };
    }
    const d = LK.weather && LK.weather.data;
    if (d && d.ok) return { text: d.recommendation.cls === 'warn' ? 'CAUTION' : 'GOOD', sub: d.recommendation.text, warn: d.recommendation.cls === 'warn' };
    return { text: 'No forecast yet', sub: '', warn: false };
  }

  function renderRow2(m) {
    const wrap = el('mcRow2');
    if (!wrap) return;
    const po = LK.db.primaryObjective;
    const wx = weatherImpactText();

    const apt = m.nextAppointment;
    let apptValue = 'No upcoming appointments';
    if (apt) {
      const apptCustomer = apt.customerId ? LK.getCustomer(apt.customerId) : null;
      const who = apptCustomer ? apptCustomer.name : (apt.title || 'Appointment');
      const when = (apt.date === LK.todayISO() ? 'Today' : LK.fmtDate(apt.date)) + (apt.startTime ? ' ' + apt.startTime : '');
      apptValue = who + ' — ' + when;
    }

    wrap.innerHTML =
      '<div class="brief-stat" id="mcObjectiveCard"><label>PRIMARY OBJECTIVE</label><span>' + (po ? po.text : 'None set') + '</span>' +
        (po && po.suggestedReason ? '<small class="mc-sub">Suggested — ' + po.suggestedReason + '</small>' : '') +
        (po && po.deadline ? '<small class="mc-sub">Due ' + LK.fmtDate(po.deadline) + '</small>' : '') +
        (po && po.value != null ? '<small class="mc-sub">' + LK.fmtMoney(po.value) + '</small>' : '') +
        '<div class="mc-po-actions">' + (po
          ? '<button type="button" class="hud-btn tiny" id="mcObjClear">CLEAR</button>'
          : '<button type="button" class="hud-btn tiny" id="mcObjSet">SET OBJECTIVE</button> <button type="button" class="hud-btn tiny" id="mcObjSuggest">SUGGEST ONE</button>') + '</div>' +
      '</div>' +
      card('FOLLOW-UPS DUE', m.followUpsDue ? m.followUpsDue + ' due' : 'No follow-ups due', { cls: m.followUpsDue ? 'warn' : 'good', nav: 'messages' }) +
      card('NEXT APPOINTMENT', apptValue, { nav: 'calendar' }) +
      '<div class="brief-stat clickable' + (wx.warn ? ' warn' : ' good') + '" data-nav="weather"><label>WEATHER IMPACT</label><span>' + wx.text + '</span>' + (wx.sub ? '<small class="mc-sub">' + wx.sub + '</small>' : '') + '</div>';

    wireNav(wrap);
    const setBtn = el('mcObjSet');
    if (setBtn) setBtn.addEventListener('click', () => {
      const text = prompt('Set Primary Objective:');
      if (text && text.trim() && LK.lounge) LK.lounge.setObjective('manual', null, text.trim());
    });
    const clearBtn = el('mcObjClear');
    if (clearBtn) clearBtn.addEventListener('click', () => { if (LK.lounge) LK.lounge.clearObjective(); });
    const suggestBtn = el('mcObjSuggest');
    if (suggestBtn) suggestBtn.addEventListener('click', () => { if (LK.lounge) LK.lounge.applySuggestedObjective(); });
  }

  /* ---------------- Row 3 — Operations ---------------- */
  function renderRow3(m) {
    const wrap = el('mcRow3');
    if (!wrap) return;
    const db = LK.db;
    const activeCrew = db.crew.filter(c => c.active).length;
    const totalCrew = db.crew.length;
    const jobsInProgress = db.jobs.filter(j => !j.archived && j.stage === 'progress').length;
    const depositsWaitingCount = db.jobs.filter(j => !j.archived && j.depositStatus === 'requested').length;

    const alerts = [];
    if (m.overdueFollowUps) alerts.push(m.overdueFollowUps + ' overdue follow-up' + (m.overdueFollowUps === 1 ? '' : 's'));
    if (m.overdueJobs) alerts.push(m.overdueJobs + ' job' + (m.overdueJobs === 1 ? '' : 's') + ' past due date');
    if (m.overdueBalanceJobs) alerts.push(m.overdueBalanceJobs + ' completed job' + (m.overdueBalanceJobs === 1 ? '' : 's') + ' with an unpaid balance');
    if (m.missingDepositJobs) alerts.push(m.missingDepositJobs + ' scheduled job' + (m.missingDepositJobs === 1 ? '' : 's') + ' with no deposit collected');
    if (m.schedulingConflicts) alerts.push(m.schedulingConflicts + ' crew scheduling conflict' + (m.schedulingConflicts === 1 ? '' : 's'));
    if (LK.device && LK.device.isLowPower && LK.device.isLowPower()) alerts.push('Battery low');

    let marketingCard = '';
    if (db.settings.marketing.showInMissionControl && LK.marketing) {
      if (db.marketingMetrics.length === 0) {
        marketingCard = card('MARKETING', 'No data imported yet', { nav: 'marketing' });
      } else {
        const s = LK.marketing.allPlatformsSummary(LK.addDays(LK.todayISO(), -30), LK.todayISO());
        const leads = s.crmLeads || s.reportedLeads;
        marketingCard = (leads || s.adSpend)
          ? card('MARKETING (30D)', leads + ' leads · ' + LK.fmtMoney(s.adSpend) + ' spend', { nav: 'marketing' })
          : card('MARKETING', 'Imported data is outside the last 30 days — see Marketing tab', { nav: 'marketing' });
      }
    }

    wrap.innerHTML =
      card('CREW STATUS', totalCrew ? activeCrew + ' of ' + totalCrew + ' active' : 'No crew added', { nav: 'settings' }) +
      card('JOBS IN PROGRESS', jobsInProgress || 'None in progress', { nav: 'pipeline' }) +
      card('DEPOSITS WAITING', depositsWaitingCount ? depositsWaitingCount + ' waiting' : 'None waiting', { cls: depositsWaitingCount ? 'warn' : 'good', nav: 'pipeline' }) +
      card('CUSTOMERS', m.totalCustomers || 'No customers yet', { nav: 'customers', sub: m.totalCustomers ? m.activeCustomers + ' active · ' + m.leadCustomers + ' leads' + (m.needsJobDetailsCount ? ' · ' + m.needsJobDetailsCount + ' need job details' : '') + (m.needsFollowUpCount ? ' · ' + m.needsFollowUpCount + ' need follow-up' : '') : '' }) +
      card('BUSINESS ALERTS', alerts.length ? alerts.join(' · ') : 'All clear', { cls: alerts.length ? 'warn' : 'good' }) +
      marketingCard;
    wireNav(wrap);
  }

  /* ---------------- Row 5 — Business Snapshot (v2.4) ----------------
     Everything from the centralized LK.metrics module that isn't already
     covered by Rows 1-3: lead volume, marketing cost/ZIP performance,
     estimates, job-readiness, today's schedule, unpaid invoices, gross
     profit (only once there's enough data), and reviews. Same card()/
     brief-grid pattern as every other row -- additive, no layout change. */
  function renderRow5(m) {
    const wrap = el('mcRow5');
    if (!wrap || !m.M) return;
    const c = m.M.customers, mk = m.M.marketing, f = m.M.financial, j = m.M.jobs, est = m.M.estimates, cal = m.M.calendar;

    const topZipLead = mk.topZipsByLeads[0];
    const topZipHire = mk.topZipsByHires[0];

    wrap.innerHTML =
      card('LEADS THIS MONTH', c.newLeadsMonth, { nav: 'customers', sub: 'This week: ' + c.newLeadsWeek }) +
      card('WON / LOST', c.wonHired + ' won · ' + c.lostNotHired + ' lost', { nav: 'customers', sub: c.conversionRate == null ? 'Not enough decided leads yet' : c.conversionRate + '% conversion rate' }) +
      card('MARKETING SPEND', LK.fmtMoney(mk.totalLeadCost), { nav: 'marketing', sub: (mk.avgCostPerLead != null ? LK.fmtMoney2(mk.avgCostPerLead) + '/lead' : 'No cost data') + (mk.costPerHired != null ? ' · ' + LK.fmtMoney2(mk.costPerHired) + '/hire' : '') }) +
      card('TOP ZIP CODES', topZipLead ? topZipLead.zip + ' (' + topZipLead.count + ' leads)' : 'No ZIP data yet', { nav: 'marketing', sub: topZipHire ? 'Most hires: ' + topZipHire.zip + ' (' + topZipHire.count + ')' : '' }) +
      card('OPEN ESTIMATES', est.openEstimates, { nav: 'estimator', sub: est.acceptedEstimates + ' accepted · ' + (est.oldEstimates ? est.oldEstimates + ' over 7 days old' : 'none over 7 days old') }) +
      card('JOBS AWAITING DETAILS', j.awaitingDetails, { cls: j.awaitingDetails ? 'warn' : 'good', nav: 'pipeline', sub: j.withoutCrew + ' with no crew assigned' }) +
      card("TODAY'S SCHEDULE", cal.todaysAppointments + ' appointment' + (cal.todaysAppointments === 1 ? '' : 's'), { nav: 'calendar', sub: j.startingToday + ' jobs starting · ' + j.scheduledThisWeek + ' this week' }) +
      card('UNPAID INVOICES', f.unpaidInvoiceCount ? LK.fmtMoney(f.unpaidInvoiceTotal) : '$0 recorded', { cls: f.unpaidInvoiceCount ? 'warn' : 'good', nav: 'customers', sub: f.unpaidInvoiceCount + ' invoice' + (f.unpaidInvoiceCount === 1 ? '' : 's') }) +
      card('EST. GROSS PROFIT', f.hasEnoughData ? LK.fmtMoney(f.estGrossProfit) : 'Not enough data yet', { cls: f.hasEnoughData ? (f.estGrossProfit >= 0 ? 'good' : 'warn') : '', nav: 'analytics', sub: f.jobsWithKnownValue + ' jobs with recorded value · ' + f.jobsWithUnknownValue + ' unrecorded' }) +
      card('REVIEWS', mk.reviewsReceived + ' received', { nav: 'analytics', sub: mk.reviewsPending + ' pending' });
    wireNav(wrap);
  }

  /* ---------------- Row 4 — Shortcuts ---------------- */
  function renderRow4() {
    const wrap = el('mcRow4');
    if (!wrap) return;
    wrap.innerHTML = [
      ['+ CUSTOMER', 'mcAddCustomer'], ['+ JOB', 'mcAddJob'], ['+ PAYMENT', 'mcAddPayment'], ['+ EXPENSE', 'mcAddExpense'],
      ['+ APPOINTMENT', 'mcAddAppt'], ['SEND MESSAGE', 'mcSendMessage'], ['CREATE ESTIMATE', 'mcCreateEstimate'], ['OPEN LIVE RADAR', 'mcOpenRadar'],
    ].map(([label, id]) => '<button type="button" class="hud-btn" id="' + id + '">' + label + '</button>').join('');

    el('mcAddCustomer').addEventListener('click', () => { LK.nav.go('customers'); LK.customers.openCustomerModal(null); });
    el('mcAddJob').addEventListener('click', () => { LK.nav.go('pipeline'); LK.pipeline.openJobModal(null); });
    el('mcAddPayment').addEventListener('click', () => { LK.nav.go('customers'); LK.finance.openPaymentModal(); });
    el('mcAddExpense').addEventListener('click', () => { LK.nav.go('customers'); LK.finance.openExpenseModal(); });
    el('mcAddAppt').addEventListener('click', () => { LK.nav.go('calendar'); LK.calendar.openEventModal(null); });
    el('mcSendMessage').addEventListener('click', () => LK.nav.go('messages'));
    el('mcCreateEstimate').addEventListener('click', () => LK.nav.go('estimator'));
    el('mcOpenRadar').addEventListener('click', () => LK.nav.go('weather'));
  }

  function render() {
    if (!el('briefingGrid')) return;
    const m = computeMetrics();
    renderRow1(m); renderRow2(m); renderRow3(m); renderRow5(m); renderRow4();
  }

  LK.missionControl = { render, computeMetrics };
  LK.bus.on('db:changed', render);
  LK.bus.on('weather:updated', render);
  LK.bus.on('objective:changed', render);
  LK.bus.on('focus:changed', render);
  LK.bus.on('music:changed', render);
  document.addEventListener('DOMContentLoaded', render, { once: true });
})();
