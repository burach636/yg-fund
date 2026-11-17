/* Hebrew / English calendar helpers + dual date picker */
'use strict';
const HEB = (() => {
  const fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { year: 'numeric', month: 'long', day: 'numeric' });
  const MONTHS = { Tishri: 'תשרי', Heshvan: 'חשון', Kislev: 'כסלו', Tevet: 'טבת', Shevat: 'שבט', 'Adar I': 'אדר א\'', 'Adar II': 'אדר ב\'', Adar: 'אדר', Nisan: 'ניסן', Iyar: 'אייר', Sivan: 'סיון', Tamuz: 'תמוז', Av: 'אב', Elul: 'אלול' };
  const isLeap = y => ((7 * y + 1) % 19) < 7;
  const monthsOf = y => ['Tishri', 'Heshvan', 'Kislev', 'Tevet', 'Shevat'].concat(isLeap(y) ? ['Adar I', 'Adar II'] : ['Adar'], ['Nisan', 'Iyar', 'Sivan', 'Tamuz', 'Av', 'Elul']);
  const cache = new Map();
  function parts(iso) {
    if (!iso) return null;
    let r = cache.get(iso);
    if (r) return r;
    const [Y, M, D] = iso.split('-').map(Number);
    const p = fmt.formatToParts(new Date(Y, M - 1, D, 12));
    r = { y: +p.find(x => x.type === 'year').value, m: p.find(x => x.type === 'month').value, d: +p.find(x => x.type === 'day').value };
    cache.set(iso, r);
    return r;
  }
  function gem(n) {
    const L = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
    n = n % 1000; let s = '';
    while (n > 0) {
      if (n === 15) { s += 'טו'; break; } if (n === 16) { s += 'טז'; break; }
      for (const [v, c] of L) if (n >= v) { s += c; n -= v; break; }
    }
    return s.length === 1 ? s + '\'' : s.slice(0, -1) + '"' + s.slice(-1);
  }
  function fmtHeb(iso, withYear = true) {
    const p = parts(iso); if (!p) return '';
    return gem(p.d) + ' ' + MONTHS[p.m] + (withYear ? ' ' + gem(p.y) : '');
  }
  const toIso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function toGreg(y, m, d) {
    // scan the Gregorian days that can fall in Hebrew year y
    const start = new Date(y - 3761, 7, 15);
    let best = null;
    for (let i = 0; i < 420; i++) {
      const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const p = parts(toIso(dt));
      if (p.y === y && p.m === m) { if (p.d === d) return toIso(dt); best = toIso(dt); }
      else if (best) break;
    }
    return best;   // e.g. day 30 in a 29-day month -> last day of month
  }
  return { parts, fmtHeb, gem, monthsOf, MONTHS, toGreg, isLeap };
})();

// ---- 📖 parsha of the week + Yomim Tovim / fast days (v1.39, owner; chutz la'aretz, 2 days Yom Tov) ----
// HEBEV.events(iso) -> [{t: text, k: 'yt'|'fast'|'min'|'rc'|'par'}]. The parsha is worked out per year: the Shabbosim
// that are not Yom Tov get the parshiyos in order, with the usual pairs joined when there are fewer Shabbosim
// (anchors: Bamidbar before Shavuos, Devarim on Shabbos Chazon, Nitzavim before Rosh Hashana).
const HEBEV = (() => {
  const P = ['בראשית', 'נח', 'לך לך', 'וירא', 'חיי שרה', 'תולדות', 'ויצא', 'וישלח', 'וישב', 'מקץ', 'ויגש', 'ויחי', 'שמות', 'וארא', 'בא', 'בשלח', 'יתרו', 'משפטים', 'תרומה', 'תצוה', 'כי תשא', 'ויקהל', 'פקודי', 'ויקרא', 'צו', 'שמיני', 'תזריע', 'מצורע', 'אחרי מות', 'קדושים', 'אמור', 'בהר', 'בחקותי', 'במדבר', 'נשא', 'בהעלותך', 'שלח', 'קרח', 'חקת', 'בלק', 'פינחס', 'מטות', 'מסעי', 'דברים', 'ואתחנן', 'עקב', 'ראה', 'שופטים', 'כי תצא', 'כי תבוא', 'נצבים', 'וילך', 'האזינו'];
  const dt = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const add = (iso, n) => { const d = dt(iso); d.setDate(d.getDate() + n); return calIso(d); };
  const dow = iso => dt(iso).getDay();
  const diff = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
  const G = (y, m, d) => HEB.toGreg(y, m, d);
  // Shabbos that is Yom Tov / Chol Hamoed (no weekly parsha)
  const ytShabbos = p => (p.m === 'Tishri' && (p.d <= 2 || p.d === 10 || (p.d >= 15 && p.d <= 23))) || (p.m === 'Nisan' && p.d >= 15 && p.d <= 22) || (p.m === 'Sivan' && (p.d === 6 || p.d === 7));
  const early = y => {   // the Shabbosim between Rosh Hashana and Sukkos (not Yom Kippur)
    const out = []; let d = G(y, 'Tishri', 3);
    for (let i = 0; i < 12; i++, d = add(d, 1)) { const p = HEB.parts(d); if (dow(d) === 6 && p.d !== 10) out.push(d); }
    return out;
  };
  const yc = new Map();
  function year(y) {   // Map iso (Shabbos) -> parsha text, for Hebrew year y
    if (yc.has(y)) return yc.get(y);
    const M = new Map(), nrh = G(y + 1, 'Tishri', 1), E = early(y), kNext = early(y + 1).length;
    if (E.length === 2) { M.set(E[0], P[51]); M.set(E[1], P[52]); } else if (E.length === 1) M.set(E[0], P[52]);
    const main = []; let d = add(G(y, 'Tishri', 24), 0); while (dow(d) !== 6) d = add(d, 1);
    for (; d < nrh; d = add(d, 7)) if (!ytShabbos(HEB.parts(d))) main.push(d);
    const shav = G(y, 'Sivan', 6), av9 = G(y, 'Av', 9);
    const iB = Math.min(33, main.filter(x => x < shav).length - 1),   // a leap year with a spare Shabbos reads Naso before Shavuos
      iD = main.filter(x => x <= av9).length - 1;
    const seg = (dates, from, to, pairs, last) => {   // readings from..to on these Shabbosim, joining pairs (in order) as needed
      let need = (to - from + 1) - dates.length; const join = new Set();
      for (const [a] of pairs) if (need > 0) { join.add(a); need--; }
      let r = from;
      dates.forEach((x, i) => { let t = P[r]; if (join.has(r)) { t += '-' + P[r + 1]; r++; } if (i === dates.length - 1 && last) t += last; M.set(x, t); r++; });
    };
    seg(main.slice(0, iB + 1), 0, 33, [[26], [28], [31], [21]]);
    seg(main.slice(iB + 1, iD + 1), 34, 43, [[41], [38]]);
    seg(main.slice(iD + 1), 44, 50, [], kNext === 1 ? '-' + P[51] : '');
    yc.set(y, M); return M;
  }
  const kc = new Map();
  const kislev25 = y => { if (!kc.has(y)) kc.set(y, G(y, 'Kislev', 25)); return kc.get(y); };
  function events(iso) {
    const p = HEB.parts(iso); if (!p) return [];
    const { y, m, d } = p, w = dow(iso), L = [], E = (t, k) => L.push({ t, k }), leap = HEB.isLeap(y), adar = leap ? 'Adar II' : 'Adar';
    if (w === 6) { const t = year(y).get(iso); if (t) E('פ\' ' + t, 'par'); }
    if (m === 'Tishri') {
      if (d === 1 || d === 2) E('ראש השנה', 'yt');
      if ((d === 3 && w !== 6) || (d === 4 && w === 0)) E('צום גדליה', 'fast');
      if (w === 6 && d >= 3 && d <= 9) E('שבת שובה', 'min');
      if (d === 9) E('ערב יום כיפור', 'min');
      if (d === 10) E('יום כיפור', 'fast');
      if (d === 14) E('ערב סוכות', 'min');
      if (d === 15 || d === 16) E('סוכות', 'yt');
      if (d >= 17 && d <= 20) E('חול המועד סוכות', 'min');
      if (d === 21) E('הושענא רבה', 'min');
      if (d === 22) E('שמיני עצרת', 'yt');
      if (d === 23) E('שמחת תורה', 'yt');
    }
    const ch = diff(kislev25(y), iso); if (ch >= 0 && ch < 8) E('חנוכה – ' + (ch + 1) + ' ליכט', 'min');
    if (m === 'Tevet' && d === 10) E('עשרה בטבת', 'fast');
    if (m === 'Shevat' && d === 15) E('ט"ו בשבט', 'min');
    if (leap && m === 'Adar I') { if (d === 14) E('פורים קטן', 'min'); if (d === 15) E('שושן פורים קטן', 'min'); }
    if (m === adar) {
      if ((d === 13 && w !== 6) || (d === 11 && w === 4)) E('תענית אסתר', 'fast');
      if (d === 14) E('פורים', 'yt');
      if (d === 15) E('שושן פורים', 'min');
    }
    if (m === 'Nisan') {
      if (w === 6 && d >= 8 && d <= 14) E('שבת הגדול', 'min');
      if (d === 14) E('ערב פסח', 'min');
      if (d === 15 || d === 16) E('פסח', 'yt');
      if (d >= 17 && d <= 20) E('חול המועד פסח', 'min');
      if (d === 21) E('שביעי של פסח', 'yt');
      if (d === 22) E('אחרון של פסח', 'yt');
    }
    if (m === 'Iyar') { if (d === 14) E('פסח שני', 'min'); if (d === 18) E('ל"ג בעומר', 'min'); }
    if (m === 'Sivan') { if (d === 5) E('ערב שבועות', 'min'); if (d === 6 || d === 7) E('שבועות', 'yt'); }
    if (m === 'Tamuz' && ((d === 17 && w !== 6) || (d === 18 && w === 0))) E('שבעה עשר בתמוז', 'fast');
    if (m === 'Av') {
      if (w === 6 && d >= 3 && d <= 9) E('שבת חזון', 'min');
      if ((d === 9 && w !== 6) || (d === 10 && w === 0)) E('תשעה באב' + (d === 10 ? ' (נדחה)' : ''), 'fast');
      if (w === 6 && d >= 10 && d <= 16) E('שבת נחמו', 'min');
      if (d === 15) E('ט"ו באב', 'min');
    }
    if (m === 'Elul') {
      if (d === 29) E('ערב ראש השנה', 'min');
      if (w === 6) { const rh = G(y + 1, 'Tishri', 1), back = diff(iso, rh); if (back > 0 && back <= (dow(rh) === 1 || dow(rh) === 2 ? 10 : 7) && back > (dow(rh) === 1 || dow(rh) === 2 ? 3 : 0)) E('מוצ"ש – סליחות', 'min'); }
    }
    if ((d === 1 && m !== 'Tishri') || d === 30) E('ראש חודש', 'rc');
    return L;
  }
  return { events, year };
})();

// ---- date display preference: 'heb' | 'eng' (per computer) ----
function calPref() { try { return localStorage.getItem('yg_cal') || 'heb'; } catch (e) { return 'heb'; } }
function setCalPref(v) { try { localStorage.setItem('yg_cal', v); } catch (e) { } }

// Due-date style display: main calendar first, the other one small
function fmtDual(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-'), eng = +d + '/' + +m + '/' + y, heb = HEB.fmtHeb(iso);
  return calPref() === 'heb' ? `${heb} <small class="dim">${eng}</small>` : `${eng} <small class="dim">${heb}</small>`;
}

// ---- date picker: one box with the whole month, Jewish and English dates together (v1.19) ----
// dateField('td', '2026-11-11', {clear:true}) -> HTML. The value lives in <input type=hidden id=td> (yyyy-mm-dd).
function dateField(id, value, opt) {
  opt = opt || {};
  return `<div class="dfield" data-clear="${opt.clear ? 1 : 0}"><input type="hidden" id="${id}" value="${value || ''}"><button type="button" class="dbtn">📅 <span class="dtxt"></span></button>${opt.clear ? '<button type="button" class="dclr" title="מעק אויס">✕</button>' : ''}</div>`;
}
const CAL_WD = [['א\'', 'Sun'], ['ב\'', 'Mon'], ['ג\'', 'Tue'], ['ד\'', 'Wed'], ['ה\'', 'Thu'], ['ו\'', 'Fri'], ['ש"ק', 'Sat']];
const CAL_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const calIso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const calToday = () => calIso(new Date());
function calText(v, clearable) {
  if (!v) return clearable ? '<span class="dim">ליידיג – דריקט צו קלייבן</span>' : '—';
  const [y, m, d] = v.split('-'), dt = new Date(+y, +m - 1, +d);
  return `<b>${CAL_WD[dt.getDay()][0]} ${HEB.fmtHeb(v)}</b> <small class="dim">${CAL_WD[dt.getDay()][1]} ${+m}/${+d}/${y}</small>`;
}
function initDateFields(root) {
  (root || document).querySelectorAll('.dfield').forEach(w => {
    if (w._init) return; w._init = true;
    const hid = w.querySelector('input[type=hidden]'), txt = w.querySelector('.dtxt'), clearable = w.dataset.clear === '1';
    const show = () => { txt.innerHTML = calText(hid.value, clearable); };
    const set = v => { hid.value = v; show(); hid.dispatchEvent(new Event('change', { bubbles: true })); };
    w.querySelector('.dbtn').onclick = () => calOpen(w, hid.value, set, clearable);
    const c = w.querySelector('.dclr'); if (c) c.onclick = () => set('');
    show();
  });
}
function calClose() { const p = document.getElementById('calpop'); if (p) p.remove(); document.removeEventListener('mousedown', calOutside, true); }
function calOutside(e) { const p = document.getElementById('calpop'); if (p && !p.contains(e.target) && !e.target.closest('.dbtn')) calClose(); }
function calOpen(w, value, set, clearable) {
  calClose();
  const pop = document.createElement('div'); pop.id = 'calpop'; document.body.appendChild(pop);
  const base = value || calToday(), hp = HEB.parts(base), [gy, gm] = base.split('-').map(Number);
  const st = { mode: calPref(), hy: hp.y, hm: hp.m, gy, gm: gm - 1 };
  const place = () => {
    const r = w.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    let top = r.bottom + 4; if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 4);
    let left = r.right - pw; if (left < 8) left = 8; if (left + pw > innerWidth - 8) left = innerWidth - pw - 8;
    pop.style.top = top + 'px'; pop.style.left = left + 'px';
  };
  const days = () => {   // the dates (yyyy-mm-dd) of the month shown
    const out = [];
    if (st.mode === 'heb') { let d = HEB.toGreg(st.hy, st.hm, 1); while (d) { const p = HEB.parts(d); if (p.m !== st.hm || p.y !== st.hy) break; out.push(d); const x = new Date(...d.split('-').map((n, i) => i === 1 ? n - 1 : +n)); x.setDate(x.getDate() + 1); d = calIso(x); } }
    else { const n = new Date(st.gy, st.gm + 1, 0).getDate(); for (let i = 1; i <= n; i++) out.push(calIso(new Date(st.gy, st.gm, i))); }
    return out;
  };
  const move = k => {
    if (st.mode === 'heb') { const ms = HEB.monthsOf(st.hy); let i = ms.indexOf(st.hm) + k; if (i < 0) { st.hy--; const m2 = HEB.monthsOf(st.hy); st.hm = m2[m2.length - 1]; } else if (i >= ms.length) { st.hy++; st.hm = 'Tishri'; } else st.hm = ms[i]; }
    else { st.gm += k; if (st.gm < 0) { st.gm = 11; st.gy--; } if (st.gm > 11) { st.gm = 0; st.gy++; } }
    draw();
  };
  const draw = () => {
    const D = days(), t = calToday(), first = new Date(...D[0].split('-').map((n, i) => i === 1 ? n - 1 : +n)).getDay();
    const a = D[0], z = D[D.length - 1];
    const title = st.mode === 'heb' ? `${HEB.MONTHS[st.hm]} ${HEB.gem(st.hy)}` : `${CAL_EN[st.gm]} ${st.gy}`;
    const [ay, am] = a.split('-').map(Number), [zy, zm] = z.split('-').map(Number), pa = HEB.parts(a), pz = HEB.parts(z);
    const sub = st.mode === 'heb' ? (am === zm ? CAL_EN[am - 1] + ' ' + ay : CAL_EN[am - 1].slice(0, 3) + (ay !== zy ? ' ' + ay : '') + ' – ' + CAL_EN[zm - 1].slice(0, 3) + ' ' + zy)
      : (pa.m === pz.m ? HEB.MONTHS[pa.m] + ' ' + HEB.gem(pa.y) : HEB.MONTHS[pa.m] + ' – ' + HEB.MONTHS[pz.m] + ' ' + HEB.gem(pz.y));
    pop.innerHTML = `<div class="cph"><button type="button" class="cpn" data-k="-1" title="פריער">›</button><div class="cpt"><b>${title}</b><small>${sub}</small></div><button type="button" class="cpn" data-k="1" title="ווייטער">‹</button></div>
     <div class="cpm"><button type="button" data-m="heb" class="${st.mode === 'heb' ? 'on' : ''}">אידישער חודש</button><button type="button" data-m="eng" class="${st.mode === 'eng' ? 'on' : ''}">English month</button></div>
     <div class="cpg">${CAL_WD.map(([h, e]) => `<div class="cpw">${h}<small>${e}</small></div>`).join('')}${'<div></div>'.repeat(first)}${D.map(d => { const p = HEB.parts(d), [y, m, dd] = d.split('-').map(Number);
      const big = st.mode === 'heb' ? HEB.gem(p.d) : dd, small = st.mode === 'heb' ? (dd === 1 || d === a ? CAL_EN[m - 1].slice(0, 3) + ' ' : '') + dd : (p.d === 1 || d === a ? HEB.MONTHS[p.m] + ' ' : '') + HEB.gem(p.d);
      const ev = HEBEV.events(d), main = ['yt', 'fast', 'par', 'min', 'rc'].map(k => ev.find(x => x.k === k)).find(Boolean);
      return `<button type="button" class="cpd${d === value ? ' sel' : ''}${d === t ? ' today' : ''}${new Date(y, m - 1, dd).getDay() === 6 ? ' sh' : ''}${main ? ' ev-' + main.k : ''}" data-d="${d}"${ev.length ? ` title="${ev.map(x => x.t).join(' · ')}"` : ''}><b>${big}</b><small>${small}</small>${main ? `<i>${main.t.replace(/^פ' /, '').replace(/^חול המועד .*/, 'חוה"מ').replace(' – ', ' ')}</i>` : ''}</button>`; }).join('')}</div>
     <div class="cpf"><button type="button" class="btn ghost sm" data-d="${t}">Today</button>${clearable ? '<button type="button" class="btn ghost sm" data-d="">✕ Clear</button>' : ''}<div class="spacer"></div><button type="button" class="btn ghost sm" data-x="1">Close</button></div>`;
    pop.querySelectorAll('.cpn').forEach(b => b.onclick = () => move(+b.dataset.k));
    pop.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      const ref = D[Math.min(14, D.length - 1)];
      st.mode = b.dataset.m; setCalPref(st.mode);
      const p = HEB.parts(ref), [y, m] = ref.split('-').map(Number); st.hy = p.y; st.hm = p.m; st.gy = y; st.gm = m - 1; draw();
    });
    pop.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { set(b.dataset.d); calClose(); });
    pop.querySelector('[data-x]').onclick = calClose;
    place();
  };
  draw();
  setTimeout(() => document.addEventListener('mousedown', calOutside, true), 0);
}
