/* ==========================================================================
   LK OS — nav.js
   View switcher (SPA-style, no page reloads). Emits 'view:<key>' the first
   time (and every time) a view is opened so heavy panels can lazy-render
   instead of doing work on page load.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let current = 'overview';

  function go(key) {
    const target = document.querySelector('.lk-view[data-view="' + key + '"]');
    if (!target) return;
    document.querySelectorAll('.lk-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.lk-tab').forEach(t => t.classList.toggle('active', t.dataset.view === key));
    target.classList.add('active');
    current = key;
    LK.bus.emit('view:' + key);
    LK.bus.emit('nav:changed', key);
  }

  function wire() {
    document.querySelectorAll('.lk-tab').forEach(tab => {
      tab.addEventListener('click', () => go(tab.dataset.view));
    });
    go('overview');
  }

  LK.nav = { go, current: () => current };
  document.addEventListener('DOMContentLoaded', wire, { once: true });
})();
