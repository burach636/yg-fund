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
function rcData(p) {
  const a = IDX.by.get(p[1]) || { n: '', h: '', a: '' }, s = SET(), suf = s.rcptSuffix != null ? s.rcptSuffix : 'הי"ו';
  const heb = a.h ? a.h + (suf ? ' ' + suf : '') : '';
  return { key: rcKey(p), code: p[1], date: p[2], amt: p[3], heb, top: heb || a.n, eng: a.n, addr: rcAddr(a), by: s.rcptBy || p[7] || '' };
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
  return JD.payments.filter(p => validD(p[2]) && p[2] >= r.from && p[2] <= r.to && !p[9] && p[3] > 0 && IDX.by.has(p[1]) && (!r.hide || !rcPrinted(p)))
    .sort((a, b) => a[2].localeCompare(b[2]) || acctName(a[1]).localeCompare(acctName(b[1]), 'he'));
}
const rcIsSel = p => { const v = ui.rc.sel[rcKey(p)]; return v === undefined ? !rcPrinted(p) : v; };
function vRcpt() {
  const L = rcList(), r = ui.rc, { F, prev, cur } = rcPeriods(), s = SET();
  const sel = L.filter(rcIsSel), total = sel.reduce((t, p) => t + p[3], 0);
  const unprintedAll = JD.payments.filter(p => validD(p[2]) && p[2] >= F.start && !p[9] && p[3] > 0 && IDX.by.has(p[1]) && !rcPrinted(p)).length;
  window._rcL = L;
  $('#main').innerHTML = `<div class="row"><div><h2>🧾 רעסיטס</h2><p class="sub">קלייבט פון ווען ביז ווען, קוקט איבער די ליסטע, און דריקט "פרינט". יעדע רעסיט איז א בלאט (Letter). נאכן דרוקן מערקט מען זיי אן אלס געדרוקט, כדי זיי זאלן נישט ארויסקומען נאכאמאל.</p></div><div class="spacer"></div>
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
   <td class="num"><b>${money(p[3])}</b></td><td style="font-size:13px">${a.a ? `<span class="ltr">${esc(a.a)}</span>` : '<span class="tag late">⚠️ קיין אדרעס</span>'}</td><td style="font-size:12px">${esc(d.by)}</td>
   <td>${rcPrinted(p) ? `<span class="tag ok">✓ געדרוקט ${fmtD(rcPrinted(p))}</span>` : ''} <button class="btn ghost sm" title="קוק אן" onclick="rcPreview(${i})">👁</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">קיין נדבות אין די טעג</td></tr>'}
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
    const left = JD.payments.some(p => validD(p[2]) && p[2] >= x.rc.from && p[2] <= x.rc.to && !p[9] && p[3] > 0 && IDX.by.has(p[1]) && !rcPrinted(p));
    if (!left) await emitTask(id, { done: true, doneAt: t });
  }
  ui.rc.sel = {}; closeM(); render(); toast('✓ ' + L.length + ' רעסיטס אנגעמערקט אלס געדרוקט');
}
function rcExcel() {
  const L = rcList().filter(rcIsSel);
  xlsx([{ name: 'רעסיטס', rows: [['טאג', 'טאג (אידיש)', '#', 'נאמען', 'English', 'סכום', 'אדרעס', 'שטאט', 'Received by', 'געדרוקט']].concat(L.map(p => { const d = rcData(p); return [p[2], hebD(p[2]), p[1], d.heb, d.eng, r2(p[3]), d.addr[0], d.addr[1], d.by, rcPrinted(p) || '']; })) }], 'receipts-' + ui.rc.from + '-' + ui.rc.to + '.xlsx');
}
function rcSettings() {
  const s = SET();
  modal(`<h2>⚙️ רעסיטס איינשטעלונגען</h2><div class="grid2">
   <label class="f">"Received by" (ליידיג = דער סאליסיטאר פון JLS)<input id="rsb" value="${esc(s.rcptBy || '')}"></label>
   <label class="f">נאכן נאמען (למשל הי"ו)<input id="rss" value="${esc(s.rcptSuffix != null ? s.rcptSuffix : 'הי"ו')}"></label>
   <label class="f">ווער באקומט די To-Do יעדע 2 וואכן<select id="rsw">${USERS().map(u => `<option ${u === rcWho() ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label></div>
   <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" onclick="closeM()">צוריק</button><button class="btn" onclick="rcSaveSet()">היט אפ</button></div>`, 'narrow');
}
async function rcSaveSet() {
  await emit('settings', 's', { rcptBy: $('#rsb').value.trim(), rcptSuffix: $('#rss').value.trim(), rcptWho: $('#rsw').value });
  closeM(); render(); toast('✓ אפגעהיטן');
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
