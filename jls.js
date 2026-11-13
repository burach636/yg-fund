/* Jet 4 (.mdb) reader + JLS extractor. Works in browser and Node.
   Never reads card numbers, bank, SSN or password data. The only credit-card table touched is MCCInfo,
   and from it only the schedule columns (Code, ChargeFreq, StartDate, EndDate, Amount, CampaignNum, TempOnly). */
(function (root) {
  'use strict';
  const PG = 4096;
  const u16 = new TextDecoder('utf-16le');

  function Jet(bytes) {
    this.b = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sig = String.fromCharCode.apply(null, bytes.subarray(4, 19));
    if (sig !== 'Standard Jet DB') throw new Error('NOT_MDB');
    if (bytes[0x14] !== 1) throw new Error('NOT_JET4');
    this.np = Math.floor(bytes.length / PG);
    this.dataPages = new Map();
    for (let pg = 1; pg < this.np; pg++) {
      const o = pg * PG;
      if (bytes[o] === 1 && bytes[o + 1] === 1) {
        const t = this.dv.getUint32(o + 4, true);
        let a = this.dataPages.get(t);
        if (!a) this.dataPages.set(t, a = []);
        a.push(pg);
      }
    }
    const sys = this.tdef(2);
    this.tables = {};
    for (const r of this.rows(sys, ['Id', 'Name', 'Type'])) {
      if (r.Type === 1 && r.Name && r.Name.indexOf('MSys') !== 0) this.tables[r.Name] = r.Id & 0xFFFFFF;
    }
  }
  const J = Jet.prototype;
  J.u16 = function (o) { return this.dv.getUint16(o, true); };
  J.u32 = function (o) { return this.dv.getUint32(o, true); };

  J.tdefBytes = function (pg) {
    const parts = [this.b.subarray(pg * PG, pg * PG + PG)];
    let nxt = this.u32(pg * PG + 4), guard = 0;
    while (nxt && guard++ < 500) { parts.push(this.b.subarray(nxt * PG + 8, nxt * PG + PG)); nxt = this.u32(nxt * PG + 4); }
    if (parts.length === 1) return parts[0];
    let len = 0; parts.forEach(p => len += p.length);
    const out = new Uint8Array(len); let o = 0;
    parts.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  };

  J.tdef = function (pg) {
    const b = this.tdefBytes(pg), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const ncols = dv.getUint16(45, true), nidx = dv.getUint32(51, true);
    let p = 63 + nidx * 12;
    const cols = [];
    for (let i = 0; i < ncols; i++) {
      cols.push({ type: b[p], num: dv.getUint16(p + 5, true), vidx: dv.getUint16(p + 7, true),
        fixed: !!(b[p + 15] & 1), offF: dv.getUint16(p + 21, true), len: dv.getUint16(p + 23, true) });
      p += 25;
    }
    for (const c of cols) { const n = dv.getUint16(p, true); c.name = u16.decode(b.subarray(p + 2, p + 2 + n)); p += 2 + n; }
    cols.sort((a, b2) => a.num - b2.num);
    return { pg, cols };
  };

  J.table = function (name) {
    const pg = this.tables[name];
    if (pg === undefined) throw new Error('No table ' + name);
    return this.tdef(pg);
  };

  // where: {col, test(value)} evaluated before decoding the other columns
  J.rows = function* (t, names, where) {
    const want = t.cols.filter(c => names.indexOf(c.name) >= 0);
    const wcol = where ? t.cols.find(c => c.name === where.col) : null;
    for (const pg of (this.dataPages.get(t.pg) || [])) {
      const base = pg * PG, n = this.u16(base + 12);
      let prevEnd = PG;
      for (let i = 0; i < n; i++) {
        const raw = this.u16(base + 14 + 2 * i), start = raw & 0x1FFF, end = prevEnd;
        prevEnd = start;
        let s = base + start, e = base + end;
        if (raw & 0x8000) continue;
        if (raw & 0x4000) {
          const ptr = this.u32(s), tp = ptr >>> 8, ti = ptr & 0xFF, tb = tp * PG;
          if (tp >= this.np || ti >= this.u16(tb + 12)) continue;
          const r2 = this.u16(tb + 14 + 2 * ti);
          s = tb + (r2 & 0x1FFF);
          e = tb + (ti === 0 ? PG : (this.u16(tb + 14 + 2 * (ti - 1)) & 0x1FFF));
        }
        if (e <= s) continue;
        try {
          const r = this.crack(s, e, want, wcol, where);
          if (r) yield r;
        } catch (err) { /* skip damaged row */ }
      }
    }
  };

  J.crack = function (s, e, want, wcol, where) {
    const b = this.b, rc = this.u16(s), nb = (rc + 7) >> 3, last = e - 1, nm = e - nb;
    const vc = this.u16(last - nb - 1);
    const voff = k => this.u16(last - nb - 3 - 2 * k);
    const get = c => {
      const present = c.num < rc && ((b[nm + (c.num >> 3)] >> (c.num & 7)) & 1);
      if (c.type === 1) return !!present;
      if (!present) return null;
      let d0, d1;
      if (c.fixed) { d0 = s + 2 + c.offF; d1 = d0 + c.len; }
      else { if (c.vidx >= vc) return null; d0 = s + voff(c.vidx); d1 = s + voff(c.vidx + 1); }
      return this.val(c.type, d0, d1);
    };
    if (wcol && !where.test(get(wcol))) return null;
    const out = {};
    for (const c of want) out[c.name] = get(c);
    return out;
  };

  J.text = function (d0, d1) {
    const b = this.b;
    if (d1 - d0 >= 2 && b[d0] === 0xFF && b[d0 + 1] === 0xFE) {
      let comp = true, i = d0 + 2, s = '';
      while (i < d1) {
        if (b[i] === 0) { comp = !comp; i++; continue; }
        if (comp) { s += String.fromCharCode(b[i]); i++; }
        else { if (i + 1 >= d1) break; s += String.fromCharCode(b[i] | (b[i + 1] << 8)); i += 2; }
      }
      return s;
    }
    return u16.decode(b.subarray(d0, d1 - ((d1 - d0) & 1)));
  };

  J.memo = function (d0, d1) {
    if (d1 - d0 < 12) return null;
    const raw = this.u32(d0), flags = raw & 0xC0000000, len = raw & 0x3FFFFFFF;
    if (flags & 0x80000000) return this.text(d0 + 12, Math.min(d1, d0 + 12 + len));
    let ptr = this.u32(d0 + 4), guard = 0;
    const chunks = []; let total = 0;
    while (ptr && guard++ < 2000 && total < len) {
      const pg = ptr >>> 8, idx = ptr & 0xFF, base = pg * PG;
      if (pg >= this.np) break;
      const s = base + (this.u16(base + 14 + 2 * idx) & 0x1FFF);
      const e = base + (idx === 0 ? PG : (this.u16(base + 14 + 2 * (idx - 1)) & 0x1FFF));
      if (flags & 0x40000000) { chunks.push(this.b.subarray(s, Math.min(e, s + len))); break; }
      ptr = this.u32(s);
      chunks.push(this.b.subarray(s + 4, e)); total += e - s - 4;
    }
    let n = 0; chunks.forEach(c => n += c.length);
    const buf = new Uint8Array(Math.min(n, len)); let o = 0;
    for (const c of chunks) { const k = Math.min(c.length, buf.length - o); buf.set(c.subarray(0, k), o); o += k; if (o >= buf.length) break; }
    const sub = new Jet.Text(buf);
    return sub.text(0, buf.length);
  };
  Jet.Text = function (buf) { this.b = buf; };
  Jet.Text.prototype.text = J.text;

  J.val = function (t, d0, d1) {
    const dv = this.dv;
    switch (t) {
      case 2: return this.b[d0];
      case 3: return dv.getInt16(d0, true);
      case 4: return dv.getInt32(d0, true);
      case 5: { const lo = dv.getUint32(d0, true), hi = dv.getInt32(d0 + 4, true); return Math.round((hi * 4294967296 + lo) / 100) / 100; }
      case 6: return dv.getFloat32(d0, true);
      case 7: return dv.getFloat64(d0, true);
      case 8: {
        const v = dv.getFloat64(d0, true);
        if (!isFinite(v)) return null;
        const ms = Math.round((v - 25569) * 86400000);
        const d = new Date(ms);
        if (isNaN(d)) return null;
        return d.toISOString().slice(0, 10);
      }
      case 10: return this.text(d0, d1);
      case 12: return this.memo(d0, d1);
      default: return null;
    }
  };

  // ---------------- JLS extraction ----------------
  const clean = s => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
  const join = (...a) => a.map(clean).filter(Boolean).join(' ');
  function fmtPhone(p) {
    const d = clean(p).replace(/\D/g, '');
    if (d.length === 10) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
    if (d.length === 7) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length > 10) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6, 10) + ' ' + d.slice(10);
    return clean(p);
  }

  function extract(bytes, company, progress, opts) {
    company = company || 32; opts = opts || {};
    const step = progress || (() => {});
    step('עפענען די פייל...');
    const db = new Jet(bytes);
    const out = { company, importedAt: new Date().toISOString(), accounts: [], payments: [], pledges: [], campaigns: {}, notes: [], companyName: '' };

    step('קאמפעניס...');
    for (const r of db.rows(db.table('Lists'), ['Type', 'Value', 'ValueNum']))
      if ((r.Type === 'FCompanies' || r.Type === 'Companies') && r.ValueNum === company) out.companyName = clean(r.Value);

    step('אקאונטס...');
    const acc = new Map();
    for (const r of db.rows(db.table('Members'), ['Code', 'TitleEnglish', 'FName', 'LName', 'Title', 'FNameH', 'LNameH',
      'TitleEnglishW', 'FNameW', 'TitleW', 'FNameWH', 'NotActive', 'CompanyName'])) {
      if (r.Code == null) continue;
      acc.set(r.Code, { c: r.Code, n: join(r.TitleEnglish, r.FName, r.LName), h: join(r.Title, r.FNameH, r.LNameH),
        w: join(r.TitleEnglishW, r.FNameW), wh: join(r.TitleW, r.FNameWH), ln: clean(r.LName), lh: clean(r.LNameH), co: clean(r.CompanyName),
        x: r.NotActive ? 1 : 0, a: '', ph: [] });
    }
    step('אדרעסן...');
    for (const r of db.rows(db.table('MAddress'), ['Code', 'Address1', 'Address2', 'City', 'State', 'Zip', 'Default'])) {
      const a = acc.get(r.Code); if (!a) continue;
      if (a.a && !r.Default) continue;
      const line = [join(r.Address1, r.Address2), clean(r.City), join(r.State, r.Zip)].filter(Boolean).join(', ');
      if (line) a.a = line;
    }
    step('טעלעפאנען...');
    for (const r of db.rows(db.table('MPhone'), ['Code', 'Phone', 'Desc', 'Default', 'NoSMS'])) {
      const a = acc.get(r.Code); if (!a || !clean(r.Phone)) continue;
      if (clean(r.Phone).includes('@')) { (a.em || (a.em = [])).push(clean(r.Phone).toLowerCase()); continue; }   // e-mail kept in the phone list
      const item = [clean(r.Desc), fmtPhone(r.Phone)];
      if (r.Default) a.ph.unshift(item); else a.ph.push(item);
    }
    step('אימעילס...');
    try {
      for (const r of db.rows(db.table('MAInfo'), ['Code', 'Value'], { col: 'Value', test: v => /\S+@\S+\.\S+/.test(v || '') })) {
        const a = acc.get(r.Code), e = clean(r.Value).toLowerCase();
        if (a && !(a.em || []).includes(e)) (a.em || (a.em = [])).push(e);
      }
    } catch (e) { /* optional */ }

    step('באצאלונגען (' + (out.companyName || company) + ')...');
    const isCo = v => v === company;
    for (const r of db.rows(db.table('MPayments'), ['PaymentNum', 'Code', 'Date', 'Amount', 'Type', 'CheckNum', 'CampaignNum', 'Solicitor', 'Notes', 'Refunded', 'PMethod'], { col: 'Company', test: isCo }))
      out.payments.push([r.PaymentNum, r.Code, r.Date || '', r.Amount || 0, clean(r.Type || r.PMethod), clean(r.CheckNum), r.CampaignNum || 0, clean(r.Solicitor), clean(r.Notes).slice(0, 300), r.Refunded || 0]);

    step('פלעדזשעס (' + (out.companyName || company) + ')...');
    for (const r of db.rows(db.table('MCharges'), ['ChargeNum', 'Code', 'DueDate', 'Amount', 'Paid', 'BalanceDue', 'CampaignNum', 'Desc', 'Solicitor', 'Hold', 'Note', 'DateE'], { col: 'Company', test: isCo }))
      out.pledges.push([r.ChargeNum, r.Code, r.DueDate || '', r.Amount || 0, r.Paid || 0, r.BalanceDue || 0, r.CampaignNum || 0, clean(r.Desc), clean(r.Solicitor), r.Hold ? 1 : 0, clean(r.Note).slice(0, 200), r.DateE || '']);

    // Who took part in which campaign, in ALL companies (for "has not given yet" reports): [campaign, code, 1=paid 2=pledged 3=both]
    step('קאמפעינס פון אלע קאמפעניס...');
    const since = (new Date().getFullYear() - 4) + '-01-01', hit = new Map();
    const addHit = (camp, code, k) => { if (!camp || code == null) return; const key = camp + '|' + code; hit.set(key, (hit.get(key) || 0) | k); };
    for (const r of db.rows(db.table('MPayments'), ['Code', 'CampaignNum', 'Date'], { col: 'CampaignNum', test: v => !!v }))
      if (!r.Date || r.Date >= since) addHit(r.CampaignNum, r.Code, 1);
    for (const r of db.rows(db.table('MCharges'), ['Code', 'CampaignNum', 'DueDate', 'DateE'], { col: 'CampaignNum', test: v => !!v }))
      if ((r.DateE || r.DueDate || '9') >= since) addHit(r.CampaignNum, r.Code, 2);
    out.camphits = Array.from(hit, ([key, k]) => { const [c, code] = key.split('|'); return [+c, +code, k]; });

    // Custom account fields (MAInfo), only the UDF ones: [code, type, value]
    step('UDF פעלדער...');
    out.udf = [];
    try {
      for (const r of db.rows(db.table('MAInfo'), ['Code', 'Type', 'Value'], { col: 'Type', test: v => /^\s*udf/i.test(v || '') }))
        if (acc.has(r.Code)) out.udf.push([r.Code, clean(r.Type), clean(r.Value)]);
    } catch (e) { /* optional */ }

    // Recurring credit-card plans (the owner asked for this, 2026-11). From MCCInfo ONLY these schedule
    // columns are decoded; the card number, name, expiry, Last4, track data, address, zip, notes and
    // comments are never read (the reader decodes only the columns listed here).
    step('קרעדיט קארד פלאנען...');
    out.ccplans = [];
    try {
      for (const r of db.rows(db.table('MCCInfo'), ['Code', 'ChargeFreq', 'StartDate', 'EndDate', 'Amount', 'CampaignNum', 'TempOnly'], { col: 'CompanyNum', test: isCo }))
        if (r.Code != null && !r.TempOnly && (r.Amount || 0) > 0) out.ccplans.push([r.Code, clean(r.ChargeFreq), r.StartDate || '', r.EndDate || '', r.Amount || 0, r.CampaignNum || 0]);
    } catch (e) { /* optional */ }

    step('קאמפעינס...');
    for (const r of db.rows(db.table('Campaigns'), ['CampaignNum', 'CampaignName', 'CampaignNameH']))
      out.campaigns[r.CampaignNum] = clean(r.CampaignNameH) || clean(r.CampaignName);

    step('נאטיצן...');
    try {
      for (const r of db.rows(db.table('MNote'), ['Code', 'NDate', 'Note', 'UserName', 'NCategory', 'Solicitor']))
        if (acc.has(r.Code) && clean(r.Note)) out.notes.push([r.Code, r.NDate || '', clean(r.Note).slice(0, 1000), clean(r.UserName), clean(r.NCategory)]);
    } catch (e) { /* optional */ }

    if (opts.tuition) { try { out.tuition = tuition(db, +opts.tuition, step, acc); } catch (e) { out.tuitionError = String(e && e.message || e); } }

    out.accounts = Array.from(acc.values());
    step('פארטיג');
    return out;
  }

  // Tuition (שכר לימוד) for one JLS company (the owner's is 15): charges, payments and students.
  // Students: ONLY number, family code, names, class and start/end dates are decoded – never SSNum, DOB,
  // medical, bus, legal-name or any other column.
  function tuition(db, co, step, acc) {
    const isCo = v => v === co;
    const t = { co, name: '', payments: [], charges: [], contracts: [], students: [] };
    for (const r of db.rows(db.table('Lists'), ['Type', 'Value', 'ValueNum']))
      if ((r.Type === 'FCompanies' || r.Type === 'Companies') && r.ValueNum === co) t.name = clean(r.Value);
    step('שכר לימוד – באצאלונגען...');
    for (const r of db.rows(db.table('MPayments'), ['PaymentNum', 'Code', 'Date', 'Amount', 'Type', 'PMethod', 'CheckNum', 'Notes', 'Refunded', 'Period', 'PStudentNum', 'ReceiptNum'], { col: 'Company', test: isCo }))
      t.payments.push([r.PaymentNum, r.Code, r.Date || '', r.Amount || 0, clean(r.Type || r.PMethod), clean(r.CheckNum), clean(r.Notes).slice(0, 150), r.Refunded || 0, clean(r.Period), r.PStudentNum || 0, clean(r.ReceiptNum)]);
    step('שכר לימוד – בילס (אלע יארן)...');
    for (const r of db.rows(db.table('MCharges'), ['ChargeNum', 'Code', 'DueDate', 'Amount', 'Paid', 'BalanceDue', 'Desc', 'Hold', 'Note', 'DateE', 'CStudentNum', 'Period', 'ItemNum'], { col: 'Company', test: isCo }))
      t.charges.push([r.ChargeNum, r.Code, r.DueDate || '', r.Amount || 0, r.Paid || 0, r.BalanceDue || 0, clean(r.Desc), r.Hold ? 1 : 0, clean(r.Note).slice(0, 150), r.DateE || '', r.CStudentNum || 0, clean(r.Period), clean(r.ItemNum)]);
    step('שכר לימוד – קאנטראקטן...');
    try {   // MYearly = the yearly contracts that create the monthly bills
      for (const r of db.rows(db.table('MYearly'), ['YearlyID', 'Code', 'DateStart', 'DateEnd', 'ItemNum', 'Desc', 'Amount', 'Type', 'Period', 'CompanyStudents', 'Scholarship', 'ContractNotes', 'Payment'], { col: 'Company', test: isCo }))
        t.contracts.push([r.YearlyID || 0, r.Code, r.DateStart || '', r.DateEnd || '', clean(r.ItemNum), clean(r.Desc), r.Amount || 0, clean(r.Type), clean(r.Period), r.CompanyStudents || 0, r.Scholarship ? 1 : 0, clean(r.ContractNotes).slice(0, 200), r.Payment ? 1 : 0]);
    } catch (e) { /* optional */ }
    // Only students this company ever BILLED (an MCharges row of this company with their CStudentNum) – the owner's rule.
    // Class and years come from their StudentDate rows of this company, or else from the bill dates.
    step('שכר לימוד – תלמידים...');
    const en = new Map();   // studentNum -> [{start, end, cls, period}]
    try {
      for (const r of db.rows(db.table('StudentDate'), ['StudentNum', 'DateStart', 'DateEnd', 'Period', 'Class', 'HebrewClass', 'Company'], { col: 'Company', test: isCo }))
        if (r.StudentNum) (en.get(r.StudentNum) || en.set(r.StudentNum, []).get(r.StudentNum)).push({ start: r.DateStart || '', end: r.DateEnd || '', cls: clean(r.HebrewClass) || clean(r.Class), period: clean(r.Period) });
    } catch (e) { /* table missing: no students rather than students of other schools */ }
    t.enroll = [];
    const today = new Date().toISOString().slice(0, 10), yearAgo = new Date(Date.now() - 300 * 864e5).toISOString().slice(0, 10);
    const billed = new Map();   // studentNum -> first/last bill date in this company
    t.charges.forEach(c => { if (!c[10]) return; const b = billed.get(c[10]) || { first: c[2] || '', last: c[2] || '' }; if (c[2] && (!b.first || c[2] < b.first)) b.first = c[2]; if (c[2] > b.last) b.last = c[2]; billed.set(c[10], b); });
    try {
      for (const r of db.rows(db.table('Students'), ['StudentNum', 'FamilyNum', 'Code', 'FName', 'LName', 'FNameH', 'LNameH'])) {
        const B = billed.get(r.StudentNum); if (!B) continue;   // owner's rule: only students this company ever billed
        const code = +clean(r.Code) || r.FamilyNum || 0; if (!code) continue;
        const L = (en.get(r.StudentNum) || []).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
        if (!L.length) L.push({ start: B.first, end: B.last < yearAgo ? B.last : '', cls: '', period: '' });   // no StudentDate row: use the bill dates
        const last = L[L.length - 1], start = L[0].start || B.first, end = (last.end && last.end < today) || B.last < yearAgo ? (last.end && last.end < today ? last.end : B.last) : '';
        t.students.push([r.StudentNum, code, clean(r.FName), clean(r.LName), clean(r.FNameH), clean(r.LNameH), last.cls, start, end]);
        L.forEach(x => t.enroll.push([r.StudentNum, x.period, x.start, x.end, x.cls]));
      }
    } catch (e) { /* optional */ }
    return t;
  }

  // Names only: every table with its column names/types and row count. Reads no values at all.
  const TYPES = { 1: 'yes/no', 2: 'byte', 3: 'int', 4: 'long', 5: 'money', 6: 'float', 7: 'double', 8: 'date', 9: 'binary', 10: 'text', 11: 'ole', 12: 'memo', 15: 'guid', 16: 'numeric' };
  function schema(bytes) {
    const db = new Jet(bytes), out = [];
    for (const name of Object.keys(db.tables).sort()) {
      try {
        const t = db.table(name);
        let n = 0; for (const _ of db.rows(t, [])) n++;
        out.push({ name, rows: n, cols: t.cols.map(c => c.name + ':' + (TYPES[c.type] || c.type)) });
      } catch (e) { out.push({ name, rows: -1, cols: [] }); }
    }
    return out;
  }

  const api = { Jet, extract, schema };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.JLS = api;
})(this);
