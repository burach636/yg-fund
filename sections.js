/* YG Fund – dashboard, To-Do list, fundraiser accounts, shuls.
   Loaded BEFORE app.js; only defines functions (uses app.js globals at call time). */
'use strict';

// ---------- tasks: private / two people ----------
const myKey = () => (myEmail || '').toLowerCase();
// A private task is seen only by the person who made it (UI filter + RLS on events, see SETUP.sql).
const taskVisible = x => x && x.title && !x.del && (!x.priv || (x.owner || '').toLowerCase() === myKey());
const taskMine = x => x.who === me || x.who2 === me;
const taskWho = x => [x.who, x.who2].filter(Boolean).join(' + ') || 'נישט צוגעטיילט';
// Every event on a private task carries priv+owner, so the database never shows it to others.
async function emitTask(id, p) {
  const cur = S.task[id];
  if (cur && cur.priv && p.priv === undefined) p = Object.assign({ priv: true, owner: cur.owner }, p);
  await emit('task', id, p);
}

// ---------- HOME / DASHBOARD ----------
function vHome() {
  window._ln = lastNotes();
  const t = todayS(), F = fundCalc(), sh = shulSchedule(4);
  const tasks = Object.entries(S.task).filter(([, x]) => taskVisible(x) && !x.done);
  const mineOpen = tasks.filter(([, x]) => taskMine(x));
  const late = mineOpen.filter(([, x]) => x.due && x.due < t).length;
  const dueToday = mineOpen.filter(([, x]) => x.due && x.due <= t).sort((a, b) => (a[1].due || '').localeCompare(b[1].due || ''));
  const shuls = shulList();
  const next = sh[0];
  let sinceRH = 0; JD.payments.forEach(p => { if (p[2] >= F.start && p[2] <= t && !p[9]) sinceRH += p[3]; });
  const rcNew = rcItems().filter(p => p[2] >= F.start && p[2] <= t && !rcPrinted(p)).length;
  const hyNow = (HEB.parts(t) || {}).y; let thisYr = 0; JD.payments.forEach(p => { if (!p[9] && validD(p[2]) && (HEB.parts(p[2]) || {}).y === hyNow) thisYr += p[3]; });
  const askToday = todayItems('all').filter(x => x.kind === 'ask').length;
  $('#main').innerHTML = `
  <div class="row"><div><h2>שלום ${esc(me)}!</h2><p class="sub">${fmtDual(t)}</p></div></div>
  ${next ? `<div class="banner" onclick="go('shuls')">🕍 <div><b>${next.date === t ? 'היינט' : 'מיטוואך ' + fmtDual(next.date)}</b> גייט מען נאך געלט אין: <b class="big">${esc(next.s.name)}</b><br><span class="ltr">${esc(next.s.addr || '')}</span></div></div>` : ''}
  <div class="tiles">
    <div class="tile t1" onclick="go('accounts')"><i>👥</i><h3>נדבות</h3><b>${IDX.yg.size.toLocaleString()}</b><span>נדבנים · ${money(sinceRH)} זינט ראש השנה</span><span>${askToday} צו בעטן היינט</span></div>
    <div class="tile t2" onclick="go('todo')"><i>✅</i><h3>To-Do ליסטע</h3><b>${mineOpen.length}</b><span>מיינע אפענע זאכן</span>${late ? `<span class="bal">${late} שפעט!</span>` : '<span>&nbsp;</span>'}</div>
    <div class="tile t3" onclick="go('fund')"><i>💵</i><h3>פאנדרעיזינג חשבונות</h3><b class="${F.balance > 0.009 ? 'bal' : 'zero'}">${money(F.balance)}</b><span>${F.balance >= 0 ? 'מ\'איז שולדיג די פאנדרעיזערס' : 'איבערבאצאלט'}</span><span>די 2 וואכן: ${money(F.cur ? F.cur.owed : 0)}</span></div>
    <div class="tile t4" onclick="go('shuls')"><i>🕍</i><h3>שולן</h3><b>${shuls.length}</b><span>שולן אויף דער ליסטע</span><span>${next ? 'קומענדיג: ' + esc(next.s.name) : 'לייגט צו שולן'}</span></div>
    <div class="tile t5" onclick="go('rcpt')"><i>🧾</i><h3>רעסיטס/סטעיטמענטס</h3><b>${rcNew}</b><span>נאך נישט געדרוקט</span><span>זינט ${fmtD(F.start)}</span></div>
    <div class="tile t6" onclick="go('reports')"><i>📊</i><h3>באריכטן</h3><b>${money(thisYr)}</b><span>אריינגעקומען ${HEB.gem((HEB.parts(t) || {}).y || 0)}</span><span>לויט חדשים און יארן</span></div>
    <div class="tile t7" onclick="go('jrep')"><i>📑</i><h3>רופארטס</h3><b>${jrDefs().length || 1}</b><span>ליסטעס פון JLS צו קאלן</span><span>${esc((jrDefs()[0] || { name: 'דינער מהרי"ט 2026' }).name)}</span></div>
  </div>
  <div class="cols">
   <div class="hcol t2"><h3>מיינע To-Do פאר היינט</h3>
    ${dueToday.slice(0, 8).map(([id, x]) => todoRow(id, x)).join('') || '<div class="empty">🎉 גארנישט פאר היינט</div>'}
    <div class="row" style="margin-top:8px"><button class="btn gold sm" onclick="taskForm()">+ נייע זאך</button><button class="btn ghost sm" onclick="go('todo')">די גאנצע ליסטע</button></div></div>
   <div class="hcol t4"><h3>שולן – קומענדיגע מיטוואכן</h3>
    ${sh.length ? `<table><tbody>${sh.map(v => `<tr><td style="white-space:nowrap">${fmtDual(v.date)}</td><td><b>${esc(v.s.name)}</b><br><span class="ltr" style="font-size:12px;color:var(--muted)">${esc(v.s.addr || '')}</span></td></tr>`).join('')}</tbody></table>` : '<div class="empty">נאך קיין שולן. <a class="name" onclick="go(\'shuls\')">לייגט צו</a></div>'}
   </div></div>`;
}

// ---------- TO-DO LIST ----------
function todoRow(id, x) {
  const t = todayS(), late = x.due && x.due < t ? daysBetween(x.due, t) : 0;
  const a = x.code ? IDX.by.get(+x.code) : null;
  return `<div class="task" style="${x.done ? 'opacity:.5' : ''}"><div class="chk" title="געטון" onclick="${x.done ? `taskUndo('${id}')` : `taskDone('${id}')`}">${x.done ? '✓' : ''}</div>
   <div><div class="t">${x.priv ? '<span class="tag gray">🔒 פריוואט</span> ' : ''}${x.who && x.who2 ? '<span class="tag custom">👥 צוויי</span> ' : ''}${esc(x.title)}
    ${a ? `· <a class="name" onclick="openAcct(${x.code})">${esc(a.h || a.n)}</a>` : ''} ${x.pri === 'hi' ? '<span class="tag hi">דרינגענד</span>' : ''}
    ${late ? `<span class="tag late">שפעט ${late} טעג</span>` : (x.due === t && !x.done ? '<span class="tag ask">היינט</span>' : '')}</div>
   <div class="m"><span>📅 ${x.due ? fmtDual(x.due) : 'אן א דאטום'}</span><span>👤 ${esc(taskWho(x))}</span>${x.note ? `<span>📝 ${esc(x.note)}</span>` : ''}${x.repeat && FREQ[x.repeat] ? `<span>🔁 ${FREQ[x.repeat][0]}</span>` : ''}${x.done ? `<span>✓ ${fmtD(x.doneAt)}</span>` : ''}</div></div>
   <div class="acts">${x.rc ? `<button class="btn gold sm" onclick="rcOpenTask('${id}')">🖨️ עפן רעסיטס</button>` : ''}${x.fm ? `<button class="btn gold sm" onclick="frMailTask('${id}')">✉️ שיק צום אפיס</button>` : ''}${x.done ? '' : `<button class="btn sm" onclick="taskDone('${id}')">✓ געטון</button>`}<button class="btn ghost sm" onclick="taskForm('${id}')">ענדער</button></div></div>`;
}
function vTodo() {
  const all = Object.entries(S.task).filter(([, x]) => taskVisible(x));
  const open = all.filter(([, x]) => !x.done);
  const F = {
    mine: ['מיינע', x => taskMine(x)],
    only: ['נאר איך', x => x.who === me && !x.who2],
    priv: ['🔒 פריוואט', x => x.priv],
    two: ['👥 צוויי באניצער', x => x.who && x.who2],
    none: ['נישט צוגעטיילט', x => !x.who && !x.who2],
    all: ['אלע', () => true]
  };
  const f = F[ui.todoF] ? ui.todoF : 'mine';
  let L = ui.todoDone ? all.filter(([, x]) => x.done && F[f][1](x)).sort((a, b) => (b[1].doneAt || '').localeCompare(a[1].doneAt || ''))
    : open.filter(([, x]) => F[f][1](x)).sort((a, b) => (a[1].due || '9999').localeCompare(b[1].due || '9999') || (b[1].pri === 'hi') - (a[1].pri === 'hi'));
  $('#main').innerHTML = `<div class="row"><div><h2>To-Do ליסטע</h2><p class="sub">אלע זאכן וואס מ'דארף טון. 🔒 פריוואט = נאר דער וואס האט עס געמאכט זעט עס. 👥 = פאר צוויי באניצער צוזאמען.</p></div><div class="spacer"></div>
   <button class="btn gold" onclick="taskForm()">+ נייע זאך</button></div>
  <div class="row"><div class="chips">${Object.entries(F).map(([k, [l, fn]]) => `<button class="chip ${f === k ? 'on' : ''}" onclick="ui.todoF='${k}';vTodo()">${l} (${open.filter(([, x]) => fn(x)).length})</button>`).join('')}</div>
   <div class="spacer"></div><label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" ${ui.todoDone ? 'checked' : ''} onchange="ui.todoDone=this.checked;vTodo()"> ווייז וואס איז שוין געטון</label></div>
  ${L.slice(0, 300).map(([id, x]) => todoRow(id, x)).join('') || `<div class="empty">${ui.todoDone ? 'גארנישט' : '🎉 אלעס געטון!'}</div>`}`;
}
async function taskUndo(id) { await emitTask(id, { done: false }); render(); }

// ---------- FUNDRAISER ACCOUNTS ----------
const RH5787 = '2026-09-12';
function fundCalc() {
  const s = SET(), pct = s.frPct != null ? +s.frPct : 40, start = s.frStart || RH5787, t = todayS();
  const income = [];
  if (JD) JD.payments.forEach(p => { if (validD(p[2]) && p[2] >= start && p[2] <= t && !p[9]) income.push({ d: p[2], amt: p[3], code: p[1], src: 'JLS' }); });
  Object.entries(S.frin).forEach(([id, x]) => { if (!x.del && x.date >= start) income.push({ d: x.date, amt: +x.amt || 0, note: x.note, id, src: 'app' }); });
  const exempt = Object.entries(S.frex || {}).filter(([, x]) => !x.del && x.date >= start).map(([id, x]) => Object.assign({ id }, x, { amt: +x.amt || 0 })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  // Dinner expenses: subtracted from the income before the fundraisers' % (in the 2 weeks of their date)
  const expenses = Object.entries(S.frexp || {}).filter(([, x]) => !x.del && validD(x.date)).map(([id, x]) => Object.assign({ id }, x, { amt: +x.amt || 0, hy: +x.hy || expYearOf(x.date) })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const paid = Object.entries(S.fr).filter(([, x]) => !x.del).map(([id, x]) => Object.assign({ id }, x)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const periods = [];
  if (t >= start) {
    const n = Math.floor(daysBetween(start, t) / 14);
    for (let k = 0; k <= n; k++) periods.push({ k, from: addDays(start, 14 * k), to: addDays(start, 14 * k + 13), income: 0, count: 0, ex: 0, exp: 0, owed: 0, paid: 0, bal: 0 });
  }
  income.forEach(i => { const p = periods[Math.floor(daysBetween(start, i.d) / 14)]; if (p) { p.income += i.amt; p.count++; } });
  exempt.forEach(e => { const p = periods[Math.floor(daysBetween(start, e.date) / 14)]; if (p) p.ex += e.amt; });
  // Dinner expenses go by Jewish year: the year's income first covers that year's expenses,
  // and only what comes in after them earns the fundraisers' % (2-week periods belong to the year they start in).
  const expByYear = {}; expenses.forEach(e => { expByYear[e.hy] = (expByYear[e.hy] || 0) + e.amt; });
  const left = Object.assign({}, expByYear), expYears = {};
  let cumO = 0, cumP = 0;
  periods.forEach(p => {
    p.hy = expYearOf(p.from);
    const base = p.income - p.ex, ded = Math.min(Math.max(base, 0), left[p.hy] || 0);
    p.exp = ded; left[p.hy] = (left[p.hy] || 0) - ded;
    const Y = expYears[p.hy] || (expYears[p.hy] = { hy: p.hy, total: expByYear[p.hy] || 0, covered: 0 }); Y.covered += ded;
    p.owed = (base - ded) * pct / 100;
    p.paid = paid.filter(x => x.date >= p.from && x.date <= p.to).reduce((s, x) => s + (+x.amt || 0), 0);
    cumO += p.owed; cumP += p.paid; p.bal = cumO - cumP;
  });
  const totPaid = paid.reduce((s, x) => s + (+x.amt || 0), 0), totIn = income.reduce((s, i) => s + i.amt, 0), totEx = exempt.reduce((s, x) => s + x.amt, 0);
  Object.keys(expByYear).forEach(y => { if (!expYears[y]) expYears[y] = { hy: +y, total: expByYear[y], covered: 0 }; });
  Object.values(expYears).forEach(Y => { Y.left = Math.max(0, Y.total - Y.covered); });
  const totExp = periods.reduce((s, p) => s + p.exp, 0);   // what was taken off so far
  const totOwed = periods.reduce((s, p) => s + p.owed, 0);
  return { pct, start, income, paid, exempt, expenses, expYears, totExp, periods, totIn, totEx, totOwed, totPaid, balance: totOwed - totPaid, cur: periods[periods.length - 1] };
}
function vFund() {
  const F = fundCalc();
  $('#main').innerHTML = `<div class="row"><div><h2>פאנדרעיזינג חשבונות</h2><p class="sub">פון יעדן דאלער וואס קומט אריין זינט ${fmtDual(F.start)} באקומען די פאנדרעיזערס <b>${F.pct}%</b>. עס ווערט אויסגערעכנט יעדע 2 וואכן. די באצאלונגען צו זיי ווערן אראפגערעכנט.</p></div><div class="spacer"></div>
   ${SET().frAuto ? `<span class="tag ok" title="ווערט געשיקט אליין ${SET().frAutoDays != null ? SET().frAutoDays : 2} טעג נאך די 2 וואכן">⏰ אויטאמאטיש</span>` : ''}<button class="btn" onclick="frMailForm()">✉️ אימעיל צום אפיס</button><button class="btn ghost" onclick="xlsFund()">⬇ Excel</button><button class="btn ghost" onclick="fundSettings()" title="${F.pct}% · ${fmtD(F.start)}">⚙️ Settings</button><button class="btn ghost" onclick="frInForm()">+ אריינקומען (נישט אין JLS)</button><button class="btn ghost" onclick="frExForm()">+ סכום אן פראצענט</button><button class="btn ghost" onclick="expForm()">🍽️ + דינער עקספענס</button><button class="btn gold" onclick="frForm()">+ באצאלט די פאנדרעיזערס</button></div>
  <div class="stats">
   <div class="stat"><b>${money(F.totIn)}</b><span>אריינגעקומען זינט ${fmtD(F.start)}</span></div>
   ${F.totEx ? `<div class="stat"><b>${money(F.totEx)}</b><span>אן פראצענט (אראפגערעכנט)</span></div>` : ''}
   <div class="stat click" onclick="document.getElementById('expbox').scrollIntoView({behavior:'smooth'})"><b>${money(F.totExp)}</b><span>🍽️ דינער עקספענסעס – שוין אראפגערעכנט</span></div>
   <div class="stat"><b>${money(F.totOwed)}</b><span>${F.pct}% קומט די פאנדרעיזערס</span></div>
   <div class="stat"><b>${money(F.totPaid)}</b><span>שוין באצאלט (${F.paid.length} מאל)</span></div>
   <div class="stat"><b class="${F.balance > 0.009 ? 'bal' : 'zero'}">${money(F.balance)}</b><span>${F.balance >= 0 ? 'נאך שולדיג' : 'איבערבאצאלט'}</span></div></div>
  <p class="sub">💡 די JLS באצאלונגען זענען ביז דער לעצטער דערהיינטיגונג (${new Date(JD.importedAt).toLocaleDateString()}). דערהיינטיגט פון JLS כדי עס זאל זיין גענוי.</p>
  <div class="cols"><div><h3>יעדע 2 וואכן</h3>
   <table><thead><tr><th>תקופה</th><th>באצאל.</th><th>אריינגעקומען</th>${F.totEx ? '<th>אן %</th>' : ''}${F.totExp ? '<th>🍽️ עקספענסעס</th>' : ''}<th>${F.pct}%</th><th>באצאלט</th><th>באלאנס</th><th></th></tr></thead><tbody>
   ${F.periods.slice().reverse().map(p => `<tr><td style="font-size:13px;white-space:nowrap">${fmtD(p.from)} –<br>${fmtD(p.to)}${p === F.cur ? ' <span class="tag ask">יעצט</span>' : ''}</td><td class="num">${p.count}</td><td class="num">${money(p.income)}</td>${F.totEx ? `<td class="num">${p.ex ? '−' + money(p.ex) : ''}</td>` : ''}${F.totExp ? `<td class="num">${p.exp ? '−' + money(p.exp) : ''}</td>` : ''}<td class="num"><b>${money(p.owed)}</b></td><td class="num">${p.paid ? money(p.paid) : ''}</td><td class="num ${p.bal > 0.009 ? 'bal' : 'zero'}">${money(p.bal)}</td><td><button class="btn ghost sm" onclick="frPeriod(${p.k})">ווייז</button> <button class="btn ghost sm" title="שיק אימעיל צום אפיס" onclick="frMailForm(${p.k})">✉️</button>${(S.frmail[p.from] || {}).sent ? `<br><span class="tag ok">✉️ ${fmtD(S.frmail[p.from].sent)}</span>` : ''}</td></tr>`).join('') || `<tr><td colspan="9" class="empty">הייבט זיך אן ${fmtD(F.start)}</td></tr>`}
   </tbody></table></div>
  <div><h3>באצאלונגען צו די פאנדרעיזערס</h3>
   <table><thead><tr><th>טאג</th><th>סכום</th><th>צו וועמען</th><th>נאטיץ</th><th></th></tr></thead><tbody>
   ${F.paid.map(x => `<tr><td class="num">${fmtD(x.date)}</td><td class="num"><b>${money(x.amt)}</b></td><td>${esc(x.to || '')}</td><td style="font-size:13px">${esc(x.note || '')}<br><small class="dim">${esc(x.by || '')}</small></td><td><button class="btn ghost sm" onclick="frForm('${x.id}')">ענדער</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">נאך גארנישט באצאלט</td></tr>'}
   </tbody></table>
   ${F.exempt.length ? `<h3>סכומים אן פראצענט</h3><table><tbody>${F.exempt.map(x => `<tr><td class="num">${fmtD(x.date)}</td><td class="num">−${money(x.amt)}</td><td style="font-size:13px">${esc(x.note || '')}</td><td><button class="btn ghost sm" onclick="frExForm('${x.id}')">ענדער</button></td></tr>`).join('')}</tbody></table>` : ''}
   ${Object.values(S.frin).some(x => !x.del) ? `<h3>אריינקומען וואס איז נישט אין JLS</h3><table><tbody>${Object.entries(S.frin).filter(([, x]) => !x.del).sort((a, b) => b[1].date.localeCompare(a[1].date)).map(([id, x]) => `<tr><td class="num">${fmtD(x.date)}</td><td class="num">${money(x.amt)}</td><td style="font-size:13px">${esc(x.note || '')}</td><td><button class="btn ghost sm" onclick="frInForm('${id}')">ענדער</button></td></tr>`).join('')}</tbody></table>` : ''}
  </div></div>
  ${expSection(F)}`;
  const qi = $('#expq');
  if (qi) { if (ui._expFocus) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); ui._expFocus = false; } let tm; qi.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { ui.expQ = qi.value; ui._expFocus = true; vFund(); }, 300); }; }
}
function frPeriod(k) {
  const F = fundCalc(), p = F.periods[k]; if (!p) return;
  const L = F.income.filter(i => i.d >= p.from && i.d <= p.to).sort((a, b) => a.d.localeCompare(b.d));
  modal(`<div class="row"><h2 style="margin:0">${fmtD(p.from)} – ${fmtD(p.to)}</h2><div class="spacer"></div><button class="btn ghost sm" onclick="closeM()">✕</button></div>
   <div class="row"><button class="btn ghost sm" onclick="xlsPeriod(${k})">⬇ Excel</button></div>
   <p class="sub">${p.count} באצאלונגען · ${money(p.income)}${p.ex ? ' · אן פראצענט: −' + money(p.ex) : ''}${p.exp ? ' · 🍽️ עקספענסעס: −' + money(p.exp) : ''} · ${F.pct}% = <b>${money(p.owed)}</b></p>
   <div class="scroll" style="max-height:60vh"><table><thead><tr><th>טאג</th><th>נאמען</th><th>סכום</th><th>${F.pct}%</th></tr></thead><tbody>
   ${L.map(i => `<tr><td class="num">${fmtD(i.d)}</td><td>${i.code ? `<a class="name" onclick="closeM();openAcct(${i.code})">${esc(acctName(i.code))}</a>` : esc(i.note || 'אריינקומען')}</td><td class="num">${money(i.amt)}</td><td class="num">${money(i.amt * F.pct / 100)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">גארנישט</td></tr>'}
   </tbody></table></div>`);
}
function frForm(id) {
  const x = id ? S.fr[id] : { date: todayS(), amt: '', to: '', note: '' };
  const names = [...new Set(Object.values(S.fr).map(v => v.to).filter(Boolean))];
  modal(`<h2>${id ? 'ענדער באצאלונג' : 'באצאלט די פאנדרעיזערס'}</h2><div class="grid2">
   <label class="f">טאג${dateField('fd', x.date)}</label>
   <label class="f">סכום $<input id="fa" type="number" step="0.01" value="${esc(x.amt)}"></label>
   <label class="f">צו וועמען<input id="ft" list="frnames" value="${esc(x.to || '')}"><datalist id="frnames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
   <label class="f">נאטיץ (טשעק נומער א.א.וו.)<input id="fn" value="${esc(x.note || '')}"></label></div>
   <div class="row" style="justify-content:flex-end;margin-top:14px">${id ? `<button class="btn red" onclick="frDel('fr','${id}')">אויסמעקן</button><div class="spacer"></div>` : ''}<button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="frSave('${id || ''}')">Save</button></div>`, 'narrow');
  setTimeout(() => $('#fa').focus(), 50);
}
async function frSave(id) {
  const amt = +$('#fa').value; if (!amt) { $('#fa').focus(); return; }
  await emit('fr', id || uid(), { date: $('#fd').value || todayS(), amt, to: $('#ft').value.trim(), note: $('#fn').value.trim(), by: me, del: false });
  closeM(); render(); toast('✓ אפגעהיטן – אראפגערעכנט');
}
function frInForm(id) {
  const x = id ? S.frin[id] : { date: todayS(), amt: '', note: '' };
  modal(`<h2>אריינקומען וואס איז נישט אין JLS</h2><p class="sub">נאר אויב דאס געלט ווערט <b>נישט</b> פארשריבן אין JLS (אנדערש ווערט עס צוויי מאל גערעכנט).</p><div class="grid2">
   <label class="f">טאג${dateField('id_', x.date)}</label>
   <label class="f">סכום $<input id="ia" type="number" step="0.01" value="${esc(x.amt)}"></label>
   <label class="f" style="grid-column:1/-1">פון וועמען / נאטיץ<input id="in_" value="${esc(x.note || '')}"></label></div>
   <div class="row" style="justify-content:flex-end;margin-top:14px">${id ? `<button class="btn red" onclick="frDel('frin','${id}')">אויסמעקן</button><div class="spacer"></div>` : ''}<button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="frInSave('${id || ''}')">Save</button></div>`, 'narrow');
}
async function frInSave(id) {
  const amt = +$('#ia').value; if (!amt) { $('#ia').focus(); return; }
  await emit('frin', id || uid(), { date: $('#id_').value || todayS(), amt, note: $('#in_').value.trim(), del: false });
  closeM(); render(); toast('✓ אפגעהיטן');
}
function frExForm(id) {
  const x = id ? S.frex[id] : { date: todayS(), amt: '', note: '' };
  modal(`<h2>סכום אן פראצענט</h2><p class="sub">אויף דעם סכום באקומען די פאנדרעיזערס <b>נישט</b> קיין פראצענט. עס ווערט אראפגערעכנט פון דעם אריינגעקומענעם געלט אין די 2 וואכן פון דעם טאג.</p><div class="grid2">
   <label class="f">טאג${dateField('xd', x.date)}</label>
   <label class="f">סכום $<input id="xa" type="number" step="0.01" value="${esc(x.amt)}"></label>
   <label class="f" style="grid-column:1/-1">פאר וואס / נאטיץ<input id="xn" value="${esc(x.note || '')}"></label></div>
   <div class="row" style="justify-content:flex-end;margin-top:14px">${id ? `<button class="btn red" onclick="frDel('frex','${id}')">אויסמעקן</button><div class="spacer"></div>` : ''}<button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="frExSave('${id || ''}')">Save</button></div>`, 'narrow');
  setTimeout(() => $('#xa').focus(), 50);
}
async function frExSave(id) {
  const amt = +$('#xa').value; if (!amt) { $('#xa').focus(); return; }
  await emit('frex', id || uid(), { date: $('#xd').value || todayS(), amt, note: $('#xn').value.trim(), del: false });
  closeM(); render(); toast('✓ אפגעהיטן');
}
// ---------- Excel downloads (fundraisers, shul) ----------
// One row per donor: how many gifts, total, and the fundraisers' share
function donorRows(F, list) {
  const m = new Map();
  list.forEach(i => { const k = i.code || ('~' + (i.note || 'אריינקומען')); const o = m.get(k) || { code: i.code, note: i.note, n: 0, t: 0, dates: [] }; o.n++; o.t += i.amt; o.dates.push(i.d); m.set(k, o); });
  return [['#', 'נאמען', 'English', 'טעלעפאן', 'וויפיל נדבות', 'סך הכל', F.pct + '%', 'טעג']].concat([...m.values()].sort((a, b) => b.t - a.t).map(o => { const a = o.code ? IDX.by.get(o.code) : null; return [o.code || '', a ? (a.h || a.n) : (o.note || 'אריינקומען'), a ? a.n : '', a && a.ph[0] ? a.ph[0][1] : '', o.n, r2(o.t), r2(o.t * F.pct / 100), o.dates.sort().join(', ')]; }));
}
function incomeRows(F, list) {
  return [['טאג', 'טאג (אידיש)', '#', 'נאמען', 'English', 'סכום', F.pct + '%', 'פון']].concat(list.map(i => { const a = i.code ? IDX.by.get(i.code) : null; return [i.d, hebD(i.d), i.code || '', a ? (a.h || a.n) : (i.note || ''), a ? a.n : '', r2(i.amt), r2(i.amt * F.pct / 100), i.src === 'JLS' ? 'JLS' : 'מאנועל']; }));
}
function xlsFund() {
  const F = fundCalc();
  xlsx([
    { name: 'סך הכל', rows: [['', 'סכום'], ['אריינגעקומען זינט ' + F.start, r2(F.totIn)], ['אן פראצענט', r2(F.totEx)], ['דינער עקספענסעס', r2(F.totExp)], [F.pct + '% פאר די פאנדרעיזערס', r2(F.totOwed)], ['שוין באצאלט', r2(F.totPaid)], ['נאך שולדיג', r2(F.balance)], ['דערהיינטיגט פון JLS', new Date(JD.importedAt).toLocaleString()]], widths: [34, 20] },
    { name: 'יעדע 2 וואכן', rows: [['פון', 'ביז', 'פון (אידיש)', 'ביז (אידיש)', 'באצאלונגען', 'אריינגעקומען', 'אן פראצענט', F.pct + '%', 'באצאלט', 'באלאנס']].concat(F.periods.map(p => [p.from, p.to, hebD(p.from), hebD(p.to), p.count, r2(p.income), r2(p.ex), r2(p.owed), r2(p.paid), r2(p.bal)])) },
    { name: 'באצאלט פאנדרעיזערס', rows: [['טאג', 'טאג (אידיש)', 'סכום', 'צו וועמען', 'נאטיץ', 'ארייןגעלייגט דורך']].concat(F.paid.map(x => [x.date, hebD(x.date), r2(x.amt), x.to || '', x.note || '', x.by || ''])) },
    { name: 'אן פראצענט', rows: [['טאג', 'טאג (אידיש)', 'סכום', 'נאטיץ']].concat(F.exempt.map(x => [x.date, hebD(x.date), r2(x.amt), x.note || ''])) },
    { name: 'דינער עקספענסעס', rows: expRows(F.expenses) },
    { name: 'אלע אריינגעקומענע', rows: incomeRows(F, F.income.slice().sort((a, b) => a.d.localeCompare(b.d))) }
  ], 'fundraising-' + todayS() + '.xlsx');
}
function xlsPeriod(k) {
  const F = fundCalc(), p = F.periods[k]; if (!p) return;
  xlsx([{ name: p.from + ' - ' + p.to, rows: incomeRows(F, F.income.filter(i => i.d >= p.from && i.d <= p.to).sort((a, b) => a.d.localeCompare(b.d))) }], 'fundraising-' + p.from + '.xlsx');
}
function xlsShul(id) {
  const s = S.shul[id], L = Object.entries(S.acct).filter(([, st]) => st.shul === id).map(([c]) => +c).filter(c => IDX.by.has(c));
  xlsx([{ name: s.name, rows: [['#', 'נאמען', 'English', 'טעלעפאן', 'אדרעס', 'YG סך הכל', 'לעצטע מתנה']].concat(L.map(c => { const a = IDX.by.get(c), g = IDX.yg.get(c) || {}; return [c, a.h || a.n, a.n, (a.ph[0] || [])[1], a.a, r2(g.total), g.last || '']; })) }], 'shul-' + todayS() + '.xlsx');
}
async function frDel(k, id) { if (!confirm('אויסמעקן?')) return; await emit(k, id, { del: true }); closeM(); render(); }
function fundSettings() {
  const F = fundCalc();
  modal(`<div dir="ltr" style="text-align:left"><h2>⚙️ Fundraising settings</h2><div class="grid2">
   <label class="f">Percentage for the fundraisers<input id="fp" type="number" min="0" max="100" step="0.5" value="${F.pct}"></label>
   <label class="f">Starting from (first day of the first 2 weeks)${dateField('fs', F.start)}</label></div>
   <p class="sub" style="margin-top:8px">Rosh Hashana 5787 = ${fmtD(RH5787)}. Every 2 weeks from that day is a new period.</p>
   <h3>✉️ E-mail to the office (checks for the fundraisers)</h3>
   <div class="grid2"><label class="f" style="grid-column:1/-1">Office e-mail(s) – several separated by commas<input id="fo" style="direction:ltr" value="${esc(SET().frOffice || '')}" placeholder="office@example.com"></label>
   <label class="f" style="grid-column:1/-1">CC – more e-mails (optional), separated by commas<input id="fcc" style="direction:ltr" value="${esc(SET().frCc || '')}"></label>
   <label style="display:flex;gap:8px;align-items:center;font-size:14px;grid-column:1/-1"><input type="checkbox" id="fau" ${SET().frAuto ? 'checked' : ''}> <span><b>⏰ Send automatically</b> every 2 weeks (Supabase sends it by itself – see the setup steps)</span></label>
   <label class="f">Send ... days after the 2 weeks end<input id="fad" type="number" min="0" max="10" value="${SET().frAutoDays != null ? SET().frAutoDays : 2}"></label>
   <label class="f">Who gets the reminder every 2 weeks<select id="fw">${USERS().map(u => `<option ${u === frMailWho() ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
   <label class="f" style="grid-column:1/-1">Subject<input id="fsj" dir="auto" value="${esc(SET().frMailSubject || FR_SUBJ_DEF)}"></label>
   <label class="f" style="grid-column:1/-1">Text ({from} {to} {count} {income} {exempt} {expenses} {pct} {amount} {paid} {balance})<textarea id="fbd" dir="auto" rows="8">${esc(SET().frMailBody || FR_BODY_DEF)}</textarea></label></div>
   <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="fundSaveSet()">Save</button></div></div>`, 'narrow');
}
async function fundSaveSet() {
  const pct = +$('#fp').value; if (!(pct >= 0 && pct <= 100)) { $('#fp').focus(); return; }
  await emit('settings', 's', { frPct: pct, frStart: $('#fs').value || RH5787, frOffice: $('#fo').value.trim(), frCc: $('#fcc').value.trim(), frAuto: $('#fau').checked, frAutoDays: Math.max(0, Math.min(10, +$('#fad').value || 0)), frMailWho: $('#fw').value, frMailSubject: $('#fsj').value.trim(), frMailBody: $('#fbd').value.trim() });
  closeM(); render(); toast('✓ Saved');
}

// ---------- SHULS ----------
const shulList = () => Object.entries(S.shul).filter(([, x]) => !x.del).map(([id, x]) => Object.assign({ id }, x)).sort((a, b) => (a.ord || 0) - (b.ord || 0) || (a.name || '').localeCompare(b.name || ''));
const shulName = id => (S.shul[id] && !S.shul[id].del) ? S.shul[id].name : '';
function nextWed(s) { const d = parse(s); return addDays(s, (3 - d.getDay() + 7) % 7); }
const shulStart = () => SET().shulStart || nextWed(todayS());
// Every second Wednesday from shulStart, the next active shul in order.
function shulSchedule(n) {
  const act = shulList().filter(x => !x.paused); if (!act.length) return [];
  const st = shulStart(), t = todayS();
  let k = t > st ? Math.ceil(daysBetween(st, t) / 14) : 0;
  const out = [];
  for (let i = 0; i < n; i++, k++) out.push({ k, date: addDays(st, 14 * k), s: act[k % act.length] });
  return out;
}
function vShuls() {
  const L = shulList(), sch = shulSchedule(Math.max(8, L.length)), stats = {};
  Object.entries(S.acct).forEach(([c, st]) => { if (st.shul) { const o = stats[st.shul] || (stats[st.shul] = { n: 0, t: 0 }); o.n++; o.t += (IDX.yg.get(+c) || {}).total || 0; } });
  const nextOf = id => (sch.find(v => v.s.id === id) || {}).date;
  $('#main').innerHTML = `<div class="row"><div><h2>שולן</h2><p class="sub">יעדע צווייטע מיטוואך קומט ארויף די קומענדיגע שול אויף דער ליסטע (לויט דער ריי). ביי יעדן נדבן קען מען אויסקלייבן אין וועלכע שול מ'האט אים געטראפן.</p></div><div class="spacer"></div>
   <button class="btn ghost" onclick="shulStartForm()">📅 אנגעהויבן: ${fmtD(shulStart())}</button><button class="btn gold" onclick="shulForm()">+ נייע שול</button></div>
  ${sch.length ? `<div class="banner">🕍 <div><b>${sch[0].date === todayS() ? 'היינט' : 'קומענדיגע מיטוואך, ' + fmtDual(sch[0].date)}</b>: <b class="big">${esc(sch[0].s.name)}</b><br><span class="ltr">${esc(sch[0].s.addr || '')}</span> ${sch[0].s.addr ? `<a class="name" style="font-size:13px" target="_blank" href="https://maps.google.com/?q=${encodeURIComponent(sch[0].s.addr)}">🗺️ מאפע</a>` : ''}</div></div>` : ''}
  <div class="cols"><div><h3>אלע שולן (די ריי)</h3>
   <table><thead><tr><th>#</th><th>שול</th><th>נדבנים</th><th>קומענדיג</th><th></th></tr></thead><tbody>
   ${L.map((s, i) => `<tr style="${s.paused ? 'opacity:.5' : ''}"><td class="num">${i + 1}</td><td><a class="name" onclick="shulDonors('${s.id}')">${esc(s.name)}</a>${s.paused ? ' <span class="tag gray">אפגעשטעלט</span>' : ''}<br><span class="ltr" style="font-size:12px;color:var(--muted)">${esc(s.addr || '')}</span>${s.notes ? `<div class="sub" style="margin:2px 0 0">${esc(s.notes)}</div>` : ''}</td>
    <td class="num">${(stats[s.id] || {}).n || 0}<br><small class="dim">${money((stats[s.id] || {}).t || 0)}</small></td><td style="font-size:13px">${s.paused ? '' : fmtD(nextOf(s.id))}</td>
    <td><div class="acts"><button class="btn ghost sm" title="ארויף" onclick="shulMove('${s.id}',-1)">▲</button><button class="btn ghost sm" title="אראפ" onclick="shulMove('${s.id}',1)">▼</button><button class="btn ghost sm" onclick="shulForm('${s.id}')">ענדער</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="empty">נאך קיין שולן – דריקט "+ נייע שול"</td></tr>'}
   </tbody></table></div>
  <div><h3>מיטוואכן</h3><table><tbody>${sch.map(v => `<tr><td style="white-space:nowrap">${fmtDual(v.date)}</td><td><b>${esc(v.s.name)}</b></td></tr>`).join('') || '<tr><td class="empty">—</td></tr>'}</tbody></table></div></div>`;
}
function shulForm(id) {
  const x = id ? S.shul[id] : { name: '', addr: '', notes: '', paused: false };
  modal(`<h2>${id ? 'ענדער שול' : 'נייע שול'}</h2><div class="grid2">
   <label class="f" style="grid-column:1/-1">נאמען פון דער שול<input id="sn" value="${esc(x.name)}"></label>
   <label class="f" style="grid-column:1/-1">אדרעס<input id="sa" value="${esc(x.addr || '')}" style="direction:ltr"></label>
   <label class="f" style="grid-column:1/-1">נאטיץ (גבאי, צייטן א.א.וו.)<input id="snt" value="${esc(x.notes || '')}"></label>
   <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="sp" ${x.paused ? 'checked' : ''}> אפגעשטעלט (נישט אריין אין דער ריי)</label></div>
   <div class="row" style="justify-content:flex-end;margin-top:14px">${id ? `<button class="btn red" onclick="shulDel('${id}')">אויסמעקן</button><div class="spacer"></div>` : ''}<button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="shulSave('${id || ''}')">Save</button></div>`, 'narrow');
  setTimeout(() => $('#sn').focus(), 50);
}
async function shulSave(id) {
  const name = $('#sn').value.trim(); if (!name) { $('#sn').focus(); return; }
  const p = { name, addr: $('#sa').value.trim(), notes: $('#snt').value.trim(), paused: $('#sp').checked, del: false };
  if (!id) { p.ord = Math.max(0, ...shulList().map(s => s.ord || 0)) + 1; if (!SET().shulStart) await emit('settings', 's', { shulStart: shulStart() }); }
  await emit('shul', id || uid(), p);
  closeM(); render(); toast('✓ אפגעהיטן');
}
async function shulDel(id) { if (!confirm('אויסמעקן די שול?')) return; await emit('shul', id, { del: true }); closeM(); render(); }
async function shulMove(id, dir) {
  const L = shulList(), i = L.findIndex(s => s.id === id), j = i + dir;
  if (j < 0 || j >= L.length) return;
  [L[i], L[j]] = [L[j], L[i]];
  for (let n = 0; n < L.length; n++) if ((L[n].ord || 0) !== n + 1) await emit('shul', L[n].id, { ord: n + 1 });
  render();
}
function shulStartForm() {
  modal(`<h2>📅 ווען הייבט זיך אן די ריי?</h2><p class="sub">קלייבט א מיטוואך. פון דעמאלט, יעדע 2 וואכן, קומט ארויף די קומענדיגע שול.</p>
   <label class="f">ערשטע מיטוואך${dateField('ss', shulStart())}</label>
   <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="shulStartSave()">Save</button></div>`, 'narrow');
}
async function shulStartSave() {
  const v = $('#ss').value; if (!v) return;
  if (parse(v).getDay() !== 3) { toast('⚠️ דאס איז נישט קיין מיטוואך'); return; }
  await emit('settings', 's', { shulStart: v }); closeM(); render(); toast('✓ אפגעהיטן');
}
function shulDonors(id) {
  const s = S.shul[id], L = Object.entries(S.acct).filter(([, st]) => st.shul === id).map(([c]) => +c).filter(c => IDX.by.has(c))
    .sort((a, b) => ((IDX.yg.get(b) || {}).total || 0) - ((IDX.yg.get(a) || {}).total || 0));
  modal(`<div class="row"><div><h2 style="margin:0">🕍 ${esc(s.name)}</h2><span class="ltr sub">${esc(s.addr || '')}</span></div><div class="spacer"></div><button class="btn ghost sm" onclick="closeM()">✕</button></div>
   <div class="row"><p class="sub" style="margin:0">${L.length} נדבנים געטראפן אין דער שול</p><div class="spacer"></div><button class="btn ghost sm" onclick="xlsShul('${id}')">⬇ Excel</button></div>
   <div class="scroll" style="max-height:60vh"><table><thead><tr><th>נאמען</th><th>טעלעפאן</th><th>סך הכל</th><th>לעצטע</th></tr></thead><tbody>
   ${L.map(c => { const a = IDX.by.get(c), g = IDX.yg.get(c) || {}; return `<tr><td><a class="name" onclick="closeM();openAcct(${c})">${esc(a.h || a.n)}</a><div class="heb">${esc(a.h ? a.n : '')}</div></td><td class="num" style="font-size:13px">${a.ph[0] ? callBtn(a.ph[0][1], c) + ' ' + esc(a.ph[0][1]) : ''}</td><td class="num">${money(g.total)}</td><td class="num">${fmtD(g.last)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">נאך קיינער. עפנט א נדבן און קלייבט אויס די שול.</td></tr>'}
   </tbody></table></div>`);
}
function shulSel(id, cur) {
  return `<select id="${id}"><option value="">—</option>${shulList().map(s => `<option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
}

// ---------- 📞 click to call (per computer) ----------
// The way to dial is saved on this computer only (localStorage, never in the site's code):
//  'tel:{num}'                      opens the office phone program (softphone / Phone Link ...)
//  'http://IP/servlet?key=number=…' Yealink desk phone
//  '<url>POSTJLSPOST<body>'         the "CALL URL" line from JLS (e.g. TekLink click-to-call): HTTP POST of <body>
//  any other http(s) URL            opened as a GET
// Placeholders: {num} = +18455551234, {digits} / %PhoneNum% = 8455551234
const callTpl = () => { try { return localStorage.getItem('yg_call') || 'tel:{num}'; } catch (e) { return 'tel:{num}'; } };
const callNum = n => { const d = String(n || '').replace(/\D/g, ''); return d.length === 10 ? '1' + d : d; };
const callFill = (t, d) => t.split('{num1}').join(d.length === 10 ? '1' + d : d.slice(-11)).split('{num}').join('+' + d).split('{digits}').join(d.slice(-10)).split('%PhoneNum%').join(d.slice(-10));
const callIsPost = t => t.includes('POSTJLSPOST');
function callBtn(num, code) {
  const d = callNum(num); if (d.length < 7) return '';
  const t = callTpl(), href = callIsPost(t) ? 'tel:+' + d : callFill(t, d);
  return `<a class="callb" title="קאל ${esc(num)}" href="${esc(href)}" data-n="${d}" onclick="return dial(this,${+code || 0})">📞</a>`;
}
function dial(el, code, tplOverride, keepOpen) {
  const t = tplOverride || callTpl(), d = el.dataset.n || '';
  if (callIsPost(t)) {   // JLS-style CALL URL: POST the form fields in a small window that closes itself
    const [url, body] = t.split('POSTJLSPOST');
    const w = window.open('', 'ygdial', 'width=380,height=200');
    const f = document.createElement('form'); f.method = 'POST'; f.action = url.trim(); f.target = 'ygdial'; f.style.display = 'none';
    new URLSearchParams(callFill(body, d)).forEach((v, k) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i); });
    document.body.appendChild(f); f.submit(); f.remove();
    if (w && !keepOpen) setTimeout(() => { try { w.close(); } catch (e) { } }, 6000);
    toast('📞 קאלט... אייער טעלעפאן וועט קלינגען, הייבט אויף');
    return false;
  }
  const url = tplOverride ? callFill(t, d) : el.getAttribute('href');
  if (/^https?:/i.test(url)) {   // desk phone: send the dial request in a small window that closes itself
    const w = window.open(url, 'ygdial', 'width=380,height=200');
    if (w && !keepOpen) setTimeout(() => { try { w.close(); } catch (e) { } }, 5000);
    toast('📞 קאלט...');
    return false;
  }
  toast('📞 קאלט...');
  return true;
}
function callSetup() {
  const t = callTpl(), yl = t.match(/^(https?:\/\/[^/]+)\/servlet\?key=number=\{digits\}$/);
  const ls = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const mode = callIsPost(t) || (ls('yg_call_src') && /%PhoneNum%|\{num1\}/.test(t)) ? 'jls' : t === 'tel:{num}' ? 'tel' : yl ? 'yealink' : 'custom';
  modal(`<div dir="ltr" style="text-align:left"><h2>📞 Calling from this computer</h2>
   <p class="sub">When you click 📞 next to a donor, it calls him through your office phone. This setting is for <b>this</b> computer only and is not uploaded.</p>
   <label class="f">Which phone<select id="cs" onchange="callMode(this.value)">
    <option value="jls" ${mode === 'jls' ? 'selected' : ''}>CALL URL from JLS (TekLink etc.)</option>
    <option value="yealink" ${mode === 'yealink' ? 'selected' : ''}>Yealink desk phone (IP)</option>
    <option value="tel" ${mode === 'tel' ? 'selected' : ''}>Phone program on this computer (tel:)</option>
    <option value="custom" ${mode === 'custom' ? 'selected' : ''}>Other (link)</option></select></label>
   <div id="c_jl" style="margin-top:10px"><label class="f">CALL URL – paste the whole line exactly as in JLS<textarea id="cjl" rows="3" style="direction:ltr;font-size:12px">${esc(mode === 'jls' ? (ls('yg_call_src') || t) : '')}</textarea></label>
    <div class="grid2" style="margin-top:8px"><label class="f">Send as<select id="cjm">${[['post', 'POST (like JLS)'], ['get', 'GET (in the link)'], ['post1', 'POST, with a leading 1'], ['get1', 'GET, with a leading 1']].map(([k, l]) => `<option value="${k}" ${(ls('yg_call_m') || 'post') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f">🧪 Test – your own number<input id="cjt" type="tel" style="direction:ltr" placeholder="845-555-1234"></label></div>
    <div class="row" style="margin-top:8px"><button class="btn ghost sm" onclick="callTest()">🧪 Test (the small window stays open)</button><span class="sub" style="margin:0">Tell Claude what the small window shows</span></div></div>
   <div id="c_yl" style="margin-top:10px"><label class="f">IP of the Yealink phone (e.g. 192.168.1.50, or https://192.168.1.50)<input id="cip" style="direction:ltr" value="${esc(yl ? yl[1] : '')}" placeholder="192.168.1.50"></label>
    <p class="sub" style="margin-top:6px">💡 To find it: press <b>OK</b> on the phone (or Menu > Status) and look at IPv4.</p></div>
   <div id="c_cu" style="margin-top:10px"><label class="f">Link ({num} = +18455551234, {digits} = 8455551234)<input id="cu" style="direction:ltr" value="${esc(mode === 'custom' ? t : '')}"></label></div>
   <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="callSave()">Save</button></div></div>`, 'narrow');
  callMode(mode);
}
// Build the template from the pasted JLS line and the chosen way of sending
function callJlsTpl() {
  const src = $('#cjl').value.replace(/\s+/g, '').replace(/^CALL ?URL:?/i, ''), m = $('#cjm').value;
  if (!/^https?:\/\//.test(src)) { toast('⚠️ Paste the CALL URL line from JLS'); return null; }
  if (!/%PhoneNum%|\{digits\}|\{num\}/.test(src)) { toast('⚠️ The line has no %PhoneNum%'); return null; }
  let [url, body] = src.includes('POSTJLSPOST') ? src.split('POSTJLSPOST') : src.split('?');
  body = body || '';
  if (m.endsWith('1')) body = body.split('%PhoneNum%').join('{num1}');
  const tpl = m.startsWith('get') ? url + (body ? '?' + body : '') : url + 'POSTJLSPOST' + body;
  return { tpl, src, m };
}
function callTest() {
  const r = callJlsTpl(); if (!r) return;
  const d = callNum($('#cjt').value); if (d.length < 10) { toast('⚠️ Enter your number'); return; }
  const el = document.createElement('a'); el.dataset.n = d;
  dial(el, 0, r.tpl, true);
}
function callMode(m) { $('#c_jl').style.display = m === 'jls' ? '' : 'none'; $('#c_yl').style.display = m === 'yealink' ? '' : 'none'; $('#c_cu').style.display = m === 'custom' ? '' : 'none'; }
function callSave() {
  const m = $('#cs').value; let v = 'tel:{num}';
  if (m === 'jls') {
    const r = callJlsTpl(); if (!r) return;
    v = r.tpl;
    try { localStorage.setItem('yg_call_src', r.src); localStorage.setItem('yg_call_m', r.m); } catch (e) { }
  } else if (m === 'yealink') {
    const raw = $('#cip').value.trim(), https = /^https:/i.test(raw), ip = raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    if (!/^[\w.-]+(:\d+)?$/.test(ip)) { toast('⚠️ Enter the IP of the phone'); return; }
    v = (https ? 'https://' : 'http://') + ip + '/servlet?key=number={digits}';
  } else if (m === 'custom') {
    v = $('#cu').value.trim();
    if (!/%PhoneNum%|\{digits\}|\{num\}/.test(v)) { toast('⚠️ The link must contain {num} or {digits}'); return; }
  }
  try { localStorage.setItem('yg_call', v); } catch (e) { }
  closeM(); render(); toast('✓ Saved – try a 📞');
}

// ---------- ✉️ e-mail to the office: checks for the fundraisers' percentage, per 2-week period ----------
const FR_SUBJ_DEF = 'טשעקס פאר די פאנדרעיזערס – {from} ביז {to}: {amount}';
const FR_BODY_DEF = 'שלום,\n\nביטע מאכט טשעקס פאר די פאנדרעיזערס פאר די 2 וואכן {from} ביז {to}:\n\nאריינגעקומען: {income} ({count} באצאלונגען)\nאן פראצענט: {exempt}\nדינער עקספענסעס: {expenses}\n{pct}% פאר די פאנדרעיזערס: {amount}\n\nשוין באצאלט פאר די 2 וואכן: {paid}\nסך הכל נאך שולדיג ביז היינט: {balance}\n\nבייגעלייגט איז אן Excel מיט די נדבנים און זייערע נדבות פון די 2 וואכן.\n\nא דאנק,\nYG Fund';
const frMailWho = () => SET().frMailWho || ((TEAM.find(t => t.is_admin) || TEAM[0] || {}).name) || me;
const frDay = s => { const [y, m, d] = s.split('-'); return HEB.fmtHeb(s) + ' (' + +m + '/' + +d + '/' + y + ')'; };
function frFill(t, F, p) {
  const v = { from: frDay(p.from), to: frDay(p.to), count: p.count, income: money(p.income), exempt: money(p.ex), expenses: money(p.exp || 0), pct: F.pct, amount: money(p.owed), paid: money(p.paid), balance: money(F.balance) };
  return t.replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m);
}
function frMailForm(k) {
  const F = fundCalc();
  if (k == null) k = Math.max(0, F.periods.length - 2);   // the last finished 2 weeks
  const p = F.periods[k]; if (!p) { toast('נאך נישט קיין 2 וואכן'); return; }
  const s = SET(), sent = S.frmail[p.from];
  modal(`<h2>✉️ אימעיל צום אפיס – טשעקס פאר די פאנדרעיזערס</h2>
   <p class="sub">${fmtD(p.from)} – ${fmtD(p.to)} · אריינגעקומען ${money(p.income)} · ${F.pct}% = <b>${money(p.owed)}</b>${sent && sent.sent ? ` · <span class="tag ok">✉️ שוין געשיקט ${fmtD(sent.sent)}</span>` : ''}</p>
   <div class="grid2"><label class="f" style="grid-column:1/-1">צו (אפיס) – עטליכע מיט קאמעס<input id="fmt" style="direction:ltr" value="${esc(s.frOffice || '')}" placeholder="office@example.com"></label>
   <label class="f" style="grid-column:1/-1">CC – נאך אימעילס (אפציאנאל), עטליכע מיט קאמעס<input id="fmc" style="direction:ltr" value="${esc(s.frCc || '')}" placeholder="name@example.com, other@example.com"></label>
   <label class="f" style="grid-column:1/-1">סאבדזשעקט<input id="fms" value="${esc(frFill(s.frMailSubject || FR_SUBJ_DEF, F, p))}"></label>
   <label class="f" style="grid-column:1/-1">דער בריוו<textarea id="fmb" rows="12">${esc(frFill(s.frMailBody || FR_BODY_DEF, F, p))}</textarea></label></div>
   <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:8px"><input type="checkbox" id="fmx" checked> לייג צו אן Excel: די נדבנים מיט זייערע נדבות פון די 2 וואכן, און אלע באצאלונגען</label>
   <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" onclick="closeM()">Back</button><button class="btn" id="fmgo" onclick="frMailGo(${k})">✉️ שיק</button></div>`, 'narrow');
}
async function frMailGo(k) {
  const F = fundCalc(), p = F.periods[k], to = $('#fmt').value.trim(), cc = $('#fmc').value.trim();
  const okList = v => v.split(/[,;\s]+/).filter(Boolean).every(x => /^\S+@\S+\.\S+$/.test(x));
  if (!to || !okList(to)) { toast('⚠️ שרייבט דעם אימעיל פון אפיס'); return; }
  if (cc && !okList(cc)) { toast('⚠️ א CC אימעיל איז נישט ריכטיג'); return; }
  $('#fmgo').disabled = true;
  try {
    busy('שיקט...');
    let blob = null;
    if ($('#fmx').checked) {
      const L = F.income.filter(i => i.d >= p.from && i.d <= p.to).sort((a, b) => a.d.localeCompare(b.d));
      blob = XLSX.make([
        { name: 'סך הכל', rows: [['', 'סכום'], ['פון', p.from], ['ביז', p.to], ['באצאלונגען', p.count], ['אריינגעקומען', r2(p.income)], ['אן פראצענט', r2(p.ex)], ['דינער עקספענסעס (אראפגערעכנט)', r2(p.exp || 0)], [F.pct + '% פאר די פאנדרעיזערס', r2(p.owed)], ['שוין באצאלט פאר די 2 וואכן', r2(p.paid)], ['נאך שולדיג ביז היינט', r2(F.balance)]], widths: [32, 18] },
        { name: 'נדבנים', rows: donorRows(F, L) },
        { name: 'באצאלונגען', rows: incomeRows(F, L) }]);
    }
    await mailSend(to, $('#fms').value.trim(), mailHtml($('#fmb').value), blob, 'Fundraisers-' + p.from + '-' + p.to + '.xlsx', 'fund-' + p.from, cc);
    await emit('frmail', p.from, { sent: todayS(), to, cc, amount: r2(p.owed), by: me });
    if (to !== (SET().frOffice || '') || cc !== (SET().frCc || '')) await emit('settings', 's', { frOffice: to, frCc: cc });
    for (const [id, x] of Object.entries(S.task)) if (x.fm && x.fm.from === p.from && !x.done) await emitTask(id, { done: true, doneAt: todayS() });
    busy(false); closeM(); render(); toast('✓ געשיקט צום אפיס');
  } catch (e) { busy(false); $('#fmgo').disabled = false; rcMailErr(e); toast('⚠️ ' + (e.message || e)); }
}
// Every 2 weeks a to-do to send the office the e-mail for the 2 weeks that just ended (fixed id per period)
async function ensureFundMailTask() {
  if (!JD) return;
  const F = fundCalc(), n = F.periods.length; if (n < 2) return;
  const prev = F.periods[n - 2], id = 'frmail-' + prev.from;
  if (S.task[id] || (S.frmail[prev.from] || {}).sent || SET().frAuto) return;   // with automatic sending no reminder is needed
  await emitTask(id, { title: '✉️ שיק אימעיל צום אפיס – טשעקס פאר די פאנדרעיזערס (' + fmtD(prev.from) + ' ביז ' + fmtD(prev.to) + ')', due: F.cur.from, who: frMailWho(), who2: '', code: '', pri: 'norm', note: '', repeat: '', done: false, priv: false, fm: { from: prev.from, to: prev.to } });
}
function frMailTask(id) { const x = S.task[id]; if (!x || !x.fm) return; const k = fundCalc().periods.findIndex(p => p.from === x.fm.from); go('fund'); frMailForm(k < 0 ? null : k); }

// ---------- 🍽️ dinner expenses (event kind frexp): date, vendor, desc, amt, file {path, name, type, size} ----------
// The invoice is kept in Storage (bucket jls, invoices/...), uploaded as a plain binary file with retries.
const expRows = L => [['יאר', 'טאג', 'טאג (אידיש)', 'פון וועמען', 'וואס', 'סכום', 'אינוואיס', 'ארייןגעלייגט דורך']].concat(L.map(x => [HEB.gem(x.hy || expYearOf(x.date)), x.date, hebD(x.date), x.vendor || '', x.desc || '', r2(x.amt), x.file ? x.file.name : '', x.by || '']));
const expYearOf = d => (HEB.parts(d) || {}).y || 0;
function expYearSel(F) { const ys = [...new Set([expYearOf(todayS())].concat(F.expenses.map(x => x.hy)))].sort((a, b) => b - a); const y = ys.includes(+ui.expY) ? +ui.expY : ys[0]; return { ys, y }; }
function expFiltered(F) {
  const q = (ui.expQ || '').trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean), { y } = expYearSel(F);
  return F.expenses.filter(x => x.hy === y).filter(x => !words.length || words.every(w => ((x.vendor || '') + ' ' + (x.desc || '') + ' ' + x.date + ' ' + fmtD(x.date) + ' ' + x.amt + ' ' + (x.file ? x.file.name : '')).toLowerCase().includes(w)));
}
function expSection(F) {
  const L = expFiltered(F), tot = L.reduce((s, x) => s + x.amt, 0), { ys, y } = expYearSel(F), yAll = F.expenses.filter(x => x.hy === y), all = yAll.reduce((s, x) => s + x.amt, 0);
  const Y = F.expYears[y] || { total: all, covered: 0, left: all };
  return `<div class="box" id="expbox" style="margin-top:18px"><div class="row" style="margin:0 0 10px"><h3 style="margin:0">🍽️ דינער עקספענסעס</h3>
    <div class="chips">${ys.map(v => `<button class="chip ${v === y ? 'on' : ''}" onclick="ui.expY=${v};vFund()">${HEB.gem(v)}</button>`).join('')}</div><div class="spacer"></div>
    <button class="btn ghost sm" onclick="xlsx([{name:'דינער עקספענסעס',rows:expRows(expFiltered(fundCalc()))}],'dinner-expenses-'+todayS()+'.xlsx')">⬇ Excel</button><button class="btn gold sm" onclick="expForm()">+ נייע עקספענס</button></div>
   <p class="sub">דאס געלט וואס קומט אריין אין ${HEB.gem(y)} דעקט ערשט די עקספענסעס פון ${HEB.gem(y)}; ערשט דערנאך באקומען די פאנדרעיזערס ${F.pct}%.</p>
   <div class="stats" style="margin-bottom:10px"><div class="stat"><b>${money(Y.total)}</b><span>עקספענסעס ${HEB.gem(y)}</span></div><div class="stat"><b class="zero">${money(Y.covered)}</b><span>שוין געדעקט פון אריינגעקומענעם געלט</span></div><div class="stat"><b class="${Y.left > 0.009 ? 'bal' : 'zero'}">${money(Y.left)}</b><span>נאך צו דעקן (קיין % ביז דאן)</span></div></div>
   <div class="row"><input id="expq" placeholder="🔍 זוך: פון וועמען, וואס, סכום, טאג..." value="${esc(ui.expQ || '')}" style="flex:1;min-width:240px;font-size:15px">
    <b>${L.length} · ${money(tot)}</b>${L.length !== yAll.length ? `<span class="sub" style="margin:0">(פון ${yAll.length} · ${money(all)})</span>` : ''}</div>
   <table><thead><tr><th>טאג</th><th>פון וועמען</th><th>וואס</th><th>סכום</th><th>אינוואיס</th><th></th></tr></thead><tbody>
   ${L.map(x => `<tr><td class="num" style="font-size:13px">${fmtD(x.date)}</td><td><b>${esc(x.vendor || '')}</b></td><td style="font-size:13px">${esc(x.desc || '')}<br><small class="dim">${esc(x.by || '')}</small></td><td class="num"><b>${money(x.amt)}</b></td>
    <td>${x.file ? `<button class="btn ghost sm" title="${esc(x.file.name)}" onclick="expOpen('${x.id}')">📎 ${esc(x.file.name.length > 22 ? x.file.name.slice(0, 20) + '…' : x.file.name)}</button>` : '<span class="dim">—</span>'}</td>
    <td><button class="btn ghost sm" onclick="expForm('${x.id}')">ענדער</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">נאך קיין עקספענסעס</td></tr>'}
   </tbody>${L.length ? `<tfoot><tr><td colspan="3" style="text-align:left"><b>סך הכל</b></td><td class="num"><b>${money(tot)}</b></td><td colspan="2"></td></tr></tfoot>` : ''}</table></div>`;
}
function expForm(id) {
  const x = id ? S.frexp[id] : { date: todayS(), vendor: '', desc: '', amt: '', hy: +ui.expY || 0 };
  const vendors = [...new Set(Object.values(S.frexp).filter(v => !v.del).map(v => v.vendor).filter(Boolean))];
  modal(`<h2>🍽️ ${id ? 'ענדער דינער עקספענס' : 'נייע דינער עקספענס'}</h2><div class="grid2">
   <label class="f">טאג${dateField('xd', x.date)}</label>
   <label class="f">סכום $<input id="xa" type="number" step="0.01" value="${esc(x.amt)}"></label>
   <label class="f">פאר וועלכן יאר (דינער)<select id="xy">${[0, -1, 1].map(o => expYearOf(todayS()) + o).sort((a, b) => b - a).map(v => `<option value="${v}" ${v === (+x.hy || expYearOf(x.date || todayS())) ? 'selected' : ''}>${HEB.gem(v)}</option>`).join('')}</select></label>
   <label class="f">פון וועמען (פירמע)<input id="xv" list="xvl" value="${esc(x.vendor || '')}"><datalist id="xvl">${vendors.map(v => `<option value="${esc(v)}">`).join('')}</datalist></label>
   <label class="f">וואס (באשרייבונג)<input id="xs" value="${esc(x.desc || '')}" placeholder="קעיטערינג, האל, בלומען..."></label>
   <label class="f" style="grid-column:1/-1">📎 אינוואיס (PDF אדער בילד)<input id="xf" type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"></label>
   ${x.file ? `<div style="grid-column:1/-1" class="sub">איצטיגע: <a class="name" onclick="expOpen('${id}')">📎 ${esc(x.file.name)}</a> · <label><input type="checkbox" id="xfr"> אראפנעמען</label></div>` : ''}</div>
   <div class="row" style="justify-content:flex-end;margin-top:14px">${id ? `<button class="btn red" onclick="expDel('${id}')">אויסמעקן</button><div class="spacer"></div>` : ''}<button class="btn ghost" onclick="closeM()">Back</button><button class="btn" id="xgo" onclick="expSave('${id || ''}')">Save</button></div>`, 'narrow');
  setTimeout(() => $('#xa').focus(), 50);
}
async function expSave(id) {
  const amt = +$('#xa').value; if (!amt) { $('#xa').focus(); toast('⚠️ שרייבט דעם סכום'); return; }
  const vendor = $('#xv').value.trim(); if (!vendor) { $('#xv').focus(); toast('⚠️ שרייבט פון וועמען'); return; }
  const nid = id || uid(), p = { date: $('#xd').value || todayS(), hy: +$('#xy').value, vendor, desc: $('#xs').value.trim(), amt, by: me, del: false };
  const f = $('#xf').files[0];
  $('#xgo').disabled = true;
  try {
    if (f) {
      if (f.size > 20 * 1024 * 1024) throw new Error('דער פייל איז צו גרויס (מער ווי 20MB)');
      busy('לייגט ארויף די אינוואיס...');
      const path = 'invoices/' + nid + '-' + Date.now() + '.bin';
      let up;
      for (let k = 1; k <= 3; k++) {
        up = await sb.storage.from('jls').upload(path, f, { contentType: 'application/octet-stream', upsert: true });
        if (!up.error) break;
        if (k < 3) await new Promise(r => setTimeout(r, 1500 * k));
      }
      busy(false);
      if (up.error) throw new Error('ארויפלייגן די אינוואיס (3 מאל פרובירט): ' + up.error.message);
      p.file = { path, name: f.name, type: f.type || 'application/octet-stream', size: f.size };
    } else if ($('#xfr') && $('#xfr').checked) p.file = null;
    await emit('frexp', nid, p);
    closeM(); render(); toast('✓ אפגעהיטן');
  } catch (e) { busy(false); $('#xgo').disabled = false; toast('⚠️ ' + (e.message || e)); }
}
async function expDel(id) { if (!confirm('אויסמעקן די עקספענס?')) return; await emit('frexp', id, { del: true }); closeM(); render(); }
// Open the saved invoice (the window is opened first, so the browser does not block it)
async function expOpen(id) {
  const x = S.frexp[id]; if (!x || !x.file) return;
  const w = window.open('', '_blank');
  try {
    const { data, error } = await sb.storage.from('jls').download(x.file.path);
    if (error) throw error;
    const url = URL.createObjectURL(new Blob([data], { type: x.file.type || 'application/octet-stream' }));
    if (w) w.location = url; else { const a = document.createElement('a'); a.href = url; a.download = x.file.name; document.body.appendChild(a); a.click(); a.remove(); }
  } catch (e) { if (w) w.close(); toast('⚠️ ' + (e.message || e)); }
}
