/* ==========================================================================
   LK OS — radar.js  (v2.3)
   Live weather radar: Leaflet map + RainViewer public radar imagery
   (https://api.rainviewer.com — free, keyless, real observed frames).
   OSM basemap with standard attribution. The map is created once and reused
   — never re-initialized — tile layers are removed before new ones are
   added, the play timer is cleared on nav-away/tab-hidden, and everything
   degrades to a plain "RADAR UNAVAILABLE" message without touching the
   rest of Weather Center if Leaflet or the RainViewer fetch fails.

   RainViewer's public frames are real *observed* radar only ("past") plus,
   when present in the API response, short-range "nowcast" frames — those
   are always labeled FORECAST and rendered distinctly; nothing here ever
   presents historical animation as future movement.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let map = null, radarLayer = null, jobMarkersLayer = null;
  let frames = { past: [], nowcast: [] };
  let host = '';
  let activeIndex = -1;
  let playing = false, playTimer = null;
  let fullscreen = false;

  function el(id) { return document.getElementById(id); }
  function allFrames() { return frames.past.concat(frames.nowcast); }
  function latestPastIndex() { return frames.past.length - 1; }
  function leafletReady() { return typeof window.L !== 'undefined'; }

  function ensureMap() {
    if (map) return map;
    if (!leafletReady()) { setStatus('error', 'Map library failed to load — check your connection.'); return null; }
    const container = el('radarMap');
    if (!container) return null;
    const loc = LK.db.settings.radar.defaultLocation;
    map = window.L.map(container, { zoomControl: true }).setView([loc.lat, loc.lon], LK.db.settings.radar.defaultZoom);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &middot; Radar © <a href="https://www.rainviewer.com" target="_blank" rel="noopener">RainViewer</a>',
      maxZoom: 18,
    }).addTo(map);
    jobMarkersLayer = window.L.layerGroup().addTo(map);
    return map;
  }

  function setStatus(state, msg) {
    const badge = el('radarStatus');
    if (!badge) return;
    badge.textContent = state === 'loading' ? 'LOADING…' : state === 'error' ? 'RADAR UNAVAILABLE' : 'LIVE';
    badge.className = 'wx-note ' + (state === 'error' ? 'warn' : state === 'ready' ? 'good' : 'neutral');
    const errEl = el('radarError');
    if (errEl) errEl.textContent = state === 'error' ? (msg || 'Radar data is temporarily unavailable.') : '';
  }

  async function fetchFrames() {
    setStatus('loading');
    try {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      if (!res.ok) throw new Error('bad response');
      const data = await res.json();
      host = data.host || '';
      frames.past = (data.radar && data.radar.past) || [];
      frames.nowcast = (data.radar && data.radar.nowcast) || [];
      if (!frames.past.length) throw new Error('no frames');
      activeIndex = latestPastIndex();
      setStatus('ready');
      renderTimeline();
      showFrame(activeIndex);
    } catch (e) {
      setStatus('error');
      // Forecast (weather.js) is completely independent of this failure —
      // nothing here touches LK.weather.data or the existing forecast panels.
    }
  }

  function showFrame(i) {
    const m = ensureMap();
    if (!m) return;
    const all = allFrames();
    if (i < 0 || i >= all.length) return;
    activeIndex = i;
    const frame = all[i];
    if (radarLayer) { m.removeLayer(radarLayer); radarLayer = null; }
    const opacity = LK.db.settings.radar.opacity;
    radarLayer = window.L.tileLayer(host + frame.path + '/256/{z}/{x}/{y}/2/1_1.png', { opacity, zIndex: 20 }).addTo(m);
    updateFrameLabel(frame, i < frames.past.length);
    renderTimeline();
  }

  function houstonTime(unixSeconds) {
    return new Date(unixSeconds * 1000).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
  }

  function updateFrameLabel(frame, isPast) {
    const label = el('radarFrameTime');
    if (label) label.textContent = (isPast ? 'PAST' : 'FORECAST (short-range nowcast)') + ' · ' + houstonTime(frame.time) + ' CT';
    const updated = el('radarLastUpdated');
    if (updated && frames.past.length) updated.textContent = 'Latest observed frame: ' + houstonTime(frames.past[frames.past.length - 1].time) + ' CT';
  }

  function renderTimeline() {
    const wrap = el('radarTimeline');
    if (!wrap) return;
    const all = allFrames();
    wrap.innerHTML = all.map((f, i) => {
      const isPast = i < frames.past.length;
      const isLatest = i === latestPastIndex();
      return '<button type="button" class="radar-frame-btn' + (i === activeIndex ? ' active' : '') + (isPast ? '' : ' forecast') + '" data-i="' + i + '" title="' + (isPast ? 'Observed' : 'Forecast (nowcast)') + '">' + houstonTime(f.time) + (isLatest ? ' •' : '') + '</button>';
    }).join('');
    wrap.querySelectorAll('.radar-frame-btn').forEach(btn => btn.addEventListener('click', () => { pause(); showFrame(Number(btn.dataset.i)); }));
  }

  function play() {
    if (playing || !allFrames().length) return;
    if (LK.reduceMotion) { LK.bus.emit('notify', { type: 'weather', text: 'Radar animation stays off — reduced motion is enabled in this browser.' }); return; }
    playing = true;
    updatePlayBtn();
    const speedMs = { slow: 1200, normal: 700, fast: 350 }[LK.db.settings.radar.animationSpeed] || 700;
    playTimer = setInterval(() => {
      const all = allFrames();
      let next = activeIndex + 1;
      if (next >= all.length) {
        if (LK.db.settings.radar.loopRadar) next = 0;
        else { pause(); return; }
      }
      showFrame(next);
    }, speedMs);
  }
  function pause() {
    if (!playing) return;
    playing = false;
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    updatePlayBtn();
  }
  function updatePlayBtn() {
    const btn = el('radarPlayPause');
    if (btn) btn.textContent = playing ? '⏸ PAUSE' : '▶ PLAY';
  }

  function resetView() {
    const m = ensureMap();
    if (!m) return;
    const loc = LK.db.settings.radar.defaultLocation;
    m.setView([loc.lat, loc.lon], LK.db.settings.radar.defaultZoom);
  }

  function toggleFullscreen() {
    const wrap = el('radarMapWrap');
    if (!wrap) return;
    fullscreen = !fullscreen;
    wrap.classList.toggle('radar-fullscreen', fullscreen);
    setTimeout(() => { if (map) map.invalidateSize(); }, 60);
  }

  /* ---------------- job markers (manual coordinates only, hidden by default) ---------------- */
  function jobPopupHtml(job) {
    const c = LK.getCustomer(job.customerId);
    const risk = LK.weather.assessRiskForDate ? LK.weather.assessRiskForDate(job.dueDate) : null;
    return '<div style="font-family:Rajdhani,sans-serif;font-size:12px;min-width:160px">' +
      '<b>' + (c ? c.name : 'Unknown customer') + '</b><br>' + job.service + '<br>Stage: ' + job.stage +
      (job.crewId ? '<br>Crew: ' + ((LK.getCrew(job.crewId) || {}).name || '') : '') +
      (risk ? '<br>Risk: ' + risk.level : '') +
      '<br><button type="button" onclick="window.LK.messages && window.LK.messages.selectCustomer(\'' + job.customerId + '\')" style="margin-top:4px;font-size:10px">Text Customer</button>' +
      '</div>';
  }
  function renderJobMarkers() {
    const m = ensureMap();
    if (!m || !jobMarkersLayer) return;
    jobMarkersLayer.clearLayers();
    if (!LK.db.settings.radar.showJobMarkers) return;
    LK.db.jobs.filter(j => !j.archived && j.lat != null && j.lng != null && typeof j.lat === 'number' && typeof j.lng === 'number').forEach(job => {
      const marker = window.L.circleMarker([job.lat, job.lng], { radius: 7, color: '#3FD8FF', fillColor: '#3FD8FF', fillOpacity: 0.6 });
      marker.bindPopup(jobPopupHtml(job));
      marker.addTo(jobMarkersLayer);
    });
  }

  function init() {
    if (!ensureMap()) return;
    fetchFrames();
    renderJobMarkers();
  }

  function wire() {
    const bind = (id, fn) => { const b = el(id); if (b) b.addEventListener('click', fn); };
    bind('radarPlayPause', () => (playing ? pause() : play()));
    bind('radarPrev', () => { pause(); showFrame(Math.max(0, activeIndex - 1)); });
    bind('radarNext', () => { pause(); showFrame(Math.min(allFrames().length - 1, activeIndex + 1)); });
    bind('radarLatest', () => { pause(); showFrame(latestPastIndex()); });
    bind('radarRefresh', () => { pause(); fetchFrames(); });
    bind('radarReset', resetView);
    bind('radarFullscreen', toggleFullscreen);
    const opacity = el('radarOpacity');
    if (opacity) { opacity.value = LK.db.settings.radar.opacity; opacity.addEventListener('input', e => { LK.db.settings.radar.opacity = parseFloat(e.target.value); LK.saveDB(true); if (radarLayer) radarLayer.setOpacity(LK.db.settings.radar.opacity); }); }
    const speed = el('radarSpeed');
    if (speed) { speed.value = LK.db.settings.radar.animationSpeed; speed.addEventListener('change', e => { LK.db.settings.radar.animationSpeed = e.target.value; LK.saveDB(true); if (playing) { pause(); play(); } }); }
  }

  LK.bus.on('view:weather', () => { if (!map) init(); else renderJobMarkers(); });
  LK.bus.on('nav:changed', (view) => { if (view !== 'weather' && LK.db.settings.radar.autoPauseOutsideWeather) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  document.addEventListener('DOMContentLoaded', wire, { once: true });

  LK.radar = { play, pause, resetView, refresh: fetchFrames, renderJobMarkers };
})();
