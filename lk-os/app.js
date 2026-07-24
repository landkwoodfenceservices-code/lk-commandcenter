/* ==========================================================================
   LK OS — app.js
   Bootstrap: the original 10-link quick-launch grid (unchanged data), the
   reactor→website link, and the live clock/greeting. Loaded last, after
   every other module has registered itself on LK.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  // ============ EDIT YOUR MODULES HERE ============
  const SECTIONS = [
    {
      title: 'Social',
      items: [
        { id: 'MOD-01', name: 'TikTok', sub: '17.1K followers', url: 'https://www.tiktok.com/@landkwoodfenceservices', color: '#25F4EE' },
        { id: 'MOD-02', name: 'Instagram', sub: '@landkwoodfenceservices', url: 'https://www.instagram.com/landkwoodfenceservices', color: '#DD2A7B' },
        { id: 'MOD-03', name: 'Facebook', sub: 'Business page', url: 'https://www.facebook.com', color: '#1877F2' },
      ],
    },
    {
      title: 'Ads & Leads',
      items: [
        { id: 'MOD-04', name: 'Meta Ads', sub: 'Ads Manager', url: 'https://adsmanager.facebook.com', color: '#0668E1' },
        { id: 'MOD-05', name: 'Business Suite', sub: 'Posts & DMs', url: 'https://business.facebook.com', color: '#8B7CF6' },
        { id: 'MOD-06', name: 'Thumbtack', sub: 'Lead pipeline', url: 'https://www.thumbtack.com/pro', color: '#009FD9' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { id: 'MOD-07', name: 'Gmail', sub: 'Inbox', url: 'https://mail.google.com', color: '#EA4335' },
        { id: 'MOD-08', name: 'Google Business', sub: 'Profile & reviews', url: 'https://business.google.com', color: '#34A853' },
        { id: 'MOD-09', name: 'Netlify', sub: 'Website hosting', url: 'https://app.netlify.com', color: '#00C7B7' },
        { id: 'MOD-10', name: 'Google Sheets', sub: 'Lead tracker & numbers', url: 'https://docs.google.com/spreadsheets', color: '#0F9D58' },
      ],
    },
  ];
  // ================================================

  function renderLauncher() {
    const consoleEl = document.getElementById('console');
    let delay = .35;
    SECTIONS.forEach(sec => {
      const section = document.createElement('div');
      section.className = 'section';
      const head = document.createElement('div');
      head.className = 'section-head';
      head.style.animationDelay = delay + 's';
      head.innerHTML = '<span class="tick"></span><h2>' + sec.title + '</h2><span class="rail"></span>';
      section.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'grid';
      sec.items.forEach(m => {
        delay += .07;
        const a = document.createElement('a');
        a.className = 'module';
        a.href = m.url; a.target = '_blank'; a.rel = 'noopener';
        a.style.setProperty('--c', m.color);
        a.style.animationDelay = delay + 's';
        a.innerHTML =
          '<span class="br"></span>' +
          '<div class="m-top"><span class="m-id">' + m.id + '</span>' +
          '<span class="m-status"><span class="m-dot"></span>ONLINE</span></div>' +
          '<div class="m-name">' + m.name + '</div>' +
          '<div class="m-sub">' + m.sub + '</div>' +
          '<div class="m-bar"><i></i></div>' +
          '<span class="m-launch">LAUNCH &gt;&gt;</span>';
        grid.appendChild(a);
      });
      section.appendChild(grid);
      consoleEl.appendChild(section);
    });
  }

  function wireReactor() {
    const reactor = document.querySelector('.reactor');
    reactor.addEventListener('click', () => window.open(reactor.dataset.url, '_blank', 'noopener'));
    reactor.addEventListener('keydown', e => { if (e.key === 'Enter') window.open(reactor.dataset.url, '_blank', 'noopener'); });
    syncReactorFromSettings();
    LK.bus.on('db:changed', syncReactorFromSettings);
  }
  function syncReactorFromSettings() {
    const reactor = document.querySelector('.reactor');
    const b = LK.db.settings.business;
    reactor.dataset.url = b.website;
    const tag = reactor.querySelector('.reactor-tag');
    if (tag) tag.textContent = b.website.replace(/^https?:\/\//, '');
    const footer = document.getElementById('footerRating');
    if (footer) footer.textContent = (b.rating || '—') + '★' + (b.reviewCount ? ' · ' + b.reviewCount + ' reviews' : '');
  }

  function wireEditDataBtn() {
    document.getElementById('editDataBtn').addEventListener('click', () => LK.nav.go('settings'));
  }

  function tick() {
    const n = new Date();
    document.getElementById('time').textContent = n.toLocaleTimeString('en-US', { hour12: false });
    document.getElementById('date').textContent = n.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const h = n.getHours();
    const word = h < 12 ? 'GOOD MORNING' : h < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
    const greet = document.getElementById('greet');
    const name = (LK.db && LK.db.settings.personal.greetingName || 'Edel').toUpperCase();
    if (greet) greet.innerHTML = 'SYSTEMS ONLINE &middot; ' + word + ', <b>' + name + '</b>';
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderLauncher();
    wireReactor();
    wireEditDataBtn();
    tick(); setInterval(tick, 1000);
  }, { once: true });
})();
