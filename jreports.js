/* YG Fund – "רופארטס": call lists built from JLS data. Loaded before app.js; functions only.
   A report = accounts whose UDF field (MAInfo) has one of the chosen values, who did NOT pledge or pay
   to a chosen campaign (any company), optionally only with a tag. Definitions are events of kind `jrep`. */
'use strict';
let JR = null;   // indexes built from the JLS data: udf by code, campaign hits
function jrIndex() {
  if (JR && JR.v === JD) return JR;
  const udf = new Map(), types = new Map(), hits = new Map(), campN = new Map();
  (JD.udf || []).forEach(([c, t, v]) => {
    const T = (t || '').trim().toUpperCase(), V = (v || '').trim();
    let m = udf.get(c); if (!m) udf.set(c, m = {});
    (m[T] || (m[T] = [])).push(V);
    let tv = types.get(T); if (!tv) types.set(T, tv = new Map());
    tv.set(V, (tv.get(V) || 0) + 1);
  });
  (JD.camphits || []).forEach(([camp, c, k]) => {
    let m = hits.get(camp); if (!m) hits.set(camp, m = new Map());
    m.set(c, (m.get(c) || 0) | k); campN.set(camp, (campN.get(camp) || 0) + 1);
  });
  return (JR = { v: JD, udf, types, hits, campN });
}
const jrDefs = () => Object.entries(S.jrep).filter(([, d]) => !d.del).map(([id, d]) => Object.assign({ id }, d)).sort((a, b) => (a.ord || 0) - (b.ord || 0) || (a.name || '').localeCompare(b.name || ''));
// The report the owner asked for first (created once, then editable like any other)
async function jrEnsureDefault() {
  if (S.jrep.r983) return;
  await emit('jrep', 'r983', { name: 'דינער מהרי"ט 2026 – נאך נישט געגעבן', udf: 'UDF4', vals: ['1', '2', '3'], camp: 983, active: true, ord: 1 });
}
function jrRun(d) {
  const X = jrIndex(), T = (d.udf || '').trim().toUpperCase(), vals = new Set((d.vals || []).map(v => String(v).trim()));
  const hit = X.hits.get(+d.camp) || new Map();
  return JD.accounts.filter(a => {
    if (d.active && a.x) return false;
    if (T) { const v = (X.udf.get(a.c) || {})[T]; if (!v || (vals.size && !v.some(x => vals.has(x)))) return false; }
    if (d.camp && hit.has(a.c)) return false;
    if (d.tag && !tagsOf(a.c).includes(d.tag)) return false;
    return true;
  }).sort((x, y) => ((IDX.yg.get(y.c) || {}).total || 0) - ((IDX.yg.get(x.c) || {}).total || 0) || x._k.localeCompare(y._k, 'he'));
}
function vJrep() {
  if (!JD.udf || !JD.camphits) {
    $('#main').innerHTML = `<h2>📑 רופארטס</h2><div class="empty">כדי די רופארטס זאלן ארבעטן, דריקט איינמאל <b>"⟳ דערהיינטיג פון JLS"</b> (עס נעמט יעצט אויך די UDF פעלדער און ווער האט געגעבן צו יעדן קאמפעין).</div>`;
    return;
  }
  if (!S.jrep.r983) { jrEnsureDefault().then(render); }
  const D = jrDefs(), cur = D.find(d => d.id === ui.jr) || D[0];
  window._ln = lastNotes();
  const all = cur ? jrRun(cur) : [];
  // search box + "who calls" filter (mine / not assigned / a user)
  const q = (ui.jrQ || '').trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean), qd = q.replace(/\D/g, ''), who = ui.jrWho || '';
  const L = all.filter(a => {
    if (words.length && !(words.every(w => a._s.includes(w)) || (qd.length >= 4 && a._s.includes(qd)))) return false;
    const as = (S.acct[a.c] || {}).assigned || '';
    if (who === '__me' && as !== me) return false;
    if (who === '__none' && as) return false;
    if (who && who !== '__me' && who !== '__none' && as !== who) return false;
    return true;
  });
  window._jrL = L; ui.jrN = ui.jrN || 200;
  const X = jrIndex(), T = cur ? (cur.udf || '').toUpperCase() : '';
  $('#main').innerHTML = `<div class="row"><div><h2>📑 רופארטס</h2><p class="sub">ליסטעס פון JLS צו קאלן. קליקט אויף א רופארט, און עס ווייזט ווער עס פאסט.</p></div><div class="spacer"></div><button class="btn gold" onclick="jrForm()">+ נייער רופארט</button></div>
  <div class="chips" style="margin-bottom:12px">${D.map(d => `<button class="chip ${cur && d.id === cur.id ? 'on' : ''}" onclick="ui.jr='${d.id}';ui.jrN=200;vJrep()">${esc(d.name)}</button>`).join('')}</div>
  ${cur ? `<div class="box" style="margin-bottom:12px"><div class="row" style="margin:0"><div><b style="font-size:17px;color:var(--navy)">${esc(cur.name)}</b><div class="sub" style="margin:2px 0 0">
    ${T ? `<b>${esc(T)}</b> = ${cur.vals && cur.vals.length ? cur.vals.map(esc).join(', ') : 'יעדער ווערט'}` : 'אלע אקאונטס'}
    ${cur.camp ? ` · <b>נישט</b> געגעבן און נישט צוגעזאגט צו: <b>${esc(JD.campaigns[cur.camp] || '')}</b> #${cur.camp}` : ''}${cur.tag ? ` · 🏷️ ${esc(cur.tag)}` : ''}${cur.active ? ' · נאר אקטיווע' : ''}</div></div>
    <div class="spacer"></div><b style="font-size:22px;color:var(--navy)">${L.length.toLocaleString()}</b><span class="sub" style="margin:0">מענטשן${L.length !== all.length ? ' (פון ' + all.length.toLocaleString() + ')' : ''}</span>
    <button class="btn ghost sm" onclick="jrForm('${cur.id}')">✏️ טויש</button><button class="btn ghost sm" onclick="jrExcel()">⬇ Excel</button></div></div>
  <div class="row"><input id="jrq" placeholder="🔍 זוך: נאמען, טעלעפאן, אדרעס, #נומער..." value="${esc(ui.jrQ || '')}" style="flex:1;min-width:240px;font-size:15px">
   <div class="chips">${[['', 'אלע'], ['__me', '👤 נאר מיינע'], ['__none', 'נישט צוגעטיילט']].map(([k, l]) => `<button class="chip ${who === k ? 'on' : ''}" onclick="ui.jrWho='${k}';ui.jrN=200;vJrep()">${l}</button>`).join('')}</div>
   <select class="mini" onchange="ui.jrWho=this.value;ui.jrN=200;vJrep()"><option value="">👤 ווער קאלט...</option>${USERS().map(u => `<option value="${esc(u)}" ${who === u ? 'selected' : ''}>👤 ${esc(u)}</option>`).join('')}</select></div>
  <table><thead><tr><th>#</th><th>נאמען</th><th>טעלעפאן</th><th>אדרעס</th><th>${esc(T || 'UDF')}</th><th>YG סך הכל</th><th>לעצטע</th><th>ווער קאלט / נאטיץ</th><th></th></tr></thead><tbody>
  ${L.slice(0, ui.jrN).map(a => { const g = IDX.yg.get(a.c), st = S.acct[a.c] || {}; return `<tr><td class="num" style="color:var(--muted)">${a.c}</td>
   <td><a class="name" onclick="openAcct(${a.c})">${esc(a.h || a.n)}</a> ${tagChips(a.c)}<div class="heb">${esc(a.h ? a.n : '')}</div></td>
   <td class="num" style="font-size:13px">${a.ph.slice(0, 2).map(p => callBtn(p[1], a.c) + ' ' + esc(p[1])).join('<br>')}</td>
   <td style="font-size:12.5px"><span class="ltr">${esc(a.a)}</span></td><td style="font-size:13px">${esc(((X.udf.get(a.c) || {})[T] || []).join(', '))}</td>
   <td class="num">${g ? money(g.total) : ''}</td><td class="num" style="font-size:13px">${g && g.last ? fmtD(g.last) : ''}</td>
   <td style="font-size:13px">${whoSel(`assign(${a.c},this.value)`, st.assigned || '')}${lastNoteHTML(a.c, true)}</td>
   <td><button class="btn ghost sm" onclick="noteForm(${a.c})">📝</button></td></tr>`; }).join('') || '<tr><td colspan="9" class="empty">קיינער פאסט נישט</td></tr>'}
  </tbody></table>${L.length > ui.jrN ? `<div class="more"><button class="btn ghost" onclick="ui.jrN+=300;vJrep()">ווייז נאך (${L.length - ui.jrN})</button></div>` : ''}` : '<div class="empty">נאך קיין רופארטס</div>'}`;
  const qi = $('#jrq');
  if (qi) { if (ui._jrFocus) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); ui._jrFocus = false; } let tm; qi.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { ui.jrQ = qi.value; ui.jrN = 200; ui._jrFocus = true; vJrep(); }, 300); }; }
}
function jrForm(id) {
  const X = jrIndex(), d = id ? S.jrep[id] : { name: '', udf: '', vals: [], camp: '', tag: '', active: true };
  const types = [...X.types.keys()].sort();
  const camps = [...X.campN.entries()].sort((a, b) => b[0] - a[0]).slice(0, 400);
  const tags = allTags();
  modal(`<h2>${id ? '✏️ טויש רופארט' : '+ נייער רופארט'}</h2><div class="grid2">
   <label class="f" style="grid-column:1/-1">נאמען פון רופארט<input id="jn" value="${esc(d.name)}"></label>
   <label class="f">UDF פעלד<select id="ju" onchange="jrVals()"><option value="">— נישט קיין UDF —</option>${types.map(t => `<option ${t === (d.udf || '').toUpperCase() ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
   <label class="f">נישט געגעבן צו קאמפעין<select id="jc"><option value="">—</option>${camps.map(([n, cnt]) => `<option value="${n}" ${+d.camp === n ? 'selected' : ''}>#${n} ${esc(JD.campaigns[n] || '')} (${cnt})</option>`).join('')}</select></label>
   <div style="grid-column:1/-1"><div class="sub" style="margin:4px 0">ווערטן (ליידיג = יעדער ווערט):</div><div id="jv" class="chips"></div></div>
   <label class="f">🏷️ נאר מיט דעם פלאג (אפציאנאל)<select id="jt"><option value="">—</option>${tags.map(t => `<option ${t === d.tag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
   <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="ja" ${d.active ? 'checked' : ''}> נאר אקטיווע אקאונטס</label></div>
   <div class="row" style="justify-content:flex-end;margin-top:14px">${id ? `<button class="btn red" onclick="jrDel('${id}')">אויסמעקן</button><div class="spacer"></div>` : ''}<button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="jrSave('${id || ''}')">Save</button></div>`, 'narrow');
  window._jrSel = new Set((d.vals || []).map(String));
  jrVals();
}
function jrVals() {
  const X = jrIndex(), T = $('#ju').value, m = X.types.get(T) || new Map();
  const vals = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'he', { numeric: true }));
  $('#jv').innerHTML = T ? vals.map(([v, n]) => `<label class="chip" style="display:inline-flex;gap:5px;align-items:center"><input type="checkbox" class="jvc" value="${esc(v)}" ${window._jrSel.has(v) ? 'checked' : ''}> ${esc(v || '(ליידיג)')} <small class="dim">${n}</small></label>`).join('') : '<span class="sub">קלייבט ערשט א UDF פעלד</span>';
}
async function jrSave(id) {
  const name = $('#jn').value.trim(); if (!name) { $('#jn').focus(); return; }
  const p = { name, udf: $('#ju').value, vals: [...document.querySelectorAll('.jvc:checked')].map(x => x.value), camp: +$('#jc').value || '', tag: $('#jt').value, active: $('#ja').checked, del: false };
  const nid = id || uid(); await emit('jrep', nid, p); ui.jr = nid; closeM(); render(); toast('✓ אפגעהיטן');
}
async function jrDel(id) { if (!confirm('אויסמעקן דעם רופארט?')) return; await emit('jrep', id, { del: true }); ui.jr = ''; closeM(); render(); }
function jrExcel() {
  const D = jrDefs(), cur = D.find(d => d.id === ui.jr) || D[0]; if (!cur) return;
  const X = jrIndex(), T = (cur.udf || '').toUpperCase();
  xlsx([{ name: cur.name, rows: [['#', 'נאמען', 'English', 'טעלעפאן 1', 'טעלעפאן 2', 'אדרעס', T || 'UDF', 'YG סך הכל', 'לעצטע מתנה', 'פלעגס', 'ווער קאלט', 'לעצטע נאטיץ']].concat(window._jrL.map(a => { const g = IDX.yg.get(a.c) || {}, st = S.acct[a.c] || {}, ln = (window._ln && window._ln.get(a.c)) || {}; return [a.c, a.h || a.n, a.n, (a.ph[0] || [])[1] || '', (a.ph[1] || [])[1] || '', a.a, ((X.udf.get(a.c) || {})[T] || []).join(', '), r2(g.total), g.last || '', tagsOf(a.c).join(', '), st.assigned || '', ln.text || '']; })) }], 'report-' + (cur.camp || 'list') + '-' + todayS() + '.xlsx');
}

// ---------- 🏷️ tags (flags) on accounts: acct.tags = ['...'] ----------
const tagsOf = c => ((S.acct[c] || {}).tags || []).filter(Boolean);
// Ready-made flags the owner asked for (shown as quick buttons on every donor); any other text can still be added
const TAG_RENAMES = { 'גרויסע נדבות - ווארים [משל יודא בירנבוים]': 'גרויסע נדבות - ווארים' };
// One-time rename of flags whose name was changed (runs after the log is loaded)
async function tagMigrate() {
  for (const [c, st] of Object.entries(S.acct)) {
    const T = st.tags || []; if (!T.some(t => TAG_RENAMES[t])) continue;
    await emit('acct', c, { tags: [...new Set(T.map(t => TAG_RENAMES[t] || t))] });
  }
}
const PRESET_TAGS = ['גרויסע נדבות - ווארים', 'גרויסע נדבות - אלגעמיין [הערצקא אפיס]', 'היימיש-ווארים', 'היימיש-געבט', 'היימיש-איגנארירט', '5 גארפיעלד-ווארים', '5 גארפיעלד-נייס', 'בני יואל טאטע', 'מהרי"ט טאטע', 'היימישע רבנים', 'קאלטע רבנים', 'יוצאי ישיבתינו', 'אברכים'];
function allTags() { const m = new Map(); Object.values(S.acct).forEach(st => (st.tags || []).forEach(t => t && m.set(t, (m.get(t) || 0) + 1))); return PRESET_TAGS.concat([...m.keys()].filter(t => !PRESET_TAGS.includes(t)).sort((a, b) => a.localeCompare(b, 'he'))); }
const tagHue = t => { let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const tagChip = (t, x) => `<span class="tagc" style="background:hsl(${tagHue(t)},70%,92%);border-color:hsl(${tagHue(t)},45%,75%);color:hsl(${tagHue(t)},45%,28%)">🏷️ ${esc(t)}${x || ''}</span>`;
const tagChips = c => tagsOf(c).map(t => tagChip(t)).join(' ');
function tagEditor(code) {
  const T = tagsOf(code), jsq = t => esc(t).replace(/'/g, '&#39;');
  return `<div id="tged"><div class="chips" style="margin-bottom:8px">${PRESET_TAGS.map(t => `<button type="button" class="chip ${T.includes(t) ? 'on' : ''}" style="font-size:12px;padding:3px 10px" onclick="tagToggle(${code},'${jsq(t)}')">${T.includes(t) ? '✓ ' : ''}${esc(t)}</button>`).join('')}</div>
   <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">${T.filter(t => !PRESET_TAGS.includes(t)).map(t => tagChip(t, ` <a style="cursor:pointer" title="אראפנעמען" onclick="tagDel(${code},'${esc(t).replace(/'/g, '&#39;')}')">✕</a>`)).join('')}
   <input id="tgin" list="tglist" placeholder="+ אן אנדער פלאג..." style="flex:1;min-width:170px" onkeydown="if(event.key==='Enter'){event.preventDefault();tagAdd(${code})}"><datalist id="tglist">${allTags().map(t => `<option value="${esc(t)}">`).join('')}</datalist>
   <button class="btn ghost sm" onclick="tagAdd(${code})">צולייגן</button></div></div>`;
}
async function tagToggle(code, t) {
  const T = tagsOf(code);
  await emit('acct', code, { tags: T.includes(t) ? T.filter(x => x !== t) : T.concat(t) });
  $('#tged').outerHTML = tagEditor(code); render();
}
async function tagAdd(code) {
  const v = $('#tgin').value.trim().replace(/\s+/g, ' '); if (!v) return;
  const T = tagsOf(code); if (!T.includes(v)) await emit('acct', code, { tags: T.concat(v) });
  $('#tged').outerHTML = tagEditor(code); render(); toast('🏷️ ' + v);
}
async function tagDel(code, t) { await emit('acct', code, { tags: tagsOf(code).filter(x => x !== t) }); $('#tged').outerHTML = tagEditor(code); render(); }
