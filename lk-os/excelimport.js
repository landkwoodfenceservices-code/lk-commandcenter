/* ==========================================================================
   LK OS — excelimport.js  (v2.4)
   Safe Excel CRM workbook import. Reads .xlsx workbooks entirely client-side
   via a locally bundled SheetJS build (vendor/xlsx.core.min.js — no CDN, no
   server, no paid API), normalizes the historical lead-tracking columns,
   previews every row before anything touches LK.db, and only ever ADDS
   customer/lead records — never fabricates job/financial data and never
   silently overwrites an existing customer. Nothing in this file writes to
   LK.db until the user clicks "Confirm Import" on the preview screen.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  const REQUIRED_HEADERS = ['first name', 'last name', 'lead status', 'phone', 'street address', 'zip', 'date', 'cost of lead'];
  const HEADER_LABELS = {
    'first name': 'Customer first name', 'last name': 'Customer last name', 'lead status': 'Status (mapped)',
    'phone': 'Phone', 'street address': 'Street address', 'zip': 'ZIP code', 'date': 'Lead date',
    'cost of lead': 'Marketing cost of lead', 'review': 'Review status',
  };

  /* ---------------- normalization ---------------- */
  function normHeader(h) { return String(h == null ? '' : h).trim().toLowerCase().replace(/\s+/g, ' '); }
  function normWs(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function normPhoneDigits(s) { return String(s || '').replace(/\D/g, ''); }
  function normZip(s) {
    const digits = String(s == null ? '' : s).replace(/\D/g, '');
    if (!digits) return '';
    return digits.padStart(5, '0').slice(0, 5);
  }
  // Delegates to csvparse.js's already-verified date normalizer (handles ISO /
  // MM-DD-YYYY / generic Date-parseable strings via the app's local-date rules).
  // If it can't be parsed, that normalizer returns the original text unchanged
  // -- guard against that leaking through disguised as a real ISO date.
  function normDate(s) {
    const raw = normWs(s);
    if (!raw) return '';
    if (!(LK.csv && LK.csv.normalizeDateString)) return '';
    const out = LK.csv.normalizeDateString(raw);
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : '';
  }
  function normCost(s) {
    if (s === undefined || s === null) return null;
    const raw = String(s).trim();
    if (!raw) return null;
    const n = parseFloat(raw.replace(/[$,]/g, ''));
    return isNaN(n) ? null : Math.round(n * 100) / 100;
  }
  function normLeadStatus(raw) {
    const trimmed = normWs(raw);
    if (/^hire$/i.test(trimmed)) return { label: 'Won/Hired', status: 'active' };
    if (/^no[\s-]*hire$/i.test(trimmed)) return { label: 'Lost/Not Hired', status: 'inactive' };
    if (/^pending$/i.test(trimmed)) return { label: 'Pending', status: 'lead' };
    return { label: trimmed || 'Not recorded', status: 'lead' };
  }
  function normReview(raw) {
    const trimmed = normWs(raw);
    if (!trimmed) return '';
    if (/^y(es)?$/i.test(trimmed)) return 'Yes';
    if (/^n(o)?$/i.test(trimmed)) return 'No';
    if (/^p(ending)?$/i.test(trimmed)) return 'Pending';
    return trimmed; // interpreted "without guessing" -- anything else is preserved verbatim
  }
  // A stable composite key, not a cryptographic hash -- deterministic across
  // re-imports of the same file/row so re-running an import never duplicates
  // records that already made it in.
  function fingerprintFor(row) {
    return [normWs(row.firstName).toLowerCase(), normWs(row.lastName).toLowerCase(), row.phoneDigits, row.leadDate, row.sourceSheet].join('|');
  }

  /* ---------------- worksheet detection ---------------- */
  const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  // Case-insensitive, whitespace-tolerant: "JANUARY CLIENT SS", "January Client  SS"
  // (double space), "January Client SS " (trailing space) all normalize to the
  // same "january client ss" via normHeader's trim + lowercase + whitespace-collapse.
  function looksLikeMonthlySheet(name) {
    const n = normHeader(name);
    return MONTH_NAMES.some(m => n.startsWith(m));
  }
  function isPrepSheetName(name) {
    return normHeader(name) === 'expanding contact list to crm';
  }

  // Fuzzy column finder: tries an exact-header match first, then a looser
  // "contains this keyword" match. Used so a real monthly sheet with a
  // slightly different header (extra word, different phrasing, one column
  // renamed) doesn't silently fail detection -- the strict, exact 8-column
  // match is still tried FIRST for any sheet; this fallback only kicks in
  // for sheets whose NAME is recognized (a monthly sheet or the known prep
  // sheet), so an unrelated sheet can never be misread as CRM data.
  const FIELD_PATTERNS = {
    firstName: [/^first\s*name$/, /first/],
    lastName: [/^last\s*name$/, /last/],
    leadStatus: [/^lead\s*status$/, /\bstatus\b/],
    phone: [/^phone$/, /phone/],
    address: [/^street\s*address$/, /address/],
    zip: [/^zip(\s*code)?$/, /\bzip\b/],
    date: [/^date$/, /\bdate\b/],
    costOfLead: [/^cost\s*of\s*lead$/, /\bcost\b/],
  };
  function findColumn(headers, patterns) {
    for (const pat of patterns) {
      const idx = headers.findIndex(h => pat.test(h));
      if (idx >= 0) return idx;
    }
    return -1;
  }
  // April/May sometimes label the 9th (review) column "-" or leave it blank.
  function findReviewColumn(headers) {
    const direct = headers.findIndex(h => h === 'review' || h === '-');
    if (direct >= 0) return direct;
    if (headers.length >= 9) {
      const last = headers[headers.length - 1];
      if (last === '-' || last === '') return headers.length - 1;
    }
    return -1;
  }

  const ALL_EIGHT = ['firstName', 'lastName', 'leadStatus', 'phone', 'address', 'zip', 'date', 'costOfLead'];
  const CORE_MINIMUM = ['firstName', 'lastName', 'phone']; // the true minimum needed to create a customer record

  function detectSheet(aoa, sheetName) {
    if (!aoa || !aoa.length) return null;
    const headers = aoa[0].map(normHeader);
    const strictIdx = {
      firstName: headers.indexOf('first name'), lastName: headers.indexOf('last name'),
      leadStatus: headers.indexOf('lead status'), phone: headers.indexOf('phone'),
      address: headers.indexOf('street address'), zip: headers.indexOf('zip'),
      date: headers.indexOf('date'), costOfLead: headers.indexOf('cost of lead'),
    };
    const strictOk = ALL_EIGHT.every(k => strictIdx[k] >= 0);
    const nameRecognized = looksLikeMonthlySheet(sheetName) || isPrepSheetName(sheetName);

    let idx = strictIdx;
    let matchQuality = 'strict';
    if (!strictOk) {
      if (!nameRecognized) return null; // unrecognized sheet name + non-matching columns -> not CRM data, skip
      const fuzzyIdx = {};
      ALL_EIGHT.forEach(k => { fuzzyIdx[k] = strictIdx[k] >= 0 ? strictIdx[k] : findColumn(headers, FIELD_PATTERNS[k]); });
      if (!CORE_MINIMUM.every(k => fuzzyIdx[k] >= 0)) return null; // even leniently, can't identify a customer -- not CRM data
      idx = fuzzyIdx;
      matchQuality = 'lenient';
    }
    idx.review = findReviewColumn(headers);
    const missingFields = ALL_EIGHT.filter(k => idx[k] < 0);
    return { idx, reviewHeaderRaw: idx.review >= 0 ? aoa[0][idx.review] : null, matchQuality, missingFields };
  }

  function cell(cells, i) { return i >= 0 && i < cells.length ? cells[i] : ''; }

  function parseWorkbook(arrayBuffer) {
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    // Diagnostics (requirement: log + inspect the complete SheetNames array).
    console.log('[LK excelimport] workbook.SheetNames:', wb.SheetNames);
    const sheetsDetected = [];
    const sheetsSkipped = [];
    const rows = [];
    wb.SheetNames.forEach(name => {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
      const shape = detectSheet(aoa, name);
      if (!shape) {
        const reason = !aoa.length ? 'Empty sheet' : 'Columns do not match the expected CRM layout (even leniently for a recognized month name)';
        console.log('[LK excelimport] skipped sheet "' + name + '":', reason);
        sheetsSkipped.push({ name, reason });
        return;
      }
      let rowCount = 0;
      for (let r = 1; r < aoa.length; r++) {
        const cells = aoa[r];
        if (!cells || cells.every(c => normWs(c) === '')) continue; // fully blank row
        const firstName = normWs(cell(cells, shape.idx.firstName));
        const lastName = normWs(cell(cells, shape.idx.lastName));
        const leadStatusRaw = normWs(cell(cells, shape.idx.leadStatus));
        const leadStatus = normLeadStatus(leadStatusRaw);
        const row = {
          sourceSheet: name, sourceRow: r + 1,
          firstName, lastName, fullName: (firstName + ' ' + lastName).trim(),
          phone: normWs(cell(cells, shape.idx.phone)),
          address: normWs(cell(cells, shape.idx.address)),
          zip: normZip(cell(cells, shape.idx.zip)),
          leadDateRaw: normWs(cell(cells, shape.idx.date)),
          costOfLeadRaw: normWs(cell(cells, shape.idx.costOfLead)),
          leadStatusRaw,
          leadStatusLabel: leadStatus.label,
          mappedStatus: leadStatus.status,
          reviewRaw: normWs(cell(cells, shape.idx.review)),
          malformed: false,
        };
        row.phoneDigits = normPhoneDigits(row.phone);
        row.leadDate = normDate(row.leadDateRaw);
        row.costOfLead = normCost(row.costOfLeadRaw);
        row.reviewStatus = normReview(row.reviewRaw);
        row.malformed = !firstName && !lastName;
        row.fingerprint = fingerprintFor(row);
        rows.push(row);
        rowCount++;
      }
      sheetsDetected.push({ name, rowCount, reviewHeaderRaw: shape.reviewHeaderRaw, looksMonthly: looksLikeMonthlySheet(name), matchQuality: shape.matchQuality, missingFields: shape.missingFields });
      console.log('[LK excelimport] matched sheet "' + name + '":', rowCount, 'rows,', shape.matchQuality, 'match' + (shape.missingFields.length ? ', missing columns: ' + shape.missingFields.join(', ') : ''));
    });

    const anyMonthly = sheetsDetected.some(s => s.looksMonthly);
    // Requirement 6: the known prep/testing sheet is excluded entirely (not
    // just unchecked) once real monthly worksheets are present -- moved to
    // sheetsSkipped with a clear reason rather than silently vanishing.
    let finalDetected = sheetsDetected;
    if (anyMonthly) {
      finalDetected = sheetsDetected.filter(s => {
        if (isPrepSheetName(s.name)) {
          sheetsSkipped.push({ name: s.name, reason: 'Excluded — testing/prep sheet; monthly worksheets are present and treated as authoritative' });
          return false;
        }
        return true;
      });
    }
    finalDetected.forEach(s => { s.defaultSelected = true; });
    console.log('[LK excelimport] monthly worksheets matched:', finalDetected.filter(s => s.looksMonthly).map(s => s.name));
    console.log('[LK excelimport] worksheets skipped:', sheetsSkipped);

    return { sheetNames: wb.SheetNames, sheetsDetected: finalDetected, sheetsSkipped, rows: rows.filter(r => finalDetected.some(s => s.name === r.sourceSheet)) };
  }

  /* ---------------- duplicate detection ---------------- */
  function findDuplicates(row, existingCustomers) {
    const matches = [];
    existingCustomers.forEach(c => {
      const cPhoneDigits = normPhoneDigits(c.phone);
      if (row.phoneDigits && cPhoneDigits && row.phoneDigits === cPhoneDigits) { matches.push({ type: 'phone', customerId: c.id, customerName: c.name }); return; }
      const nameMatch = row.fullName && c.name && normWs(c.name).toLowerCase() === row.fullName.toLowerCase();
      if (nameMatch) { matches.push({ type: 'name', customerId: c.id, customerName: c.name }); return; }
      const addrMatch = row.address && c.address && normWs(c.address).toLowerCase() === row.address.toLowerCase();
      if (addrMatch) matches.push({ type: 'address', customerId: c.id, customerName: c.name });
    });
    return matches;
  }

  function buildPreview(parsed) {
    const existing = LK.db.customers;
    const seenFingerprints = new Set();
    return parsed.rows.map(row => {
      const alreadyImported = existing.some(c => c.importFingerprint && c.importFingerprint === row.fingerprint);
      const dupWithinBatch = seenFingerprints.has(row.fingerprint);
      seenFingerprints.add(row.fingerprint);
      const duplicates = row.malformed ? [] : findDuplicates(row, existing);
      return Object.assign({}, row, {
        alreadyImported, dupWithinBatch, duplicates,
        include: !row.malformed && !alreadyImported && !dupWithinBatch,
        duplicateAction: duplicates.length ? 'skip' : null, // safest default -- never merge/overwrite without an explicit choice
      });
    });
  }

  /* ---------------- apply (the only functions that touch LK.db) ---------------- */
  function createCustomerFromRow(row, defaultSource) {
    const c = {
      id: LK.uid(), name: row.fullName || row.firstName || row.lastName || 'Unnamed Lead',
      phone: row.phone || '', email: '', address: row.address || '', city: '', zip: row.zip || '',
      source: defaultSource || 'Thumbtack', preferredContact: 'Call', status: row.mappedStatus, notes: '',
      createdAt: row.leadDate || LK.todayISO(), lastContactDate: row.leadDate || LK.todayISO(),
      warrantyExpires: null, photos: [], reviews: [], activity: [], reviewStatus: 'none',
      leadDate: row.leadDate, costOfLead: row.costOfLead, leadReviewStatus: row.reviewStatus,
      importOriginalStatus: row.leadStatusRaw, importLeadStatusLabel: row.leadStatusLabel,
      importSourceMonth: row.sourceSheet, importFingerprint: row.fingerprint, importedAt: LK.nowISO(),
    };
    LK.db.customers.push(c);
    LK.logActivity(c.id, 'Lead received', 'Imported from ' + row.sourceSheet);
    return c;
  }

  function mergeMissing(c, row, defaultSource) {
    if (!c.address && row.address) c.address = row.address;
    if (!c.zip && row.zip) c.zip = row.zip;
    if (!c.source && defaultSource) c.source = defaultSource;
    if (!c.leadDate && row.leadDate) c.leadDate = row.leadDate;
    if (c.costOfLead == null && row.costOfLead != null) c.costOfLead = row.costOfLead;
    if (!c.leadReviewStatus && row.reviewStatus) c.leadReviewStatus = row.reviewStatus;
    if (!c.importOriginalStatus && row.leadStatusRaw) c.importOriginalStatus = row.leadStatusRaw;
    if (!c.importLeadStatusLabel && row.leadStatusLabel) c.importLeadStatusLabel = row.leadStatusLabel;
    if (!c.importSourceMonth && row.sourceSheet) c.importSourceMonth = row.sourceSheet;
    if (!c.importFingerprint) c.importFingerprint = row.fingerprint;
    if (!c.importedAt) c.importedAt = LK.nowISO();
    LK.logActivity(c.id, 'Merged import data', 'From ' + row.sourceSheet);
  }

  function applyImport(previewRows, options) {
    options = options || {};
    const defaultSource = options.defaultSource || 'Thumbtack';
    let created = 0, merged = 0, separate = 0, skipped = 0, malformedSkipped = 0, totalCostOfLeadsImported = 0;
    const duplicatesFound = previewRows.filter(r => r.duplicates && r.duplicates.length).length;
    previewRows.forEach(row => {
      if (row.malformed) { malformedSkipped++; return; }
      if (!row.include) { skipped++; return; }
      if (row.duplicates.length && row.duplicateAction === 'skip') { skipped++; return; }
      if (row.duplicates.length && row.duplicateAction === 'merge') {
        const target = LK.getCustomer(row.duplicates[0].customerId);
        if (target) { mergeMissing(target, row, defaultSource); merged++; if (row.costOfLead != null) totalCostOfLeadsImported += row.costOfLead; return; }
      }
      createCustomerFromRow(row, defaultSource);
      if (row.costOfLead != null) totalCostOfLeadsImported += row.costOfLead;
      if (row.duplicates.length) separate++; else created++;
    });
    totalCostOfLeadsImported = Math.round(totalCostOfLeadsImported * 100) / 100;
    const autoSkippedDuplicate = previewRows.filter(r => r.alreadyImported || r.dupWithinBatch).length;
    LK.db.importBatches.push({
      id: LK.uid(), date: LK.todayISO(), importedAt: LK.nowISO(), fileLabel: options.fileLabel || '',
      sheetsDetected: options.sheetsDetected || [], sheetsSkipped: options.sheetsSkipped || [], sheetsImported: options.sheetsImported || options.sheetsDetected || [],
      totalRowsSeen: previewRows.length, created, merged, separate, skipped, malformedSkipped, autoSkippedDuplicate, duplicatesFound, totalCostOfLeadsImported,
    });
    LK.saveDB();
    if (LK.audit) LK.audit.log('CRM workbook imported', { entityType: 'import', summary: (options.fileLabel || 'Workbook') + ' — ' + created + ' created, ' + merged + ' merged', newValue: String(created + merged + separate) });
    LK.bus.emit('notify', { type: 'customer', text: 'CRM import complete: ' + (created + merged + separate) + ' record' + (created + merged + separate === 1 ? '' : 's') + ' added/updated.' });
    return { created, merged, separate, skipped, malformedSkipped, autoSkippedDuplicate, duplicatesFound, totalCostOfLeadsImported };
  }

  /* ---------------- enrichment helpers (Phase 4) ----------------
     All computed live from the customer + its linked job (if any) rather
     than a stored flag, so a filter never goes stale when the user adds or
     edits a job through the normal job modal -- the flag clears itself the
     moment the underlying data is actually there. */
  function linkedJob(c) { return LK.db.jobs.find(j => j.customerId === c.id); }

  // Excludes Lost/Not Hired customers -- a lead that was never hired has no
  // job to enrich, so it doesn't belong in an "add job details" queue.
  function needsJobDetails(c) {
    return !!c.importFingerprint && c.status !== 'inactive' && !linkedJob(c);
  }

  // The "missing X" filters below are scoped to imported customers who could
  // plausibly still get a job (won/active, or still an undecided lead) --
  // a Lost/Not Hired customer will never have a fence type/deposit/crew, so
  // including them would just be enrichment-queue clutter, not a real task.
  function couldStillHaveJob(c) { return !!c.importFingerprint && c.status !== 'inactive'; }
  const ENRICHMENT_FILTERS = {
    imported: (c) => !!c.importFingerprint,
    needsJobDetails: (c) => needsJobDetails(c),
    missingValue: (c) => couldStillHaveJob(c) && (!linkedJob(c) || linkedJob(c).value == null || linkedJob(c).value === 0),
    missingFenceType: (c) => couldStillHaveJob(c) && (!linkedJob(c) || !linkedJob(c).fenceType),
    missingDeposit: (c) => couldStillHaveJob(c) && (!linkedJob(c) || (linkedJob(c).depositRequired == null && !linkedJob(c).depositAmount)),
    missingFinalInvoice: (c) => couldStillHaveJob(c) && (!linkedJob(c) || linkedJob(c).finalInvoiceAmount == null),
    missingCrew: (c) => couldStillHaveJob(c) && (!linkedJob(c) || (!linkedJob(c).crewId && !linkedJob(c).assignedCrewName)),
    missingCompletionDate: (c) => couldStillHaveJob(c) && (!linkedJob(c) || !linkedJob(c).completionDate),
    wonWithoutJob: (c) => !!c.importFingerprint && c.status === 'active' && !linkedJob(c),
  };
  function matchesEnrichmentFilter(c, key) {
    const fn = ENRICHMENT_FILTERS[key];
    return fn ? fn(c) : true;
  }

  /* ---------------- wizard UI ---------------- */
  let wiz = null; // { parsed, selectedSheets: Set, activeParsed, preview, filename, defaultSource }

  function openFilePicker() {
    const input = document.getElementById('importFileInput');
    if (!input) return;
    input.value = '';
    input.click();
  }

  function onFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      let parsed;
      try { parsed = parseWorkbook(ev.target.result); }
      catch (err) { alert('Could not read this workbook. Make sure it is a valid .xlsx file.\n\n' + err.message); return; }
      if (!parsed.sheetsDetected.length) {
        alert('No worksheets matching the expected CRM layout were found.\n\nExpected columns: First Name, Last Name, Lead Status, Phone, Street Address, Zip, Date, Cost Of Lead, Review (or "-").\n\nSheets found in this file: ' + parsed.sheetNames.join(', '));
        return;
      }
      wiz = {
        parsed, filename: file.name, defaultSource: 'Thumbtack',
        selectedSheets: new Set(parsed.sheetsDetected.filter(s => s.defaultSelected).map(s => s.name)),
      };
      renderSheetSelectStep();
      document.getElementById('importWizardModal').classList.add('open');
    };
    reader.onerror = () => alert('Could not read the selected file.');
    reader.readAsArrayBuffer(file);
  }

  /* ---------------- step 1: worksheet selection ---------------- */
  function renderSheetSelectStep() {
    const p = wiz.parsed;
    const totalRowsSelected = () => p.sheetsDetected.filter(s => wiz.selectedSheets.has(s.name)).reduce((s, sh) => s + sh.rowCount, 0);
    const monthlyMatched = p.sheetsDetected.filter(s => s.looksMonthly);

    const body = document.getElementById('importWizardBody');
    function paint() {
      body.innerHTML =
        '<div class="import-legend">' +
          '<div><b>Total worksheets in workbook:</b> ' + p.sheetNames.length + '</div>' +
          '<div><b>Worksheet names found:</b> ' + p.sheetNames.join(', ') + '</div>' +
          '<div><b>Monthly worksheets matched:</b> ' + (monthlyMatched.length ? monthlyMatched.map(s => s.name).join(', ') : 'None') + '</div>' +
          '<div><b>Worksheets skipped:</b> ' + (p.sheetsSkipped.length ? p.sheetsSkipped.map(s => s.name + ' (' + s.reason + ')').join('; ') : 'None') + '</div>' +
          (p.sheetsDetected.some(s => s.matchQuality === 'lenient') ? '<div style="margin-top:6px">Some sheets matched by worksheet name with one or more columns not found exactly — those fields will show as blank/"Not recorded" for that sheet\'s rows: ' + p.sheetsDetected.filter(s => s.matchQuality === 'lenient').map(s => s.name + ' (missing: ' + (s.missingFields.length ? s.missingFields.join(', ') : 'none') + ')').join('; ') + '.</div>' : '') +
        '</div>' +
        (p.sheetsDetected.length === 1 ? '<div class="wx-note warn">ONLY 1 WORKSHEET WAS FOUND IN THIS WORKBOOK. If you expected 7 monthly worksheets, double-check this is the correct file — see the worksheet names above.</div>' : '') +
        '<div class="import-summary-row">' +
          '<div class="brief-stat"><label>WORKSHEETS DETECTED</label><span>' + p.sheetsDetected.length + '</span></div>' +
          '<div class="brief-stat good"><label>SELECTED WORKSHEETS</label><span id="iwSelectedCount">' + wiz.selectedSheets.size + '</span></div>' +
          '<div class="brief-stat"><label>TOTAL ROWS FOUND</label><span id="iwSelectedRows">' + totalRowsSelected() + '</span></div>' +
        '</div>' +
        '<div class="import-table-wrap" style="max-height:none"><table class="import-table"><thead><tr><th></th><th>Worksheet</th><th>Eligible Rows</th><th></th></tr></thead><tbody>' +
        p.sheetsDetected.map(s => (
          '<tr><td><input type="checkbox" class="iw-sheet-check" data-name="' + s.name + '"' + (wiz.selectedSheets.has(s.name) ? ' checked' : '') + '></td>' +
          '<td>' + s.name + '</td><td>' + s.rowCount + ' eligible row' + (s.rowCount === 1 ? '' : 's') + '</td>' +
          '<td>' + (s.looksMonthly ? '' : '<span class="import-dupe-badge">NOT MONTH-NAMED</span>') + '</td></tr>'
        )).join('') +
        '</tbody></table></div>';

      body.querySelectorAll('.iw-sheet-check').forEach(cb => cb.addEventListener('change', e => {
        if (e.target.checked) wiz.selectedSheets.add(e.target.dataset.name); else wiz.selectedSheets.delete(e.target.dataset.name);
        document.getElementById('iwSelectedCount').textContent = wiz.selectedSheets.size;
        document.getElementById('iwSelectedRows').textContent = totalRowsSelected();
        document.getElementById('iwImportSelected').textContent = 'IMPORT SELECTED MONTHS (' + totalRowsSelected() + ' ROWS)';
      }));
    }
    paint();

    document.getElementById('importWizardActions').innerHTML =
      '<div style="display:flex; gap:8px">' +
        '<button type="button" class="hud-btn tiny" id="iwSelectAllMonths">SELECT ALL MONTHS</button>' +
        '<button type="button" class="hud-btn tiny" id="iwDeselectAllMonths">DESELECT ALL</button>' +
      '</div>' +
      '<div style="display:flex; gap:8px">' +
        '<button type="button" class="hud-btn" id="iwCancel">CANCEL</button>' +
        '<button type="button" class="hud-btn" id="iwImportSelected">IMPORT SELECTED MONTHS (' + totalRowsSelected() + ' ROWS)</button>' +
      '</div>';
    document.getElementById('iwSelectAllMonths').addEventListener('click', () => { wiz.selectedSheets = new Set(p.sheetsDetected.map(s => s.name)); renderSheetSelectStep(); });
    document.getElementById('iwDeselectAllMonths').addEventListener('click', () => { wiz.selectedSheets = new Set(); renderSheetSelectStep(); });
    document.getElementById('iwCancel').addEventListener('click', closeWizard);
    document.getElementById('iwImportSelected').addEventListener('click', () => {
      if (!wiz.selectedSheets.size) { alert('Select at least one worksheet to import.'); return; }
      wiz.activeParsed = {
        sheetNames: wiz.parsed.sheetNames,
        sheetsDetected: wiz.parsed.sheetsDetected.filter(s => wiz.selectedSheets.has(s.name)),
        sheetsSkipped: wiz.parsed.sheetsSkipped,
        rows: wiz.parsed.rows.filter(r => wiz.selectedSheets.has(r.sourceSheet)),
      };
      wiz.preview = buildPreview(wiz.activeParsed);
      renderPreviewStep();
    });
  }

  function closeWizard() {
    document.getElementById('importWizardModal').classList.remove('open');
    wiz = null;
  }

  function dupeBadge(row) {
    if (row.alreadyImported) return '<span class="import-dupe-badge exact">ALREADY IMPORTED</span>';
    if (row.dupWithinBatch) return '<span class="import-dupe-badge exact">REPEATED IN FILE</span>';
    if (row.malformed) return '<span class="import-dupe-badge exact">NO NAME</span>';
    if (row.duplicates.length) {
      const types = Array.from(new Set(row.duplicates.map(d => d.type)));
      return '<span class="import-dupe-badge" title="Matches existing: ' + row.duplicates.map(d => d.customerName).join(', ') + '">' + types.join('+').toUpperCase() + ' MATCH</span>';
    }
    return '';
  }

  function renderPreviewStep() {
    const p = wiz.activeParsed, rows = wiz.preview;
    const sheetSummary = p.sheetsDetected.map(s => s.name + ' (' + s.rowCount + ')').join(', ');
    const includedCount = rows.filter(r => r.include).length;
    const dupeCount = rows.filter(r => r.duplicates.length).length;
    const malformedCount = rows.filter(r => r.malformed).length;
    const alreadyCount = rows.filter(r => r.alreadyImported || r.dupWithinBatch).length;

    const body = document.getElementById('importWizardBody');
    body.innerHTML =
      '<div class="import-legend">' +
        '<div><b>' + p.sheetsDetected.length + ' worksheet' + (p.sheetsDetected.length === 1 ? '' : 's') + ' selected:</b> ' + sheetSummary + '</div>' +
        '<div style="margin-top:6px"><b>Column mapping:</b> First Name + Last Name &rarr; Customer Name &middot; Lead Status &rarr; Status (Hire&rarr;Won/Hired, No Hire&rarr;Lost/Not Hired) &middot; Phone &rarr; Phone &middot; Street Address &rarr; Address &middot; Zip &rarr; ZIP &middot; Date &rarr; Lead Date &middot; Cost Of Lead &rarr; Cost of Lead &middot; Review/"-" &rarr; Review Status &middot; Worksheet name &rarr; Source Month</div>' +
      '</div>' +
      '<div class="import-summary-row">' +
        '<div class="brief-stat"><label>TOTAL ROWS FOUND</label><span>' + rows.length + '</span></div>' +
        '<div class="brief-stat good"><label>READY TO IMPORT</label><span>' + includedCount + '</span></div>' +
        '<div class="brief-stat' + (dupeCount ? ' warn' : '') + '"><label>POSSIBLE DUPLICATES</label><span>' + dupeCount + '</span></div>' +
        '<div class="brief-stat"><label>ALREADY IMPORTED</label><span>' + alreadyCount + '</span></div>' +
        '<div class="brief-stat' + (malformedCount ? ' warn' : '') + '"><label>MISSING NAME / MALFORMED ROWS</label><span>' + malformedCount + '</span></div>' +
      '</div>' +
      '<div class="import-field-row">' +
        '<div><label>DEFAULT LEAD SOURCE</label><input type="text" id="iwDefaultSource" class="hud-input" value="' + wiz.defaultSource + '"></div>' +
        '<div><button type="button" class="hud-btn tiny" id="iwSelectAll">SELECT ALL ELIGIBLE</button></div>' +
        '<div><button type="button" class="hud-btn tiny" id="iwSelectNone">DESELECT ALL</button></div>' +
      '</div>' +
      '<div class="import-table-wrap"><table class="import-table"><thead><tr>' +
        '<th></th><th>Sheet</th><th>Name</th><th>Phone</th><th>Address</th><th>Zip</th><th>Lead Date</th><th>Cost of Lead</th><th>Lead Status</th><th>Review</th><th>Flag</th><th>If duplicate</th>' +
      '</tr></thead><tbody>' +
      rows.map((row, i) => {
        const forcedOut = row.malformed || row.alreadyImported || row.dupWithinBatch;
        return '<tr class="' + (row.malformed ? 'malformed ' : '') + (!row.include ? 'excluded' : '') + '" data-i="' + i + '">' +
          '<td><input type="checkbox" class="iw-include" data-i="' + i + '"' + (row.include ? ' checked' : '') + (forcedOut ? ' disabled' : '') + '></td>' +
          '<td>' + row.sourceSheet + '</td>' +
          '<td>' + (row.fullName || '<span class="log-empty">NO NAME</span>') + '</td>' +
          '<td>' + (row.phone || '—') + '</td>' +
          '<td>' + (row.address || '—') + '</td>' +
          '<td>' + (row.zip || '—') + '</td>' +
          '<td>' + (row.leadDate || (row.leadDateRaw ? '<span title="Could not parse: ' + row.leadDateRaw + '">Not recorded</span>' : 'Not recorded')) + '</td>' +
          '<td>' + (row.costOfLead != null ? LK.fmtMoney2(row.costOfLead) : 'Not recorded') + '</td>' +
          '<td>' + row.leadStatusLabel + '</td>' +
          '<td>' + (row.reviewStatus || '—') + '</td>' +
          '<td>' + dupeBadge(row) + '</td>' +
          '<td>' + (row.duplicates.length && !row.alreadyImported && !row.dupWithinBatch
            ? '<select class="hud-input iw-dupe-action" data-i="' + i + '"><option value="skip"' + (row.duplicateAction === 'skip' ? ' selected' : '') + '>Skip</option><option value="merge"' + (row.duplicateAction === 'merge' ? ' selected' : '') + '>Merge missing info</option><option value="separate"' + (row.duplicateAction === 'separate' ? ' selected' : '') + '>Import as separate record</option></select>'
            : '—') + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';

    body.querySelectorAll('.iw-include').forEach(cb => cb.addEventListener('change', e => {
      wiz.preview[Number(e.target.dataset.i)].include = e.target.checked;
      e.target.closest('tr').classList.toggle('excluded', !e.target.checked);
    }));
    body.querySelectorAll('.iw-dupe-action').forEach(sel => sel.addEventListener('change', e => {
      wiz.preview[Number(e.target.dataset.i)].duplicateAction = e.target.value;
    }));
    document.getElementById('iwDefaultSource').addEventListener('change', e => { wiz.defaultSource = e.target.value.trim() || 'Thumbtack'; });
    document.getElementById('iwSelectAll').addEventListener('click', () => { wiz.preview.forEach(r => { if (!r.malformed && !r.alreadyImported && !r.dupWithinBatch) r.include = true; }); renderPreviewStep(); });
    document.getElementById('iwSelectNone').addEventListener('click', () => { wiz.preview.forEach(r => { r.include = false; }); renderPreviewStep(); });

    document.getElementById('importWizardActions').innerHTML =
      '<div class="log-empty">Nothing is saved until you confirm.</div>' +
      '<div style="display:flex; gap:8px">' +
        '<button type="button" class="hud-btn" id="iwCancel">CANCEL</button>' +
        '<button type="button" class="hud-btn" id="iwConfirm">CONFIRM IMPORT (' + includedCount + ' RECORDS)</button>' +
      '</div>';
    document.getElementById('iwCancel').addEventListener('click', closeWizard);
    document.getElementById('iwConfirm').addEventListener('click', confirmImport);
  }

  function confirmImport() {
    const includedCount = wiz.preview.filter(r => r.include).length;
    if (!includedCount) { alert('No rows are selected to import.'); return; }
    const sheetsImported = Array.from(wiz.selectedSheets);
    const result = applyImport(wiz.preview, {
      defaultSource: wiz.defaultSource, fileLabel: wiz.filename,
      sheetsDetected: wiz.parsed.sheetsDetected.map(s => s.name), sheetsSkipped: wiz.parsed.sheetsSkipped.map(s => s.name),
      sheetsImported,
    });
    renderSummaryStep(result, sheetsImported);
  }

  function renderSummaryStep(result, sheetsImported) {
    document.getElementById('importWizardBody').innerHTML =
      '<div class="import-summary-row">' +
        '<div class="brief-stat good"><label>CUSTOMERS IMPORTED</label><span>' + result.created + '</span></div>' +
        '<div class="brief-stat good"><label>MERGED INTO EXISTING</label><span>' + result.merged + '</span></div>' +
        '<div class="brief-stat"><label>IMPORTED SEPARATELY</label><span>' + result.separate + '</span></div>' +
        '<div class="brief-stat"><label>RECORDS SKIPPED</label><span>' + result.skipped + '</span></div>' +
        '<div class="brief-stat"><label>ALREADY IMPORTED (AUTO-SKIPPED)</label><span>' + result.autoSkippedDuplicate + '</span></div>' +
        '<div class="brief-stat' + (result.duplicatesFound ? ' warn' : '') + '"><label>DUPLICATES FOUND</label><span>' + result.duplicatesFound + '</span></div>' +
        '<div class="brief-stat' + (result.malformedSkipped ? ' warn' : '') + '"><label>MALFORMED RECORDS</label><span>' + result.malformedSkipped + '</span></div>' +
        '<div class="brief-stat"><label>WORKSHEETS IMPORTED</label><span>' + sheetsImported.length + '</span></div>' +
        '<div class="brief-stat"><label>TOTAL COST OF LEADS IMPORTED</label><span>' + LK.fmtMoney2(result.totalCostOfLeadsImported) + '</span></div>' +
      '</div>' +
      '<div class="log-empty">Worksheets imported: ' + (sheetsImported.join(', ') || 'none') + '. Cost of Lead is marketing spend, not revenue.</div>' +
      '<div class="log-empty" style="margin-top:6px">Newly imported leads appear in the Customer Database. Use the "NEEDS JOB DETAILS" filter there to gradually add fence type, job value, deposits, and dates to each one.</div>';
    document.getElementById('importWizardActions').innerHTML = '<div></div><div><button type="button" class="hud-btn" id="iwDone">DONE</button></div>';
    document.getElementById('iwDone').addEventListener('click', closeWizard);
    if (LK.customers) LK.customers.render();
    LK.bus.emit('db:changed', LK.db);
  }

  /* ---------------- import history panel ---------------- */
  function openImportHistory() {
    const modal = document.getElementById('importHistoryModal');
    const body = document.getElementById('importHistoryBody');
    if (!modal || !body) return;
    const batches = LK.db.importBatches.slice().reverse();
    body.innerHTML = batches.length ? batches.map(b => {
      const when = new Date(b.importedAt || (b.date + 'T00:00:00')).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
      const sheets = (b.sheetsImported && b.sheetsImported.length ? b.sheetsImported : b.sheetsDetected || []).join(', ') || 'Unknown';
      return '<div class="cust-line" style="flex-direction:column; align-items:flex-start; gap:2px; padding:8px 0; border-bottom:1px solid var(--holo-faint)">' +
        '<div><b>' + when + '</b> — ' + (b.fileLabel || 'Workbook') + '</div>' +
        '<div class="log-empty">Worksheets: ' + sheets + '</div>' +
        '<div class="log-empty">Added: ' + b.created + ' &middot; Merged: ' + b.merged + ' &middot; Separate: ' + (b.separate || 0) + ' &middot; Skipped: ' + b.skipped + ' &middot; Errors: ' + b.malformedSkipped + '</div>' +
      '</div>';
    }).join('') : '<div class="log-empty">NO IMPORTS YET</div>';
    modal.classList.add('open');
  }
  function closeImportHistory() { const m = document.getElementById('importHistoryModal'); if (m) m.classList.remove('open'); }

  function wire() {
    const btn = document.getElementById('custImportBtn');
    const input = document.getElementById('importFileInput');
    if (btn) btn.addEventListener('click', openFilePicker);
    if (input) input.addEventListener('change', onFileSelected);
    const modal = document.getElementById('importWizardModal');
    if (modal) modal.addEventListener('click', e => { if (e.target.id === 'importWizardModal') closeWizard(); });
    const historyBtn = document.getElementById('custImportHistoryBtn');
    if (historyBtn) historyBtn.addEventListener('click', openImportHistory);
    const historyClose = document.getElementById('importHistoryClose');
    if (historyClose) historyClose.addEventListener('click', closeImportHistory);
    const historyModal = document.getElementById('importHistoryModal');
    if (historyModal) historyModal.addEventListener('click', e => { if (e.target.id === 'importHistoryModal') closeImportHistory(); });
  }

  LK.excelImport = { parseWorkbook, buildPreview, applyImport, needsJobDetails, matchesEnrichmentFilter, openFilePicker };
  document.addEventListener('DOMContentLoaded', wire, { once: true });
})();
