/* ==========================================================================
   LK OS — data.js  (v2.1)
   Central data layer. LK.db is the single source of truth for every screen;
   nothing else should read localStorage directly. Ships with clearly
   labeled sample data (LK.db.isDemo === true) that the user clears with one
   click from Settings — real and demo data are never silently merged.
   Includes versioned migration so future updates add fields without ever
   discarding data the user has actually entered.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  LK.STORAGE_KEY = 'lk_os_db_v2';
  LK.SCHEMA_VERSION = 6;

  /* ---------------- v2.3 built-in constants (not user-editable arrays) ---------------- */
  LK.VISION_CATEGORIES_BUILTIN = ['Business', 'Family', 'Financial Freedom', 'Health', 'Faith', 'Personal Growth', 'Travel', 'Home', 'Equipment', 'Employees', 'Community', 'Legacy'];

  /* ---------------- event bus ---------------- */
  LK.bus = (() => {
    const listeners = {};
    return {
      on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return fn; },
      off(evt, fn) { if (listeners[evt]) listeners[evt] = listeners[evt].filter(f => f !== fn); },
      emit(evt, payload) { (listeners[evt] || []).forEach(fn => { try { fn(payload); } catch (e) { console.error('[bus:' + evt + ']', e); } }); },
    };
  })();

  /* ---------------- helpers ---------------- */
  LK.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  // Local calendar date, not UTC — toISOString() rolls over at UTC midnight,
  // which is late afternoon/evening in US time zones and would silently
  // misclassify "today" for a large chunk of every day.
  function localISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  LK.localISO = localISO;
  LK.todayISO = () => localISO(new Date());
  LK.nowISO = () => new Date().toISOString();
  LK.addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return localISO(d); };
  LK.fmtMoney = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  LK.fmtMoney2 = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  LK.fmtDate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
  function clone(obj) { return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj)); }

  /* ---------------- v2.2 seed constants ---------------- */
  LK.DEFAULT_MUSIC_PRESETS = () => [
    { id: 'preset-morning', key: 'morning', label: 'Morning Start', playlistName: '', url: '', mood: 'Bright, energizing', defaultFocusMinutes: 25, notes: '' },
    { id: 'preset-deepwork', key: 'deepwork', label: 'Deep Work', playlistName: '', url: '', mood: 'Focused, minimal vocals', defaultFocusMinutes: 60, notes: '' },
    { id: 'preset-admin', key: 'admin', label: 'Estimates & Admin', playlistName: '', url: '', mood: 'Steady, background', defaultFocusMinutes: 45, notes: '' },
    { id: 'preset-creative', key: 'creative', label: 'Creative Content', playlistName: '', url: '', mood: 'Upbeat, inspiring', defaultFocusMinutes: 45, notes: '' },
    { id: 'preset-latenight', key: 'latenight', label: 'Late Night Planning', playlistName: '', url: '', mood: 'Low-key, atmospheric', defaultFocusMinutes: 45, notes: '' },
    { id: 'preset-relax', key: 'relax', label: 'Relax', playlistName: '', url: '', mood: 'Calm, unwinding', defaultFocusMinutes: 15, notes: '' },
    { id: 'preset-victory', key: 'victory', label: 'Victory Mode', playlistName: '', url: '', mood: 'Celebratory', defaultFocusMinutes: 10, notes: '' },
  ];

  LK.DEFAULT_TEMPLATES = () => [
    { id: 'tpl-new-lead', category: 'Lead', label: 'New Lead Response', body: 'Hi {firstName}, thanks for reaching out to {businessName}! We\'d love to get you a free estimate for {service}. What\'s the best day this week for us to take a look?', favorited: true, archived: false },
    { id: 'tpl-missed-call', category: 'Lead', label: 'Missed Call', body: 'Hi {firstName}, sorry we missed your call at {businessName}. What can we help you with?', favorited: false, archived: false },
    { id: 'tpl-estimate-confirm', category: 'Estimate', label: 'Estimate Appointment Confirmation', body: 'Hi {firstName}, confirming your estimate for {appointmentDate} at {appointmentTime} at {address}. See you then!', favorited: true, archived: false },
    { id: 'tpl-on-my-way', category: 'Job', label: 'On My Way', body: 'Hi {firstName}, {ownerName} here — on my way to {address}, should be there shortly.', favorited: true, archived: false },
    { id: 'tpl-quote-sent', category: 'Estimate', label: 'Quote Sent', body: 'Hi {firstName}, your {service} estimate is ready: {estimateAmount}. Let me know if you\'d like to move forward or have any questions!', favorited: true, archived: false },
    { id: 'tpl-quote-followup', category: 'Estimate', label: 'Quote Follow-Up', body: 'Hi {firstName}, just following up on the {service} estimate ({estimateAmount}) — any questions I can answer?', favorited: true, archived: false },
    { id: 'tpl-deposit-request', category: 'Payment', label: 'Deposit Request', body: 'Hi {firstName}, to get your {service} job on the schedule we\'ll need a deposit of {depositAmount}. Let me know what works best to send that over.', favorited: true, archived: false },
    { id: 'tpl-deposit-received', category: 'Payment', label: 'Deposit Received', body: 'Hi {firstName}, got your deposit — thank you! We\'ll be in touch to confirm your job date.', favorited: false, archived: false },
    { id: 'tpl-job-scheduled', category: 'Job', label: 'Job Scheduled', body: 'Hi {firstName}, you\'re on the schedule for {appointmentDate} at {appointmentTime}. Address on file: {address}.', favorited: true, archived: false },
    { id: 'tpl-rain-delay', category: 'Job', label: 'Rain Delay', body: 'Hi {firstName}, rain is in the forecast so we\'ll need to push your {service} job back a bit — I\'ll follow up with a new date soon.', favorited: false, archived: false },
    { id: 'tpl-crew-arrival', category: 'Job', label: 'Crew Arrival', body: 'Hi {firstName}, our crew is arriving now at {address} for your {service} job.', favorited: false, archived: false },
    { id: 'tpl-job-completed', category: 'Job', label: 'Job Completed', body: 'Hi {firstName}, your {service} job is complete! Please take a look and let us know if you have any questions.', favorited: true, archived: false },
    { id: 'tpl-final-balance', category: 'Payment', label: 'Final Balance Request', body: 'Hi {firstName}, your {service} job is finished — remaining balance is {balance}. Let me know the best way to collect that.', favorited: true, archived: false },
    { id: 'tpl-review-request', category: 'Review', label: 'Review Request', body: 'Hi {firstName}, thanks again for choosing {businessName}! If you have a minute, a Google review would mean a lot to us.', favorited: true, archived: false },
    { id: 'tpl-warranty-followup', category: 'Follow-Up', label: 'Warranty Follow-Up', body: 'Hi {firstName}, just checking in — how is your {service} holding up? Happy to take a look if anything needs attention.', favorited: false, archived: false },
    { id: 'tpl-reengagement', category: 'Follow-Up', label: 'Re-Engagement', body: 'Hi {firstName}, it\'s been a while! If you ever need more work done, {businessName} is here — happy to get you a free estimate.', favorited: false, archived: false },
    { id: 'tpl-thank-you', category: 'Follow-Up', label: 'Thank-You Message', body: 'Hi {firstName}, thank you for trusting {businessName} with your {service} project. It was a pleasure working with you!', favorited: false, archived: false },
    // v2.3 — weather-aware templates (Weather Center → Messages)
    { id: 'tpl-possible-weather-delay', category: 'Weather', label: 'Possible Weather Delay', body: 'Hi {firstName}, keeping an eye on the forecast for your {appointmentDate} {service} appointment — there\'s a chance we may need to adjust timing. I\'ll confirm the morning of.', favorited: false, archived: false },
    { id: 'tpl-confirm-despite-weather', category: 'Weather', label: 'Confirming Despite Weather', body: 'Hi {firstName}, the forecast looks manageable — we\'re still on for {appointmentDate} at {appointmentTime}. See you then!', favorited: false, archived: false },
    { id: 'tpl-severe-weather-reschedule', category: 'Weather', label: 'Severe Weather Reschedule', body: 'Hi {firstName}, due to severe weather in the forecast we need to reschedule your {service} appointment on {appointmentDate}. I\'ll follow up with new times shortly — sorry for the inconvenience.', favorited: false, archived: false },
    { id: 'tpl-heat-adjustment', category: 'Weather', label: 'Heat-Related Schedule Adjustment', body: 'Hi {firstName}, with the heat forecasted for {appointmentDate} we\'re planning an earlier start to keep the crew safe and on schedule — I\'ll confirm the exact time.', favorited: false, archived: false },
    { id: 'tpl-updated-arrival', category: 'Weather', label: 'Updated Arrival Time', body: 'Hi {firstName}, quick update — given the weather we\'re now expecting to arrive around {appointmentTime} on {appointmentDate}. Thanks for your flexibility!', favorited: false, archived: false },
  ];

  /* ---------------- empty (real, no-demo) structure ---------------- */
  LK.EMPTY = () => ({
    version: LK.SCHEMA_VERSION,
    isDemo: false,
    customers: [], jobs: [], quotes: [], invoices: [], revenue: [],
    payments: [], expenses: [], crew: [], events: [], tasks: [],
    notifications: [], contentHistory: [],
    goals: { weeklyRevenue: 0, monthlyRevenue: 0, jobsPerMonth: 0 },
    // Lounge / personal / device / messaging — kept structurally separate from
    // business records so games, reflections, etc. never touch financial data.
    musicPresets: LK.DEFAULT_MUSIC_PRESETS(),
    focusSessions: [], breakSessions: [], simulationHistory: [],
    decisions: [], ideas: [], reflections: [], savedQuotes: [],
    messageTemplates: LK.DEFAULT_TEMPLATES(), messageDrafts: [], communications: [], followUps: [],
    primaryObjective: null,
    // v2.3 — connected workflows / audit / marketing / weather-ops / vision.
    // All structurally separate from customers/jobs/payments/expenses so nothing
    // here is ever counted as real financial or business-record data.
    workflowHistory: [], auditLog: [],
    weatherRiskEvaluations: [], weatherDelays: [],
    marketingMetrics: [], marketingCampaigns: [], marketingPosts: [],
    // v2.4 — Excel/CRM workbook import. A record of every import run, kept
    // separate from customers/jobs so "did I already import this file"
    // never depends on scanning business records themselves.
    importBatches: [],
    marketingGoals: { monthlyReach: 0, monthlyLeads: 0, monthlyFollowers: 0, monthlyRevenue: 0, monthlyAdSpend: 0 },
    visionGoals: [], visionCategories: [], scriptureFavorites: [], gratitudeEntries: [], successMilestones: [], coreValues: [],
    missionStatement: '',
    settings: {
      business: {
        name: 'L&K Wood Fence Services', owner: 'Edel', phone: '713-836-8914', email: '',
        website: 'https://landkwoodfenceservices.com', serviceArea: 'Greater Houston, TX',
        address: '', reviewCount: 0, rating: 0, warrantyTerms: '1 year workmanship warranty',
        depositPct: 50, taxPct: 0, hourlyRate: 45, profitMargin: 25,
        paymentMethods: ['Cash', 'Check', 'Card', 'Zelle'],
        services: ['Fence', 'Gate', 'Pressure Washing', 'Sprinklers', 'Staining', 'Gutters', 'Decks'],
      },
      voice: {
        enabled: true, startupGreeting: true, briefingVoice: true, voiceName: '', rate: 0.98, pitch: 0.92, volume: 1,
        personality: 'professional',
        allowedContexts: { startup: true, briefing: true, focusComplete: true, breakComplete: true, alerts: true, manual: true },
      },
      muted: false,
      personal: {
        greetingName: 'Edel', workStart: '08:00', workEnd: '17:00',
        defaultFocusMinutes: 45, defaultBreakMinutes: 10, defaultLoungeView: 'music',
        showGames: true, showReflection: true, showAmbience: true, showBattery: true, showQuote: true,
      },
      device: { showBattery: true, lowBatteryThreshold: 20, autoLowPower: true, batteryVoiceAlert: false, showConnection: true },
      messaging: {
        businessPhone: '', mode: 'sms-link', signature: '', defaultTemplateCategory: '',
        confirmBeforeLogging: true, followUpDays: 3, quietHoursStart: '21:00', quietHoursEnd: '08:00',
        providerStatus: 'local', backendEndpoint: '',
      },
      lounge: {
        musicVolume: 0.7, ambientVolume: 0.4, musicMuted: false, ambientMuted: false, ambientSound: 'none',
        nightShift: { enabled: false, autoStart: '21:00', autoEnd: '06:00', warmth: 0.6, reducedMotion: false },
      },
      missionControl: {
        visibleMetrics: ['revenueWeek', 'revenueMonth', 'outstandingBalance', 'depositsAwaiting', 'pendingQuoteValue', 'approvedJobValue', 'scheduledWorkValue', 'estProfitMonth', 'expensesMonth', 'netCashFlow', 'jobsToday', 'estimatesToday', 'followUpsDue', 'overdueFollowUps'],
        defaultCardOrder: ['revenue', 'pipeline', 'balance', 'profit'],
        defaultTimeRange: 'month', showPrimaryObjective: true, showCrewStatus: true, showWeatherCard: true, showMusicStatus: true,
      },
      intelligence: {
        profitMethod: 'simple', defaultDateRange: 'month', includeArchivedJobs: false, minDataThreshold: 3,
        showEstimatedProfit: true, showGeographicAnalytics: true,
      },
      marketing: {
        connectors: { meta: 'not_connected', facebook: 'not_connected', instagram: 'not_connected', tiktok: 'not_connected', googleBusiness: 'not_connected' },
        csvMappingMemory: {}, showInMissionControl: true, showInBriefing: true,
      },
      radar: {
        defaultLocation: { lat: 29.7604, lon: -95.3698, label: 'Houston, TX' }, defaultZoom: 8, opacity: 0.7,
        animationSpeed: 'normal', loopRadar: false, autoPauseOutsideWeather: true,
        showJobMarkers: false, addressPrivacy: 'hidden', showAlerts: true, voiceAlerts: false, tempUnit: 'F',
        thresholds: { rainProbability: 50, windMph: 20, gustMph: 30, heatIndex: 100, coldF: 35, stormRisk: true },
      },
      workflows: {
        confirmBeforeConnected: true, defaultFollowUpDays: 3, autoCreateCalendarEvent: false,
        autoSuggestMessages: true, autoUpdatePipelineStage: false, defaultDepositPct: null,
      },
      vision: {
        showDailyScripture: true, showDailyQuote: true, showVisionReminder: true, rotatePhotos: true,
        slideshowIntervalSec: 8, showMissionStatement: true, showGratitudeSummary: true, defaultLayout: 'board',
      },
    },
  });

  /* ---------------- demo (sample) data — clearly flagged, never silently mixed ---------------- */
  function seedDemo() {
    const db = LK.EMPTY();
    db.isDemo = true;
    const today = LK.todayISO();
    db.customers = [
      { id: 'c1', name: 'Pam Jackson (Sample)', phone: '713-555-0142', email: 'pam.jackson@example.com', address: '4821 Briar Forest Dr', city: 'Houston, TX', source: 'Referral', preferredContact: 'Text', status: 'past', notes: 'Prefers text over calls. Has two dogs — gate must latch.', createdAt: LK.addDays(today, -50), lastContactDate: LK.addDays(today, -35), warrantyExpires: LK.addDays(today, 300), reviewStatus: 'received', photos: ['before', 'after'], reviews: [{ rating: 5, text: 'Crew was fast and the fence looks incredible.', date: LK.addDays(today, -40) }], activity: [{ type: 'Lead received', date: LK.addDays(today, -52) }, { type: 'Job completed', date: LK.addDays(today, -35) }, { type: 'Review received', date: LK.addDays(today, -40) }] },
      { id: 'c2', name: 'Marcus Reyes (Sample)', phone: '281-555-0199', email: 'mreyes@example.com', address: '118 Tomball Pkwy', city: 'Tomball, TX', source: 'Referral', preferredContact: 'Call', status: 'active', notes: 'Referred by Pam Jackson.', createdAt: LK.addDays(today, -6), lastContactDate: LK.addDays(today, -1), warrantyExpires: null, reviewStatus: 'none', photos: ['before'], reviews: [], activity: [{ type: 'Lead received', date: LK.addDays(today, -6) }, { type: 'Job scheduled', date: LK.addDays(today, -3) }] },
      { id: 'c4', name: 'Derek Owens (Sample)', phone: '713-555-0133', email: 'dowens@example.com', address: '552 Cypress Creek Pkwy', city: 'Cypress, TX', source: 'Thumbtack', preferredContact: 'Email', status: 'lead', notes: '', createdAt: LK.addDays(today, -2), lastContactDate: LK.addDays(today, -1), warrantyExpires: null, reviewStatus: 'none', photos: [], reviews: [], activity: [{ type: 'Lead received', date: LK.addDays(today, -2) }, { type: 'Estimate sent', date: LK.addDays(today, -1) }] },
    ];
    db.jobs = [
      { id: 'j2', customerId: 'c2', service: 'Fence', address: '118 Tomball Pkwy, Tomball, TX', phone: '281-555-0199', value: 5600, approvedAmount: 5600, depositAmount: 2800, depositStatus: 'paid', materialCost: 2100, laborCost: 1200, otherExpenses: 80, dueDate: LK.addDays(today, 2), crewId: null, priority: 'high', source: 'Referral', lastContact: LK.addDays(today, -1), notes: '160ft cedar privacy, referral from Pam.', stage: 'scheduled', archived: false, createdAt: LK.addDays(today, -6) },
      { id: 'j5', customerId: 'c4', service: 'Pressure Washing', address: '552 Cypress Creek Pkwy, Cypress, TX', phone: '713-555-0133', value: 420, approvedAmount: 0, depositAmount: 0, depositStatus: 'none', materialCost: 20, laborCost: 90, otherExpenses: 0, dueDate: LK.addDays(today, 6), crewId: null, priority: 'med', source: 'Thumbtack', lastContact: LK.addDays(today, -1), notes: 'Driveway + existing fence.', stage: 'quoted', archived: false, createdAt: LK.addDays(today, -2) },
    ];
    db.quotes = [
      { id: 'q2', customerId: 'c4', service: 'Pressure Washing', amount: 420, sentDate: LK.addDays(today, -1), status: 'pending' },
    ];
    db.invoices = [
      { id: 'i2', customerId: 'c2', jobId: 'j2', amount: 2800, status: 'pending', dueDate: LK.addDays(today, 5) },
    ];
    db.payments = [
      { id: 'p1', customerId: 'c1', jobId: 'j1', amount: 4200, method: 'Card', date: LK.addDays(today, -35), note: 'Paid in full' },
      { id: 'p2', customerId: 'c2', jobId: 'j2', amount: 2800, method: 'Zelle', date: LK.addDays(today, -3), note: 'Deposit' },
    ];
    db.expenses = [
      { id: 'x1', category: 'Materials', amount: 2100, date: LK.addDays(today, -4), jobId: 'j2', note: 'Cedar pickets & posts' },
    ];
    db.revenue = [
      { date: LK.addDays(today, -35), amount: 4200, service: 'Fence' },
      { date: LK.addDays(today, -3), amount: 2800, service: 'Fence' },
    ];
    db.crew = [
      { id: 'crew-a', name: 'Crew A (Luis, Danny)', phone: '', role: 'Install crew', active: true, payRate: 24, hoursThisWeek: 0, amountOwed: 0, notes: '' },
      { id: 'crew-b', name: 'Crew B (Marco, Sam)', phone: '', role: 'Install crew', active: true, payRate: 24, hoursThisWeek: 0, amountOwed: 0, notes: '' },
    ];
    db.jobs[0].crewId = 'crew-a';
    db.events = [
      { id: 'e1', title: 'Install — Marcus Reyes', type: 'Fence Installation', date: today, startTime: '08:00', endTime: '15:00', customerId: 'c2', jobId: 'j2', crewId: 'crew-a', address: '118 Tomball Pkwy, Tomball, TX', notes: '', reminder: false, completed: false },
      { id: 'e3', title: 'Estimate — Derek Owens', type: 'Estimate', date: LK.addDays(today, 2), startTime: '13:00', endTime: '13:30', customerId: 'c4', jobId: 'j5', crewId: null, address: '552 Cypress Creek Pkwy, Cypress, TX', notes: '', reminder: false, completed: false },
    ];
    db.tasks = [
      { id: 't1', text: 'Call Derek Owens to confirm pressure washing quote', done: false, due: today },
    ];
    db.goals = { weeklyRevenue: 5000, monthlyRevenue: 18000, jobsPerMonth: 8 };
    db.settings.business.reviewCount = 214;
    db.settings.business.rating = 4.9;

    db.communications = [
      { id: 'comm1', customerId: 'c4', jobId: 'j5', type: 'Text sent', direction: 'outbound', date: LK.addDays(today, -1), time: '14:10', summary: 'Quote sent — $420 pressure washing (Sample)', status: 'sent', followUpDate: null, loggedBy: 'Edel' },
    ];
    db.followUps = [
      { id: 'fu1', customerId: 'c4', reason: 'Estimate sent with no response', dueDate: today, snoozedUntil: null, completed: false, sourceType: 'quote', sourceId: 'q2' },
    ];
    db.ideas = [
      { id: 'idea1', title: 'Offer seasonal staining bundles (Sample)', category: 'New Services', description: 'Bundle staining with fence tune-ups each spring.', potentialIncome: 8000, estimatedCost: 500, difficulty: 'Medium', timeHorizon: 'This quarter', nextAction: 'Draft pricing', status: 'Raw Idea', notes: '', archived: false, createdAt: LK.addDays(today, -5) },
    ];
    db.decisions = [
      { id: 'dec1', title: 'Thumbtack vs. Meta Ads (Sample)', description: 'Where to put next month\'s $500 ad budget.', deadline: LK.addDays(today, 10), options: [
        { id: 'opt1', name: 'Thumbtack', cost: 500, return: 3, time: 3, upside: 'Faster leads', downside: 'Lower margin per lead', risk: 3 },
        { id: 'opt2', name: 'Meta Ads', cost: 500, return: 4, time: 2, upside: 'Better brand reach', downside: 'Slower to convert', risk: 4 },
      ], weights: { profit: 3, speed: 2, risk: 2, effort: 1, longterm: 3, personal: 1 }, archived: false, createdAt: LK.addDays(today, -3) },
    ];
    db.reflections = [
      { date: LK.addDays(today, -1), win: 'Closed the Marcus Reyes fence job (Sample)', stress: 'Weather delay risk', followUp: 'Confirm crew A start time', moneyCollected: 2800, lesson: 'Send deposit requests same-day', priorityTomorrow: 'Follow up with Derek Owens', energy: 7, notes: '' },
    ];
    return db;
  }

  LK.db = null;

  function migrate(raw) {
    // Merge whatever the user already has on top of an empty structure so
    // no real entry is ever dropped — this only ever ADDS missing fields.
    const base = LK.EMPTY();
    const merged = Object.assign({}, base, raw);
    [
      'customers', 'jobs', 'quotes', 'invoices', 'revenue', 'payments', 'expenses', 'crew', 'events', 'tasks', 'notifications', 'contentHistory',
      'focusSessions', 'breakSessions', 'simulationHistory', 'decisions', 'ideas', 'reflections', 'savedQuotes', 'messageDrafts', 'communications', 'followUps',
      'workflowHistory', 'auditLog', 'weatherRiskEvaluations', 'weatherDelays', 'marketingMetrics', 'marketingCampaigns', 'marketingPosts',
      'visionGoals', 'visionCategories', 'scriptureFavorites', 'gratitudeEntries', 'successMilestones', 'coreValues', 'importBatches',
    ].forEach(key => {
      if (!Array.isArray(merged[key])) merged[key] = base[key];
    });
    // musicPresets / messageTemplates: keep the user's edits, but add any new
    // default entries they don't already have (matched by id) without touching theirs.
    merged.musicPresets = Array.isArray(raw.musicPresets) && raw.musicPresets.length ? raw.musicPresets : base.musicPresets;
    merged.messageTemplates = Array.isArray(raw.messageTemplates) && raw.messageTemplates.length ? raw.messageTemplates : base.messageTemplates;
    if (merged.primaryObjective === undefined) merged.primaryObjective = null;
    if (typeof merged.missionStatement !== 'string') merged.missionStatement = base.missionStatement;

    merged.goals = Object.assign({}, base.goals, raw.goals || {});
    merged.marketingGoals = Object.assign({}, base.marketingGoals, raw.marketingGoals || {});
    merged.settings = Object.assign({}, base.settings, raw.settings || {});
    merged.settings.business = Object.assign({}, base.settings.business, (raw.settings && raw.settings.business) || {});
    merged.settings.voice = Object.assign({}, base.settings.voice, (raw.settings && raw.settings.voice) || {});
    merged.settings.voice.allowedContexts = Object.assign({}, base.settings.voice.allowedContexts, (raw.settings && raw.settings.voice && raw.settings.voice.allowedContexts) || {});
    merged.settings.personal = Object.assign({}, base.settings.personal, (raw.settings && raw.settings.personal) || {});
    merged.settings.device = Object.assign({}, base.settings.device, (raw.settings && raw.settings.device) || {});
    merged.settings.messaging = Object.assign({}, base.settings.messaging, (raw.settings && raw.settings.messaging) || {});
    merged.settings.lounge = Object.assign({}, base.settings.lounge, (raw.settings && raw.settings.lounge) || {});
    merged.settings.lounge.nightShift = Object.assign({}, base.settings.lounge.nightShift, (raw.settings && raw.settings.lounge && raw.settings.lounge.nightShift) || {});
    // v2.3 settings — same additive Object.assign merge pattern as every settings object above.
    const rs = raw.settings || {};
    merged.settings.missionControl = Object.assign({}, base.settings.missionControl, rs.missionControl || {});
    merged.settings.intelligence = Object.assign({}, base.settings.intelligence, rs.intelligence || {});
    merged.settings.marketing = Object.assign({}, base.settings.marketing, rs.marketing || {});
    merged.settings.marketing.connectors = Object.assign({}, base.settings.marketing.connectors, (rs.marketing && rs.marketing.connectors) || {});
    merged.settings.marketing.csvMappingMemory = Object.assign({}, base.settings.marketing.csvMappingMemory, (rs.marketing && rs.marketing.csvMappingMemory) || {});
    merged.settings.radar = Object.assign({}, base.settings.radar, rs.radar || {});
    merged.settings.radar.defaultLocation = Object.assign({}, base.settings.radar.defaultLocation, (rs.radar && rs.radar.defaultLocation) || {});
    merged.settings.radar.thresholds = Object.assign({}, base.settings.radar.thresholds, (rs.radar && rs.radar.thresholds) || {});
    merged.settings.workflows = Object.assign({}, base.settings.workflows, rs.workflows || {});
    merged.settings.vision = Object.assign({}, base.settings.vision, rs.vision || {});
    merged.customers.forEach(c => {
      if (!Array.isArray(c.activity)) c.activity = [];
      if (!c.status) c.status = 'active';
      if (!c.reviewStatus) c.reviewStatus = c.reviews && c.reviews.length ? 'received' : 'none';
      // v2.4 — CRM workbook import fields. Blank/null, never 0 or a fabricated
      // date, so historical records that never had this data stay honest.
      if (c.zip === undefined) c.zip = '';
      if (c.leadDate === undefined) c.leadDate = '';
      if (c.costOfLead === undefined) c.costOfLead = null;
      if (c.leadReviewStatus === undefined) c.leadReviewStatus = '';
      if (c.importOriginalStatus === undefined) c.importOriginalStatus = '';
      if (c.importLeadStatusLabel === undefined) c.importLeadStatusLabel = '';
      if (c.importSourceMonth === undefined) c.importSourceMonth = '';
      if (c.importFingerprint === undefined) c.importFingerprint = '';
      if (c.importedAt === undefined) c.importedAt = '';
    });
    merged.jobs.forEach(j => {
      if (typeof j.archived !== 'boolean') j.archived = false;
      if (j.crewId === undefined) j.crewId = null;
      if (j.approvedAmount === undefined) j.approvedAmount = j.value || 0;
      if (j.depositAmount === undefined) j.depositAmount = 0;
      if (j.depositStatus === undefined) j.depositStatus = 'none';
      if (j.materialCost === undefined) j.materialCost = 0;
      if (j.laborCost === undefined) j.laborCost = 0;
      if (j.otherExpenses === undefined) j.otherExpenses = 0;
      if (j.source === undefined) j.source = '';
      if (j.lastContact === undefined) j.lastContact = j.createdAt || LK.todayISO();
      // legacy 'new leads' stage set from v2.0 used key 'new' — keep compatible with the expanded stage list
      if (j.stage === 'new') j.stage = 'new';
      if (j.stage === 'progress') j.stage = 'progress';
      // v2.4 — job-detail fields for imported/historical CRM records. Blank/null,
      // never 0, so a job with unknown specs doesn't read as "zero linear feet."
      if (j.fenceType === undefined) j.fenceType = '';
      if (j.fenceStyle === undefined) j.fenceStyle = '';
      if (j.linearFeet === undefined) j.linearFeet = null;
      if (j.gateCount === undefined) j.gateCount = null;
      if (j.depositRequired === undefined) j.depositRequired = null;
      if (j.depositDate === undefined) j.depositDate = '';
      if (j.finalInvoiceAmount === undefined) j.finalInvoiceAmount = null;
      if (j.finalPaymentAmount === undefined) j.finalPaymentAmount = null;
      if (j.paymentStatus === undefined) j.paymentStatus = '';
      if (j.assignedCrewName === undefined) j.assignedCrewName = '';
      if (j.crewLeader === undefined) j.crewLeader = '';
      if (j.estimatedStartDate === undefined) j.estimatedStartDate = '';
      if (j.actualStartDate === undefined) j.actualStartDate = '';
      if (j.completionDate === undefined) j.completionDate = '';
    });
    // v2.3 — Crew Operations fields. Manual status only; this app never claims GPS tracking.
    merged.crew.forEach(c => {
      if (c.status === undefined) c.status = c.active === false ? 'off-duty' : 'available';
      if (c.currentAssignment === undefined) c.currentAssignment = null;
      if (c.nextAssignment === undefined) c.nextAssignment = null;
      if (c.weatherExposure === undefined) c.weatherExposure = 'none';
      if (c.jobsCompleted === undefined) c.jobsCompleted = 0;
      if (c.openIssues === undefined) c.openIssues = '';
    });
    merged.version = LK.SCHEMA_VERSION;
    return merged;
  }

  LK.loadDB = function () {
    try {
      const raw = localStorage.getItem(LK.STORAGE_KEY);
      if (!raw) {
        LK.db = seedDemo();
      } else {
        const parsed = JSON.parse(raw);
        LK.db = migrate(parsed);
      }
    } catch (e) {
      console.error('[LK.loadDB]', e);
      LK.db = seedDemo();
    }
    // one-time migration of the v2.0 mission log, which lived in its own key
    try {
      const oldLog = localStorage.getItem('lk_mission_log');
      if (oldLog && (!LK.db.tasks || !LK.db.tasks.length)) {
        const parsed = JSON.parse(oldLog);
        if (Array.isArray(parsed) && parsed.length) {
          LK.db.tasks = parsed.map(t => ({ id: t.id || LK.uid(), text: t.text, done: !!t.done, due: LK.todayISO() }));
        }
      }
      localStorage.removeItem('lk_mission_log');
    } catch (e) {}
    return LK.db;
  };
  LK.saveDB = function (silent) {
    localStorage.setItem(LK.STORAGE_KEY, JSON.stringify(LK.db));
    if (!silent) LK.bus.emit('db:changed', LK.db);
  };

  LK.clearDemoData = function () {
    LK.db = LK.EMPTY();
    LK.saveDB();
    LK.bus.emit('notify', { type: 'settings', text: 'Demo data cleared. Starting fresh.' });
  };
  LK.resetDashboard = function () {
    localStorage.removeItem(LK.STORAGE_KEY);
    localStorage.removeItem('lk_mission_log');
    LK.db = LK.EMPTY();
    LK.saveDB();
    LK.bus.emit('notify', { type: 'settings', text: 'Dashboard reset.' });
  };

  LK.getCustomer = (id) => LK.db.customers.find(c => c.id === id);
  LK.getJob = (id) => LK.db.jobs.find(j => j.id === id);
  LK.getCrew = (id) => LK.db.crew.find(c => c.id === id);

  LK.logActivity = function (customerId, type, note) {
    const c = LK.getCustomer(customerId);
    if (!c) return;
    if (!Array.isArray(c.activity)) c.activity = [];
    c.activity.unshift({ type, date: LK.nowISO(), note: note || '' });
  };

  LK.customerStats = function (customerId) {
    const jobs = LK.db.jobs.filter(j => j.customerId === customerId);
    const payments = LK.db.payments.filter(p => p.customerId === customerId);
    const totalRevenue = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const totalOwed = jobs.reduce((s, j) => s + (Number(j.approvedAmount || j.value) || 0), 0);
    const outstandingBalance = Math.max(0, totalOwed - totalRevenue);
    return {
      pastJobs: jobs.filter(j => j.stage === 'completed'),
      activeJobs: jobs.filter(j => j.stage !== 'completed' && j.stage !== 'lost' && !j.archived),
      totalRevenue, outstandingBalance,
    };
  };

  LK.jobBalance = function (job) {
    const paid = LK.db.payments.filter(p => p.jobId === job.id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const owed = Number(job.approvedAmount || job.value) || 0;
    return Math.max(0, owed - paid);
  };

  /* ---------------- export / import ---------------- */
  LK.exportJSON = function () {
    return JSON.stringify(LK.db, null, 2);
  };
  LK.importJSON = function (text) {
    const parsed = JSON.parse(text); // throws on invalid JSON — caller handles
    LK.db = migrate(parsed);
    LK.db.isDemo = false;
    LK.saveDB();
    LK.bus.emit('notify', { type: 'settings', text: 'Data imported successfully.' });
  };
  LK.toCSV = function (rows, columns) {
    const esc = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const header = columns.map(c => esc(c.label)).join(',');
    const body = rows.map(r => columns.map(c => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(',')).join('\n');
    return header + '\n' + body;
  };
  LK.downloadFile = function (filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  LK.loadDB();
})();
