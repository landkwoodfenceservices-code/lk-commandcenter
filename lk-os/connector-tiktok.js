/* ==========================================================================
   LK OS — connector-tiktok.js  (v2.3)
   TikTok connector. CSV import (TikTok Analytics export) is the real, active
   data path. connectLive() is a structural stub — a real connection needs
   TikTok's developer API + a secure backend; never a frontend-held secret.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  const NAME = 'tiktok';

  function importCSV(text, mapping) {
    const parsed = LK.csv.parse(text);
    const rows = LK.csv.mapRows(parsed.rows, mapping);
    return rows.filter(r => r.date).map(r => Object.assign({ id: LK.uid(), platform: NAME, source: 'csv', importedAt: LK.nowISO() }, r));
  }
  function connectLive() { throw new Error('TikTok live connection is not configured — requires a secure backend.'); }

  LK.connectors = LK.connectors || {};
  LK.connectors[NAME] = { name: NAME, label: 'TikTok', status: () => LK.db.settings.marketing.connectors[NAME], importCSV, connectLive };
})();
