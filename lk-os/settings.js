/* ==========================================================================
   LK OS — settings.js
   Business settings (used by estimator + PDFs + assistant), voice settings,
   crew management, and data management (export/import/CSV/clear-demo/reset).
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  function el(id) { return document.getElementById(id); }

  /* ---------------- business settings ---------------- */
  function renderBusiness() {
    const b = LK.db.settings.business;
    el('bsName').value = b.name;
    el('bsOwner').value = b.owner;
    el('bsPhone').value = b.phone;
    el('bsEmail').value = b.email;
    el('bsWebsite').value = b.website;
    el('bsArea').value = b.serviceArea;
    el('bsAddress').value = b.address;
    el('bsReviewCount').value = b.reviewCount;
    el('bsRating').value = b.rating;
    el('bsWarranty').value = b.warrantyTerms;
    el('bsDeposit').value = b.depositPct;
    el('bsTax').value = b.taxPct;
    el('bsHourly').value = b.hourlyRate;
    el('bsMargin').value = b.profitMargin;
    el('bsPaymentMethods').value = b.paymentMethods.join(', ');
    el('bsServices').value = b.services.join(', ');
  }
  function saveBusiness() {
    const b = LK.db.settings.business;
    b.name = el('bsName').value.trim() || b.name;
    b.owner = el('bsOwner').value.trim();
    b.phone = el('bsPhone').value.trim();
    b.email = el('bsEmail').value.trim();
    b.website = el('bsWebsite').value.trim();
    b.serviceArea = el('bsArea').value.trim();
    b.address = el('bsAddress').value.trim();
    b.reviewCount = parseInt(el('bsReviewCount').value) || 0;
    b.rating = parseFloat(el('bsRating').value) || 0;
    b.warrantyTerms = el('bsWarranty').value.trim();
    b.depositPct = parseFloat(el('bsDeposit').value) || 0;
    b.taxPct = parseFloat(el('bsTax').value) || 0;
    b.hourlyRate = parseFloat(el('bsHourly').value) || 0;
    b.profitMargin = parseFloat(el('bsMargin').value) || 0;
    b.paymentMethods = el('bsPaymentMethods').value.split(',').map(s => s.trim()).filter(Boolean);
    b.services = el('bsServices').value.split(',').map(s => s.trim()).filter(Boolean);
    LK.saveDB();
    LK.bus.emit('notify', { type: 'settings', text: 'Business settings saved.' });
  }

  /* ---------------- voice settings ---------------- */
  const PERSONALITIES = ['professional', 'calm', 'motivational', 'minimal', 'cinematic'];
  const VOICE_CONTEXTS = ['startup', 'briefing', 'focusComplete', 'breakComplete', 'alerts', 'manual'];
  function renderVoice() {
    const v = LK.db.settings.voice;
    el('vsEnabled').checked = v.enabled;
    el('vsStartup').checked = v.startupGreeting;
    el('vsBriefing').checked = v.briefingVoice;
    el('vsPersonality').innerHTML = PERSONALITIES.map(p => '<option' + (p === v.personality ? ' selected' : '') + '>' + p + '</option>').join('');
    el('vsRate').value = v.rate;
    el('vsPitch').value = v.pitch;
    el('vsVolume').value = v.volume;
    VOICE_CONTEXTS.forEach(c => { const box = el('vsCtx_' + c); if (box) box.checked = !!v.allowedContexts[c]; });
    const voices = LK.audio.listVoices();
    el('vsVoiceName').innerHTML = '<option value="">System default</option>' + voices.map(vo => '<option value="' + vo.name + '"' + (vo.name === v.voiceName ? ' selected' : '') + '>' + vo.name + ' (' + vo.lang + ')</option>').join('');
  }
  function saveVoice() {
    const v = LK.db.settings.voice;
    v.enabled = el('vsEnabled').checked;
    v.startupGreeting = el('vsStartup').checked;
    v.briefingVoice = el('vsBriefing').checked;
    v.personality = el('vsPersonality').value;
    v.voiceName = el('vsVoiceName').value;
    v.rate = parseFloat(el('vsRate').value) || 0.98;
    v.pitch = parseFloat(el('vsPitch').value) || 0.92;
    v.volume = parseFloat(el('vsVolume').value);
    VOICE_CONTEXTS.forEach(c => { const box = el('vsCtx_' + c); if (box) v.allowedContexts[c] = box.checked; });
    LK.saveDB();
    LK.bus.emit('notify', { type: 'settings', text: 'Voice settings saved.' });
  }
  function testVoice() {
    LK.audio.speak('This is how the L&K assistant will sound.', { queue: false, context: 'manual' });
  }

  /* ---------------- personal preferences ---------------- */
  function renderPersonal() {
    const p = LK.db.settings.personal;
    el('ppName').value = p.greetingName;
    el('ppWorkStart').value = p.workStart;
    el('ppWorkEnd').value = p.workEnd;
    el('ppFocusMin').value = p.defaultFocusMinutes;
    el('ppBreakMin').value = p.defaultBreakMinutes;
    el('ppShowGames').checked = p.showGames;
    el('ppShowReflection').checked = p.showReflection;
    el('ppShowAmbience').checked = p.showAmbience;
    el('ppShowBattery').checked = p.showBattery;
    el('ppShowQuote').checked = p.showQuote;
    renderQuotesList();
  }
  function savePersonal() {
    const p = LK.db.settings.personal;
    p.greetingName = el('ppName').value.trim() || 'Edel';
    p.workStart = el('ppWorkStart').value;
    p.workEnd = el('ppWorkEnd').value;
    p.defaultFocusMinutes = parseInt(el('ppFocusMin').value) || 45;
    p.defaultBreakMinutes = parseInt(el('ppBreakMin').value) || 10;
    p.showGames = el('ppShowGames').checked;
    p.showReflection = el('ppShowReflection').checked;
    p.showAmbience = el('ppShowAmbience').checked;
    p.showBattery = el('ppShowBattery').checked;
    p.showQuote = el('ppShowQuote').checked;
    LK.db.settings.device.showBattery = p.showBattery;
    LK.saveDB();
    LK.bus.emit('notify', { type: 'settings', text: 'Personal preferences saved.' });
  }
  function renderQuotesList() {
    const list = el('quoteList');
    if (!list) return;
    list.innerHTML = LK.db.savedQuotes.length ? LK.db.savedQuotes.map(q =>
      '<div class="cust-line"><span>"' + q.text + '"' + (q.author ? ' — ' + q.author : '') + '</span><span><button type="button" class="hud-btn tiny quote-del" data-id="' + q.id + '">DEL</button></span></div>'
    ).join('') : '<div class="log-empty">NO SAVED QUOTES YET</div>';
    list.querySelectorAll('.quote-del').forEach(b => b.addEventListener('click', () => { LK.db.savedQuotes = LK.db.savedQuotes.filter(q => q.id !== b.dataset.id); LK.saveDB(); renderQuotesList(); }));
  }
  function addQuote() {
    const text = el('quoteText').value.trim();
    if (!text) return;
    LK.db.savedQuotes.push({ id: LK.uid(), text, author: el('quoteAuthor').value.trim() });
    el('quoteText').value = ''; el('quoteAuthor').value = '';
    LK.saveDB(); renderQuotesList();
  }

  /* ---------------- device settings ---------------- */
  function renderDevice() {
    const d = LK.db.settings.device;
    el('dsShowBattery').checked = d.showBattery;
    el('dsThreshold').value = d.lowBatteryThreshold;
    el('dsAutoLowPower').checked = d.autoLowPower;
    el('dsVoiceAlert').checked = d.batteryVoiceAlert;
    el('dsShowConnection').checked = d.showConnection;
  }
  function saveDevice() {
    const d = LK.db.settings.device;
    d.showBattery = el('dsShowBattery').checked;
    d.lowBatteryThreshold = parseInt(el('dsThreshold').value) || 20;
    d.autoLowPower = el('dsAutoLowPower').checked;
    d.batteryVoiceAlert = el('dsVoiceAlert').checked;
    d.showConnection = el('dsShowConnection').checked;
    LK.saveDB();
    LK.device && LK.device.render();
    LK.bus.emit('notify', { type: 'settings', text: 'Device settings saved.' });
  }

  /* ---------------- messaging settings ---------------- */
  function renderMessaging() {
    const m = LK.db.settings.messaging;
    el('msPhone').value = m.businessPhone;
    el('msSignature').value = m.signature;
    el('msConfirm').checked = m.confirmBeforeLogging;
    el('msFollowUpDays').value = m.followUpDays;
    el('msQuietStart').value = m.quietHoursStart;
    el('msQuietEnd').value = m.quietHoursEnd;
    el('msProviderStatus').textContent = m.providerStatus === 'local' ? 'LOCAL (sms link / copy — no live provider connected)' : m.providerStatus.toUpperCase();
    el('msBackendEndpoint').value = m.backendEndpoint;
  }
  function saveMessaging() {
    const m = LK.db.settings.messaging;
    m.businessPhone = el('msPhone').value.trim();
    m.signature = el('msSignature').value.trim();
    m.confirmBeforeLogging = el('msConfirm').checked;
    m.followUpDays = parseInt(el('msFollowUpDays').value) || 3;
    m.quietHoursStart = el('msQuietStart').value;
    m.quietHoursEnd = el('msQuietEnd').value;
    m.backendEndpoint = el('msBackendEndpoint').value.trim();
    LK.saveDB();
    LK.bus.emit('notify', { type: 'settings', text: 'Messaging settings saved.' });
  }

  /* ---------------- v2.3 — Mission Control / Intelligence / Radar / Workflow settings ---------------- */
  function renderMissionControlSettings() {
    const m = LK.db.settings.missionControl;
    const wrap = el('mcSettingsBody');
    if (!wrap) return;
    wrap.innerHTML =
      '<div class="est-form">' +
        '<div class="qte-field"><label>DEFAULT TIME RANGE</label><select id="mcRangeSel" class="hud-input"><option value="week"' + (m.defaultTimeRange === 'week' ? ' selected' : '') + '>Week</option><option value="month"' + (m.defaultTimeRange === 'month' ? ' selected' : '') + '>Month</option></select></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="mcShowPO" ' + (m.showPrimaryObjective ? 'checked' : '') + '> SHOW PRIMARY OBJECTIVE</label></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="mcShowCrew" ' + (m.showCrewStatus ? 'checked' : '') + '> SHOW CREW STATUS</label></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="mcShowWx" ' + (m.showWeatherCard ? 'checked' : '') + '> SHOW WEATHER CARD</label></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="mcShowMusic" ' + (m.showMusicStatus ? 'checked' : '') + '> SHOW MUSIC STATUS</label></div>' +
      '</div><div class="panel-actions"><button type="button" class="hud-btn" id="mcSettingsSave">SAVE MISSION CONTROL SETTINGS</button></div>';
    el('mcSettingsSave').addEventListener('click', () => {
      m.defaultTimeRange = el('mcRangeSel').value;
      m.showPrimaryObjective = el('mcShowPO').checked;
      m.showCrewStatus = el('mcShowCrew').checked;
      m.showWeatherCard = el('mcShowWx').checked;
      m.showMusicStatus = el('mcShowMusic').checked;
      LK.saveDB();
      LK.bus.emit('notify', { type: 'settings', text: 'Mission Control settings saved.' });
    });
  }

  function renderIntelligenceSettings() {
    const m = LK.db.settings.intelligence;
    const wrap = el('intelSettingsBody');
    if (!wrap) return;
    wrap.innerHTML =
      '<div class="est-form">' +
        '<div class="qte-field"><label>MINIMUM DATA THRESHOLD</label><input type="number" id="intelMinData" class="hud-input" min="1" value="' + m.minDataThreshold + '"></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="intelArchived" ' + (m.includeArchivedJobs ? 'checked' : '') + '> INCLUDE ARCHIVED JOBS</label></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="intelShowProfit" ' + (m.showEstimatedProfit ? 'checked' : '') + '> SHOW ESTIMATED PROFIT</label></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="intelShowGeo" ' + (m.showGeographicAnalytics ? 'checked' : '') + '> SHOW GEOGRAPHIC ANALYTICS</label></div>' +
      '</div><div class="panel-actions"><button type="button" class="hud-btn" id="intelSettingsSave">SAVE INTELLIGENCE SETTINGS</button></div>';
    el('intelSettingsSave').addEventListener('click', () => {
      m.minDataThreshold = parseInt(el('intelMinData').value) || 3;
      m.includeArchivedJobs = el('intelArchived').checked;
      m.showEstimatedProfit = el('intelShowProfit').checked;
      m.showGeographicAnalytics = el('intelShowGeo').checked;
      LK.saveDB();
      LK.bus.emit('notify', { type: 'settings', text: 'Intelligence settings saved.' });
    });
  }

  function renderRadarSettings() {
    const m = LK.db.settings.radar;
    const wrap = el('radarSettingsBody');
    if (!wrap) return;
    wrap.innerHTML =
      '<div class="est-form">' +
        '<div class="qte-field"><label>DEFAULT ZOOM</label><input type="number" id="rsZoom" class="hud-input" min="3" max="15" value="' + m.defaultZoom + '"></div>' +
        '<div class="qte-field"><label>ANIMATION SPEED</label><select id="rsSpeed" class="hud-input"><option value="slow"' + (m.animationSpeed === 'slow' ? ' selected' : '') + '>Slow</option><option value="normal"' + (m.animationSpeed === 'normal' ? ' selected' : '') + '>Normal</option><option value="fast"' + (m.animationSpeed === 'fast' ? ' selected' : '') + '>Fast</option></select></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="rsLoop" ' + (m.loopRadar ? 'checked' : '') + '> LOOP RADAR</label></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="rsAutoPause" ' + (m.autoPauseOutsideWeather ? 'checked' : '') + '> AUTO-PAUSE OUTSIDE WEATHER CENTER</label></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="rsShowMarkers" ' + (m.showJobMarkers ? 'checked' : '') + '> SHOW JOB MARKERS</label></div>' +
        '<div class="qte-field"><label>ADDRESS PRIVACY</label><select id="rsPrivacy" class="hud-input"><option value="hidden"' + (m.addressPrivacy === 'hidden' ? ' selected' : '') + '>Hidden</option><option value="approximate"' + (m.addressPrivacy === 'approximate' ? ' selected' : '') + '>Approximate area</option><option value="exact"' + (m.addressPrivacy === 'exact' ? ' selected' : '') + '>Exact</option></select></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="rsShowAlerts" ' + (m.showAlerts ? 'checked' : '') + '> SHOW ALERTS</label></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="rsVoiceAlerts" ' + (m.voiceAlerts ? 'checked' : '') + '> VOICE ALERTS</label></div>' +
        '<div class="qte-field"><label>TEMPERATURE UNIT</label><select id="rsTempUnit" class="hud-input"><option value="F"' + (m.tempUnit === 'F' ? ' selected' : '') + '>°F</option><option value="C"' + (m.tempUnit === 'C' ? ' selected' : '') + '>°C</option></select></div>' +
        '<div class="qte-field"><label>RAIN PROBABILITY THRESHOLD %</label><input type="number" id="rsRainT" class="hud-input" value="' + m.thresholds.rainProbability + '"></div>' +
        '<div class="qte-field"><label>WIND THRESHOLD (MPH)</label><input type="number" id="rsWindT" class="hud-input" value="' + m.thresholds.windMph + '"></div>' +
        '<div class="qte-field"><label>GUST THRESHOLD (MPH)</label><input type="number" id="rsGustT" class="hud-input" value="' + m.thresholds.gustMph + '"></div>' +
        '<div class="qte-field"><label>HEAT INDEX THRESHOLD (°F)</label><input type="number" id="rsHeatT" class="hud-input" value="' + m.thresholds.heatIndex + '"></div>' +
        '<div class="qte-field"><label>COLD THRESHOLD (°F)</label><input type="number" id="rsColdT" class="hud-input" value="' + m.thresholds.coldF + '"></div>' +
      '</div><div class="panel-actions"><button type="button" class="hud-btn" id="radarSettingsSave">SAVE RADAR SETTINGS</button></div>';
    el('radarSettingsSave').addEventListener('click', () => {
      m.defaultZoom = parseInt(el('rsZoom').value) || 8;
      m.animationSpeed = el('rsSpeed').value;
      m.loopRadar = el('rsLoop').checked;
      m.autoPauseOutsideWeather = el('rsAutoPause').checked;
      m.showJobMarkers = el('rsShowMarkers').checked;
      m.addressPrivacy = el('rsPrivacy').value;
      m.showAlerts = el('rsShowAlerts').checked;
      m.voiceAlerts = el('rsVoiceAlerts').checked;
      m.tempUnit = el('rsTempUnit').value;
      m.thresholds.rainProbability = parseFloat(el('rsRainT').value) || 50;
      m.thresholds.windMph = parseFloat(el('rsWindT').value) || 20;
      m.thresholds.gustMph = parseFloat(el('rsGustT').value) || 30;
      m.thresholds.heatIndex = parseFloat(el('rsHeatT').value) || 100;
      m.thresholds.coldF = parseFloat(el('rsColdT').value) || 35;
      LK.saveDB();
      if (LK.radar) LK.radar.renderJobMarkers();
      LK.bus.emit('notify', { type: 'settings', text: 'Radar settings saved.' });
    });
  }

  function renderWorkflowSettings() {
    const m = LK.db.settings.workflows;
    const wrap = el('workflowSettingsBody');
    if (!wrap) return;
    wrap.innerHTML =
      '<div class="est-form">' +
        '<div class="qte-field"><label><input type="checkbox" id="wfConfirm" ' + (m.confirmBeforeConnected ? 'checked' : '') + '> CONFIRM BEFORE CONNECTED UPDATES</label></div>' +
        '<div class="qte-field"><label>DEFAULT FOLLOW-UP INTERVAL (DAYS)</label><input type="number" id="wfFollowUp" class="hud-input" value="' + m.defaultFollowUpDays + '"></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="wfAutoCal" ' + (m.autoCreateCalendarEvent ? 'checked' : '') + '> AUTO-CREATE CALENDAR EVENT</label></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="wfAutoMsg" ' + (m.autoSuggestMessages ? 'checked' : '') + '> AUTO-SUGGEST MESSAGES</label></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="wfAutoStage" ' + (m.autoUpdatePipelineStage ? 'checked' : '') + '> AUTO-UPDATE PIPELINE STAGE</label></div>' +
        '<div class="qte-field"><label>DEFAULT DEPOSIT % (BLANK = USE BUSINESS DEFAULT)</label><input type="number" id="wfDeposit" class="hud-input" value="' + (m.defaultDepositPct != null ? m.defaultDepositPct : '') + '"></div>' +
      '</div><div class="panel-actions"><button type="button" class="hud-btn" id="workflowSettingsSave">SAVE WORKFLOW SETTINGS</button></div>';
    el('workflowSettingsSave').addEventListener('click', () => {
      m.confirmBeforeConnected = el('wfConfirm').checked;
      m.defaultFollowUpDays = parseInt(el('wfFollowUp').value) || 3;
      m.autoCreateCalendarEvent = el('wfAutoCal').checked;
      m.autoSuggestMessages = el('wfAutoMsg').checked;
      m.autoUpdatePipelineStage = el('wfAutoStage').checked;
      const dep = el('wfDeposit').value;
      m.defaultDepositPct = dep !== '' ? parseFloat(dep) : null;
      LK.saveDB();
      LK.bus.emit('notify', { type: 'settings', text: 'Workflow settings saved.' });
    });
  }

  /* ---------------- marketing settings ---------------- */
  function renderMarketing() {
    const m = LK.db.settings.marketing;
    const wrap = el('marketingSettingsBody');
    if (!wrap) return;
    const platformRows = (LK.marketing ? LK.marketing.PLATFORMS : []).map(p =>
      '<div class="cust-line"><span>' + p.label + '</span><span>' + (m.connectors[p.key] === 'connected' ? 'CONNECTED' : 'NOT CONNECTED — CSV import only') + '</span></div>').join('');
    wrap.innerHTML =
      '<div class="cust-sub-title">Connector Status</div>' + platformRows +
      '<div class="est-form" style="margin-top:10px">' +
        '<div class="qte-field"><label><input type="checkbox" id="msShowMC" ' + (m.showInMissionControl ? 'checked' : '') + '> SHOW IN MISSION CONTROL</label></div>' +
        '<div class="qte-field"><label><input type="checkbox" id="msShowBrief" ' + (m.showInBriefing ? 'checked' : '') + '> SHOW IN DAILY BRIEFING</label></div>' +
      '</div>' +
      '<div class="panel-actions"><button type="button" class="hud-btn" id="msMktSave">SAVE MARKETING SETTINGS</button></div>';
    el('msMktSave').addEventListener('click', () => {
      m.showInMissionControl = el('msShowMC').checked;
      m.showInBriefing = el('msShowBrief').checked;
      LK.saveDB();
      LK.bus.emit('notify', { type: 'settings', text: 'Marketing settings saved.' });
    });
  }

  /* ---------------- crew management ---------------- */
  function renderCrew() {
    const list = el('crewList');
    if (LK.crewops) LK.crewops.refreshComputedFields();
    list.innerHTML = LK.db.crew.length ? LK.db.crew.map(c =>
      '<div class="cust-line crew-row" data-id="' + c.id + '">' +
        '<span>' + c.name + ' &middot; ' + (c.role || '') + ' &middot; <span class="status-pill">' + (c.status || 'available').toUpperCase() + '</span>' + (c.active ? '' : ' (inactive)') + '</span>' +
        '<span>' + (c.currentAssignment ? 'On: ' + LK.crewops.assignmentLabel(c.currentAssignment) : c.nextAssignment ? 'Next: ' + LK.crewops.assignmentLabel(c.nextAssignment) : 'No assignment') + ' &middot; ' + c.jobsCompleted + ' completed' +
        ' <button type="button" class="hud-btn tiny crew-edit">EDIT</button> <button type="button" class="hud-btn tiny crew-del" style="border-color:var(--danger); color:var(--danger)">DEL</button></span>' +
      '</div>').join('') : '<div class="log-empty">NO CREW YET</div>';

    list.querySelectorAll('.crew-edit').forEach(btn => btn.addEventListener('click', (e) => openCrewModal(e.target.closest('.crew-row').dataset.id)));
    list.querySelectorAll('.crew-del').forEach(btn => btn.addEventListener('click', (e) => deleteCrew(e.target.closest('.crew-row').dataset.id)));
    if (LK.crewops) LK.crewops.renderCrewBoard();
  }
  function openCrewModal(id) {
    const c = id ? LK.getCrew(id) : null;
    el('crTitle').textContent = c ? 'Edit Crew Member' : 'New Crew Member';
    el('crName').value = c ? c.name : '';
    el('crPhone').value = c ? c.phone : '';
    el('crRole').value = c ? c.role : '';
    el('crActive').checked = c ? c.active : true;
    el('crPayRate').value = c ? c.payRate : '';
    el('crHours').value = c ? c.hoursThisWeek : 0;
    el('crOwed').value = c ? c.amountOwed : 0;
    el('crNotes').value = c ? c.notes : '';
    if (el('crStatus')) el('crStatus').value = c ? (c.status || 'available') : 'available';
    if (el('crIssues')) el('crIssues').value = c ? (c.openIssues || '') : '';
    el('crewModal').dataset.id = id || '';
    el('crewModal').classList.add('open');
    el('crName').focus();
  }
  function closeCrewModal() { el('crewModal').classList.remove('open'); }
  function saveCrewModal() {
    const name = el('crName').value.trim();
    if (!name) { el('crName').focus(); return; }
    const id = el('crewModal').dataset.id;
    let c = id ? LK.getCrew(id) : null;
    if (!c) { c = { id: LK.uid(), currentAssignment: null, nextAssignment: null, jobsCompleted: 0 }; LK.db.crew.push(c); }
    c.name = name;
    c.phone = el('crPhone').value.trim();
    c.role = el('crRole').value.trim();
    c.active = el('crActive').checked;
    c.payRate = parseFloat(el('crPayRate').value) || 0;
    c.hoursThisWeek = parseFloat(el('crHours').value) || 0;
    c.amountOwed = parseFloat(el('crOwed').value) || 0;
    c.notes = el('crNotes').value.trim();
    if (el('crStatus')) c.status = el('crStatus').value;
    if (el('crIssues')) c.openIssues = el('crIssues').value.trim();
    LK.saveDB();
    renderCrew();
    LK.bus.emit('notify', { type: 'crew', text: 'Crew member saved: ' + name });
    closeCrewModal();
  }
  function deleteCrew(id) {
    const c = LK.getCrew(id);
    if (!c) return;
    if (!confirm('Remove ' + c.name + ' from crew?')) return;
    LK.db.crew = LK.db.crew.filter(x => x.id !== id);
    LK.db.jobs.forEach(j => { if (j.crewId === id) j.crewId = null; });
    LK.db.events.forEach(e => { if (e.crewId === id) e.crewId = null; });
    LK.saveDB();
    renderCrew();
  }

  /* ---------------- data management ---------------- */
  function exportJSON() {
    LK.downloadFile('lk-os-backup-' + LK.todayISO() + '.json', LK.exportJSON(), 'application/json');
    LK.bus.emit('notify', { type: 'settings', text: 'Backup exported.' });
  }
  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        LK.importJSON(reader.result);
        renderAll();
        LK.bus.emit('db:changed');
      } catch (e) {
        alert('Import failed — the file was not valid JSON.');
      }
    };
    reader.readAsText(file);
  }
  function exportCustomersCSV() {
    const csv = LK.toCSV(LK.db.customers, [
      { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
      { key: 'address', label: 'Address' }, { key: 'city', label: 'City' }, { key: 'status', label: 'Status' },
      { key: 'source', label: 'Source' }, { get: c => LK.customerStats(c.id).totalRevenue, label: 'Total Revenue' },
      { get: c => LK.customerStats(c.id).outstandingBalance, label: 'Outstanding Balance' },
    ]);
    LK.downloadFile('lk-customers-' + LK.todayISO() + '.csv', csv, 'text/csv');
  }
  function exportJobsCSV() {
    const csv = LK.toCSV(LK.db.jobs, [
      { get: j => (LK.getCustomer(j.customerId) || {}).name || '', label: 'Customer' },
      { key: 'service', label: 'Service' }, { key: 'stage', label: 'Stage' }, { key: 'value', label: 'Value' },
      { key: 'depositAmount', label: 'Deposit' }, { get: LK.jobBalance, label: 'Balance Due' },
      { key: 'dueDate', label: 'Due Date' }, { get: j => (LK.getCrew(j.crewId) || {}).name || '', label: 'Crew' },
    ]);
    LK.downloadFile('lk-jobs-' + LK.todayISO() + '.csv', csv, 'text/csv');
  }
  function exportPaymentsCSV() {
    const csv = LK.toCSV(LK.db.payments, [
      { get: p => (LK.getCustomer(p.customerId) || {}).name || '', label: 'Customer' },
      { key: 'amount', label: 'Amount' }, { key: 'method', label: 'Method' }, { key: 'date', label: 'Date' }, { key: 'note', label: 'Note' },
    ]);
    LK.downloadFile('lk-payments-' + LK.todayISO() + '.csv', csv, 'text/csv');
  }

  function updateDemoBanner() {
    const banner = document.getElementById('demoBanner');
    if (!banner) return;
    banner.style.display = LK.db.isDemo ? 'flex' : 'none';
  }

  function renderAll() {
    renderBusiness(); renderVoice(); renderCrew(); renderPersonal(); renderDevice(); renderMessaging(); renderMarketing();
    renderMissionControlSettings(); renderIntelligenceSettings(); renderRadarSettings(); renderWorkflowSettings();
    updateDemoBanner();
  }

  function wire() {
    el('bsSave').addEventListener('click', saveBusiness);
    el('vsSave').addEventListener('click', saveVoice);
    el('vsTest').addEventListener('click', testVoice);
    el('ppSave').addEventListener('click', savePersonal);
    el('quoteAdd').addEventListener('click', addQuote);
    el('dsSave').addEventListener('click', saveDevice);
    el('msSave').addEventListener('click', saveMessaging);
    el('crewAddBtn').addEventListener('click', () => openCrewModal(null));
    el('crSave').addEventListener('click', saveCrewModal);
    el('crCancel').addEventListener('click', closeCrewModal);
    el('crDelete').addEventListener('click', () => { const id = el('crewModal').dataset.id; if (id) { deleteCrew(id); closeCrewModal(); } });
    el('crewModal').addEventListener('click', e => { if (e.target.id === 'crewModal') closeCrewModal(); });

    el('exportJsonBtn').addEventListener('click', exportJSON);
    el('backupBtn').addEventListener('click', exportJSON);
    el('importJsonInput').addEventListener('change', e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; });
    el('restoreBtn').addEventListener('click', () => el('importJsonInput').click());
    el('exportCustomersCsvBtn').addEventListener('click', exportCustomersCSV);
    el('exportJobsCsvBtn').addEventListener('click', exportJobsCSV);
    el('exportPaymentsCsvBtn').addEventListener('click', exportPaymentsCSV);

    el('clearDemoBtn').addEventListener('click', () => {
      if (!confirm('Clear all sample data? This starts you with a completely empty dashboard.')) return;
      LK.clearDemoData();
      renderAll();
      LK.bus.emit('db:changed');
    });
    el('resetDashboardBtn').addEventListener('click', () => {
      if (!confirm('Reset the ENTIRE dashboard, including any real data you entered? This cannot be undone.')) return;
      if (!confirm('Are you absolutely sure? Consider exporting a backup first.')) return;
      LK.resetDashboard();
      renderAll();
      LK.bus.emit('db:changed');
    });
    el('demoBannerClearBtn').addEventListener('click', () => el('clearDemoBtn').click());

    renderAll();
    LK.bus.on('db:changed', updateDemoBanner);
    LK.bus.on('audio:voices', renderVoice);
  }

  LK.settings = { renderAll };
  document.addEventListener('DOMContentLoaded', wire, { once: true });
})();
