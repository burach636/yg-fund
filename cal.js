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
      return `<button type="button" class="cpd${d === value ? ' sel' : ''}${d === t ? ' today' : ''}${new Date(y, m - 1, dd).getDay() === 6 ? ' sh' : ''}" data-d="${d}"><b>${big}</b><small>${small}</small></button>`; }).join('')}</div>
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
