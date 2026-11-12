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

// ---- dual date picker ----
// dateField('td', '2026-11-11', {clear:true}) -> HTML. The value lives in <input type=hidden id=td>.
function dateField(id, value, opt) {
  opt = opt || {};
  return `<div class="dfield" data-id="${id}" data-clear="${opt.clear ? 1 : 0}"><input type="hidden" id="${id}" value="${value || ''}"><div class="dtabs"><button type="button" data-c="heb">אידיש</button><button type="button" data-c="eng">ענגליש</button></div><div class="dbody"></div><div class="dnote"></div></div>`;
}
function initDateFields(root) {
  (root || document).querySelectorAll('.dfield').forEach(w => {
    if (w._init) return; w._init = true;
    const hid = w.querySelector('input[type=hidden]'), body = w.querySelector('.dbody'), note = w.querySelector('.dnote');
    const clearable = w.dataset.clear === '1';
    let mode = calPref();
    const todayIso = () => { const t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
    const showNote = () => {
      const v = hid.value;
      if (!v) { note.textContent = clearable ? 'ליידיג = אויטאמאטיש' : ''; return; }
      const [y, m, d] = v.split('-');
      note.textContent = '= ' + (mode === 'heb' ? (+d + '/' + +m + '/' + y) : HEB.fmtHeb(v));
    };
    const draw = () => {
      w.querySelectorAll('.dtabs button').forEach(b => b.classList.toggle('on', b.dataset.c === mode));
      const v = hid.value;
      const x = clearable ? '<button type="button" class="dclr" title="מעק אויס">✕</button>' : '';
      if (mode === 'eng') {
        body.innerHTML = `<input type="date" value="${v}">${x}`;
        body.querySelector('input').onchange = e => { hid.value = e.target.value; showNote(); };
      } else {
        const p = HEB.parts(v || todayIso());
        const curY = HEB.parts(todayIso()).y;
        const years = []; for (let y = curY - 2; y <= curY + 6; y++) years.push(y);
        if (!years.includes(p.y)) years.unshift(p.y);
        const ms = HEB.monthsOf(p.y);
        const m = ms.includes(p.m) ? p.m : (p.m.indexOf('Adar') === 0 ? (ms.includes('Adar') ? 'Adar' : 'Adar II') : ms[0]);
        body.innerHTML = `<select class="hd">${v ? '' : '<option value="">—</option>'}${Array.from({ length: 30 }, (_, i) => `<option value="${i + 1}" ${v && p.d === i + 1 ? 'selected' : ''}>${HEB.gem(i + 1)}</option>`).join('')}</select>
          <select class="hm">${ms.map(k => `<option value="${k}" ${k === m ? 'selected' : ''}>${HEB.MONTHS[k]}</option>`).join('')}</select>
          <select class="hy">${years.map(y => `<option value="${y}" ${y === p.y ? 'selected' : ''}>${HEB.gem(y)}</option>`).join('')}</select>${x}`;
        const upd = () => {
          const d = +body.querySelector('.hd').value; if (!d) return;
          const y = +body.querySelector('.hy').value;
          let mm = body.querySelector('.hm').value;
          const list = HEB.monthsOf(y);
          if (!list.includes(mm)) mm = mm.indexOf('Adar') === 0 ? (list.includes('Adar') ? 'Adar' : 'Adar II') : list[0];
          hid.value = HEB.toGreg(y, mm, d) || hid.value;
          if (body.querySelector('.hy').value !== String(HEB.parts(hid.value).y) || !list.includes(body.querySelector('.hm').value)) draw();
          showNote();
        };
        body.querySelectorAll('select').forEach(s => s.onchange = upd);
      }
      const c = body.querySelector('.dclr'); if (c) c.onclick = () => { hid.value = ''; draw(); };
      showNote();
    };
    w.querySelectorAll('.dtabs button').forEach(b => b.onclick = () => { mode = b.dataset.c; setCalPref(mode); draw(); });
    draw();
  });
}
