/* ==========================================================================
   LK OS — decisions.js
   Decision Room: weighted scoring across options, with the formula and
   every component score shown — never a black-box "recommendation."
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let selectedId = null;
  let showArchived = false;

  function el(id) { return document.getElementById(id); }

  function scoreOption(opt, options, weights) {
    const nets = options.map(o => (Number(o.return) || 0) - (Number(o.cost) || 0));
    const times = options.map(o => Number(o.time) || 0);
    const net = (Number(opt.return) || 0) - (Number(opt.cost) || 0);
    const minNet = Math.min(...nets), maxNet = Math.max(...nets);
    const minT = Math.min(...times), maxT = Math.max(...times);
    const profit = maxNet === minNet ? 2.5 : 5 * (net - minNet) / (maxNet - minNet);
    const speed = maxT === minT ? 2.5 : 5 * (maxT - Number(opt.time || 0)) / (maxT - minT);
    const risk = 6 - (Number(opt.risk) || 3);
    const effort = 6 - (Number(opt.effort) || 3);
    const longterm = Number(opt.longterm) || 3;
    const personal = Number(opt.personal) || 3;
    const w = weights;
    const sumW = (w.profit + w.speed + w.risk + w.effort + w.longterm + w.personal) || 1;
    const total = (profit * w.profit + speed * w.speed + risk * w.risk + effort * w.effort + longterm * w.longterm + personal * w.personal) / sumW;
    return { profit, speed, risk, effort, longterm, personal, net, total };
  }

  function renderList() {
    const list = el('decisionList');
    const items = LK.db.decisions.filter(d => showArchived || !d.archived);
    list.innerHTML = items.length ? items.map(d =>
      '<div class="cust-row' + (d.id === selectedId ? ' active' : '') + '" data-id="' + d.id + '">' +
        '<div class="cust-row-name">' + d.title + (d.archived ? ' <span class="status-pill">ARCHIVED</span>' : '') + '</div>' +
        '<div class="cust-row-sub">' + d.options.length + ' options' + (d.deadline ? ' &middot; due ' + LK.fmtDate(d.deadline) : '') + '</div>' +
      '</div>'
    ).join('') : '<div class="log-empty">NO DECISIONS YET</div>';
    list.querySelectorAll('.cust-row').forEach(row => row.addEventListener('click', () => { selectedId = row.dataset.id; renderList(); renderDetail(); }));
  }

  function renderDetail() {
    const wrap = el('decisionDetail');
    const d = selectedId ? LK.db.decisions.find(x => x.id === selectedId) : null;
    if (!d) { wrap.innerHTML = '<div class="log-empty">SELECT A DECISION, OR ADD ONE</div>'; return; }
    const scored = d.options.map(o => ({ opt: o, s: scoreOption(o, d.options, d.weights) })).sort((a, b) => b.s.total - a.s.total);

    const topOption = scored[0];
    wrap.innerHTML =
      '<div class="cust-detail-top"><div class="panel-title">' + d.title + '</div>' +
      '<div class="panel-actions"><button type="button" class="hud-btn tiny" id="decEditBtn">EDIT</button><button type="button" class="hud-btn tiny" id="decDupBtn">DUPLICATE</button><button type="button" class="hud-btn tiny" id="decArchBtn">' + (d.archived ? 'UNARCHIVE' : 'ARCHIVE') + '</button><button type="button" class="hud-btn tiny" id="decDelBtn" style="border-color:var(--danger); color:var(--danger)">DELETE</button></div></div>' +
      '<div class="cust-contact">' + (d.description || '') + '</div>' +
      (d.customerId || d.jobId || d.leadSource || d.equipment || d.campaign ? '<div class="cust-contact">Linked: ' + [d.customerId && (LK.getCustomer(d.customerId) || {}).name, d.jobId && (LK.getJob(d.jobId) || {}).service, d.leadSource, d.equipment, d.campaign].filter(Boolean).join(' · ') + '</div>' : '') +
      '<div class="panel-actions">' +
        '<button type="button" class="hud-btn tiny" id="decToTask">TASK</button>' +
        '<button type="button" class="hud-btn tiny" id="decToEvent">CALENDAR EVENT</button>' +
        '<button type="button" class="hud-btn tiny" id="decToObjective">PRIMARY OBJECTIVE</button>' +
      '</div>' +
      '<div class="wx-note neutral">FORMULA: Σ(criterion score × weight) ÷ Σ(weights) — scores are relative to the options you entered, not absolute truth.</div>' +
      '<div class="panel-title" style="margin-top:12px">Ranked Options</div>' +
      scored.map(({ opt, s }, i) => (
        '<div class="decision-opt' + (i === 0 ? ' top' : '') + '">' +
          '<div class="kc-top"><span class="kc-name">' + (i === 0 ? '★ ' : '') + opt.name + '</span><span class="kc-value">' + s.total.toFixed(2) + '</span></div>' +
          '<div class="kc-row">Net: ' + LK.fmtMoney(s.net) + ' &middot; ' + opt.time + 'h &middot; Risk ' + opt.risk + '/5</div>' +
          '<div class="score-breakdown">' +
            '<span>Profit ' + s.profit.toFixed(1) + '</span><span>Speed ' + s.speed.toFixed(1) + '</span><span>Risk ' + s.risk.toFixed(1) + '</span>' +
            '<span>Effort ' + s.effort.toFixed(1) + '</span><span>Long-term ' + s.longterm.toFixed(1) + '</span><span>Personal ' + s.personal.toFixed(1) + '</span>' +
          '</div>' +
          (opt.upside ? '<div class="cust-line"><span>Upside</span><span>' + opt.upside + '</span></div>' : '') +
          (opt.downside ? '<div class="cust-line"><span>Downside</span><span>' + opt.downside + '</span></div>' : '') +
        '</div>'
      )).join('') +
      (d.notes ? '<div class="cust-sub-title">Notes</div><div class="cust-review-text">' + d.notes + '</div>' : '');

    el('decEditBtn').addEventListener('click', () => openModal(d.id));
    el('decDupBtn').addEventListener('click', () => duplicate(d.id));
    el('decArchBtn').addEventListener('click', () => { d.archived = !d.archived; LK.saveDB(); renderList(); renderDetail(); });
    el('decDelBtn').addEventListener('click', () => remove(d.id));
    el('decToTask').addEventListener('click', () => {
      LK.db.tasks.push({ id: LK.uid(), text: 'Decide: ' + d.title + ' (leading option: ' + (topOption ? topOption.opt.name : '—') + ')', done: false, due: LK.todayISO() });
      LK.saveDB();
      LK.bus.emit('notify', { type: 'lounge', text: 'Added to Mission Log.' });
    });
    el('decToEvent').addEventListener('click', () => {
      LK.db.events.push({ id: LK.uid(), title: 'Decision: ' + d.title, type: 'Personal', date: d.deadline || LK.todayISO(), startTime: '09:00', endTime: '09:30', customerId: d.customerId || null, jobId: d.jobId || null, crewId: null, address: '', notes: d.description, reminder: false, completed: false });
      LK.saveDB();
      LK.bus.emit('notify', { type: 'lounge', text: 'Added to Calendar.' });
    });
    el('decToObjective').addEventListener('click', () => {
      if (LK.lounge) LK.lounge.setObjective('decision', d.id, 'Decide: ' + d.title, { deadline: d.deadline });
    });
  }

  function optionRowHtml(o, i) {
    o = o || { name: '', cost: 0, return: 0, time: 0, risk: 3, effort: 3, longterm: 3, personal: 3, upside: '', downside: '' };
    return '<div class="decision-opt-form" data-i="' + i + '">' +
      '<div class="modal-form">' +
        '<div class="full"><label>OPTION NAME</label><input type="text" class="hud-input opt-name" value="' + (o.name || '') + '"></div>' +
        '<div><label>COST</label><input type="number" class="hud-input opt-cost" value="' + o.cost + '"></div>' +
        '<div><label>POTENTIAL RETURN</label><input type="number" class="hud-input opt-return" value="' + o.return + '"></div>' +
        '<div><label>TIME REQUIRED (HRS)</label><input type="number" class="hud-input opt-time" value="' + o.time + '"></div>' +
        '<div><label>RISK (1-5)</label><input type="number" class="hud-input opt-risk" min="1" max="5" value="' + o.risk + '"></div>' +
        '<div><label>EFFORT (1-5)</label><input type="number" class="hud-input opt-effort" min="1" max="5" value="' + o.effort + '"></div>' +
        '<div><label>LONG-TERM VALUE (1-5)</label><input type="number" class="hud-input opt-longterm" min="1" max="5" value="' + o.longterm + '"></div>' +
        '<div><label>PERSONAL INTEREST (1-5)</label><input type="number" class="hud-input opt-personal" min="1" max="5" value="' + o.personal + '"></div>' +
        '<div class="full"><label>UPSIDE</label><input type="text" class="hud-input opt-upside" value="' + (o.upside || '') + '"></div>' +
        '<div class="full"><label>DOWNSIDE</label><input type="text" class="hud-input opt-downside" value="' + (o.downside || '') + '"></div>' +
      '</div><button type="button" class="hud-btn tiny opt-remove" data-i="' + i + '">REMOVE OPTION</button></div>';
  }

  let modalOptions = [];
  function customerOptions(selected) { return '<option value="">— none —</option>' + LK.db.customers.map(c => '<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>' + c.name + '</option>').join(''); }
  function jobOptionsFor(customerId, selected) { return '<option value="">— none —</option>' + LK.db.jobs.filter(j => !customerId || j.customerId === customerId).map(j => '<option value="' + j.id + '"' + (j.id === selected ? ' selected' : '') + '>' + j.service + ' — ' + (LK.getCustomer(j.customerId) || {}).name + '</option>').join(''); }
  function crewOptions(selected) { return '<option value="">— none —</option>' + LK.db.crew.map(c => '<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>' + c.name + '</option>').join(''); }

  function openModal(id) {
    const d = id ? LK.db.decisions.find(x => x.id === id) : null;
    el('decTitle2').textContent = d ? 'Edit Decision' : 'New Decision';
    el('decName').value = d ? d.title : '';
    el('decDesc').value = d ? d.description : '';
    el('decDeadline').value = d ? (d.deadline || '') : '';
    el('decNotes').value = d ? (d.notes || '') : '';
    el('decCustomer').innerHTML = customerOptions(d ? d.customerId : null);
    el('decJob').innerHTML = jobOptionsFor(d ? d.customerId : null, d ? d.jobId : null);
    el('decCrew').innerHTML = crewOptions(d ? d.crewId : null);
    el('decLeadSource').value = d ? (d.leadSource || '') : '';
    el('decEquipment').value = d ? (d.equipment || '') : '';
    el('decCampaign').value = d ? (d.campaign || '') : '';
    const w = d ? d.weights : { profit: 3, speed: 3, risk: 3, effort: 2, longterm: 2, personal: 1 };
    ['profit', 'speed', 'risk', 'effort', 'longterm', 'personal'].forEach(k => { el('decW_' + k).value = w[k]; });
    modalOptions = d ? JSON.parse(JSON.stringify(d.options)) : [{}, {}];
    renderOptionForms();
    el('decisionModal').dataset.id = id || '';
    el('decisionModal').classList.add('open');
  }
  function pullValuesFromJob() {
    const jobId = el('decJob').value;
    const job = jobId ? LK.getJob(jobId) : null;
    if (!job) { alert('Link a job first.'); return; }
    if (!modalOptions[0]) modalOptions[0] = {};
    modalOptions[0].cost = (Number(job.materialCost) || 0) + (Number(job.laborCost) || 0) + (Number(job.otherExpenses) || 0);
    modalOptions[0].return = Number(job.approvedAmount || job.value) || 0;
    modalOptions[0].name = modalOptions[0].name || job.service;
    renderOptionForms();
    LK.bus.emit('notify', { type: 'lounge', text: 'Pulled real cost/return from ' + job.service + ' into Option 1.' });
  }
  function renderOptionForms() {
    el('decOptionForms').innerHTML = modalOptions.map(optionRowHtml).join('');
    el('decOptionForms').querySelectorAll('.opt-remove').forEach(btn => btn.addEventListener('click', () => { modalOptions.splice(Number(btn.dataset.i), 1); renderOptionForms(); }));
  }
  function closeModal() { el('decisionModal').classList.remove('open'); }

  function readOptionsFromForm() {
    return Array.from(el('decOptionForms').querySelectorAll('.decision-opt-form')).map(row => ({
      name: row.querySelector('.opt-name').value.trim() || 'Option',
      cost: parseFloat(row.querySelector('.opt-cost').value) || 0,
      return: parseFloat(row.querySelector('.opt-return').value) || 0,
      time: parseFloat(row.querySelector('.opt-time').value) || 0,
      risk: parseFloat(row.querySelector('.opt-risk').value) || 3,
      effort: parseFloat(row.querySelector('.opt-effort').value) || 3,
      longterm: parseFloat(row.querySelector('.opt-longterm').value) || 3,
      personal: parseFloat(row.querySelector('.opt-personal').value) || 3,
      upside: row.querySelector('.opt-upside').value.trim(),
      downside: row.querySelector('.opt-downside').value.trim(),
    }));
  }

  function save() {
    const title = el('decName').value.trim();
    if (!title) { el('decName').focus(); return; }
    const options = readOptionsFromForm();
    if (options.length < 2) { alert('Add at least two options to compare.'); return; }
    const id = el('decisionModal').dataset.id;
    let d = id ? LK.db.decisions.find(x => x.id === id) : null;
    if (!d) { d = { id: LK.uid(), archived: false, createdAt: LK.todayISO() }; LK.db.decisions.push(d); }
    d.title = title;
    d.description = el('decDesc').value.trim();
    d.deadline = el('decDeadline').value || null;
    d.notes = el('decNotes').value.trim();
    d.customerId = el('decCustomer').value || null;
    d.jobId = el('decJob').value || null;
    d.crewId = el('decCrew').value || null;
    d.leadSource = el('decLeadSource').value.trim();
    d.equipment = el('decEquipment').value.trim();
    d.campaign = el('decCampaign').value.trim();
    d.weights = {};
    ['profit', 'speed', 'risk', 'effort', 'longterm', 'personal'].forEach(k => { d.weights[k] = parseFloat(el('decW_' + k).value) || 0; });
    d.options = options;
    LK.saveDB();
    selectedId = d.id;
    renderList(); renderDetail();
    LK.bus.emit('notify', { type: 'lounge', text: 'Decision saved: ' + title });
    closeModal();
  }
  function duplicate(id) {
    const d = LK.db.decisions.find(x => x.id === id);
    if (!d) return;
    const copy = JSON.parse(JSON.stringify(d));
    copy.id = LK.uid(); copy.title = d.title + ' (copy)'; copy.createdAt = LK.todayISO();
    LK.db.decisions.push(copy);
    LK.saveDB(); renderList();
  }
  function remove(id) {
    if (!confirm('Delete this decision?')) return;
    LK.db.decisions = LK.db.decisions.filter(x => x.id !== id);
    if (selectedId === id) selectedId = null;
    LK.saveDB(); renderList(); renderDetail();
  }

  function wire() {
    el('decNewBtn').addEventListener('click', () => openModal(null));
    el('decAddOption').addEventListener('click', () => { modalOptions.push({}); renderOptionForms(); });
    el('decSave').addEventListener('click', save);
    el('decCancel').addEventListener('click', closeModal);
    el('decisionModal').addEventListener('click', e => { if (e.target.id === 'decisionModal') closeModal(); });
    el('decShowArchived').addEventListener('click', () => { showArchived = !showArchived; renderList(); });
    el('decCustomer').addEventListener('change', () => { el('decJob').innerHTML = jobOptionsFor(el('decCustomer').value || null, null); });
    el('decPullValues').addEventListener('click', pullValuesFromJob);
    renderList(); renderDetail();
    LK.bus.on('db:changed', () => { renderList(); if (selectedId) renderDetail(); });
  }

  LK.decisions = { render: () => { renderList(); renderDetail(); } };
  document.addEventListener('DOMContentLoaded', () => { document.getElementById('decisionList') && wire(); }, { once: true });
})();
