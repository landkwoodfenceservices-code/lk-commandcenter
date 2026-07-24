/* ==========================================================================
   LK OS — panels-command.js
   Command panels for Gmail, Meta, Thumbtack, Google Business, and Sheets.
   All but Sheets (which reflects your real local pipeline) are backed by
   the mock integrations layer and tagged SIM.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  async function renderGmail() {
    const el = document.getElementById('panelGmail');
    const d = await LK.integrations.gmailUnread();
    el.innerHTML =
      '<div class="m-top"><span class="m-id">GMAIL <span class="sim-tag">SIM</span></span><span class="m-status"><span class="m-dot" style="--c:var(--good)"></span>' + d.unread + ' UNREAD</span></div>' +
      '<div class="panel-title">Inbox</div>' +
      '<div class="cust-line"><span>Newest:</span></div>' +
      '<div class="cust-line"><span>' + d.newest.from + '</span><span>' + d.newest.time + '</span></div>' +
      '<div class="cust-review-text">"' + d.newest.snippet + '"</div>' +
      '<div class="panel-actions">' +
        '<button type="button" class="hud-btn" onclick="window.open(\'https://mail.google.com\',\'_blank\')">REPLY IN GMAIL</button>' +
        '<button type="button" class="hud-btn" onclick="window.open(\'https://mail.google.com/mail/?view=cm\',\'_blank\')">COMPOSE</button>' +
      '</div>' +
      d.threads.map(t => '<div class="cust-line"><span>' + t.from + ' — ' + t.subject + '</span><span>' + t.time + '</span></div>').join('');
  }

  async function renderMeta() {
    const el = document.getElementById('panelMeta');
    const d = await LK.integrations.metaEngagement();
    el.innerHTML =
      '<div class="m-top"><span class="m-id">META <span class="sim-tag">SIM</span></span><span class="m-status"><span class="m-dot" style="--c:var(--good)"></span>LIVE</span></div>' +
      '<div class="panel-title">Instagram &amp; Facebook</div>' +
      '<div class="cust-line"><span>Instagram DMs</span><span>' + d.instagram.unreadDMs + '</span></div>' +
      '<div class="cust-line"><span>Instagram comments</span><span>' + d.instagram.newComments + '</span></div>' +
      '<div class="cust-line"><span>Facebook messages</span><span>' + d.facebook.unreadMessages + '</span></div>' +
      '<div class="cust-line"><span>Facebook comments</span><span>' + d.facebook.newComments + '</span></div>' +
      '<div class="panel-actions">' +
        '<button type="button" class="hud-btn" onclick="window.open(\'https://www.instagram.com/landkwoodfenceservices\',\'_blank\')">OPEN INSTAGRAM</button>' +
        '<button type="button" class="hud-btn" onclick="window.open(\'https://business.facebook.com\',\'_blank\')">OPEN BUSINESS SUITE</button>' +
      '</div>' +
      '<div class="panel-title" style="margin-top:10px">Recent Engagement</div>' +
      d.recent.map(r => '<div class="cust-line"><span>' + r.platform + ': ' + r.text + '</span><span>' + r.time + '</span></div>').join('');
  }

  async function renderThumbtack() {
    const el = document.getElementById('panelThumbtack');
    const d = await LK.integrations.thumbtackLeads();
    el.innerHTML =
      '<div class="m-top"><span class="m-id">THUMBTACK <span class="sim-tag">SIM</span></span><span class="m-status"><span class="m-dot" style="--c:var(--good)"></span>' + d.newLeads + ' NEW</span></div>' +
      '<div class="panel-title">Lead Pipeline</div>' +
      '<div class="cust-line"><span>Response rate</span><span>' + Math.round(d.responseRate * 100) + '%</span></div>' +
      '<div class="cust-line"><span>Avg response time</span><span>' + d.avgResponseMinutes + ' min</span></div>' +
      '<div class="panel-actions"><button type="button" class="hud-btn" onclick="window.open(\'https://www.thumbtack.com/pro\',\'_blank\')">OPEN THUMBTACK</button></div>' +
      d.leads.map(l => '<div class="cust-line"><span>' + l.name + ' — ' + l.service + '</span><span>' + l.time + '</span></div>').join('');
  }

  async function renderGoogleBiz() {
    const el = document.getElementById('panelGoogleBiz');
    const d = await LK.integrations.googleBusiness();
    el.innerHTML =
      '<div class="m-top"><span class="m-id">GOOGLE BUSINESS <span class="sim-tag">SIM</span></span><span class="m-status"><span class="m-dot" style="--c:var(--good)"></span>' + d.rating + '★</span></div>' +
      '<div class="panel-title">Profile Performance</div>' +
      '<div class="cust-line"><span>Total reviews</span><span>' + d.totalReviews + '</span></div>' +
      '<div class="cust-line"><span>Calls</span><span>' + d.calls + '</span></div>' +
      '<div class="cust-line"><span>Website clicks</span><span>' + d.websiteClicks + '</span></div>' +
      '<div class="cust-line"><span>Direction requests</span><span>' + d.directionRequests + '</span></div>' +
      '<div class="panel-actions"><button type="button" class="hud-btn" onclick="window.open(\'https://business.google.com\',\'_blank\')">OPEN GOOGLE BUSINESS</button></div>' +
      '<div class="panel-title" style="margin-top:10px">New Reviews</div>' +
      d.newReviews.map(r => '<div class="cust-line"><span>' + r.name + '</span><span>' + '★'.repeat(r.rating) + '</span></div><div class="cust-review-text">"' + r.text + '"</div>').join('');
  }

  async function renderSheets() {
    const el = document.getElementById('panelSheets');
    const d = await LK.integrations.sheetsSummary();
    el.innerHTML =
      '<div class="m-top"><span class="m-id">GOOGLE SHEETS</span><span class="m-status"><span class="m-dot" style="--c:var(--good)"></span>LIVE — LOCAL DB</span></div>' +
      '<div class="panel-title">Lead Tracker &amp; Numbers</div>' +
      '<div class="cust-line"><span>Open jobs</span><span>' + d.openJobs + '</span></div>' +
      '<div class="cust-line"><span>Completed jobs</span><span>' + d.completedJobs + '</span></div>' +
      '<div class="panel-actions"><button type="button" class="hud-btn" onclick="window.open(\'https://docs.google.com/spreadsheets\',\'_blank\')">OPEN SHEETS</button></div>' +
      '<div class="panel-title" style="margin-top:10px">Recent Estimates</div>' +
      d.recentEstimates.map(q => '<div class="cust-line"><span>' + q.service + ' — ' + (LK.getCustomer(q.customerId) || {}).name + '</span><span>' + LK.fmtMoney(q.amount) + '</span></div>').join('');
  }

  function renderAll() { renderGmail(); renderMeta(); renderThumbtack(); renderGoogleBiz(); renderSheets(); }

  LK.commandPanels = { renderAll };
  LK.bus.on('view:command', renderAll); // lazy-loaded: only fetches once this view is actually opened
  LK.bus.on('db:changed', renderSheets);
})();
