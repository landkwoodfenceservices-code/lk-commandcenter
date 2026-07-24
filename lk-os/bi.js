/* ==========================================================================
   LK OS — bi.js  (v2.3)
   OPERATIONS INSIGHTS — a rules-based query engine over real LK.db data,
   not a general AI. Every answer is computed live; nothing here is ever a
   guess or a canned response. Backs both the BI Questions panel and the
   Insight Cards on the Analytics view.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  const QUESTIONS = [
    { key: 'bestSource', label: 'Which lead source is making the most money?' },
    { key: 'bestMargin', label: 'Which service has the highest profit margin?' },
    { key: 'whoOwes', label: 'Which customers still owe money?' },
    { key: 'quotesNeedFollowUp', label: 'Which quotes are most likely to need follow-up?' },
    { key: 'crewMostWork', label: 'Which crew completed the most work?' },
    { key: 'avgJobValue', label: 'What is my average job value?' },
    { key: 'closeRate', label: 'What is my close rate?' },
    { key: 'revenueScheduled', label: 'How much revenue is scheduled this month?' },
    { key: 'weatherDelays', label: 'Which jobs were delayed by weather?' },
    { key: 'prioritizeToday', label: 'What should I prioritize today?' },
    { key: 'costEffectiveLeadSource', label: 'Which platform produces the most cost-effective leads?' },
  ];

  function answer(key) {
    const db = LK.db;
    if (!LK.analytics) return 'Analytics not loaded yet.';
    const x = LK.analytics.computeIntelligence();

    switch (key) {
      case 'bestSource': {
        if (!x.sourceStats.length || !x.sourceStats.some(s => s.revenue > 0)) return 'Not enough revenue-by-source data yet.';
        const best = x.sourceStats[0];
        return best.source + ' has generated the most revenue: ' + LK.fmtMoney(best.revenue) + ' from ' + best.leads + ' lead' + (best.leads === 1 ? '' : 's') + '.';
      }
      case 'bestMargin': {
        if (!x.serviceMargins.length) return 'Not enough completed jobs with cost data yet.';
        const best = x.serviceMargins[0];
        return best.label + ' has the highest estimated profit margin at ' + best.value + '% (estimated, not finalized accounting).';
      }
      case 'whoOwes': {
        const owing = db.customers.map(c => ({ c, bal: LK.customerStats(c.id).outstandingBalance })).filter(x2 => x2.bal > 0).sort((a, b) => b.bal - a.bal);
        if (!owing.length) return 'No customers currently have an outstanding balance.';
        return owing.slice(0, 6).map(x2 => x2.c.name + ' (' + LK.fmtMoney(x2.bal) + ')').join(', ');
      }
      case 'quotesNeedFollowUp': {
        const pending = db.quotes.filter(q => q.status === 'pending');
        if (!pending.length) return 'No pending quotes right now.';
        const days = db.settings.messaging.followUpDays || 3;
        const stale = pending.filter(q => (new Date() - new Date(q.sentDate + 'T00:00:00')) / 86400000 >= days);
        return stale.length
          ? stale.map(q => (LK.getCustomer(q.customerId) || {}).name + ' — ' + q.service + ' (' + LK.fmtMoney(q.amount) + ')').join(', ')
          : 'All pending quotes are still within the normal follow-up window.';
      }
      case 'crewMostWork': {
        if (!x.crewCompleted.length || !x.crewCompleted.some(c => c.value > 0)) return 'Not enough completed, crew-assigned jobs yet.';
        const best = x.crewCompleted.slice().sort((a, b) => b.value - a.value)[0];
        return best.label + ' completed the most jobs (' + best.value + ').';
      }
      case 'avgJobValue': return db.jobs.length ? 'Average job value is ' + LK.fmtMoney(x.avgJobValue) + ' across ' + db.jobs.length + ' job' + (db.jobs.length === 1 ? '' : 's') + '.' : 'No jobs recorded yet.';
      case 'closeRate': {
        const decided = db.quotes.filter(q => q.status !== 'pending');
        if (!decided.length) return 'Not enough decided quotes yet to calculate a close rate.';
        const accepted = db.quotes.filter(q => q.status === 'accepted').length;
        return 'Close rate is ' + Math.round((accepted / decided.length) * 100) + '% (' + accepted + ' of ' + decided.length + ' decided quotes).';
      }
      case 'revenueScheduled': {
        const horizon = LK.addDays(LK.todayISO(), 30);
        const scheduled = db.jobs.filter(j => !j.archived && ['scheduled', 'progress', 'waiting'].includes(j.stage) && j.dueDate && j.dueDate <= horizon).reduce((s, j) => s + (Number(j.approvedAmount || j.value) || 0), 0);
        return scheduled ? LK.fmtMoney(scheduled) + ' in scheduled work value over the next 30 days.' : '$0 in scheduled work value over the next 30 days.';
      }
      case 'weatherDelays':
        return db.weatherDelays.length ? db.weatherDelays.map(d => LK.fmtDate(d.date) + ': ' + d.reason).join('; ') : 'No weather-related delays recorded yet.';
      case 'prioritizeToday': {
        const po = db.primaryObjective;
        if (po) return 'Your Primary Objective: ' + po.text;
        const followUps = LK.messages ? LK.messages.pendingFollowUps() : [];
        if (followUps.length) return followUps.length + ' follow-up' + (followUps.length === 1 ? '' : 's') + ' due today — start there.';
        const topQuote = db.quotes.filter(q => q.status === 'pending').sort((a, b) => b.amount - a.amount)[0];
        if (topQuote) return 'Follow up on the ' + LK.fmtMoney(topQuote.amount) + ' pending quote for ' + (LK.getCustomer(topQuote.customerId) || {}).name + '.';
        return 'No urgent items found — a good day to work the pipeline.';
      }
      case 'costEffectiveLeadSource': {
        if (!LK.marketing) return 'Marketing Intelligence not loaded yet.';
        const { start, end } = { start: LK.addDays(LK.todayISO(), -30), end: LK.todayISO() };
        const perPlatform = LK.marketing.PLATFORMS.map(p => {
          const s = LK.marketing.allPlatformsSummary(start, end).perPlatform.find(x => x.platform === p.key);
          return { label: p.label, cpl: s.crmLeads ? s.adSpend / s.crmLeads : null };
        }).filter(p => p.cpl != null);
        if (!perPlatform.length) return 'Not enough imported marketing data with matching leads yet.';
        const best = perPlatform.sort((a, b) => a.cpl - b.cpl)[0];
        return best.label + ' has the lowest cost per (CRM-verified) lead at ' + LK.fmtMoney(best.cpl) + '.';
      }
      default: return 'Unknown question.';
    }
  }

  function insightCards() {
    if (!LK.analytics) return [];
    const x = LK.analytics.computeIntelligence();
    const db = LK.db;
    const cards = [];

    if (x.sourceStats.length >= 2) {
      const byLeads = x.sourceStats.slice().sort((a, b) => b.leads - a.leads)[0];
      const byClose = x.sourceStats.slice().sort((a, b) => b.closeRate - a.closeRate)[0];
      if (byLeads.source !== byClose.source && byClose.closeRate > 0) {
        cards.push({ text: byLeads.source + ' produced the most leads this period, but ' + byClose.source + ' had the highest close rate (' + byClose.closeRate + '%).', support: byLeads.leads + ' leads from ' + byLeads.source + ' · ' + byClose.closeRate + '% close rate from ' + byClose.source });
      }
    }
    if (x.serviceMargins.length >= 2) {
      const byRevenue = x.serviceMargins.slice().sort((a, b) => b.revenue - a.revenue)[0];
      const byMargin = x.serviceMargins[0];
      cards.push({
        text: byRevenue.label + ' produced the highest revenue' + (byMargin.label === byRevenue.label ? ', and also had the strongest estimated margin.' : ', while ' + byMargin.label + ' had the strongest estimated margin (' + byMargin.value + '%).'),
        support: LK.fmtMoney(byRevenue.revenue) + ' revenue from ' + byRevenue.label,
      });
    }
    if (db.weatherDelays.length) cards.push({ text: db.weatherDelays.length + ' job' + (db.weatherDelays.length === 1 ? ' was' : 's were') + ' delayed by weather this period.', support: db.weatherDelays.map(d => LK.fmtDate(d.date)).join(', ') });
    return cards;
  }

  function render() {
    const wrap = document.getElementById('biBody');
    if (!wrap) return;
    const cards = insightCards();
    wrap.innerHTML =
      '<div class="panel" style="margin-top:14px"><span class="br"></span>' +
        '<div class="panel-title">OPERATIONS INSIGHTS <span class="mic-status" style="display:inline">— rules-based, computed from your real data, not general AI</span></div>' +
        (cards.length ? cards.map(c => '<div class="cust-line" style="flex-direction:column; align-items:flex-start; gap:2px"><span>' + c.text + '</span>' + (c.support ? '<span class="notif-time">' + c.support + '</span>' : '') + '</div>').join('') : '<div class="log-empty">NOT ENOUGH DATA YET FOR AN INSIGHT</div>') +
        '<div class="panel-title" style="margin-top:14px; font-size:12px">Ask a Question</div>' +
        '<div class="cs-buttons" id="biQuestionButtons">' + QUESTIONS.map(q => '<button type="button" class="hud-btn tiny bi-q" data-key="' + q.key + '">' + q.label + '</button>').join('') + '</div>' +
        '<div id="biAnswer" class="cust-review-text" style="margin-top:8px"></div>' +
      '</div>';

    wrap.querySelectorAll('.bi-q').forEach(btn => btn.addEventListener('click', () => {
      document.getElementById('biAnswer').textContent = answer(btn.dataset.key);
    }));
  }

  LK.bi = { answer, insightCards, render, QUESTIONS };
  LK.bus.on('db:changed', render);
  LK.bus.on('view:analytics', render);
})();
