/* ==========================================================================
   LK OS — media.js
   Media Center: latest social posts + Google reviews via the mock
   integrations layer. Tagged SIM since no real API is connected.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  function postCard(title, body, meta) {
    return '<div class="media-card"><div class="media-card-title">' + title + '</div><div class="media-card-body">' + body + '</div><div class="media-card-meta">' + meta + '</div></div>';
  }

  async function render() {
    const root = document.getElementById('mediaBody');
    if (!root) return;
    root.innerHTML = '<div class="log-empty">LOADING FEED…</div>';
    const feed = await LK.integrations.mediaFeed();
    root.innerHTML =
      '<div class="grid panel-grid">' +
        '<div class="panel"><span class="br"></span><div class="panel-title">Instagram <span class="sim-tag">SIM</span></div>' +
          feed.instagram.map(p => postCard(p.caption, '', '♡ ' + p.likes + ' &middot; ' + p.time)).join('') +
        '</div>' +
        '<div class="panel"><span class="br"></span><div class="panel-title">TikTok <span class="sim-tag">SIM</span></div>' +
          feed.tiktok.map(p => postCard(p.caption, '', '▶ ' + p.views + ' views &middot; ' + p.time)).join('') +
        '</div>' +
        '<div class="panel"><span class="br"></span><div class="panel-title">Facebook <span class="sim-tag">SIM</span></div>' +
          feed.facebook.map(p => postCard(p.caption, '', '👍 ' + p.reactions + ' &middot; ' + p.time)).join('') +
        '</div>' +
        '<div class="panel"><span class="br"></span><div class="panel-title">Google Reviews <span class="sim-tag">SIM</span></div>' +
          feed.googleReviews.map(r => postCard(r.name, '"' + r.text + '"', '★'.repeat(r.rating) + ' &middot; ' + r.time)).join('') +
        '</div>' +
      '</div>' +
      '<div class="panel-title" style="margin-top:16px">Before / After</div>' +
      '<div class="cust-photos">' +
        LK.db.customers.flatMap(c => c.photos.map(p => '<div class="photo-tile">' + p.toUpperCase() + '<small>' + c.name + '</small></div>')).join('') +
      '</div>';
  }

  LK.media = { render };
  LK.bus.on('view:media', render); // lazy-loaded: only fetches once this view is actually opened
})();
