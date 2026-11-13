// YG Fund – 🎓 Tuition (שכר לימוד) section, view `tuition`. Loaded before app.js; functions only.
// Data: JLS company `tuitionCompany` (default 15), extracted by JLS.extract(..., {tuition}) into its own
// Storage file jls/jls-tuition.json.gz (loaded only when this section is opened):
//   payments  [num, code, date, amount, type, check, notes, refunded, period, studentNum, receiptNum]   (all years)
//   charges   [num, code, due, amount, paid, balance, desc, hold, note, entered, studentNum, period, item] (all years: the monthly bills)
//   contracts [id, code, start, end, item, desc, amount, type, period, studentNum, scholarship, notes, payment] (JLS MYearly)
//   students  [num, code, fname, lname, fnameH, lnameH, class, start, end]
// The tuition AREA (chosen after login, app.js setArea) has its own nav: thome, tuition, tubill, tustmt, todo (tasks with area 'tu').
// Per-family app data rides on the `acct` event: tuWho (who calls about tuition); notes go to `hist`; statements sent = `tust` events.
let TU = null, tuVersion = 0, tuLoading = null;

async function loadTU() {
  if (TU && tuVersion === jlsVersion) return TU;
  if (tuLoading) return tuLoading;
  tuLoading = (async () => {
    try {
      const blob = await q(sb.storage.from('jls').download('jls-tuition.json.gz'));
      TU = JSON.parse(await gunzip(blob)); TU.contracts = TU.contracts || [];
    } catch (e) { TU = { missing: true, payments: [], charges: [], contracts: [], students: [] }; }
    tuVersion = jlsVersion; tuLoading = null; return TU;
  })();
  return tuLoading;
}

// The school year = the Jewish year (contracts are made every Tishrei)
const tuHY = d => (d && d >= '1900' && (HEB.parts(d) || {}).y) || 0;
const tuNowY = () => tuHY(todayS());
const tuYearStart = () => HEB.toGreg(tuNowY(), 'Tishri', 1);

function tuCalc() {
  const today = todayS(), ys = tuYearStart(), fam = new Map();
  const F = c => fam.get(c) || (fam.set(c, { code: c, kids: [], ch: [], pay: [], ct: [], billed: 0, paid: 0, bal: 0, due: 0, yrBilled: 0, yrPaid: 0, last: '', cur: false }), fam.get(c));
  TU.students.forEach(s => { const f = F(s[1]); f.kids.push(s); if (!s[8] || s[8] >= today) f.cur = true; });
  const byKids = TU.students.length > 0;   // "learning now" = has a TCYG student now (from JLS StudentDate)
  TU.contracts.forEach(c => { const f = F(c[1]); f.ct.push(c); if (!byKids && c[2] <= today && (!c[3] || c[3] >= today)) f.cur = true; });
  TU.charges.forEach(c => {
    const f = F(c[1]); f.ch.push(c);
    if (c[2] >= ys) { f.yrBilled += c[3]; if (!byKids) f.cur = true; }
    f.bal += c[5];
    if (!c[7] && c[5] > 0.005 && c[2] && c[2] <= today) f.due += c[5];
  });
  TU.payments.forEach(p => {
    const f = F(p[1]); f.pay.push(p);
    if (p[7]) return;
    if (p[2] >= ys) f.yrPaid += p[3];
    if (p[2] > f.last) f.last = p[2];
  });
  const L = [...fam.values()];
  const tot = { fams: L.length, curFams: L.filter(f => f.cur).length, kids: TU.students.filter(s => !s[8] || s[8] >= today).length, yrBilled: 0, yrPaid: 0, bal: 0, due: 0, dueFams: 0 };
  L.forEach(f => { tot.yrBilled += f.yrBilled; tot.yrPaid += f.yrPaid; if (f.bal > 0) tot.bal += f.bal; tot.due += f.due; if (f.due > 0.5) tot.dueFams++; });
  return { L, tot, ys };
}

const tuKidName = s => s[4] || s[5] ? (s[4] + ' ' + s[5]).trim() : (s[2] + ' ' + s[3]).trim();
function tuFamName(code) {
  const a = IDX && IDX.by.get(+code);
  return a ? `<b>${esc(a.h || a.n)}</b>${a.h && a.n ? ` <small class="dim">${esc(a.n)}</small>` : ''}` : '#' + code;
}

function vTuition() {
  if (!tuReady('tuition')) return;
  const { L, tot } = tuCalc();
  ui.tuF = ui.tuF || 'cur'; ui.tuN = ui.tuN || 100;
  const qs = (ui.tuQ || '').trim().toLowerCase();
  let R = L.filter(f => ui.tuF === 'all' ? true : ui.tuF === 'cur' ? f.cur : ui.tuF === 'bal' ? f.bal > 0.5 : f.due > 0.5);
  if (ui.tuW) R = R.filter(f => { const w = (S.acct[f.code] || {}).tuWho || ''; return ui.tuW === '__none' ? !w : ui.tuW === '__me' ? w === me : w === ui.tuW; });
  if (qs) {
    const qd = qs.replace(/\D/g, '');
    R = L.filter(f => {
      const a = IDX.by.get(f.code) || { ph: [] };
      if (qs.replace('#', '') === String(f.code)) return true;
      if (qd.length >= 4 && a.ph.some(p => p[1].replace(/\D/g, '').includes(qd))) return true;
      return [a.h, a.n, ...f.kids.map(k => k.slice(2, 6).join(' '))].join(' ').toLowerCase().includes(qs);
    });
  }
  const srt = ui.tuSort || 'due';
  R.sort(srt === 'abc' ? (a, b) => ((IDX.by.get(a.code) || {}).lh || '').localeCompare((IDX.by.get(b.code) || {}).lh || '', 'he') : srt === 'bal' ? (a, b) => b.bal - a.bal : (a, b) => b.due - a.due || b.bal - a.bal);
  window._ln = lastNotes(); window._tuR = R;
  const chip = (k, v, t) => `<button class="chip ${ui[k] === v ? 'on' : ''}" onclick="ui.${k}='${v}';ui.tuN=100;vTuition()">${t}</button>`;
    $('#main').innerHTML = `<div class="row"><div><h2>👨‍👦 עלטערן און תלמידים</h2><p class="sub">JLS קאמפעני ${TU.co}${TU.name ? ' – ' + esc(TU.name) : ''} · דערהיינטיגט ${fmtD((TU.importedAt || '').slice(0, 10))}</p></div><div class="spacer"></div>
     <button class="btn ghost" onclick="tuXls()">⬇ Excel</button></div>
   <div class="row" style="margin:10px 0;flex-wrap:wrap;gap:6px">
    <input id="tuq" placeholder="🔍 נאמען, תלמיד, טעלעפאן, #קאוד" value="${esc(ui.tuQ || '')}" style="max-width:260px" oninput="ui.tuQ=this.value;clearTimeout(window._tuT);window._tuT=setTimeout(()=>{vTuition();const e=$('#tuq');e.focus();e.setSelectionRange(e.value.length,e.value.length)},300)">
    ${chip('tuF', 'cur', '🎓 לערנען יעצט')}${chip('tuF', 'due', '⏰ שולדיג יעצט')}${chip('tuF', 'bal', '📒 מיט באלאנס')}${chip('tuF', 'all', 'אלע (אויך פריער)')}
    <select class="mini" onchange="ui.tuW=this.value;vTuition()"><option value="">👤 אלע</option><option value="__me" ${ui.tuW === '__me' ? 'selected' : ''}>👤 מיינע</option><option value="__none" ${ui.tuW === '__none' ? 'selected' : ''}>👤 נישט צוגעטיילט</option>${USERS().map(u => `<option ${ui.tuW === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
    <select class="mini" onchange="ui.tuSort=this.value;vTuition()"><option value="due">סארטיר: שולדיג יעצט</option><option value="bal" ${srt === 'bal' ? 'selected' : ''}>סארטיר: באלאנס</option><option value="abc" ${srt === 'abc' ? 'selected' : ''}>סארטיר: א-ב</option></select>
    <span class="dim">${R.length.toLocaleString()} פאמיליעס</span></div>
   <table><thead><tr><th>פאמיליע</th><th>תלמידים</th><th>טעלעפאן</th><th class="num">שולדיג יעצט</th><th class="num">באלאנס</th><th>לעצטע באצאלונג</th><th></th></tr></thead><tbody>
   ${R.slice(0, ui.tuN).map(f => {
    const a = IDX.by.get(f.code) || { ph: [] }, st = S.acct[f.code] || {};
    const kids = f.kids.slice().sort((x, y) => (!!x[8] - !!y[8]) || (y[7] || '').localeCompare(x[7] || ''));   // learning now first, then those who learned before
    return `<tr><td><a class="name" onclick="tuFamily(${f.code})">${tuFamName(f.code)}</a> <small class="dim">#${f.code}</small>${lastNoteHTML(f.code, true)}</td>
     <td style="font-size:13px">${kids.slice(0, 6).map(k => `<span style="${k[8] ? 'opacity:.55' : ''}">${esc(k[4] || k[2])}${k[6] ? ` <small class="dim">${esc(k[6])}</small>` : ''}${k[8] ? ` <small class="dim">(געלערנט ביז ${HEB.gem(tuHY(k[8]))})</small>` : ''}</span>`).join('<br>') + (kids.length > 6 ? '<br>…' : '') || '—'}</td>
     <td style="font-size:13px" class="ltr">${a.ph.slice(0, 2).map(p => callBtn(p[1], f.code) + ' ' + esc(p[1])).join('<br>')}</td>
     <td class="num ${f.due > 0.5 ? 'bal' : ''}"><b>${money(f.due)}</b></td><td class="num">${money(f.bal)}</td>
     <td style="font-size:13px">${f.last ? fmtD(f.last) : '—'}</td>
     <td><div class="acts">${whoSel(`tuAssign(${f.code},this.value)`, st.tuWho || '')}<button class="btn ghost sm" onclick="noteForm(${f.code})">📝 נאטיץ</button></div></td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">—</td></tr>'}
   </tbody></table>
   ${R.length > ui.tuN ? `<div style="text-align:center;margin:12px"><button class="btn ghost" onclick="ui.tuN+=200;vTuition()">ווייז מער (${(R.length - ui.tuN).toLocaleString()})</button></div>` : ''}`;
}

async function tuAssign(code, v) { await emit('acct', code, { tuWho: v }); toast(v ? '✓ ' + v + ' – שכר לימוד ' + acctName(+code) : 'נישט צוגעטיילט'); }

function tuFamily(code) {
  const f = tuCalc().L.find(x => x.code === +code); if (!f) return;
  const a = IDX.by.get(+code) || { ph: [], a: '' }, kidOf = n => { const k = f.kids.find(s => s[0] === n); return k ? tuKidName(k) : ''; };
  const ch = f.ch.slice().sort((x, y) => (y[2] || '').localeCompare(x[2] || '')), pay = f.pay.slice().sort((x, y) => (y[2] || '').localeCompare(x[2] || ''));
  const hist = Object.values(S.hist).filter(h => +h.code === +code).sort((x, y) => (y.at || '').localeCompare(x.at || '')).slice(0, 10);
  modal(`<div class="row"><h2 style="margin:0">🎓 ${tuFamName(code)} <small class="dim">#${code}</small></h2><div class="spacer"></div>
     <button class="btn ghost sm" onclick="tuStOpen([${+code}],false)">📄 סטעיטמענט</button><button class="btn ghost sm" onclick="tuMailForm(${+code})">✉️ אימעיל</button><button class="btn ghost sm" onclick="taskForm(null,${+code})">+ To-Do</button><button class="btn ghost sm" onclick="tuFamXls(${+code})">⬇ Excel</button><button class="btn ghost sm" onclick="openAcct(${+code})">👤 אקאונט</button><button class="btn ghost sm" onclick="closeM()">Back</button></div>
   <p class="sub">${esc(a.a || '')}<br>${a.ph.slice(0, 3).map(p => callBtn(p[1], code) + ' ' + esc(p[0] + ' ' + p[1])).join(' · ')}</p>
   <div class="tiles" style="margin:8px 0;grid-template-columns:repeat(4,1fr)"><div class="tile t7"><h3>שולדיג יעצט</h3><b class="bal">${money(f.due)}</b></div><div class="tile t3"><h3>באלאנס</h3><b>${money(f.bal)}</b></div>
    <div class="tile t6"><h3>געטשארדזשט דאס יאר</h3><b>${money(f.yrBilled)}</b></div><div class="tile t5"><h3>באצאלט דאס יאר</h3><b class="zero">${money(f.yrPaid)}</b></div></div>
   <h3>👦 תלמידים</h3><table><thead><tr><th>נאמען</th><th>קלאס</th><th>אנגעהויבן</th><th>געלערנט ביז</th></tr></thead><tbody>
    ${f.kids.map(k => `<tr style="${k[8] && k[8] < todayS() ? 'opacity:.55' : ''}"><td><b>${esc((k[4] + ' ' + k[5]).trim())}</b> <small class="dim">${esc((k[2] + ' ' + k[3]).trim())}</small></td><td>${esc(k[6])}</td><td>${fmtD(k[7])}</td><td>${k[8] ? fmtD(k[8]) : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">—</td></tr>'}</tbody></table>
   <h3>📜 קאנטראקטן (יעדעס יאר תשרי)</h3><div class="scroll" style="max-height:200px"><table><thead><tr><th>יאר</th><th>וואס</th><th>תלמיד</th><th class="num">סכום</th><th>פון – ביז</th><th>נאטיץ</th></tr></thead><tbody>
    ${f.ct.slice().sort((x, y) => (y[2] || '').localeCompare(x[2] || '')).map(c => `<tr style="${c[3] && c[3] < todayS() ? 'opacity:.6' : ''}"><td>${HEB.gem(tuHY(c[2]))}</td><td>${esc(c[5] || c[4])}${c[10] ? ' <span class="tag gray">סקאלערשיפ</span>' : ''}</td><td style="font-size:13px">${esc(kidOf(c[9]))}</td><td class="num">${money(c[6])}</td><td style="font-size:13px">${fmtD(c[2])} – ${c[3] ? fmtD(c[3]) : ''}</td><td style="font-size:12px">${esc(c[11])}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">—</td></tr>'}</tbody></table></div>
   <h3>🧾 בילס (אלע יארן)</h3><div class="scroll" style="max-height:300px"><table><thead><tr><th>דאטום</th><th>וואס</th><th>קינד</th><th class="num">סכום</th><th class="num">באצאלט</th><th class="num">באלאנס</th></tr></thead><tbody>
    ${ch.map(c => `<tr style="${c[7] ? 'opacity:.55' : ''}"><td>${fmtD(c[2])}</td><td>${esc(c[6])}${c[7] ? ' <span class="tag gray">Hold</span>' : ''}${c[8] ? `<br><small class="dim">${esc(c[8])}</small>` : ''}</td><td style="font-size:13px">${esc(kidOf(c[10]))}</td>
      <td class="num">${money(c[3])}</td><td class="num">${money(c[4])}</td><td class="num ${c[5] > 0.5 && c[2] <= todayS() && !c[7] ? 'bal' : ''}">${money(c[5])}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">—</td></tr>'}</tbody></table></div>
   <h3>💵 באצאלונגען</h3><div class="scroll" style="max-height:240px"><table><thead><tr><th>דאטום</th><th class="num">סכום</th><th>ווי</th><th>שעק #</th><th>נאטיץ</th></tr></thead><tbody>
    ${pay.map(p => `<tr style="${p[7] ? 'opacity:.5;text-decoration:line-through' : ''}"><td>${fmtD(p[2])}</td><td class="num">${money(p[3])}</td><td>${esc(p[4])}</td><td class="ltr">${esc(p[5])}</td><td style="font-size:13px">${esc(p[6])}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">—</td></tr>'}</tbody></table></div>
   <div class="row"><h3>📝 היסטאריע</h3><div class="spacer"></div><button class="btn ghost sm" onclick="noteForm(${+code})">📝 נאטיץ</button></div>
   ${hist.map(h => `<div style="font-size:14px;margin:4px 0">💬 ${esc(h.text)} <small class="dim">– ${esc(h.by || '')}, ${fmtD((h.at || '').slice(0, 10))}</small></div>`).join('') || '<p class="dim">—</p>'}`);
}

function tuXls() {
  const R = window._tuR || [];
  xlsx([{ name: 'Tuition', rows: [['Code', 'Family (Hebrew)', 'Family', 'Phone', 'Children', 'Due now', 'Balance', 'Billed this year', 'Paid this year', 'Last payment', 'Who calls']].concat(R.map(f => {
    const a = IDX.by.get(f.code) || { ph: [] };
    return [f.code, a.h || '', a.n || '', (a.ph[0] || [])[1] || '', f.kids.filter(k => !k[8] || k[8] >= todayS()).map(tuKidName).join(', '), Math.round(f.due * 100) / 100, Math.round(f.bal * 100) / 100, f.yrBilled, f.yrPaid, f.last, (S.acct[f.code] || {}).tuWho || ''];
  })) }], 'tuition-' + todayS() + '.xlsx');
}
function tuFamXls(code) {
  const f = tuCalc().L.find(x => x.code === +code); if (!f) return;
  xlsx([
    { name: 'Charges', rows: [['Date', 'Description', 'Student #', 'Amount', 'Paid', 'Balance', 'Hold', 'Note']].concat(f.ch.map(c => [c[2], c[6], c[10] || '', c[3], c[4], c[5], c[7] ? 'yes' : '', c[8]])) },
    { name: 'Payments', rows: [['Date', 'Amount', 'Type', 'Check #', 'Refunded', 'Notes']].concat(f.pay.map(p => [p[2], p[3], p[4], p[5], p[7] ? 'yes' : '', p[6]])) },
    { name: 'Children', rows: [['Name (Hebrew)', 'Name', 'Class', 'Start', 'End']].concat(f.kids.map(k => [(k[4] + ' ' + k[5]).trim(), (k[2] + ' ' + k[3]).trim(), k[6], k[7], k[8]])) }
  ], 'tuition-' + code + '.xlsx');
}

// ---------- shared: wait for the tuition file ----------
function tuReady(v) {
  if (!TU || tuVersion !== jlsVersion) {
    $('#main').innerHTML = '<p class="empty">⏳ לאדט שכר לימוד...</p>';
    loadTU().then(() => { if (view === v) render(); });
    return false;
  }
  if (TU.missing || (!TU.charges.length && !TU.payments.length)) {
    $('#main').innerHTML = `<h2>🎓 שכר לימוד</h2><div class="banner">ℹ️ <div>עס איז נאך נישט דא קיין שכר לימוד דאטא (JLS קאמפעני ${SET().tuitionCompany === 0 ? 0 : (+SET().tuitionCompany || 15)}).<br>
      דריקט אויף <b>"דערהיינטיג פון JLS"</b> אויבן און שלעפט אריין די Tuition.mdb פייל – דאן קומט אריין שכר לימוד אויטאמאטיש.</div></div>`;
    return false;
  }
  return true;
}

// ---------- 🏠 tuition dashboard ----------
function vTuHome() {
  if (!tuReady('thome')) return;
  window._ln = lastNotes();
  const { L, tot } = tuCalc(), t = todayS(), y = tuNowY();
  const tasks = Object.entries(S.task).filter(([, x]) => taskVisible(x) && !x.done && taskMine(x) && x.due && x.due <= t).sort((a, b) => (a[1].due || '').localeCompare(b[1].due || ''));
  const owe = L.filter(f => f.due > 0.5).sort((a, b) => b.due - a.due).slice(0, 10);
  const lastPays = TU.payments.filter(p => !p[7] && p[2] <= t).sort((a, b) => b[2].localeCompare(a[2])).slice(0, 10);
  const thisM = (() => { const h = HEB.parts(t); let b = 0, p = 0; TU.charges.forEach(c => { const x = HEB.parts(c[2]); if (x && x.y === h.y && x.m === h.m && !c[7]) b += c[3]; }); TU.payments.forEach(q => { const x = HEB.parts(q[2]); if (!q[7] && x && x.y === h.y && x.m === h.m) p += q[3]; }); return { b, p, m: HEB.MONTHS[h.m] }; })();
  $('#main').innerHTML = `<div class="row"><div><h2>🎓 שכר לימוד</h2><p class="sub">${fmtDual(t)} · JLS קאמפעני ${TU.co}${TU.name ? ' – ' + esc(TU.name) : ''} · דערהיינטיגט ${fmtD((TU.importedAt || '').slice(0, 10))}</p></div></div>
   <div class="tiles">
    <div class="tile t1" onclick="ui.tuF='cur';go('tuition')"><i>👨‍👦</i><h3>עלטערן</h3><b>${tot.curFams.toLocaleString()}</b><span>${tot.kids.toLocaleString()} תלמידים לערנען יעצט</span></div>
    <div class="tile t6" onclick="go('tubill')"><i>🧾</i><h3>Billing ${HEB.gem(y)}</h3><b>${money(tot.yrBilled)}</b><span>${tot.yrBilled ? Math.round(tot.yrPaid / tot.yrBilled * 100) + '% באצאלט' : ''}</span></div>
    <div class="tile t5" onclick="go('tubill')"><i>💵</i><h3>באצאלט ${HEB.gem(y)}</h3><b class="zero">${money(tot.yrPaid)}</b><span>${esc(thisM.m)}: ${money(thisM.p)} פון ${money(thisM.b)}</span></div>
    <div class="tile t7" onclick="ui.tuF='due';go('tuition')"><i>⏰</i><h3>שולדיג שוין יעצט</h3><b class="bal">${money(tot.due)}</b><span>${tot.dueFams} פאמיליעס</span></div>
    <div class="tile t3" onclick="go('tustmt')"><i>📄</i><h3>סטעיטמענטס</h3><b>${tot.dueFams}</b><span>פאמיליעס מיט אן אפענעם ביל</span></div>
   </div>
   <div class="cols">
    <div class="hcol t2"><h3>מיינע To-Do פאר היינט</h3>
     ${tasks.slice(0, 8).map(([id, x]) => todoRow(id, x)).join('') || '<div class="empty">🎉 גארנישט פאר היינט</div>'}
     <div class="row" style="margin-top:8px"><button class="btn gold sm" onclick="taskForm()">+ נייע זאך</button><button class="btn ghost sm" onclick="go('todo')">די גאנצע ליסטע</button></div></div>
    <div class="hcol t7"><h3>⏰ שולדיג מערסטע</h3><table><tbody>
     ${owe.map(f => `<tr><td><a class="name" onclick="tuFamily(${f.code})">${tuFamName(f.code)}</a>${lastNoteHTML(f.code, true)}</td><td class="num bal"><b>${money(f.due)}</b></td></tr>`).join('') || '<tr><td class="empty">🎉 קיינער</td></tr>'}</tbody></table>
     <div class="row" style="margin-top:8px"><button class="btn ghost sm" onclick="ui.tuF='due';go('tuition')">די גאנצע ליסטע</button></div></div>
    <div class="hcol t5"><h3>💵 לעצטע באצאלונגען</h3><table><tbody>
     ${lastPays.map(p => `<tr><td style="white-space:nowrap;font-size:13px">${fmtD(p[2])}</td><td><a class="name" onclick="tuFamily(${p[1]})">${tuFamName(p[1])}</a></td><td class="num">${money(p[3])}</td></tr>`).join('') || '<tr><td class="empty">—</td></tr>'}</tbody></table></div>
   </div>`;
}

// ---------- 🧾 Billing: every Jewish year, a box per month ----------
function tuYears() {
  const Y = {}, G = y => Y[y] || (Y[y] = { y, b: 0, p: 0, o: 0, n: new Set(), m: {} }), M = (o, m) => o.m[m] || (o.m[m] = { b: 0, p: 0, o: 0 });
  TU.charges.forEach(c => { if (c[7]) return; const h = HEB.parts(c[2]); if (!h || c[2] < '1990') return; const o = G(h.y), m = M(o, h.m); o.b += c[3]; m.b += c[3]; o.o += c[5]; m.o += c[5]; o.n.add(c[1]); });
  TU.payments.forEach(p => { if (p[7]) return; const h = HEB.parts(p[2]); if (!h || p[2] < '1990') return; const o = G(h.y), m = M(o, h.m); o.p += p[3]; m.p += p[3]; });
  return Object.values(Y).sort((a, b) => b.y - a.y);
}
function vTuBill() {
  if (!tuReady('tubill')) return;
  const Y = tuYears(), now = HEB.parts(todayS()), max = Math.max(...Y.map(y => y.b), 1), shown = Y.slice(0, ui.tuBN || 4);
  $('#main').innerHTML = `<div class="row"><div><h2>🧾 Billing – שכר לימוד</h2><p class="sub">יעדעס יאר תשרי מאכט מען א קאנטראקט, און יעדן חודש ווערט א ביל. אין יעדן קעסטל: וויפיל מ'האט געבילט, וויפיל איז אריינגעקומען, און וויפיל איז נאך אפן. דריקט אויף א חודש צו זען די פאמיליעס.</p></div><div class="spacer"></div>
     <button class="btn ghost" onclick="tuBillXls()">⬇ Excel</button></div>
   ${shown.map(y => `<div class="yrcard"><div class="row" style="margin:0 0 8px"><b class="yr">${HEB.gem(y.y)}</b><div class="bar" style="flex:1;height:12px;margin:0"><i style="width:${y.b / max * 100}%"></i></div>
     <span class="dim" style="font-size:13px">${y.n.size} פאמיליעס · ${TU.contracts.filter(c => tuHY(c[2]) === y.y).length} קאנטראקטן</span></div>
    <div class="mgrid" style="--n:${HEB.monthsOf(y.y).length + 1}">${HEB.monthsOf(y.y).map(m => { const v = y.m[m], cur = now && now.y === y.y && now.m === m;
      return `<div class="mbox${v ? ' click' : ' empty0'}${cur ? ' cur' : ''}"${v ? ` onclick="tuMonth(${y.y},'${m}')"` : ''}><span>${HEB.MONTHS[m]}</span><b>${v ? money(v.b) : '—'}</b>${v ? `<small>💵 ${money(v.p)}</small>${v.o > 0.5 ? `<small class="bal">אפן ${money(v.o)}</small>` : ''}` : ''}</div>`; }).join('')}
     <div class="mbox tot click" onclick="tuMonth(${y.y},'')"><span>ס"ה ${HEB.gem(y.y)}</span><b>${money(y.b)}</b><small>💵 ${money(y.p)}</small>${y.o > 0.5 ? `<small class="bal">אפן ${money(y.o)}</small>` : ''}</div></div></div>`).join('') || '<div class="empty">קיין בילס</div>'}
   ${Y.length > shown.length ? `<div class="more"><button class="btn ghost" onclick="ui.tuBN=(ui.tuBN||4)+6;vTuBill()">ווייז נאך יארן (${Y.length - shown.length})</button></div>` : ''}`;
}
function tuMonthRows(hy, m) {
  const inM = d => { const h = HEB.parts(d); return h && h.y === hy && (!m || h.m === m); }, F = new Map();
  const G = c => F.get(c) || (F.set(c, { code: c, b: 0, pd: 0, o: 0, p: 0, n: 0 }), F.get(c));
  TU.charges.forEach(c => { if (!c[7] && inM(c[2])) { const g = G(c[1]); g.b += c[3]; g.pd += c[4]; g.o += c[5]; g.n++; } });
  TU.payments.forEach(p => { if (!p[7] && inM(p[2])) G(p[1]).p += p[3]; });
  return [...F.values()].sort((a, b) => b.o - a.o || b.b - a.b);
}
function tuMonth(hy, m) {
  const R = tuMonthRows(hy, m), T = R.reduce((t, r) => ({ b: t.b + r.b, o: t.o + r.o, p: t.p + r.p }), { b: 0, o: 0, p: 0 }), ttl = (m ? HEB.MONTHS[m] + ' ' : 'גאנץ יאר ') + HEB.gem(hy);
  window._tuM = { hy, m, R };
  modal(`<div class="row"><h2 style="margin:0">🧾 ${esc(ttl)}</h2><div class="spacer"></div><button class="btn ghost sm" onclick="tuMonthXls()">⬇ Excel</button><button class="btn ghost sm" onclick="closeM()">Back</button></div>
   <p class="sub">${R.length} פאמיליעס · געבילט ${money(T.b)} · אריינגעקומען ${money(T.p)} · נאך אפן <b class="bal">${money(T.o)}</b></p>
   <div class="scroll" style="max-height:65vh"><table><thead><tr><th>פאמיליע</th><th class="num">בילס</th><th class="num">געבילט</th><th class="num">באצאלט</th><th class="num">נאך אפן</th><th class="num">באצאלונגען אין דער צייט</th></tr></thead><tbody>
   ${R.map(r => `<tr><td><a class="name" onclick="tuFamily(${r.code})">${tuFamName(r.code)}</a> <small class="dim">#${r.code}</small></td><td class="num">${r.n}</td><td class="num">${money(r.b)}</td><td class="num">${money(r.pd)}</td><td class="num ${r.o > 0.5 ? 'bal' : ''}">${money(r.o)}</td><td class="num">${money(r.p)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">—</td></tr>'}</tbody></table></div>`);
}
function tuMonthXls() {
  const { hy, m, R } = window._tuM || {}; if (!R) return;
  xlsx([{ name: (m || 'year') + ' ' + hy, rows: [['Code', 'Family (Hebrew)', 'Family', 'Bills', 'Billed', 'Paid on these bills', 'Open', 'Payments in this time']].concat(R.map(r => { const a = IDX.by.get(r.code) || {}; return [r.code, a.h || '', a.n || '', r.n, r2(r.b), r2(r.pd), r2(r.o), r2(r.p)]; })) }], 'tuition-' + hy + (m ? '-' + m : '') + '.xlsx');
}
function tuBillXls() {
  const Y = tuYears(), rows = [['Year', 'Month', 'Billed', 'Paid', 'Open']];
  Y.forEach(y => { HEB.monthsOf(y.y).forEach(m => { const v = y.m[m]; if (v) rows.push([HEB.gem(y.y), HEB.MONTHS[m], r2(v.b), r2(v.p), r2(v.o)]); }); rows.push([HEB.gem(y.y), 'ס"ה', r2(y.b), r2(y.p), r2(y.o)]); });
  xlsx([{ name: 'Billing', rows }, { name: 'Families', rows: [['Code', 'Family (Hebrew)', 'Family', 'Due now', 'Balance', 'Billed this year', 'Paid this year', 'Last payment']].concat(tuCalc().L.filter(f => f.cur || f.bal > 0.5).map(f => { const a = IDX.by.get(f.code) || {}; return [f.code, a.h || '', a.n || '', r2(f.due), r2(f.bal), r2(f.yrBilled), r2(f.yrPaid), f.last]; })) }], 'tuition-billing.xlsx');
}

// ---------- 📄 tuition statements – one page per family for one Hebrew month, laid out like the JLS "Statements TCYG" report ----------
const TU_ST_DEF = 'צו באצאלן אייער באלאנס אדער פאר סיי וואספארא פראגע, הערה, פעימענט פלאן בנוגע שכר לימוד וכדומה, ביטע זיך פארבינדען מיט דער ישיבה אפיס אויף 845-782-1380';
const TU_ST_NOTE2 = 'אדאנק די אחריות\'דיגע עלטערן וואס באצאלן שכר לימוד יעדן חודש קען מען ב"ה באצאלן "צייטליך-געהאלט"\nבאצאלט שכר לימוד יעדע \'אנהויב\' חודש, רופט אין אפיס 845-782-1380';
const tuStSent = c => (S.tust[c] || {}).sent;
function tuStMonth() {   // {y, m, ds, de, name}
  ui.tuSt = ui.tuSt || { min: 1, sel: {}, q: '' };
  if (!ui.tuSt.ym) { const h = HEB.parts(todayS()); ui.tuSt.ym = h.y + '|' + h.m; }
  const [y, m] = ui.tuSt.ym.split('|'), ms = HEB.monthsOf(+y), k = ms.indexOf(m);
  const ds = HEB.toGreg(+y, m, 1), nx = k < ms.length - 1 ? HEB.toGreg(+y, ms[k + 1], 1) : HEB.toGreg(+y + 1, 'Tishri', 1);
  const d = parse(nx); d.setDate(d.getDate() - 1);
  return { y: +y, m, ds, de: iso(d), name: HEB.MONTHS[m] + ' ' + HEB.gem(+y) };
}
function tuStMonthOpts() {   // this Hebrew month back 14 months, plus next month
  const out = []; let d = addMonths(todayS(), 1);
  for (let i = 0; i < 16; i++) { const h = HEB.parts(d), k = h.y + '|' + h.m; if (!out.some(o => o[0] === k)) out.push([k, HEB.MONTHS[h.m] + ' ' + HEB.gem(h.y)]); d = addMonths(d, -1); }
  return out;
}
const tuPayDesc = p => (/check/i.test(p[4]) && p[5] ? 'Check #' + p[5] : p[4]);
const tuPayAmt = p => p[3] - (p[7] || 0);
function tuStCalc(f, M) {
  const ys = HEB.toGreg(M.y, 'Tishri', 1), kid = n => { const k = f.kids.find(x => x[0] === n); return k ? (k[4] || k[2]) : ''; };
  let old = 0, prevYr = 0;
  f.ch.forEach(c => { if (!c[7] && c[2] && c[2] < M.ds) { old += c[3]; if (c[2] < ys) prevYr += c[3]; } });
  f.pay.forEach(p => { if (p[2] && p[2] < M.ds) { old -= tuPayAmt(p); if (p[2] < ys) prevYr -= tuPayAmt(p); } });
  const L = [];
  f.ch.forEach(c => { if (!c[7] && c[2] >= M.ds && c[2] <= M.de) L.push({ d: c[2], desc: [c[12] || c[6], c[11]].filter(Boolean).join(' - '), note: '', kid: kid(c[10]), ch: c[3], pay: 0, item: c[12] || c[6] }); });
  f.pay.forEach(p => { if (p[2] >= M.ds && p[2] <= M.de) L.push({ d: p[2], desc: tuPayDesc(p), note: p[6], kid: '', ch: 0, pay: tuPayAmt(p) }); });
  L.sort((a, b) => a.d.localeCompare(b.d) || b.ch - a.ch);
  const bal = old + L.reduce((s, x) => s + x.ch - x.pay, 0);
  const perKid = new Map(); f.ch.forEach(c => { if (!c[7] && c[2] <= M.de && c[5] > 0.005) { const k = kid(c[10]) || '—'; perKid.set(k, (perKid.get(k) || 0) + c[5]); } });
  const items = new Map(); L.filter(x => x.ch).forEach(x => { const k = x.item + '|' + x.ch; const o = items.get(k) || { item: x.item, amt: x.ch, n: 0 }; o.n++; items.set(k, o); });
  // students learning in TCYG in this month (JLS StudentDate), with that year's class
  const kids = TU.enroll ? f.kids.map(k => { const e = TU.enroll.find(x => x[0] === k[0] && (!x[2] || x[2] <= M.de) && (!x[3] || x[3] >= M.ds)); return e ? k.slice(0, 6).concat([e[4] || k[6]], k.slice(7)) : null; }).filter(Boolean)
    : f.kids.filter(k => (!k[7] || k[7] <= M.de) && (!k[8] || k[8] >= M.ds));
  return { old, prevYr: Math.min(prevYr, bal), L, bal, perKid: [...perKid], items: [...items.values()], kids };
}
function tuStRows() {
  const M = tuStMonth(), qs = (ui.tuSt.q || '').trim().toLowerCase();
  return tuCalc().L.map(f => { const st = tuStCalc(f, M); return { c: f.code, f, M, st, bal: st.bal, a: IDX.by.get(f.code) || { h: '', n: '#' + f.code, ph: [], a: '' } }; })
    .filter(r => (r.bal >= (+ui.tuSt.min || 0.01) || (ui.tuSt.all && r.st.L.length)) && (!qs || [r.a.h, r.a.n, '#' + r.c].join(' ').toLowerCase().includes(qs)))
    .sort((a, b) => (a.a.lh || '').localeCompare(b.a.lh || '', 'he'));
}
const tuStIsSel = r => ui.tuSt.sel[r.c] !== false;
function vTuStmt() {
  if (!tuReady('tustmt')) return;
  const M = tuStMonth(), R = tuStRows(); window._tuStR = R;
  const sel = R.filter(tuStIsSel), withMail = sel.filter(r => emailOf(r.c));
  $('#main').innerHTML = `<div class="row"><div><h2>📄 סטעיטמענטס – שכר לימוד</h2><p class="sub">איין בלאט פער פאמיליע פאר איין חודש, ווי דער JLS סטעיטמענט: חוב ישן, די בילס און באצאלונגען פון חודש, נשאר חוב, חוב פער תלמיד.</p></div><div class="spacer"></div>
     <button class="btn ghost" onclick="tuStSettings()">⚙️ Text</button></div>
   <div class="row" style="flex-wrap:wrap;gap:8px;margin:10px 0">
    <select onchange="ui.tuSt.ym=this.value;ui.tuSt.sel={};vTuStmt()">${tuStMonthOpts().map(([k, t]) => `<option value="${k}" ${k === ui.tuSt.ym ? 'selected' : ''}>חודש ${esc(t)}</option>`).join('')}</select>
    <input placeholder="🔍 נאמען / #קאוד" value="${esc(ui.tuSt.q)}" style="max-width:200px" onchange="ui.tuSt.q=this.value;vTuStmt()">
    <label style="font-size:13px">מינימום חוב $<input type="number" value="${ui.tuSt.min}" style="width:80px" onchange="ui.tuSt.min=+this.value||0;vTuStmt()"></label>
    <label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" ${ui.tuSt.all ? 'checked' : ''} onchange="ui.tuSt.all=this.checked;vTuStmt()"> אויך די וואס זענען אויסגעגליכן</label>
    <div class="spacer"></div><span class="dim">${sel.length} אויסגעקליבן · ${money(sel.reduce((s, r) => s + r.bal, 0))}</span>
    <button class="btn" onclick="tuStPrint()">🖨️ דרוק (${sel.length})</button><button class="btn gold" onclick="tuStMailAll()">✉️ שיק אימעיל (${withMail.length})</button><button class="btn ghost" onclick="tuStXls()">⬇ Excel</button></div>
   <table><thead><tr><th><input type="checkbox" ${sel.length === R.length && R.length ? 'checked' : ''} onchange="tuStAll(this.checked)"></th><th>פאמיליע</th><th>אדרעס</th><th>אימעיל</th><th class="num">חוב ישן</th><th class="num">${esc(HEB.MONTHS[M.m])}</th><th class="num">נשאר חוב</th><th>לעצטע מאל געשיקט</th><th></th></tr></thead><tbody>
   ${R.map(r => `<tr><td><input type="checkbox" ${tuStIsSel(r) ? 'checked' : ''} onchange="ui.tuSt.sel[${r.c}]=this.checked;vTuStmt()"></td>
    <td><a class="name" onclick="tuFamily(${r.c})">${tuFamName(r.c)}</a> <small class="dim">#${r.c}</small></td>
    <td style="font-size:13px">${r.a.a ? `<span class="ltr">${esc(r.a.a)}</span>` : '<span class="tag late">⚠️ קיין אדרעס</span>'}</td>
    <td style="font-size:12px" class="ltr">${esc(emailOf(r.c))}</td>
    <td class="num">${money(r.st.old)}</td><td class="num">${money(r.st.L.reduce((s, x) => s + x.ch - x.pay, 0))}</td><td class="num ${r.bal > 0.5 ? 'bal' : ''}"><b>${money(r.bal)}</b></td>
    <td style="font-size:13px">${tuStSent(r.c) ? `<span class="tag ok">✓ ${fmtD(tuStSent(r.c))}</span>` : ''}</td>
    <td><div class="acts"><button class="btn ghost sm" title="קוק אן" onclick="tuStOpen([${r.c}],false)">👁</button><button class="btn ghost sm" title="אימעיל" onclick="tuMailForm(${r.c})">✉️</button></div></td></tr>`).join('') || '<tr><td colspan="9" class="empty">🎉 קיינער</td></tr>'}
   </tbody></table>`;
}
function tuStAll(v) { tuStRows().forEach(r => { ui.tuSt.sel[r.c] = v; }); vTuStmt(); }
const tuM$ = n => (n < 0 ? '-$' : '$') + rcMoney(Math.abs(n));
function tuStPage(r) {
  const a = r.a, s = SET(), ad = rcAddr(a), t = todayS(), st = r.st, M = r.M;
  const nm = a.h ? a.h + ' ' + (s.tuSuffix != null ? s.tuSuffix : 'נ"י') : '';
  return `<div class="pg tu${stLH() ? ' lh' : ''}">
   ${stHead()}
   <div class="tutop"><span>בס"ד</span><span>${rcDate(t)} · ${HEB.fmtHeb(t)}</span></div>
   <div class="row2" style="margin-top:.2in"><div class="to"><div class="en">${esc(a.n)}</div><div class="en">${esc(ad[0])}</div><div class="en">${esc(ad[1])}</div><div class="en" style="font-size:9pt;color:#777">#${r.c}</div></div>
    <div class="dt"><div class="hn" style="text-align:right;font-size:14pt">${esc(nm)}</div></div></div>
   <div class="tuttl">שכר לימוד סטעיטמענט</div><div class="tumon">~ חודש ${esc(HEB.MONTHS[M.m])} ~</div>
   ${st.kids.length ? `<table class="tukids"><thead><tr><th>שם התלמיד</th><th>Class</th></tr></thead><tbody>${st.kids.map(k => `<tr><td class="r">${esc(k[4] || k[2])}</td><td>${esc(k[6])}</td></tr>`).join('')}</tbody></table>` : ''}
   <table class="tudet"><thead><tr><th>דאטום</th><th>Date</th><th>איינצעלהייטן</th><th>שם התלמיד</th><th>פרייז</th><th>באצאלט</th><th>באלאנס</th></tr></thead><tbody>
    ${Math.abs(st.old) > 0.005 ? `<tr><td class="r">${HEB.fmtHeb(addDays(M.ds, -1))}</td><td>${rcDate(addDays(M.ds, -1))}</td><td class="r"><b>חוב ישן</b></td><td></td><td>${tuM$(st.old)}</td><td></td><td>${tuM$(st.old)}</td></tr>` : ''}
    ${st.L.map(x => `<tr><td class="r">${HEB.fmtHeb(x.d)}</td><td>${rcDate(x.d)}</td><td class="r">${esc(x.desc)}${x.note ? ' <small>' + esc(x.note) + '</small>' : ''}</td><td class="r">${esc(x.kid)}</td><td>${x.ch ? tuM$(x.ch) : ''}</td><td>${x.pay ? tuM$(x.pay) : ''}</td><td>${tuM$(x.ch - x.pay)}</td></tr>`).join('')}
   </tbody><tfoot><tr><td colspan="6" class="r">נשאר חוב</td><td><b>${tuM$(st.bal)}</b></td></tr></tfoot></table>
   <div class="tusub"><div>Old Balance - חוב ישן: <b>${tuM$(st.prevYr)}</b></div><div>Current Year Balance - חוב משנה זו: <b>${tuM$(st.bal - st.prevYr)}</b></div></div>
   <div class="tuboxes">
    <div class="tubox"><div class="tubh">ס"ה די חודש</div>${st.items.map(o => `<div><span class="r">${esc(o.item)}</span><span>${tuM$(o.amt)}${o.n > 1 ? ' x ' + o.n : ''}</span></div>`).join('') || '<div>—</div>'}<div class="tubt"><span>ס"ה</span><span>${tuM$(st.items.reduce((s2, o) => s2 + o.amt * o.n, 0))}</span></div></div>
    <div class="tubox"><div class="tubh">חוב פער תלמיד</div>${st.perKid.map(([k, v]) => `<div><span class="r">${esc(k)}</span><span>${tuM$(v)}</span></div>`).join('') || '<div>—</div>'}<div class="tubt"><span>ס"ה חוב</span><span>${tuM$(st.perKid.reduce((s2, x) => s2 + x[1], 0))}</span></div></div>
    <div class="tubox tunote">${esc(s.tuStText || TU_ST_DEF).replace(/\n/g, '<br>')}</div>
   </div>
   <div class="tutot">Total Balance · סך הכל חוב: <b>${tuM$(st.bal)}</b></div>
   <div class="tunote2">${esc(s.tuStNote2 != null ? s.tuStNote2 : TU_ST_NOTE2).replace(/\n/g, '<br>')}</div>
   <div class="ft">Please make checks payable to <b>Yeshivas Maharit Satmar</b> · P.O. Box 1367 · Monroe NY 10949</div></div>`;
}
const TU_ST_CSS = `<style>.pg.tu{padding:.45in .6in}.tutop{display:flex;justify-content:space-between;font-size:10pt;margin-top:6px;direction:rtl}
.tuttl{text-align:center;font-family:'Frank Ruhl Libre',serif;font-weight:900;font-size:22pt;color:#660033;margin-top:.12in}.tumon{text-align:center;font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:15pt}
.pg.tu table{margin-top:.12in;font-size:10pt;direction:rtl}.pg.tu th{text-align:right}.pg.tu td{padding:4px 6px}.tukids{width:3.2in!important;margin-right:0;margin-left:auto}
.tusub{display:flex;justify-content:space-between;font-size:9.5pt;margin-top:6px;direction:ltr}
.tuboxes{display:grid;grid-template-columns:1fr 1fr 1.6fr;gap:10px;margin-top:.15in;direction:rtl;font-size:10pt}.tubox{border:1px solid #e6d9df;border-radius:6px;padding:6px 8px}
.tubox>div{display:flex;justify-content:space-between;gap:6px}.tubh{font-weight:700;color:#660033;border-bottom:1px solid #e6d9df;margin-bottom:3px}.tubt{border-top:1px solid #660033;font-weight:700;margin-top:3px}
.tunote{display:block!important;font-family:'Frank Ruhl Libre',serif;font-size:10.5pt;line-height:1.45}.tunote2{margin-top:.12in;font-family:'Frank Ruhl Libre',serif;font-size:10.5pt;line-height:1.5;text-align:center;direction:rtl}
.pg.tu.lh{padding:2.6in .8in .75in}.pg.tu.lh .tuttl{margin-top:.05in;font-size:19pt}.pg.tu.lh .tutop{margin-top:0}.pg.tu.lh .row2{margin-top:.05in!important}.pg.tu.lh table{font-size:9.5pt}.pg.tu.lh td{padding:3px 6px}.pg.tu.lh .ft{bottom:.6in}
.tutot{margin-top:.12in;text-align:center;font-size:13pt;border-top:2px solid #660033;border-bottom:2px solid #660033;padding:5px}</style>`;
const tuStDoc = (R, autoPrint) => stDoc(R, autoPrint, tuStPage).replace('</head>', TU_ST_CSS + '</head>').replace('<title>סטעיטמענטס</title>', '<title>שכר לימוד</title>');
function tuStRow(code) { const f = tuCalc().L.find(x => x.code === +code); if (!f) return null; const M = tuStMonth(), st = tuStCalc(f, M); return { c: f.code, f, M, st, bal: st.bal, a: IDX.by.get(f.code) || { h: '', n: '#' + f.code, a: '' } }; }
function tuStOpen(codes, autoPrint) {
  const R = codes.map(tuStRow).filter(Boolean); if (!R.length) return false;
  const w = window.open('', '_blank');
  if (!w) { toast('⚠️ דער בראוזער האט בלאקירט דאס נייע פענצטער – ערלויבט Pop-ups פאר דעם וועבסייט'); return false; }
  w.document.open(); w.document.write(tuStDoc(R, autoPrint)); w.document.close(); return true;
}
function tuStPrint() {
  const sel = tuStRows().filter(tuStIsSel); if (!sel.length || !tuStOpen(sel.map(r => r.c), true)) return;
  window._tuStMark = sel;
  modal(`<h2>🖨️ ${sel.length} סטעיטמענטס</h2><p>זיי האבן זיך געעפנט אין א נייעם פענצטער. ווען עס האט גוט געדרוקט, דריקט דא כדי זיי זאלן אנגעמערקט ווערן אלס געשיקט.</p>
   <p class="sub">💡 Margins = <b>None</b>, Scale = <b>100%</b>.</p>
   <div class="row" style="justify-content:flex-end"><button class="btn ghost" onclick="closeM()">נאך נישט</button><button class="btn" onclick="tuStMark()">✓ געדרוקט – מערק אן</button></div>`, 'narrow');
}
async function tuStMark(list, how) {
  const L = list || window._tuStMark || [], t = todayS();
  try {
    const rows = L.map(r => ({ k: 'tust', eid: String(r.c), p: { sent: t, bal: r2(r.bal), month: r.M ? r.M.ds : '', how: how || 'print', by: me }, by: me }));
    for (let i = 0; i < rows.length; i += 500) await q(sb.from('events').insert(rows.slice(i, i + 500)));
    rows.forEach(r => applyEvent({ k: r.k, id: r.eid, p: r.p, by: me }));
    for (const r of L) await emit('hist', uid(), { code: r.c, text: '📄 שכר לימוד סטעיטמענט ' + (r.M ? r.M.name + ' ' : '') + (how === 'mail' ? 'געאימעילט' : 'געדרוקט') + ' – ' + money(r.bal) });
  } catch (e) { toast('⚠️ ' + (e.message || e)); return; }
  if (!list) { ui.tuSt.sel = {}; closeM(); }
  render(); toast('✓ ' + L.length + ' סטעיטמענטס אנגעמערקט');
}
function tuStXls() {
  const R = tuStRows().filter(tuStIsSel);
  xlsx([{ name: 'Statements', rows: [['Code', 'Family (Hebrew)', 'Family', 'Phone', 'Address', 'E-mail', 'Old balance', 'This month', 'Balance', 'Last sent']].concat(R.map(r => [r.c, r.a.h || '', r.a.n || '', ((r.a.ph || [])[0] || [])[1] || '', r.a.a || '', emailOf(r.c), r2(r.st.old), r2(r.bal - r.st.old), r2(r.bal), tuStSent(r.c) || ''])) },
    { name: 'Lines', rows: [['Code', 'Family', 'Date', 'Details', 'Student', 'Charge', 'Paid']].concat(R.flatMap(r => r.st.L.map(x => [r.c, r.a.h || r.a.n, x.d, x.desc + (x.note ? ' ' + x.note : ''), x.kid, x.ch || '', x.pay || '']))) }], 'tuition-statements.xlsx');
}
function tuStSettings() {
  const s = SET();
  modal(`<div dir="ltr" style="text-align:left"><h2>⚙️ Tuition statement text</h2>
   <label style="display:flex;gap:8px;align-items:center;font-size:14px;margin-bottom:10px"><input type="checkbox" id="tlh" ${stLH() ? 'checked' : ''}> Print on the letterhead (also fundraising statements)</label>
   <label class="f">After the Hebrew name<input id="tst" dir="rtl" value="${esc(s.tuSuffix != null ? s.tuSuffix : 'נ"י')}"></label>
   <label class="f" style="margin-top:10px">Box text (contact for questions)<textarea id="tsx" dir="rtl" rows="4">${esc(s.tuStText || TU_ST_DEF)}</textarea></label>
   <label class="f" style="margin-top:10px">Bottom text<textarea id="tsn" dir="rtl" rows="4">${esc(s.tuStNote2 != null ? s.tuStNote2 : TU_ST_NOTE2)}</textarea></label>
   <label class="f" style="margin-top:10px">E-mail subject<input id="tms" dir="rtl" value="${esc(s.tuMailSubject || TU_MAIL_SUBJ)}"></label>
   <label class="f" style="margin-top:10px">E-mail text ({name} {amount} {month})<textarea id="tmb" dir="rtl" rows="5">${esc(s.tuMailBody || TU_MAIL_BODY)}</textarea></label>
   <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="tuStSaveSet()">Save</button></div></div>`, 'narrow');
}
async function tuStSaveSet() { await emit('settings', 's', { stmtLH: $('#tlh').checked, tuSuffix: $('#tst').value.trim(), tuStText: $('#tsx').value.trim(), tuStNote2: $('#tsn').value.trim(), tuMailSubject: $('#tms').value.trim(), tuMailBody: $('#tmb').value.trim() }); closeM(); render(); toast('✓ Saved'); }

// ---------- ✉️ e-mail a statement (PDF) to a family ----------
const TU_MAIL_SUBJ = 'שכר לימוד סטעיטמענט – חודש {month}';
const TU_MAIL_BODY = 'לכבוד {name},\n\nבייגעלייגט איז דער שכר לימוד סטעיטמענט פאר חודש {month}. נשאר חוב: {amount}.\n\nבכבוד רב,\nהנהלת הישיבה';
const tuFill = (t, r) => t.split('{name}').join(r.a.h || r.a.n).split('{amount}').join(money(r.bal)).split('{month}').join(r.M ? r.M.name : '');
function tuMailForm(code) {
  const r = tuStRow(code); if (!r) return; const s = SET(), to = emailOf(code);
  modal(`<h2>✉️ שכר לימוד צו ${esc(r.a.h || r.a.n)}</h2>
   <div class="grid2"><label class="f" style="grid-column:1/-1">צו<input id="tmt" type="email" style="direction:ltr" value="${esc(to)}" placeholder="name@example.com"></label>
   <label class="f" style="grid-column:1/-1">CC (אפציאנאל)<input id="tmc" style="direction:ltr"></label>
   <label class="f" style="grid-column:1/-1">סאבדזשעקט<input id="tms2" dir="auto" value="${esc(tuFill(s.tuMailSubject || TU_MAIL_SUBJ, r))}"></label>
   <label class="f" style="grid-column:1/-1">דער בריוו<textarea id="tmb2" dir="auto" rows="7">${esc(tuFill(s.tuMailBody || TU_MAIL_BODY, r))}</textarea></label></div>
   <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:8px"><input type="checkbox" id="tmpdf" checked> 📎 לייג צו דעם סטעיטמענט פון חודש ${esc(r.M.name)} (PDF) – נשאר חוב ${money(r.bal)}</label>
   <div id="tmerr" class="bal" style="font-size:13px;margin-top:6px"></div>
   <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" onclick="closeM()">Back</button><button class="btn" id="tmgo" onclick="tuMailGo(${+code})">✉️ שיק</button></div>`, 'narrow');
}
async function tuMailOne(r, to, subject, body, cc, withPdf) {
  const pdf = withPdf ? await docPdf(tuStDoc([r], false)) : null;
  await mailSend(to, subject, mailHtml(body), pdf, 'Tuition-' + r.c + '-' + todayS() + '.pdf', 'tu' + r.c, cc);
  if (to !== emailOf(r.c)) await emit('acct', r.c, { email: to });
}
async function tuMailGo(code) {
  const r = tuStRow(code), to = $('#tmt').value.trim(); if (!to) { $('#tmt').focus(); return; }
  const b = $('#tmgo'); b.disabled = true; b.textContent = '⏳ שיקט...';
  try {
    await tuMailOne(r, to, $('#tms2').value, $('#tmb2').value, $('#tmc').value.trim(), $('#tmpdf').checked);
    if ($('#tmpdf').checked) await tuStMark([r], 'mail'); else await emit('hist', uid(), { code: r.c, text: '✉️ ' + $('#tms2').value });
    closeM(); render(); toast('✓ געשיקט צו ' + to);
  } catch (e) { b.disabled = false; b.textContent = '✉️ שיק'; $('#tmerr').textContent = '⚠️ ' + (e.message || e); }
}
async function tuStMailAll() {
  const s = SET(), L = tuStRows().filter(r => tuStIsSel(r) && emailOf(r.c));
  if (!L.length) { toast('קיינער פון די אויסגעקליבענע האט נישט קיין אימעיל'); return; }
  if (!confirm('שיקן ' + L.length + ' סטעיטמענטס מיט אימעיל?')) return;
  const ok = [], bad = [];
  for (let i = 0; i < L.length; i++) {
    busy('שיקט ' + (i + 1) + ' פון ' + L.length + '...');
    try { await tuMailOne(L[i], emailOf(L[i].c), tuFill(s.tuMailSubject || TU_MAIL_SUBJ, L[i]), tuFill(s.tuMailBody || TU_MAIL_BODY, L[i]), '', true); ok.push(L[i]); }
    catch (e) { bad.push((L[i].a.h || L[i].a.n) + ': ' + (e.message || e)); }
  }
  busy(false);
  if (ok.length) await tuStMark(ok, 'mail');
  if (bad.length) modal(`<h2>⚠️ ${bad.length} זענען נישט אוועק</h2><div class="scroll" style="max-height:50vh">${bad.map(x => `<div style="font-size:13px;margin:4px 0">${esc(x)}</div>`).join('')}</div><div class="row" style="justify-content:flex-end"><button class="btn" onclick="closeM()">OK</button></div>`, 'narrow');
  else toast('✓ ' + ok.length + ' אימעילס געשיקט');
}
