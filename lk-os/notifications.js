/* ==========================================================================
   LK OS — notifications.js  (v2.1)
   Toast + log for anything emitted on the 'notify' bus event. Every
   notification here comes from a real in-app action (pipeline moves,
   payments, expenses, customer/job/event edits, settings saves, content
   drafts, weather alerts). No simulated/fake events — v2.0 had timer-based
   demo notifications; those are removed per the "never mix demo and real
   data" requirement.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  const MAX_LOG = 30;
  let log = [];
  let unread = 0;

  const ICONS = { pipeline: '📋', weather: '🌧️', estimate: '🧾', content: '✍️', customer: '👤', payment: '💵', expense: '🧾', crew: '👷', calendar: '📅', settings: '⚙️', assistant: '🤖', focus: '🎯', break: '☕', lounge: '🛋️', messages: '💬', device: '🔋', workflow: '🔗', marketing: '📈' };

  function toast(item) {
    if (LK.reduceMotion) { renderBell(); return; }
    const wrap = document.getElementById('toastWrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span class="toast-icon">' + (ICONS[item.type] || '🔔') + '</span><span>' + item.text + '</span>';
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 5000);
  }

  function renderBell() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.style.display = unread ? 'flex' : 'none';
  }

  function renderTray() {
    const el = document.getElementById('notifTray');
    if (!el) return;
    el.innerHTML = log.length
      ? log.map(n => '<div class="notif-row"><span class="toast-icon">' + (ICONS[n.type] || '🔔') + '</span><div><div>' + n.text + '</div><div class="notif-time">' + n.time + '</div></div></div>').join('')
      : '<div class="log-empty">NO NOTIFICATIONS</div>';
  }

  function push(item) {
    const entry = { ...item, time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) };
    log.unshift(entry);
    log = log.slice(0, MAX_LOG);
    unread++;
    toast(item);
    renderBell();
    renderTray();
  }

  LK.bus.on('notify', push);

  function wireBell() {
    const bell = document.getElementById('notifBell');
    if (!bell) return;
    bell.addEventListener('click', () => {
      document.getElementById('notifTray').classList.toggle('open');
      unread = 0; renderBell();
    });
  }

  /* ---------------- restrained real-data reminders ---------------- */
  // Each check fires at most once per session (or once per interval) — no
  // repeated nagging, and every one of these is computed from real records.
  const notifiedThisSession = new Set();
  function checkReminders() {
    if (!LK.messages) return;
    const dueToday = LK.messages.pendingFollowUps();
    if (dueToday.length && !notifiedThisSession.has('followups')) {
      notifiedThisSession.add('followups');
      push({ type: 'messages', text: dueToday.length + ' customer' + (dueToday.length === 1 ? '' : 's') + ' need follow-up today.' });
    }
    const now = new Date();
    const inHour = LK.db.events.find(e => {
      if (e.date !== LK.todayISO() || e.completed) return false;
      const [h, m] = e.startTime.split(':').map(Number);
      const evt = new Date(); evt.setHours(h, m, 0, 0);
      const diffMin = (evt - now) / 60000;
      return diffMin > 0 && diffMin <= 60;
    });
    if (inHour && !notifiedThisSession.has('appt:' + inHour.id)) {
      notifiedThisSession.add('appt:' + inHour.id);
      push({ type: 'calendar', text: 'Upcoming: ' + inHour.title + ' at ' + inHour.startTime + '.' });
    }
    const outstanding = LK.db.jobs.filter(j => !j.archived && j.stage !== 'lost').reduce((s, j) => s + LK.jobBalance(j), 0);
    if (outstanding > 0 && !notifiedThisSession.has('balance')) {
      notifiedThisSession.add('balance');
      push({ type: 'payment', text: LK.fmtMoney(outstanding) + ' in outstanding balances across active jobs.' });
    }
    if (LK.db.messageDrafts.length && !notifiedThisSession.has('drafts')) {
      notifiedThisSession.add('drafts');
      push({ type: 'messages', text: LK.db.messageDrafts.length + ' unfinished message draft' + (LK.db.messageDrafts.length === 1 ? '' : 's') + '.' });
    }
  }

  LK.notifications = { push, renderTray };
  document.addEventListener('DOMContentLoaded', () => { wireBell(); renderBell(); renderTray(); }, { once: true });
  LK.bus.on('boot:done', () => setTimeout(checkReminders, 6000));
  setInterval(checkReminders, 20 * 60 * 1000);
})();
