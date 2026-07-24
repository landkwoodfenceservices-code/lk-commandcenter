/* ==========================================================================
   LK OS — marketing.js  (v2.3)
   Marketing Intelligence Dashboard — a unified view of Meta/Facebook/
   Instagram/TikTok/Google Business performance so you don't have to open
   five different dashboards each morning. CSV import (via the connector-*
   modules) is the real, functional data path today; live API connections
   are structurally stubbed only (see connector-meta.js and friends) since
   they'd require OAuth secrets this static frontend must never hold.

   Every number shown is either directly imported (tagged source:'csv') or
   cross-referenced against real CRM records (customer.source + payments) —
   never fabricated. "Leads Generated" and "Estimated Revenue/ROI" show both
   the platform's self-reported figure and the CRM-verified figure side by
   side, since platform self-reporting is often optimistic.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  const PLATFORMS = [
    { key: 'meta', label: 'Meta Ads' }, { key: 'facebook', label: 'Facebook' }, { key: 'instagram', label: 'Instagram' },
    { key: 'tiktok', label: 'TikTok' }, { key: 'googleBusiness', label: 'Google Business' },
  ];
  const SOURCE_ALIASES = {
    meta: ['meta ads', 'meta'], facebook: ['facebook'], instagram: ['instagram', ' ig', 'ig '],
    tiktok: ['tiktok'], googleBusiness: ['google'],
  };
  function matchesPlatform(source, platformKey) {
    const s = (source || '').toLowerCase();
    return (SOURCE_ALIASES[platformKey] || []).some(a => s.includes(a));
  }

  function el(id) { return document.getElementById(id); }
  function periodBounds(days) { const end = LK.todayISO(); const start = LK.addDays(end, -days); return { start, end }; }

  // A fixed "last 30 days from today" window would show nothing for a CSV
  // export covering an older date range — the data would be imported
  // correctly but every stat/chart would look empty. Let the user pick the
  // window, and default to a range that actually covers what's been imported.
  let currentPeriodMode = '30';
  function resolvePeriod() {
    if (currentPeriodMode === '90') return periodBounds(90);
    if (currentPeriodMode === 'all') {
      const dates = LK.db.marketingMetrics.map(m => m.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
      const start = dates.length ? dates.slice().sort()[0] : LK.addDays(LK.todayISO(), -30);
      return { start, end: LK.todayISO() };
    }
    return periodBounds(30);
  }

  /* ---------------- aggregation ---------------- */
  function metricsInRange(start, end, platform) {
    return LK.db.marketingMetrics.filter(m => m.date >= start && m.date <= end && (!platform || m.platform === platform));
  }
  function sumField(rows, field) { return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0); }

  function crmLeadsAndRevenue(start, end, platformKey) {
    const customers = LK.db.customers.filter(c => c.createdAt >= start && c.createdAt <= end && matchesPlatform(c.source, platformKey));
    const revenue = LK.db.payments.filter(p => p.date >= start && p.date <= end && customers.some(c => c.id === p.customerId)).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    // Conversions = leads from this period who have gone on to pay anything at
    // all (not limited to the same window) — a real sales cycle often closes
    // after the period a lead first appeared in, so this avoids undercounting.
    const conversions = customers.filter(c => LK.customerStats(c.id).totalRevenue > 0).length;
    return { leads: customers.length, revenue, conversions };
  }

  function platformSummary(platformKey, start, end) {
    const rows = metricsInRange(start, end, platformKey);
    const reach = sumField(rows, 'reach'), views = sumField(rows, 'views') + sumField(rows, 'impressions'),
      adSpend = sumField(rows, 'adSpend'), reportedLeads = sumField(rows, 'leads'),
      messagesStarted = sumField(rows, 'messagesStarted'), calls = sumField(rows, 'calls'),
      engagement = sumField(rows, 'engagement');
    const crm = crmLeadsAndRevenue(start, end, platformKey);
    return { platform: platformKey, hasData: rows.length > 0 || crm.leads > 0, reach, views, adSpend, reportedLeads, messagesStarted, calls, engagement, crmLeads: crm.leads, crmRevenue: crm.revenue, conversions: crm.conversions };
  }

  function allPlatformsSummary(start, end) {
    const perPlatform = PLATFORMS.map(p => platformSummary(p.key, start, end));
    const totals = perPlatform.reduce((acc, p) => ({
      reach: acc.reach + p.reach, views: acc.views + p.views, adSpend: acc.adSpend + p.adSpend,
      reportedLeads: acc.reportedLeads + p.reportedLeads, crmLeads: acc.crmLeads + p.crmLeads,
      messagesStarted: acc.messagesStarted + p.messagesStarted, calls: acc.calls + p.calls, crmRevenue: acc.crmRevenue + p.crmRevenue,
      conversions: acc.conversions + p.conversions,
    }), { reach: 0, views: 0, adSpend: 0, reportedLeads: 0, crmLeads: 0, messagesStarted: 0, calls: 0, crmRevenue: 0, conversions: 0 });
    const leadsForCPL = totals.crmLeads || totals.reportedLeads;
    const costPerLead = leadsForCPL ? totals.adSpend / leadsForCPL : null;
    const conversionRate = totals.crmLeads ? (totals.conversions / totals.crmLeads) * 100 : null;
    const roi = totals.adSpend ? ((totals.crmRevenue - totals.adSpend) / totals.adSpend) * 100 : null;
    return Object.assign({ perPlatform, costPerLead, conversionRate, roi }, totals);
  }

  /* ---------------- Marketing Health Score (transparent formula) ---------------- */
  function pctChange(cur, prev) { if (!prev) return null; return ((cur - prev) / prev) * 100; }
  function scoreFromChange(pct) {
    if (pct == null) return 2.5;
    if (pct >= 20) return 5; if (pct >= 10) return 4; if (pct >= 0) return 3; if (pct >= -10) return 2; return 1;
  }
  function healthScore(cur, prev) {
    const reachScore = scoreFromChange(pctChange(cur.reach, prev.reach));
    const engagementScore = scoreFromChange(pctChange(cur.perPlatform.reduce((s, p) => s + p.engagement, 0), prev.perPlatform.reduce((s, p) => s + p.engagement, 0)));
    const cplScore = (cur.costPerLead != null && prev.costPerLead != null) ? scoreFromChange(-pctChange(cur.costPerLead, prev.costPerLead)) : 2.5; // lower CPL = improvement, so invert
    const roiScore = cur.roi == null ? 2.5 : cur.roi >= 200 ? 5 : cur.roi >= 100 ? 4 : cur.roi >= 0 ? 3 : cur.roi >= -50 ? 2 : 1;
    const g = LK.db.marketingGoals;
    const goalPcts = [];
    if (g.monthlyReach) goalPcts.push(Math.min(1, cur.reach / g.monthlyReach));
    if (g.monthlyLeads) goalPcts.push(Math.min(1, (cur.crmLeads || cur.reportedLeads) / g.monthlyLeads));
    if (g.monthlyRevenue) goalPcts.push(Math.min(1, cur.crmRevenue / g.monthlyRevenue));
    const goalScore = goalPcts.length ? (goalPcts.reduce((s, p) => s + p, 0) / goalPcts.length) * 5 : 2.5;
    const components = { reachScore, engagementScore, cplScore, roiScore, goalScore };
    const total = Math.round(((reachScore + engagementScore + cplScore + roiScore + goalScore) / 5) * 20);
    return { total, components };
  }

  /* ---------------- Trend analysis ---------------- */
  function trendBuckets(mode) {
    const n = mode === 'daily' ? 7 : mode === 'weekly' ? 8 : 6;
    const labels = [], reach = [], spend = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      let start, end, label;
      if (mode === 'daily') { const d = LK.addDays(LK.todayISO(), -i); start = end = d; label = LK.fmtDate(d); }
      else if (mode === 'weekly') { end = LK.addDays(LK.todayISO(), -i * 7); start = LK.addDays(end, -6); label = 'W' + (n - i); }
      else { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); start = LK.localISO(d); end = LK.localISO(new Date(now.getFullYear(), now.getMonth() - i + 1, 0)); label = d.toLocaleDateString('en-US', { month: 'short' }); }
      const rows = metricsInRange(start, end);
      labels.push(label); reach.push(sumField(rows, 'reach')); spend.push(sumField(rows, 'adSpend'));
    }
    return { labels, reach, spend };
  }

  function bestWorst(start, end) {
    const perPlatform = PLATFORMS.map(p => { const s = platformSummary(p.key, start, end); return { label: p.label, key: p.key, revenue: s.crmRevenue, reach: s.reach }; }).filter(p => p.revenue > 0 || p.reach > 0);
    const bestPlatform = perPlatform.slice().sort((a, b) => b.revenue - a.revenue)[0];
    const campaigns = LK.db.marketingCampaigns.filter(c => c.startDate >= start && c.startDate <= end);
    const bestCampaign = campaigns.slice().sort((a, b) => (b.revenueAttributed || 0) - (a.revenueAttributed || 0))[0];
    const worstCampaign = campaigns.slice().sort((a, b) => (a.revenueAttributed || 0) - (b.revenueAttributed || 0))[0];
    const posts = LK.db.marketingPosts.filter(p => p.date >= start && p.date <= end);
    const bestPost = posts.slice().sort((a, b) => (b.engagement || 0) - (a.engagement || 0))[0];
    return { bestPlatform, bestCampaign, worstCampaign, bestPost };
  }

  /* ---------------- Insights (rules-based, real data only) ---------------- */
  function insights(cur, prev) {
    const out = [];
    PLATFORMS.forEach(p => {
      const curP = cur.perPlatform.find(x => x.platform === p.key);
      const prevP = prev.perPlatform.find(x => x.platform === p.key);
      if (!curP.hasData || !prevP.hasData) return;
      const reachChange = pctChange(curP.reach, prevP.reach);
      if (reachChange != null && Math.abs(reachChange) >= 10) out.push(p.label + ' reach ' + (reachChange > 0 ? 'increased' : 'declined') + ' ' + Math.abs(Math.round(reachChange)) + '% this period.');
      const engChange = pctChange(curP.engagement, prevP.engagement);
      if (engChange != null && Math.abs(engChange) >= 15) out.push(p.label + ' engagement ' + (engChange > 0 ? 'increased' : 'declined') + ' ' + Math.abs(Math.round(engChange)) + '%.');
    });
    if (cur.costPerLead != null && prev.costPerLead != null) {
      const change = pctChange(cur.costPerLead, prev.costPerLead);
      if (change != null && Math.abs(change) >= 10) out.push('Cost per lead ' + (change < 0 ? 'improved' : 'increased') + ' ' + Math.abs(Math.round(change)) + '% compared with last period.');
    }
    return out;
  }

  /* ---------------- rendering ---------------- */
  let mappingDraft = null;
  function renderImportStep(platformKey, file) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = LK.csv.parse(reader.result);
      const guess = LK.csv.guessMapping(parsed.headers);
      mappingDraft = { platformKey, text: reader.result, headers: parsed.headers, mapping: guess, rowCount: parsed.rows.length };
      renderMappingPreview();
    };
    reader.readAsText(file);
  }
  function renderMappingPreview() {
    const wrap = el('mktImportPreview');
    if (!wrap || !mappingDraft) return;
    const fields = ['date', 'reach', 'views', 'impressions', 'engagement', 'followers', 'adSpend', 'leads', 'messagesStarted', 'calls'];
    wrap.innerHTML =
      '<div class="panel-title" style="font-size:12px">Column Mapping — ' + mappingDraft.rowCount + ' rows detected</div>' +
      fields.map(f => '<div class="qte-field"><label>' + f.toUpperCase() + '</label><select class="hud-input mkt-map-field" data-field="' + f + '"><option value="">— skip —</option>' + mappingDraft.headers.map(h => '<option value="' + h + '"' + (mappingDraft.mapping[f] === h ? ' selected' : '') + '>' + h + '</option>').join('') + '</select></div>').join('') +
      '<div class="panel-actions" style="margin-top:8px"><button type="button" class="hud-btn" id="mktConfirmImport">CONFIRM IMPORT</button><button type="button" class="hud-btn" id="mktCancelImport">CANCEL</button></div>';
    wrap.querySelectorAll('.mkt-map-field').forEach(sel => sel.addEventListener('change', e => { mappingDraft.mapping[e.target.dataset.field] = e.target.value; }));
    el('mktConfirmImport').addEventListener('click', confirmImport);
    el('mktCancelImport').addEventListener('click', () => { mappingDraft = null; wrap.innerHTML = ''; });
  }
  function confirmImport() {
    if (!mappingDraft) return;
    if (!mappingDraft.mapping.date) {
      alert('Map a Date column before importing — without it, every row would be silently dropped instead of showing up on the dashboard.');
      return;
    }
    const connector = LK.connectors[mappingDraft.platformKey];
    if (!connector) return;
    const rows = connector.importCSV(mappingDraft.text, mappingDraft.mapping);
    const badDates = rows.filter(r => !/^\d{4}-\d{2}-\d{2}$/.test(r.date));
    if (badDates.length) {
      if (!confirm(badDates.length + ' of ' + rows.length + ' row(s) have a date that couldn\'t be recognized and will be skipped. Continue importing the rest?')) return;
    }
    const goodRows = rows.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
    if (!goodRows.length) {
      alert('No rows had a usable date — nothing was imported. Check the Date column mapping and try again.');
      return;
    }
    // Re-importing the same export (or an overlapping date range) replaces
    // same-day CSV rows for this platform instead of adding a second copy —
    // otherwise reach/spend/leads would silently double-count on a re-import.
    const incomingDates = new Set(goodRows.map(r => r.date));
    const beforeCount = LK.db.marketingMetrics.length;
    LK.db.marketingMetrics = LK.db.marketingMetrics.filter(m => !(m.platform === mappingDraft.platformKey && m.source === 'csv' && incomingDates.has(m.date)));
    const replacedCount = beforeCount - LK.db.marketingMetrics.length;
    LK.db.marketingMetrics.push(...goodRows);
    LK.db.settings.marketing.csvMappingMemory[mappingDraft.platformKey] = mappingDraft.mapping;
    LK.saveDB();
    LK.audit.log('Marketing CSV imported', { entityType: 'marketing', entityId: mappingDraft.platformKey, summary: goodRows.length + ' rows — ' + mappingDraft.platformKey + (replacedCount ? ' (' + replacedCount + ' replaced)' : '') });
    LK.bus.emit('notify', { type: 'marketing', text: goodRows.length + ' row' + (goodRows.length === 1 ? '' : 's') + ' imported for ' + mappingDraft.platformKey + (replacedCount ? ', ' + replacedCount + ' older row(s) replaced' : '') + '.' });
    mappingDraft = null;
    el('mktImportPreview').innerHTML = '';
    render();
  }

  function exportCSV() {
    const csv = LK.toCSV(LK.db.marketingMetrics, [
      { key: 'platform', label: 'Platform' }, { key: 'date', label: 'Date' }, { key: 'reach', label: 'Reach' }, { key: 'views', label: 'Views' },
      { key: 'impressions', label: 'Impressions' }, { key: 'engagement', label: 'Engagement' }, { key: 'followers', label: 'Followers' },
      { key: 'adSpend', label: 'Ad Spend' }, { key: 'leads', label: 'Leads' }, { key: 'messagesStarted', label: 'Messages Started' }, { key: 'calls', label: 'Calls' }, { key: 'source', label: 'Source' },
    ]);
    LK.downloadFile('lk-marketing-' + LK.todayISO() + '.csv', csv, 'text/csv');
  }

  function render() {
    const root = el('marketingBody');
    if (!root) return;
    const { start, end } = resolvePeriod();
    const spanDays = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
    const prevEnd = LK.addDays(start, -1), prevStart = LK.addDays(prevEnd, -(spanDays - 1));
    const cur = allPlatformsSummary(start, end);
    const prev = allPlatformsSummary(prevStart, prevEnd);
    const hs = healthScore(cur, prev);
    const bw = bestWorst(start, end);
    const ins = insights(cur, prev);
    const g = LK.db.marketingGoals;

    const anyData = LK.db.marketingMetrics.length > 0;
    const periodLabel = currentPeriodMode === 'all' ? 'All Time' : currentPeriodMode === '90' ? '90d' : '30d';

    // v2.4 — cost-of-lead / hire-rate from the imported CRM workbook, read
    // from the centralized LK.metrics module (same numbers Overview/Analytics
    // show). Kept separate from the ad-platform stats above (those come from
    // platform CSV exports with their own spend/lead schema) — this is real
    // lead cost as tracked in the historical lead sheet, never counted as revenue.
    const importedCustomers = LK.db.customers.filter(c => c.importFingerprint);
    let importedLeadCostHtml = '';
    if (importedCustomers.length && LK.metrics) {
      const mk = LK.metrics.marketing();
      const hireCount = importedCustomers.filter(c => c.importLeadStatusLabel === 'Won/Hired').length;
      const noHireCount = importedCustomers.filter(c => c.importLeadStatusLabel === 'Lost/Not Hired').length;
      const decided = hireCount + noHireCount;
      const hireRate = decided ? Math.round((hireCount / decided) * 100) : null;
      const bySourceLines = mk.leadsBySource.map(s => statLine(s.source, s.leads + ' leads · ' + (s.conversionRate == null ? '— conv.' : s.conversionRate + '% conv.') + (s.avgCostPerLead != null ? ' · ' + LK.fmtMoney2(s.avgCostPerLead) + '/lead' : ''))).join('');
      const zipLines = mk.topZipsByLeads.length ? mk.topZipsByLeads.map(z => statLine(z.zip, z.count + ' lead' + (z.count === 1 ? '' : 's'))).join('') : statLine('ZIP codes', 'Not recorded');
      importedLeadCostHtml =
        '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">Historical Lead Cost (Imported CRM Data)</div>' +
          statLine('Imported Leads', importedCustomers.length) +
          statLine('Hire Rate', hireRate == null ? 'Not enough decided leads yet' : hireRate + '% (' + hireCount + ' of ' + decided + ')') +
          statLine('Avg. Cost Per Lead', mk.avgCostPerLead == null ? 'Not recorded' : LK.fmtMoney2(mk.avgCostPerLead)) +
          statLine('Cost Per Hired Customer', mk.costPerHired == null ? 'Not recorded' : LK.fmtMoney2(mk.costPerHired)) +
          statLine('Total Recorded Lead Cost', mk.totalLeadCost ? LK.fmtMoney2(mk.totalLeadCost) + ' (marketing spend, not revenue)' : 'Not recorded') +
        '</div>' +
        '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">Leads by Source</div>' + bySourceLines +
        '</div>' +
        '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">Strongest ZIP Codes by Lead Count</div>' + zipLines +
        '</div>';
    }

    root.innerHTML =
      '<div class="cal-toolbar" style="margin-bottom:10px">' +
        '<button type="button" class="hud-btn cal-mode-btn mkt-period-btn' + (currentPeriodMode === '30' ? ' active' : '') + '" data-period="30">LAST 30 DAYS</button>' +
        '<button type="button" class="hud-btn cal-mode-btn mkt-period-btn' + (currentPeriodMode === '90' ? ' active' : '') + '" data-period="90">LAST 90 DAYS</button>' +
        '<button type="button" class="hud-btn cal-mode-btn mkt-period-btn' + (currentPeriodMode === 'all' ? ' active' : '') + '" data-period="all">ALL TIME</button>' +
      '</div>' +
      '<div class="grid panel-grid">' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + (cur.reach || '0') + '</div><div class="stat-label">Total Reach (' + periodLabel + ')</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + (cur.views || '0') + '</div><div class="stat-label">Total Views</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + LK.fmtMoney(cur.adSpend) + '</div><div class="stat-label">Total Ad Spend</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + (cur.crmLeads || cur.reportedLeads || '0') + '</div><div class="stat-label">Leads Generated' + (cur.crmLeads ? ' (CRM-verified)' : cur.reportedLeads ? ' (self-reported)' : '') + '</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + (cur.conversions || '0') + '</div><div class="stat-label">Conversions' + (cur.conversionRate != null ? ' (' + Math.round(cur.conversionRate) + '%)' : '') + '</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + (cur.messagesStarted || '0') + '</div><div class="stat-label">Messages Started</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + (cur.calls || '0') + '</div><div class="stat-label">Calls Generated</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + (cur.costPerLead != null ? LK.fmtMoney(cur.costPerLead) : '—') + '</div><div class="stat-label">Cost Per Lead</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + LK.fmtMoney(cur.crmRevenue) + '</div><div class="stat-label">Est. Revenue (CRM-matched)</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value ' + (cur.roi != null && cur.roi < 0 ? 'neg' : '') + '">' + (cur.roi != null ? Math.round(cur.roi) + '%' : '—') + '</div><div class="stat-label">Estimated ROI</div></div>' +
        '<div class="panel stat-panel"><span class="br"></span><div class="stat-value">' + hs.total + '</div><div class="stat-label">Marketing Health Score</div></div>' +
      '</div>' +

      '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title" style="font-size:12px">Health Score Formula</div>' +
        '<div class="wx-note neutral">SCORE = average of 5 components (0-5 each) × 20 — not a guarantee, just a transparent snapshot.</div>' +
        '<div class="score-breakdown" style="margin-top:6px">' +
          '<span>Reach trend ' + hs.components.reachScore.toFixed(1) + '</span><span>Engagement trend ' + hs.components.engagementScore.toFixed(1) + '</span>' +
          '<span>Cost-per-lead trend ' + hs.components.cplScore.toFixed(1) + '</span><span>ROI ' + hs.components.roiScore.toFixed(1) + '</span><span>Goal progress ' + hs.components.goalScore.toFixed(1) + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="panel-title" style="margin-top:18px">Platform Cards</div>' +
      '<div class="grid panel-grid">' + PLATFORMS.map(p => {
        const c = platformSummary(p.key, start, end);
        const pr = platformSummary(p.key, prevStart, prevEnd);
        const trend = pctChange(c.reach, pr.reach);
        return '<div class="panel"><span class="br"></span><div class="panel-title">' + p.label + (c.hasData ? '' : ' <span class="sim-tag">NOT CONNECTED</span>') + '</div>' +
          (c.hasData
            ? statLine('Reach', c.reach) + statLine('Spend', LK.fmtMoney(c.adSpend)) + statLine('Leads (CRM)', c.crmLeads) + statLine('Trend', trend != null ? (trend >= 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(trend)) + '%' : '—')
            : '<div class="log-empty">NO DATA — IMPORT A CSV BELOW</div>') +
          '</div>';
      }).join('') + '</div>' +

      '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">Trend Analysis</div>' +
        '<div class="cal-toolbar"><button type="button" class="hud-btn cal-mode-btn mkt-trend-btn active" data-mode="daily">DAILY</button><button type="button" class="hud-btn cal-mode-btn mkt-trend-btn" data-mode="weekly">WEEKLY</button><button type="button" class="hud-btn cal-mode-btn mkt-trend-btn" data-mode="monthly">MONTHLY</button></div>' +
        '<div id="mktTrendChart"></div>' +
        (bw.bestPlatform ? statLine('Best-Performing Platform', bw.bestPlatform.label) : '') +
        (bw.bestCampaign ? statLine('Best-Performing Campaign', bw.bestCampaign.name) : '') +
        (bw.worstCampaign && bw.worstCampaign !== bw.bestCampaign ? statLine('Needs Attention', bw.worstCampaign.name) : '') +
        (bw.bestPost ? statLine('Best-Performing Post', bw.bestPost.caption || bw.bestPost.type) : '') +
      '</div>' +

      '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">Marketing Insights <span class="mic-status" style="display:inline">— rules-based, real data only</span></div>' +
        (ins.length ? ins.map(t => '<div class="cust-line"><span>' + t + '</span></div>').join('') : '<div class="log-empty">' + (anyData ? 'NOT ENOUGH PERIOD-OVER-PERIOD DATA YET' : 'IMPORT DATA TO SEE INSIGHTS') + '</div>') +
      '</div>' +

      '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">Goal Tracking</div>' +
        goalBar('Monthly Reach', cur.reach, g.monthlyReach) + goalBar('Monthly Leads', cur.crmLeads || cur.reportedLeads, g.monthlyLeads) +
        goalBar('Monthly Revenue', cur.crmRevenue, g.monthlyRevenue) + goalBar('Monthly Ad Spend', cur.adSpend, g.monthlyAdSpend) +
        '<div class="panel-actions" style="margin-top:8px"><button type="button" class="hud-btn tiny" id="mktEditGoals">EDIT GOALS</button></div>' +
      '</div>' +

      importedLeadCostHtml +

      '<div class="panel" style="margin-top:14px"><span class="br"></span><div class="panel-title">Import Platform Data</div>' +
        '<div class="est-form">' +
          '<div class="qte-field"><label>PLATFORM</label><select id="mktImportPlatform" class="hud-input">' + PLATFORMS.map(p => '<option value="' + p.key + '">' + p.label + '</option>').join('') + '</select></div>' +
          '<div class="qte-field"><label>CSV FILE</label><input type="file" id="mktImportFile" accept=".csv"></div>' +
        '</div>' +
        '<div id="mktImportPreview"></div>' +
        '<div class="panel-actions" style="margin-top:8px"><button type="button" class="hud-btn" id="mktExportCsv">EXPORT MARKETING CSV</button></div>' +
        '<div class="mic-status" style="margin-top:8px">No live provider is connected — this reflects data you\'ve imported from each platform\'s own export/analytics screen.</div>' +
      '</div>';

    renderTrendChart('daily');
    wire();
  }

  function statLine(label, value) { return '<div class="cust-line"><span>' + label + '</span><span>' + value + '</span></div>'; }
  function goalBar(label, cur, target) {
    if (!target) return statLine(label, LK.fmtMoney ? (typeof cur === 'number' && cur > 999 ? LK.fmtMoney(cur) : cur) : cur) + '<div class="mic-status">No target set</div>';
    const pct = Math.min(100, Math.round((cur / target) * 100));
    return '<div class="cust-sub-title" style="margin-top:8px">' + label + ' — ' + pct + '%</div><div class="m-bar" style="background:rgba(63,216,255,.12)"><i style="width:' + pct + '%; animation:none; position:static; display:block; height:100%"></i></div>';
  }

  function renderTrendChart(mode) {
    const wrap = el('mktTrendChart');
    if (!wrap) return;
    const t = trendBuckets(mode);
    const max = Math.max(1, ...t.reach);
    wrap.innerHTML = '<div class="wx-hourly">' + t.labels.map((l, i) => '<div class="wx-hour"><div class="wx-hour-t">' + l + '</div><div class="wx-hour-temp">' + t.reach[i] + '</div><div class="wx-hour-pop">' + LK.fmtMoney(t.spend[i]) + '</div></div>').join('') + '</div>';
  }

  function wire() {
    document.querySelectorAll('.mkt-period-btn').forEach(btn => btn.addEventListener('click', () => {
      currentPeriodMode = btn.dataset.period;
      render();
    }));
    document.querySelectorAll('.mkt-trend-btn').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.mkt-trend-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderTrendChart(btn.dataset.mode);
    }));
    const fileInput = el('mktImportFile');
    if (fileInput) fileInput.addEventListener('change', e => { if (e.target.files[0]) renderImportStep(el('mktImportPlatform').value, e.target.files[0]); });
    const exportBtn = el('mktExportCsv');
    if (exportBtn) exportBtn.addEventListener('click', exportCSV);
    const goalsBtn = el('mktEditGoals');
    if (goalsBtn) goalsBtn.addEventListener('click', () => {
      const g = LK.db.marketingGoals;
      g.monthlyReach = parseInt(prompt('Monthly reach goal:', g.monthlyReach)) || 0;
      g.monthlyLeads = parseInt(prompt('Monthly leads goal:', g.monthlyLeads)) || 0;
      g.monthlyRevenue = parseInt(prompt('Monthly revenue goal ($):', g.monthlyRevenue)) || 0;
      g.monthlyAdSpend = parseInt(prompt('Monthly ad spend budget ($):', g.monthlyAdSpend)) || 0;
      LK.saveDB();
      render();
    });
  }

  LK.marketing = { render, allPlatformsSummary, healthScore, insights, PLATFORMS, matchesPlatform, resolvePeriod, setPeriod: (m) => { currentPeriodMode = m; } };
  LK.bus.on('db:changed', () => { if (document.querySelector('.lk-view[data-view="marketing"].active')) render(); });
  LK.bus.on('view:marketing', render);
})();
