/* ==========================================================================
   LK OS — metrics.js  (v2.4)
   Single source of truth for every computed business number the app shows.
   Overview, Analytics, Pipeline, and Marketing all call into this instead of
   recomputing their own versions of "revenue this month" or "conversion
   rate" — so the same question always gets the same answer everywhere.
   Every function here is a pure read of LK.db; nothing writes, nothing
   fabricates a value, and blank/unknown data stays blank (never $0, never
   NaN). Cost Of Lead is never added into any revenue/profit total.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  const EARLY_STAGES = ['new', 'contacted', 'estimate-scheduled', 'quoted', 'follow-up'];
  const LOST_STAGES = ['lost'];

  function sum(arr, fn) { return arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0); }
  function safeDiv(a, b) { return b ? a / b : null; }
  function pct(a, b) { const d = safeDiv(a, b); return d == null ? null : Math.round(d * 100); }

  /* ---------------- customers & leads ---------------- */
  function customersAndLeads() {
    const db = LK.db;
    const todayIso = LK.todayISO();
    const weekStart = LK.addDays(todayIso, -7);
    const monthStart = LK.addDays(todayIso, -30);

    const totalCustomers = db.customers.length;
    const totalImported = db.customers.filter(c => c.importFingerprint).length;
    const newLeadsMonth = db.customers.filter(c => (c.createdAt || '') >= monthStart).length;
    const newLeadsWeek = db.customers.filter(c => (c.createdAt || '') >= weekStart).length;
    const wonHired = db.customers.filter(c => c.status === 'active').length;
    const lostNotHired = db.customers.filter(c => c.status === 'inactive').length;
    const stillLead = db.customers.filter(c => c.status === 'lead').length;
    const conversionRate = pct(wonHired, wonHired + lostNotHired);
    const needsJobDetails = LK.excelImport ? db.customers.filter(c => LK.excelImport.needsJobDetails(c)).length : 0;
    const followUps = LK.messages ? LK.messages.pendingFollowUps() : [];
    const needsFollowUp = new Set(followUps.map(f => f.customerId)).size;

    return {
      totalCustomers, totalImported, newLeadsMonth, newLeadsWeek,
      wonHired, lostNotHired, stillLead, conversionRate,
      needsJobDetails, needsFollowUp, followUps,
    };
  }

  /* ---------------- marketing ---------------- */
  function topZips(customers, n) {
    const counts = {};
    customers.forEach(c => { if (c.zip) counts[c.zip] = (counts[c.zip] || 0) + 1; });
    return Object.entries(counts).map(([zip, count]) => ({ zip, count })).sort((a, b) => b.count - a.count).slice(0, n || 5);
  }

  function marketing() {
    const db = LK.db;
    const bySource = {};
    db.customers.forEach(c => {
      const s = c.source || 'Unknown';
      const b = (bySource[s] = bySource[s] || { source: s, leads: 0, won: 0, lost: 0, costTotal: 0, costCount: 0 });
      b.leads++;
      if (c.status === 'active') b.won++;
      if (c.status === 'inactive') b.lost++;
      if (c.costOfLead != null) { b.costTotal += c.costOfLead; b.costCount++; }
    });
    const leadsBySource = Object.values(bySource).map(b => ({
      source: b.source, leads: b.leads, won: b.won, lost: b.lost,
      conversionRate: pct(b.won, b.won + b.lost),
      avgCostPerLead: b.costCount ? Math.round((b.costTotal / b.costCount) * 100) / 100 : null,
    })).sort((a, b) => b.leads - a.leads);

    const costs = db.customers.map(c => c.costOfLead).filter(v => v != null);
    const totalLeadCost = Math.round(costs.reduce((s, v) => s + v, 0) * 100) / 100;
    const avgCostPerLead = costs.length ? Math.round((totalLeadCost / costs.length) * 100) / 100 : null;
    const hiredCount = db.customers.filter(c => c.status === 'active').length;
    const costPerHired = hiredCount ? Math.round((totalLeadCost / hiredCount) * 100) / 100 : null;

    const reviewsReceived = db.customers.filter(c => c.leadReviewStatus === 'Yes').length;
    const reviewsPending = db.customers.filter(c => c.leadReviewStatus === 'Pending').length;

    return {
      leadsBySource, totalLeadCost, avgCostPerLead, costPerHired,
      reviewsReceived, reviewsPending,
      topZipsByLeads: topZips(db.customers, 5),
      topZipsByHires: topZips(db.customers.filter(c => c.status === 'active'), 5),
    };
  }

  /* ---------------- financial ---------------- */
  function financial() {
    const db = LK.db;
    const todayIso = LK.todayISO();
    const monthStart = LK.addDays(todayIso, -30);

    const totalRevenue = sum(db.payments, p => p.amount);
    const revenueMonth = sum(db.payments.filter(p => p.date >= monthStart), p => p.amount);
    const depositsReceived = sum(db.jobs.filter(j => j.depositStatus === 'paid'), j => j.depositAmount);
    const outstandingBalance = sum(db.jobs.filter(j => !j.archived && !LOST_STAGES.includes(j.stage)), j => LK.jobBalance(j));
    const unpaidInvoices = db.invoices.filter(i => i.status === 'pending');
    const unpaidInvoiceTotal = sum(unpaidInvoices, i => i.amount);
    const totalExpenses = sum(db.expenses, x => x.amount);

    // Gross profit is only meaningful once there's a real base of recorded
    // payments to work from -- otherwise a single stray record could read as
    // a business-wide profit/loss figure it isn't. Same threshold pattern
    // already used by analytics.js/bi.js (settings.intelligence.minDataThreshold).
    const threshold = (db.settings.intelligence && db.settings.intelligence.minDataThreshold) || 3;
    const hasEnoughData = db.payments.length >= threshold;
    const estGrossProfit = hasEnoughData ? totalRevenue - totalExpenses : null;

    const jobsWithKnownValue = db.jobs.filter(j => !j.archived && j.value != null && j.value > 0).length;
    const jobsWithUnknownValue = db.jobs.filter(j => !j.archived && (j.value == null || j.value === 0)).length;

    return {
      totalRevenue, revenueMonth, depositsReceived, outstandingBalance,
      unpaidInvoiceCount: unpaidInvoices.length, unpaidInvoiceTotal, totalExpenses,
      estGrossProfit, hasEnoughData,
      jobsWithKnownValue, jobsWithUnknownValue,
    };
  }

  /* ---------------- jobs & operations ---------------- */
  function jobsAndOperations() {
    const db = LK.db;
    const todayIso = LK.todayISO();
    const weekEnd = LK.addDays(todayIso, 7);

    const notArchived = db.jobs.filter(j => !j.archived);
    const activeJobs = notArchived.filter(j => j.stage !== 'completed' && j.stage !== 'lost').length;
    const scheduledJobs = notArchived.filter(j => j.stage === 'scheduled').length;
    const inProgressJobs = notArchived.filter(j => j.stage === 'progress').length;
    const completedJobs = notArchived.filter(j => j.stage === 'completed').length;
    // A job "awaiting details" is missing at least one of the core specs a
    // real job record should have before it's ready to execute/bill.
    const awaitingDetails = notArchived.filter(j => j.stage !== 'lost' && (!j.fenceType || j.value == null || j.value === 0 || (!j.crewId && !j.assignedCrewName))).length;
    const withoutCrew = notArchived.filter(j => j.stage !== 'completed' && j.stage !== 'lost' && !j.crewId && !j.assignedCrewName).length;
    const startingToday = notArchived.filter(j => j.dueDate === todayIso).length;
    const scheduledThisWeek = notArchived.filter(j => j.dueDate && j.dueDate >= todayIso && j.dueDate <= weekEnd).length;
    const overdueJobs = notArchived.filter(j => j.stage !== 'completed' && j.stage !== 'lost' && j.dueDate && j.dueDate < todayIso).length;

    const crewWorkload = db.crew.map(c => ({
      id: c.id, name: c.name,
      activeJobs: db.jobs.filter(j => j.crewId === c.id && !j.archived && j.stage !== 'completed' && j.stage !== 'lost').length,
    }));

    return { activeJobs, scheduledJobs, inProgressJobs, completedJobs, awaitingDetails, withoutCrew, startingToday, scheduledThisWeek, overdueJobs, crewWorkload };
  }

  /* ---------------- estimates & follow-up ---------------- */
  function estimatesAndFollowUp() {
    const db = LK.db;
    const todayIso = LK.todayISO();
    const sevenDaysAgo = LK.addDays(todayIso, -7);

    const pendingQuotes = db.quotes.filter(q => q.status === 'pending');
    const openEstimates = pendingQuotes.filter(q => {
      if (!q.jobId) return true;
      const job = LK.getJob(q.jobId);
      return !job || (!job.archived && EARLY_STAGES.includes(job.stage));
    });
    const acceptedEstimates = db.quotes.filter(q => {
      if (!q.jobId) return false;
      const job = LK.getJob(q.jobId);
      return job && !job.archived && !EARLY_STAGES.includes(job.stage) && job.stage !== 'lost';
    });
    const declinedEstimates = db.quotes.filter(q => {
      if (!q.jobId) return false;
      const job = LK.getJob(q.jobId);
      return job && job.stage === 'lost';
    });
    const oldEstimates = openEstimates.filter(q => q.sentDate && q.sentDate <= sevenDaysAgo);
    const followUps = LK.messages ? LK.messages.pendingFollowUps() : [];

    return {
      openEstimates: openEstimates.length, estimatesAwaitingResponse: openEstimates.length,
      acceptedEstimates: acceptedEstimates.length, declinedEstimates: declinedEstimates.length,
      oldEstimates: oldEstimates.length, customersNeedingFollowUp: new Set(followUps.map(f => f.customerId)).size,
    };
  }

  /* ---------------- calendar ---------------- */
  function calendar() {
    const db = LK.db;
    const todayIso = LK.todayISO();
    const weekEnd = LK.addDays(todayIso, 7);
    const todaysAppointments = db.events.filter(e => e.date === todayIso).length;
    const upcomingAppointments = db.events.filter(e => e.date > todayIso && !e.completed).length;
    const jobsScheduledToday = new Set(db.events.filter(e => e.date === todayIso && e.jobId).map(e => e.jobId)).size;
    const jobsScheduledThisWeek = new Set(db.events.filter(e => e.date >= todayIso && e.date <= weekEnd && e.jobId).map(e => e.jobId)).size;
    return { todaysAppointments, upcomingAppointments, jobsScheduledToday, jobsScheduledThisWeek };
  }

  /* ---------------- monthly trend (Analytics) ---------------- */
  // Real calendar months, oldest to newest, `n` months back including the current one.
  function monthlyTrend(n) {
    n = n || 6;
    const now = new Date();
    const buckets = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const start = LK.localISO(d);
      const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const end = LK.localISO(endDate);
      buckets.push({ label, start, end, leads: 0, hires: 0, lost: 0, leadCost: 0, reviews: 0, revenue: 0, jobValueTotal: 0, jobValueCount: 0 });
    }
    LK.db.customers.forEach(c => {
      const dateKey = c.createdAt || '';
      const b = buckets.find(x => dateKey >= x.start && dateKey <= x.end);
      if (!b) return;
      b.leads++;
      if (c.status === 'active') b.hires++;
      if (c.status === 'inactive') b.lost++;
      if (c.costOfLead != null) b.leadCost += c.costOfLead;
      if (c.leadReviewStatus === 'Yes') b.reviews++;
    });
    LK.db.payments.forEach(p => {
      const b = buckets.find(x => p.date >= x.start && p.date <= x.end);
      if (b) b.revenue += Number(p.amount) || 0;
    });
    // Job values are only counted when actually recorded -- a blank/unknown
    // job value never contributes a fabricated $0 (or worse, gets silently
    // skipped in a way that looks like "no jobs"); jobValueCount tells the
    // caller how many jobs the average is actually based on.
    LK.db.jobs.filter(j => !j.archived && j.value != null && j.value > 0).forEach(j => {
      const dateKey = j.createdAt || '';
      const b = buckets.find(x => dateKey >= x.start && dateKey <= x.end);
      if (!b) return;
      b.jobValueTotal += j.value;
      b.jobValueCount++;
    });
    buckets.forEach(b => {
      b.jobValueTotal = Math.round(b.jobValueTotal * 100) / 100;
      b.conversionRate = pct(b.hires, b.hires + b.lost);
      b.costPerLead = b.leads ? Math.round((b.leadCost / b.leads) * 100) / 100 : null;
      b.costPerHire = b.hires ? Math.round((b.leadCost / b.hires) * 100) / 100 : null;
      b.leadCost = Math.round(b.leadCost * 100) / 100;
    });
    return buckets;
  }

  function fenceTypePerformance() {
    const jobs = LK.db.jobs.filter(j => !j.archived && j.fenceType);
    const byType = {};
    jobs.forEach(j => {
      const t = j.fenceType;
      const b = (byType[t] = byType[t] || { fenceType: t, jobs: 0, knownValueJobs: 0, totalValue: 0 });
      b.jobs++;
      if (j.value != null && j.value > 0) { b.knownValueJobs++; b.totalValue += j.value; }
    });
    return Object.values(byType).map(b => ({ ...b, avgValue: b.knownValueJobs ? Math.round(b.totalValue / b.knownValueJobs) : null })).sort((a, b) => b.jobs - a.jobs);
  }

  function crewPerformance(minJobs) {
    minJobs = minJobs || 2;
    return LK.db.crew.map(c => {
      const jobs = LK.db.jobs.filter(j => j.crewId === c.id && !j.archived);
      const completed = jobs.filter(j => j.stage === 'completed');
      return { id: c.id, name: c.name, totalJobs: jobs.length, completedJobs: completed.length };
    }).filter(c => c.totalJobs >= minJobs);
  }

  function overview() {
    return {
      customers: customersAndLeads(),
      marketing: marketing(),
      financial: financial(),
      jobs: jobsAndOperations(),
      estimates: estimatesAndFollowUp(),
      calendar: calendar(),
    };
  }

  LK.metrics = { overview, customersAndLeads, marketing, financial, jobsAndOperations, estimatesAndFollowUp, calendar, monthlyTrend, fenceTypePerformance, crewPerformance, topZips };
})();
