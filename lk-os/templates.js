/* ==========================================================================
   LK OS — templates.js
   Message template CRUD + personalization token resolution. Never sends
   anything — just prepares text. Unresolved tokens are flagged, never
   silently blanked, so a customer never sees a literal "{firstName}".
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let selectedId = null;

  function el(id) { return document.getElementById(id); }

  const TOKEN_KEYS = ['firstName', 'fullName', 'businessName', 'ownerName', 'service', 'estimateAmount', 'depositAmount', 'balance', 'appointmentDate', 'appointmentTime', 'address', 'phone', 'website'];

  function buildContext(customerId) {
    const c = LK.getCustomer(customerId);
    const b = LK.db.settings.business;
    const job = c ? LK.db.jobs.find(j => j.customerId === c.id && j.stage !== 'completed' && j.stage !== 'lost') : null;
    const quote = c ? LK.db.quotes.filter(q => q.customerId === c.id).sort((a, b2) => b2.sentDate.localeCompare(a.sentDate))[0] : null;
    const nextEvent = c ? LK.db.events.filter(e => e.customerId === c.id && e.date >= LK.todayISO()).sort((a, b2) => (a.date + a.startTime).localeCompare(b2.date + b2.startTime))[0] : null;
    return {
      firstName: c ? c.name.split(' ')[0] : null,
      fullName: c ? c.name : null,
      businessName: b.name,
      ownerName: b.owner,
      service: (job && job.service) || (quote && quote.service) || null,
      estimateAmount: quote ? LK.fmtMoney(quote.amount) : null,
      depositAmount: job ? LK.fmtMoney(job.depositAmount) : null,
      balance: job ? LK.fmtMoney(LK.jobBalance(job)) : null,
      appointmentDate: nextEvent ? LK.fmtDate(nextEvent.date) : null,
      appointmentTime: nextEvent ? nextEvent.startTime : null,
      address: (c && c.address) || (job && job.address) || null,
      phone: c ? c.phone : null,
      website: b.website,
    };
  }

  function resolve(body, ctx) {
    const missing = [];
    const text = body.replace(/\{(\w+)\}/g, (m, key) => {
      if (!TOKEN_KEYS.includes(key)) return m;
      const v = ctx[key];
      if (v == null || v === '') { missing.push(key); return m; }
      return v;
    });
    return { text, missing };
  }

  /* ---------------- template management UI ---------------- */
  function renderList() {
    const wrap = el('templateList');
    if (!wrap) return;
    const items = LK.db.messageTemplates.filter(t => !t.archived);
    const byCat = {};
    items.forEach(t => { (byCat[t.category] = byCat[t.category] || []).push(t); });
    wrap.innerHTML = Object.keys(byCat).sort().map(cat =>
      '<div class="tpl-cat-label">' + cat.toUpperCase() + '</div>' +
      byCat[cat].map(t => '<div class="tpl-row' + (t.id === selectedId ? ' active' : '') + '" data-id="' + t.id + '">' + (t.favorited ? '★ ' : '') + t.label + '</div>').join('')
    ).join('') || '<div class="log-empty">NO TEMPLATES</div>';
    wrap.querySelectorAll('.tpl-row').forEach(row => row.addEventListener('click', () => { selectedId = row.dataset.id; renderList(); LK.bus.emit('template:selected', selectedId); }));
  }

  function openEditModal(id) {
    const t = id ? LK.db.messageTemplates.find(x => x.id === id) : null;
    el('tplModalTitle').textContent = t ? 'Edit Template' : 'New Template';
    el('tplLabel').value = t ? t.label : '';
    el('tplCategory').value = t ? t.category : 'Lead';
    el('tplBody').value = t ? t.body : '';
    el('tplModal').dataset.id = id || '';
    el('tplModal').classList.add('open');
  }
  function closeEditModal() { el('tplModal').classList.remove('open'); }
  function saveTemplate() {
    const label = el('tplLabel').value.trim();
    if (!label) return;
    const id = el('tplModal').dataset.id;
    let t = id ? LK.db.messageTemplates.find(x => x.id === id) : null;
    if (!t) { t = { id: LK.uid(), favorited: false, archived: false }; LK.db.messageTemplates.push(t); }
    t.label = label; t.category = el('tplCategory').value; t.body = el('tplBody').value;
    LK.saveDB(); renderList();
    LK.bus.emit('notify', { type: 'messages', text: 'Template saved: ' + label });
    closeEditModal();
  }
  function duplicateTemplate(id) {
    const t = LK.db.messageTemplates.find(x => x.id === id);
    if (!t) return;
    LK.db.messageTemplates.push(Object.assign({}, t, { id: LK.uid(), label: t.label + ' (copy)' }));
    LK.saveDB(); renderList();
  }
  function toggleFavorite(id) {
    const t = LK.db.messageTemplates.find(x => x.id === id);
    if (!t) return;
    t.favorited = !t.favorited; LK.saveDB(); renderList();
  }
  function archiveTemplate(id) {
    const t = LK.db.messageTemplates.find(x => x.id === id);
    if (!t) return;
    t.archived = true; LK.saveDB(); renderList();
  }
  function deleteTemplate(id) {
    if (!confirm('Delete this template permanently?')) return;
    LK.db.messageTemplates = LK.db.messageTemplates.filter(x => x.id !== id);
    LK.saveDB(); renderList();
  }

  function getSelected() { return selectedId ? LK.db.messageTemplates.find(t => t.id === selectedId) : null; }

  function wire() {
    el('tplNewBtn').addEventListener('click', () => openEditModal(null));
    el('tplEditBtn').addEventListener('click', () => { if (selectedId) openEditModal(selectedId); });
    el('tplDupBtn').addEventListener('click', () => { if (selectedId) duplicateTemplate(selectedId); });
    el('tplFavBtn').addEventListener('click', () => { if (selectedId) toggleFavorite(selectedId); });
    el('tplArchiveBtn').addEventListener('click', () => { if (selectedId) archiveTemplate(selectedId); });
    el('tplDeleteBtn').addEventListener('click', () => { if (selectedId) deleteTemplate(selectedId); });
    el('tplSave').addEventListener('click', saveTemplate);
    el('tplCancel').addEventListener('click', closeEditModal);
    el('tplModal').addEventListener('click', e => { if (e.target.id === 'tplModal') closeEditModal(); });
    renderList();
    LK.bus.on('db:changed', renderList);
  }

  LK.templates = { resolve, buildContext, renderList, getSelected, TOKEN_KEYS };
  document.addEventListener('DOMContentLoaded', () => { document.getElementById('templateList') && wire(); }, { once: true });
})();
