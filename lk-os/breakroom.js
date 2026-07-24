/* ==========================================================================
   LK OS — breakroom.js
   Strategic Break Room: controlled, timed breaks that dim business
   notifications, optionally launch a short simulation, and hand control
   back cleanly. No streaks, no reward loops — just a timer and a return
   button.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let timerId = null, endsAt = null, durationMin = 0, activity = 'Quiet break';
  let active = false;

  function el(id) { return document.getElementById(id); }

  function open() { LK.nav.go('lounge'); LK.lounge.showSub('breakroom'); }

  function start(minutes, act) {
    durationMin = minutes || LK.db.settings.personal.defaultBreakMinutes;
    activity = act || 'Quiet break';
    endsAt = Date.now() + durationMin * 60000;
    active = true;
    document.body.classList.add('break-active');
    el('breakIdle').style.display = 'none';
    el('breakRunning').style.display = 'block';
    el('breakDone').classList.remove('open');
    el('breakActivityLabel').textContent = activity;
    tick();
    timerId = setInterval(tick, 1000);
    LK.bus.emit('notify', { type: 'break', text: 'Break started (' + durationMin + ' min).' });
  }

  function tick() {
    const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    el('breakCountdown').textContent = m + ':' + s;
    if (remaining <= 0) complete();
  }

  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function complete() {
    stopTimer();
    logSession('completed');
    active = false;
    document.body.classList.remove('break-active');
    if (LK.simulations) LK.simulations.forceEnd();
    el('breakRunning').style.display = 'none';
    el('breakIdle').style.display = 'block';
    el('breakDone').classList.add('open');
    LK.audio.chimeBlip();
    const v = LK.db.settings.voice;
    if (v.enabled && v.allowedContexts.breakComplete) LK.audio.speak('Break complete, ' + LK.db.settings.personal.greetingName + '. Your next priority is ready.', { context: 'breakComplete' });
    LK.bus.emit('notify', { type: 'break', text: 'Break complete.' });
  }
  function skip() {
    stopTimer();
    logSession('abandoned');
    active = false;
    document.body.classList.remove('break-active');
    if (LK.simulations) LK.simulations.forceEnd();
    el('breakRunning').style.display = 'none';
    el('breakIdle').style.display = 'block';
  }

  function logSession(status) {
    LK.db.breakSessions.push({ id: LK.uid(), date: LK.todayISO(), duration: durationMin, activity, status });
    LK.saveDB();
    renderHistory();
  }

  function returnToCommand() {
    el('breakDone').classList.remove('open');
    LK.nav.go('overview');
  }

  function renderHistory() {
    const list = el('breakHistory');
    if (!list) return;
    const sessions = LK.db.breakSessions.slice().reverse().slice(0, 10);
    list.innerHTML = sessions.length ? sessions.map(s =>
      '<div class="cust-line"><span>' + LK.fmtDate(s.date) + ' &middot; ' + s.duration + 'm &middot; ' + s.activity + '</span><span class="wx-note ' + (s.status === 'completed' ? 'good' : 'neutral') + '" style="margin:0;padding:0;border:none">' + s.status.toUpperCase() + '</span></div>'
    ).join('') : '<div class="log-empty">NO BREAKS LOGGED YET</div>';
  }

  function wire() {
    document.querySelectorAll('.break-dur-btn').forEach(btn => btn.addEventListener('click', () => start(Number(btn.dataset.min))));
    el('breakCustomStart').addEventListener('click', () => { const m = parseInt(el('breakCustomMin').value); if (m > 0) start(m); });
    el('breakSkip').addEventListener('click', skip);
    el('breakReturn').addEventListener('click', returnToCommand);
    renderHistory();
    LK.bus.on('db:changed', renderHistory);
  }

  LK.breakroom = { start, open, isActive: () => active };
  document.addEventListener('DOMContentLoaded', () => { document.getElementById('breakIdle') && wire(); }, { once: true });
})();
