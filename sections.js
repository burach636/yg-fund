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
  const rcNew = JD.payments.filter(p => validD(p[2]) && p[2] >= F.start && p[2] <= t && !p[9] && p[3] > 0 && IDX.by.has(p[1]) && !rcPrinted(p)).length;
  const askToday = todayItems('all').filter(x => x.kind === 'ask').length;
  $('#main').innerHTML = `
  <div class="row"><div><h2>שלום ${esc(me)}!</h2><p class="sub">${fmtDual(t)}</p></div></div>
  ${next ? `<div class="banner" onclick="go('shuls')">🕍 <div><b>${next.date === t ? 'היינט' : 'מיטוואך ' + fmtDual(next.date)}</b> גייט מען נאך געלט אין: <b class="big">${esc(next.s.name)}</b><br><span class="ltr">${esc(next.s.addr || '')}</span></div></div>` : ''}
  <div class="tiles">
    <div class="tile t1" onclick="go('accounts')"><i>👥</i><h3>נדבות</h3><b>${IDX.yg.size.toLocaleString()}</b><span>נדבנים · ${money(sinceRH)} זינט ראש השנה</span><span>${askToday} צו בעטן היינט</span></div>
    <div class="tile t2" onclick="go('todo')"><i>✅</i><h3>To-Do ליסטע</h3><b>${mineOpen.length}</b><span>מיינע אפענע זאכן</span>${late ? `<span class="bal">${late} שפעט!</span>` : '<span>&nbsp;</span>'}</div>
    <div class="tile t3" onclick="go('fund')"><i>💵</i><h3>פאנדרעיזינג חשבונות</h3><b class="${F.balance > 0.009 ? 'bal' : 'zero'}">${money(F.balance)}</b><span>${F.balance >= 0 ? 'מ\'איז שולדיג די פאנדרעיזערס' : 'איבערבאצאלט'}</span><span>די 2 וואכן: ${money(F.cur ? F.cur.owed : 0)}</span></div>
    <div class="tile t4" onclick="go('shuls')"><i>🕍</i><h3>שולן</h3><b>${shuls.length}</b><span>שולן אויף דער ליסטע</span><span>${next ? 'קומענדיג: ' + esc(next.s.name) : 'לייגט צו שולן'}</span></div>
    <div class="tile t5" onclick="go('rcpt')"><i>🧾</i><h3>רעסיטס</h3><b>${rcNew}</b><span>נאך נישט געדרוקט</span><span>זינט ${fmtD(F.start)}</span></div>
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
   <div class="acts">${x.rc ? `<button class="btn gold sm" onclick="rcOpenTask('${id}')">🖨️ עפן רעסיטס</button>` : ''}${x.done ? '' : `<button class="btn sm" onclick="taskDone('${id}')">✓ געטון</button>`}<button class="btn ghost sm" onclick="taskForm('${id}')">ענדער</button></div></div>`;
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
  const paid = Object.entries(S.fr).filter(([, x]) => !x.del).map(([id, x]) => Object.assign({ id }, x)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const periods = [];
  if (t >= start) {
    const n = Math.floor(daysBetween(start, t) / 14);
    for (let k = 0; k <= n; k++) periods.push({ k, from: addDays(start, 14 * k), to: addDays(start, 14 * k + 13), income: 0, count: 0, ex: 0, owed: 0, paid: 0, bal: 0 });
  }
  income.forEach(i => { const p = periods[Math.floor(daysBetween(start, i.d) / 14)]; if (p) { p.income += i.amt; p.count++; } });
  exempt.forEach(e => { const p = periods[Math.floor(daysBetween(start, e.date) / 14)]; if (p) p.ex += e.amt; });
  let cumO = 0, cumP = 0;
  periods.forEach(p => {
    p.owed = (p.income - p.ex) * pct / 100;
    p.paid = paid.filter(x => x.date >= p.from && x.date <= p.to).reduce((s, x) => s + (+x.amt || 0), 0);
    cumO += p.owed; cumP += p.paid; p.bal = cumO - cumP;
  });
  const totPaid = paid.reduce((s, x) => s + (+x.amt || 0), 0), totIn = income.reduce((s, i) => s + i.amt, 0), totEx = exempt.reduce((s, x) => s + x.amt, 0);
  const totOwed = (totIn - totEx) * pct / 100;
  return { pct, start, income, paid, exempt, periods, totIn, totEx, totOwed, totPaid, balance: totOwed - totPaid, cur: periods[periods.length - 1] };
}
function vFund() {
  const F = fundCalc();
  $('#main').innerHTML = `<div class="row"><div><h2>פאנדרעיזינג חשבונות</h2><p class="sub">פון יעדן דאלער וואס קומט אריין זינט ${fmtDual(F.start)} באקומען די פאנדרעיזערס <b>${F.pct}%</b>. עס ווערט אויסגערעכנט יעדע 2 וואכן. די באצאלונגען צו זיי ווערן אראפגערעכנט.</p></div><div class="spacer"></div>
   <button class="btn ghost" onclick="xlsFund()">⬇ Excel</button><button class="btn ghost" onclick="fundSettings()">⚙️ ${F.pct}% · ${fmtD(F.start)}</button><button class="btn ghost" onclick="frInForm()">+ אריינקומען (נישט אין JLS)</button><button class="btn ghost" onclick="frExForm()">+ סכום אן פראצענט</button><button class="btn gold" onclick="frForm()">+ באצאלט די פאנדרעיזערס</button></div>
  <div class="stats">
   <div class="stat"><b>${money(F.totIn)}</b><span>אריינגעקומען זינט ${fmtD(F.start)}</span></div>
   ${F.totEx ? `<div class="stat"><b>${money(F.totEx)}</b><span>אן פראצענט (אראפגערעכנט)</span></div>` : ''}
   <div class="stat"><b>${money(F.totOwed)}</b><span>${F.pct}% קומט די פאנדרעיזערס</span></div>
   <div class="stat"><b>${money(F.totPaid)}</b><span>שוין באצאלט (${F.paid.length} מאל)</span></div>
   <div class="stat"><b class="${F.balance > 0.009 ? 'bal' : 'zero'}">${money(F.balance)}</b><span>${F.balance >= 0 ? 'נאך שולדיג' : 'איבערבאצאלט'}</span></div></div>
  <p class="sub">💡 די JLS באצאלונגען זענען ביז דער לעצטער דערהיינטיגונג (${new Date(JD.importedAt).toLocaleDateString()}). דערהיינטיגט פון JLS כדי עס זאל זיין גענוי.</p>
  <div class="cols"><div><h3>יעדע 2 וואכן</h3>
   <table><thead><tr><th>תקופה</th><th>באצאל.</th><th>אריינגעקומען</th>${F.totEx ? '<th>אן %</th>' : ''}<th>${F.pct}%</th><th>באצאלט</th><th>באלאנס</th><th></th></tr></thead><tbody>
   ${F.periods.slice().reverse().map(p => `<tr><td style="font-size:13px;white-space:nowrap">${fmtD(p.from)} –<br>${fmtD(p.to)}${p === F.cur ? ' <span class="tag ask">יעצט</span>' : ''}</td><td class="num">${p.count}</td><td class="num">${money(p.income)}</td>${F.totEx ? `<td class="num">${p.ex ? '−' + money(p.ex) : ''}</td>` : ''}<td class="num"><b>${money(p.owed)}</b></td><td class="num">${p.paid ? money(p.paid) : ''}</td><td class="num ${p.bal > 0.009 ? 'bal' : 'zero'}">${money(p.bal)}</td><td><button class="btn ghost sm" onclick="frPeriod(${p.k})">ווייז</button></td></tr>`).join('') || `<tr><td colspan="8" class="empty">הייבט זיך אן ${fmtD(F.start)}</td></tr>`}
   </tbody></table></div>
  <div><h3>באצאלונגען צו די פאנדרעיזערס</h3>
   <table><thead><tr><th>טאג</th><th>סכום</th><th>צו וועמען</th><th>נאטיץ</th><th></th></tr></thead><tbody>
   ${F.paid.map(x => `<tr><td class="num">${fmtD(x.date)}</td><td class="num"><b>${money(x.amt)}</b></td><td>${esc(x.to || '')}</td><td style="font-size:13px">${esc(x.note || '')}<br><small class="dim">${esc(x.by || '')}</small></td><td><button class="btn ghost sm" onclick="frForm('${x.id}')">ענדער</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">נאך גארנישט באצאלט</td></tr>'}
   </tbody></table>
   ${F.exempt.length ? `<h3>סכומים אן פראצענט</h3><table><tbody>${F.exempt.map(x => `<tr><td class="num">${fmtD(x.date)}</td><td class="num">−${money(x.amt)}</td><td style="font-size:13px">${esc(x.note || '')}</td><td><button class="btn ghost sm" onclick="frExForm('${x.id}')">ענדער</button></td></tr>`).join('')}</tbody></table>` : ''}
   ${Object.values(S.frin).some(x => !x.del) ? `<h3>אריינקומען וואס איז נישט אין JLS</h3><table><tbody>${Object.entries(S.frin).filter(([, x]) => !x.del).sort((a, b) => b[1].date.localeCompare(a[1].date)).map(([id, x]) => `<tr><td class="num">${fmtD(x.date)}</td><td class="num">${money(x.amt)}</td><td style="font-size:13px">${esc(x.note || '')}</td><td><button class="btn ghost sm" onclick="frInForm('${id}')">ענדער</button></td></tr>`).join('')}</tbody></table>` : ''}
  </div></div>`;
}
function frPeriod(k) {
  const F = fundCalc(), p = F.periods[k]; if (!p) return;
  const L = F.income.filter(i => i.d >= p.from && i.d <= p.to).sort((a, b) => a.d.localeCompare(b.d));
  modal(`<div class="row"><h2 style="margin:0">${fmtD(p.from)} – ${fmtD(p.to)}</h2><div class="spacer"></div><button class="btn ghost sm" onclick="closeM()">✕</button></div>
   <div class="row"><button class="btn ghost sm" onclick="xlsPeriod(${k})">⬇ Excel</button></div>
   <p class="sub">${p.count} באצאלונגען · ${money(p.income)}${p.ex ? ' · אן פראצענט: −' + money(p.ex) : ''} · ${F.pct}% = <b>${money(p.owed)}</b></p>
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
   <div class="row" style="justify-content:flex-end;margin-top:14px">${id ? `<button class="btn red" onclick="frDel('fr','${id}')">אויסמעקן</button><div class="spacer"></div>` : ''}<button class="btn ghost" onclick="closeM()">צוריק</button><button class="btn" onclick="frSave('${id || ''}')">היט אפ</button></div>`, 'narrow');
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
   <div class="row" style="justify-content:flex-end;margin-top:14px">${id ? `<button class="btn red" onclick="frDel('frin','${id}')">אויסמעקן</button><div class="spacer"></div>` : ''}<button class="btn ghost" onclick="closeM()">צוריק</button><button class="btn" onclick="frInSave('${id || ''}')">היט אפ</button></div>`, 'narrow');
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
   <div class="row" style="justify-content:flex-end;margin-top:14px">${id ? `<button class="btn red" onclick="frDel('frex','${id}')">אויסמעקן</button><div class="spacer"></div>` : ''}<button class="btn ghost" onclick="closeM()">צוריק</button><button class="btn" onclick="frExSave('${id || ''}')">היט אפ</button></div>`, 'narrow');
  setTimeout(() => $('#xa').focus(), 50);
}
async function frExSave(id) {
  const amt = +$('#xa').value; if (!amt) { $('#xa').focus(); return; }
  await emit('frex', id || uid(), { date: $('#xd').value || todayS(), amt, note: $('#xn').value.trim(), del: false });
  closeM(); render(); toast('✓ אפגעהיטן');
}
// ---------- Excel downloads (fundraisers, shul) ----------
function incomeRows(F, list) {
  return [['טאג', 'טאג (אידיש)', '#', 'נאמען', 'English', 'סכום', F.pct + '%', 'פון']].concat(list.map(i => { const a = i.code ? IDX.by.get(i.code) : null; return [i.d, hebD(i.d), i.code || '', a ? (a.h || a.n) : (i.note || ''), a ? a.n : '', r2(i.amt), r2(i.amt * F.pct / 100), i.src === 'JLS' ? 'JLS' : 'מאנועל']; }));
}
function xlsFund() {
  const F = fundCalc();
  xlsx([
    { name: 'סך הכל', rows: [['', 'סכום'], ['אריינגעקומען זינט ' + F.start, r2(F.totIn)], ['אן פראצענט', r2(F.totEx)], [F.pct + '% פאר די פאנדרעיזערס', r2(F.totOwed)], ['שוין באצאלט', r2(F.totPaid)], ['נאך שולדיג', r2(F.balance)], ['דערהיינטיגט פון JLS', new Date(JD.importedAt).toLocaleString()]], widths: [34, 20] },
    { name: 'יעדע 2 וואכן', rows: [['פון', 'ביז', 'פון (אידיש)', 'ביז (אידיש)', 'באצאלונגען', 'אריינגעקומען', 'אן פראצענט', F.pct + '%', 'באצאלט', 'באלאנס']].concat(F.periods.map(p => [p.from, p.to, hebD(p.from), hebD(p.to), p.count, r2(p.income), r2(p.ex), r2(p.owed), r2(p.paid), r2(p.bal)])) },
    { name: 'באצאלט פאנדרעיזערס', rows: [['טאג', 'טאג (אידיש)', 'סכום', 'צו וועמען', 'נאטיץ', 'ארייןגעלייגט דורך']].concat(F.paid.map(x => [x.date, hebD(x.date), r2(x.amt), x.to || '', x.note || '', x.by || ''])) },
    { name: 'אן פראצענט', rows: [['טאג', 'טאג (אידיש)', 'סכום', 'נאטיץ']].concat(F.exempt.map(x => [x.date, hebD(x.date), r2(x.amt), x.note || ''])) },
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
  modal(`<h2>⚙️ פאנדרעיזינג איינשטעלונגען</h2><div class="grid2">
   <label class="f">פראצענט פאר די פאנדרעיזערס<input id="fp" type="number" min="0" max="100" step="0.5" value="${F.pct}"></label>
   <label class="f">אנגעהויבן פון (ערשטער טאג פון ערשטע 2 וואכן)${dateField('fs', F.start)}</label></div>
   <p class="sub" style="margin-top:8px">ראש השנה תשפ"ז = ${fmtD(RH5787)}. יעדע 2 וואכן פון דעם טאג ווערט א נייע תקופה.</p>
   <div class="row" style="justify-content:flex-end"><button class="btn ghost" onclick="closeM()">צוריק</button><button class="btn" onclick="fundSaveSet()">היט אפ</button></div>`, 'narrow');
}
async function fundSaveSet() {
  const pct = +$('#fp').value; if (!(pct >= 0 && pct <= 100)) { $('#fp').focus(); return; }
  await emit('settings', 's', { frPct: pct, frStart: $('#fs').value || RH5787 });
  closeM(); render(); toast('✓ אפגעהיטן');
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
   <div class="row" style="justify-content:flex-end;margin-top:14px">${id ? `<button class="btn red" onclick="shulDel('${id}')">אויסמעקן</button><div class="spacer"></div>` : ''}<button class="btn ghost" onclick="closeM()">צוריק</button><button class="btn" onclick="shulSave('${id || ''}')">היט אפ</button></div>`, 'narrow');
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
   <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" onclick="closeM()">צוריק</button><button class="btn" onclick="shulStartSave()">היט אפ</button></div>`, 'narrow');
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
// The way to dial is saved on this computer only: 'tel:{num}' opens the office phone program
// (softphone / Phone Link / RingCentral...), or an http URL for desk phones with "click to dial".
const callTpl = () => { try { return localStorage.getItem('yg_call') || 'tel:{num}'; } catch (e) { return 'tel:{num}'; } };
const callNum = n => { const d = String(n || '').replace(/\D/g, ''); return d.length === 10 ? '1' + d : d; };
function callBtn(num, code) {
  const d = callNum(num); if (d.length < 7) return '';
  return `<a class="callb" title="קאל ${esc(num)}" href="${esc(callTpl().replace('{num}', '+' + d).replace('{digits}', d.slice(-10)))}" onclick="return dial(this,${+code || 0})">📞</a>`;
}
function dial(el, code) {
  const url = el.getAttribute('href');
  if (/^https?:/i.test(url)) {   // desk phone: send the dial request in a small window that closes itself
    const w = window.open(url, 'ygdial', 'width=320,height=160');
    if (w) setTimeout(() => { try { w.close(); } catch (e) { } }, 5000);
    toast('📞 קאלט...');
    return false;
  }
  toast('📞 קאלט...');
  return true;
}
function callSetup() {
  const t = callTpl(), yl = t.match(/^http:\/\/([^/]+)\/servlet\?key=number=\{digits\}$/);
  const mode = t === 'tel:{num}' ? 'tel' : yl ? 'yealink' : 'custom';
  modal(`<h2>📞 קאלן פון דעם קאמפיוטער</h2>
   <p class="sub">ווען מען דריקט 📞 לעבן א נדבן, קאלט עס אים דורך אייער אפיס טעלעפאן. די איינשטעלונג איז נאר פאר <b>דעם</b> קאמפיוטער.</p>
   <label class="f">וועלכער טעלעפאן<select id="cs" onchange="callMode(this.value)">
    <option value="yealink" ${mode === 'yealink' ? 'selected' : ''}>Yealink טעלעפאן אויפן טיש</option>
    <option value="tel" ${mode === 'tel' ? 'selected' : ''}>טעלעפאן פראגראם אויפן קאמפיוטער (tel:)</option>
    <option value="custom" ${mode === 'custom' ? 'selected' : ''}>אנדערש (לינק)</option></select></label>
   <div id="c_yl" style="margin-top:10px"><label class="f">IP פון דעם Yealink טעלעפאן (למשל 192.168.1.50)<input id="cip" style="direction:ltr" value="${esc(yl ? yl[1] : '')}" placeholder="192.168.1.50"></label>
    <p class="sub" style="margin-top:6px">💡 צו געפינען: דריקט אויפן טעלעפאן <b>OK</b> (אדער Menu > Status), דארט שטייט IPv4.</p></div>
   <div id="c_cu" style="margin-top:10px"><label class="f">לינק ({num} = +18455551234, {digits} = 8455551234)<input id="cu" style="direction:ltr" value="${esc(mode === 'custom' ? t : '')}"></label></div>
   <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" onclick="closeM()">צוריק</button><button class="btn" onclick="callSave()">היט אפ</button></div>`, 'narrow');
  callMode(mode);
}
function callMode(m) { $('#c_yl').style.display = m === 'yealink' ? '' : 'none'; $('#c_cu').style.display = m === 'custom' ? '' : 'none'; }
function callSave() {
  const m = $('#cs').value; let v = 'tel:{num}';
  if (m === 'yealink') {
    const ip = $('#cip').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[\w.-]+(:\d+)?$/.test(ip)) { toast('⚠️ שרייבט דעם IP פון דעם טעלעפאן'); return; }
    v = 'http://' + ip + '/servlet?key=number={digits}';
  } else if (m === 'custom') {
    v = $('#cu').value.trim();
    if (!v.includes('{num}') && !v.includes('{digits}')) { toast('⚠️ דער לינק מוז האבן {num} אדער {digits}'); return; }
  }
  try { localStorage.setItem('yg_call', v); } catch (e) { }
  closeM(); render(); toast('✓ אפגעהיטן – פרובירט א 📞');
}
