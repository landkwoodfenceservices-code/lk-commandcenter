/* ==========================================================================
   LK OS — simulations.js
   Strategic Simulations: three short, original, lightweight games for a
   2-10 minute break. No gambling, no purchases, no endless progression, no
   real customer data. Ends automatically when the break timer completes.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  let soundOn = true;
  let activeGame = null;

  function el(id) { return document.getElementById(id); }
  function log(game, result) {
    LK.db.simulationHistory.push({ id: LK.uid(), game, date: LK.todayISO(), result, durationSec: 0 });
    LK.db.simulationHistory = LK.db.simulationHistory.slice(-40);
    LK.saveDB(true);
  }
  function blip() { if (soundOn) LK.audio.clickBlip(); }

  /* ---------------- Memory Grid ---------------- */
  const SYMBOLS = ['◆', '▲', '●', '■', '✦', '◈', '⬢', '☆'];
  function memoryGrid() {
    const pairs = SYMBOLS.slice(0, 6);
    const deck = pairs.concat(pairs).sort(() => Math.random() - 0.5).map((sym, i) => ({ id: i, sym, flipped: false, matched: false }));
    let first = null, moves = 0, matched = 0;

    function render() {
      el('simBody').innerHTML =
        '<div class="sim-hud">MOVES: ' + moves + ' &middot; MATCHED: ' + matched + '/' + pairs.length + '</div>' +
        '<div class="memory-grid">' + deck.map(c =>
          '<button type="button" class="memory-card' + (c.flipped || c.matched ? ' flipped' : '') + (c.matched ? ' matched' : '') + '" data-id="' + c.id + '">' + (c.flipped || c.matched ? c.sym : '?') + '</button>'
        ).join('') + '</div>';
      el('simBody').querySelectorAll('.memory-card').forEach(btn => btn.addEventListener('click', () => flip(Number(btn.dataset.id))));
    }
    function flip(id) {
      const card = deck.find(c => c.id === id);
      if (!card || card.flipped || card.matched || first === card) return;
      card.flipped = true; blip();
      if (!first) { first = card; render(); return; }
      moves++;
      if (first.sym === card.sym) {
        first.matched = card.matched = true; matched++;
        first = null; render();
        if (matched === pairs.length) { LK.audio.chimeBlip(); log('Memory Grid', 'Won in ' + moves + ' moves'); setTimeout(() => end('Solved in ' + moves + ' moves!'), 400); }
      } else {
        render();
        setTimeout(() => { card.flipped = false; first.flipped = false; first = null; render(); }, 700);
      }
    }
    render();
    return { name: 'Memory Grid' };
  }

  /* ---------------- Fence Planner ---------------- */
  // Connect every yard corner into one closed loop using as little fence
  // material as possible. Optimal loop length is brute-forced (few points,
  // trivial permutation count) so the budget and result are honest, not guessed.
  function fencePlanner() {
    const GRID_W = 260, GRID_H = 180;
    const N = 5 + Math.floor(Math.random() * 2); // 5-6 corners
    const points = Array.from({ length: N }, () => ({ x: 10 + Math.random() * (GRID_W - 20), y: 10 + Math.random() * (GRID_H - 20) }));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    function loopLength(order) {
      let total = 0;
      for (let i = 0; i < order.length; i++) total += dist(points[order[i]], points[order[(i + 1) % order.length]]);
      return total;
    }
    function permutations(arr) {
      if (arr.length <= 1) return [arr];
      const out = [];
      arr.forEach((v, i) => {
        const rest = arr.slice(0, i).concat(arr.slice(i + 1));
        permutations(rest).forEach(p => out.push([v, ...p]));
      });
      return out;
    }
    const rest = points.map((_, i) => i).slice(1);
    const optimal = Math.min(...permutations(rest).map(p => loopLength([0, ...p])));
    const budgetFt = Math.round(optimal * 1.15 / 4); // scale px distance down to a "feet" budget with a little slack
    const MATERIAL_PER_FT = 18, GATE_COST = 150;
    const gateIndex = N - 1; // last corner is the gate — a real placement decision, not just routing

    let selected = [];

    function render() {
      const usedFt = Math.round(loopLength(selected.length > 1 ? selected : [selected[0] || 0]) / 4);
      el('simBody').innerHTML =
        '<div class="sim-hud">CORNERS: ' + selected.length + '/' + N + ' &middot; MATERIALS BUDGET: ' + budgetFt + ' ft &middot; USED SO FAR: ' + (selected.length > 1 ? usedFt : 0) + ' ft &middot; ★ = gate (+' + LK.fmtMoney(GATE_COST) + ')</div>' +
        '<div class="fence-plot" id="fencePlot">' +
          points.map((p, i) => '<button type="button" class="fence-point' + (selected.includes(i) ? ' picked' : '') + (i === gateIndex ? ' gate' : '') + '" style="left:' + p.x + 'px; top:' + p.y + 'px" data-i="' + i + '" title="' + (i === gateIndex ? 'Gate location' : 'Corner') + '">' + (selected.includes(i) ? selected.indexOf(i) + 1 : (i === gateIndex ? '★' : '')) + '</button>').join('') +
          (selected.length > 1 ? '<svg class="fence-lines" width="' + GRID_W + '" height="' + GRID_H + '">' + selected.map((idx, i) => {
            if (i === 0) return '';
            const a = points[selected[i - 1]], b = points[idx];
            return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="var(--lounge-accent)" stroke-width="2"/>';
          }).join('') + '</svg>' : '') +
        '</div>' +
        '<div class="mic-status">Click each corner in the order you\'d run the fence line, then close the loop.</div>' +
        '<div class="panel-actions">' +
          '<button type="button" class="hud-btn" id="fenceFinish"' + (selected.length === N ? '' : ' disabled') + '>CLOSE LOOP &amp; FINISH</button>' +
          '<button type="button" class="hud-btn" id="fenceReset">RESET</button>' +
        '</div>';
      el('simBody').querySelectorAll('.fence-point').forEach(btn => btn.addEventListener('click', () => pick(Number(btn.dataset.i))));
      const finishBtn = el('fenceFinish'); if (finishBtn) finishBtn.addEventListener('click', finish);
      el('fenceReset').addEventListener('click', () => { selected = []; render(); });
    }
    function pick(i) {
      if (selected.includes(i)) return;
      blip();
      selected.push(i);
      render();
    }
    function finish() {
      blip();
      const used = Math.round(loopLength(selected) / 4);
      const overBudget = used > budgetFt;
      const wasteFt = Math.max(0, used - Math.round(optimal / 4));
      const efficiency = Math.max(0, Math.round(100 - (wasteFt / Math.max(1, Math.round(optimal / 4))) * 100));
      const costEstimate = used * MATERIAL_PER_FT + GATE_COST;
      log('Fence Planner', overBudget ? 'Over budget — used ' + used + 'ft' : 'Efficient — used ' + used + 'ft, ' + efficiency + '% efficiency, ' + LK.fmtMoney(costEstimate) + ' est. cost');
      end((overBudget
        ? 'Route used ' + used + ' ft of fencing — over the ' + budgetFt + ' ft budget.'
        : 'Efficient route! ' + used + ' ft of fencing, within the ' + budgetFt + ' ft budget.') +
        ' Waste: ' + wasteFt + ' ft. Efficiency score: ' + efficiency + '%. Estimated cost: ' + LK.fmtMoney(costEstimate) + ' (materials + gate).');
    }
    render();
    return { name: 'Fence Planner' };
  }

  /* ---------------- Quote Challenge ---------------- */
  const SCENARIOS = [
    { service: 'Fence', material: 2100, labor: 1200, expenses: 80, budget: 5000, desiredMargin: 25, competitorPrice: 5200, options: [3800, 4500, 5600] },
    { service: 'Staining', material: 350, labor: 900, expenses: 40, budget: 1800, desiredMargin: 30, competitorPrice: 1900, options: [1200, 1650, 2200] },
    { service: 'Gate', material: 350, labor: 300, expenses: 20, budget: 1200, desiredMargin: 35, competitorPrice: 1300, options: [750, 980, 1450] },
  ];
  function quoteChallenge() {
    const s = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    const cost = s.material + s.labor + s.expenses;
    render();
    function render() {
      el('simBody').innerHTML =
        '<div class="sim-hud">' + s.service + ' job &middot; Customer budget: ' + LK.fmtMoney(s.budget) + '</div>' +
        '<div class="cust-line"><span>Materials</span><span>' + LK.fmtMoney(s.material) + '</span></div>' +
        '<div class="cust-line"><span>Labor</span><span>' + LK.fmtMoney(s.labor) + '</span></div>' +
        '<div class="cust-line"><span>Other expenses</span><span>' + LK.fmtMoney(s.expenses) + '</span></div>' +
        '<div class="cust-line"><span>Desired margin</span><span>' + s.desiredMargin + '%</span></div>' +
        '<div class="cust-line"><span>Competitor price</span><span>' + LK.fmtMoney(s.competitorPrice) + '</span></div>' +
        '<div class="panel-title" style="margin-top:10px">Pick the most profitable quote the customer will likely accept</div>' +
        '<div class="qc-options">' + s.options.map((o, i) => '<button type="button" class="hud-btn qc-opt" data-i="' + i + '">' + LK.fmtMoney(o) + '</button>').join('') + '</div>';
      el('simBody').querySelectorAll('.qc-opt').forEach(btn => btn.addEventListener('click', () => pick(Number(btn.dataset.i))));
    }
    function pick(i) {
      blip();
      const price = s.options[i];
      const overBudget = price > s.budget;
      const profit = price - cost;
      const margin = price > 0 ? Math.round((profit / price) * 100) : 0;
      const meetsMargin = margin >= s.desiredMargin;
      const beatsCompetitor = price <= s.competitorPrice;
      const best = s.options.filter(o => o <= s.budget).sort((a, b) => b - a)[0];
      const won = !overBudget && price === best;
      log('Quote Challenge', won ? 'Won — ' + LK.fmtMoney(profit) + ' profit, ' + margin + '% margin' : 'Suboptimal pick');
      end((overBudget
        ? 'Over budget — customer likely declines. Profit would have been ' + LK.fmtMoney(profit) + '.'
        : won ? 'Best call — ' + LK.fmtMoney(profit) + ' profit (' + margin + '% margin) while staying in budget.' : 'Accepted, but left profit on the table. Best option was ' + LK.fmtMoney(best) + '.') +
        (overBudget ? '' : ' ' + (meetsMargin ? 'Meets' : 'Falls short of') + ' your ' + s.desiredMargin + '% desired margin. ' + (beatsCompetitor ? 'Undercuts' : 'Runs above') + ' the competitor price of ' + LK.fmtMoney(s.competitorPrice) + '.'));
    }
    return { name: 'Quote Challenge' };
  }

  const GAMES = { memory: memoryGrid, fence: fencePlanner, quote: quoteChallenge };

  function start(key) {
    activeGame = GAMES[key] ? GAMES[key]() : null;
    el('simResult').classList.remove('open');
  }
  function end(message) {
    el('simResultText').textContent = message;
    el('simResult').classList.add('open');
    activeGame = null;
  }
  function forceEnd() {
    if (!activeGame) return;
    el('simBody').innerHTML = '<div class="log-empty">GAME ENDED — BREAK IS OVER</div>';
    el('simResult').classList.remove('open');
    activeGame = null;
  }
  function exitGame() {
    activeGame = null;
    el('simBody').innerHTML = '<div class="log-empty">SELECT A SIMULATION ABOVE</div>';
    el('simResult').classList.remove('open');
  }

  function wire() {
    document.querySelectorAll('.sim-launch').forEach(btn => btn.addEventListener('click', () => start(btn.dataset.game)));
    el('simExit').addEventListener('click', exitGame);
    el('simSound').addEventListener('click', () => { soundOn = !soundOn; el('simSound').textContent = soundOn ? '🔊 SOUND ON' : '🔇 SOUND OFF'; });
    el('simResultClose').addEventListener('click', () => el('simResult').classList.remove('open'));
    exitGame();
  }

  LK.simulations = { start, forceEnd };
  document.addEventListener('DOMContentLoaded', () => { document.getElementById('simBody') && wire(); }, { once: true });
})();
