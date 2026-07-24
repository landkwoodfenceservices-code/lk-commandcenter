/* ==========================================================================
   LK OS — music.js
   Apple Music Center: editable playlist presets that open your saved Apple
   Music links (no direct API integration — that would require Apple's
   MusicKit auth, which this static file can't safely hold), plus a local
   audio player using object URLs (never base64-into-localStorage — files
   must be re-selected after a full browser restart, which we say plainly).
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let audioEl = null;
  let queue = [];
  let queueIndex = -1;
  let shuffle = false;
  let repeat = false; // repeat one
  let currentSource = null; // 'local' | 'preset' | null
  let currentLabel = null;

  function el(id) { return document.getElementById(id); }

  /* ---------------- Apple Music presets ---------------- */
  function renderPresets() {
    const wrap = document.getElementById('musicPresets');
    if (!wrap) return;
    wrap.innerHTML = LK.db.musicPresets.map(p =>
      '<div class="preset-card" data-id="' + p.id + '">' +
        '<div class="preset-top"><span class="preset-name">' + p.label + '</span><button type="button" class="hud-btn tiny preset-edit" data-id="' + p.id + '">EDIT</button></div>' +
        '<div class="preset-meta">' + (p.playlistName || 'No playlist saved') + (p.mood ? ' &middot; ' + p.mood : '') + '</div>' +
        '<button type="button" class="hud-btn preset-play" data-id="' + p.id + '"' + (p.url ? '' : ' disabled') + '>' + (p.url ? '▶ OPEN IN APPLE MUSIC' : 'NO LINK SAVED') + '</button>' +
      '</div>'
    ).join('');
    wrap.querySelectorAll('.preset-play').forEach(btn => btn.addEventListener('click', () => openPreset(btn.dataset.id)));
    wrap.querySelectorAll('.preset-edit').forEach(btn => btn.addEventListener('click', () => openPresetModal(btn.dataset.id)));
  }

  function openPreset(id) {
    const p = LK.db.musicPresets.find(x => x.id === id);
    if (!p || !p.url) return;
    window.open(p.url, '_blank', 'noopener');
    currentSource = 'preset'; currentLabel = p.label + (p.playlistName ? ' — ' + p.playlistName : '');
    LK.bus.emit('music:changed');
    renderNowPlaying();
    LK.bus.emit('notify', { type: 'lounge', text: 'Opened Apple Music: ' + p.label });
  }

  function openPresetModal(id) {
    const p = LK.db.musicPresets.find(x => x.id === id);
    if (!p) return;
    el('mpTitle').textContent = p.label;
    el('mpPlaylistName').value = p.playlistName || '';
    el('mpUrl').value = p.url || '';
    el('mpMood').value = p.mood || '';
    el('mpDuration').value = p.defaultFocusMinutes || 45;
    el('mpNotes').value = p.notes || '';
    el('musicPresetModal').dataset.id = id;
    el('musicPresetModal').classList.add('open');
    el('mpPlaylistName').focus();
  }
  function closePresetModal() { el('musicPresetModal').classList.remove('open'); }
  function savePresetModal() {
    const id = el('musicPresetModal').dataset.id;
    const p = LK.db.musicPresets.find(x => x.id === id);
    if (!p) return;
    p.playlistName = el('mpPlaylistName').value.trim();
    p.url = el('mpUrl').value.trim();
    p.mood = el('mpMood').value.trim();
    p.defaultFocusMinutes = parseInt(el('mpDuration').value) || 45;
    p.notes = el('mpNotes').value.trim();
    LK.saveDB();
    renderPresets();
    LK.bus.emit('notify', { type: 'lounge', text: 'Saved playlist: ' + p.label });
    closePresetModal();
  }

  /* ---------------- local audio player ---------------- */
  function ensureAudioEl() {
    if (audioEl) return audioEl;
    audioEl = new Audio();
    audioEl.addEventListener('ended', () => { if (repeat) { audioEl.currentTime = 0; audioEl.play(); } else next(); });
    audioEl.addEventListener('timeupdate', updateProgress);
    audioEl.addEventListener('play', () => { LK.bus.emit('music:changed'); renderNowPlaying(); });
    audioEl.addEventListener('pause', () => { LK.bus.emit('music:changed'); renderNowPlaying(); });
    return audioEl;
  }

  function loadFiles(fileList) {
    queue = Array.from(fileList).map(f => ({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) }));
    queueIndex = queue.length ? 0 : -1;
    renderQueue();
    if (queueIndex >= 0) playIndex(queueIndex);
  }

  function playIndex(i) {
    if (i < 0 || i >= queue.length) return;
    queueIndex = i;
    const a = ensureAudioEl();
    a.src = queue[i].url;
    a.volume = LK.db.settings.lounge.musicMuted ? 0 : LK.db.settings.lounge.musicVolume;
    a.play().catch(() => {});
    currentSource = 'local'; currentLabel = queue[i].name;
    renderQueue();
    renderNowPlaying();
  }
  function playPause() {
    const a = ensureAudioEl();
    if (!a.src) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }
  function next() {
    if (!queue.length) return;
    let i = shuffle ? Math.floor(Math.random() * queue.length) : queueIndex + 1;
    if (i >= queue.length) i = 0;
    playIndex(i);
  }
  function prev() {
    if (!queue.length) return;
    let i = queueIndex - 1;
    if (i < 0) i = queue.length - 1;
    playIndex(i);
  }
  function stop() {
    if (audioEl) { audioEl.pause(); audioEl.currentTime = 0; }
    currentSource = null; currentLabel = null;
    renderNowPlaying();
    LK.bus.emit('music:changed');
  }
  function setVolume(v) {
    LK.db.settings.lounge.musicVolume = v;
    LK.saveDB(true);
    if (audioEl) audioEl.volume = LK.db.settings.lounge.musicMuted ? 0 : v;
  }
  function seek(pct) {
    if (audioEl && audioEl.duration) audioEl.currentTime = pct * audioEl.duration;
  }

  function updateProgress() {
    const bar = el('musicProgress');
    if (!bar || !audioEl || !audioEl.duration) return;
    bar.value = (audioEl.currentTime / audioEl.duration) * 100;
    const t = el('musicTime');
    if (t) t.textContent = fmtTime(audioEl.currentTime) + ' / ' + fmtTime(audioEl.duration);
  }
  function fmtTime(s) { s = Math.floor(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function renderQueue() {
    const list = el('musicQueue');
    if (!list) return;
    list.innerHTML = queue.length ? queue.map((t, i) =>
      '<div class="queue-row' + (i === queueIndex ? ' active' : '') + '" data-i="' + i + '">' + (i + 1) + '. ' + t.name + '</div>'
    ).join('') : '<div class="log-empty">NO LOCAL FILES SELECTED</div>';
    list.querySelectorAll('.queue-row').forEach(row => row.addEventListener('click', () => playIndex(Number(row.dataset.i))));
  }

  function renderNowPlaying() {
    const el2 = document.getElementById('nowPlaying');
    if (!el2) return;
    if (currentSource === 'local' && audioEl && !audioEl.paused) {
      el2.innerHTML = '<div class="np-title">' + currentLabel + '</div><div class="np-sub">Local file &middot; Playing</div>';
    } else if (currentSource === 'preset') {
      el2.innerHTML = '<div class="np-title">' + currentLabel + '</div><div class="np-sub">Apple Music &middot; opened in a new tab</div>';
    } else {
      el2.innerHTML = '<div class="np-title">Nothing playing</div>';
    }
  }

  function isPlaying() { return !!(audioEl && !audioEl.paused) || currentSource === 'preset'; }

  function wire() {
    el('mpSave').addEventListener('click', savePresetModal);
    el('mpCancel').addEventListener('click', closePresetModal);
    el('musicPresetModal').addEventListener('click', e => { if (e.target.id === 'musicPresetModal') closePresetModal(); });
    el('openAppleMusicBtn').addEventListener('click', () => window.open('https://music.apple.com', '_blank', 'noopener'));

    el('localAudioInput').addEventListener('change', e => { if (e.target.files.length) loadFiles(e.target.files); });
    el('musicPlayPause').addEventListener('click', playPause);
    el('musicNext').addEventListener('click', next);
    el('musicPrev').addEventListener('click', prev);
    el('musicStop').addEventListener('click', stop);
    el('musicShuffle').addEventListener('click', () => { shuffle = !shuffle; el('musicShuffle').classList.toggle('active', shuffle); });
    el('musicRepeat').addEventListener('click', () => { repeat = !repeat; el('musicRepeat').classList.toggle('active', repeat); });
    el('musicVolume').value = LK.db.settings.lounge.musicVolume;
    el('musicVolume').addEventListener('input', e => setVolume(parseFloat(e.target.value)));
    el('musicProgress').addEventListener('input', e => seek(parseFloat(e.target.value) / 100));
    el('musicMuteBtn').addEventListener('click', () => {
      LK.db.settings.lounge.musicMuted = !LK.db.settings.lounge.musicMuted;
      LK.saveDB(true);
      if (audioEl) audioEl.volume = LK.db.settings.lounge.musicMuted ? 0 : LK.db.settings.lounge.musicVolume;
      el('musicMuteBtn').classList.toggle('is-muted', LK.db.settings.lounge.musicMuted);
    });

    renderPresets();
    renderQueue();
    renderNowPlaying();
  }

  LK.music = { isPlaying, stop, renderPresets, playPreset: openPreset };
  document.addEventListener('DOMContentLoaded', () => { document.getElementById('musicPresets') && wire(); }, { once: true });
})();
