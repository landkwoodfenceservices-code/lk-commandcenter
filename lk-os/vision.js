/* ==========================================================================
   LK OS — vision.js  (v2.3)
   The Vision Center: a private, calm space — vision board, goal categories/
   cards, scripture panel, daily encouragement, mission statement, core
   values, gratitude journal, success timeline, and a compact reminder
   widget on Overview. Deliberately quieter than the command/Lounge themes.
   Photos live in IndexedDB via visionstore.js; LK.db.visionGoals only ever
   stores the small metadata + an image id reference.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let currentSub = 'board';
  let scriptureIndex = 0;
  let encouragementQueue = [];

  const ENCOURAGEMENT = [
    { cat: 'Leadership', text: 'A good leader clears the path before asking others to walk it.' },
    { cat: 'Leadership', text: 'People remember how you treated them long after they forget what you said.' },
    { cat: 'Discipline', text: 'Discipline is choosing what you want most over what you want right now.' },
    { cat: 'Discipline', text: 'Small, consistent effort compounds faster than any single burst of motivation.' },
    { cat: 'Perseverance', text: 'The job that felt impossible in January is just Tuesday by June.' },
    { cat: 'Perseverance', text: 'Every finished project was, at some point, an unfinished one someone didn\'t quit on.' },
    { cat: 'Business Wisdom', text: 'Price for the value you deliver, not the hours it took you to get fast at it.' },
    { cat: 'Business Wisdom', text: 'A business built on referrals is a business built on kept promises.' },
    { cat: 'Integrity', text: 'Do the job the same way whether or not the customer is watching.' },
    { cat: 'Integrity', text: 'Your word is the only warranty that costs you nothing and means everything.' },
    { cat: 'Gratitude', text: 'The first customer is easy to remember — try to remember them all.' },
    { cat: 'Gratitude', text: 'A slow week is still a week you get to run your own company.' },
    { cat: 'Courage', text: 'The estimate you\'re afraid to send is usually the one worth sending.' },
    { cat: 'Courage', text: 'Growth lives just past the point where it would\'ve been easier to stay small.' },
    { cat: 'Excellence', text: 'Nobody hires the cheapest fence — they hire the one still standing in ten years.' },
    { cat: 'Excellence', text: 'Excellence is a hundred small decisions nobody will ever see.' },
    { cat: 'Faith-Based', text: 'Plan the work, then trust the outcome to something bigger than the spreadsheet.' },
    { cat: 'Faith-Based', text: 'Rest is not the opposite of ambition — it\'s part of the plan.' },
  ];

  function el(id) { return document.getElementById(id); }

  /* ---------------- sub-nav ---------------- */
  function showSub(key) {
    document.querySelectorAll('.vision-sub').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.vision-subtab').forEach(t => t.classList.toggle('active', t.dataset.sub === key));
    const target = document.querySelector('.vision-sub[data-sub="' + key + '"]');
    if (target) target.classList.add('active');
    currentSub = key;
    renderSub(key);
  }
  function renderSub(key) {
    if (key === 'board') renderBoard();
    else if (key === 'scripture') renderScripture();
    else if (key === 'encouragement') renderEncouragement();
    else if (key === 'mission') renderMission();
    else if (key === 'values') renderValues();
    else if (key === 'gratitude') renderGratitude();
    else if (key === 'timeline') renderTimeline();
  }

  /* ---------------- Vision Board + Goal Cards ---------------- */
  function allCategories() { return LK.VISION_CATEGORIES_BUILTIN.concat(LK.db.visionCategories.map(c => c.name)); }

  function renderBoard() {
    const wrap = el('visionBoardBody');
    if (!wrap) return;
    const filterCat = el('vbFilterCat') ? el('vbFilterCat').value : '';
    const showArchived = el('vbShowArchived') ? el('vbShowArchived').classList.contains('active') : false;
    let goals = LK.db.visionGoals.filter(g => showArchived || !g.archived);
    if (filterCat) goals = goals.filter(g => g.category === filterCat);
    const active = goals.filter(g => (g.completionPct || 0) < 100);
    const completed = goals.filter(g => (g.completionPct || 0) >= 100);

    if (el('vbFilterCat')) el('vbFilterCat').innerHTML = '<option value="">All categories</option>' + allCategories().map(c => '<option' + (c === filterCat ? ' selected' : '') + '>' + c + '</option>').join('');

    wrap.innerHTML =
      '<div class="vision-grid">' + active.map(goalCardHtml).join('') + '</div>' +
      (completed.length ? '<div class="vision-sub-title">Completed Goals</div><div class="vision-grid">' + completed.map(goalCardHtml).join('') : '') + (completed.length ? '</div>' : '');

    wrap.querySelectorAll('.vgoal-edit').forEach(b => b.addEventListener('click', () => openGoalModal(b.dataset.id)));
    wrap.querySelectorAll('.vgoal-pin').forEach(b => b.addEventListener('click', () => togglePin(b.dataset.id)));
    wrap.querySelectorAll('.vgoal-archive').forEach(b => b.addEventListener('click', () => toggleArchiveGoal(b.dataset.id)));
    wrap.querySelectorAll('.vgoal-del').forEach(b => b.addEventListener('click', () => deleteGoal(b.dataset.id)));

    // resolve photo thumbnails asynchronously (IndexedDB) without blocking render
    active.concat(completed).forEach(g => {
      if (!g.imageId || !LK.visionStore) return;
      LK.visionStore.getImageURL(g.imageId).then(url => {
        const img = wrap.querySelector('.vgoal-photo[data-id="' + g.id + '"]');
        if (img && url) img.style.backgroundImage = 'url(' + url + ')';
      }).catch(() => {});
    });
  }
  function goalCardHtml(g) {
    return '<div class="panel vision-card"><span class="br"></span>' +
      '<div class="vgoal-photo" data-id="' + g.id + '"></div>' +
      '<div class="m-top"><span class="m-id">' + g.category + '</span>' + (g.pinned ? '<span>★</span>' : '') + '</div>' +
      '<div class="panel-title">' + g.title + '</div>' +
      (g.description ? '<div class="cust-review-text">' + escapeHtml(g.description) + '</div>' : '') +
      (g.why ? '<div class="cust-line"><span>Why it matters</span><span>' + escapeHtml(g.why) + '</span></div>' : '') +
      (g.targetDate ? '<div class="cust-line"><span>Target</span><span>' + LK.fmtDate(g.targetDate) + '</span></div>' : '') +
      (g.estimatedCost ? '<div class="cust-line"><span>Est. cost</span><span>' + LK.fmtMoney(g.estimatedCost) + '</span></div>' : '') +
      '<div class="cust-sub-title">' + (g.completionPct || 0) + '% complete</div>' +
      '<div class="m-bar" style="background:rgba(255,184,112,.12)"><i style="width:' + (g.completionPct || 0) + '%; animation:none; position:static; display:block; height:100%"></i></div>' +
      '<div class="panel-actions">' +
        '<button type="button" class="hud-btn tiny vgoal-edit" data-id="' + g.id + '">EDIT</button>' +
        '<button type="button" class="hud-btn tiny vgoal-pin" data-id="' + g.id + '">' + (g.pinned ? 'UNPIN' : 'PIN') + '</button>' +
        '<button type="button" class="hud-btn tiny vgoal-archive" data-id="' + g.id + '">' + (g.archived ? 'UNARCHIVE' : 'ARCHIVE') + '</button>' +
        '<button type="button" class="hud-btn tiny vgoal-del" data-id="' + g.id + '" style="border-color:var(--danger); color:var(--danger)">DELETE</button>' +
      '</div></div>';
  }
  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  let pendingImageFile = null;
  function openGoalModal(id) {
    const g = id ? LK.db.visionGoals.find(x => x.id === id) : null;
    pendingImageFile = null;
    el('vgTitle').value = g ? g.title : '';
    el('vgCategory').innerHTML = allCategories().map(c => '<option' + (g && g.category === c ? ' selected' : '') + '>' + c + '</option>').join('');
    el('vgDesc').value = g ? (g.description || '') : '';
    el('vgTargetDate').value = g ? (g.targetDate || '') : '';
    el('vgPriority').value = g ? (g.priority || 'Medium') : 'Medium';
    el('vgCost').value = g ? (g.estimatedCost || '') : '';
    el('vgProgress').value = g ? (g.completionPct || 0) : 0;
    el('vgWhy').value = g ? (g.why || '') : '';
    el('vgRelatedObjective').value = g ? (g.relatedObjective || '') : '';
    el('vgCustomer').innerHTML = '<option value="">— none —</option>' + LK.db.customers.map(c => '<option value="' + c.id + '"' + (g && g.relatedCustomerId === c.id ? ' selected' : '') + '>' + c.name + '</option>').join('');
    el('vgNotes').value = g ? (g.notes || '') : '';
    el('visionGoalModal').dataset.id = id || '';
    el('visionGoalModal').classList.add('open');
  }
  function closeGoalModal() { el('visionGoalModal').classList.remove('open'); }
  async function saveGoalModal() {
    const title = el('vgTitle').value.trim();
    if (!title) { el('vgTitle').focus(); return; }
    const id = el('visionGoalModal').dataset.id;
    let g = id ? LK.db.visionGoals.find(x => x.id === id) : null;
    if (!g) { g = { id: LK.uid(), pinned: false, archived: false, createdAt: LK.todayISO() }; LK.db.visionGoals.push(g); }
    g.title = title;
    g.category = el('vgCategory').value;
    g.description = el('vgDesc').value.trim();
    g.targetDate = el('vgTargetDate').value || null;
    g.priority = el('vgPriority').value;
    g.estimatedCost = parseFloat(el('vgCost').value) || 0;
    g.completionPct = Math.max(0, Math.min(100, parseInt(el('vgProgress').value) || 0));
    g.why = el('vgWhy').value.trim();
    g.relatedObjective = el('vgRelatedObjective').value.trim();
    g.relatedCustomerId = el('vgCustomer').value || null;
    g.notes = el('vgNotes').value.trim();
    if (pendingImageFile && LK.visionStore && LK.visionStore.isSupported()) {
      const imgId = g.imageId || LK.uid();
      try { await LK.visionStore.putImage(imgId, pendingImageFile); g.imageId = imgId; } catch (e) {}
    }
    LK.saveDB();
    renderBoard();
    LK.bus.emit('notify', { type: 'vision', text: 'Vision goal saved: ' + title });
    closeGoalModal();
  }
  function togglePin(id) { const g = LK.db.visionGoals.find(x => x.id === id); if (g) { g.pinned = !g.pinned; LK.saveDB(); renderBoard(); } }
  function toggleArchiveGoal(id) { const g = LK.db.visionGoals.find(x => x.id === id); if (g) { g.archived = !g.archived; LK.saveDB(); renderBoard(); } }
  function deleteGoal(id) {
    if (!confirm('Delete this vision goal? This cannot be undone.')) return;
    const g = LK.db.visionGoals.find(x => x.id === id);
    if (g && g.imageId && LK.visionStore) LK.visionStore.deleteImage(g.imageId).catch(() => {});
    LK.db.visionGoals = LK.db.visionGoals.filter(x => x.id !== id);
    LK.saveDB(); renderBoard();
  }

  /* ---------------- Scripture Panel ---------------- */
  function dayIndex(len) { const d = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000); return d % len; }
  function renderScripture() {
    const wrap = el('scriptureBody');
    if (!wrap) return;
    const verse = LK.SCRIPTURE_KJV[scriptureIndex];
    const isFav = LK.db.scriptureFavorites.some(f => f.reference === verse.ref && !f.custom);
    wrap.innerHTML =
      '<div class="vision-quote">"' + verse.text + '"<span>— ' + verse.ref + '</span></div>' +
      '<div class="panel-actions" style="justify-content:center">' +
        '<button type="button" class="hud-btn tiny" id="scPrev">◀ PREV</button>' +
        '<button type="button" class="hud-btn tiny" id="scRandom">RANDOM</button>' +
        '<button type="button" class="hud-btn tiny" id="scNext">NEXT ▶</button>' +
        '<button type="button" class="hud-btn tiny" id="scFav">' + (isFav ? '★ FAVORITED' : '☆ FAVORITE') + '</button>' +
        '<button type="button" class="hud-btn tiny" id="scCopy">COPY</button>' +
      '</div>' +
      '<div class="cust-sub-title">Your Favorites &amp; Notes</div>' +
      (LK.db.scriptureFavorites.length ? LK.db.scriptureFavorites.map(f => '<div class="cust-line"><span>' + f.reference + (f.custom ? ' (custom)' : '') + '</span><span>' + (f.note ? f.note : '') + '</span></div>').join('') : '<div class="log-empty">NO FAVORITES YET</div>') +
      '<div class="est-form" style="margin-top:10px">' +
        '<div class="qte-field full"><label>ADD YOUR OWN VERSE (REFERENCE)</label><input type="text" id="scCustomRef" class="hud-input" placeholder="e.g. Psalm 91:1"></div>' +
        '<div class="qte-field full"><label>TEXT</label><input type="text" id="scCustomText" class="hud-input"></div>' +
      '</div>' +
      '<div class="panel-actions"><button type="button" class="hud-btn tiny" id="scAddCustom">ADD MY VERSE</button></div>';

    el('scPrev').addEventListener('click', () => { scriptureIndex = (scriptureIndex - 1 + LK.SCRIPTURE_KJV.length) % LK.SCRIPTURE_KJV.length; renderScripture(); });
    el('scNext').addEventListener('click', () => { scriptureIndex = (scriptureIndex + 1) % LK.SCRIPTURE_KJV.length; renderScripture(); });
    el('scRandom').addEventListener('click', () => { scriptureIndex = Math.floor(Math.random() * LK.SCRIPTURE_KJV.length); renderScripture(); });
    el('scFav').addEventListener('click', () => {
      if (isFav) { LK.db.scriptureFavorites = LK.db.scriptureFavorites.filter(f => !(f.reference === verse.ref && !f.custom)); }
      else { LK.db.scriptureFavorites.push({ id: LK.uid(), reference: verse.ref, text: verse.text, note: '', custom: false, favorited: true, addedAt: LK.nowISO() }); }
      LK.saveDB(); renderScripture();
    });
    el('scCopy').addEventListener('click', () => { navigator.clipboard?.writeText('"' + verse.text + '" — ' + verse.ref).then(() => LK.bus.emit('notify', { type: 'vision', text: 'Verse copied.' })); });
    el('scAddCustom').addEventListener('click', () => {
      const ref = el('scCustomRef').value.trim(), text = el('scCustomText').value.trim();
      if (!ref || !text) return;
      LK.db.scriptureFavorites.push({ id: LK.uid(), reference: ref, text, note: '', custom: true, favorited: true, addedAt: LK.nowISO() });
      LK.saveDB(); renderScripture();
    });
  }

  /* ---------------- Daily Encouragement (non-repeating rotation) ---------------- */
  function nextEncouragement() {
    const enabledCats = LK.db.settings.vision.encouragementCategories || ENCOURAGEMENT.map(e => e.cat);
    const pool = ENCOURAGEMENT.filter(e => enabledCats.includes(e.cat));
    if (!pool.length) return null;
    if (!encouragementQueue.length) encouragementQueue = pool.slice().sort(() => Math.random() - 0.5);
    return encouragementQueue.shift();
  }
  function renderEncouragement() {
    const wrap = el('encouragementBody');
    if (!wrap) return;
    const allCats = [...new Set(ENCOURAGEMENT.map(e => e.cat))];
    const enabled = LK.db.settings.vision.encouragementCategories || allCats;
    wrap.innerHTML =
      '<div id="encCard" class="vision-quote"></div>' +
      '<div class="panel-actions" style="justify-content:center"><button type="button" class="hud-btn tiny" id="encNext">NEXT ENCOURAGEMENT</button></div>' +
      '<div class="cust-sub-title">Categories</div>' +
      '<div class="est-form">' + allCats.map(c => '<div class="qte-field"><label><input type="checkbox" class="enc-cat-toggle" data-cat="' + c + '" ' + (enabled.includes(c) ? 'checked' : '') + '> ' + c.toUpperCase() + '</label></div>').join('') + '</div>';
    showNextEncouragement();
    el('encNext').addEventListener('click', showNextEncouragement);
    wrap.querySelectorAll('.enc-cat-toggle').forEach(cb => cb.addEventListener('change', () => {
      const checked = Array.from(wrap.querySelectorAll('.enc-cat-toggle:checked')).map(c => c.dataset.cat);
      LK.db.settings.vision.encouragementCategories = checked;
      LK.saveDB(true);
      encouragementQueue = [];
    }));
  }
  function showNextEncouragement() {
    const card = el('encCard');
    if (!card) return;
    const e = nextEncouragement();
    card.innerHTML = e ? '"' + e.text + '"<span>' + e.cat + '</span>' : 'No categories enabled.';
  }

  /* ---------------- Mission Statement (autosave) ---------------- */
  let missionSaveTimer = null;
  function renderMission() {
    const wrap = el('missionBody');
    if (!wrap) return;
    wrap.innerHTML = '<textarea id="missionText" class="hud-input" rows="10" placeholder="Why I built this company. What success means to me. My family\'s future. The legacy I want to leave. My core values...">' + escapeHtml(LK.db.missionStatement) + '</textarea><div class="mic-status" id="missionSaveStatus">Autosaves as you type.</div>';
    el('missionText').addEventListener('input', () => {
      el('missionSaveStatus').textContent = 'Saving…';
      clearTimeout(missionSaveTimer);
      missionSaveTimer = setTimeout(() => {
        LK.db.missionStatement = el('missionText').value;
        LK.saveDB(true);
        el('missionSaveStatus').textContent = 'Saved.';
      }, 600);
    });
  }

  /* ---------------- Core Values ---------------- */
  function renderValues() {
    const wrap = el('valuesBody');
    if (!wrap) return;
    const values = LK.db.coreValues.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    wrap.innerHTML =
      values.map((v, i) => '<div class="cust-line" data-id="' + v.id + '"><span>' + (v.pinned ? '★ ' : '') + v.name + (v.description ? ' — ' + escapeHtml(v.description) : '') + '</span>' +
        '<span><button type="button" class="hud-btn tiny cv-pin" data-id="' + v.id + '">' + (v.pinned ? 'UNPIN' : 'PIN') + '</button> <button type="button" class="hud-btn tiny cv-up" data-id="' + v.id + '"' + (i === 0 ? ' disabled' : '') + '>↑</button> <button type="button" class="hud-btn tiny cv-down" data-id="' + v.id + '"' + (i === values.length - 1 ? ' disabled' : '') + '>↓</button> <button type="button" class="hud-btn tiny cv-del" data-id="' + v.id + '" style="border-color:var(--danger); color:var(--danger)">DEL</button></span></div>').join('') +
      (values.length ? '' : '<div class="log-empty">NO CORE VALUES YET</div>') +
      '<div class="est-form" style="margin-top:10px"><div class="qte-field full"><label>NEW VALUE</label><input type="text" id="cvNewName" class="hud-input" placeholder="Faith, Integrity, Excellence..."></div></div>' +
      '<div class="panel-actions"><button type="button" class="hud-btn tiny" id="cvAdd">ADD VALUE</button></div>';
    wrap.querySelectorAll('.cv-pin').forEach(b => b.addEventListener('click', () => { const v = LK.db.coreValues.find(x => x.id === b.dataset.id); if (v) { v.pinned = !v.pinned; LK.saveDB(); renderValues(); } }));
    wrap.querySelectorAll('.cv-del').forEach(b => b.addEventListener('click', () => { LK.db.coreValues = LK.db.coreValues.filter(x => x.id !== b.dataset.id); LK.saveDB(); renderValues(); }));
    wrap.querySelectorAll('.cv-up').forEach(b => b.addEventListener('click', () => reorderValue(b.dataset.id, -1)));
    wrap.querySelectorAll('.cv-down').forEach(b => b.addEventListener('click', () => reorderValue(b.dataset.id, 1)));
    el('cvAdd').addEventListener('click', () => {
      const name = el('cvNewName').value.trim();
      if (!name) return;
      LK.db.coreValues.push({ id: LK.uid(), name, description: '', pinned: false, order: LK.db.coreValues.length });
      LK.saveDB(); renderValues();
    });
  }
  function reorderValue(id, dir) {
    const values = LK.db.coreValues.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = values.findIndex(v => v.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= values.length) return;
    const a = values[idx], b = values[swapIdx];
    const tmp = a.order; a.order = b.order; b.order = tmp;
    LK.saveDB(); renderValues();
  }

  /* ---------------- Gratitude Journal ---------------- */
  function renderGratitude() {
    const wrap = el('gratitudeBody');
    if (!wrap) return;
    const today = LK.todayISO();
    const existing = LK.db.gratitudeEntries.find(g => g.date === today) || {};
    wrap.innerHTML =
      '<div class="est-form">' +
        '<div class="qte-field full"><label>GRATEFUL #1</label><input type="text" id="grat1" class="hud-input" value="' + escapeHtml(existing.grateful1 || '') + '"></div>' +
        '<div class="qte-field full"><label>GRATEFUL #2</label><input type="text" id="grat2" class="hud-input" value="' + escapeHtml(existing.grateful2 || '') + '"></div>' +
        '<div class="qte-field full"><label>GRATEFUL #3</label><input type="text" id="grat3" class="hud-input" value="' + escapeHtml(existing.grateful3 || '') + '"></div>' +
        '<div class="qte-field full"><label>BIGGEST BLESSING TODAY</label><input type="text" id="gratBlessing" class="hud-input" value="' + escapeHtml(existing.biggestBlessing || '') + '"></div>' +
        '<div class="qte-field full"><label>BIGGEST LESSON TODAY</label><input type="text" id="gratLesson" class="hud-input" value="' + escapeHtml(existing.biggestLesson || '') + '"></div>' +
      '</div><div class="panel-actions"><button type="button" class="hud-btn" id="gratSave">SAVE TODAY\'S ENTRY</button></div>' +
      '<div class="cust-sub-title">Search Previous Entries</div>' +
      '<input type="text" id="gratSearch" class="hud-input" placeholder="Search by date or text..." style="margin-bottom:8px">' +
      '<div id="gratList"></div>';
    el('gratSave').addEventListener('click', () => {
      let g = LK.db.gratitudeEntries.find(x => x.date === today);
      if (!g) { g = { id: LK.uid(), date: today }; LK.db.gratitudeEntries.push(g); }
      g.grateful1 = el('grat1').value.trim(); g.grateful2 = el('grat2').value.trim(); g.grateful3 = el('grat3').value.trim();
      g.biggestBlessing = el('gratBlessing').value.trim(); g.biggestLesson = el('gratLesson').value.trim();
      LK.saveDB();
      LK.bus.emit('notify', { type: 'vision', text: 'Gratitude entry saved.' });
      renderGratList();
    });
    el('gratSearch').addEventListener('input', renderGratList);
    renderGratList();
  }
  function renderGratList() {
    const list = el('gratList');
    if (!list) return;
    const q = (el('gratSearch') ? el('gratSearch').value : '').toLowerCase().trim();
    let entries = LK.db.gratitudeEntries.slice().sort((a, b) => b.date.localeCompare(a.date));
    if (q) entries = entries.filter(g => g.date.includes(q) || [g.grateful1, g.grateful2, g.grateful3, g.biggestBlessing, g.biggestLesson].join(' ').toLowerCase().includes(q));
    list.innerHTML = entries.length ? entries.slice(0, 30).map(g => '<div class="cust-line"><span>' + LK.fmtDate(g.date) + '</span><span>' + escapeHtml(g.biggestBlessing || g.grateful1 || '') + '</span></div>').join('') : '<div class="log-empty">NO ENTRIES YET</div>';
  }

  /* ---------------- Success Timeline ---------------- */
  function renderTimeline() {
    const wrap = el('timelineBody');
    if (!wrap) return;
    const items = LK.db.successMilestones.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    wrap.innerHTML =
      '<div class="timeline">' + (items.length ? items.map(m => '<div class="timeline-row"><span class="timeline-dot"></span><div><div><b>' + escapeHtml(m.title) + '</b>' + (m.date ? ' — ' + LK.fmtDate(m.date) : '') + '</div>' + (m.notes ? '<div class="notif-time">' + escapeHtml(m.notes) + '</div>' : '') + '<button type="button" class="hud-btn tiny tl-del" data-id="' + m.id + '" style="margin-top:4px;border-color:var(--danger);color:var(--danger)">DELETE</button></div></div>').join('') : '<div class="log-empty">NO MILESTONES YET</div>') + '</div>' +
      '<div class="est-form" style="margin-top:12px">' +
        '<div class="qte-field full"><label>MILESTONE</label><input type="text" id="tlTitle" class="hud-input" placeholder="First customer, first $10,000 month..."></div>' +
        '<div class="qte-field"><label>DATE</label><input type="date" id="tlDate" class="hud-input"></div>' +
        '<div class="qte-field full"><label>NOTES</label><input type="text" id="tlNotes" class="hud-input"></div>' +
      '</div><div class="panel-actions"><button type="button" class="hud-btn tiny" id="tlAdd">ADD MILESTONE</button></div>';
    wrap.querySelectorAll('.tl-del').forEach(b => b.addEventListener('click', () => { LK.db.successMilestones = LK.db.successMilestones.filter(x => x.id !== b.dataset.id); LK.saveDB(); renderTimeline(); }));
    el('tlAdd').addEventListener('click', () => {
      const title = el('tlTitle').value.trim();
      if (!title) return;
      LK.db.successMilestones.push({ id: LK.uid(), title, date: el('tlDate').value || LK.todayISO(), notes: el('tlNotes').value.trim(), imageId: null, category: '' });
      LK.saveDB(); renderTimeline();
    });
  }

  /* ---------------- Overview Vision Reminder Widget ---------------- */
  function renderReminderWidget() {
    const wrap = document.getElementById('visionReminderWidget');
    if (!wrap) return;
    if (!LK.db.settings.vision.showVisionReminder) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    const po = LK.db.primaryObjective;
    const pinned = LK.db.visionGoals.find(g => g.pinned && !g.archived) || LK.db.visionGoals.find(g => !g.archived);
    const verse = LK.SCRIPTURE_KJV[dayIndex(LK.SCRIPTURE_KJV.length)];
    wrap.innerHTML =
      '<div class="panel-title" style="font-size:11px">TODAY\'S FOCUS</div>' +
      '<div class="vision-widget-row"><b>' + (po ? po.text : 'No Primary Objective set') + '</b></div>' +
      (pinned ? '<div class="vision-widget-row">Long-term: ' + pinned.title + '</div>' : '') +
      (LK.db.settings.vision.showDailyScripture ? '<div class="vision-widget-quote">"' + verse.text.slice(0, 90) + (verse.text.length > 90 ? '…' : '') + '" — ' + verse.ref + '</div>' : '') +
      '<button type="button" class="hud-btn tiny" id="visionWidgetOpen">OPEN VISION CENTER</button>';
    const btn = document.getElementById('visionWidgetOpen');
    if (btn) btn.addEventListener('click', () => LK.nav.go('vision'));
  }

  function wire() {
    document.querySelectorAll('.vision-subtab').forEach(tab => tab.addEventListener('click', () => showSub(tab.dataset.sub)));
    el('visionReturnBtn') && el('visionReturnBtn').addEventListener('click', () => LK.nav.go('overview'));
    el('vbNewGoal') && el('vbNewGoal').addEventListener('click', () => openGoalModal(null));
    el('vbFilterCat') && el('vbFilterCat').addEventListener('change', renderBoard);
    el('vbShowArchived') && el('vbShowArchived').addEventListener('click', (e) => { e.target.classList.toggle('active'); renderBoard(); });
    el('vgSave') && el('vgSave').addEventListener('click', saveGoalModal);
    el('vgCancel') && el('vgCancel').addEventListener('click', closeGoalModal);
    el('visionGoalModal') && el('visionGoalModal').addEventListener('click', e => { if (e.target.id === 'visionGoalModal') closeGoalModal(); });
    el('vgPhoto') && el('vgPhoto').addEventListener('change', e => { pendingImageFile = e.target.files[0] || null; });
    el('vcNewCategory') && el('vcNewCategory').addEventListener('click', () => {
      const name = prompt('New category name:');
      if (name && name.trim()) { LK.db.visionCategories.push({ id: LK.uid(), name: name.trim() }); LK.saveDB(); renderBoard(); }
    });
    renderReminderWidget();
    LK.bus.on('db:changed', () => { renderSub(currentSub); renderReminderWidget(); });
  }

  LK.vision = { showSub, renderReminderWidget };
  LK.bus.on('view:vision', () => showSub(LK.db.settings.vision.defaultLayout || 'board'));
  document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('visionBoardBody')) wire(); else renderReminderWidget(); }, { once: true });
})();
