/* ==========================================================================
   LK OS — auditlog.js  (v2.3)
   Lightweight activity log for business-record changes (not games/lounge
   content). Called additively from existing save points elsewhere — this
   file only defines the log itself, it never triggers side effects.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  const MAX_ENTRIES = 500;

  function log(action, meta) {
    meta = meta || {};
    LK.db.auditLog.push({
      id: LK.uid(),
      date: LK.todayISO(),
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      action,
      entityType: meta.entityType || null,
      entityId: meta.entityId || null,
      summary: meta.summary || action,
      previousValue: meta.previousValue != null ? meta.previousValue : null,
      newValue: meta.newValue != null ? meta.newValue : null,
      note: meta.note || '',
    });
    if (LK.db.auditLog.length > MAX_ENTRIES) LK.db.auditLog = LK.db.auditLog.slice(-MAX_ENTRIES);
    LK.saveDB(true);
  }

  function list(filters) {
    filters = filters || {};
    return LK.db.auditLog.filter(e =>
      (!filters.entityId || e.entityId === filters.entityId) &&
      (!filters.entityType || e.entityType === filters.entityType) &&
      (!filters.date || e.date === filters.date) &&
      (!filters.action || e.action === filters.action)
    ).slice().reverse();
  }

  LK.audit = { log, list };
})();
