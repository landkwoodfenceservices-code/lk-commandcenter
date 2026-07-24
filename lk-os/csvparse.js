/* ==========================================================================
   LK OS — csvparse.js  (v2.3)
   Minimal RFC4180-ish CSV parser + field-mapping helper. Used to import real
   platform exports (Meta Business Suite, Instagram Insights, TikTok
   Analytics, Google Business Profile) — the only "live" marketing data path
   until a secure backend exists for real API connections.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  function parseLine(line) {
    const out = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function parse(text) {
    // Strip a leading UTF-8 BOM — common in exports saved from Excel — which
    // would otherwise silently break an exact-match header lookup like "Date".
    text = String(text || '').replace(/^\uFEFF/, '');
    const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim().length);
    if (!lines.length) return { headers: [], rows: [] };
    const headers = parseLine(lines[0]).map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const cells = parseLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
      return row;
    });
    return { headers, rows };
  }

  // mapping: { targetField: sourceHeader }. Numeric-looking target fields are
  // coerced to numbers; everything else stays a string. Unmapped targets are
  // simply omitted from the result rather than guessed.
  const NUMERIC_FIELDS = new Set(['reach', 'views', 'impressions', 'engagement', 'followers', 'adSpend', 'leads', 'messagesStarted', 'calls', 'profileVisits', 'spend', 'revenueAttributed']);

  // Real platform exports use all sorts of date formats (MM/DD/YYYY, "Jul 1,
  // 2026", already-ISO, etc.) — LK.db date filtering everywhere else in the
  // app compares plain ISO strings, so a non-ISO date would silently vanish
  // from every chart and total. This normalizes to the app's own local-date
  // format (LK.localISO) rather than guessing a shape and getting it wrong.
  function normalizeDateString(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // MM/DD/YYYY, the most common spreadsheet export format
    if (mdy) {
      const [, mm, dd, yyyy] = mdy;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      if (!isNaN(d.getTime())) return window.LK && LK.localISO ? LK.localISO(d) : d.toISOString().slice(0, 10);
    }
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return window.LK && LK.localISO ? LK.localISO(parsed) : parsed.toISOString().slice(0, 10);
    return s; // couldn't parse — left as-is rather than dropped, so it's at least visible in an export/inspection rather than silently vanishing
  }

  function mapRows(rows, mapping) {
    return rows.map(r => {
      const out = {};
      Object.keys(mapping).forEach(target => {
        const sourceHeader = mapping[target];
        if (!sourceHeader) return;
        const raw = r[sourceHeader];
        if (raw === undefined) return;
        if (target === 'date') { out.date = normalizeDateString(raw); return; }
        out[target] = NUMERIC_FIELDS.has(target) ? (parseFloat(String(raw).replace(/[$,%]/g, '')) || 0) : raw;
      });
      return out;
    });
  }

  // Best-effort auto-detect of a starting column mapping from common export
  // header names — always shown to the user for confirmation, never applied silently.
  const GUESS_PATTERNS = {
    date: /^date$|day/i, reach: /reach/i, views: /^views$|video views/i, impressions: /impression/i,
    engagement: /engagement|reactions|likes/i, followers: /follower/i, adSpend: /spend|amount spent|cost/i,
    leads: /^leads$|lead/i, messagesStarted: /message/i, calls: /^calls$|phone/i,
  };
  function guessMapping(headers) {
    const mapping = {};
    Object.keys(GUESS_PATTERNS).forEach(target => {
      const match = headers.find(h => GUESS_PATTERNS[target].test(h));
      if (match) mapping[target] = match;
    });
    return mapping;
  }

  LK.csv = { parse, mapRows, guessMapping, normalizeDateString };
})();
