/* ==========================================================================
   LK OS — calendar.js  (v2.1)
   Month / week / day views over LK.db.events, fully editable via a shared
   modal (add/edit/delete, customer/job/crew linkage, reminder, completed).
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let mode = 'month';
  const EVENT_TYPES = ['Estimate', 'Fence Installation', 'Fence Repair', 'Gate', 'Staining', 'Pressure Washing', 'Sprinklers', 'Gutter Cleaning', 'Follow-Up', 'Payment Due', 'Personal'];

  function eventsOn(iso) { return LK.db.events.filter(e => e.date === iso).sort((a, b) => a.startTime.localeCompare(b.startTime)); }
  function custName(id) { const c = LK.getCustomer(id); return c ? c.name : ''; }
  function crewName(id) { const c = LK.getCrew(id); return c ? c.name : ''; }
  function weatherGlyph(iso) {
    const d = LK.weather.data;
    if (!d || !d.ok) return '';
    const day = d.daily.find(x => x.date === iso);
    if (!day) return '';
    const warn = day.pop >= 50;
    return '<span class="cal-wx ' + (warn ? 'warn' : '') + '">' + day.hi + '&deg;/' + day.lo + '&deg; &middot; ' + day.pop + '%</span>';
  }

  function renderMonth() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const todayIso = LK.todayISO();
    let cells = '';
    for (let i = 0; i < startDow; i++) cells += '<div class="cal-cell empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = LK.localISO(new Date(now.getFullYear(), now.getMonth(), d));
      const evs = eventsOn(iso);
      cells += '<div class="cal-cell' + (iso === todayIso ? ' today' : '') + '" data-date="' + iso + '">' +
        '<div class="cal-daynum">' + d + '</div>' +
        weatherGlyph(iso) +
        (evs.length ? '<div class="cal-dot-row">' + evs.slice(0, 3).map(() => '<span class="cal-dot"></span>').join('') + (evs.length > 3 ? '+' + (evs.length - 3) : '') + '</div>' : '') +
      '</div>';
    }
    const dow = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => '<div class="cal-dow">' + d + '</div>').join('');
    return '<div class="cal-month-title">' + first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + '</div>' +
      '<div class="cal-grid">' + dow + cells + '</div>';
  }

  function renderWeek() {
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - now.getDay());
    let rows = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = LK.localISO(d);
      const evs = eventsOn(iso);
      rows += '<div class="cal-week-row' + (iso === LK.todayISO() ? ' today' : '') + '" data-date="' + iso + '">' +
        '<div class="cal-week-day">' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + weatherGlyph(iso) + '</div>' +
        '<div class="cal-week-events">' + (evs.length ? evs.map(eventLine).join('') : '<span class="cal-none">No appointments</span>') + '</div>' +
      '</div>';
    }
    return rows;
  }

  function eventLine(e) {
    return '<div class="cal-event" data-id="' + e.id + '"><span class="cal-event-time">' + e.startTime + '</span><span>' + e.title + (e.completed ? ' ✓' : '') + '</span>' +
      (e.crewId ? '<span class="cal-drive">' + crewName(e.crewId) + '</span>' : '') + '</div>';
  }

  function renderDay() {
    const iso = LK.todayISO();
    const evs = eventsOn(iso);
    return '<div class="cal-month-title" data-date="' + iso + '">' + new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' ' + weatherGlyph(iso) + '</div>' +
      (evs.length ? evs.map(eventLine).join('') : '<div class="log-empty">NOTHING SCHEDULED TODAY</div>');
  }

  function renderSidebars() {
    const todayIso = LK.todayISO();
    const todayEvs = eventsOn(todayIso);
    document.getElementById('calToday').innerHTML = todayEvs.length
      ? todayEvs.map(e => eventLine(Object.assign({}, e, { title: e.title + (e.customerId ? ' — ' + custName(e.customerId) : '') }))).join('')
      : '<div class="log-empty">NOTHING SCHEDULED TODAY</div>';

    const upcoming = LK.db.events.filter(e => e.date > todayIso).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).slice(0, 6);
    document.getElementById('calUpcoming').innerHTML = upcoming.length
      ? upcoming.map(e => '<div class="cal-event" data-id="' + e.id + '"><span class="cal-event-time">' + LK.fmtDate(e.date) + '</span><span>' + e.title + '</span></div>').join('')
      : '<div class="log-empty">NOTHING UPCOMING</div>';

    document.getElementById('calCrew').innerHTML = LK.db.crew.length ? LK.db.crew.map(c => {
      const assignedToday = LK.db.events.filter(e => e.crewId === c.id && e.date === todayIso);
      const statusColor = !c.active ? 'warn' : assignedToday.length ? 'good' : 'neutral';
      return '<div class="cust-line"><span>' + c.name + '</span><span class="wx-note ' + statusColor + '" style="margin:0;padding:0;border:none">' + (c.active ? (assignedToday.length ? 'ON JOB TODAY' : 'AVAILABLE') : 'INACTIVE') + '</span></div>';
    }).join('') : '<div class="log-empty">NO CREW YET — ADD IN SETTINGS</div>';
  }

  function render() {
    const grid = document.getElementById('calMain');
    if (!grid) return;
    grid.innerHTML = mode === 'month' ? renderMonth() : mode === 'week' ? renderWeek() : renderDay();
    renderSidebars();
    wireClicks();
  }

  function wireClicks() {
    document.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', () => openEventModal(null, cell.dataset.date));
    });
    document.querySelectorAll('.cal-event[data-id]').forEach(row => {
      row.addEventListener('click', (e) => { e.stopPropagation(); openEventModal(row.dataset.id); });
    });
    const dayTitle = document.querySelector('.cal-month-title[data-date]');
    if (dayTitle) dayTitle.style.cursor = 'default';
  }

  /* ---------------- event modal ---------------- */
  function customerOptions(selected) { return '<option value="">— none —</option>' + LK.db.customers.map(c => '<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>' + c.name + '</option>').join(''); }
  function jobOptions(selected) { return '<option value="">— none —</option>' + LK.db.jobs.map(j => '<option value="' + j.id + '"' + (j.id === selected ? ' selected' : '') + '>' + j.service + ' — ' + (LK.getCustomer(j.customerId) || {}).name + '</option>').join(''); }
  function crewOptions(selected) { return '<option value="">— none —</option>' + LK.db.crew.map(c => '<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>' + c.name + '</option>').join(''); }

  function openEventModal(id, presetDate) {
    const e = id ? LK.db.events.find(x => x.id === id) : null;
    document.getElementById('emTitle').textContent = e ? 'Edit Event' : 'New Event';
    document.getElementById('emName').value = e ? e.title : '';
    document.getElementById('emType').innerHTML = EVENT_TYPES.map(t => '<option' + (e && e.type === t ? ' selected' : '') + '>' + t + '</option>').join('');
    document.getElementById('emDate').value = e ? e.date : (presetDate || LK.todayISO());
    document.getElementById('emStart').value = e ? e.startTime : '09:00';
    document.getElementById('emEnd').value = e ? e.endTime : '10:00';
    document.getElementById('emCustomer').innerHTML = customerOptions(e ? e.customerId : null);
    document.getElementById('emJob').innerHTML = jobOptions(e ? e.jobId : null);
    document.getElementById('emCrew').innerHTML = crewOptions(e ? e.crewId : null);
    document.getElementById('emAddress').value = e ? (e.address || '') : '';
    document.getElementById('emNotes').value = e ? (e.notes || '') : '';
    document.getElementById('emReminder').checked = e ? !!e.reminder : false;
    document.getElementById('emCompleted').checked = e ? !!e.completed : false;
    document.getElementById('emDelete').style.display = e ? 'inline-block' : 'none';
    const textBtn = document.getElementById('emText');
    if (textBtn) textBtn.style.display = (e && e.customerId) ? 'inline-block' : 'none';
    document.getElementById('eventModal').dataset.id = id || '';
    document.getElementById('eventModal').classList.add('open');
    document.getElementById('emName').focus();
  }
  function closeEventModal() { document.getElementById('eventModal').classList.remove('open'); }

  function saveEventModal() {
    const title = document.getElementById('emName').value.trim();
    if (!title) { document.getElementById('emName').focus(); return; }
    const id = document.getElementById('eventModal').dataset.id;
    let e = id ? LK.db.events.find(x => x.id === id) : null;
    const isNew = !e;
    if (!e) { e = { id: LK.uid() }; LK.db.events.push(e); }
    e.title = title;
    e.type = document.getElementById('emType').value;
    e.date = document.getElementById('emDate').value || LK.todayISO();
    e.startTime = document.getElementById('emStart').value || '09:00';
    e.endTime = document.getElementById('emEnd').value || '10:00';
    e.customerId = document.getElementById('emCustomer').value || null;
    e.jobId = document.getElementById('emJob').value || null;
    e.crewId = document.getElementById('emCrew').value || null;
    e.address = document.getElementById('emAddress').value.trim();
    e.notes = document.getElementById('emNotes').value.trim();
    e.reminder = document.getElementById('emReminder').checked;
    e.completed = document.getElementById('emCompleted').checked;

    LK.saveDB();
    render();
    LK.audit.log(isNew ? 'Job scheduled' : 'Appointment updated', { entityType: 'event', entityId: e.id, summary: title });
    LK.bus.emit('notify', { type: 'calendar', text: (isNew ? 'Event added: ' : 'Event updated: ') + title });
    closeEventModal();
    if (isNew && e.jobId && LK.workflows) {
      const job = LK.getJob(e.jobId);
      if (job) LK.workflows.onScheduled(job, e);
    }
  }
  function deleteEventModal() {
    const id = document.getElementById('eventModal').dataset.id;
    if (!id) return;
    if (!confirm('Delete this event?')) return;
    LK.db.events = LK.db.events.filter(e => e.id !== id);
    LK.saveDB();
    render();
    closeEventModal();
  }

  function textCustomerFromEvent() {
    const id = document.getElementById('eventModal').dataset.id;
    const e = id ? LK.db.events.find(x => x.id === id) : null;
    if (e && e.customerId && LK.messages) { closeEventModal(); LK.messages.selectCustomer(e.customerId); }
  }

  function wire() {
    const textBtn = document.getElementById('emText');
    if (textBtn) textBtn.addEventListener('click', textCustomerFromEvent);
    document.querySelectorAll('.cal-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode;
        document.querySelectorAll('.cal-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
        render();
      });
    });
    document.getElementById('calAddEvent').addEventListener('click', () => openEventModal(null));
    document.getElementById('emSave').addEventListener('click', saveEventModal);
    document.getElementById('emDelete').addEventListener('click', deleteEventModal);
    document.getElementById('emCancel').addEventListener('click', closeEventModal);
    document.getElementById('eventModal').addEventListener('click', e => { if (e.target.id === 'eventModal') closeEventModal(); });
    render();
    LK.bus.on('db:changed', render);
    LK.bus.on('weather:updated', render);
  }

  LK.calendar = { render, openEventModal, EVENT_TYPES };
  document.addEventListener('DOMContentLoaded', wire, { once: true });
})();
