/* ==========================================================================
   LK OS — device.js
   Compact device status: real battery (navigator.getBattery when supported,
   otherwise an honest "BATTERY N/A" — never a fabricated number), online/
   offline, focus/music status glyphs, and a low-power mode that dims
   non-essential motion/audio without ever interrupting unsaved work.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let battery = null; // BatteryManager, if supported
  let lowPowerActive = false;
  let lastLowBatteryNotify = 0;

  function fmtMinutes(sec) {
    if (sec == null || sec === Infinity || isNaN(sec)) return null;
    const m = Math.round(sec / 60);
    if (m < 60) return m + 'm';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }

  function render() {
    const el = document.getElementById('deviceStatus');
    if (!el) return;
    const s = LK.db.settings.device;
    const parts = [];

    if (s.showBattery) {
      if (battery) {
        const pct = Math.round(battery.level * 100);
        const charging = battery.charging;
        let txt = pct + '%' + (charging ? ' ⚡' : '');
        parts.push('<span class="dev-chip' + (!charging && pct <= s.lowBatteryThreshold ? ' warn' : '') + '" id="devBattery">' + txt + '</span>');
      } else {
        parts.push('<span class="dev-chip dim" id="devBattery">BATTERY N/A</span>');
      }
    }
    if (s.showConnection) {
      parts.push('<span class="dev-chip ' + (navigator.onLine ? 'good' : 'warn') + '">' + (navigator.onLine ? 'ONLINE' : 'OFFLINE') + '</span>');
    }
    const focusActive = LK.focus && LK.focus.isActive && LK.focus.isActive();
    if (focusActive) parts.push('<span class="dev-chip good">FOCUS</span>');
    const musicPlaying = LK.music && LK.music.isPlaying && LK.music.isPlaying();
    if (musicPlaying) parts.push('<span class="dev-chip good">♪ PLAYING</span>');

    el.innerHTML = parts.join('');
  }

  function checkLowPower() {
    if (!battery) return;
    const s = LK.db.settings.device;
    const pct = Math.round(battery.level * 100);
    const low = !battery.charging && pct <= s.lowBatteryThreshold;
    if (low && !lowPowerActive) {
      lowPowerActive = true;
      document.body.classList.toggle('low-power', s.autoLowPower);
      const now = Date.now();
      if (now - lastLowBatteryNotify > 10 * 60 * 1000) {
        lastLowBatteryNotify = now;
        LK.bus.emit('notify', { type: 'device', text: 'Battery at ' + pct + '% — consider plugging in.' });
        if (s.batteryVoiceAlert) LK.audio.speak('Battery is getting low. You may want to plug in.', { context: 'alerts' });
      }
    } else if (!low && lowPowerActive) {
      lowPowerActive = false;
      document.body.classList.remove('low-power');
    }
  }

  async function initBattery() {
    if (!('getBattery' in navigator)) { render(); return; }
    try {
      battery = await navigator.getBattery();
      ['levelchange', 'chargingchange', 'dischargingtimechange', 'chargingtimechange'].forEach(evt => {
        battery.addEventListener(evt, () => { render(); checkLowPower(); });
      });
      render(); checkLowPower();
    } catch (e) {
      battery = null;
      render();
    }
  }

  function wire() {
    window.addEventListener('online', () => { render(); LK.bus.emit('notify', { type: 'device', text: 'Connection restored.' }); });
    window.addEventListener('offline', () => { render(); LK.bus.emit('notify', { type: 'device', text: 'You are offline. Everything except weather still works.' }); });
    initBattery();
    render();
    LK.bus.on('db:changed', render);
    LK.bus.on('focus:changed', render);
    LK.bus.on('music:changed', render);
    setInterval(render, 30000);
  }

  LK.device = { render, isLowPower: () => lowPowerActive };
  document.addEventListener('DOMContentLoaded', wire, { once: true });
})();
