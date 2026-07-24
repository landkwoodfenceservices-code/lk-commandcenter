/* ==========================================================================
   LK OS — assistant.js  (v2.1)
   AI assistant: a natural-language briefing built strictly from real local
   data (never claims a live Gmail/Meta/Thumbtack/Google connection — those
   stay confined to the SIM-tagged Command Panels), plus mic-driven voice
   commands. The Overview metric grid (section 7) lives here too since it's
   computed the same way the spoken briefing is.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  function timeGreeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }
  function greetName() { return LK.db.settings.personal.greetingName || 'Edel'; }

  function computeBriefing() {
    const db = LK.db;
    const todayIso = LK.todayISO();
    const activeJobs = db.jobs.filter(j => j.stage !== 'completed' && j.stage !== 'lost' && !j.archived);
    const jobsToday = db.jobs.filter(j => j.dueDate === todayIso && !j.archived);
    const eventsToday = db.events.filter(e => e.date === todayIso).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const newLeads = db.jobs.filter(j => j.stage === 'new' && !j.archived);
    const pendingQuotes = db.quotes.filter(q => q.status === 'pending');
    const followUpJobs = db.jobs.filter(j => j.stage === 'follow-up' && !j.archived);
    const pendingInvoices = db.invoices.filter(i => i.status === 'pending');
    const weekStart = LK.addDays(todayIso, -7);
    const monthStart = LK.addDays(todayIso, -30);
    const revenueWeek = db.payments.filter(p => p.date >= weekStart).reduce((s, p) => s + p.amount, 0);
    const revenueMonth = db.payments.filter(p => p.date >= monthStart).reduce((s, p) => s + p.amount, 0);
    const outstandingBalance = db.jobs.filter(j => !j.archived && j.stage !== 'lost').reduce((s, j) => s + LK.jobBalance(j), 0);
    const depositsCollected = db.jobs.filter(j => j.depositStatus === 'paid').reduce((s, j) => s + (Number(j.depositAmount) || 0), 0);
    const reviewsTotal = db.customers.reduce((s, c) => s + (c.reviews ? c.reviews.length : 0), 0);
    const tasksDue = db.tasks.filter(t => !t.done);
    const firstEventToday = eventsToday[0];

    return {
      activeJobs, jobsToday, eventsToday, newLeads, pendingQuotes, followUpJobs, pendingInvoices,
      revenueWeek, revenueMonth, outstandingBalance, depositsCollected, reviewsTotal, tasksDue, firstEventToday,
    };
  }

  /* ---------------- Overview metric cards ----------------
     Rendering itself moved to missioncontrol.js (v2.3) — the Overview grid
     is now the Mission Control 4-row layout, computed from the same real
     LK.db data. This stays as a thin delegate so deliverBriefing()/the
     db:changed & weather:updated listeners below don't need to change. */
  function renderBriefing() {
    if (LK.missionControl) LK.missionControl.render();
    // v2.4 — the written briefing itself (not just the metric cards) refreshes
    // whenever a record is imported/added/edited/deleted/paid/scheduled, so it
    // never goes stale between explicit "Read Briefing" requests.
    renderAssistantText(buildGreetingText());
    renderTimestamp();
  }

  function renderTimestamp() {
    const el = document.getElementById('briefingTimestamp');
    if (el) el.textContent = 'Last updated: ' + new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function refreshBriefing() {
    renderAssistantText(buildGreetingText());
    renderTimestamp();
    if (LK.missionControl) LK.missionControl.render();
    LK.bus.emit('notify', { type: 'assistant', text: 'Briefing refreshed.' });
  }

  /* ---------------- spoken / written briefing (section 8, personality-aware) ----------------
     mode: 'morning' (default) | 'midday' | 'endofday' | 'manual'. All modes pull
     from the same real computeBriefing() data — only the emphasis changes. */
  function buildGreetingText(mode) {
    mode = mode || 'morning';
    const b = computeBriefing();
    const w = LK.weather.data;
    const personality = LK.db.settings.voice.personality || 'professional';
    const name = greetName();
    const modeLabel = { morning: '', midday: 'Midday check. ', endofday: 'End of day. ', manual: '' }[mode];
    const opener = modeLabel + { professional: timeGreeting() + ', ' + name + '.', calm: timeGreeting() + ', ' + name + '. Take a breath — here is where things stand.', motivational: timeGreeting() + ', ' + name + '! Let\'s make today count.', minimal: 'Systems online.', cinematic: 'Command systems online, ' + name + '.' }[personality];
    const sentences = [opener];

    if (mode === 'endofday') {
      const todayIso = LK.todayISO();
      const completedToday = LK.audit ? LK.audit.list({ date: todayIso, action: 'Job moved' }).filter(e => e.newValue === 'Completed').length : 0;
      const revenueToday = LK.db.payments.filter(p => p.date === todayIso).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      sentences.push((completedToday ? completedToday + ' job' + (completedToday === 1 ? '' : 's') + ' completed today' : 'No jobs marked completed today') + '. ' + (revenueToday ? LK.fmtMoney(revenueToday) + ' collected today.' : '$0 collected today.'));
      const dueFollowUps = LK.messages ? LK.messages.pendingFollowUps() : [];
      if (dueFollowUps.length) sentences.push(dueFollowUps.length + ' follow-up' + (dueFollowUps.length === 1 ? '' : 's') + ' still open.');
      const tomorrow = LK.addDays(todayIso, 1);
      const tomorrowFirst = LK.db.events.filter(e => e.date === tomorrow).sort((a, c) => a.startTime.localeCompare(c.startTime))[0];
      sentences.push(tomorrowFirst ? 'Tomorrow starts with ' + tomorrowFirst.title + ' at ' + tomorrowFirst.startTime + '.' : 'Nothing on the calendar for tomorrow yet.');
      const po = LK.db.primaryObjective;
      if (po) sentences.push('Primary objective for tomorrow: ' + po.text + '.');
      return sentences.join(' ');
    }

    if (mode === 'midday') {
      const doneToday = b.eventsToday.filter(e => e.completed).length;
      sentences.push(b.eventsToday.length
        ? doneToday + ' of ' + b.eventsToday.length + ' appointment' + (b.eventsToday.length === 1 ? '' : 's') + ' done so far today.'
        : 'No appointments were scheduled today.');
      const dueFollowUps = LK.messages ? LK.messages.pendingFollowUps() : [];
      if (dueFollowUps.length) sentences.push(dueFollowUps.length + ' follow-up' + (dueFollowUps.length === 1 ? '' : 's') + ' still due.');
      if (w && w.ok && w.recommendation.cls === 'warn') sentences.push(w.recommendation.text);
      const po = LK.db.primaryObjective;
      if (po) sentences.push('Primary objective: ' + po.text + '.');
      return sentences.join(' ');
    }

    // morning / manual — the live business briefing. Every sentence is only
    // included when the underlying count is real and nonzero -- an empty
    // category is silently skipped rather than reported as "0 of something."
    // Priority order: appointments today, overdue balances, estimates/
    // customers awaiting follow-up, jobs missing crew, customers needing job
    // details, marketing performance, review opportunities.
    buildPriorityItems(personality).forEach(s => sentences.push(s));

    if (w && w.ok) {
      if (w.recommendation.cls === 'warn') sentences.push(w.recommendation.text);
      else if (b.eventsToday.length && personality !== 'minimal') sentences.push("Weather looks favorable for today's work.");
    }

    if (b.tasksDue.length && personality !== 'minimal') sentences.push(b.tasksDue.length + ' task' + (b.tasksDue.length === 1 ? '' : 's') + ' still open on the mission log.');

    const po = LK.db.primaryObjective;
    if (po) sentences.push((personality === 'cinematic' ? 'Your primary objective is ready: ' : 'Your primary objective: ') + po.text + '.');

    return sentences.join(' ');
  }

  function buildPriorityItems(personality) {
    if (!LK.metrics) return [];
    const db = LK.db;
    const todayIso = LK.todayISO();
    const monthStart = LK.addDays(todayIso, -30);
    const M = LK.metrics.overview();
    const items = [];

    // 1. appointments today
    const eventsToday = db.events.filter(e => e.date === todayIso).sort((a, c) => a.startTime.localeCompare(c.startTime));
    if (eventsToday.length) {
      const first = eventsToday[0];
      const crew = first.crewId ? LK.getCrew(first.crewId) : null;
      items.push(personality === 'minimal'
        ? eventsToday.length + ' appointment' + (eventsToday.length === 1 ? '' : 's') + ' today.'
        : 'You have ' + eventsToday.length + ' appointment' + (eventsToday.length === 1 ? '' : 's') + ' today' + (crew ? ', starting with ' + crew.name + ' at ' + first.startTime : ', starting at ' + first.startTime) + '.');
    } else if (personality !== 'minimal') {
      items.push('Nothing on the calendar today.');
    }

    // 2. overdue balances
    if (M.financial.outstandingBalance > 0) items.push(LK.fmtMoney(M.financial.outstandingBalance) + ' in recorded balances remains outstanding.');

    // 3. estimates / customers awaiting follow-up
    const followUpParts = [];
    if (M.estimates.customersNeedingFollowUp) followUpParts.push(M.estimates.customersNeedingFollowUp + ' customer' + (M.estimates.customersNeedingFollowUp === 1 ? '' : 's') + ' need' + (M.estimates.customersNeedingFollowUp === 1 ? 's' : '') + ' follow-up');
    if (M.estimates.openEstimates) followUpParts.push(M.estimates.openEstimates + ' estimate' + (M.estimates.openEstimates === 1 ? '' : 's') + ' awaiting a response');
    if (followUpParts.length) items.push(followUpParts.join(' and ') + '.');

    // 4. jobs missing crew assignments
    if (M.jobs.withoutCrew) items.push(M.jobs.withoutCrew + ' job' + (M.jobs.withoutCrew === 1 ? '' : 's') + ' scheduled without a crew assigned.');

    // 5. customers needing job details (accepted/hired leads specifically, not every imported record)
    const acceptedNeedingDetails = db.customers.filter(c => c.importFingerprint && c.status === 'active' && !db.jobs.some(j => j.customerId === c.id)).length;
    if (acceptedNeedingDetails) items.push(acceptedNeedingDetails + ' accepted lead' + (acceptedNeedingDetails === 1 ? '' : 's') + ' still need' + (acceptedNeedingDetails === 1 ? 's' : '') + ' job details.');

    // 6. marketing performance
    const topSource = M.marketing.leadsBySource[0];
    if (topSource) {
      const monthLeads = db.customers.filter(c => c.source === topSource.source && (c.createdAt || '') >= monthStart).length;
      if (monthLeads) items.push(topSource.source + ' generated ' + monthLeads + ' lead' + (monthLeads === 1 ? '' : 's') + ' this month.');
    }
    if (M.customers.conversionRate != null) items.push('Your current lead-to-hire conversion rate is ' + M.customers.conversionRate + '%.');
    if (LK.db.settings.marketing.showInBriefing && LK.marketing && LK.db.marketingMetrics.length) {
      const ins = LK.marketing.insights(LK.marketing.allPlatformsSummary(LK.addDays(todayIso, -30), todayIso), LK.marketing.allPlatformsSummary(LK.addDays(todayIso, -60), LK.addDays(todayIso, -31)));
      if (ins.length) items.push(ins[0]);
    }

    // 7. review opportunities
    if (M.marketing.reviewsPending) items.push(M.marketing.reviewsPending + ' customer' + (M.marketing.reviewsPending === 1 ? '' : 's') + ' have a pending review request.');

    return items;
  }

  function speakBriefing(mode) {
    renderAssistantText(buildGreetingText(mode));
    LK.audio.speak(buildGreetingText(mode), { queue: false, context: 'manual' });
    LK.bus.emit('notify', { type: 'assistant', text: { morning: 'Morning briefing', midday: 'Midday check', endofday: 'End-of-day wrap-up', manual: 'Briefing' }[mode || 'manual'] + ' ready.' });
  }

  function shortStartupLine() {
    const b = computeBriefing();
    if (b.eventsToday.length) return 'You have ' + b.eventsToday.length + ' appointment' + (b.eventsToday.length === 1 ? '' : 's') + ' today.';
    if (b.pendingQuotes.length) return b.pendingQuotes.length + ' estimate' + (b.pendingQuotes.length === 1 ? '' : 's') + ' require follow-up.';
    return 'All caught up for now.';
  }

  function renderAssistantText(text) {
    const el = document.getElementById('assistantText');
    if (el) el.textContent = text;
  }

  function deliverBriefing() {
    const voice = LK.db.settings.voice;
    renderBriefing();
    if (voice.startupGreeting) {
      const personality = voice.personality || 'professional';
      const openers = { professional: 'L&K systems are online.', calm: 'Good to see you. Systems are online.', motivational: 'Systems online — let\'s go!', minimal: 'Systems online.', cinematic: 'L&K command systems online.' };
      const short = openers[personality] + ' ' + (voice.briefingVoice ? shortStartupLine() : '');
      LK.audio.speak(short.trim(), { context: 'startup' });
    }
    LK.bus.emit('notify', { type: 'assistant', text: 'Morning briefing ready.' });
  }

  function readBriefingAloud() { speakBriefing('manual'); }
  function middayCheck() { speakBriefing('midday'); }
  function endOfDayWrapUp() { speakBriefing('endofday'); }

  /* ---------------- voice commands ---------------- */
  const COMMANDS = [
    { test: /gmail/, label: 'Open Gmail', run: () => { LK.nav.go('command'); window.open('https://mail.google.com', '_blank', 'noopener'); } },
    { test: /thumbtack/, label: 'Open Thumbtack', run: () => { LK.nav.go('command'); window.open('https://www.thumbtack.com/pro', '_blank', 'noopener'); } },
    { test: /meta|facebook|instagram/, label: 'Open Meta', run: () => { LK.nav.go('command'); } },
    { test: /website/, label: 'Open Website', run: () => window.open(LK.db.settings.business.website, '_blank', 'noopener') },
    { test: /create.*estimat|new estimat|quick quote/, label: 'Create Estimate', run: () => { LK.nav.go('estimator'); document.getElementById('estCustomer').focus(); } },
    { test: /today.*job|show.*job|job.*today/, label: "Show Today's Jobs", run: () => LK.nav.go('pipeline') },
    { test: /unpaid|balance/, label: 'Show Unpaid Balances', run: () => LK.nav.go('customers') },
    { test: /tiktok/, label: 'Generate TikTok', run: () => { LK.nav.go('content'); LK.contentStudio.render('tiktok'); LK.contentStudio.renderHistory(); } },
    { test: /weather/, label: 'Weather', run: () => LK.nav.go('weather') },
    { test: /pipeline|kanban/, label: 'Show Pipeline', run: () => LK.nav.go('pipeline') },
    { test: /calendar|schedule/, label: 'Show Calendar', run: () => LK.nav.go('calendar') },
    { test: /add customer|new customer/, label: 'Add Customer', run: () => { LK.nav.go('customers'); LK.customers.openCustomerModal(null); } },
    { test: /add job|new job/, label: 'Add Job', run: () => { LK.nav.go('pipeline'); LK.pipeline.openJobModal(null); } },
    { test: /add payment/, label: 'Add Payment', run: () => { LK.nav.go('customers'); LK.finance.openPaymentModal(); } },
    { test: /add expense/, label: 'Add Expense', run: () => { LK.nav.go('customers'); LK.finance.openExpenseModal(); } },
    { test: /add appointment|add event/, label: 'Add Appointment', run: () => { LK.nav.go('calendar'); LK.calendar.openEventModal(null); } },
    { test: /search customer/, label: 'Search Customer', run: () => { LK.nav.go('customers'); document.getElementById('custSearch').focus(); } },
    { test: /customer/, label: 'Show Customers', run: () => LK.nav.go('customers') },
    { test: /analytic|revenue|report/, label: 'Show Analytics', run: () => LK.nav.go('analytics') },
    { test: /midday/, label: 'Midday Check', run: () => middayCheck() },
    { test: /end.of.day|wrap.up/, label: 'End-of-Day Wrap-Up', run: () => endOfDayWrapUp() },
    { test: /briefing|what needs my attention|how('?s| is) (the )?business doing/, label: 'Read Daily Briefing', run: () => readBriefingAloud() },
    { test: /open lounge|go to lounge/, label: 'Open Lounge', run: () => LK.nav.go('lounge') },
    { test: /focus playlist|play focus/, label: 'Play Focus Playlist', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('music'); const p = LK.db.musicPresets.find(p2 => p2.key === 'deepwork'); if (p) LK.music.playPreset(p.id); } },
    { test: /relax playlist|play relax/, label: 'Play Relax Playlist', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('music'); const p = LK.db.musicPresets.find(p2 => p2.key === 'relax'); if (p) LK.music.playPreset(p.id); } },
    { test: /stop (audio|music)/, label: 'Stop Audio', run: () => { LK.music.stop(); LK.ambient.stop(); } },
    { test: /start focus/, label: 'Start Focus Mode', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('focus'); } },
    { test: /5.minute break/, label: 'Start 5-Minute Break', run: () => { LK.breakroom.open(); LK.breakroom.start(5); } },
    { test: /10.minute break/, label: 'Start 10-Minute Break', run: () => { LK.breakroom.open(); LK.breakroom.start(10); } },
    { test: /decision room/, label: 'Open Decision Room', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('decisions'); } },
    { test: /add idea/, label: 'Add Idea', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('ideas'); document.getElementById('ideaNewBtn').click(); } },
    { test: /reflection/, label: 'Open Reflection', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('reflection'); } },
    { test: /night shift/, label: 'Activate Night Shift', run: () => { LK.nav.go('lounge'); LK.lounge.showSub('nightshift'); } },
    { test: /return to command|overview|dashboard/, label: 'Open Overview', run: () => LK.nav.go('overview') },
    { test: /marketing/, label: 'Open Marketing', run: () => LK.nav.go('marketing') },
    { test: /messages/, label: 'Open Messages', run: () => LK.nav.go('messages') },
    { test: /follow.?up/, label: 'Show Follow-Ups', run: () => LK.nav.go('messages') },
    { test: /battery/, label: 'Show Laptop Battery', run: () => LK.device.render() },
  ];

  // Every state the mic can be in, per the required voice UX: Ready,
  // Listening…, Processing…, Command recognized, No speech detected,
  // Microphone permission denied, Voice recognition unavailable.
  const MIC_ERROR_MESSAGES = {
    'no-speech': 'No speech detected. Tap the microphone and try again.',
    'audio-capture': 'No microphone was found. Check your microphone connection.',
    'not-allowed': 'Microphone permission denied. Allow microphone access in your browser settings.',
    'service-not-allowed': 'Microphone permission denied. Allow microphone access in your browser settings.',
    'network': 'Voice recognition needs an internet connection. Check your connection and try again.',
    'aborted': 'Voice recognition was interrupted. Tap the microphone to try again.',
    'unsupported': 'Voice recognition unavailable in this browser.',
    'start-failed': 'Could not start voice recognition. Tap the microphone to try again.',
    'already-listening': 'Already listening — tap the microphone again to cancel.',
  };

  function setMicStatus(text) {
    const micStatus = document.getElementById('micStatus');
    if (micStatus) micStatus.textContent = text;
  }

  function runCommand(rawTranscript) {
    const transcript = String(rawTranscript || '').trim().replace(/\s+/g, ' ');
    if (!transcript) { setMicStatus(MIC_ERROR_MESSAGES['no-speech']); return; }
    const lower = transcript.toLowerCase();
    const match = COMMANDS.find(c => c.test.test(lower));
    if (match) {
      match.run();
      LK.audio.clickBlip();
      setMicStatus('Command recognized: "' + transcript + '" → ' + match.label);
      LK.bus.emit('notify', { type: 'assistant', text: 'Voice command: ' + match.label });
    } else {
      setMicStatus('I heard: "' + transcript + '". I don’t know that command yet.');
    }
  }

  function wireMic() {
    const micBtn = document.getElementById('micBtn');
    if (!micBtn) return;
    if (!LK.audio.voiceSupported) { micBtn.classList.add('unsupported'); micBtn.title = 'Voice recognition not supported in this browser'; }

    micBtn.addEventListener('click', () => {
      if (!LK.audio.voiceSupported) { setMicStatus(MIC_ERROR_MESSAGES.unsupported); return; }

      // Tapping again while already listening cancels the session instead
      // of starting a second, overlapping one.
      if (LK.audio.isListening()) {
        LK.audio.stopListening();
        micBtn.classList.remove('listening');
        setMicStatus('Ready.');
        return;
      }

      LK.audio.listenOnce({
        onStart: () => { micBtn.classList.add('listening'); setMicStatus('Listening…'); },
        onResult: (transcript) => { setMicStatus('Processing…'); runCommand(transcript); },
        onNoSpeech: () => setMicStatus(MIC_ERROR_MESSAGES['no-speech']),
        onError: (err) => setMicStatus(MIC_ERROR_MESSAGES[err] || ('Voice recognition error: ' + err)),
        onEnd: () => micBtn.classList.remove('listening'),
      });
    });
  }

  function wireMute() {
    const btn = document.getElementById('muteBtn');
    function render() {
      const muted = LK.audio.isMuted();
      btn.textContent = muted ? '🔇 MUTED' : '🔊 AUDIO';
      btn.classList.toggle('is-muted', muted);
      btn.setAttribute('aria-pressed', String(muted));
    }
    btn.addEventListener('click', () => { LK.audio.toggleMuted(); render(); });
    render();
  }

  LK.assistant = { deliverBriefing, renderBriefing, refreshBriefing, readBriefingAloud, middayCheck, endOfDayWrapUp, COMMANDS, buildGreetingText };
  LK.bus.on('boot:done', () => {
    let delivered = false;
    const tryDeliver = () => { if (!delivered) { delivered = true; deliverBriefing(); } };
    if (LK.weather.data) tryDeliver();
    else { LK.bus.on('weather:updated', () => tryDeliver()); setTimeout(tryDeliver, 4000); }
  });
  LK.bus.on('db:changed', renderBriefing);
  LK.bus.on('weather:updated', renderBriefing);
  document.addEventListener('DOMContentLoaded', () => {
    wireMic(); wireMute(); renderBriefing();
    const refreshBtn = document.getElementById('refreshBriefingBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshBriefing);
  }, { once: true });
})();
