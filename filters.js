// YG Fund – 🔎 one filter for every list (v1.24, owner: "everywhere in the program I want to be able to filter").
// Each list has its own filter in ui.flt[key] (same keys as the bulk select: col-<tab>, acc, jr, tu, pl …).
// A filter is an object; every field that is set must match (AND):
//   udf  'UDF4' + vals ['1','2','3']   – the JLS custom field has one of these values (any value when vals is empty)
//   notCamp n / gaveCamp n             – did NOT / did pay or pledge to campaign n (any company, last ~4 years, JD.camphits)
//   plCamp n                           – has an open YG pledge (not on hold) for campaign n
//   plMonth true                       – has an open YG pledge due by the end of this month
//   tag, who ('' / '__none' / '__me' / a name), minTotal (YG total ≥), gaveSince / noGiftSince (date of last YG gift)
//   tuition: st ('ok'|'fix'|'ign'), minDue (owes now ≥)
const fltOf = k => { ui.flt = ui.flt || {}; return ui.flt[k] || {}; };
const fltActive = k => Object.keys(fltOf(k)).some(x => { const v = fltOf(k)[x]; return Array.isArray(v) ? v.length : v !== '' && v != null && v !== false; });
function fltMatch(f, code) {
  if (!f) return true;
  code = +code;
  if (f.udf) {
    const v = (jrIndex().udf.get(code) || {})[String(f.udf).toUpperCase()];
    if (!v || (f.vals && f.vals.length && !v.some(x => f.vals.includes(String(x).trim())))) return false;
  }
  if (f.notCamp && (jrIndex().hits.get(+f.notCamp) || new Map()).has(code)) return false;
  if (f.gaveCamp && !(jrIndex().hits.get(+f.gaveCamp) || new Map()).has(code)) return false;
  if (f.plCamp || f.plMonth) {
    const g = IDX.pl.get(code), eom = iso(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
    if (!g || !g.list.some(c => !c[9] && c[5] > 0.009 && (!f.plCamp || +c[6] === +f.plCamp) && (!f.plMonth || !c[2] || c[2] <= eom))) return false;
  }
  if (f.tag && !(typeof tagsOf === 'function' && tagsOf(code).includes(f.tag))) return false;
  if (f.who) {
    const w = (S.acct[code] || {})[AREA === 'tu' ? 'tuWho' : 'assigned'] || '';
    if (f.who === '__none' ? w : f.who === '__me' ? w !== me : w !== f.who) return false;
  }
  const g = IDX.yg.get(code) || { total: 0, last: '' };
  if (f.minTotal && g.total < +f.minTotal) return false;
  if (f.gaveSince && !(g.last && g.last >= f.gaveSince)) return false;
  if (f.noGiftSince && g.last && g.last >= f.noGiftSince) return false;
  if ((f.st || f.minDue) && AREA === 'tu') {
    const fam = TU && !TU.missing ? tuCalc().L.find(x => x.code === code) : null;
    if (!fam) return false;
    if (f.st && (!fam.st || fam.st.k !== f.st)) return false;
    if (f.minDue && fam.due < +f.minDue) return false;
  }
  return true;
}
const fltCodes = (k, codes) => fltActive(k) ? codes.filter(c => fltMatch(fltOf(k), c)) : codes;
const fltRows = (k, rows, get) => fltActive(k) ? rows.filter(r => fltMatch(fltOf(k), get(r))) : rows;

function fltLabel(k) {
  const f = fltOf(k), L = [], camp = n => '#' + n + ' ' + ((JD.campaigns || {})[n] || '');
  if (f.udf) L.push(f.udf + (f.vals && f.vals.length ? ' = ' + f.vals.join(',') : ''));
  if (f.notCamp) L.push('נישט געגעבן: ' + camp(f.notCamp));
  if (f.gaveCamp) L.push('יא געגעבן: ' + camp(f.gaveCamp));
  if (f.plCamp) L.push('פלעדזש: ' + camp(f.plCamp));
  if (f.plMonth) L.push('פלעדזש דעם חודש');
  if (f.tag) L.push('🏷️ ' + f.tag);
  if (f.who) L.push('👤 ' + (f.who === '__none' ? 'נישט צוגעטיילט' : f.who === '__me' ? 'מיינע' : f.who));
  if (f.minTotal) L.push('ס"ה ≥ ' + money(f.minTotal));
  if (f.gaveSince) L.push('געגעבן זינט ' + fmtD(f.gaveSince));
  if (f.noGiftSince) L.push('נישט געגעבן זינט ' + fmtD(f.noGiftSince));
  if (f.st && typeof TU_ST !== 'undefined' && TU_ST[f.st]) L.push(TU_ST[f.st][0]);
  if (f.minDue) L.push('שולדיג ≥ ' + money(f.minDue));
  return L;
}
// The button + the active conditions as chips. `after` = JS to run after a change (re-render the list).
function fltBar(k, after) {
  window._fltAfter = window._fltAfter || {}; window._fltAfter[k] = after;
  const L = fltLabel(k);
  return `<span class="fltbar"><button class="btn ${L.length ? 'gold' : 'ghost'} sm" onclick="fltForm('${k}')">🔎 פילטער${L.length ? ' (' + L.length + ')' : ''}</button>${L.map(t => `<span class="fltchip">${esc(t)}</span>`).join('')}${L.length ? `<button class="btn ghost sm" onclick="fltClear('${k}')">✕</button>` : ''}</span>`;
}
function fltRun(k) { const a = (window._fltAfter || {})[k]; try { if (a) new Function(a)(); else render(); } catch (e) { render(); } }
function fltClear(k) { ui.flt = ui.flt || {}; ui.flt[k] = {}; fltRun(k); }
function fltForm(k) {
  const f = fltOf(k), tu = AREA === 'tu', X = JD && JD.udf ? jrIndex() : null;
  const types = X ? [...X.types.keys()].filter(t => /^UDF/i.test(t)).sort() : [];
  const camps = X && typeof ygCamps === 'function' ? [...ygCamps()].filter(n => (JD.campaigns || {})[n] || X.campN.has(n)).sort((a, b) => b - a) : [];
  const allCamps = X ? [...X.campN.keys()].sort((a, b) => b - a) : [];
  const cOpt = (L, cur) => '<option value="">—</option>' + L.map(n => `<option value="${n}" ${+cur === +n ? 'selected' : ''}>#${n} ${esc((JD.campaigns || {})[n] || '')}</option>`).join('');
  const tags = typeof allTags === 'function' ? allTags() : (typeof PRESET_TAGS !== 'undefined' ? PRESET_TAGS : []);
  modal(`<h2>🔎 פילטער</h2><p class="sub">אלעס וואס איר פילט אויס מוז שטימען. ליידיג = נישט קיין חילוק.</p>
   <div class="grid2">
    ${X ? `<label class="f">JLS פעלד (UDF)<select id="fu"><option value="">—</option>${types.map(t => `<option ${t === f.udf ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label class="f">ווערט(ן), מיט קאמעס (למשל 1,2,3)<input id="fv" value="${esc((f.vals || []).join(','))}" placeholder="ליידיג = סיי וועלכע"></label>
    <label class="f">❌ נאך נישט געגעבן צו קאמפעין<select id="fnc">${cOpt(camps.length ? camps : allCamps, f.notCamp)}</select></label>
    <label class="f">✅ יא געגעבן צו קאמפעין<select id="fgc">${cOpt(camps.length ? camps : allCamps, f.gaveCamp)}</select></label>` : ''}
    ${!tu ? `<label class="f">💳 האט א פלעדזש פאר קאמפעין<select id="fpc">${cOpt(camps, f.plCamp)}</select></label>
    <label style="display:flex;gap:8px;align-items:center;font-size:14px;align-self:end"><input type="checkbox" id="fpm" ${f.plMonth ? 'checked' : ''}> 💳 פלעדזש פעליג דעם חודש</label>
    <label class="f">YG סך הכל לכל הפחות $<input id="fmt" type="number" value="${esc(f.minTotal || '')}"></label>
    <div></div>
    <label class="f">לעצטע נדבה זינט${dateField('fgs', f.gaveSince || '', { clear: true })}</label>
    <label class="f">נישט געגעבן זינט${dateField('fng', f.noGiftSince || '', { clear: true })}</label>` : `
    <label class="f">ווי ער באצאלט<select id="fst"><option value="">—</option>${['ok', 'fix', 'ign'].map(x => `<option value="${x}" ${f.st === x ? 'selected' : ''}>${TU_ST[x][0]}</option>`).join('')}</select></label>
    <label class="f">שולדיג יעצט לכל הפחות $<input id="fmd" type="number" value="${esc(f.minDue || '')}"></label>`}
    <label class="f">🏷️ פלאג<select id="ftg"><option value="">—</option>${tags.map(t => `<option ${t === f.tag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label class="f">👤 ווער קאלט<select id="fwh"><option value="">—</option><option value="__me" ${f.who === '__me' ? 'selected' : ''}>מיינע</option><option value="__none" ${f.who === '__none' ? 'selected' : ''}>נישט צוגעטיילט</option>${USERS().map(u => `<option ${f.who === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
   </div>
   <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" onclick="closeM()">Back</button><button class="btn ghost" onclick="closeM();fltClear('${k}')">✕ אויסמעקן</button><button class="btn" onclick="fltSave('${k}')">🔎 פילטער</button></div>`);
}
function fltSave(k) {
  const v = id => { const e = document.getElementById(id); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : ''; };
  const f = { udf: v('fu'), vals: String(v('fv') || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean), notCamp: v('fnc'), gaveCamp: v('fgc'), plCamp: v('fpc'), plMonth: v('fpm') || false,
    minTotal: v('fmt'), gaveSince: v('fgs'), noGiftSince: v('fng'), st: v('fst'), minDue: v('fmd'), tag: v('ftg'), who: v('fwh') };
  if (!f.udf) f.vals = [];
  Object.keys(f).forEach(x => { if (f[x] === '' || f[x] === false || (Array.isArray(f[x]) && !f[x].length)) delete f[x]; });
  ui.flt = ui.flt || {}; ui.flt[k] = f;
  closeM(); fltRun(k);
}
