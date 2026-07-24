/* ==========================================================================
   LK OS — ambient.js
   Ambient Sound Center. All textures are procedurally synthesized with the
   Web Audio API (filtered/shaped noise + the occasional oscillator) — no
   bundled or downloaded audio files, so there's zero copyright risk and
   nothing to ship. Runs independently from music with its own volume/mute.
   Never autoplays; starts only on explicit user action.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let actx = null;
  let nodes = null; // {source, gain, filter, extra:[]}
  let current = 'none';
  let crackleTimer = null;

  function ensureCtx() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }

  function noiseBuffer(ctx, seconds, type) {
    const len = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (type === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) { const white = Math.random() * 2 - 1; last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; }
    } else {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  const PRESETS = {
    fireplace: (ctx) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 4, 'brown'); src.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 400;
      const gain = ctx.createGain(); gain.gain.value = 1;
      src.connect(filter); filter.connect(gain);
      src.start();
      return { source: src, gain, filter, crackle: true };
    },
    rain: (ctx) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 4, 'white'); src.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 2200; filter.Q.value = 0.6;
      const gain = ctx.createGain(); gain.gain.value = 0.8;
      src.connect(filter); filter.connect(gain);
      src.start();
      return { source: src, gain, filter };
    },
    office: (ctx) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 4, 'brown'); src.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 300;
      const gain = ctx.createGain(); gain.gain.value = 0.5;
      src.connect(filter); filter.connect(gain);
      src.start();
      return { source: src, gain, filter };
    },
    city: (ctx) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 4, 'brown'); src.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 500;
      const gain = ctx.createGain(); gain.gain.value = 0.7;
      src.connect(filter); filter.connect(gain);
      src.start();
      return { source: src, gain, filter };
    },
    workshop: (ctx) => {
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 60;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 220;
      const gain = ctx.createGain(); gain.gain.value = 0.3;
      osc.connect(filter); filter.connect(gain);
      osc.start();
      return { source: osc, gain, filter };
    },
    fan: (ctx) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 4, 'white'); src.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 900; filter.Q.value = 1.2;
      const gain = ctx.createGain(); gain.gain.value = 0.5;
      src.connect(filter); filter.connect(gain);
      src.start();
      return { source: src, gain, filter };
    },
    brown: (ctx) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 4, 'brown'); src.loop = true;
      const gain = ctx.createGain(); gain.gain.value = 1;
      src.connect(gain);
      src.start();
      return { source: src, gain };
    },
  };

  function scheduleCrackle(ctx, out) {
    function pop() {
      if (!nodes || !nodes.crackle) return;
      const dur = 0.02 + Math.random() * 0.02;
      const osc = ctx.createBufferSource();
      osc.buffer = noiseBuffer(ctx, dur, 'white');
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(g); g.connect(out);
      osc.start();
      crackleTimer = setTimeout(pop, 400 + Math.random() * 1800);
    }
    crackleTimer = setTimeout(pop, 500 + Math.random() * 1000);
  }

  function applyVolume() {
    if (!nodes) return;
    const s = LK.db.settings.lounge;
    nodes.gain.gain.value = s.ambientMuted ? 0 : s.ambientVolume;
  }

  function stop() {
    if (crackleTimer) { clearTimeout(crackleTimer); crackleTimer = null; }
    if (nodes) { try { nodes.source.stop(); } catch (e) {} nodes = null; }
    current = 'none';
    render();
  }

  function play(sound) {
    stop();
    if (sound === 'none') { LK.db.settings.lounge.ambientSound = 'none'; LK.saveDB(true); render(); return; }
    const ctx = ensureCtx();
    if (!ctx || !PRESETS[sound]) return;
    nodes = PRESETS[sound](ctx);
    nodes.gain.connect(ctx.destination);
    applyVolume();
    if (nodes.crackle) scheduleCrackle(ctx, nodes.gain);
    current = sound;
    LK.db.settings.lounge.ambientSound = sound;
    LK.saveDB(true);
    render();
  }

  function render() {
    document.querySelectorAll('.ambient-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.sound === current));
  }

  function wire() {
    document.querySelectorAll('.ambient-btn').forEach(btn => btn.addEventListener('click', () => play(btn.dataset.sound)));
    document.getElementById('ambientVolume').value = LK.db.settings.lounge.ambientVolume;
    document.getElementById('ambientVolume').addEventListener('input', e => {
      LK.db.settings.lounge.ambientVolume = parseFloat(e.target.value);
      LK.saveDB(true); applyVolume();
    });
    document.getElementById('ambientMuteBtn').addEventListener('click', () => {
      LK.db.settings.lounge.ambientMuted = !LK.db.settings.lounge.ambientMuted;
      LK.saveDB(true); applyVolume();
      document.getElementById('ambientMuteBtn').classList.toggle('is-muted', LK.db.settings.lounge.ambientMuted);
    });
    render();
  }

  LK.ambient = { play, stop, current: () => current, PRESET_KEYS: Object.keys(PRESETS) };
  document.addEventListener('DOMContentLoaded', () => { document.querySelector('.ambient-btn') && wire(); }, { once: true });
})();
