/* ==========================================================================
   LK OS — ideas.js  (v2.3)
   Idea Vault: a private idea backlog with search/filter/sort and actions
   that turn an idea into a real Mission Log task, calendar event, Decision
   Room entry, or Primary Objective. potentialIncome/estimatedCost here are
   projections for planning only — analytics.js never reads LK.db.ideas, so
   these numbers can never leak into real revenue/profit figures.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  const CATEGORIES = ['L&K Operations', 'Marketing', 'Content', 'AI Automation', 'New Services', 'Real Estate', 'Personal', 'Other'];
  const STATUSES = ['Raw Idea', 'Researching', 'Testing', 'Active', 'Paused', 'Completed', 'Rejected'];
  let filterCat = '', filterStatus = '', sortBy = 'newest', showArchived = false;

  function el(id) { return document.getElementById(id); }

  function list() {
    const q = (el('ideaSearch').value || '').toLowerCase().trim();
    let items = LK.db.ideas.filter(i => showArchived || !i.archived);
    if (q) items = items.filter(i => i.title.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q));
    if (filterCat) items = items.filter(i => i.category === filterCat);
    if (filterStatus) items = items.filter(i => i.status === filterStatus);
    if (sortBy === 'income') items.sort((a, b) => (b.potentialIncome || 0) - (a.potentialIncome || 0));
    else if (sortBy === 'cost') items.sort((a, b) => (a.estimatedCost || 0) - (b.estimatedCost || 0));
    else items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return items;
  }

  function render() {
    const grid = el('ideaGrid');
    const items = list();
    grid.innerHTML = items.length ? items.map(i =>
      '<div class="panel idea-card" data-id="' + i.id + '"><span class="br"></span>' +
        '<div class="m-top"><span class="m-id">' + i.category + '</span><span class="status-pill status-' + statusClass(i.status) + '">' + i.status + '</span></div>' +
        '<div class="panel-title">' + i.title + '</div>' +
        '<div class="cust-review-text">' + (i.description || '') + '</div>' +
        '<div class="cust-line"><span>Potential income</span><span>' + LK.fmtMoney(i.potentialIncome) + '</span></div>' +
        '<div class="cust-line"><span>Est. cost</span><span>' + LK.fmtMoney(i.estimatedCost) + '</span></div>' +
        '<div class="cust-line"><span>Difficulty</span><span>' + (i.difficulty || '—') + '</span></div>' +
        '<div class="cust-line"><span>Next action</span><span>' + (i.nextAction || '—') + '</span></div>' +
        (i.progressPct ? '<div class="cust-sub-title" style="margin-top:6px">Progress — ' + i.progressPct + '%</div><div class="m-bar" style="background:rgba(63,216,255,.12)"><i style="width:' + i.progressPct + '%; animation:none; position:static; display:block; height:100%"></i></div>' : '') +
        '<div class="panel-actions">' +
          '<button type="button" class="hud-btn tiny idea-edit" data-id="' + i.id + '">EDIT</button>' +
          '<button type="button" class="hud-btn tiny idea-task" data-id="' + i.id + '">TURN INTO TASK</button>' +
          '<button type="button" class="hud-btn tiny idea-dup" data-id="' + i.id + '">DUPLICATE</button>' +
          '<button type="button" class="hud-btn tiny idea-arch" data-id="' + i.id + '">' + (i.archived ? 'UNARCHIVE' : 'ARCHIVE') + '</button>' +
          '<button type="button" class="hud-btn tiny idea-del" data-id="' + i.id + '" style="border-color:var(--danger); color:var(--danger)">DELETE</button>' +
        '</div>' +
      '</div>'
    ).join('') : '<div class="log-empty">NO IDEAS YET</div>';

    grid.querySelectorAll('.idea-edit').forEach(b => b.addEventListener('click', () => openModal(b.dataset.id)));
    grid.querySelectorAll('.idea-task').forEach(b => b.addEventListener('click', () => turnIntoTask(b.dataset.id)));
    grid.querySelectorAll('.idea-dup').forEach(b => b.addEventListener('click', () => duplicate(b.dataset.id)));
    grid.querySelectorAll('.idea-arch').forEach(b => b.addEventListener('click', () => toggleArchive(b.dataset.id)));
    grid.querySelectorAll('.idea-del').forEach(b => b.addEventListener('click', () => remove(b.dataset.id)));
  }
  function statusClass(s) { return { 'Active': 'active', 'Completed': 'active', 'Rejected': 'inactive', 'Paused': 'lead' }[s] || 'lead'; }

  function openModal(id) {
    const i = id ? LK.db.ideas.find(x => x.id === id) : null;
    el('ideaModalTitle').textContent = i ? 'Edit Idea' : 'New Idea';
    el('ideaName').value = i ? i.title : '';
    el('ideaCategory').innerHTML = CATEGORIES.map(c => '<option' + (i && i.category === c ? ' selected' : '') + '>' + c + '</option>').join('');
    el('ideaDesc').value = i ? i.description : '';
    el('ideaIncome').value = i ? i.potentialIncome : '';
    el('ideaCost').value = i ? i.estimatedCost : '';
    el('ideaDifficulty').value = i ? (i.difficulty || 'Medium') : 'Medium';
    el('ideaHorizon').value = i ? (i.timeHorizon || '') : '';
    el('ideaNextAction').value = i ? (i.nextAction || '') : '';
    el('ideaProgress').value = i ? (i.progressPct || 0) : 0;
    el('ideaStatus').innerHTML = STATUSES.map(s => '<option' + (i && i.status === s ? ' selected' : '') + '>' + s + '</option>').join('');
    el('ideaNotes').value = i ? (i.notes || '') : '';
    el('ideaModal').dataset.id = id || '';
    el('ideaModal').classList.add('open');
    el('ideaName').focus();
  }
  function closeModal() { el('ideaModal').classList.remove('open'); }
  function save() {
    const title = el('ideaName').value.trim();
    if (!title) { el('ideaName').focus(); return; }
    const id = el('ideaModal').dataset.id;
    let i = id ? LK.db.ideas.find(x => x.id === id) : null;
    if (!i) { i = { id: LK.uid(), archived: false, createdAt: LK.todayISO() }; LK.db.ideas.push(i); }
    i.title = title;
    i.category = el('ideaCategory').value;
    i.description = el('ideaDesc').value.trim();
    i.potentialIncome = parseFloat(el('ideaIncome').value) || 0;
    i.estimatedCost = parseFloat(el('ideaCost').value) || 0;
    i.difficulty = el('ideaDifficulty').value;
    i.timeHorizon = el('ideaHorizon').value.trim();
    i.nextAction = el('ideaNextAction').value.trim();
    i.progressPct = Math.max(0, Math.min(100, parseInt(el('ideaProgress').value) || 0));
    i.status = el('ideaStatus').value;
    i.notes = el('ideaNotes').value.trim();
    LK.saveDB(); render();
    LK.bus.emit('notify', { type: 'lounge', text: 'Idea saved: ' + title });
    closeModal();
  }
  function duplicate(id) {
    const i = LK.db.ideas.find(x => x.id === id);
    if (!i) return;
    const copy = Object.assign({}, i, { id: LK.uid(), title: i.title + ' (copy)', createdAt: LK.todayISO() });
    LK.db.ideas.push(copy); LK.saveDB(); render();
  }
  function toggleArchive(id) {
    const i = LK.db.ideas.find(x => x.id === id);
    if (!i) return;
    i.archived = !i.archived; LK.saveDB(); render();
  }
  function remove(id) {
    if (!confirm('Delete this idea?')) return;
    LK.db.ideas = LK.db.ideas.filter(x => x.id !== id);
    LK.saveDB(); render();
  }
  function turnIntoTask(id) {
    const i = LK.db.ideas.find(x => x.id === id);
    if (!i) return;
    const choice = prompt('Turn into: type "task" for Mission Log, "event" for Calendar, "decision" for Decision Room, or "objective" for Primary Objective', 'task');
    if (!choice) return;
    const c = choice.toLowerCase();
    if (c.startsWith('task')) {
      LK.db.tasks.push({ id: LK.uid(), text: i.title, done: false, due: LK.todayISO() });
      LK.bus.emit('notify', { type: 'lounge', text: 'Added to Mission Log: ' + i.title });
    } else if (c.startsWith('event')) {
      LK.db.events.push({ id: LK.uid(), title: i.title, type: 'Personal', date: LK.todayISO(), startTime: '09:00', endTime: '09:30', customerId: null, jobId: null, crewId: null, address: '', notes: i.description, reminder: false, completed: false });
      LK.bus.emit('notify', { type: 'lounge', text: 'Added to Calendar: ' + i.title });
    } else if (c.startsWith('dec')) {
      LK.db.decisions.push({
        id: LK.uid(), title: i.title, description: i.description, deadline: null, notes: 'Converted from an idea (' + i.category + ').',
        customerId: null, jobId: null, crewId: null, leadSource: '', equipment: '', campaign: '',
        options: [{ name: 'Pursue', cost: i.estimatedCost || 0, return: i.potentialIncome || 0, time: 0, risk: 3, effort: 3, longterm: 3, personal: 3, upside: '', downside: '' }, { name: 'Skip', cost: 0, return: 0, time: 0, risk: 1, effort: 1, longterm: 1, personal: 1, upside: '', downside: '' }],
        weights: { profit: 3, speed: 2, risk: 2, effort: 1, longterm: 2, personal: 1 }, archived: false, createdAt: LK.todayISO(),
      });
      LK.bus.emit('notify', { type: 'lounge', text: 'Sent to Decision Room: ' + i.title });
    } else {
      LK.db.primaryObjective = { type: 'idea', refId: i.id, text: i.title, setAt: LK.nowISO(), manuallyPinned: true };
      LK.bus.emit('notify', { type: 'lounge', text: 'Primary Objective set: ' + i.title });
      LK.bus.emit('objective:changed');
    }
    LK.saveDB();
  }

  function wire() {
    el('ideaSearch').addEventListener('input', render);
    el('ideaFilterCat').innerHTML = '<option value="">All categories</option>' + CATEGORIES.map(c => '<option>' + c + '</option>').join('');
    el('ideaFilterCat').addEventListener('change', e => { filterCat = e.target.value; render(); });
    el('ideaFilterStatus').innerHTML = '<option value="">All statuses</option>' + STATUSES.map(s => '<option>' + s + '</option>').join('');
    el('ideaFilterStatus').addEventListener('change', e => { filterStatus = e.target.value; render(); });
    el('ideaSort').addEventListener('change', e => { sortBy = e.target.value; render(); });
    el('ideaShowArchived').addEventListener('click', () => { showArchived = !showArchived; render(); });
    el('ideaNewBtn').addEventListener('click', () => openModal(null));
    el('ideaSave').addEventListener('click', save);
    el('ideaCancel').addEventListener('click', closeModal);
    el('ideaModal').addEventListener('click', e => { if (e.target.id === 'ideaModal') closeModal(); });
    render();
    LK.bus.on('db:changed', render);
  }

  LK.ideas = { render };
  document.addEventListener('DOMContentLoaded', () => { document.getElementById('ideaGrid') && wire(); }, { once: true });
})();
