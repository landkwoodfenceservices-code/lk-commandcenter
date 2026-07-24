/* ==========================================================================
   LK OS — commandpalette.js
   Cmd/Ctrl+K command palette. Fast keyboard-driven access to every add/open
   action in the app, backed by the same functions the buttons use.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let actions = [];
  let filtered = [];
  let activeIndex = 0;

  function buildActions() {
    actions = [
      { label: 'Add Customer', run: () => { LK.nav.go('customers'); LK.customers.openCustomerModal(null); } },
      { label: 'Add Job', run: () => { LK.nav.go('pipeline'); LK.pipeline.openJobModal(null); } },
      { label: 'Add Payment', run: () => { LK.nav.go('customers'); LK.finance.openPaymentModal(); } },
      { label: 'Add Expense', run: () => { LK.nav.go('customers'); LK.finance.openExpenseModal(); } },
      { label: 'Add Appointment', run: () => { LK.nav.go('calendar'); LK.calendar.openEventModal(null); } },
      { label: 'Create Estimate', run: () => { LK.nav.go('estimator'); setTimeout(() => document.getElementById('estCustomer').focus(), 50); } },
      { label: 'Search Customer', run: () => { LK.nav.go('customers'); setTimeout(() => document.getElementById('custSearch').focus(), 50); } },
      { label: "Show Today's Jobs", run: () => LK.nav.go('pipeline') },
      { label: 'Show Unpaid Balances', run: () => { LK.nav.go('customers'); document.getElementById('custSort').value = 'balance'; document.getElementById('custSort').dispatchEvent(new Event('change')); } },
      { label: 'Open Pipeline', run: () => LK.nav.go('pipeline') },
      { label: 'Open Calendar', run: () => LK.nav.go('calendar') },
      { label: 'Open Estimator', run: () => LK.nav.go('estimator') },
      { label: 'Open Gmail', run: () => window.open('https://mail.google.com', '_blank', 'noopener') },
      { label: 'Open Thumbtack', run: () => window.open('https://www.thumbtack.com/pro', '_blank', 'noopener') },
      { label: 'Open Meta', run: () => LK.nav.go('command') },
      { label: 'Open Website', run: () => window.open(LK.db.settings.business.website, '_blank', 'noopener') },
      { label: 'Read Daily Briefing', run: () => LK.assistant.readBriefingAloud() },
      { label: 'Open Analytics', run: () => LK.nav.go('analytics') },
      { label: 'Open Settings', run: () => LK.nav.go('settings') },

      // Mission Control
      { label: 'Open Mission Control', run: () => LK.nav.go('overview') },
      { label: "Show Today's Priorities", run: () => { LK.nav.go('overview'); setTimeout(() => document.getElementById('mcRow2') && document.getElementById('mcRow2').scrollIntoView({ block: 'center' }), 50); } },
      { label: 'Show Business Alerts', run: () => { LK.nav.go('overview'); setTimeout(() => document.getElementById('mcRow3') && document.getElementById('mcRow3').scrollIntoView({ block: 'center' }), 50); } },
      { label: 'Midday Check', run: () => LK.assistant.middayCheck() },
      { label: 'End-of-Day Wrap-Up', run: () => LK.assistant.endOfDayWrapUp() },

      // Operations
      { label: 'Mark Job Completed', run: () => quickActionPickJobForStage('completed') },
      { label: 'Assign Crew', run: () => quickActionPickJobForStage(null) },

      // Intelligence
      { label: 'Open Business Intelligence', run: () => { LK.nav.go('analytics'); setTimeout(() => document.getElementById('biBody') && document.getElementById('biBody').scrollIntoView({ block: 'center' }), 50); } },
      { label: 'Show Revenue This Month', run: () => { LK.nav.go('analytics'); if (LK.missionControl) alert(LK.fmtMoney(LK.missionControl.computeMetrics().revenueMonth) + ' collected this month.'); } },
      { label: 'Show Outstanding Balances', run: () => { LK.nav.go('analytics'); if (LK.bi) alert(LK.bi.answer('whoOwes')); } },
      { label: 'Show Best Lead Source', run: () => { LK.nav.go('analytics'); if (LK.bi) alert(LK.bi.answer('bestSource')); } },
      { label: 'Show Most Profitable Service', run: () => { LK.nav.go('analytics'); if (LK.bi) alert(LK.bi.answer('bestMargin')); } },
      { label: 'Show Close Rate', run: () => { LK.nav.go('analytics'); if (LK.bi) alert(LK.bi.answer('closeRate')); } },

      // Lounge
      { label: 'Open Lounge', run: () => LK.nav.go('lounge') },
      { label: 'Play Focus Playlist', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('music'); const p = LK.db.musicPresets.find(p2 => p2.key === 'deepwork'); if (p) LK.music.playPreset(p.id); } },
      { label: 'Play Relax Playlist', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('music'); const p = LK.db.musicPresets.find(p2 => p2.key === 'relax'); if (p) LK.music.playPreset(p.id); } },
      { label: 'Stop Audio', run: () => { LK.music.stop(); LK.ambient.stop(); } },
      { label: 'Start Focus Mode', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('focus'); } },
      { label: 'Start 5-Minute Break', run: () => { LK.breakroom.open(); LK.breakroom.start(5); } },
      { label: 'Start 10-Minute Break', run: () => { LK.breakroom.open(); LK.breakroom.start(10); } },
      { label: 'Open Decision Room', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('decisions'); } },
      { label: 'Add Idea', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('ideas'); setTimeout(() => document.getElementById('ideaNewBtn').click(), 50); } },
      { label: 'Open Reflection', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('reflection'); } },
      { label: 'Activate Night Shift', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('nightshift'); } },
      { label: 'Set Primary Objective', run: () => { LK.nav.go('overview'); const text = prompt('Set Primary Objective:'); if (text) LK.lounge.setObjective('manual', null, text); } },
      { label: 'Return to Command', run: () => LK.nav.go('overview') },

      // Messages
      { label: 'Open Messages', run: () => LK.nav.go('messages') },
      { label: 'Text Customer', run: () => { LK.nav.go('messages'); setTimeout(() => document.getElementById('msgSearch').focus(), 50); } },
      { label: 'Search Customer Messages', run: () => { LK.nav.go('messages'); setTimeout(() => document.getElementById('msgSearch').focus(), 50); } },
      { label: 'New Lead Response', run: () => quickActionPickCustomer('newLead') },
      { label: 'Send Quote Follow-Up', run: () => quickActionPickCustomer('quoteFollowUp') },
      { label: 'Request Deposit', run: () => quickActionPickCustomer('depositRequest') },
      { label: 'Send Rain Delay', run: () => quickActionPickCustomer('rainDelay') },
      { label: 'Send On-My-Way Message', run: () => quickActionPickCustomer('onMyWay') },
      { label: 'Request Final Payment', run: () => quickActionPickCustomer('finalPayment') },
      { label: 'Request Review', run: () => quickActionPickCustomer('reviewRequest') },
      { label: 'Show Follow-Ups', run: () => LK.nav.go('messages') },

      // Weather
      { label: 'Open Live Radar', run: () => { LK.nav.go('weather'); setTimeout(() => document.getElementById('radarMap') && document.getElementById('radarMap').scrollIntoView({ block: 'center' }), 100); } },
      { label: 'Play Radar', run: () => { LK.nav.go('weather'); setTimeout(() => LK.radar && LK.radar.play(), 150); } },
      { label: 'Pause Radar', run: () => { if (LK.radar) LK.radar.pause(); } },
      { label: 'Show Weather Impact', run: () => { LK.nav.go('weather'); setTimeout(() => document.getElementById('weatherImpactBody') && document.getElementById('weatherImpactBody').scrollIntoView({ block: 'center' }), 100); } },
      { label: 'Show Weather Alerts', run: () => LK.nav.go('weather') },
      { label: 'Show At-Risk Jobs', run: () => { LK.nav.go('weather'); setTimeout(() => document.getElementById('weatherImpactBody') && document.getElementById('weatherImpactBody').scrollIntoView({ block: 'center' }), 100); } },

      // Marketing
      { label: 'Open Marketing Intelligence', run: () => LK.nav.go('marketing') },
      { label: 'Import Marketing CSV', run: () => { LK.nav.go('marketing'); setTimeout(() => document.getElementById('mktImportFile') && document.getElementById('mktImportFile').focus(), 50); } },
      { label: 'Show Best Performing Platform', run: () => { LK.nav.go('marketing'); if (LK.bi) alert(LK.bi.answer('costEffectiveLeadSource')); } },

      // Device
      { label: 'Show Laptop Battery', run: () => { LK.nav.go('overview'); LK.device.render(); } },
      { label: 'Enable Low-Power Mode', run: () => { LK.db.settings.device.autoLowPower = true; LK.saveDB(); } },
      { label: 'Disable Low-Power Mode', run: () => { LK.db.settings.device.autoLowPower = false; document.body.classList.remove('low-power'); LK.saveDB(); } },
    ];
  }

  // Commands that need a customer go to Messages and focus search — the
  // searchable customer list there is the "searchable customer selector."
  function quickActionPickCustomer(key) {
    LK.nav.go('messages');
    const input = document.getElementById('msgSearch');
    setTimeout(() => input.focus(), 50);
    LK.bus.emit('notify', { type: 'messages', text: 'Search and select a customer, then the ' + key + ' template loads automatically once selected.' });
    const handler = (e) => {
      const row = e.target.closest('.cust-row');
      if (row) { LK.messages.quickAction(key, row.dataset.id); document.getElementById('msgCustList').removeEventListener('click', handler, true); }
    };
    document.getElementById('msgCustList').addEventListener('click', handler, true);
  }

  // Same searchable-selector pattern, but for a job: go to Pipeline and wait
  // for a kanban card click. stage=null just opens the job for crew assignment;
  // stage='completed' moves it to Completed (same path as dragging the card).
  function quickActionPickJobForStage(stage) {
    LK.nav.go('pipeline');
    LK.bus.emit('notify', { type: 'pipeline', text: 'Select a job card to ' + (stage ? 'mark it completed.' : 'assign crew.') });
    const handler = (e) => {
      const card = e.target.closest('.kanban-card');
      if (!card) return;
      document.getElementById('kanbanBoard').removeEventListener('click', handler, true);
      const job = LK.getJob(card.dataset.id);
      if (!job) return;
      if (stage) {
        e.stopImmediatePropagation();
        job.stage = stage;
        job.lastContact = LK.todayISO();
        LK.saveDB();
        LK.pipeline.render();
        LK.bus.emit('notify', { type: 'pipeline', text: job.service + ' marked completed.' });
        if (LK.workflows) LK.workflows.onCompleted(job);
      } else {
        LK.pipeline.openJobModal(job.id);
      }
    };
    document.getElementById('kanbanBoard').addEventListener('click', handler, true);
  }

  function render() {
    const list = document.getElementById('cmdList');
    list.innerHTML = filtered.map((a, i) => '<div class="cmd-row' + (i === activeIndex ? ' active' : '') + '" data-i="' + i + '">' + a.label + '</div>').join('') || '<div class="log-empty">NO MATCHES</div>';
    list.querySelectorAll('.cmd-row').forEach(row => {
      row.addEventListener('click', () => { execute(filtered[Number(row.dataset.i)]); });
      row.addEventListener('mouseenter', () => { activeIndex = Number(row.dataset.i); render(); });
    });
  }

  function filter() {
    const q = document.getElementById('cmdInput').value.trim().toLowerCase();
    filtered = q ? actions.filter(a => a.label.toLowerCase().includes(q)) : actions;
    activeIndex = 0;
    render();
  }

  function execute(action) {
    if (!action) return;
    close();
    action.run();
    LK.audio.clickBlip();
  }

  function open() {
    buildActions();
    document.getElementById('cmdPalette').classList.add('open');
    document.getElementById('cmdInput').value = '';
    filter();
    document.getElementById('cmdInput').focus();
  }
  function close() { document.getElementById('cmdPalette').classList.remove('open'); }

  function wire() {
    document.addEventListener('keydown', e => {
      const isK = e.key.toLowerCase() === 'k';
      if ((e.metaKey || e.ctrlKey) && isK) { e.preventDefault(); open(); return; }
      const palette = document.getElementById('cmdPalette');
      if (!palette.classList.contains('open')) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, filtered.length - 1); render(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); render(); }
      if (e.key === 'Enter') { e.preventDefault(); execute(filtered[activeIndex]); }
    });
    document.getElementById('cmdInput').addEventListener('input', filter);
    document.getElementById('cmdPalette').addEventListener('click', e => { if (e.target.id === 'cmdPalette') close(); });
    document.getElementById('cmdOpenBtn').addEventListener('click', open);
  }

  LK.commandPalette = { open, close };
  document.addEventListener('DOMContentLoaded', wire, { once: true });
})();
