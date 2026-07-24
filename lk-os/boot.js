/* ==========================================================================
   LK OS — boot.js
   Startup typewriter sequence. Skippable by click or any key. Emits
   'boot:done' on the bus once the overlay is gone, which is what the
   assistant module waits for before delivering the morning briefing.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  LK.reduceMotion = reduceMotion;

  const bootEl = document.getElementById('boot');
  let booted = false;

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  function typeLine(el, text, speed) {
    return new Promise(resolve => {
      el.classList.add('typing');
      let i = 0;
      const iv = setInterval(() => {
        el.textContent = text.slice(0, i + 1);
        i++;
        if (i >= text.length) { clearInterval(iv); el.classList.remove('typing'); resolve(); }
      }, speed);
    });
  }

  function finishBoot() {
    if (booted) return;
    booted = true;
    bootEl.classList.add('hide');
    setTimeout(() => { bootEl.style.display = 'none'; }, 550);
    document.removeEventListener('keydown', bootSkipKey);
    LK.bus.emit('boot:done');
  }
  function bootSkipKey() { if (!booted) finishBoot(); }
  bootEl.addEventListener('click', finishBoot);
  document.addEventListener('keydown', bootSkipKey);

  async function runBoot() {
    const linesEl = document.getElementById('bootLines');
    const lines = ['L&K OS INITIALIZING...', 'LOADING MODULES...', 'SYNCING JOB PIPELINE...', 'ALL SYSTEMS ONLINE'];
    if (reduceMotion) {
      lines.forEach(t => {
        const d = document.createElement('div');
        d.className = 'boot-line';
        d.textContent = t;
        linesEl.appendChild(d);
      });
      await wait(500);
      finishBoot();
      return;
    }
    for (const text of lines) {
      if (booted) return;
      const div = document.createElement('div');
      div.className = 'boot-line';
      linesEl.appendChild(div);
      await typeLine(div, text, 14);
      if (booted) return;
      await wait(120);
    }
    if (booted) return;
    await wait(400);
    finishBoot();
  }
  runBoot();

  LK.isBooted = () => booted;
})();
