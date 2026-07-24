/* ==========================================================================
   LK OS — crewops.js  (v2.3)
   Crew Operations: current/next assignment and jobs-completed are computed
   live from real jobs/events — never manually entered, so they can't drift
   from reality. Status and open issues are the only fields a human sets,
   since this app has no GPS integration and never claims to.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  const STATUSES = ['available', 'traveling', 'on-site', 'delayed', 'completed', 'off-duty'];

  function currentAssignment(crewId) {
    const todayIso = LK.todayISO();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const todays = LK.db.events.filter(e => e.crewId === crewId && e.date === todayIso && !e.completed);
    const active = todays.find(e => {
      const [sh, sm] = e.startTime.split(':').map(Number), [eh, em] = e.endTime.split(':').map(Number);
      const startMin = sh * 60 + sm, endMin = eh * 60 + em;
      return nowMin >= startMin && nowMin <= endMin;
    });
    return active || null;
  }
  function nextAssignment(crewId) {
    const todayIso = LK.todayISO();
    return LK.db.events.filter(e => e.crewId === crewId && e.date >= todayIso && !e.completed)
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0] || null;
  }
  function jobsCompletedCount(crewId) {
    return LK.db.jobs.filter(j => j.crewId === crewId && j.stage === 'completed').length;
  }
  function weatherExposureToday(crewId) {
    const todayIso = LK.todayISO();
    const outdoorToday = LK.db.events.some(e => e.crewId === crewId && e.date === todayIso && !e.completed);
    if (!outdoorToday) return 'none';
    const risk = LK.weather.assessRiskForDate ? LK.weather.assessRiskForDate(todayIso) : null;
    return risk ? risk.level : 'unknown';
  }

  function refreshComputedFields() {
    let changed = false;
    LK.db.crew.forEach(c => {
      const cur = currentAssignment(c.id), next = nextAssignment(c.id);
      const curId = cur ? cur.id : null, nextId = next ? next.id : null;
      if (c.currentAssignment !== curId) { c.currentAssignment = curId; changed = true; }
      if (c.nextAssignment !== nextId) { c.nextAssignment = nextId; changed = true; }
      const jc = jobsCompletedCount(c.id);
      if (c.jobsCompleted !== jc) { c.jobsCompleted = jc; changed = true; }
    });
    if (changed) LK.saveDB(true);
  }

  function assignmentLabel(eventId) {
    const e = LK.db.events.find(x => x.id === eventId);
    if (!e) return '—';
    const c = e.customerId ? LK.getCustomer(e.customerId) : null;
    return (c ? c.name : e.title) + ' · ' + e.startTime;
  }

  /* ---------------- Crew Board — today's assignments ---------------- */
  function renderCrewBoard() {
    const wrap = document.getElementById('crewBoardBody');
    if (!wrap) return;
    refreshComputedFields();
    const todayIso = LK.todayISO();
    const rows = LK.db.events.filter(e => e.date === todayIso && e.crewId).sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (!rows.length) { wrap.innerHTML = '<div class="log-empty">NO CREW ASSIGNMENTS TODAY</div>'; return; }

    wrap.innerHTML = rows.map(e => {
      const crew = LK.getCrew(e.crewId);
      const c = e.customerId ? LK.getCustomer(e.customerId) : null;
      const [sh, sm] = e.startTime.split(':').map(Number), [eh, em] = e.endTime.split(':').map(Number);
      const durationMin = (eh * 60 + em) - (sh * 60 + sm);
      const risk = LK.weather.assessRiskForDate ? LK.weather.assessRiskForDate(todayIso) : null;
      return '<div class="cust-line"><span>' + (crew ? crew.name : 'Unassigned') + ' — ' + (c ? c.name : e.title) + '</span>' +
        '<span>' + e.startTime + ' · ' + (durationMin > 0 ? Math.round(durationMin / 60 * 10) / 10 + 'h' : '—') + ' · ' + (risk ? risk.level : '—') + ' · ' + (crew ? crew.status : '') + '</span></div>';
    }).join('');
  }

  LK.crewops = { STATUSES, refreshComputedFields, renderCrewBoard, assignmentLabel, weatherExposureToday };
  LK.bus.on('db:changed', renderCrewBoard);
  LK.bus.on('view:settings', renderCrewBoard);
  LK.bus.on('weather:updated', renderCrewBoard);
})();
