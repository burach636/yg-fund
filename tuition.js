// YG Fund – 🎓 Tuition (שכר לימוד) section, view `tuition`. Loaded before app.js; functions only.
// Data: JLS company `tuitionCompany` (default 15), extracted by JLS.extract(..., {tuition}) into its own
// Storage file jls/jls-tuition.json.gz (loaded only when this section is opened):
//   payments [num, code, date, amount, type, check, notes, refunded]
//   charges  [num, code, due, amount, paid, balance, desc, hold, note, entered, studentNum, period]
//   students [num, code, fname, lname, fnameH, lnameH, class, start, end]
// Per-family app data rides on the `acct` event: tuWho (who calls about tuition), notes go to `hist`.
let TU = null, tuVersion = 0, tuLoading = null;

async function loadTU() {
  if (TU && tuVersion === jlsVersion) return TU;
  if (tuLoading) return tuLoading;
  tuLoading = (async () => {
    try {
      const blob = await q(sb.storage.from('jls').download('jls-tuition.json.gz'));
      TU = JSON.parse(await gunzip(blob));
    } catch (e) { TU = { missing: true, payments: [], charges: [], students: [] }; }
    tuVersion = jlsVersion; tuLoading = null; return TU;
  })();
  return tuLoading;
}

// School year starts on 1 Elul-ish; we use Aug 1.
const tuYearStart = () => { const d = new Date(), y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; return y + '-08-01'; };

function tuCalc() {
  const today = todayS(), ys = tuYearStart(), fam = new Map();
  const F = c => fam.get(c) || (fam.set(c, { code: c, kids: [], ch: [], pay: [], billed: 0, paid: 0, bal: 0, due: 0, yrBilled: 0, yrPaid: 0, last: '' }), fam.get(c));
  TU.students.forEach(s => F(s[1]).kids.push(s));
  TU.charges.forEach(c => {
    const f = F(c[1]); f.ch.push(c);
    if (c[2] >= ys) f.yrBilled += c[3];
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
  const tot = { fams: L.length, kids: TU.students.filter(s => !s[8] || s[8] >= today).length, yrBilled: 0, yrPaid: 0, bal: 0, due: 0, dueFams: 0 };
  L.forEach(f => { tot.yrBilled += f.yrBilled; tot.yrPaid += f.yrPaid; if (f.bal > 0) tot.bal += f.bal; tot.due += f.due; if (f.due > 0.5) tot.dueFams++; });
  return { L, tot, ys };
}

const tuKidName = s => s[4] || s[5] ? (s[4] + ' ' + s[5]).trim() : (s[2] + ' ' + s[3]).trim();
function tuFamName(code) {
  const a = IDX && IDX.by.get(+code);
  return a ? `<b>${esc(a.h || a.n)}</b>${a.h && a.n ? ` <small class="dim">${esc(a.n)}</small>` : ''}` : '#' + code;
}

function vTuition() {
  if (!TU || tuVersion !== jlsVersion) {
    $('#main').innerHTML = '<p class="empty">⏳ לאדט שכר לימוד...</p>';
    loadTU().then(() => { if (view === 'tuition') vTuition(); });
    return;
  }
  if (TU.missing || (!TU.charges.length && !TU.payments.length)) {
    $('#main').innerHTML = `<h2>🎓 שכר לימוד</h2><div class="banner">ℹ️ <div>עס איז נאך נישט דא קיין שכר לימוד דאטא (JLS קאמפעני ${+SET().tuitionCompany || 15}).<br>
      דריקט אויף <b>"דערהיינטיג פון JLS"</b> אויבן און שלעפט אריין די Tuition.mdb פייל – דאן קומט אריין שכר לימוד אויטאמאטיש.</div></div>`;
    return;
  }
  const { L, tot } = tuCalc();
  ui.tuF = ui.tuF || 'due'; ui.tuN = ui.tuN || 100;
  const qs = (ui.tuQ || '').trim().toLowerCase();
  let R = L.filter(f => ui.tuF === 'all' ? true : ui.tuF === 'bal' ? f.bal > 0.5 : f.due > 0.5);
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
  const yr = HEB.gem(((HEB.parts(tuYearStart()) || {}).y || 0) + 1);
  $('#main').innerHTML = `<div class="row"><div><h2>🎓 שכר לימוד</h2><p class="sub">JLS קאמפעני ${TU.co}${TU.name ? ' – ' + esc(TU.name) : ''} · דערהיינטיגט ${fmtD((TU.importedAt || '').slice(0, 10))}</p></div><div class="spacer"></div>
     <button class="btn ghost" onclick="tuXls()">⬇ Excel</button></div>
   <div class="tiles">
    <div class="tile t1"><i>👨‍👩‍👦</i><h3>פאמיליעס</h3><b>${tot.fams.toLocaleString()}</b><span>${tot.kids.toLocaleString()} תלמידים יעצט</span></div>
    <div class="tile t6"><i>🧾</i><h3>געטשארדזשט ${esc(yr)}</h3><b>${money(tot.yrBilled)}</b><span>זינט ${fmtD(tuYearStart())}</span></div>
    <div class="tile t5"><i>💵</i><h3>באצאלט ${esc(yr)}</h3><b class="zero">${money(tot.yrPaid)}</b><span>${tot.yrBilled ? Math.round(tot.yrPaid / tot.yrBilled * 100) + '% פון געטשארדזשט' : ''}</span></div>
    <div class="tile t7" onclick="ui.tuF='due';vTuition()"><i>⏰</i><h3>שולדיג שוין יעצט</h3><b class="bal">${money(tot.due)}</b><span>${tot.dueFams} פאמיליעס</span></div>
    <div class="tile t3" onclick="ui.tuF='bal';vTuition()"><i>📒</i><h3>גאנצע באלאנס</h3><b>${money(tot.bal)}</b><span>אויך וואס קומט נאך</span></div>
   </div>
   <div class="row" style="margin:10px 0;flex-wrap:wrap;gap:6px">
    <input id="tuq" placeholder="🔍 נאמען, תלמיד, טעלעפאן, #קאוד" value="${esc(ui.tuQ || '')}" style="max-width:260px" oninput="ui.tuQ=this.value;clearTimeout(window._tuT);window._tuT=setTimeout(()=>{vTuition();const e=$('#tuq');e.focus();e.setSelectionRange(e.value.length,e.value.length)},300)">
    ${chip('tuF', 'due', '⏰ שולדיג יעצט')}${chip('tuF', 'bal', '📒 מיט באלאנס')}${chip('tuF', 'all', 'אלע')}
    <select class="mini" onchange="ui.tuW=this.value;vTuition()"><option value="">👤 אלע</option><option value="__me" ${ui.tuW === '__me' ? 'selected' : ''}>👤 מיינע</option><option value="__none" ${ui.tuW === '__none' ? 'selected' : ''}>👤 נישט צוגעטיילט</option>${USERS().map(u => `<option ${ui.tuW === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
    <select class="mini" onchange="ui.tuSort=this.value;vTuition()"><option value="due">סארטיר: שולדיג יעצט</option><option value="bal" ${srt === 'bal' ? 'selected' : ''}>סארטיר: באלאנס</option><option value="abc" ${srt === 'abc' ? 'selected' : ''}>סארטיר: א-ב</option></select>
    <span class="dim">${R.length.toLocaleString()} פאמיליעס</span></div>
   <table><thead><tr><th>פאמיליע</th><th>תלמידים</th><th>טעלעפאן</th><th class="num">שולדיג יעצט</th><th class="num">באלאנס</th><th>לעצטע באצאלונג</th><th></th></tr></thead><tbody>
   ${R.slice(0, ui.tuN).map(f => {
    const a = IDX.by.get(f.code) || { ph: [] }, st = S.acct[f.code] || {};
    const kids = f.kids.filter(k => !k[8] || k[8] >= todayS());
    return `<tr><td><a class="name" onclick="tuFamily(${f.code})">${tuFamName(f.code)}</a> <small class="dim">#${f.code}</small>${lastNoteHTML(f.code, true)}</td>
     <td style="font-size:13px">${(kids.length ? kids : f.kids).slice(0, 5).map(k => esc(k[4] || k[2]) + (k[6] ? ` <small class="dim">${esc(k[6])}</small>` : '')).join('<br>') || '—'}</td>
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
     <button class="btn ghost sm" onclick="tuFamXls(${+code})">⬇ Excel</button><button class="btn ghost sm" onclick="openAcct(${+code})">👤 אקאונט</button><button class="btn ghost sm" onclick="closeM()">Back</button></div>
   <p class="sub">${esc(a.a || '')}<br>${a.ph.slice(0, 3).map(p => callBtn(p[1], code) + ' ' + esc(p[0] + ' ' + p[1])).join(' · ')}</p>
   <div class="tiles" style="margin:8px 0;grid-template-columns:repeat(4,1fr)"><div class="tile t7"><h3>שולדיג יעצט</h3><b class="bal">${money(f.due)}</b></div><div class="tile t3"><h3>באלאנס</h3><b>${money(f.bal)}</b></div>
    <div class="tile t6"><h3>געטשארדזשט דאס יאר</h3><b>${money(f.yrBilled)}</b></div><div class="tile t5"><h3>באצאלט דאס יאר</h3><b class="zero">${money(f.yrPaid)}</b></div></div>
   <h3>👦 תלמידים</h3><table><thead><tr><th>נאמען</th><th>קלאס</th><th>אנגעהויבן</th><th>געענדיגט</th></tr></thead><tbody>
    ${f.kids.map(k => `<tr style="${k[8] && k[8] < todayS() ? 'opacity:.55' : ''}"><td><b>${esc((k[4] + ' ' + k[5]).trim())}</b> <small class="dim">${esc((k[2] + ' ' + k[3]).trim())}</small></td><td>${esc(k[6])}</td><td>${fmtD(k[7])}</td><td>${k[8] ? fmtD(k[8]) : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">—</td></tr>'}</tbody></table>
   <h3>🧾 טשארדזשעס</h3><div class="scroll" style="max-height:260px"><table><thead><tr><th>דאטום</th><th>וואס</th><th>קינד</th><th class="num">סכום</th><th class="num">באצאלט</th><th class="num">באלאנס</th></tr></thead><tbody>
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
