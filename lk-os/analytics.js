/* ==========================================================================
   LK OS — analytics.js  (v2.1)
   Hand-rolled SVG charts (no chart library) computed strictly from real
   local data (payments, jobs, quotes, expenses, customers). Shows
   "Not enough data yet" instead of fabricating numbers when a series is empty.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  function svgBar(values, labels, opts) {
    opts = opts || {};
    const w = opts.width || 460, h = opts.height || 140, pad = 22;
    const max = Math.max(1, ...values);
    const bw = (w - pad * 2) / values.length;
    let bars = '';
    values.forEach((v, i) => {
      const bh = (v / max) * (h - pad - 14);
      const x = pad + i * bw + bw * 0.18;
      const y = h - pad - bh;
      bars += '<rect x="' + x + '" y="' + y + '" width="' + (bw * 0.64) + '" height="' + bh + '" rx="2" fill="' + (opts.color || '#3FD8FF') + '" opacity="0.85"><title>' + labels[i] + ': ' + v + '</title></rect>';
      bars += '<text x="' + (x + bw * 0.32) + '" y="' + (h - 6) + '" font-size="8" fill="var(--text-dim)" text-anchor="middle" font-family="Share Tech Mono, monospace">' + labels[i] + '</text>';
    });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart-svg" preserveAspectRatio="none">' +
      '<line x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - pad) + '" y2="' + (h - pad) + '" stroke="var(--holo-line)"/>' + bars + '</svg>';
  }
  function svgLine(values, labels, opts) {
    opts = opts || {};
    const w = opts.width || 460, h = opts.height || 140, pad = 22;
    const max = Math.max(1, ...values);
    const stepX = (w - pad * 2) / Math.max(1, values.length - 1);
    const pts = values.map((v, i) => [pad + i * stepX, h - pad - (v / max) * (h - pad - 14)]);
    const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const area = path + ' L' + pts[pts.length - 1][0] + ',' + (h - pad) + ' L' + pts[0][0] + ',' + (h - pad) + ' Z';
    const dots = pts.map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.6" fill="' + (opts.color || '#3FD8FF') + '"><title>' + labels[i] + ': ' + values[i] + '</title></circle>').join('');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart-svg" preserveAspectRatio="none">' +
      '<line x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - pad) + '" y2="' + (h - pad) + '" stroke="var(--holo-line)"/>' +
      '<path d="' + area + '" fill="' + (opts.color || '#3FD8FF') + '" opacity="0.12"/>' +
      '<path d="' + path + '" fill="none" stroke="' + (opts.color || '#3FD8FF') + '" stroke-width="2"/>' + dots + '</svg>';
  }
  function svgDonut(entries) {
    const total = entries.reduce((s, e) => s + e.value, 0) || 1;
    const r = 46, cx = 60, cy = 60, circumference = 2 * Math.PI * r;
    let offset = 0;
    const palette = ['#3FD8FF', '#39FF88', '#FFB84D', '#DD2A7B', '#8B7CF6', '#EA4335', '#00C7B7'];
    const segs = entries.map((e, i) => {
      const frac = e.value / total, dash = frac * circumference;
      const seg = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + palette[i % palette.length] + '" stroke-width="16" stroke-dasharray="' + dash + ' ' + (circumference - dash) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"><title>' + e.label + ': ' + e.value + '</title></circle>';
      offset += dash;
      return seg;
    }).join('');
    const legend = entries.map((e, i) => '<div class="legend-row"><span class="legend-dot" style="background:' + palette[i % palette.length] + '"></span>' + e.label + ' <b>' + e.value + '</b></div>').join('');
    return '<div class="donut-wrap"><svg viewBox="0 0 120 120" class="chart-svg donut-svg">' + segs + '</svg><div class="legend">' + legend + '</div></div>';
  }
  function noData() { return '<div class="log-empty">NOT ENOUGH DATA YET</div>'; }

  function lastNWeeksRevenue(n) {
    const buckets = new Array(n).fill(0), labels = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) labels.push('W' + (n - i));
    LK.db.payments.forEach(p => {
      const days = Math.floor((now - new Date(p.date + 'T00:00:00')) / 86400000);
      const weekIdx = n - 1 - Math.floor(days / 7);
      if (weekIdx >= 0 && weekIdx < n) buckets[weekIdx] += p.amount;
    });
    return { values: buckets, labels };
  }
  function lastNMonthsRevenue(n) {
    const now = new Date();
    const labels = [], values = [];
    for (let i = n - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); labels.push(d.toLocaleDateString('en-US', { month: 'short' })); values.push(0); }
    LK.db.payments.forEach(p => {
      const d = new Date(p.date + 'T00:00:00');
      const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      const idx = n - 1 - monthsAgo;
      if (idx >= 0 && idx < n) values[idx] += p.amount;
    });
    return { values, labels };
  }

  function renderCharts() {
    const root = document.getElementById('analyticsBody');
    if (!root) return;
    const db = LK.db;

    if (!db.customers.length && !db.jobs.length && !db.payments.length) {
      root.innerHTML = '<div class="panel"><span class="br"></span>' + noData() + '<div class="log-empty" style="margin-top:6px">Add customers, jobs and payments to see analytics.</div></div>';
      return;
    }

    const weekly = lastNWeeksRevenue(8);
    const monthly = lastNMonthsRevenue(6);
    const hasRevenue = db.payments.length > 0;

    const decidedQuotes = db.quotes.filter(q => q.status !== 'pending');
    const acceptedQuotes = db.quotes.filter(q => q.status === 'accepted');
    const conversionRate = decidedQuotes.length ? Math.round((acceptedQuotes.length / decidedQuotes.length) * 100) : null;

    const wonJobs = db.jobs.filter(j => j.stage !== 'lost');
    const lostJobs = db.jobs.filter(j => j.stage === 'lost');
    const leadConversion = (wonJobs.length + lostJobs.length) ? Math.round((db.jobs.filter(j => j.stage === 'completed').length / (wonJobs.length + lostJobs.length)) * 100) : null;

    const avgTicket = db.payments.length ? Math.round(db.payments.reduce((s, p) => s + p.amount, 0) / db.payments.length) : null;
    const totalRevenue = db.payments.reduce((s, p) => s + p.amount, 0);
    const totalExpenses = db.expenses.reduce((s, x) => s + x.amount, 0);
    const profit = totalRevenue - totalExpenses;
    const unpaidBalance = db.jobs.filter(j => !j.archived && j.stage !== 'lost').reduce((s, j) => s + LK.jobBalance(j), 0);
    const jobsCompleted = db.jobs.filter(j => j.stage === 'completed').length;
    const newLeads = db.jobs.filter(j => j.stage === 'new').length;
    const reviewsGained = db.customers.reduce((s, c) => s + (c.reviews ? c.reviews.length : 0), 0);

    const serviceCounts = {};
    db.jobs.forEach(j => { serviceCounts[j.service] = (serviceCounts[j.service] || 0) + 1; });
    const topServices = Object.entries(serviceCounts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

    const sourceCounts = {};
    db.customers.forEach(c => { const s = c.source || 'Unknown'; sourceCounts[s] = (sourceCounts[s] || 0) + 1; });
    const leadSources = Object.entries(sourceCounts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

    const crewWorkload = db.crew.map(c => ({ label: c.name, value: db.jobs.filter(j => j.crewId === c.id && !j.archived && j.stage !== 'completed' && j.stage !== 'lost').length })).filter(c => c.value > 0);

    // v2.4 — imported CRM workbook history, read from the centralized
    // LK.metrics module (same numbers Overview/Marketing show) so this panel
    // can never disagree with them. Kept separate from the job-based "New
    // Leads"/"Lead Conversion" stats above (those track pipeline jobs; this
    // tracks the raw historical lead sheet) and from revenue/profit — Cost
    // Of Lead is a marketing spend figure, never counted as revenue.
    const importedCustomers = db.customers.filter(c => c.importFingerprint);
    let importedHistoryHtml = '';
    if (importedCustomers.length && LK.metrics) {
      const mk = LK.metrics.marketing();
      const hireCount = importedCustomers.filter(c => c.importLeadStatusLabel === 'Won/Hired').length;
      const noHireCount = importedCustomers.filter(c => c.importLeadStatusLabel === 'Lost/Not Hired').length;
      const pendingCount = importedCustomers.length - hireCount - noHireCount;
      const decidedImported = hireCount + noHireCount;
      const importedConversionRate = decidedImported ? Math.round((hireCount / decidedImported) * 100) : null;
      const reviewNo = importedCustomers.filter(c => c.leadReviewStatus === 'No').length;
      const statusBreakdown = [{ label: 'Won/Hired', value: hireCount }, { label: 'Lost/Not Hired', value: noHireCount }, { label: 'Pending', value: pendingCount }].filter(s => s.value > 0);

      importedHistoryHtml =
        '<div class="grid panel-grid" style="margin-top:14px">' +
          '<div class="panel"><span class="br"></span><div class="panel-title">Imported Lead History (' + importedCustomers.length + ' records)</div>' + (statusBreakdown.length ? svgDonut(statusBreakdown) : noData()) + '</div>' +
          '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + (importedConversionRate == null ? '—' : importedConversionRate + '%') + '</div><div class="stat-label">Historical Hire Rate</div></div>' +
          '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + (mk.avgCostPerLead == null ? '—' : LK.fmtMoney2(mk.avgCostPerLead)) + '</div><div class="stat-label">Avg. Cost Per Lead (marketing spend, not revenue)</div></div>' +
        '</div>' +
        '<div class="grid panel-grid" style="margin-top:14px">' +
          '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + LK.fmtMoney2(mk.totalLeadCost) + '</div><div class="stat-label">Total Cost of Leads</div></div>' +
          '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + mk.reviewsReceived + '</div><div class="stat-label">Imported Reviews: Yes</div></div>' +
          '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + reviewNo + '</div><div class="stat-label">Imported Reviews: No</div></div>' +
          '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + mk.reviewsPending + '</div><div class="stat-label">Imported Reviews: Pending</div></div>' +
        '</div>';
    }

    // v2.4 — Phase 5: leads/hires/conversion/cost by month, by ZIP, lead
    // source performance, fence type & crew performance, all from the same
    // centralized LK.metrics module (never a separate computation that could
    // drift from what Overview/Marketing show).
    let historicalAnalyticsHtml = '';
    if (LK.metrics && importedCustomers.length) {
      const trend = LK.metrics.monthlyTrend(6);
      const mk = LK.metrics.marketing();
      const fenceTypes = LK.metrics.fenceTypePerformance();
      const crews = LK.metrics.crewPerformance(2);
      const monthRows = trend.map(b => (
        '<div class="cust-line"><span>' + b.label + '</span><span>' +
        b.leads + ' leads · ' + b.hires + ' hires' + (b.conversionRate != null ? ' (' + b.conversionRate + '%)' : '') +
        (b.leadCost ? ' · ' + LK.fmtMoney2(b.leadCost) + ' spent' : '') +
        (b.costPerLead != null ? ' · ' + LK.fmtMoney2(b.costPerLead) + '/lead' : '') +
        (b.reviews ? ' · ' + b.reviews + ' review' + (b.reviews === 1 ? '' : 's') : '') +
        '</span></div>'
      )).join('');
      const jobValueRows = trend.map(b => statRow(b.label, b.jobValueCount ? LK.fmtMoney(b.jobValueTotal) + ' (' + b.jobValueCount + ' job' + (b.jobValueCount === 1 ? '' : 's') + ')' : 'No recorded job values')).join('');
      const sourceRows = mk.leadsBySource.map(s => statRow(s.source, s.leads + ' leads · ' + (s.conversionRate == null ? '— conversion' : s.conversionRate + '% conversion') + (s.avgCostPerLead != null ? ' · ' + LK.fmtMoney2(s.avgCostPerLead) + '/lead' : ''))).join('');

      historicalAnalyticsHtml =
        '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">Leads, Hires &amp; Cost by Month</div>' + (monthRows || noData()) + '</div>' +
        '<div class="grid panel-grid" style="margin-top:14px">' +
          '<div class="panel"><span class="br"></span><div class="panel-title">Strongest ZIP Codes — Leads</div>' + rankList(mk.topZipsByLeads.map(z => ({ label: z.zip, value: z.count })), e => e.value) + '</div>' +
          '<div class="panel"><span class="br"></span><div class="panel-title">Strongest ZIP Codes — Hires</div>' + rankList(mk.topZipsByHires.map(z => ({ label: z.zip, value: z.count })), e => e.value) + '</div>' +
        '</div>' +
        '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">Lead Source Performance</div>' + (sourceRows || noData()) + '</div>' +
        '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">Job Values by Month</div>' +
          '<div class="wx-note neutral">Job value totals include only jobs with a recorded value — blank/unrecorded job values are shown separately, never counted as $0.</div>' +
          jobValueRows +
        '</div>' +
        (fenceTypes.length ? '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">Fence Type Performance</div>' +
          fenceTypes.map(f => statRow(f.fenceType, f.jobs + ' job' + (f.jobs === 1 ? '' : 's') + (f.knownValueJobs ? ' · avg ' + LK.fmtMoney(f.avgValue) + ' (' + f.knownValueJobs + ' recorded)' : ' · no recorded value'))).join('') + '</div>' : '') +
        (crews.length ? '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">Crew Performance</div>' +
          crews.map(c => statRow(c.name, c.completedJobs + ' completed of ' + c.totalJobs + ' total')).join('') + '</div>' : '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">Crew Performance</div><div class="log-empty">NOT ENOUGH JOBS PER CREW YET</div></div>');
    }

    root.innerHTML =
      '<div class="grid panel-grid">' +
        '<div class="panel"><span class="br"></span><div class="panel-title">Monthly Revenue</div>' + (hasRevenue ? svgBar(monthly.values, monthly.labels) : noData()) + '</div>' +
        '<div class="panel"><span class="br"></span><div class="panel-title">Weekly Revenue Trend</div>' + (hasRevenue ? svgLine(weekly.values, weekly.labels) : noData()) + '</div>' +
        '<div class="panel"><span class="br"></span><div class="panel-title">Top Services</div>' + (topServices.length ? svgDonut(topServices) : noData()) + '</div>' +
      '</div>' +
      '<div class="grid panel-grid" style="margin-top:14px">' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + (conversionRate == null ? '—' : conversionRate + '%') + '</div><div class="stat-label">Quote Acceptance Rate</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + (avgTicket == null ? '—' : LK.fmtMoney(avgTicket)) + '</div><div class="stat-label">Average Ticket</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + jobsCompleted + '</div><div class="stat-label">Jobs Completed</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + reviewsGained + '</div><div class="stat-label">Reviews Gained</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + newLeads + '</div><div class="stat-label">New Leads</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + (leadConversion == null ? '—' : leadConversion + '%') + '</div><div class="stat-label">Lead Conversion</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + LK.fmtMoney(totalExpenses) + '</div><div class="stat-label">Expenses</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value ' + (profit >= 0 ? '' : 'neg') + '">' + LK.fmtMoney(profit) + '</div><div class="stat-label">Profit (Revenue − Expenses)</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + LK.fmtMoney(unpaidBalance) + '</div><div class="stat-label">Unpaid Balances</div></div>' +
      '</div>' +
      '<div class="grid panel-grid" style="margin-top:14px">' +
        '<div class="panel"><span class="br"></span><div class="panel-title">Lead Sources</div>' + (leadSources.length ? svgDonut(leadSources) : noData()) + '</div>' +
        '<div class="panel"><span class="br"></span><div class="panel-title">Crew Workload (active jobs)</div>' + (crewWorkload.length ? svgBar(crewWorkload.map(c => c.value), crewWorkload.map(c => c.label.split(' ')[0])) : noData()) + '</div>' +
      '</div>' + importedHistoryHtml + historicalAnalyticsHtml;
  }

  /* ==========================================================================
     v2.3 — Business Intelligence sections. Same rule as everything above:
     real LK.db data only, honest "not enough data" below the configured
     threshold, profit figures explicitly labeled "Estimated."
     ========================================================================== */
  function minData() { return LK.db.settings.intelligence.minDataThreshold || 3; }
  function notEnough(n) { return n < minData(); }
  function intelSection(title, bodyHtml) {
    return '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">' + title + '</div>' + bodyHtml + '</div>';
  }
  function statRow(label, value) { return '<div class="cust-line"><span>' + label + '</span><span>' + value + '</span></div>'; }
  function rankList(entries, fmt) {
    return entries.length ? entries.map((e, i) => '<div class="cust-line"><span>' + (i + 1) + '. ' + e.label + '</span><span>' + fmt(e) + '</span></div>').join('') : noData();
  }

  function computeIntelligence() {
    const db = LK.db;
    const activeJobs = db.jobs.filter(j => LK.db.settings.intelligence.includeArchivedJobs || !j.archived);
    const completedJobs = activeJobs.filter(j => j.stage === 'completed');

    /* ---- Revenue intelligence ---- */
    const byCustomer = {};
    db.payments.forEach(p => { if (p.customerId) byCustomer[p.customerId] = (byCustomer[p.customerId] || 0) + (Number(p.amount) || 0); });
    const topCustomers = Object.entries(byCustomer).map(([id, amt]) => ({ label: (LK.getCustomer(id) || {}).name || 'Unknown', value: amt })).sort((a, b) => b.value - a.value).slice(0, 5);

    const byCrew = {};
    activeJobs.forEach(j => { if (j.crewId) byCrew[j.crewId] = (byCrew[j.crewId] || 0) + activeJobs.filter(j2 => j2.crewId === j.crewId).reduce((s, j3) => s + (LK.db.payments.filter(p => p.jobId === j3.id).reduce((s2, p) => s2 + p.amount, 0)), 0); });
    const revenueByCrew = Object.entries(byCrew).map(([id, amt]) => ({ label: (LK.getCrew(id) || {}).name || 'Unassigned', value: amt })).sort((a, b) => b.value - a.value);

    const depositsCollected = activeJobs.filter(j => j.depositStatus === 'paid').reduce((s, j) => s + (Number(j.depositAmount) || 0), 0);
    const remainingBalances = activeJobs.reduce((s, j) => s + LK.jobBalance(j), 0);
    const avgJobValue = activeJobs.length ? activeJobs.reduce((s, j) => s + (Number(j.approvedAmount || j.value) || 0), 0) / activeJobs.length : 0;
    const topJobs = completedJobs.map(j => ({ label: (LK.getCustomer(j.customerId) || {}).name + ' — ' + j.service, value: Number(j.approvedAmount || j.value) || 0 })).sort((a, b) => b.value - a.value).slice(0, 5);

    /* ---- Profit intelligence ---- */
    const materialCosts = activeJobs.reduce((s, j) => s + (Number(j.materialCost) || 0), 0);
    const laborCosts = activeJobs.reduce((s, j) => s + (Number(j.laborCost) || 0), 0);
    const otherJobExpenses = activeJobs.reduce((s, j) => s + (Number(j.otherExpenses) || 0), 0);
    const trackedExpenses = db.expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const grossRevenue = db.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const estGrossProfit = grossRevenue - materialCosts - laborCosts;
    const estNetProfit = estGrossProfit - otherJobExpenses - trackedExpenses;
    const serviceProfit = {};
    activeJobs.forEach(j => {
      const cost = (Number(j.materialCost) || 0) + (Number(j.laborCost) || 0) + (Number(j.otherExpenses) || 0);
      const rev = Number(j.approvedAmount || j.value) || 0;
      if (!serviceProfit[j.service]) serviceProfit[j.service] = { revenue: 0, cost: 0, count: 0 };
      serviceProfit[j.service].revenue += rev; serviceProfit[j.service].cost += cost; serviceProfit[j.service].count++;
    });
    const serviceMargins = Object.entries(serviceProfit).map(([service, s]) => ({ label: service, value: s.revenue ? Math.round(((s.revenue - s.cost) / s.revenue) * 100) : 0, revenue: s.revenue })).sort((a, b) => b.value - a.value);

    /* ---- Lead & sales intelligence ---- */
    const bySource = {};
    db.customers.forEach(c => { const s = c.source || 'Unknown'; (bySource[s] = bySource[s] || { leads: 0, quotes: 0, approved: 0, revenue: 0 }).leads++; });
    db.quotes.forEach(q => { const c = LK.getCustomer(q.customerId); const s = (c && c.source) || 'Unknown'; if (bySource[s]) bySource[s].quotes++; });
    activeJobs.filter(j => !['new', 'contacted', 'estimate-scheduled', 'quoted', 'lost'].includes(j.stage)).forEach(j => { const c = LK.getCustomer(j.customerId); const s = (c && c.source) || 'Unknown'; if (bySource[s]) bySource[s].approved++; });
    db.payments.forEach(p => { const c = LK.getCustomer(p.customerId); const s = (c && c.source) || 'Unknown'; if (bySource[s]) bySource[s].revenue += (Number(p.amount) || 0); });
    const sourceStats = Object.entries(bySource).map(([source, s]) => ({ source, ...s, closeRate: s.leads ? Math.round((s.approved / s.leads) * 100) : 0 })).sort((a, b) => b.revenue - a.revenue);
    const avgQuoteValue = db.quotes.length ? db.quotes.reduce((s, q) => s + (Number(q.amount) || 0), 0) / db.quotes.length : 0;
    const lostJobs = db.jobs.filter(j => j.stage === 'lost');
    const lostReasons = lostJobs.filter(j => j.notes).map(j => j.notes);

    /* ---- Operations intelligence ---- */
    const completedAudits = LK.audit ? LK.audit.list({ action: 'Job moved' }).filter(e => e.newValue === 'Completed') : [];
    const durations = completedAudits.map(a => { const j = LK.getJob(a.entityId); return j ? (new Date(a.date) - new Date(j.createdAt)) / 86400000 : null; }).filter(d => d != null && d >= 0);
    const avgJobDurationDays = durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null;
    const onTimeCount = completedAudits.filter(a => { const j = LK.getJob(a.entityId); return j && j.dueDate && a.date <= j.dueDate; }).length;
    const crewJobCounts = db.crew.map(c => ({ label: c.name, value: activeJobs.filter(j => j.crewId === c.id).length }));
    const crewCompleted = db.crew.map(c => ({ label: c.name, value: completedJobs.filter(j => j.crewId === c.id).length }));

    /* ---- Customer intelligence ---- */
    const monthStart = LK.addDays(LK.todayISO(), -30);
    const newCustomers = db.customers.filter(c => c.createdAt >= monthStart).length;
    const jobCountByCustomer = {};
    activeJobs.forEach(j => { jobCountByCustomer[j.customerId] = (jobCountByCustomer[j.customerId] || 0) + 1; });
    const repeatCustomers = Object.values(jobCountByCustomer).filter(n => n > 1).length;
    const avgCustomerValue = db.customers.length ? grossRevenue / db.customers.length : 0;
    const customersWithBalance = db.customers.filter(c => LK.customerStats(c.id).outstandingBalance > 0).length;
    const mostActive = db.customers.map(c => ({ label: c.name, value: (jobCountByCustomer[c.id] || 0) })).filter(c => c.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);
    const warrantyDue = db.customers.filter(c => c.warrantyExpires && c.warrantyExpires >= LK.todayISO() && c.warrantyExpires <= LK.addDays(LK.todayISO(), 30)).length;
    const reviewsReceived = db.customers.filter(c => c.reviewStatus === 'received').length;
    const referralCustomers = db.customers.filter(c => (c.source || '').toLowerCase() === 'referral').length;

    /* ---- Geographic intelligence ---- */
    const byCity = {};
    db.customers.forEach(c => {
      if (!c.city) return;
      const jobs = activeJobs.filter(j => j.customerId === c.id);
      const rev = db.payments.filter(p => p.customerId === c.id).reduce((s, p) => s + p.amount, 0);
      if (!byCity[c.city]) byCity[c.city] = { jobs: 0, revenue: 0 };
      byCity[c.city].jobs += jobs.length; byCity[c.city].revenue += rev;
    });
    const cityStats = Object.entries(byCity).map(([city, s]) => ({ label: city, jobs: s.jobs, value: s.revenue, avg: s.jobs ? Math.round(s.revenue / s.jobs) : 0 })).sort((a, b) => b.value - a.value);

    return {
      topCustomers, revenueByCrew, depositsCollected, remainingBalances, avgJobValue, topJobs,
      materialCosts, laborCosts, otherJobExpenses, trackedExpenses, grossRevenue, estGrossProfit, estNetProfit, serviceMargins,
      sourceStats, avgQuoteValue, lostJobs, lostReasons,
      avgJobDurationDays, onTimeRate: completedAudits.length ? Math.round((onTimeCount / completedAudits.length) * 100) : null, completedAuditsCount: completedAudits.length,
      crewJobCounts, crewCompleted,
      newCustomers, repeatCustomers, avgCustomerValue, customersWithBalance, mostActive, warrantyDue, reviewsReceived, referralCustomers,
      cityStats,
    };
  }

  function renderIntelligence() {
    const db = LK.db;
    if (!db.settings.intelligence.showEstimatedProfit && !db.settings.intelligence.showGeographicAnalytics) { /* still render revenue/lead/ops/customer sections */ }
    const x = computeIntelligence();

    let html = '';

    html += intelSection('Revenue Intelligence', notEnough(db.payments.length) ? noData() :
      statRow('Deposits Collected', LK.fmtMoney(x.depositsCollected)) + statRow('Remaining Balances', LK.fmtMoney(x.remainingBalances)) + statRow('Average Job Value', LK.fmtMoney(x.avgJobValue)) +
      '<div class="cust-sub-title">Top Customers by Revenue</div>' + rankList(x.topCustomers, e => LK.fmtMoney(e.value)) +
      '<div class="cust-sub-title">Revenue by Crew</div>' + rankList(x.revenueByCrew, e => LK.fmtMoney(e.value)) +
      '<div class="cust-sub-title">Highest-Value Completed Jobs</div>' + rankList(x.topJobs, e => LK.fmtMoney(e.value)));

    if (db.settings.intelligence.showEstimatedProfit) {
      html += intelSection('Profit Intelligence <span class="sim-tag">ESTIMATED</span>', notEnough(db.payments.length) ? noData() :
        statRow('Gross Revenue', LK.fmtMoney(x.grossRevenue)) + statRow('Material Costs', LK.fmtMoney(x.materialCosts)) + statRow('Labor Costs', LK.fmtMoney(x.laborCosts)) +
        statRow('Other Expenses (jobs + logged)', LK.fmtMoney(x.otherJobExpenses + x.trackedExpenses)) +
        statRow('Estimated Gross Profit', LK.fmtMoney(x.estGrossProfit)) + statRow('Estimated Net Profit', LK.fmtMoney(x.estNetProfit)) +
        '<div class="cust-sub-title">Profit Margin by Service (estimated)</div>' + (x.serviceMargins.length ? x.serviceMargins.map(s => statRow(s.label, s.value + '%')).join('') : noData()) +
        (x.serviceMargins.length ? statRow('Most Profitable', x.serviceMargins[0].label) + statRow('Least Profitable', x.serviceMargins[x.serviceMargins.length - 1].label) : ''));
    }

    html += intelSection('Lead &amp; Sales Intelligence', notEnough(db.customers.length) ? noData() :
      '<div class="cust-sub-title">By Lead Source</div>' + x.sourceStats.map(s => '<div class="cust-line"><span>' + s.source + '</span><span>' + s.leads + ' leads · ' + s.quotes + ' quotes · ' + s.closeRate + '% close · ' + LK.fmtMoney(s.revenue) + '</span></div>').join('') +
      statRow('Average Quote Value', LK.fmtMoney(x.avgQuoteValue)) +
      statRow('Lost Jobs', x.lostJobs.length) +
      '<div class="cust-sub-title">Lost-Job Reasons</div>' + (x.lostReasons.length ? x.lostReasons.map(r => '<div class="cust-review-text">"' + r + '"</div>').join('') : '<div class="log-empty">NOT RECORDED YET</div>'));

    html += intelSection('Operations Intelligence', notEnough(x.completedAuditsCount) ?
      '<div class="log-empty">NOT ENOUGH TRACKED COMPLETIONS YET — this section fills in as jobs are completed and logged going forward.</div>' :
      statRow('Average Job Duration', x.avgJobDurationDays != null ? x.avgJobDurationDays + ' days' : '—') +
      statRow('On-Time Completion Rate', x.onTimeRate != null ? x.onTimeRate + '%' : '—') +
      '<div class="cust-sub-title">Crew Workload (active jobs)</div>' + (x.crewJobCounts.length ? x.crewJobCounts.map(c => statRow(c.label, c.value)).join('') : noData()) +
      '<div class="cust-sub-title">Jobs Completed by Crew</div>' + (x.crewCompleted.length ? x.crewCompleted.map(c => statRow(c.label, c.value)).join('') : noData()) +
      statRow('Weather-Related Delays', db.weatherDelays.length));

    html += intelSection('Customer Intelligence', notEnough(db.customers.length) ? noData() :
      statRow('New Customers (30d)', x.newCustomers) + statRow('Repeat Customers', x.repeatCustomers) + statRow('Average Customer Value', LK.fmtMoney(x.avgCustomerValue)) +
      statRow('Customers With Outstanding Balance', x.customersWithBalance) + statRow('Warranty Follow-Ups Due (30d)', x.warrantyDue) +
      statRow('Reviews Received', x.reviewsReceived) + statRow('Referral Customers', x.referralCustomers) +
      '<div class="cust-sub-title">Most Active Customers</div>' + rankList(x.mostActive, e => e.value + ' job' + (e.value === 1 ? '' : 's')));

    if (db.settings.intelligence.showGeographicAnalytics) {
      html += intelSection('Geographic Intelligence', !x.cityStats.length ? '<div class="log-empty">NO CITY DATA RECORDED YET</div>' :
        '<div class="cust-sub-title">Jobs &amp; Revenue by City</div>' + x.cityStats.map(c => '<div class="cust-line"><span>' + c.label + '</span><span>' + c.jobs + ' jobs · ' + LK.fmtMoney(c.value) + ' · avg ' + LK.fmtMoney(c.avg) + '</span></div>').join('') +
        '<div class="mic-status" style="margin-top:8px">ZIP-level detail isn\'t tracked yet — city is the most precise real location field currently captured.</div>');
    }

    return html;
  }

  function render() {
    renderCharts();
    const root = document.getElementById('analyticsBody');
    if (!root) return;
    const db = LK.db;
    if (!db.customers.length && !db.jobs.length && !db.payments.length) return; // matches renderCharts' own early-return case, no point stacking empty sections
    root.innerHTML += renderIntelligence();
  }

  LK.analytics = { render, computeIntelligence };
  LK.bus.on('db:changed', render);
  LK.bus.on('view:analytics', render);
})();
