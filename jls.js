/* Jet 4 (.mdb) reader + JLS extractor. Works in browser and Node.
   Never reads credit-card, bank, SSN or password tables/columns. */
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

  function extract(bytes, company, progress) {
    company = company || 32;
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
        w: join(r.TitleEnglishW, r.FNameW), wh: join(r.TitleW, r.FNameWH), ln: clean(r.LName), co: clean(r.CompanyName),
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
      const item = [clean(r.Desc), fmtPhone(r.Phone)];
      if (r.Default) a.ph.unshift(item); else a.ph.push(item);
    }

    step('באצאלונגען (' + (out.companyName || company) + ')...');
    const isCo = v => v === company;
    for (const r of db.rows(db.table('MPayments'), ['PaymentNum', 'Code', 'Date', 'Amount', 'Type', 'CheckNum', 'CampaignNum', 'Solicitor', 'Notes', 'Refunded', 'PMethod'], { col: 'Company', test: isCo }))
      out.payments.push([r.PaymentNum, r.Code, r.Date || '', r.Amount || 0, clean(r.Type || r.PMethod), clean(r.CheckNum), r.CampaignNum || 0, clean(r.Solicitor), clean(r.Notes).slice(0, 300), r.Refunded || 0]);

    step('פלעדזשעס (' + (out.companyName || company) + ')...');
    for (const r of db.rows(db.table('MCharges'), ['ChargeNum', 'Code', 'DueDate', 'Amount', 'Paid', 'BalanceDue', 'CampaignNum', 'Desc', 'Solicitor', 'Hold', 'Note'], { col: 'Company', test: isCo }))
      out.pledges.push([r.ChargeNum, r.Code, r.DueDate || '', r.Amount || 0, r.Paid || 0, r.BalanceDue || 0, r.CampaignNum || 0, clean(r.Desc), clean(r.Solicitor), r.Hold ? 1 : 0, clean(r.Note).slice(0, 200)]);

    step('קאמפעינס...');
    for (const r of db.rows(db.table('Campaigns'), ['CampaignNum', 'CampaignName', 'CampaignNameH']))
      out.campaigns[r.CampaignNum] = clean(r.CampaignNameH) || clean(r.CampaignName);

    step('נאטיצן...');
    try {
      for (const r of db.rows(db.table('MNote'), ['Code', 'NDate', 'Note', 'UserName', 'NCategory', 'Solicitor']))
        if (acc.has(r.Code) && clean(r.Note)) out.notes.push([r.Code, r.NDate || '', clean(r.Note).slice(0, 1000), clean(r.UserName), clean(r.NCategory)]);
    } catch (e) { /* optional */ }

    out.accounts = Array.from(acc.values());
    step('פארטיג');
    return out;
  }

  const api = { Jet, extract };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.JLS = api;
})(this);
