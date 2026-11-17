// YG Fund – 📞 Collection ("קאלעקשען") for both areas + Calling mode. Loaded before app.js; functions only.
//   💵 fundraising: "פאנדרעיזינג קאלעקשען" – open pledges that are due + donors due to be asked again
//   🎓 tuition:     "שכר לימוד קאלעקשען"   – families that owe now
// Sub-lists (the sidebar turns into them): today = calls for today, cb = call back today, hold = on hold, all.
// Per-account state: event kind `col`, id `<area>|<code>`: {hold, holdNote, cb (date), cbNote, out (last outcome),
// outAt, outBy, pin (note everybody sees)}; every outcome also writes a `hist` note.
const COL_OUT = [['noans', '📵 קיין ענטפער'], ['msg', '💬 מעסעדזש געלאזט'], ['prom', '🤝 צוגעזאגט'], ['paid', '✅ באצאלט'], ['check', '🗓️ שעק דעיטעד'],
  ['plan', '📋 וויל א פלאן'], ['ref', '⛔ אפגעזאגט'], ['wrong', '☎️ פאלשער נאמבער'], ['note', '📝 נאר א נאטיץ']];
const COL_TABS = [['today', '📞 קאלן היינט'], ['ask', '📋 היינט צו בעטן'], ['pl', '💳 פלעדזשעס'], ['cb', '🔁 היינט צוריק קאלן'], ['hold', '⏸ ON HOLD'], ['all', '📚 אלע אקאונטס'], ['every', '👥 אלע אקאונטס'], ['ign', '🚫 Ignored']];
// v1.30: "every" (fund) = every JLS account, so a 🔎 filter can find people who never gave to YG (the other fund lists hold
// only YG donors and pledges); "ign" = accounts put on 🚫 Ignore (col.ign): never in a call list or Calling mode, but still
// in the "all" lists.
// fundraising only: "היינט צו בעטן" and "פלעדזשעס" (the old separate pages moved in here, owner 2026-11-16) and "all" is
// called "ישיבה נדבנים"; in tuition "call back" is called "אפגעשטופט" (owner)
const colTabs = () => COL_TABS.filter(([k]) => colArea() === 'fund' || (k !== 'ask' && k !== 'pl' && k !== 'every'))
  .map(([k, l]) => [k, k === 'cb' && colArea() === 'tu' ? '🔁 אפגעשטופט' : k === 'all' && colArea() === 'fund' ? '📚 ישיבה נדבנים' : l]);
const COL_GAP = 7;   // a family/donor reached in the last 7 days does not come back on "today" (unless a call-back is set)
const colArea = () => AREA === 'tu' ? 'tu' : 'fund';
const colKey = c => colArea() + '|' + c;
const colSt = c => (S.col || {})[colKey(c)] || {};
const colTitle = () => colArea() === 'tu' ? 'שכר לימוד קאלעקשען' : 'פאנדרעיזינג קאלעקשען';

// All rows of this area: {code, amt (what to ask now), bal, sub (small text), f (tuition family)}
function colAll() {
  const out = [];
  if (colArea() === 'tu') {
    if (!TU || TU.missing) return out;
    tuCalc().L.forEach(f => { if ((f.cur || f.bal > 0.5) && tuInScope(f)) out.push({ code: f.code, amt: f.due, bal: f.bal, f, last: f.last }); });   // this year's parents by default (ui.tuScope)
  } else {
    const seen = new Set();
    IDX.pl.forEach((g, c) => { if (g.open > 0.009 && IDX.by.has(c)) { seen.add(c); out.push({ code: c, amt: g.dueNow, bal: g.open, last: (IDX.yg.get(c) || {}).last || '' }); } });
    IDX.yg.forEach((g, c) => { if (!seen.has(c) && IDX.by.has(c)) out.push({ code: c, amt: 0, bal: 0, last: g.last }); });
  }
  return out;
}
// every JLS account (fund), as collection rows – only built when that list is opened
function colEvery() {
  if (window._colEv && window._colEv.jd === JD) return window._colEv.rows;
  const rows = JD.accounts.filter(a => !a.x).map(a => { const g = IDX.yg.get(a.c) || {}, p = IDX.pl.get(a.c) || {}; return { code: a.c, amt: p.dueNow || 0, bal: p.open || 0, last: g.last || '' }; });
  rows.sort((a, b) => ((IDX.yg.get(b.code) || {}).total || 0) - ((IDX.yg.get(a.code) || {}).total || 0) || ((IDX.by.get(a.code) || {})._k || '').localeCompare((IDX.by.get(b.code) || {})._k || '', 'he'));
  window._colEv = { jd: JD, rows }; return rows;
}
const colTabRows = (tab, L) => tab === 'every' ? colEvery().map(r => Object.assign(r, { s: colSt(r.code), done: (colSt(r.code).outAt || '').slice(0, 10) === todayS() })) : (L || colLists())[tab] || [];
function colLists() {
  const t = todayS(), all = colAll(), gap = addDays(t, -COL_GAP);
  const askToday = colArea() === 'fund' ? new Set(todayItems('all').filter(x => x.kind === 'ask').map(x => x.code)) : new Set();
  const L = { all, today: [], cb: [], hold: [], ask: [], pl: [], ign: [] };
  all.forEach(r => {
    const s = colSt(r.code), outD = (s.outAt || '').slice(0, 10);
    r.done = outD === t; r.s = s;
    if (s.ign) { L.ign.push(r); return; }   // 🚫 ignored: only in "all" and "ignored"
    if (s.hold) { L.hold.push(r); return; }
    if (askToday.has(r.code)) L.ask.push(r);
    if (colArea() === 'fund' && r.bal > 0.009 && !plHidden(r.code)) L.pl.push(Object.assign({}, r, { amt: r.bal, due: r.amt }));   // all open pledges, every year
    if (s.cb && s.cb <= t) L.cb.push(r);
    const need = colArea() === 'tu' ? r.amt > 0.5 : ((r.amt > 0.009 && !plHidden(r.code)) || askToday.has(r.code));
    if (!need || (s.cb && s.cb > t)) return;
    if (outD && outD >= gap && !r.done) return;
    L.today.push(r);
  });
  const srt = (a, b) => (a.done - b.done) || b.amt - a.amt;
  L.today.sort(srt); L.cb.sort((a, b) => (a.done - b.done) || (a.s.cb || '').localeCompare(b.s.cb || ''));
  L.hold.sort((a, b) => b.bal - a.bal);
  L.ask.sort((a, b) => (a.done - b.done) || ((IDX.yg.get(b.code) || {}).total || 0) - ((IDX.yg.get(a.code) || {}).total || 0));
  const ps = ui.plSort || 'amt', nextDue = c => { const g = IDX.pl.get(c); return g ? g.list.filter(x => !x[9] && x[5] > 0.009).map(x => x[2] || '9').sort()[0] || '9' : '9'; };
  L.pl.sort(ps === 'due' ? (a, b) => nextDue(a.code).localeCompare(nextDue(b.code)) : ps === 'abc' ? (a, b) => ((IDX.by.get(a.code) || {})._k || '').localeCompare((IDX.by.get(b.code) || {})._k || '', 'he') : (a, b) => b.amt - a.amt);
  all.sort((a, b) => ((IDX.by.get(a.code) || {})._k || '').localeCompare((IDX.by.get(b.code) || {})._k || '', 'he'));
  return L;
}
function colReady() {
  if (colArea() === 'tu') return tuReady(view);
  return true;
}

// ---------- sidebar while in the collection ----------
function colNav() {
  const nav = $('#nav'); let box = $('#colnav');
  if (!box) { box = document.createElement('div'); box.id = 'colnav'; nav.appendChild(box); }
  const inCol = view === 'col' || view === 'calling';
  nav.classList.toggle('incol', inCol);
  if (!inCol) { box.innerHTML = ''; return; }
  let n = {}; try { const L = colLists(); colTabs().forEach(([k]) => { n[k] = k === 'every' ? '' : k === 'today' || k === 'cb' || k === 'ask' ? L[k].filter(r => !r.done).length : L[k].length; }); } catch (e) { }
  const tab = ui.colTab || 'today';
  box.innerHTML = `<button data-v="${colArea() === 'tu' ? 'thome' : 'home'}" class="colback">← ${colArea() === 'tu' ? 'שכר לימוד' : 'פאנדרעיזינג'}</button>
   <div class="navsec">${esc(colTitle())}</div>
   ${colTabs().map(([k, l]) => `<button data-v="col" data-t="${k}" class="${view === 'col' && tab === k ? 'on' : ''}">${l} <span class="cnt ${k === 'cb' ? 'orange' : k === 'hold' ? 'purple' : 'blue'}">${n[k] != null ? n[k] : ''}</span></button>`).join('')}
   <button data-v="calling" class="${view === 'calling' ? 'on' : ''}" style="margin-top:10px">▶ Calling mode</button>`;
}

// Accounts whose pledge is already being paid off (owner, v1.25): an active credit-card plan (JD.ccplans: no end date
// or ending today or later) or a held check (a YG payment whose check date is still ahead, payment [10]).
// They do not show in the pledge lists unless "💳 אויך מיט קרעדיט קארד / העלד טשעקס" is on (ui.plCovered).
function plCovered() {
  if (window._plCov && window._plCov.jd === JD && window._plCov.d === todayS()) return window._plCov.s;
  const t = todayS(), s = new Set();
  (JD.ccplans || []).forEach(p => { if (!p[3] || p[3] >= t) s.add(+p[0]); });
  JD.payments.forEach(p => { if (p[10] && p[10] > t) s.add(+p[1]); });
  window._plCov = { jd: JD, d: t, s }; return s;
}
const plHidden = c => !ui.plCovered && plCovered().has(+c);
// ---------- 💳 pledges tab: this month / a campaign / sort ----------
function colPlChips() {
  const f = fltOf('col-pl'), YC = typeof ygCamps === 'function' ? ygCamps() : new Set(), used = new Map();
  IDX.pl.forEach(g => g.list.forEach(c => { if (!c[9] && c[5] > 0.009 && c[6]) used.set(+c[6], (used.get(+c[6]) || 0) + 1); }));
  const camps = [...used.keys()].filter(n => !YC.size || YC.has(n)).sort((a, b) => b - a);
  const setF = js => `ui.flt=ui.flt||{};ui.flt['col-pl']=Object.assign({},ui.flt['col-pl']||{});${js};fltPersist('col-pl',ui.flt['col-pl']);vCol()`;
  return `<span class="scope"><button class="chip ${!f.plMonth ? 'on' : ''}" onclick="${setF("delete ui.flt['col-pl'].plMonth")}">אלע יארן</button><button class="chip ${f.plMonth ? 'on' : ''}" onclick="${setF("ui.flt['col-pl'].plMonth=true")}">📅 דעם חודש</button></span>
   <select class="mini" onchange="${setF("if(this.value)ui.flt['col-pl'].plCamp=this.value;else delete ui.flt['col-pl'].plCamp")}"><option value="">💳 אלע קאמפעינס</option>${camps.map(n => `<option value="${n}" ${+f.plCamp === n ? 'selected' : ''}>#${n} ${esc((JD.campaigns || {})[n] || '')} (${used.get(n)})</option>`).join('')}</select>
   <label style="font-size:13px;display:flex;gap:5px;align-items:center"><input type="checkbox" ${ui.plCovered ? 'checked' : ''} onchange="ui.plCovered=this.checked;vCol()"> 💳 אויך מיט קרעדיט קארד / העלד טשעקס (${plCovered().size})</label>
   <select class="mini" onchange="ui.plSort=this.value;vCol()"><option value="amt">סארטיר: סכום</option><option value="due" ${ui.plSort === 'due' ? 'selected' : ''}>סארטיר: ווען פעליג</option><option value="abc" ${ui.plSort === 'abc' ? 'selected' : ''}>סארטיר: א-ב</option></select>`;
}
function colPlLine(code) {
  const g = IDX.pl.get(+code); if (!g) return '';
  const L = g.list.filter(c => !c[9] && c[5] > 0.009).sort((a, b) => (a[2] || '').localeCompare(b[2] || ''));
  if (!L.length) return '';
  return `<div class="cr2">💳 ${L.slice(0, 3).map(c => `${esc((JD.campaigns || {})[c[6]] || c[7] || 'פלעדזש')} <b>${money(c[5])}</b>${c[2] ? ' · ' + fmtD(c[2]) : ''}`).join(' &nbsp;|&nbsp; ')}${L.length > 3 ? ' …' : ''}</div>`;
}

// ---------- the list ----------
function colName(code) { const a = IDX.by.get(+code) || {}; return `<b>${esc(a.h || a.n || '#' + code)}</b>${a.h && a.n ? ` <small class="dim">${esc(a.n)}</small>` : ''}`; }
function colLastNote(code) { let h = null; Object.values(S.hist).forEach(x => { if (+x.code === +code && (!h || (x.at || '') > (h.at || ''))) h = x; }); return h; }
function vCol() {
  if (!colReady()) return;
  const tab = ui.colTab || 'today', L = colLists(), t = todayS();
  const qs = (ui.colQ || '').trim().toLowerCase();
  const needFlt = tab === 'every' && !fltActive('col-every');   // 21,000 accounts: show them only through a 🔎 filter
  let R = needFlt ? [] : fltRows('col-' + tab, colTabRows(tab, L), r => r.code);
  if (qs) R = R.filter(r => { const a = IDX.by.get(r.code) || {}; return ((a._s || '') + ' ' + (r.f ? r.f.kids.map(k => k.slice(2, 6).join(' ')).join(' ') : '')).includes(qs) || ('#' + r.code) === qs; });
  window._colR = R;
  const out = L.all.reduce((s, r) => s + (r.amt > 0 ? r.amt : 0), 0), done = L.today.filter(r => r.done).length;
  ui.colN = ui.colN || 150;
  $('#main').innerHTML = `<div class="row"><div><h2>📞 ${esc(colTitle())}</h2><p class="sub">${esc((colTabs().find(x => x[0] === tab) || [])[1] || '')} · ${R.length.toLocaleString()} אקאונטס</p></div><div class="spacer"></div>
     ${tab !== 'all' ? `<button class="btn gold" onclick="colStart('${tab}')">▶ Calling mode</button>` : ''}${colArea() === 'fund' ? `<span class="dim" style="font-size:13px">אדער:</span><select class="mini" onchange="if(this.value)colStart(this.value)"><option value="">▶ Calling mode פון א רופארט…</option>${colSources().filter(([k]) => k.startsWith('jr:')).map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select>` : ''}</div>
   <div class="tiles">
    <div class="tile t7"><i>💰</i><h3>${colArea() === 'tu' ? 'שולדיג יעצט' : 'פלעדזשעס פעליג'}</h3><b class="bal">${money(out)}</b><span>${L.all.filter(r => r.amt > 0.5).length} אקאונטס</span></div>
    <div class="tile t1" onclick="ui.colTab='today';go('col')"><i>📞</i><h3>קאלן היינט</h3><b>${L.today.length - done}</b><span>${done} פון ${L.today.length} געטון</span></div>
    <div class="tile t5" onclick="ui.colTab='cb';go('col')"><i>🔁</i><h3>${colArea() === 'tu' ? 'אפגעשטופט' : 'היינט צוריק קאלן'}</h3><b>${L.cb.filter(r => !r.done).length}</b><span>&nbsp;</span></div>
    <div class="tile t4" onclick="ui.colTab='hold';go('col')"><i>⏸</i><h3>ON HOLD</h3><b>${L.hold.length}</b><span>&nbsp;</span></div>
   </div>
   <div class="row" style="margin:8px 0;flex-wrap:wrap;gap:8px">${colArea() === 'tu' ? tuScopeChips('ui.cm=null;render()') : ''}${fltBar('col-' + tab, 'vCol()')}${tab === 'pl' ? colPlChips() : ''}<input id="colq" placeholder="🔍 Search: name, phone, #code" value="${esc(ui.colQ || '')}" style="max-width:280px" oninput="ui.colQ=this.value;clearTimeout(window._colT);window._colT=setTimeout(()=>{vCol();const e=$('#colq');e.focus();e.setSelectionRange(e.value.length,e.value.length)},300)"></div>
   ${(bulkList('col-' + tab, R.map(r => r.code)), bulkBar('col-' + tab))}
   <div class="collist">${R.slice(0, ui.colN).map((r, i) => colRow(r, i, tab)).join('') || (needFlt ? `<div class="empty">👥 דא זענען אלע ${JD.accounts.length.toLocaleString()} אקאונטס פון JLS (אויך די וואס האבן קיינמאל נישט געגעבן צו YG).<br>דריקט <b>🔎 פילטער</b> אויבן, למשל UDF4 = 1,2,3 און נאך נישט געגעבן צו דעם דינער.</div>` : '<div class="empty">🎉 גארנישט דא</div>')}</div>
   ${R.length > ui.colN ? `<div class="more"><button class="btn ghost" onclick="ui.colN+=300;vCol()">ווייז מער (${(R.length - ui.colN).toLocaleString()})</button></div>` : ''}`;
}
const colWho = c => { const w = (S.acct[c] || {})[colArea() === 'tu' ? 'tuWho' : 'assigned']; return w ? ' ' + userChip(w) : ''; };
function colRow(r, i, tab) {
  const s = r.s || colSt(r.code), h = colLastNote(r.code), o = COL_OUT.find(x => x[0] === s.out);
  const col = r.f && r.f.st ? ({ ok: '#2e9d5b', fix: '#e0a400', ign: '#d2452f' })[r.f.st.k] || '#c9c2b2' : (r.amt > 0.5 ? '#d2452f' : '#c9c2b2');
  return `<div class="colrow${r.done ? ' done' : ''}" style="border-right:6px solid ${col}">
   ${selBox('col-' + tab, r.code)}
   <div class="cr1"><a class="name" onclick="colStart('${tab}',${i})">${colName(r.code)}</a> <small class="dim">#${r.code}</small> <button class="nbtn" title="📝 נאטיץ" onclick="noteForm(${r.code})">📝</button>
    ${r.f ? tuStChip(r.f) : ''}${s.hold ? ' <span class="tag purple">⏸ On hold</span>' : ''}${s.ign ? ' <span class="tag gray">🚫 Ignored</span>' : ''}${s.cb ? ` <span class="tag orange">🔁 ${fmtD(s.cb)}</span>` : ''}${colWho(r.code)}${r.done ? ' <span class="tag ok">✓ היינט</span>' : ''}
    ${tab === 'pl' || tab === 'today' ? colPlLine(r.code) : ''}<div class="cr2">${h ? `💬 "${esc(h.text.length > 80 ? h.text.slice(0, 80) + '…' : h.text)}" · ${fmtD((h.at || '').slice(0, 10))} · ${userChip(h.by || '')}` : '<span class="dim">נאך קיין נאטיץ</span>'}${o ? ` · <b>${o[1]}</b>` : ''}</div></div>
   <div class="cr3"><b class="${r.amt > 0.5 ? 'bal' : ''}">${r.amt < -0.005 ? `<span class="credit">קרעדיט ${money(-r.amt)}</span>` : money(r.amt)}</b>${r.bal > r.amt + 0.5 ? `<small class="dim">${money(r.bal)} באלאנס</small>` : ''}</div></div>`;
}

// ---------- ▶ Calling mode ----------
// Which list to call (v1.23): the collection lists, and in fundraising also every report ("רופארטס", e.g.
// "דינער מהרי"ט 2026 נאך נישט געגעבן"): src 'jr:<report id>'.
function colSources() {
  const L = colTabs().filter(([k]) => k !== 'all');
  if (colArea() === 'fund' && JD && JD.udf && JD.camphits && typeof jrDefs === 'function') jrDefs().forEach(d => L.push(['jr:' + d.id, '📑 ' + d.name]));
  return L;
}
const colSrcName = k => k === 'sel' ? '☑ אויסגעקליבענע' : ((colSources().find(x => x[0] === k) || colTabs().find(x => x[0] === k) || [])[1] || '');
function colSrcSel(cur) {
  return `<select class="mini srcsel" onchange="colStart(this.value)" title="וועמען קאלן">${cur === 'sel' ? '<option value="sel" selected>☑ אויסגעקליבענע</option>' : ''}${colSources().map(([k, l]) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}
// The people of one list for Calling mode, always with that list's (kept) 🔎 filter (v1.28.2)
// Calling mode has its OWN 🔎 filter per list ('cm-<list>'), separate from the list pages ('col-<tab>', 'jr') –
// owner (v1.31): a filter made (and kept) in Calling mode must not change "קאלן היינט" itself, and the other way round.
const cmFltKey = tab => 'cm-' + tab;
function colCm(tab) {
  const t = todayS();
  if (String(tab).startsWith('jr:')) {   // a report: everybody on it, those reached today at the end
    const d = jrDefs().find(x => 'jr:' + x.id === tab); if (!d) return null;
    const C = fltCodes(cmFltKey(tab), jrRun(d).map(a => a.c)).filter(c => !colSt(c).ign), done = c => (colSt(c).outAt || '').slice(0, 10) === t;
    return { tab, codes: C.filter(c => !done(c)).concat(C.filter(done)), i: 0 };
  }
  if (tab === 'every' && !fltActive(cmFltKey(tab))) { toast('🔎 שטעלט ערשט א פילטער – עס זענען ' + JD.accounts.length.toLocaleString() + ' אקאונטס'); return { tab, codes: [], i: 0 }; }
  const L = fltRows(cmFltKey(tab), colTabRows(tab), r => r.code).filter(r => tab === 'ign' || !(r.s || colSt(r.code)).ign);
  return { tab, codes: L.map(r => r.code), i: Math.max(0, L.findIndex(r => !r.done)) };
}
const cmTabKey = () => 'yg_cmtab_' + colArea();
function colStart(tab, i) {
  const cm = colCm(tab);
  if (!cm) return;
  if (!cm.codes.length && view !== 'calling') { toast('גארנישט צו קאלן'); return; }
  if (i != null) cm.i = i;
  try { localStorage.setItem(cmTabKey(), tab); } catch (e) { }   // Calling mode comes back on the same list
  ui.cm = cm; go('calling');
}
function vCalling() {
  if (!colReady()) return;
  if (!ui.cm) {   // opened from the side menu or after a reload: the last list used, with its kept filter
    let tab = 'today'; try { tab = localStorage.getItem(cmTabKey()) || 'today'; } catch (e) { }
    ui.cm = colCm(tab) || colCm('today');
  }
  const cm = ui.cm, codes = cm.codes;
  if (!codes.length) {   // nobody (maybe because of the filter): keep the bar, so the list or the filter can be changed
    $('#main').innerHTML = `<div class="cmbar"><b>📞 Calling mode</b>${colSrcSel(cm.tab)}${cm.tab !== 'sel' ? fltBar(cmFltKey(cm.tab), `colStart('${cm.tab}')`) : ''}${cmSearchBox()}</div><div class="empty">🎉 גארנישט צו קאלן${cm.tab !== 'sel' && fltActive(cmFltKey(cm.tab)) ? ' – דער 🔎 פילטער לאזט נישט קיינעם' : ''}</div>`;
    cmSearchInit();
    return;
  }
  cm.i = Math.min(Math.max(0, cm.i), codes.length - 1);
  const map = new Map(colAll().map(r => [r.code, r])), code = codes[cm.i], r = map.get(code) || cmExtraRow(code);
  const a = IDX.by.get(code) || { ph: [], n: '#' + code, h: '' }, s = colSt(code), t = todayS();
  const doneN = codes.filter(c => (colSt(c).outAt || '').slice(0, 10) === t).length;
  const hist = Object.values(S.hist).filter(x => +x.code === code).sort((x, y) => (y.at || '').localeCompare(x.at || '')).slice(0, 6);
  // what to show under the name
  let info = '';
  if (r.f) {
    const f = r.f, st = f.st || {};
    info = `<div class="cminfo"><div><small>לעצטע 6 חדשים</small><b>געבילט ${money(st.b6 || 0)} · באצאלט ${money(st.p6 || 0)}</b>${(st.b6 || 0) > (st.p6 || 0) + 1 ? `<div class="bal">באצאלט ${money(st.b6 - st.p6)} ווייניגער ווי געבילט</div>` : ''}</div>
      <div><small>תלמידים</small><b>${f.kids.filter(k => !k[8]).map(k => esc(k[4] || k[2]) + (k[6] ? ' <small class="dim">' + esc(k[6]) + '</small>' : '')).join(' · ') || '—'}</b></div></div>`;
  } else {
    const g = IDX.yg.get(code), pl = IDX.pl.get(code);
    info = `<div class="cminfo"><div><small>לעצטע נדבה</small><b>${g && g.last ? money(g.lastAmt) + ' · ' + fmtD(g.last) : '—'}</b><small class="dim">${g ? g.count + ' נדבות, ס"ה ' + money(g.total) : ''}</small></div>
      <div><small>אפענע פלעדזשעס</small><b>${pl ? pl.list.filter(c => !c[9] && c[5] > 0.009).slice(0, 4).map(c => money(c[5]) + ' ' + esc(JD.campaigns[c[6]] || c[7] || '')).join(' · ') || '—' : '—'}</b></div></div>`;
  }
  const last = r.last || (r.f ? r.f.last : '');
  const isJr = String(cm.tab).startsWith('jr:');
  $('#main').innerHTML = `<div class="cmbar"><b>📞 Calling mode</b>${colArea() === 'tu' && cm.tab !== 'sel' ? tuScopeChips(`colStart('${cm.tab}')`) : ''} ${colSrcSel(cm.tab)}${cm.tab !== 'sel' ? fltBar(cmFltKey(cm.tab), `colStart('${cm.tab}')`) : ''}${cmSearchBox()}<span><b>${doneN}</b> פון ${codes.length} געטון</span>
     <div class="cmprog"><i style="width:${doneN / codes.length * 100}%"></i></div>
     <button class="btn ghost sm" onclick="ui.cm.i--;vCalling()" ${cm.i ? '' : 'disabled'}>› פריער</button><span>${cm.i + 1} פון ${codes.length}</span><button class="btn ghost sm" onclick="ui.cm.i++;vCalling()" ${cm.i < codes.length - 1 ? '' : 'disabled'}>ווייטער ‹</button>
     <button class="btn ghost sm" onclick="${r.f ? `tuFamily(${code})` : `openAcct(${code})`}">גאנצע זייט</button></div>
   <div class="cmgrid">
    <div class="cmmain">
     <div class="cmcard">
      <div class="cmtags">${r.f ? tuStChip(r.f, false) : ''}<span class="tag gray">JLS #${code}</span>${s.hold ? '<span class="tag purple">⏸ On hold</span>' : ''}${s.cb ? `<span class="tag orange">🔁 ${fmtD(s.cb)}</span>` : ''}${typeof tagsOf === 'function' ? tagsOf(code).map(x => `<span class="tag custom">${esc(x)}</span>`).join('') : ''}</div>
      <div class="cmtop"><div><div class="cmname">${esc(a.h || a.n)}</div><div class="cmeng">${esc(a.h ? a.n : '')}</div><div class="cmaddr">📍 ${esc(a.a || '—')}</div>
        <div class="cmaddr">לעצטע באצאלונג: ${last ? fmtD(last) : '—'}${r.f && r.f.st && r.f.st.mo != null ? ` (לפני ${r.f.st.mo} חדשים)` : ''}</div></div>
       <div class="cmbal">${isJr && !(r.amt > 0.009) ? `<small>לעצטע נדבה</small><b style="color:#9fe0b4">${money((IDX.yg.get(code) || {}).lastAmt || 0)}</b><small>YG ס"ה ${money((IDX.yg.get(code) || {}).total || 0)}</small>` : `<small>${r.f ? 'שולדיג יעצט' : 'פעליג'}</small><b>${money(r.amt)}</b>`}${r.bal > r.amt + 0.5 ? `<small>${money(r.bal)} באלאנס</small>` : ''}</div></div>
      <div class="cmphones">${a.ph.slice(0, 4).map(p => { const d = callNum(p[1]); return `<a class="cmcall" href="tel:+${d}" data-n="${d}" onclick="return dial(this,${code})">📞 ${esc(p[0] || 'Phone')}<br><b>${esc(p[1])}</b></a>`; }).join('') || '<span class="dim">קיין טעלעפאן</span>'}</div>
     </div>
     <div class="cmpin" onclick="colPin(${code})">📌 ${s.pin ? `<b>${esc(s.pin)}</b>` : '<span class="dim">Pin א נאטיץ וואס אלע זען, למשל "באצאלט צוויי מאל א יאר: אדר און תשרי"</span>'}</div>
     ${info}
     <div class="cmout">${COL_OUT.map(([k, l]) => `<button class="chip big ${ui.cmOut === k ? 'on' : ''}" onclick="ui.cmOut='${k}';document.querySelectorAll('.cmout .chip').forEach(b=>b.classList.toggle('on',b===this))">${l}</button>`).join('')}</div>
     <div class="grid2" style="margin-top:8px"><label class="f" style="grid-column:1/-1">נאטיץ<textarea id="cmnote" rows="2" placeholder="וואס האט ער געזאגט?"></textarea></label>
      <label class="f">🔁 רוף צוריק אום${dateField('cmcb', '', { clear: true })}</label>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px;align-self:end"><input type="checkbox" id="cmhold" ${s.hold ? 'checked' : ''}> ⏸ On hold</label></div>
     <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn ghost" onclick="ui.cm.i++;vCalling()">איבערשפרינגען</button><button class="btn gold" onclick="colSave(${code})">✓ היט אפ און ווייטער</button></div>
     <h3 style="margin-top:16px">📝 נאטיצן</h3>${hist.map(h => `<div class="cmh">💬 ${esc(h.text)} <small class="dim">– ${userChip(h.by || '')} · ${fmtD((h.at || '').slice(0, 10))}</small></div>`).join('') || '<p class="dim">—</p>'}
    </div>
    <div class="cmside"><div class="cmsh">UP NEXT <span class="cnt blue">${codes.length}</span></div>
     ${codes.map((c, j) => { const rr = map.get(c) || { amt: 0 }, aa = IDX.by.get(c) || {}, dn = (colSt(c).outAt || '').slice(0, 10) === t; return `<div class="cmli${j === cm.i ? ' on' : ''}${dn ? ' done' : ''}" onclick="ui.cm.i=${j};vCalling()"><span>${j + 1}</span><b>${esc(aa.h || aa.n || '#' + c)}</b><i>${money(isJr && !(rr.amt > 0.009) ? (IDX.yg.get(c) || {}).total || 0 : rr.amt)}</i></div>`; }).join('')}
    </div></div>`;
  ui.cmOut = '';
  cmSearchInit();
  initDateFields($('#main'));   // vCalling is also redrawn without render() (prev/next, save)
  setTimeout(() => { const e = $('.cmli.on'); if (e) e.scrollIntoView({ block: 'nearest' }); }, 30);
}
// 🔍 Search inside Calling mode (v1.35, owner): find anyone by name / phone / #code. Someone on the list → jump to
// them; anyone else → put in the list right here (fund: every JLS account; tuition: every family) and shown.
function cmSearchBox() { return `<span class="cmsearch"><input id="cmq" placeholder="🔍 Search: name, phone, #code" autocomplete="off"><div id="cmqres"></div></span>`; }
function cmSearchList(q) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const qd = q.replace(/\D/g, ''), words = q.replace(/^#/, '').split(/\s+/).filter(Boolean), num = /^#?\d+$/.test(q) ? +q.replace('#', '') : 0;
  const inList = new Set(ui.cm ? ui.cm.codes : []);
  let pool = JD.accounts;
  if (colArea() === 'tu' && TU && !TU.missing) { const fam = new Set(tuCalc().L.map(f => f.code)); pool = pool.filter(a => fam.has(a.c)); }
  const L = pool.filter(a => (num && a.c === num) || words.every(w => a._s.includes(w)) || (qd.length >= 4 && a._s.includes(qd)));
  L.sort((x, y) => (y.c === num) - (x.c === num) || inList.has(y.c) - inList.has(x.c) || (x._k || '').localeCompare(y._k || '', 'he'));
  return L.slice(0, 12).map(a => ({ c: a.c, a, on: inList.has(a.c) }));
}
function cmSearchInit() {
  const qi = $('#cmq'), box = $('#cmqres'); if (!qi) return;
  let tm;
  const show = () => {
    const L = cmSearchList(qi.value);
    box.innerHTML = !qi.value.trim() ? '' : L.length ? L.map(x => `<div class="cmqi" onmousedown="cmPick(${x.c})"><b>${esc(x.a.h || x.a.n)}</b> <small>${esc(x.a.h ? x.a.n : '')} · #${x.c}${x.a.ph && x.a.ph[0] ? ' · ' + esc(x.a.ph[0][1]) : ''}</small>${x.on ? ' <span class="tag custom">אין דער ליסטע</span>' : ''}</div>`).join('') : '<div class="cmqi dim">גארנישט געטראפן</div>';
    box.classList.toggle('on', !!qi.value.trim());
  };
  qi.oninput = () => { clearTimeout(tm); tm = setTimeout(show, 200); };
  qi.onkeydown = e => { if (e.key === 'Enter') { const L = cmSearchList(qi.value); if (L.length) cmPick(L[0].c); } else if (e.key === 'Escape') { qi.value = ''; show(); } };
  qi.onblur = () => setTimeout(() => box.classList.remove('on'), 150);
  qi.onfocus = () => { if (qi.value.trim()) show(); };
}
function cmPick(code) {
  const cm = ui.cm || (ui.cm = { tab: 'sel', codes: [], i: 0 });
  let j = cm.codes.indexOf(code);
  if (j < 0) { j = cm.codes.length ? cm.i : 0; cm.codes.splice(j, 0, code); }
  cm.i = j; vCalling();
}
// The Calling-mode row for someone who is not on the collection lists (found with 🔍)
function cmExtraRow(code) {
  if (colArea() === 'tu' && TU && !TU.missing) { const f = tuCalc().L.find(x => x.code === code); if (f) return { code, amt: f.due, bal: f.bal, f, last: f.last }; }
  const pl = IDX.pl.get(code), g = IDX.yg.get(code);
  return { code, amt: pl ? pl.open || 0 : 0, bal: pl ? pl.open || 0 : 0, last: g ? g.last : '' };
}
async function colSave(code) {
  const k = ui.cmOut, note = $('#cmnote').value.trim(), cb = $('#cmcb').value, hold = $('#cmhold').checked, s = colSt(code);
  if (!k && !note && !cb && hold === !!s.hold) { toast('קלייבט וואס איז געווען, אדער שרייבט א נאטיץ'); return; }
  const o = COL_OUT.find(x => x[0] === k), now = new Date().toISOString();
  const text = '📞 ' + (o ? o[1] : '') + (note ? (o ? ': ' : '') + note : '') + (cb ? ' · 🔁 ' + fmtD(cb) : '') + (hold && !s.hold ? ' · ⏸ On hold' : '') + (!hold && s.hold ? ' · ▶ נישט מער On hold' : '');
  await emit('hist', uid(), { code, text, area: colArea() });
  await emit('col', colKey(code), { out: k || 'note', outAt: now, outBy: me, cb: cb || '', hold });
  if (colArea() === 'fund') {   // was due to be asked again: move "ask again" on, like the old "היינט צו בעטן" page did
    const t = todayS(), A = ask(code);
    if (A.next && A.next <= t && k) await emit('acct', code, { lastAsk: t, nextAsk: cb || (k === 'noans' || k === 'msg' ? addDays(t, 3) : (addFreq(t, A.freq) || '')) });
  }
  toast('✓ אפגעהיטן');
  ui.cm.i++; vCalling(); colNav();
}
async function colPin(code) {
  const s = colSt(code), v = prompt('📌 א נאטיץ וואס אלע זען ביי דעם אקאונט:', s.pin || '');
  if (v === null) return;
  await emit('col', colKey(code), { pin: v.trim() }); vCalling();
}

// ---------- ☑ bulk select on every list (v1.20) ----------
// Every list keeps its own selection (ui.sel[key] = Set of account codes) and shows a bar with actions for all of them
// at once: call back tomorrow / on a date (col.cb), on hold, who calls, a note, and Calling mode with only them.
const selSet = k => { ui.sel = ui.sel || {}; return (ui.sel[k] = ui.sel[k] || new Set()); };
function bulkList(k, codes) { window._bulk = window._bulk || {}; window._bulk[k] = codes; }
function selBox(k, code) { return `<input type="checkbox" class="selcb" ${selSet(k).has(+code) ? 'checked' : ''} onclick="event.stopPropagation();selToggle('${k}',${+code},this.checked)" title="אויסקלייבן">`; }
function selAllBox(k) { const L = (window._bulk || {})[k] || [], s = selSet(k), all = L.length && L.every(c => s.has(c)); return `<input type="checkbox" class="selcb" ${all ? 'checked' : ''} onclick="selAll('${k}',this.checked)" title="אלע">`; }
function selToggle(k, code, on) { const s = selSet(k); if (on) s.add(code); else s.delete(code); bulkRefresh(k); }
function selAll(k, on) { const s = selSet(k); ((window._bulk || {})[k] || []).forEach(c => on ? s.add(c) : s.delete(c)); render(); }
function bulkRefresh(k) { const e = document.getElementById('bulk-' + k); if (e) e.outerHTML = bulkBar(k); }
const cbWord = () => colArea() === 'tu' ? 'אפגעשטופט' : 'צוריק קאלן';
function bulkBar(k) {
  const n = selSet(k).size, tot = ((window._bulk || {})[k] || []).length;
  if (!n) return `<div id="bulk-${k}" class="bulkbar off"><span class="dim">☑ קלייבט אויס כדי צו טון עפעס פאר אסאך אויף איינמאל</span>${tot ? `<button class="btn ghost sm" onclick="selAll('${k}',true)">☑ אלע ${tot.toLocaleString()}</button>` : ''}</div>`;
  return `<div id="bulk-${k}" class="bulkbar"><b>☑ ${n.toLocaleString()} אויסגעקליבן</b>
   <button class="btn ghost sm" onclick="selAll('${k}',true)">אלע ${tot.toLocaleString()}</button><button class="btn ghost sm" onclick="ui.sel['${k}']=new Set();render()">✕ אויסמעקן</button><span class="bsep"></span>
   <button class="btn sm" onclick="bulkCb('${k}',1)">🔁 ${cbWord()}: מארגן</button><button class="btn ghost sm" onclick="bulkCbForm('${k}')">🔁 אום א טאג…</button>
   <button class="btn ghost sm" onclick="bulkIgn('${k}',true)" title="מער נישט ארויפקומען צו קאלן">🚫 Ignore</button><button class="btn ghost sm" onclick="bulkIgn('${k}',false)">↩ Un-ignore</button>
   <button class="btn ghost sm" onclick="bulkHold('${k}',true)">⏸ On hold</button><button class="btn ghost sm" onclick="bulkHold('${k}',false)">▶ נישט On hold</button>
   <select class="mini" onchange="if(this.value!=='-')bulkWho('${k}',this.value)"><option value="-">👤 ווער קאלט…</option><option value="">נישט צוגעטיילט</option>${USERS().map(u => `<option>${esc(u)}</option>`).join('')}</select>
   <button class="btn ghost sm" onclick="bulkNoteForm('${k}')">📝 נאטיץ פאר אלע</button><button class="btn gold sm" onclick="bulkCall('${k}')">▶ Calling mode</button></div>`;
}
async function bulkEmit(rows, msg) {   // [{k, eid, p}] in batches of 500
  try {
    const R = rows.map(r => ({ k: r.k, eid: r.eid, p: r.p, by: me }));
    for (let i = 0; i < R.length; i += 500) await q(sb.from('events').insert(R.slice(i, i + 500)));
    R.forEach(r => applyEvent({ k: r.k, id: r.eid, p: r.p, by: me, at: new Date().toISOString() }));
  } catch (e) { toast('⚠️ ' + (e.message || e)); return false; }
  closeM(); render(); toast('✓ ' + msg); return true;
}
const selCodes = k => [...selSet(k)];
function bulkCb(k, days, date) {
  const d = date || addDays(todayS(), days), C = selCodes(k);
  return bulkEmit(C.map(c => ({ k: 'col', eid: colKey(c), p: { cb: d } })), C.length + ' – ' + cbWord() + ' ' + fmtD(d));
}
function bulkCbForm(k) {
  modal(`<h2>🔁 ${cbWord()} – ${selSet(k).size} אקאונטס</h2><label class="f">אום וועלכן טאג${dateField('bkd', addDays(todayS(), 1))}</label>
   <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="bulkCb('${k}',0,$('#bkd').value)">OK</button></div>`, 'narrow');
}
function bulkIgn(k, on) { const C = selCodes(k); return bulkEmit(C.map(c => ({ k: 'col', eid: colKey(c), p: { ign: on } })), C.length + (on ? ' – 🚫 Ignored (מער נישט צו קאלן)' : ' – ↩ צוריק צו קאלן')); }
function bulkHold(k, on) { const C = selCodes(k); return bulkEmit(C.map(c => ({ k: 'col', eid: colKey(c), p: { hold: on } })), C.length + (on ? ' – On hold' : ' – נישט מער On hold')); }
function bulkWho(k, who) {
  const C = selCodes(k), f = colArea() === 'tu' ? 'tuWho' : 'assigned';
  return bulkEmit(C.map(c => ({ k: 'acct', eid: String(c), p: { [f]: who } })), C.length + ' – ' + (who || 'נישט צוגעטיילט'));
}
function bulkNoteForm(k) {
  modal(`<h2>📝 נאטיץ פאר ${selSet(k).size} אקאונטס</h2><label class="f">די נאטיץ<textarea id="bkn" rows="3"></textarea></label>
   <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="bulkNote('${k}')">Save</button></div>`, 'narrow');
  setTimeout(() => $('#bkn').focus(), 50);
}
function bulkNote(k) {
  const t = $('#bkn').value.trim(); if (!t) { $('#bkn').focus(); return; }
  const C = selCodes(k), at = new Date().toISOString();
  return bulkEmit(C.map(c => ({ k: 'hist', eid: uid(), p: { code: c, text: t, area: colArea() } })), C.length + ' נאטיצן');
}
function bulkCall(k) {
  const C = selCodes(k).filter(c => IDX.by.has(c)); if (!C.length) return;
  ui.cm = { tab: 'sel', codes: C, i: 0 }; view = 'calling'; render();
}

// ---------- ✅ "נגמר מלאכתו" (v1.24): everything finished in the last 2 days, in this area ----------
// Finished office work (tasks done: doneAt/doneBy/doneTs) and finished account reminders (call outcomes from the
// collection, "ask again" results, statements and e-mails sent – their `hist` notes). Nothing is deleted; the page
// just shows today and yesterday.
function doneItems() {
  const from = addDays(todayS(), -1), out = [];
  Object.entries(S.task).forEach(([id, x]) => {
    if (!taskVisible(x) || !x.done || !x.doneAt || x.doneAt < from) return;
    out.push({ ts: x.doneTs || x.doneAt + 'T12:00', kind: 'task', icon: taskCat(x) === 'call' ? '📞' : '📋', text: x.title, who: x.doneBy || x.who || '', code: x.code ? +x.code : 0, id });
  });
  Object.values(S.hist).forEach(h => {
    if (!h.at || h.at.slice(0, 10) < from || (h.area || 'fund') !== colArea()) return;
    const t = String(h.text || '');
    if (t.startsWith('✓ ')) return;   // a finished task's note – the task itself is listed
    if (!(t.startsWith('📞') || h.res || t.startsWith('📄') || t.startsWith('✉️'))) return;
    out.push({ ts: h.at, kind: 'acct', icon: t.startsWith('📄') ? '📄' : t.startsWith('✉️') ? '✉️' : '☑️', text: t.replace(/^📞\s*/, ''), who: h.by || '', code: +h.code || 0 });
  });
  return out.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
}
function vDone() {
  const L = doneItems(), t = todayS(), nT = L.filter(x => x.kind === 'task').length, nA = L.length - nT;
  const name = c => { const a = IDX.by.get(+c); return a ? `<a class="name" onclick="${AREA === 'tu' && typeof tuFamily === 'function' ? `tuFamily(${c})` : `openAcct(${c})`}">${esc(a.h || a.n)}</a>` : ''; };
  const day = d => d === t ? 'היינט' : 'נעכטן';
  let cur = '';
  $('#main').innerHTML = `<div class="row"><div><h2>✅ נגמר מלאכתו</h2><p class="sub">וואס מ'האט פארטיג געמאכט היינט און נעכטן: אפיס ארבעט און אקאונטס (רופן, בעטן, סטעיטמענטס, אימעילס).</p></div></div>
   <div class="tiles"><div class="tile t2"><i>🗂️</i><h3>אפיס ארבעט געענדיגט</h3><b>${nT}</b><span>היינט און נעכטן</span></div><div class="tile t1"><i>☑️</i><h3>אקאונטס געענדיגט</h3><b>${nA}</b><span>רופן, בעטן, סטעיטמענטס</span></div></div>
   <div class="collist">${L.map(x => { const d = String(x.ts).slice(0, 10), hd = d !== cur ? (cur = d, `<h3 style="margin:14px 0 4px">${day(d)} · ${fmtDual(d)}</h3>`) : '';
     return hd + `<div class="colrow done0" style="border-right:6px solid ${userColor(x.who)}"><span style="font-size:20px">${x.icon}</span><div class="cr1"><b>${esc(x.text)}</b> ${x.code ? '· ' + name(x.code) : ''}
       <div class="cr2">${String(x.ts).length > 10 ? new Date(x.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' : ''}${userChip(x.who)}</div></div>${x.kind === 'task' ? `<button class="btn ghost sm" onclick="taskUndo('${x.id}')">↩ צוריק</button>` : ''}</div>`; }).join('') || '<div class="empty">נאך גארנישט פארטיג היינט אדער נעכטן</div>'}</div>`;
}
