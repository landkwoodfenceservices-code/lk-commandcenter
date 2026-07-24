/* ==========================================================================
   LK OS — particles.js
   Drifting canvas particles, occasional HUD flicker, and the live diag
   ticker (PWR/NET/UPTIME). Purely cosmetic — all skipped/neutralized under
   prefers-reduced-motion.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  const bootTime = Date.now();
  function updateDiag() {
    const el = document.getElementById('diagline');
    if (!el) return;
    const secs = Math.floor((Date.now() - bootTime) / 1000);
    const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
    const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    const pwr = (97 + Math.random() * 2.5).toFixed(1);
    const net = (14 + Math.random() * 30).toFixed(0);
    el.textContent = 'PWR ' + pwr + '%  ·  NET ' + net + 'ms  ·  UPTIME ' + hh + ':' + mm + ':' + ss;
  }
  updateDiag(); setInterval(updateDiag, 1000);

  function scheduleFlicker() {
    const delayMs = 3500 + Math.random() * 5000;
    setTimeout(() => {
      const els = document.querySelectorAll('.sys-name, .m-name, .clock-time, .r-core span, .greet-line b, .panel-title');
      if (els.length) {
        const el = els[Math.floor(Math.random() * els.length)];
        el.classList.add('flicker-now');
        setTimeout(() => el.classList.remove('flicker-now'), 160);
      }
      scheduleFlicker();
    }, delayMs);
  }
  if (!LK.reduceMotion) scheduleFlicker();

  function startParticles() {
    if (LK.reduceMotion) return;
    const canvas = document.getElementById('particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
    resize();
    addEventListener('resize', resize);

    function spawn(y) {
      return {
        x: Math.random() * innerWidth,
        y: y !== undefined ? y : Math.random() * innerHeight,
        r: Math.random() * 1.6 + .4,
        vy: Math.random() * .35 + .08,
        vx: (Math.random() - .5) * .12,
        a: Math.random() * .35 + .08,
      };
    }
    const pts = Array.from({ length: 40 }, () => spawn());

    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#3FD8FF';
      pts.forEach(p => {
        p.y -= p.vy; p.x += p.vx;
        if (p.y < -4) Object.assign(p, spawn(innerHeight + 4));
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  startParticles();
})();
