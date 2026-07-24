/* ==========================================================================
   LK OS — focus.js
   Focus Mode: pick a task, pick a duration, get a countdown with reduced
   motion and silenced non-critical notifications. Every session (completed
   or abandoned) is logged to LK.db.focusSessions.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let timerId = null;
  let endsAt = null;
  let durationSec = 0;
  let taskId = null, taskText = '';
  let active = false;

  function el(id) { return document.getElementById(id); }

  function openTaskPicker() {
    const sel = el('focusTaskSelect');
    const openTasks = LK.db.tasks.filter(t => !t.done);
    sel.innerHTML = '<option value="">No specific task</option>' + openTasks.map(t => '<option value="' + t.id + '">' + t.text + '</option>').join('');
    if (LK.db.primaryObjective && LK.db.primaryObjective.type === 'task') sel.value = LK.db.primaryObjective.refId;
  }

  function start(minutes) {
    minutes = minutes || LK.db.settings.personal.defaultFocusMinutes;
    durationSec = minutes * 60;
    endsAt = Date.now() + durationSec * 1000;
    taskId = el('focusTaskSelect').value || null;
    const opt = el('focusTaskSelect').selectedOptions[0];
    taskText = opt ? opt.textContent : '';
    active = true;
    document.body.classList.add('focus-active');
    render();
    tick();
    timerId = setInterval(tick, 1000);
    LK.bus.emit('focus:changed');
    LK.bus.emit('notify', { type: 'focus', text: 'Focus session started (' + minutes + ' min).' });
  }

  function tick() {
    const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    const disp = el('focusCountdown');
    if (disp) disp.textContent = m + ':' + s;
    if (remaining <= 0) complete();
  }

  function render() {
    el('focusIdle').style.display = active ? 'none' : 'block';
    el('focusRunning').style.display = active ? 'block' : 'none';
    el('focusTaskLabel').textContent = taskText || 'No specific task selected';
    const po = LK.db.primaryObjective;
    el('focusObjective').textContent = po ? po.text : 'No primary objective set';
  }

  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function complete() {
    stopTimer();
    logSession('completed');
    active = false;
    document.body.classList.remove('focus-active');
    if (allowedVoice('focusComplete')) LK.audio.speak('Focus session complete.', { context: 'focusComplete' });
    LK.bus.emit('notify', { type: 'focus', text: 'Focus session complete.' });
    showPrompt();
  }
  function abandon() {
    stopTimer();
    logSession('abandoned');
    active = false;
    document.body.classList.remove('focus-active');
    render();
    LK.bus.emit('focus:changed');
  }

  function logSession(status) {
    LK.db.focusSessions.push({ id: LK.uid(), date: LK.todayISO(), duration: Math.round(durationSec / 60), taskId, taskText, status, notes: '' });
    LK.saveDB();
    LK.bus.emit('focus:changed');
  }

  function allowedVoice(ctx) {
    const v = LK.db.settings.voice;
    return v.enabled && v.allowedContexts && v.allowedContexts[ctx];
  }

  function showPrompt() {
    el('focusPrompt').classList.add('open');
  }
  function closePrompt() { el('focusPrompt').classList.remove('open'); }

  function markTaskComplete() {
    if (taskId) {
      const t = LK.db.tasks.find(x => x.id === taskId);
      if (t) { t.done = true; LK.saveDB(); }
    }
    closePrompt(); render();
  }

  function isActive() { return active; }
  function remainingSeconds() { return active ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : 0; }

  function renderHistory() {
    const list = el('focusHistory');
    if (!list) return;
    const sessions = LK.db.focusSessions.slice().reverse().slice(0, 10);
    list.innerHTML = sessions.length ? sessions.map(s =>
      '<div class="cust-line"><span>' + LK.fmtDate(s.date) + ' &middot; ' + s.duration + 'm &middot; ' + (s.taskText || 'No task') + '</span><span class="wx-note ' + (s.status === 'completed' ? 'good' : 'neutral') + '" style="margin:0;padding:0;border:none">' + s.status.toUpperCase() + '</span></div>'
    ).join('') : '<div class="log-empty">NO FOCUS SESSIONS YET</div>';
  }

  function wire() {
    openTaskPicker();
    document.querySelectorAll('.focus-dur-btn').forEach(btn => btn.addEventListener('click', () => start(Number(btn.dataset.min))));
    el('focusCustomStart').addEventListener('click', () => { const m = parseInt(el('focusCustomMin').value); if (m > 0) start(m); });
    el('focusAbandon').addEventListener('click', abandon);
    el('focusMarkDone').addEventListener('click', markTaskComplete);
    el('focusContinue').addEventListener('click', () => { closePrompt(); start(LK.db.settings.personal.defaultFocusMinutes); });
    el('focusTakeBreak').addEventListener('click', () => { closePrompt(); render(); LK.breakroom && LK.breakroom.open(); });
    el('focusReturnDashboard').addEventListener('click', () => { closePrompt(); render(); LK.nav.go('overview'); });
    render();
    renderHistory();
    LK.bus.on('db:changed', renderHistory);
  }

  LK.focus = { start, abandon, isActive, remainingSeconds, openTaskPicker, renderHistory };
  document.addEventListener('DOMContentLoaded', () => { document.getElementById('focusIdle') && wire(); }, { once: true });
})();
