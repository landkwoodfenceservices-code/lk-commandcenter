/* ==========================================================================
   LK OS — audio.js
   Web Audio synth blips, SpeechSynthesis (assistant voice), SpeechRecognition
   (mic input for voice commands), and the single mute switch everything
   else respects. Exposes window.LK.audio.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  const MUTE_KEY = 'lk_muted'; // legacy key, migrated into LK.db.settings.muted below

  let muted = LK.db.settings.muted === true || (LK.db.settings.muted === undefined && localStorage.getItem(MUTE_KEY) === '1');

  function setMuted(v) {
    muted = v;
    LK.db.settings.muted = v;
    LK.saveDB(true);
    if (muted && 'speechSynthesis' in window) speechSynthesis.cancel();
    LK.bus.emit('audio:muted', muted);
  }

  /* ---------------- Web Audio blips ---------------- */
  let actx = null;
  function ensureAudio() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
  }
  document.addEventListener('pointerdown', ensureAudio, { once: true });
  document.addEventListener('keydown', ensureAudio, { once: true });

  function blip(freqStart, freqEnd, dur, gainPeak) {
    if (muted || !actx || actx.state !== 'running') return;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, actx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), actx.currentTime + dur);
    gain.gain.setValueAtTime(0.0001, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(gainPeak, actx.currentTime + dur * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    osc.connect(gain); gain.connect(actx.destination);
    osc.start(); osc.stop(actx.currentTime + dur + 0.02);
  }
  const hoverBlip = () => blip(700, 1000, 0.05, 0.05);
  const clickBlip = () => blip(520, 260, 0.08, 0.09);
  const chimeBlip = () => { blip(660, 880, 0.09, 0.06); setTimeout(() => blip(880, 1180, 0.09, 0.05), 90); };

  const SND_SEL = '.module, .reactor, button, input[type="checkbox"], .lk-tab, .kanban-card';
  let hoverTarget = null;
  document.addEventListener('mouseover', e => {
    const el = e.target.closest(SND_SEL);
    if (el && el !== hoverTarget) { hoverTarget = el; hoverBlip(); }
  });
  document.addEventListener('mouseout', e => {
    const el = e.target.closest(SND_SEL);
    if (el && el === hoverTarget && (!e.relatedTarget || !el.contains(e.relatedTarget))) hoverTarget = null;
  });
  document.addEventListener('click', e => {
    if (e.target.closest(SND_SEL)) clickBlip();
  });

  /* ---------------- speech synthesis (assistant voice) ---------------- */
  // Prefer a calm, natural system voice over the flat default when one is available,
  // unless the user picked a specific one in Settings (settings.voice.voiceName).
  let availableVoices = [];
  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    availableVoices = speechSynthesis.getVoices();
    if (!availableVoices.length) return null;
    const chosenName = LK.db.settings.voice.voiceName;
    if (chosenName) {
      const chosen = availableVoices.find(v => v.name === chosenName);
      if (chosen) return chosen;
    }
    const preferred = ['Samantha', 'Google US English', 'Microsoft Aria Online (Natural) - English (United States)', 'Karen'];
    for (const name of preferred) {
      const v = availableVoices.find(v => v.name === name);
      if (v) return v;
    }
    return availableVoices.find(v => v.lang === 'en-US') || availableVoices[0];
  }
  let cachedVoice = null;
  if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = () => { cachedVoice = pickVoice(); LK.bus.emit('audio:voices', availableVoices); };
    cachedVoice = pickVoice();
  }

  const PERSONALITY_DELIVERY = {
    professional: { rateMul: 1, pitchMul: 1 },
    calm: { rateMul: 0.88, pitchMul: 0.95 },
    motivational: { rateMul: 1.08, pitchMul: 1.04 },
    minimal: { rateMul: 1.02, pitchMul: 1 },
    cinematic: { rateMul: 0.85, pitchMul: 0.9 },
  };

  function speak(text, opts) {
    const vs = LK.db.settings.voice;
    opts = opts || {};
    if (muted || !vs.enabled || !('speechSynthesis' in window) || !text) return;
    // manual is always allowed (Test Voice, Read Daily Briefing); any other
    // context must be explicitly enabled in Settings > Voice
    if (opts.context && opts.context !== 'manual' && vs.allowedContexts && vs.allowedContexts[opts.context] === false) return;
    cachedVoice = pickVoice() || cachedVoice;
    const delivery = PERSONALITY_DELIVERY[vs.personality] || PERSONALITY_DELIVERY.professional;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = opts.rate || ((vs.rate || 0.98) * delivery.rateMul);
    utter.pitch = opts.pitch || ((vs.pitch || 0.92) * delivery.pitchMul);
    utter.volume = opts.volume != null ? opts.volume : (vs.volume != null ? vs.volume : 1);
    if (cachedVoice) utter.voice = cachedVoice;
    try {
      if (!opts.queue) speechSynthesis.cancel();
      speechSynthesis.speak(utter);
    } catch (e) {}
  }
  function listVoices() { return availableVoices.length ? availableVoices : (('speechSynthesis' in window) ? speechSynthesis.getVoices() : []); }

  /* ---------------- speech recognition (voice commands) ----------------
     One recognition session per tap, started only from a direct user click
     (assistant.js's mic button handler). continuous=false + interimResults
     =false so we only ever get one final result per session — no partial
     guesses. A single module-level `listening` flag blocks a second session
     from starting while one is already running; a watchdog timeout stops a
     session that never fires onend (seen on some browsers after a long
     silence). `userCancelled` distinguishes "user tapped stop" from a real
     no-speech timeout so the caller doesn't show a misleading error after a
     deliberate cancel. */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let listening = false;
  let userCancelled = false;
  const LISTEN_TIMEOUT_MS = 10000;

  function isListening() { return listening; }

  function listenOnce(handlers) {
    handlers = handlers || {};
    const { onStart, onResult, onNoSpeech, onError, onEnd } = handlers;
    if (!SR) { onError && onError('unsupported'); return false; }
    if (listening) { onError && onError('already-listening'); return false; }
    ensureAudio();

    let gotResult = false;
    let watchdog = null;

    try {
      recognizer = new SR();
      recognizer.lang = 'en-US';
      recognizer.interimResults = false;
      recognizer.continuous = false;
      recognizer.maxAlternatives = 1;
      userCancelled = false;

      recognizer.onstart = () => { listening = true; onStart && onStart(); };

      recognizer.onresult = (e) => {
        gotResult = true;
        const result = e.results && e.results[0] && e.results[0][0];
        const transcript = result ? String(result.transcript).trim().replace(/\s+/g, ' ') : '';
        if (transcript) onResult && onResult(transcript);
        else onNoSpeech && onNoSpeech();
      };

      recognizer.onerror = (e) => {
        gotResult = true; // suppress the redundant no-speech fallback in onend
        onError && onError((e && e.error) || 'unknown');
      };

      recognizer.onend = () => {
        clearTimeout(watchdog);
        listening = false;
        if (!gotResult && !userCancelled) onNoSpeech && onNoSpeech();
        onEnd && onEnd();
      };

      recognizer.start();
      watchdog = setTimeout(() => { try { recognizer && recognizer.stop(); } catch (e) {} }, LISTEN_TIMEOUT_MS);
      return true;
    } catch (e) {
      listening = false;
      onError && onError('start-failed');
      return false;
    }
  }

  function stopListening() {
    userCancelled = true;
    try { recognizer && recognizer.stop(); } catch (e) {}
  }

  LK.audio = {
    isMuted: () => muted,
    setMuted,
    toggleMuted: () => setMuted(!muted),
    hoverBlip, clickBlip, chimeBlip,
    speak, listVoices,
    listenOnce, stopListening, isListening,
    voiceSupported: !!SR,
  };
})();
