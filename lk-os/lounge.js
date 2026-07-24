/* ==========================================================================
   LK OS — lounge.js
   The Lounge's sub-navigation, Night Shift theme, the Priority Command
   Center panel (Overview), Primary Objective pinning, and the user's own
   saved quotes/scripture rotation (never pulled from the internet).
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let currentSub = null;
  let nightShiftTimer = null;

  function el(id) { return document.getElementById(id); }

  /* ---------------- sub-nav ---------------- */
  function applyVisibilityPrefs() {
    const p = LK.db.settings.personal;
    const hide = { simulations: !p.showGames, reflection: !p.showReflection, ambient: !p.showAmbience };
    Object.keys(hide).forEach(key => {
      const tab = document.querySelector('.lounge-subtab[data-sub="' + key + '"]');
      if (tab) tab.style.display = hide[key] ? 'none' : '';
    });
    // if the currently-open sub-view just got hidden, bounce back to Music
    if (currentSub && hide[currentSub]) showSub('music');
  }
  function showSub(key) {
    document.querySelectorAll('.lounge-sub').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.lounge-subtab').forEach(t => t.classList.toggle('active', t.dataset.sub === key));
    const target = document.querySelector('.lounge-sub[data-sub="' + key + '"]');
    if (target) target.classList.add('active');
    currentSub = key;
    LK.db.settings.personal.defaultLoungeView = key;
    LK.saveDB(true);
    LK.bus.emit('lounge:sub', key);
  }

  /* ---------------- Night Shift ---------------- */
  function applyNightShift(on) {
    document.body.classList.toggle('night-shift', on);
    document.documentElement.style.setProperty('--ns-warmth', String(LK.db.settings.lounge.nightShift.warmth));
    renderNightShiftPanel();
  }
  function toggleNightShift() {
    const ns = LK.db.settings.lounge.nightShift;
    ns.enabled = !document.body.classList.contains('night-shift');
    LK.saveDB(true);
    applyNightShift(ns.enabled);
  }
  function checkAutoNightShift() {
    const ns = LK.db.settings.lounge.nightShift;
    if (!ns.autoStart || !ns.autoEnd) return;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = ns.autoStart.split(':').map(Number);
    const [eh, em] = ns.autoEnd.split(':').map(Number);
    const start = sh * 60 + sm, end = eh * 60 + em;
    const shouldBeOn = start > end ? (cur >= start || cur < end) : (cur >= start && cur < end);
    // Only auto-activate; never auto-deactivate a manual toggle mid-window, and never activate when the feature is off.
    if (shouldBeOn && !document.body.classList.contains('night-shift')) applyNightShift(true);
  }
  function renderNightShiftPanel() {
    const wrap = el('nightShiftStatus');
    if (!wrap) return;
    const on = document.body.classList.contains('night-shift');
    wrap.textContent = on ? 'NIGHT SHIFT ACTIVE' : 'NIGHT SHIFT OFF';
    wrap.className = 'wx-note ' + (on ? 'good' : 'neutral');

    const tomorrow = LK.addDays(LK.todayISO(), 1);
    const tomorrowEvents = LK.db.events.filter(e => e.date === tomorrow).sort((a, b) => a.startTime.localeCompare(b.startTime));
    el('nightShiftSchedule').innerHTML = tomorrowEvents.length
      ? tomorrowEvents.map(e => '<div class="cal-event"><span class="cal-event-time">' + e.startTime + '</span><span>' + e.title + '</span></div>').join('')
      : '<div class="log-empty">NOTHING SCHEDULED TOMORROW</div>';

    const openFollowUps = LK.messages ? LK.messages.pendingFollowUps() : [];
    el('nightShiftFollowups').innerHTML = openFollowUps.length
      ? openFollowUps.slice(0, 6).map(f => '<div class="cust-line"><span>' + (LK.getCustomer(f.customerId) || {}).name + '</span><span>' + f.reason + '</span></div>').join('')
      : '<div class="log-empty">NO OPEN FOLLOW-UPS</div>';
  }

  /* ---------------- Primary Objective (v2.3 — smart suggestions) ----------------
     type may be any of: task, customer, job, estimate, payment, followUp,
     idea, decision, manual. `extra` carries optional deadline/value/nextAction
     and, for suggested (non-manual) objectives, the reason it was suggested. */
  function setObjective(type, refId, text, extra) {
    extra = extra || {};
    LK.db.primaryObjective = {
      type, refId, text, setAt: LK.nowISO(),
      deadline: extra.deadline || null, value: extra.value != null ? extra.value : null,
      nextAction: extra.nextAction || '', suggestedReason: extra.suggestedReason || null,
      manuallyPinned: !extra.suggestedReason,
    };
    LK.saveDB();
    LK.bus.emit('objective:changed');
    LK.bus.emit('notify', { type: 'lounge', text: 'Primary Objective set: ' + text });
  }
  function clearObjective() {
    LK.db.primaryObjective = null;
    LK.saveDB();
    LK.bus.emit('objective:changed');
  }

  // Recommends an objective from real signals only (overdue follow-up > highest
  // pending quote > largest unpaid balance > next appointment timing > weather
  // risk). Always explains why. Never replaces a manually-pinned objective
  // without the caller confirming first.
  function suggestObjective() {
    const db = LK.db;
    const followUps = LK.messages ? LK.messages.pendingFollowUps() : [];
    const overdue = followUps.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    if (overdue) {
      const c = LK.getCustomer(overdue.customerId);
      return { type: 'followUp', refId: overdue.id, text: 'Follow up with ' + (c ? c.name : 'customer') + ' — ' + overdue.reason, reason: 'This is the most overdue follow-up (due ' + overdue.dueDate + ').' };
    }
    const topQuote = db.quotes.filter(q => q.status === 'pending').sort((a, b) => b.amount - a.amount)[0];
    if (topQuote) {
      const c = LK.getCustomer(topQuote.customerId);
      return { type: 'estimate', refId: topQuote.id, text: 'Close the ' + LK.fmtMoney(topQuote.amount) + ' quote for ' + (c ? c.name : 'customer'), reason: 'This is the highest-value pending quote.', value: topQuote.amount };
    }
    const topBalanceJob = db.jobs.filter(j => !j.archived && j.stage !== 'lost').map(j => ({ j, bal: LK.jobBalance(j) })).sort((a, b) => b.bal - a.bal)[0];
    if (topBalanceJob && topBalanceJob.bal > 0) {
      const c = LK.getCustomer(topBalanceJob.j.customerId);
      return { type: 'job', refId: topBalanceJob.j.id, text: 'Collect ' + LK.fmtMoney(topBalanceJob.bal) + ' balance from ' + (c ? c.name : 'customer'), reason: 'This is the largest outstanding balance.', value: topBalanceJob.bal };
    }
    const nextEvent = db.events.filter(e => e.date >= LK.todayISO() && !e.completed).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0];
    if (nextEvent) {
      return { type: 'job', refId: nextEvent.jobId, text: 'Prepare for ' + nextEvent.title + ' at ' + nextEvent.startTime, reason: 'This is the next appointment on the calendar.', deadline: nextEvent.date };
    }
    return null;
  }
  function applySuggestedObjective() {
    const s = suggestObjective();
    if (!s) { LK.bus.emit('notify', { type: 'lounge', text: 'No suggestion available — not enough active pipeline data yet.' }); return; }
    const po = LK.db.primaryObjective;
    if (po && po.manuallyPinned) {
      if (!confirm('You have a manually-pinned objective ("' + po.text + '"). Replace it with the suggested objective ("' + s.text + '")?')) return;
    }
    setObjective(s.type, s.refId, s.text, { deadline: s.deadline, value: s.value, suggestedReason: s.reason });
  }

  /* ---------------- Priority Command Center ----------------
     Rendering moved to missioncontrol.js (v2.3) as Mission Control Row 2 —
     this stays a thin delegate so the bus listeners below don't need to
     change, and setObjective/clearObjective (used elsewhere) are unaffected. */
  function renderPriority() {
    if (LK.missionControl) LK.missionControl.render();
  }

  /* ---------------- saved quotes / scripture ---------------- */
  function renderQuote() {
    const wrap = el('loungeQuote');
    if (!wrap) return;
    if (!LK.db.settings.personal.showQuote || !LK.db.savedQuotes.length) { wrap.innerHTML = ''; return; }
    const dayIdx = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const q = LK.db.savedQuotes[dayIdx % LK.db.savedQuotes.length];
    wrap.innerHTML = '<div class="lounge-quote">"' + q.text + '"' + (q.author ? '<span> — ' + q.author + '</span>' : '') + '</div>';
  }

  function wire() {
    document.querySelectorAll('.lounge-subtab').forEach(tab => tab.addEventListener('click', () => showSub(tab.dataset.sub)));
    el('loungeReturnBtn') && el('loungeReturnBtn').addEventListener('click', () => LK.nav.go('overview'));
    el('nightShiftToggle') && el('nightShiftToggle').addEventListener('click', toggleNightShift);

    applyNightShift(LK.db.settings.lounge.nightShift.enabled);
    setInterval(checkAutoNightShift, 60000);
    checkAutoNightShift();

    applyVisibilityPrefs();
    renderPriority();
    renderQuote();
    LK.bus.on('db:changed', () => { applyVisibilityPrefs(); renderPriority(); renderQuote(); renderNightShiftPanel(); });
    LK.bus.on('objective:changed', renderPriority);
    LK.bus.on('focus:changed', renderPriority);
    LK.bus.on('music:changed', renderPriority);
  }

  LK.lounge = { showSub, setObjective, clearObjective, suggestObjective, applySuggestedObjective, renderPriority, current: () => currentSub };
  LK.bus.on('view:lounge', () => {
    applyVisibilityPrefs();
    const p = LK.db.settings.personal;
    const hiddenDefaults = { simulations: !p.showGames, reflection: !p.showReflection, ambient: !p.showAmbience };
    const want = p.defaultLoungeView || 'music';
    showSub(hiddenDefaults[want] ? 'music' : want);
  });
  document.addEventListener('DOMContentLoaded', wire, { once: true });
})();
