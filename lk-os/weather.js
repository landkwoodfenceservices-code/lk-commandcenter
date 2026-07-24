/* ==========================================================================
   LK OS — weather.js
   Open-Meteo powered weather: current + hourly + daily, heat index, and a
   plain-language construction recommendation. Renders both the compact
   Overview widget and the full Weather Center view. The only feature in
   this app that requires network.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  const LAT = 29.7604, LON = -95.3698;

  const WX_CODES = {
    0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime Fog',
    51: 'Light Drizzle', 53: 'Drizzle', 55: 'Dense Drizzle',
    56: 'Freezing Drizzle', 57: 'Freezing Drizzle',
    61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
    66: 'Freezing Rain', 67: 'Freezing Rain',
    71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains',
    80: 'Light Showers', 81: 'Showers', 82: 'Violent Showers',
    85: 'Snow Showers', 86: 'Snow Showers',
    95: 'Thunderstorm', 96: 'Thunderstorm w/ Hail', 99: 'Severe Thunderstorm',
  };
  const RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
  const STORM_CODES = [95, 96, 99];

  function heatIndexF(tempF, rh) {
    if (tempF < 80) return tempF;
    const T = tempF, R = rh;
    return -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R
      - 0.00683783 * T * T - 0.05481717 * R * R + 0.00122874 * T * T * R
      + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
  }

  function recommendation(code, tempF, windMph, hi, rainProbNext6h) {
    if (STORM_CODES.includes(code)) return { text: 'Lightning risk — hold outdoor crews.', cls: 'warn' };
    if (rainProbNext6h >= 50 || RAIN_CODES.includes(code)) return { text: 'Delay staining & pressure washing — rain expected.', cls: 'warn' };
    if (hi >= 105) return { text: 'Extreme heat index — early start, mandatory water breaks.', cls: 'warn' };
    if (windMph >= 25) return { text: 'High wind — postpone gate & panel lifting work.', cls: 'warn' };
    return { text: 'Excellent fence installation & staining conditions.', cls: 'good' };
  }

  LK.weather = { data: null };

  async function fetchAll() {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + LAT + '&longitude=' + LON
      + '&current=temperature_2m,weather_code,wind_speed_10m,precipitation,relative_humidity_2m'
      + '&hourly=temperature_2m,precipitation_probability,wind_speed_10m,uv_index,weather_code'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
      + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago&forecast_days=7';
    const res = await fetch(url);
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    const c = data.current;
    const temp = Math.round(c.temperature_2m);
    const rh = c.relative_humidity_2m;
    const hi = Math.round(heatIndexF(temp, rh));

    // next 6 hours starting at current hour
    const nowIso = data.current.time;
    const idx0 = data.hourly.time.indexOf(nowIso) >= 0 ? data.hourly.time.indexOf(nowIso) : 0;
    const hourly = [];
    for (let i = idx0; i < Math.min(idx0 + 10, data.hourly.time.length); i++) {
      hourly.push({
        time: data.hourly.time[i],
        temp: Math.round(data.hourly.temperature_2m[i]),
        pop: data.hourly.precipitation_probability[i],
        wind: Math.round(data.hourly.wind_speed_10m[i]),
        uv: data.hourly.uv_index[i],
        code: data.hourly.weather_code[i],
      });
    }
    const rainProbNext6h = Math.max(0, ...hourly.slice(0, 6).map(h => h.pop));
    const rec = recommendation(c.weather_code, temp, c.wind_speed_10m, hi, rainProbNext6h);

    const daily = data.daily.time.map((d, i) => ({
      date: d,
      code: data.daily.weather_code[i],
      hi: Math.round(data.daily.temperature_2m_max[i]),
      lo: Math.round(data.daily.temperature_2m_min[i]),
      pop: data.daily.precipitation_probability_max[i],
    }));

    LK.weather.data = {
      temp, cond: WX_CODES[c.weather_code] || 'Unknown', code: c.weather_code,
      wind: Math.round(c.wind_speed_10m), humidity: rh, heatIndex: hi,
      uv: hourly[0] ? hourly[0].uv : 0,
      rainProbNext6h, recommendation: rec, hourly, daily,
      ok: true,
    };

    if (rainProbNext6h >= 60) {
      LK.bus.emit('notify', { type: 'weather', text: 'Rain likely in the next 6 hours (' + rainProbNext6h + '%). Plan around outdoor work.' });
    }
    LK.bus.emit('weather:updated', LK.weather.data);
    return LK.weather.data;
  }

  async function refresh() {
    try {
      await fetchAll();
    } catch (e) {
      LK.weather.data = { ok: false };
      LK.bus.emit('weather:updated', LK.weather.data);
    }
  }

  LK.weather.refresh = refresh;
  LK.weather.codeText = (code) => WX_CODES[code] || 'Unknown';

  /* ---------------- v2.3 — transparent weather risk engine ----------------
     GOOD / CAUTION / POOR / DELAY RECOMMENDED, computed from already-fetched
     Open-Meteo data + configurable thresholds in settings.radar.thresholds.
     No new network calls, no guarantees, never labels normal weather severe. */
  function assessRisk(dateIso, hourIndex) {
    const d = LK.weather.data;
    if (!d || !d.ok) return null;
    const t = d.settings || LK.db.settings.radar.thresholds;
    const hour = (hourIndex != null && d.hourly[hourIndex]) ? d.hourly[hourIndex] : d.hourly[0];
    const rainProb = hour ? hour.pop : d.rainProbNext6h;
    const wind = hour ? hour.wind : d.wind;
    const isStorm = STORM_CODES.includes(hour ? hour.code : d.code);
    const reasons = [];
    let level = 'GOOD';

    if (isStorm) { level = 'DELAY RECOMMENDED'; reasons.push('thunderstorm conditions in the forecast'); }
    else if (rainProb >= t.rainProbability + 20) { level = 'DELAY RECOMMENDED'; reasons.push('rain probability is very high (' + rainProb + '%)'); }
    else if (rainProb >= t.rainProbability) { level = 'POOR'; reasons.push('rain probability is elevated (' + rainProb + '%)'); }
    else if (wind >= t.gustMph) { level = 'POOR'; reasons.push('wind gusts may affect panel/gate installation (' + wind + ' mph)'); }
    else if (wind >= t.windMph) { level = 'CAUTION'; reasons.push('wind is picking up (' + wind + ' mph)'); }
    else if (d.heatIndex >= t.heatIndex) { level = level === 'GOOD' ? 'CAUTION' : level; reasons.push('heat index is high (' + d.heatIndex + '°F) — water breaks recommended'); }
    else if (d.temp <= t.coldF) { level = level === 'GOOD' ? 'CAUTION' : level; reasons.push('temperature is near freezing (' + d.temp + '°F)'); }

    if (!reasons.length) reasons.push('conditions look favorable for outdoor work');
    return {
      level, reason: reasons.join('; '),
      factors: { rainProb, wind, heatIndex: d.heatIndex, temp: d.temp, isStorm },
      formula: 'Storm → DELAY. Rain ≥ ' + t.rainProbability + '%+20 → DELAY, ≥' + t.rainProbability + '% → POOR. Wind ≥ ' + t.gustMph + 'mph → POOR, ≥' + t.windMph + 'mph → CAUTION. Heat ≥ ' + t.heatIndex + '°F or cold ≤ ' + t.coldF + '°F → CAUTION.',
    };
  }
  LK.weather.assessRisk = assessRisk;

  // Day-level variant for jobs beyond the ~10hr hourly window — uses the
  // 7-day daily forecast (hi/lo/pop/code) instead. Returns null beyond the
  // 7-day forecast horizon rather than guessing.
  function assessRiskForDate(dateIso) {
    const d = LK.weather.data;
    if (!d || !d.ok) return null;
    const day = d.daily.find(x => x.date === dateIso);
    if (!day) return null;
    const t = LK.db.settings.radar.thresholds;
    const isStorm = STORM_CODES.includes(day.code);
    const reasons = [];
    let level = 'GOOD';
    if (isStorm) { level = 'DELAY RECOMMENDED'; reasons.push('thunderstorm conditions forecast'); }
    else if (day.pop >= t.rainProbability + 20) { level = 'DELAY RECOMMENDED'; reasons.push('rain probability is very high (' + day.pop + '%)'); }
    else if (day.pop >= t.rainProbability) { level = 'POOR'; reasons.push('rain probability is elevated (' + day.pop + '%)'); }
    else if (day.hi >= t.heatIndex) { level = 'CAUTION'; reasons.push('forecast high of ' + day.hi + '°F meets the heat threshold (actual heat index may run higher with humidity)'); }
    else if (day.lo <= t.coldF) { level = 'CAUTION'; reasons.push('low near ' + day.lo + '°F — cold risk'); }
    if (!reasons.length) reasons.push('conditions look favorable for outdoor work');
    return { level, reason: reasons.join('; '), factors: { rainProb: day.pop, hi: day.hi, lo: day.lo, isStorm } };
  }
  LK.weather.assessRiskForDate = assessRiskForDate;

  /* ---------------- rendering ---------------- */
  function hourLabel(iso) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric' });
  }
  function dayLabel(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
  }

  function renderCompact() {
    const el = document.getElementById('wxCompact');
    if (!el) return;
    const d = LK.weather.data;
    if (!d || !d.ok) {
      el.innerHTML = '<div class="wx-temp">--&deg;</div><div class="wx-cond">Unavailable offline</div><div class="wx-note warn">NO CONNECTION — CHECK NETWORK</div>';
      document.getElementById('wxStatus').textContent = 'OFFLINE';
      document.getElementById('wxDot').style.setProperty('--c', 'var(--amber)');
      return;
    }
    el.innerHTML =
      '<div class="wx-temp">' + d.temp + '&deg;F</div>' +
      '<div class="wx-cond">' + d.cond + '</div>' +
      '<div class="wx-note ' + d.recommendation.cls + '">' + d.recommendation.text.toUpperCase() + '</div>';
    document.getElementById('wxStatus').textContent = 'LIVE';
    document.getElementById('wxDot').style.setProperty('--c', d.recommendation.cls === 'warn' ? 'var(--amber)' : 'var(--good)');
  }

  function renderCenter() {
    const el = document.getElementById('wxCenterBody');
    if (!el) return;
    const d = LK.weather.data;
    if (!d || !d.ok) { el.innerHTML = '<div class="wx-note warn">NO CONNECTION — CHECK NETWORK</div>'; return; }

    const hourlyStrip = d.hourly.map(h =>
      '<div class="wx-hour">' +
        '<div class="wx-hour-t">' + hourLabel(h.time) + '</div>' +
        '<div class="wx-hour-temp">' + h.temp + '&deg;</div>' +
        '<div class="wx-hour-pop">' + h.pop + '%</div>' +
        '<div class="wx-hour-wind">' + h.wind + 'mph</div>' +
      '</div>'
    ).join('');

    const dailyStrip = d.daily.map(day =>
      '<div class="wx-day">' +
        '<div class="wx-day-name">' + dayLabel(day.date) + '</div>' +
        '<div class="wx-day-temp">' + day.hi + '&deg;/' + day.lo + '&deg;</div>' +
        '<div class="wx-day-pop">' + day.pop + '% rain</div>' +
      '</div>'
    ).join('');

    el.innerHTML =
      '<div class="wx-center-top">' +
        '<div class="wx-center-temp">' + d.temp + '&deg;F</div>' +
        '<div class="wx-center-cond">' + d.cond + '</div>' +
        '<div class="wx-stat-row">' +
          '<div class="wx-stat"><label>WIND</label><span>' + d.wind + ' mph</span></div>' +
          '<div class="wx-stat"><label>HUMIDITY</label><span>' + d.humidity + '%</span></div>' +
          '<div class="wx-stat"><label>HEAT INDEX</label><span>' + d.heatIndex + '&deg;F</span></div>' +
          '<div class="wx-stat"><label>UV INDEX</label><span>' + d.uv.toFixed(1) + '</span></div>' +
          '<div class="wx-stat"><label>RAIN (6H)</label><span>' + d.rainProbNext6h + '%</span></div>' +
        '</div>' +
        '<div class="wx-note ' + d.recommendation.cls + '">' + d.recommendation.text.toUpperCase() + '</div>' +
      '</div>' +
      '<div class="panel-title" style="margin-top:16px">Hourly Forecast</div>' +
      '<div class="wx-hourly">' + hourlyStrip + '</div>' +
      '<div class="panel-title" style="margin-top:16px">7-Day Outlook</div>' +
      '<div class="wx-daily">' + dailyStrip + '</div>';
  }

  /* ---------------- v2.3 — Weather Impact panel ----------------
     Real upcoming outdoor jobs/appointments only, cross-referenced against
     the day-level risk assessment. Never auto-sends a message or reschedules
     — every action here is a confirm-first jump into the relevant screen. */
  function recommendedAction(level) {
    return { GOOD: 'No action needed', CAUTION: 'Monitor conditions', POOR: 'Consider a possible-delay heads-up', 'DELAY RECOMMENDED': 'Strongly consider rescheduling' }[level] || '—';
  }
  function renderWeatherImpact() {
    const wrap = document.getElementById('weatherImpactBody');
    if (!wrap) return;
    const todayIso = LK.todayISO();
    const horizon = LK.addDays(todayIso, 7);
    const upcoming = LK.db.events
      .filter(e => e.date >= todayIso && e.date <= horizon && !e.completed)
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

    if (!upcoming.length) { wrap.innerHTML = '<div class="log-empty">NO UPCOMING APPOINTMENTS IN THE NEXT 7 DAYS</div>'; return; }

    wrap.innerHTML = upcoming.map(e => {
      const c = e.customerId ? LK.getCustomer(e.customerId) : null;
      const job = e.jobId ? LK.getJob(e.jobId) : null;
      const crew = e.crewId ? LK.getCrew(e.crewId) : null;
      const risk = LK.weather.assessRiskForDate ? LK.weather.assessRiskForDate(e.date) : null;
      const riskCls = !risk ? 'neutral' : risk.level === 'GOOD' ? 'good' : risk.level === 'CAUTION' ? 'warn' : 'warn';
      return '<div class="panel" style="margin-bottom:10px"><span class="br"></span>' +
        '<div class="kc-top"><span class="kc-name">' + (c ? c.name : e.title) + '</span><span class="kc-value">' + LK.fmtDate(e.date) + ' ' + e.startTime + '</span></div>' +
        '<div class="kc-row">' + (job ? job.service : e.type) + (e.address ? ' · ' + e.address : '') + (crew ? ' · ' + crew.name : '') + '</div>' +
        '<div class="wx-note ' + riskCls + '">' + (risk ? risk.level + ' — ' + risk.reason : 'Forecast not available yet for this date') + '</div>' +
        (risk ? '<div class="mic-status">Recommended: ' + recommendedAction(risk.level) + '</div>' : '') +
        '<div class="panel-actions">' +
          (e.customerId ? '<button type="button" class="hud-btn tiny wx-msg" data-id="' + e.id + '" data-key="confirmDespiteWeather">CONFIRM JOB</button>' : '') +
          (e.customerId && risk && (risk.level === 'CAUTION' || risk.level === 'POOR') ? '<button type="button" class="hud-btn tiny wx-msg" data-id="' + e.id + '" data-key="possibleWeatherDelay">SEND POSSIBLE-DELAY</button>' : '') +
          (e.customerId && risk && risk.level === 'POOR' ? '<button type="button" class="hud-btn tiny wx-msg" data-id="' + e.id + '" data-key="tpl-rain-delay">SEND RAIN DELAY</button>' : '') +
          (e.customerId && risk && risk.level === 'DELAY RECOMMENDED' ? '<button type="button" class="hud-btn tiny wx-msg" data-id="' + e.id + '" data-key="severeWeatherReschedule">SEND RESCHEDULE</button>' : '') +
        '</div>' +
        '<div class="panel-actions" id="wxImpactActions-' + e.id + '"></div>' +
      '</div>';
    }).join('');

    upcoming.forEach(e => {
      const container = document.getElementById('wxImpactActions-' + e.id);
      if (container && LK.context) LK.context.renderButtons(container, e.customerId, e.jobId, { only: ['text', 'call', 'viewJob', 'objective'] });
    });
    wrap.querySelectorAll('.wx-msg').forEach(btn => btn.addEventListener('click', () => {
      const e = upcoming.find(x => x.id === btn.dataset.id);
      if (!e || !e.customerId || !LK.messages) return;
      const key = btn.dataset.key;
      // 'tpl-rain-delay' is a v2.2 template id (not in QUICK_TEMPLATE_MAP under a short key) — handle directly.
      if (key === 'tpl-rain-delay') { LK.nav.go('messages'); LK.messages.selectCustomer(e.customerId); LK.bus.emit('template:selected', 'tpl-rain-delay'); }
      else LK.messages.quickAction(key, e.customerId);
    }));
  }
  LK.weather.renderWeatherImpact = renderWeatherImpact;

  LK.bus.on('weather:updated', () => { renderCompact(); renderCenter(); renderWeatherImpact(); });
  LK.bus.on('db:changed', renderWeatherImpact);
  LK.bus.on('view:weather', renderWeatherImpact);
  LK.weather.renderCompact = renderCompact;
  LK.weather.renderCenter = renderCenter;

  refresh();
  setInterval(refresh, 10 * 60 * 1000);
})();
