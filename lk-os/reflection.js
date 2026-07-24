/* ==========================================================================
   LK OS — reflection.js
   Daily Reflection: one real entry per date, never auto-generated. Hideable
   via Settings (settings.personal.showReflection).
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  function el(id) { return document.getElementById(id); }

  function entryFor(date) { return LK.db.reflections.find(r => r.date === date); }

  /* ---------------- v2.3 — End-of-Day Operations Review ----------------
     Every figure here is computed live from real records for the selected
     date — nothing is entered by hand, so it can never drift from reality. */
  function computeDayStats(date) {
    const db = LK.db;
    const revenue = db.payments.filter(p => p.date === date).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const expenses = db.expenses.filter(x => x.date === date).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const jobsCompleted = LK.audit ? LK.audit.list({ date, action: 'Job moved' }).filter(e => e.newValue === 'Completed').length : 0;
    const estimatesCompleted = db.quotes.filter(q => q.sentDate === date).length;
    const messagesLogged = db.communications.filter(c => c.date === date && c.type !== 'Internal note').length;
    const followUpsCompleted = LK.audit ? LK.audit.list({ date, action: 'Follow-up completed' }).length : 0;
    const focusSessions = db.focusSessions.filter(f => f.date === date);
    const focusCompleted = focusSessions.filter(f => f.status === 'completed').length;
    const breakMinutes = db.breakSessions.filter(b => b.date === date).reduce((s, b) => s + (Number(b.duration) || 0), 0);
    const weatherDelays = db.weatherDelays.filter(d => d.date === date).length;
    return { revenue, expenses, jobsCompleted, estimatesCompleted, messagesLogged, followUpsCompleted, focusCompleted, breakMinutes, weatherDelays };
  }
  function renderDayStats(date) {
    const wrap = el('refDayStats');
    if (!wrap) return;
    const s = computeDayStats(date);
    wrap.innerHTML =
      '<div class="cust-line"><span>Revenue Collected</span><span>' + LK.fmtMoney(s.revenue) + '</span></div>' +
      '<div class="cust-line"><span>Expenses Entered</span><span>' + LK.fmtMoney(s.expenses) + '</span></div>' +
      '<div class="cust-line"><span>Jobs Completed</span><span>' + s.jobsCompleted + '</span></div>' +
      '<div class="cust-line"><span>Estimates Sent</span><span>' + s.estimatesCompleted + '</span></div>' +
      '<div class="cust-line"><span>Messages Logged</span><span>' + s.messagesLogged + '</span></div>' +
      '<div class="cust-line"><span>Follow-Ups Completed</span><span>' + s.followUpsCompleted + '</span></div>' +
      '<div class="cust-line"><span>Focus Sessions Completed</span><span>' + s.focusCompleted + '</span></div>' +
      '<div class="cust-line"><span>Break Time</span><span>' + s.breakMinutes + ' min</span></div>' +
      '<div class="cust-line"><span>Weather Delays</span><span>' + s.weatherDelays + '</span></div>';
  }

  function loadForm(date) {
    const r = entryFor(date) || {};
    el('refDate').value = date;
    el('refWin').value = r.win || '';
    el('refStress').value = r.stress || '';
    el('refFollowUp').value = r.followUp || '';
    el('refMoney').value = r.moneyCollected || '';
    el('refLesson').value = r.lesson || '';
    el('refPriorityTomorrow').value = r.priorityTomorrow || '';
    el('refEnergy').value = r.energy || 5;
    el('refNotes').value = r.notes || '';
    renderDayStats(date);
  }

  function save() {
    const date = el('refDate').value || LK.todayISO();
    let r = entryFor(date);
    if (!r) { r = { date }; LK.db.reflections.push(r); }
    r.win = el('refWin').value.trim();
    r.stress = el('refStress').value.trim();
    r.followUp = el('refFollowUp').value.trim();
    r.moneyCollected = parseFloat(el('refMoney').value) || 0;
    r.lesson = el('refLesson').value.trim();
    r.priorityTomorrow = el('refPriorityTomorrow').value.trim();
    r.energy = parseInt(el('refEnergy').value) || 5;
    r.notes = el('refNotes').value.trim();
    LK.saveDB();
    renderList();
    LK.bus.emit('notify', { type: 'lounge', text: 'Reflection saved for ' + LK.fmtDate(date) + '.' });
  }

  function renderList() {
    const list = el('refList');
    const entries = LK.db.reflections.slice().sort((a, b) => b.date.localeCompare(a.date));
    const q = (el('refSearch').value || '').trim();
    const filtered = q ? entries.filter(r => r.date.includes(q)) : entries;
    const thisMonth = entries.filter(r => r.date.slice(0, 7) === LK.todayISO().slice(0, 7)).length;
    el('refMonthCount').textContent = thisMonth + ' this month';
    list.innerHTML = filtered.length ? filtered.slice(0, 20).map(r =>
      '<div class="cust-row" data-date="' + r.date + '"><div class="cust-row-name">' + LK.fmtDate(r.date) + '</div><div class="cust-row-sub">' + (r.win || 'No win logged') + '</div></div>'
    ).join('') : '<div class="log-empty">NO REFLECTIONS YET</div>';
    list.querySelectorAll('.cust-row').forEach(row => row.addEventListener('click', () => loadForm(row.dataset.date)));
  }

  function wire() {
    loadForm(LK.todayISO());
    el('refSave').addEventListener('click', save);
    el('refDate').addEventListener('change', () => loadForm(el('refDate').value));
    el('refSearch').addEventListener('input', renderList);
    renderList();
    LK.bus.on('db:changed', renderList);
  }

  LK.reflection = { render: renderList, computeDayStats };
  document.addEventListener('DOMContentLoaded', () => { document.getElementById('refDate') && wire(); }, { once: true });
})();
