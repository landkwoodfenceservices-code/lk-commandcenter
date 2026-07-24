/* ==========================================================================
   LK OS — connector-meta.js  (v2.3)
   Meta Ads connector. CSV import (from Meta Ads Manager exports) is the real,
   active data path. connectLive() is a structural stub only — a real
   connection needs Meta's OAuth app + a secure backend to hold the token;
   this frontend file will never hold a client secret. See smsadapters.js
   for the identical precedent already established for texting.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  const NAME = 'meta';

  function importCSV(text, mapping) {
    const parsed = LK.csv.parse(text);
    const rows = LK.csv.mapRows(parsed.rows, mapping);
    return rows.filter(r => r.date).map(r => Object.assign({ id: LK.uid(), platform: NAME, source: 'csv', importedAt: LK.nowISO() }, r));
  }
  function connectLive() { throw new Error('Meta live connection is not configured — requires a secure backend.'); }

  LK.connectors = LK.connectors || {};
  LK.connectors[NAME] = { name: NAME, label: 'Meta Ads', status: () => LK.db.settings.marketing.connectors[NAME], importCSV, connectLive };
})();
