/* YG Fund – receipts (רעסיטס). Loaded before app.js; functions only.
   Layout copied from the Word mail-merge template (Letter page, positions in inches):
   background image 8.198 x 10.609 at (0.151, 0.195); text boxes at 1in margin + Word offsets. */
'use strict';
const RC_BOX = {
  name:   { l: 1.8118, t: 2.3021, w: 3.8438, h: 0.6667 },   // donor's Hebrew name under "מעלת כבוד..."
  amt:    { l: 2.3826, t: 4.1218, w: 2.7217, h: 0.5245 },   // big "$3,000" under "בסך"
  date:   { l: 4.6000, t: 7.7826, w: 1.4783, h: 0.3125 },   // Date:
  amtOf:  { l: 2.0000, t: 8.3646, w: 1.0417, h: 0.3750 },   // Amunt of: $
  addr:   { l: 1.0000, t: 9.2610, w: 3.3652, h: 1.1997 },   // name + address block
  by:     { l: 4.4522, t: 9.9218, w: 1.5104, h: 0.3559 }    // Received by:
};
const rcKey = p => String(p[0] != null ? p[0] : p[1] + '|' + p[2] + '|' + p[3]);
const rcPrinted = p => (S.rcpt[rcKey(p)] || {}).printed;
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const rcDate = s => { const [y, m, d] = s.split('-'); return MON3[+m - 1] + './' + d + '/' + y; };
const rcMoney = n => { const v = Math.round(n * 100) / 100; return v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
function rcAddr(a) {   // "12 Sears Rd, Monroe, NY 10950" -> ["12 Sears Rd", "Monroe NY 10950"]
  const parts = (a.a || '').split(', ').filter(Boolean);
  if (parts.length < 3) return [parts.join(', '), ''];
  return [parts.slice(0, -2).join(', '), parts.slice(-2).join(' ')];
}
// Campaigns whose receipt is for the whole pledge (even before it is fully paid)
const rcPlCamps = () => new Set((SET().rcptPlCamps || []).map(Number));
// Receipt items, shaped like payments: [key, code, date, amount, type, check, campaign, solicitor, notes, refunded, pledge?]
// Payments of the full-pledge campaigns are left out; their pledges (MCharges) become the receipts instead.
function rcItems() {
  const pc = rcPlCamps();
  const L = JD.payments.filter(p => validD(p[2]) && !p[9] && p[3] > 0 && IDX.by.has(p[1]) && !pc.has(+p[6]));
  if (pc.size) JD.pledges.forEach(c => { const d = c[11] || c[2]; if (pc.has(+c[6]) && validD(d) && c[3] > 0 && IDX.by.has(c[1])) L.push(['pl' + c[0], c[1], d, c[3], 'פלעדזש', '', c[6], c[8], '', 0, c]); });
  return L;
}
function rcData(p) {
  const a = IDX.by.get(p[1]) || { n: '', h: '', a: '' }, s = SET(), suf = s.rcptSuffix != null ? s.rcptSuffix : 'הי"ו';
  const heb = a.h ? a.h + (suf ? ' ' + suf : '') : '';
  const d = { key: rcKey(p), code: p[1], date: p[2], amt: p[3], heb, top: heb || a.n, eng: a.n, addr: rcAddr(a), by: s.rcptBy || p[7] || '' };
  const ed = (S.rcpt[d.key] || {}).ed;   // text changed by hand for this one receipt
  if (ed) { ['top', 'heb', 'eng', 'by', 'date'].forEach(k => { if (ed[k] != null) d[k] = ed[k]; }); if (ed.amt != null && ed.amt !== '') d.amt = +ed.amt; if (ed.a1 != null) d.addr = [ed.a1, d.addr[1]]; if (ed.a2 != null) d.addr = [d.addr[0], ed.a2]; d.edited = true; }
  return d;
}
// ---------- range / list ----------
function rcPeriods() { const F = fundCalc(); return { F, prev: F.periods[F.periods.length - 2], cur: F.cur }; }
function rcRangeDefault() {
  const { F, prev, cur } = rcPeriods();
  return prev ? { from: prev.from, to: prev.to } : { from: F.start, to: todayS() };
}
function rcList() {
  if (!ui.rc) ui.rc = Object.assign({ hide: true, bg: true, sel: {} }, rcRangeDefault());
  const r = ui.rc;
  return rcItems().filter(p => p[2] >= r.from && p[2] <= r.to && (!r.hide || !rcPrinted(p)))
    .sort((a, b) => a[2].localeCompare(b[2]) || acctName(a[1]).localeCompare(acctName(b[1]), 'he'));
}
const rcIsSel = p => { const v = ui.rc.sel[rcKey(p)]; return v === undefined ? !rcPrinted(p) : v; };
function rcTabs() {
  return `<div class="row"><h2 style="margin:0">🧾 רעסיטס/סטעיטמענטס</h2></div><div class="tabs2" style="margin-top:6px">${[['rc', '🧾 רעסיטס'], ['st', '📄 סטעיטמענטס (אפענע פלעדזשעס)']].map(([k, l]) => `<button class="${(ui.rcTab || 'rc') === k ? 'on' : ''}" onclick="ui.rcTab='${k}';render()">${l}</button>`).join('')}</div>`;
}
function vRcpt() {
  if (ui.rcTab === 'st') return vStmt();
  const L = rcList(), r = ui.rc, { F, prev, cur } = rcPeriods(), s = SET();
  const sel = L.filter(rcIsSel), total = sel.reduce((t, p) => t + rcData(p).amt, 0);
  const unprintedAll = rcItems().filter(p => p[2] >= F.start && !rcPrinted(p)).length;
  window._rcL = L;
  $('#main').innerHTML = rcTabs() + `<div class="row"><div><p class="sub">קלייבט פון ווען ביז ווען, קוקט איבער די ליסטע, און דריקט "פרינט". יעדע רעסיט איז א בלאט (Letter). נאכן דרוקן מערקט מען זיי אן אלס געדרוקט, כדי זיי זאלן נישט ארויסקומען נאכאמאל.</p></div><div class="spacer"></div>
   <button class="btn ghost" onclick="rcSettings()">⚙️ איינשטעלונגען</button><button class="btn ghost" onclick="rcExcel()">⬇ Excel</button></div>
  <div class="box" style="margin-bottom:14px"><div class="row" style="margin:0;align-items:flex-end">
   <label class="f">פון${dateField('rcf', r.from)}</label><label class="f">ביז${dateField('rct', r.to)}</label>
   <button class="btn" onclick="ui.rc.from=$('#rcf').value||ui.rc.from;ui.rc.to=$('#rct').value||ui.rc.to;ui.rc.sel={};vRcpt()">ווייז</button>
   <div class="chips">${prev ? `<button class="chip" onclick="rcRange('${prev.from}','${prev.to}')">די לעצטע 2 וואכן</button>` : ''}${cur ? `<button class="chip" onclick="rcRange('${cur.from}','${todayS()}')">די יעצטיגע 2 וואכן</button>` : ''}<button class="chip" onclick="rcRange('${F.start}','${todayS()}')">אלע וואס זענען נאך נישט געדרוקט (${unprintedAll})</button></div></div>
   <div class="row" style="margin:10px 0 0"><label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" ${r.hide ? 'checked' : ''} onchange="ui.rc.hide=this.checked;vRcpt()"> באהאלט וואס איז שוין געדרוקט</label>
   <label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" ${r.bg ? 'checked' : ''} onchange="ui.rc.bg=this.checked"> דרוק מיט דעם הינטערגרונט (אראפנעמען אויב איר דרוקט אויף פארגעדרוקטע פאפיר)</label></div></div>
  <div class="row"><b>${sel.length} רעסיטס אויסגעקליבן · ${money(total)}</b><div class="spacer"></div>
   <button class="btn ghost sm" onclick="rcAll(true)">קלייב אלע</button><button class="btn ghost sm" onclick="rcAll(false)">קיינער</button>
   <button class="btn gold" ${sel.length ? '' : 'disabled'} onclick="rcPrint()">🖨️ פרינט ${sel.length} רעסיטס</button></div>
  <table><thead><tr><th></th><th>טאג</th><th>נאמען</th><th>סכום</th><th>אדרעס</th><th>Received by</th><th></th></tr></thead><tbody>
  ${L.map((p, i) => { const d = rcData(p), a = IDX.by.get(p[1]); return `<tr style="${rcIsSel(p) ? '' : 'opacity:.5'}"><td><input type="checkbox" ${rcIsSel(p) ? 'checked' : ''} onchange="ui.rc.sel['${d.key}']=this.checked;vRcpt()"></td>
   <td class="num" style="font-size:13px">${fmtD(p[2])}</td><td><a class="name" onclick="openAcct(${p[1]})">${esc(a.h || a.n)}</a><div class="heb">${esc(a.h ? a.n : '')}</div></td>
   <td class="num"><b>${money(d.amt)}</b>${p[10] ? `<br><span class="tag custom">פלעדזש</span> <small class="dim">באצאלט ${money(p[10][4])}</small>` : ''}</td><td style="font-size:13px">${a.a ? `<span class="ltr">${esc(a.a)}</span>` : '<span class="tag late">⚠️ קיין אדרעס</span>'}</td><td style="font-size:12px">${esc(d.by)}</td>
   <td>${rcPrinted(p) ? `<span class="tag ok">✓ געדרוקט ${fmtD(rcPrinted(p))}</span>` : ''} ${d.edited ? '<span class="tag ask">✏️ געטוישט</span> ' : ''}<button class="btn ghost sm" title="טויש דעם טעקסט" onclick="rcEdit(${i})">✏️</button><button class="btn ghost sm" title="קוק אן" onclick="rcPreview(${i})">👁</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">קיין נדבות אין די טעג</td></tr>'}
  </tbody></table>
  <p class="sub" style="margin-top:10px">💡 נאר וואס איז אין JLS (ביז ${new Date(JD.importedAt).toLocaleDateString()}). ביים דרוקן: Margins = None, Scale = 100%.</p>`;
  initDateFields($('#main'));
}
function rcRange(f, t) { ui.rc.from = f; ui.rc.to = t; ui.rc.sel = {}; vRcpt(); }
function rcAll(v) { rcList().forEach(p => { ui.rc.sel[rcKey(p)] = v; }); vRcpt(); }
// ---------- print ----------
function rcPage(d, bg) {
  const box = (b, cls, html) => `<div class="b ${cls}" style="left:${b.l}in;top:${b.t}in;width:${b.w}in;height:${b.h}in">${html}</div>`;
  return `<div class="pg">${bg ? '<img class="bg" src="' + location.origin + '/receipt-bg.jpg">' : ''}
   ${box(RC_BOX.name, 'hb c', esc(d.top))}
   ${box(RC_BOX.amt, 'en c', '$' + rcMoney(d.amt))}
   ${box(RC_BOX.date, 'en dt', rcDate(d.date))}
   ${box(RC_BOX.amtOf, 'hb c ao', rcMoney(d.amt))}
   ${box(RC_BOX.addr, 'c ad', (d.heb ? `<div class="hl">${esc(d.heb)}</div>` : '') + `<div class="el">${esc(d.eng)}</div><div class="al">${esc(d.addr[0])}</div><div class="al">${esc(d.addr[1])}</div>`)}
   ${box(RC_BOX.by, 'c by', esc(d.by))}</div>`;
}
function rcDoc(list, bg, autoPrint) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>רעסיטס</title>
<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;900&display=swap" rel="stylesheet">
<style>
@page{size:letter;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#888}
.pg{position:relative;width:8.5in;height:11in;overflow:hidden;background:#fff;margin:0 auto;page-break-after:always;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg:last-child{page-break-after:auto;break-after:auto}
.bg{position:absolute;left:.151in;top:.195in;width:8.198in;height:10.609in}
.b{position:absolute;padding:.05in .1in;color:#660033;line-height:1.15;overflow:visible;white-space:nowrap}
.c{text-align:center}
.hb{font-family:'EFT_Pnina Black','Frank Ruhl Libre',serif;font-weight:900;font-size:22pt;direction:rtl}
.ao{direction:ltr}
.en{font-family:'Times New Roman',Times,serif}
.b.en.c{font-size:28pt;font-weight:bold}
.dt{font-size:14pt;text-align:left}
.ad{font-family:'Times New Roman',Times,serif}
.hl{font-family:'EFT_Pnina Light','Frank Ruhl Libre',serif;font-size:14pt;direction:rtl}
.el{font-size:14pt;font-weight:bold}
.al{font-size:16pt}
.by{font-family:'Times New Roman',Times,serif;font-size:7pt;white-space:normal}
@media screen{.pg{margin:16px auto;box-shadow:0 4px 20px rgba(0,0,0,.4)}}
@media print{html,body{background:#fff}}
</style></head><body>${list.map(d => rcPage(d, bg)).join('')}
${autoPrint ? `<script>window.onload=function(){(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){window.print()},300)})}<\/script>` : ''}</body></html>`;
}
function rcOpen(list, autoPrint) {
  const w = window.open('', '_blank');
  if (!w) { toast('⚠️ דער בראוזער האט בלאקירט דאס נייע פענצטער – ערלויבט Pop-ups פאר דעם וועבסייט'); return false; }
  w.document.open(); w.document.write(rcDoc(list, ui.rc.bg, autoPrint)); w.document.close();
  return true;
}
function rcPreview(i) { const p = window._rcL[i]; if (p) rcOpen([rcData(p)], false); }
function rcPrint() {
  const sel = rcList().filter(rcIsSel); if (!sel.length) return;
  if (!rcOpen(sel.map(rcData), true)) return;
  window._rcToMark = sel;
  modal(`<h2>🖨️ ${sel.length} רעסיטס</h2><p>די רעסיטס האבן זיך געעפנט אין א נייעם פענצטער. ווען עס האט גוט געדרוקט, דריקט דא אונטן כדי זיי זאלן אנגעמערקט ווערן אלס געדרוקט.</p>
   <p class="sub">💡 אין פרינט פענצטער: Margins = <b>None</b>, Scale = <b>100%</b>, "Background graphics" = אן.</p>
   <div class="row" style="justify-content:flex-end"><button class="btn ghost" onclick="closeM()">נאך נישט</button><button class="btn" onclick="rcMark()">✓ ס'איז געדרוקט – מערק אן</button></div>`, 'narrow');
}
async function rcMark() {
  const L = window._rcToMark || [], t = todayS();
  const rows = L.map(p => ({ k: 'rcpt', eid: rcKey(p), p: { printed: t, by: me }, by: me }));
  try {
    for (let i = 0; i < rows.length; i += 500) await q(sb.from('events').insert(rows.slice(i, i + 500)));
    rows.forEach(r => applyEvent({ k: r.k, id: r.eid, p: r.p, by: me }));
  } catch (e) { toast('⚠️ ' + (e.message || e)); return; }
  // close the 2-week receipt to-dos that are now fully printed
  for (const [id, x] of Object.entries(S.task)) {
    if (!x.rc || x.done || x.del) continue;
    const left = rcItems().some(p => p[2] >= x.rc.from && p[2] <= x.rc.to && !rcPrinted(p));
    if (!left) await emitTask(id, { done: true, doneAt: t });
  }
  ui.rc.sel = {}; closeM(); render(); toast('✓ ' + L.length + ' רעסיטס אנגעמערקט אלס געדרוקט');
}
function rcExcel() {
  const L = rcList().filter(rcIsSel);
  xlsx([{ name: 'רעסיטס', rows: [['טאג', 'טאג (אידיש)', '#', 'נאמען', 'English', 'סכום', 'אדרעס', 'שטאט', 'Received by', 'געדרוקט']].concat(L.map(p => { const d = rcData(p); return [d.date, hebD(d.date), p[1], d.heb, d.eng, r2(d.amt), d.addr[0], d.addr[1], d.by, rcPrinted(p) || '']; })) }], 'receipts-' + ui.rc.from + '-' + ui.rc.to + '.xlsx');
}
function rcEdit(i) {
  const p = window._rcL[i]; if (!p) return;
  const d = rcData(p);
  const f = (id, label, v, ltr, full) => `<label class="f"${full ? ' style="grid-column:1/-1"' : ''}>${label}<input id="${id}" value="${esc(v == null ? '' : v)}"${ltr ? ' style="direction:ltr"' : ''}></label>`;
  modal(`<h2>✏️ טויש דעם טעקסט אויף דער רעסיט</h2><p class="sub">נאר פאר <b>די</b> רעסיט. JLS ווערט נישט געטוישט.</p><div class="grid2">
   ${f('ret', 'נאמען אויבן (אונטער "מעלת כבוד")', d.top, false, true)}
   ${f('rea', 'סכום $', d.amt, true)}${f('red', 'טאג (YYYY-MM-DD)', d.date, true)}
   ${f('reh', 'נאמען אויף לשון קודש (אדרעס)', d.heb, false, true)}${f('ree', 'נאמען אויף ענגליש', d.eng, true, true)}
   ${f('re1', 'גאס', d.addr[0], true)}${f('re2', 'שטאט, סטעיט, זיפ', d.addr[1], true)}
   ${f('reb', 'Received by', d.by, false, true)}</div>
   <div class="row" style="justify-content:flex-end;margin-top:14px">${d.edited ? `<button class="btn red" onclick="rcEditSave('${esc(d.key)}',true)">צוריק צו JLS</button><div class="spacer"></div>` : ''}<button class="btn ghost" onclick="closeM()">צוריק</button><button class="btn ghost" onclick="rcEditSave('${esc(d.key)}',false,${i})">👁 היט אפ און קוק אן</button><button class="btn" onclick="rcEditSave('${esc(d.key)}')">היט אפ</button></div>`, 'narrow');
}
async function rcEditSave(key, reset, preview) {
  if (reset) { await emit('rcpt', key, { ed: null }); closeM(); render(); toast('✓ צוריק ווי אין JLS'); return; }
  const amt = $('#rea').value.trim(), date = $('#red').value.trim();
  if (amt && !(+amt > 0)) { toast('⚠️ סכום איז נישט ריכטיג'); return; }
  if (date && !validD(date)) { toast('⚠️ טאג: למשל 2026-11-12'); return; }
  await emit('rcpt', key, { ed: { top: $('#ret').value, amt, date: date || null, heb: $('#reh').value, eng: $('#ree').value, a1: $('#re1').value, a2: $('#re2').value, by: $('#reb').value } });
  closeM(); render(); toast('✓ אפגעהיטן');
  if (preview != null) rcPreview(preview);
}
function rcSettings() {
  const s = SET();
  modal(`<h2>⚙️ רעסיטס איינשטעלונגען</h2><div class="grid2">
   <label class="f">"Received by" (ליידיג = דער סאליסיטאר פון JLS)<input id="rsb" value="${esc(s.rcptBy || '')}"></label>
   <label class="f">נאכן נאמען (למשל הי"ו)<input id="rss" value="${esc(s.rcptSuffix != null ? s.rcptSuffix : 'הי"ו')}"></label>
   <label class="f">ווער באקומט די To-Do יעדע 2 וואכן<select id="rsw">${USERS().map(u => `<option ${u === rcWho() ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label></div>
   <h3>קאמפעינס מיט רעסיט אויף דער גאנצער פלעדזש</h3>
   <p class="sub">ביי די קאמפעינס באקומט דער נדבן א רעסיט אויף דער <b>גאנצער פלעדזש</b>, אפילו ער האט נאך נישט אלעס באצאלט. (זיינע באצאלונגען צו דעם קאמפעין מאכן דעמאלט נישט קיין באזונדערע רעסיט.)</p>
   <div class="scroll" style="max-height:220px;border:1px solid var(--line);border-radius:8px;padding:6px 10px">${rcCampList().map(([n, name, cnt]) => `<label style="display:flex;gap:8px;align-items:center;font-size:14px;padding:3px 0"><input type="checkbox" class="rpc" value="${n}" ${rcPlCamps().has(n) ? 'checked' : ''}> ${esc(name)} <small class="dim">#${n} · ${cnt} פלעדזשעס</small></label>`).join('') || '<div class="sub">קיין קאמפעינס מיט פלעדזשעס</div>'}</div>
   <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" onclick="closeM()">צוריק</button><button class="btn" onclick="rcSaveSet()">היט אפ</button></div>`, 'narrow');
}
async function rcSaveSet() {
  await emit('settings', 's', { rcptBy: $('#rsb').value.trim(), rcptSuffix: $('#rss').value.trim(), rcptWho: $('#rsw').value, rcptPlCamps: [...document.querySelectorAll('.rpc:checked')].map(x => +x.value) });
  closeM(); render(); toast('✓ אפגעהיטן');
}
// Campaigns that have YG pledges, newest first: [num, name, count]
function rcCampList() {
  const m = new Map(); JD.pledges.forEach(c => { if (!c[6]) return; const o = m.get(c[6]) || { n: 0, last: '' }; o.n++; const d = c[11] || c[2] || ''; if (d > o.last) o.last = d; m.set(c[6], o); });
  return [...m.entries()].sort((a, b) => b[1].last.localeCompare(a[1].last)).map(([n, o]) => [+n, JD.campaigns[n] || ('#' + n), o.n]);
}
const rcWho = () => SET().rcptWho || ((TEAM.find(t => t.is_admin) || TEAM[0] || {}).name) || me;
// Every 2 weeks (same periods as the fundraiser accounts), a to-do to print the last period's receipts.
// The id is fixed per period, so two computers creating it at once just write the same task.
async function ensureRcptTask() {
  if (!JD) return;
  const { prev, cur } = rcPeriods(); if (!prev || !cur) return;
  const id = 'rcpt-' + prev.from; if (S.task[id]) return;
  await emitTask(id, { title: '🧾 רעסיטס פרינטן – ' + fmtD(prev.from) + ' ביז ' + fmtD(prev.to), due: cur.from, who: rcWho(), who2: '', code: '', pri: 'norm', note: '', repeat: '', done: false, priv: false, rc: { from: prev.from, to: prev.to } });
}
function rcOpenTask(id) { const x = S.task[id]; if (!x || !x.rc) return; ui.rc = Object.assign({ hide: true, bg: true, sel: {} }, x.rc); go('rcpt'); }

// ---------- statements (סטעיטמענטס) for open pledges ----------
const STMT_TEXT_DEF = 'מיר ווילן אייך הארציג דאנקען פאר אייער צוזאג לטובת ישיבתינו הק\'. אונטן געפינט איר א חשבון פון וואס שטייט נאך אפען. מיר וועלן זיין זייער דאנקבאר ווען איר וועט עס באצאלן בהקדם. אויב איר האט שוין באצאלט, ביטע איגנארירט דעם בריוו.';
const stSent = c => (S.stmt[c] || {}).sent;
function stLines(code) {   // open pledge lines of one donor, by the current filter
  const p = IDX.pl.get(code), st = ui.st, eom = iso(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
  if (!p) return [];
  return p.list.filter(c => !c[9] && c[5] > 0.009 && (!st.camp || +c[6] === +st.camp) && (st.due !== 'now' || !c[2] || c[2] <= eom))
    .sort((a, b) => (a[2] || '').localeCompare(b[2] || ''));
}
function stRows() {
  if (!ui.st) ui.st = { camp: '', due: 'now', min: 0, hide: false, sel: {} };
  const out = [];
  IDX.pl.forEach((g, c) => {
    if (!IDX.by.has(c)) return;
    const L = stLines(c), bal = L.reduce((s, x) => s + x[5], 0);
    if (bal > 0.009 && bal >= (+ui.st.min || 0) && (!ui.st.hide || !stSent(c))) out.push({ c, a: IDX.by.get(c), L, bal });
  });
  return out.sort((x, y) => x.a._k.localeCompare(y.a._k, 'he'));
}
const stIsSel = r => { const v = ui.st.sel[r.c]; return v === undefined ? !!r.a.a : v; };
function vStmt() {
  const R = stRows(), st = ui.st, sel = R.filter(stIsSel), tot = sel.reduce((s, r) => s + r.bal, 0);
  const camps = rcCampList();
  window._stR = R;
  $('#main').innerHTML = rcTabs() + `<div class="row"><div><p class="sub">נדבנים מיט אן אפענער פלעדזש וואס איז נאך נישט באצאלט. קלייבט אויס, דרוקט, און מערקט אן אלס געשיקט. יעדער סטעיטמענט איז א בלאט מיט אלע זיינע אפענע פלעדזשעס.</p></div><div class="spacer"></div>
   <button class="btn ghost" onclick="stSettings()">⚙️ טעקסט</button><button class="btn ghost" onclick="stExcel()">⬇ Excel</button></div>
  <div class="box" style="margin-bottom:14px"><div class="row" style="margin:0;align-items:flex-end">
   <label class="f">קאמפעין<select onchange="ui.st.camp=this.value;ui.st.sel={};vStmt()"><option value="">אלע קאמפעינס</option>${camps.map(([n, name]) => `<option value="${n}" ${+st.camp === n ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>
   <label class="f">וועלכע<select onchange="ui.st.due=this.value;ui.st.sel={};vStmt()"><option value="now" ${st.due === 'now' ? 'selected' : ''}>וואס איז שוין פעליג (ביז סוף חודש)</option><option value="all" ${st.due === 'all' ? 'selected' : ''}>אלע אפענע, אויך שפעטערדיגע</option></select></label>
   <label class="f">מינימום באלאנס $<input type="number" value="${esc(st.min || '')}" style="width:110px" onchange="ui.st.min=+this.value||0;ui.st.sel={};vStmt()"></label>
   <label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" ${st.hide ? 'checked' : ''} onchange="ui.st.hide=this.checked;vStmt()"> באהאלט וואס איז שוין געשיקט</label></div></div>
  <div class="row"><b>${sel.length} סטעיטמענטס אויסגעקליבן · ${money(tot)}</b><div class="spacer"></div>
   <button class="btn ghost sm" onclick="stAll(true)">קלייב אלע</button><button class="btn ghost sm" onclick="stAll(false)">קיינער</button>
   <button class="btn gold" ${sel.length ? '' : 'disabled'} onclick="stPrint()">🖨️ פרינט ${sel.length} סטעיטמענטס</button></div>
  <table><thead><tr><th></th><th>נאמען</th><th>אדרעס</th><th>פלעדזשעס</th><th>באלאנס</th><th>לעצטע מאל געשיקט</th><th></th></tr></thead><tbody>
  ${R.map((r, i) => `<tr style="${stIsSel(r) ? '' : 'opacity:.5'}"><td><input type="checkbox" ${stIsSel(r) ? 'checked' : ''} onchange="ui.st.sel[${r.c}]=this.checked;vStmt()"></td>
   <td><a class="name" onclick="openAcct(${r.c})">${esc(r.a.h || r.a.n)}</a><div class="heb">${esc(r.a.h ? r.a.n : '')}</div></td>
   <td style="font-size:13px">${r.a.a ? `<span class="ltr">${esc(r.a.a)}</span>` : '<span class="tag late">⚠️ קיין אדרעס</span>'}</td>
   <td style="font-size:12.5px">${r.L.slice(0, 3).map(x => `${esc(JD.campaigns[x[6]] || x[7] || '')}: <b class="num">${money(x[5])}</b>`).join('<br>')}${r.L.length > 3 ? '<br>…' : ''}</td>
   <td class="num bal">${money(r.bal)}</td><td style="font-size:13px">${stSent(r.c) ? `<span class="tag ok">✓ ${fmtD(stSent(r.c))}</span>` : ''}</td>
   <td><button class="btn ghost sm" title="קוק אן" onclick="stPreview(${i})">👁</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">קיינער מיט אן אפענעם באלאנס</td></tr>'}
  </tbody></table>`;
}
function stAll(v) { stRows().forEach(r => { ui.st.sel[r.c] = v; }); vStmt(); }
function stPage(r) {
  const a = r.a, s = SET(), suf = s.rcptSuffix != null ? s.rcptSuffix : 'הי"ו', ad = rcAddr(a), t = todayS();
  const camp = n => JD.campaigns[n] || '';
  return `<div class="pg">
   <div class="hd"><img src="${location.origin}/logo.png"><div><div class="yn">ישיבה גדולה ומתיבתא תו"י מהרי"ט דסאטמאר</div><div class="ya">Yeshivas Maharit Satmar · P.O. Box 1367 · Monroe NY 10949 · Tel 845.782.1380</div></div></div>
   <div class="row2"><div class="to"><div class="hn">${esc(a.h ? a.h + (suf ? ' ' + suf : '') : '')}</div><div class="en">${esc(a.n)}</div><div class="en">${esc(ad[0])}</div><div class="en">${esc(ad[1])}</div></div>
    <div class="dt"><b>STATEMENT · חשבון</b><br>${rcDate(t)}<br>${HEB.fmtHeb(t)}<br>Account #${r.c}</div></div>
   <div class="ttl">${esc(s.stmtTitle || 'לכבוד ידידינו החשוב')} ${esc(a.h || a.n)} ${esc(suf)}</div>
   <div class="txt">${esc(s.stmtText || STMT_TEXT_DEF).replace(/\n/g, '<br>')}</div>
   <table><thead><tr><th>Date · טאג</th><th>Campaign · קאמפעין</th><th>Pledge · פלעדזש</th><th>Paid · באצאלט</th><th>Balance · באלאנס</th></tr></thead><tbody>
   ${r.L.map(x => `<tr><td>${x[2] ? rcDate(x[2]) : ''}</td><td class="r">${esc(camp(x[6]) || x[7] || '')}</td><td>$${rcMoney(x[3])}</td><td>$${rcMoney(x[4])}</td><td><b>$${rcMoney(x[5])}</b></td></tr>`).join('')}
   </tbody><tfoot><tr><td colspan="4" class="r">סך הכל צו באצאלן · Total due</td><td><b>$${rcMoney(r.bal)}</b></td></tr></tfoot></table>
   <div class="ft">Please make checks payable to <b>Yeshivas Maharit Satmar</b> · P.O. Box 1367 · Monroe NY 10949<br>All contributions are tax deductible · ID #45-4099550</div></div>`;
}
function stDoc(R, autoPrint) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>סטעיטמענטס</title>
<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700;900&display=swap" rel="stylesheet">
<style>
@page{size:letter;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#888}
.pg{position:relative;width:8.5in;height:11in;overflow:hidden;background:#fff;margin:0 auto;padding:.55in .7in;page-break-after:always;break-after:page;color:#2a1a22;font-family:'Times New Roman',serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg:last-child{page-break-after:auto;break-after:auto}
.hd{display:flex;align-items:center;gap:16px;border-bottom:3px solid #660033;padding-bottom:10px;direction:rtl}
.hd img{height:.95in}.yn{font-family:'Frank Ruhl Libre',serif;font-weight:900;font-size:21pt;color:#660033}.ya{font-size:10pt;color:#6b4a58;direction:ltr;text-align:right}
.row2{display:flex;justify-content:space-between;margin-top:.45in}
.to{width:3.4in;font-size:13pt;line-height:1.3}.hn{font-family:'Frank Ruhl Libre',serif;font-size:14pt;direction:rtl;text-align:left}
.dt{text-align:right;font-size:11pt;line-height:1.5;color:#4a3340}.dt b{color:#660033;font-size:12pt}
.ttl{margin-top:.45in;font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:15pt;direction:rtl;text-align:right;color:#660033}
.txt{margin-top:10px;font-family:'Frank Ruhl Libre',serif;font-size:12.5pt;line-height:1.55;direction:rtl;text-align:right}
table{width:100%;border-collapse:collapse;margin-top:.3in;font-size:11.5pt}
th{background:#660033;color:#fff;padding:6px 8px;font-weight:600;font-size:10pt;text-align:left}
td{padding:6px 8px;border-bottom:1px solid #e6d9df}td.r,th:nth-child(2){font-family:'Frank Ruhl Libre',serif}
tfoot td{border:none;border-top:2px solid #660033;font-size:13pt;padding-top:9px}tfoot td.r{text-align:right}
.ft{position:absolute;left:.7in;right:.7in;bottom:.5in;text-align:center;font-size:10pt;color:#6b4a58;border-top:1px solid #e6d9df;padding-top:8px}
@media screen{.pg{margin:16px auto;box-shadow:0 4px 20px rgba(0,0,0,.4)}}@media print{html,body{background:#fff}}
</style></head><body>${R.map(stPage).join('')}
${autoPrint ? `<script>window.onload=function(){(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){window.print()},300)})}<\/script>` : ''}</body></html>`;
}
function stOpen(R, autoPrint) {
  const w = window.open('', '_blank');
  if (!w) { toast('⚠️ דער בראוזער האט בלאקירט דאס נייע פענצטער – ערלויבט Pop-ups פאר דעם וועבסייט'); return false; }
  w.document.open(); w.document.write(stDoc(R, autoPrint)); w.document.close(); return true;
}
function stPreview(i) { const r = window._stR[i]; if (r) stOpen([r], false); }
function stPrint() {
  const sel = stRows().filter(stIsSel); if (!sel.length || !stOpen(sel, true)) return;
  window._stToMark = sel;
  modal(`<h2>🖨️ ${sel.length} סטעיטמענטס</h2><p>זיי האבן זיך געעפנט אין א נייעם פענצטער. ווען עס האט גוט געדרוקט, דריקט דא כדי זיי זאלן אנגעמערקט ווערן אלס געשיקט.</p>
   <p class="sub">💡 Margins = <b>None</b>, Scale = <b>100%</b>.</p>
   <div class="row" style="justify-content:flex-end"><button class="btn ghost" onclick="closeM()">נאך נישט</button><button class="btn" onclick="stMark()">✓ געדרוקט – מערק אן</button></div>`, 'narrow');
}
async function stMark() {
  const L = window._stToMark || [], t = todayS();
  const rows = L.map(r => ({ k: 'stmt', eid: String(r.c), p: { sent: t, bal: r2(r.bal), by: me }, by: me }));
  try {
    for (let i = 0; i < rows.length; i += 500) await q(sb.from('events').insert(rows.slice(i, i + 500)));
    rows.forEach(r => applyEvent({ k: r.k, id: r.eid, p: r.p, by: me }));
    for (const r of L) await emit('hist', uid(), { code: r.c, text: '📄 סטעיטמענט געשיקט – ' + money(r.bal) });
  } catch (e) { toast('⚠️ ' + (e.message || e)); return; }
  ui.st.sel = {}; closeM(); render(); toast('✓ ' + L.length + ' סטעיטמענטס אנגעמערקט');
}
function stExcel() {
  const R = stRows().filter(stIsSel);
  xlsx([{ name: 'סטעיטמענטס', rows: [['#', 'נאמען', 'English', 'טעלעפאן', 'אדרעס', 'שטאט', 'באלאנס', 'פלעדזשעס', 'לעצטע מאל געשיקט']].concat(R.map(r => { const ad = rcAddr(r.a); return [r.c, r.a.h || r.a.n, r.a.n, (r.a.ph[0] || [])[1] || '', ad[0], ad[1], r2(r.bal), r.L.length, stSent(r.c) || '']; })) },
    { name: 'אלע אפענע פלעדזשעס', rows: [['#', 'נאמען', 'פעליג', 'קאמפעין', 'באשרייבונג', 'סכום', 'באצאלט', 'באלאנס']].concat(R.flatMap(r => r.L.map(x => [r.c, r.a.h || r.a.n, x[2], JD.campaigns[x[6]] || '', x[7], r2(x[3]), r2(x[4]), r2(x[5])]))) }], 'statements-' + todayS() + '.xlsx');
}
function stSettings() {
  const s = SET();
  modal(`<h2>⚙️ דער טעקסט פון די סטעיטמענטס</h2>
   <label class="f">שורה אויבן (פאר דעם נאמען)<input id="stt" value="${esc(s.stmtTitle || 'לכבוד ידידינו החשוב')}"></label>
   <label class="f" style="margin-top:10px">דער בריוו<textarea id="stx" rows="6">${esc(s.stmtText || STMT_TEXT_DEF)}</textarea></label>
   <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" onclick="closeM()">צוריק</button><button class="btn" onclick="stSaveSet()">היט אפ</button></div>`, 'narrow');
}
async function stSaveSet() { await emit('settings', 's', { stmtTitle: $('#stt').value.trim(), stmtText: $('#stx').value.trim() }); closeM(); render(); toast('✓ אפגעהיטן'); }
