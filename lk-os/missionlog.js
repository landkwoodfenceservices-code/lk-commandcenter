/* ==========================================================================
   LK OS — missionlog.js  (v2.1)
   Today's task checklist. Now stored in the central LK.db.tasks (was a
   separate localStorage key in v2.0) so it's included in export/import and
   counted by the Overview "Tasks Due" metric.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  function renderLog() {
    const list = document.getElementById('logList');
    if (!list) return;
    const items = LK.db.tasks;
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<div class="log-empty">NO TASKS LOGGED</div>';
    } else {
      items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'log-item' + (item.done ? ' done' : '');
        row.innerHTML =
          '<input type="checkbox" ' + (item.done ? 'checked' : '') + ' data-id="' + item.id + '">' +
          '<span class="log-text"></span>' +
          '<button type="button" class="log-del" data-id="' + item.id + '" aria-label="Delete task">&times;</button>';
        row.querySelector('.log-text').textContent = item.text;
        list.appendChild(row);
      });
    }
    const done = items.filter(i => i.done).length;
    document.getElementById('logCount').textContent = done + '/' + items.length;
  }

  function addLogItem(text) {
    text = text.trim();
    if (!text) return;
    LK.db.tasks.push({ id: LK.uid(), text, done: false, due: LK.todayISO() });
    LK.saveDB(); renderLog();
  }

  function wire() {
    document.getElementById('logAdd').addEventListener('click', () => {
      const input = document.getElementById('logInput');
      addLogItem(input.value); input.value = ''; input.focus();
    });
    document.getElementById('logInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('logAdd').click(); }
    });
    document.getElementById('logList').addEventListener('change', e => {
      if (e.target.matches('input[type="checkbox"]')) {
        const id = e.target.dataset.id;
        const item = LK.db.tasks.find(i => String(i.id) === id);
        if (item) { item.done = e.target.checked; LK.saveDB(); renderLog(); }
      }
    });
    document.getElementById('logList').addEventListener('click', e => {
      if (e.target.matches('.log-del')) {
        const id = e.target.dataset.id;
        LK.db.tasks = LK.db.tasks.filter(i => String(i.id) !== id);
        LK.saveDB(); renderLog();
      }
    });
    renderLog();
    LK.bus.on('db:changed', renderLog);
  }

  LK.missionLog = { render: renderLog, addLogItem };
  document.addEventListener('DOMContentLoaded', wire, { once: true });
})();
