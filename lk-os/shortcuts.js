/* ==========================================================================
   LK OS — shortcuts.js
   Keys 1-9 / 0 launch the ten quick-launch modules, W opens the website.
   Wires up only after boot finishes (same as v1). Small key-hint badges are
   added to each module card and to the reactor.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  function setup() {
    const moduleEls = Array.from(document.querySelectorAll('.module'));
    const keyMap = {};
    moduleEls.forEach((el, i) => {
      const key = i < 9 ? String(i + 1) : '0';
      keyMap[key] = el;
      if (!el.querySelector('.m-key')) {
        const badge = document.createElement('span');
        badge.className = 'm-key';
        badge.textContent = '[' + key + ']';
        el.appendChild(badge);
      }
    });

    const reactor = document.querySelector('.reactor');

    function handler(e) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'w') {
        e.preventDefault(); LK.audio.clickBlip();
        window.open(reactor.dataset.url, '_blank', 'noopener');
        return;
      }
      if (keyMap[e.key]) {
        e.preventDefault(); LK.audio.clickBlip();
        window.open(keyMap[e.key].href, '_blank', 'noopener');
      }
    }
    document.addEventListener('keydown', handler);
  }

  LK.bus.on('boot:done', setup);
})();
