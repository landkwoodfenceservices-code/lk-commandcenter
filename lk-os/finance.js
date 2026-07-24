/* ==========================================================================
   LK OS — finance.js
   Payments and expenses: the only place money moves in/out of the system.
   Both use a shared modal (#paymentModal / #expenseModal) that can be
   opened bare (from the command palette / Overview) or pre-filled with a
   customer or job (from the customer detail panel).
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  function el(id) { return document.getElementById(id); }

  function customerOptions(selectedId) {
    return '<option value="">— none —</option>' + LK.db.customers.map(c =>
      '<option value="' + c.id + '"' + (c.id === selectedId ? ' selected' : '') + '>' + c.name + '</option>').join('');
  }
  function jobOptions(customerId, selectedId) {
    const jobs = customerId ? LK.db.jobs.filter(j => j.customerId === customerId) : LK.db.jobs;
    return '<option value="">— none —</option>' + jobs.map(j =>
      '<option value="' + j.id + '"' + (j.id === selectedId ? ' selected' : '') + '>' + j.service + ' — ' + LK.fmtMoney(j.value) + '</option>').join('');
  }

  /* ---------------- payments ---------------- */
  function openPaymentModal(prefill) {
    prefill = prefill || {};
    el('payCustomer').innerHTML = customerOptions(prefill.customerId);
    el('payJob').innerHTML = jobOptions(prefill.customerId, prefill.jobId);
    el('payAmount').value = prefill.amount || '';
    el('payMethod').value = 'Card';
    el('payDate').value = LK.todayISO();
    el('payNote').value = '';
    el('paymentModal').classList.add('open');
    el('payAmount').focus();
  }
  function closePaymentModal() { el('paymentModal').classList.remove('open'); }
  function savePayment() {
    const amount = parseFloat(el('payAmount').value);
    if (!amount || amount <= 0) { el('payAmount').focus(); return; }
    const payment = {
      id: LK.uid(), customerId: el('payCustomer').value || null, jobId: el('payJob').value || null,
      amount, method: el('payMethod').value, date: el('payDate').value || LK.todayISO(), note: el('payNote').value.trim(),
    };
    LK.db.payments.push(payment);
    if (payment.customerId) LK.logActivity(payment.customerId, 'Payment received', LK.fmtMoney2(amount));
    LK.saveDB();
    LK.audit.log('Payment recorded', { entityType: 'payment', entityId: payment.id, summary: (LK.getCustomer(payment.customerId) || {}).name || 'Unlinked', newValue: LK.fmtMoney2(amount) });
    LK.bus.emit('notify', { type: 'payment', text: 'Payment of ' + LK.fmtMoney2(amount) + ' recorded.' });
    closePaymentModal();

    const job = payment.jobId ? LK.getJob(payment.jobId) : null;
    if (job && LK.workflows) {
      if (job.depositStatus === 'requested') LK.workflows.onDepositPaid(job, payment);
      else if (job.stage === 'completed' && LK.jobBalance(job) === 0) LK.workflows.onFinalPayment(job, payment);
    }
  }

  /* ---------------- expenses ---------------- */
  const EXPENSE_CATEGORIES = ['Materials', 'Labor', 'Fuel', 'Equipment', 'Permits', 'Insurance', 'Marketing', 'Other'];
  function openExpenseModal(prefill) {
    prefill = prefill || {};
    el('expCategory').innerHTML = EXPENSE_CATEGORIES.map(c => '<option' + (c === prefill.category ? ' selected' : '') + '>' + c + '</option>').join('');
    el('expJob').innerHTML = jobOptions(null, prefill.jobId);
    el('expAmount').value = prefill.amount || '';
    el('expDate').value = LK.todayISO();
    el('expNote').value = '';
    el('expenseModal').classList.add('open');
    el('expAmount').focus();
  }
  function closeExpenseModal() { el('expenseModal').classList.remove('open'); }
  function saveExpense() {
    const amount = parseFloat(el('expAmount').value);
    if (!amount || amount <= 0) { el('expAmount').focus(); return; }
    const expense = {
      id: LK.uid(), category: el('expCategory').value, amount,
      date: el('expDate').value || LK.todayISO(), jobId: el('expJob').value || null, note: el('expNote').value.trim(),
    };
    LK.db.expenses.push(expense);
    LK.saveDB();
    LK.audit.log('Expense recorded', { entityType: 'expense', entityId: expense.id, summary: expense.category, newValue: LK.fmtMoney2(amount) });
    LK.bus.emit('notify', { type: 'expense', text: LK.fmtMoney2(amount) + ' expense logged (' + expense.category + ').' });
    closeExpenseModal();
  }

  function wire() {
    el('payCustomer').addEventListener('change', () => { el('payJob').innerHTML = jobOptions(el('payCustomer').value, null); });
    el('paySave').addEventListener('click', savePayment);
    el('payCancel').addEventListener('click', closePaymentModal);
    el('paymentModal').addEventListener('click', e => { if (e.target.id === 'paymentModal') closePaymentModal(); });

    el('expSave').addEventListener('click', saveExpense);
    el('expCancel').addEventListener('click', closeExpenseModal);
    el('expenseModal').addEventListener('click', e => { if (e.target.id === 'expenseModal') closeExpenseModal(); });
  }

  LK.finance = { openPaymentModal, closePaymentModal, openExpenseModal, closeExpenseModal, EXPENSE_CATEGORIES };
  document.addEventListener('DOMContentLoaded', wire, { once: true });
})();
