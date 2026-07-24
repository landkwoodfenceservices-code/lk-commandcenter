/* ==========================================================================
   LK OS — estimator.js
   Full estimator: service presets, material/labor/profit/deposit
   calculators, printable PDF sheet (via window.print), and copy-to-text.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  // Material/labor starting points per service; hourly rate, profit margin and
  // deposit % default from Business Settings so they stay in sync everywhere.
  const QTY_LABELS = {
    Fence: 'Linear Ft', Gate: 'Units', 'Pressure Washing': 'Sq Ft', Sprinklers: 'Zones',
    Staining: 'Sq Ft', Gutters: 'Linear Ft', Decks: 'Sq Ft',
  };
  const MATERIAL_LABOR = {
    Fence: { material: 18, laborRate: 0.35 }, Gate: { material: 350, laborRate: 3 },
    'Pressure Washing': { material: 0.05, laborRate: 0.02 }, Sprinklers: { material: 120, laborRate: 1.5 },
    Staining: { material: 0.35, laborRate: 0.03 }, Gutters: { material: 6, laborRate: 0.15 },
    Decks: { material: 22, laborRate: 0.4 },
  };

  function el(id) { return document.getElementById(id); }

  function populateServiceOptions() {
    const services = LK.db.settings.business.services;
    el('estService').innerHTML = services.map(s => '<option>' + s + '</option>').join('');
  }

  function applyPreset() {
    const svc = el('estService').value;
    const b = LK.db.settings.business;
    const ml = MATERIAL_LABOR[svc] || { material: 0, laborRate: 0 };
    el('estQtyLabel').textContent = (QTY_LABELS[svc] || 'Units').toUpperCase();
    el('estMaterial').value = ml.material;
    el('estLaborHrs').value = ml.laborRate;
    el('estHourly').value = b.hourlyRate;
    el('estMargin').value = b.profitMargin;
    el('estDeposit').value = b.depositPct;
    calc();
  }

  function num(id) { return parseFloat(el(id).value) || 0; }

  function calc() {
    const qty = num('estQty');
    const materialTotal = qty * num('estMaterial');
    const laborHours = qty * num('estLaborHrs');
    const laborTotal = laborHours * num('estHourly');
    const subtotal = materialTotal + laborTotal;
    const profit = subtotal * (num('estMargin') / 100);
    const total = subtotal + profit;
    const deposit = total * (num('estDeposit') / 100);
    const balance = total - deposit;

    el('estMaterialTotal').textContent = LK.fmtMoney2(materialTotal);
    el('estLaborTotal').textContent = LK.fmtMoney2(laborTotal) + ' (' + laborHours.toFixed(1) + ' hrs)';
    el('estProfitTotal').textContent = LK.fmtMoney2(profit);
    el('estTotal').textContent = LK.fmtMoney2(total);
    el('estDepositTotal').textContent = LK.fmtMoney2(deposit);
    el('estBalanceTotal').textContent = LK.fmtMoney2(balance);

    return { qty, materialTotal, laborTotal, profit, total, deposit, balance };
  }

  function buildSummaryText() {
    const svc = el('estService').value;
    const customer = el('estCustomer').value.trim() || 'Prospective Customer';
    const r = calc();
    return [
      LK.db.settings.business.name + ' — Estimate',
      'Customer: ' + customer,
      'Service: ' + svc,
      'Quantity: ' + r.qty + ' ' + (QTY_LABELS[svc] || 'Units'),
      '',
      'Materials: ' + LK.fmtMoney2(r.materialTotal),
      'Labor: ' + LK.fmtMoney2(r.laborTotal),
      'Profit margin: ' + LK.fmtMoney2(r.profit),
      'TOTAL: ' + LK.fmtMoney2(r.total),
      'Deposit due: ' + LK.fmtMoney2(r.deposit),
      'Balance on completion: ' + LK.fmtMoney2(r.balance),
    ].join('\n');
  }

  function saveEstimateToPipeline() {
    const name = el('estCustomer').value.trim();
    if (!name) { el('estCustomer').focus(); LK.bus.emit('notify', { type: 'estimate', text: 'Enter a customer name before saving to the pipeline.' }); return; }
    if (!LK.pipeline) return;
    const svc = el('estService').value;
    const r = calc();
    const customer = LK.pipeline.findOrCreateCustomer(name, '', '');

    let job = LK.db.jobs.find(j => j.customerId === customer.id && j.service === svc && !j.archived && j.stage !== 'completed' && j.stage !== 'lost');
    const isNewJob = !job;
    if (!job) {
      job = { id: LK.uid(), customerId: customer.id, service: svc, address: '', phone: customer.phone || '', value: r.total, approvedAmount: r.total, depositAmount: 0, depositStatus: 'none', materialCost: r.materialTotal, laborCost: r.laborTotal, otherExpenses: 0, dueDate: null, crewId: null, priority: 'med', source: customer.source || '', lastContact: LK.todayISO(), notes: '', stage: 'quoted', archived: false, createdAt: LK.todayISO() };
      LK.db.jobs.push(job);
    } else {
      job.value = r.total;
      job.approvedAmount = r.total;
    }

    const quote = { id: LK.uid(), customerId: customer.id, jobId: job.id, service: svc, amount: r.total, sentDate: LK.todayISO(), status: 'pending' };
    LK.db.quotes.push(quote);
    LK.saveDB();
    LK.audit.log('Estimate saved', { entityType: 'quote', entityId: quote.id, summary: customer.name + ' — ' + svc, newValue: LK.fmtMoney(r.total) });
    LK.bus.emit('notify', { type: 'estimate', text: 'Estimate saved to pipeline: ' + customer.name + ' — ' + LK.fmtMoney(r.total) + (isNewJob ? ' (new job created)' : '') });
    if (LK.workflows) LK.workflows.onEstimateSaved(quote, customer, job);
    if (LK.context) LK.context.renderButtons(el('estContextActions'), customer.id, job.id, { only: ['viewCustomer', 'text', 'call', 'viewJob', 'followUp'] });
  }

  function copyEstimate() {
    const text = buildSummaryText();
    navigator.clipboard?.writeText(text).then(() => {
      LK.bus.emit('notify', { type: 'estimate', text: 'Estimate copied to clipboard.' });
    }).catch(() => {
      LK.bus.emit('notify', { type: 'estimate', text: 'Could not copy — clipboard unavailable.' });
    });
  }

  function printEstimate() {
    const svc = el('estService').value;
    const customer = el('estCustomer').value.trim() || 'Prospective Customer';
    const b = LK.db.settings.business;
    const r = calc();
    const sheet = el('printEstimate');
    sheet.innerHTML =
      '<h1>' + b.name + '</h1>' +
      '<p class="p-sub">' + [b.serviceArea, b.phone, b.website.replace(/^https?:\/\//, '')].filter(Boolean).join(' &middot; ') + '</p>' +
      '<h2>Estimate — ' + svc + '</h2>' +
      '<p><b>Prepared for:</b> ' + customer + '</p>' +
      '<p><b>Date:</b> ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + '</p>' +
      '<table><tbody>' +
      '<tr><td>Quantity</td><td>' + r.qty + ' ' + (QTY_LABELS[svc] || 'Units') + '</td></tr>' +
      '<tr><td>Materials</td><td>' + LK.fmtMoney2(r.materialTotal) + '</td></tr>' +
      '<tr><td>Labor</td><td>' + LK.fmtMoney2(r.laborTotal) + '</td></tr>' +
      '<tr><td>Profit margin</td><td>' + LK.fmtMoney2(r.profit) + '</td></tr>' +
      '<tr class="p-total"><td>Total</td><td>' + LK.fmtMoney2(r.total) + '</td></tr>' +
      '<tr><td>Deposit due</td><td>' + LK.fmtMoney2(r.deposit) + '</td></tr>' +
      '<tr><td>Balance on completion</td><td>' + LK.fmtMoney2(r.balance) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="p-note">Estimate valid for 30 days. ' + (b.warrantyTerms || '') + '</p>';
    document.body.classList.add('printing-estimate');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-estimate'), 300);
  }

  function wire() {
    populateServiceOptions();
    ['estQty', 'estMaterial', 'estLaborHrs', 'estHourly', 'estMargin', 'estDeposit'].forEach(id => {
      const node = el(id);
      if (!node) return;
      node.addEventListener('input', calc);
    });
    el('estService').addEventListener('change', applyPreset);
    el('estPdf').addEventListener('click', printEstimate);
    el('estCopy').addEventListener('click', copyEstimate);
    const saveBtn = el('estSaveToPipeline');
    if (saveBtn) saveBtn.addEventListener('click', saveEstimateToPipeline);
    applyPreset();
    LK.bus.on('db:changed', () => { /* keep current selection; business settings changes apply on next preset pick */ });

    // legacy quick-quote widget on Overview stays wired to the same math
    const feet = el('qteFeet'), rate = el('qteRate');
    if (feet && rate) {
      const quick = () => {
        const total = (parseFloat(feet.value) || 0) * (parseFloat(rate.value) || 0);
        el('qteTotal').textContent = LK.fmtMoney2(total);
      };
      feet.addEventListener('input', quick);
      rate.addEventListener('input', quick);
    }
  }

  LK.estimator = { calc, buildSummaryText, saveEstimateToPipeline };
  document.addEventListener('DOMContentLoaded', wire, { once: true });
})();
