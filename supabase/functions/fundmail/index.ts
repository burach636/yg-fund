// YG Fund – automatic e-mail to the office: checks for the fundraisers' % of the 2 weeks that just ended.
// Supabase Edge Function "fundmail", Verify JWT OFF, called once a day by pg_cron with header x-cron-key = FUNDMAIL_KEY.
// It sends only when: setting frAuto is on, the last 2-week period ended at least frAutoDays days ago, the office
// address (frOffice) is set, and that period was not e-mailed yet (event kind `frmail`). Safe to call many times.
// ?dry=1 (with the key) returns what it would send, without sending.
import nodemailer from 'npm:nodemailer@6.9.16';
import { XLSX } from './xlsx.js';   // copy of the app's xlsx.js writer

const ENV = (k: string) => (globalThis as any).Deno?.env.get(k) || (globalThis as any).process?.env?.[k] || '';
const SB = () => ENV('SUPABASE_URL');
function svc(extra: Record<string, string> = {}) { const k = ENV('SUPABASE_SERVICE_ROLE_KEY'); const h: Record<string, string> = { apikey: k, ...extra }; if (!k.startsWith('sb_')) h.Authorization = 'Bearer ' + k; return h; }
async function rest(path: string, init: any = {}) { const r = await fetch(SB() + path, { ...init, headers: svc(init.headers || {}) }); if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + (await r.text()).slice(0, 200)); return r; }
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

// ---------- dates (New York) ----------
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayS = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5);
const validD = (s: string) => !!s && s >= '1990-01-01' && s <= '2100-01-01';
const money = (n: number) => { const v = Math.round(n || 0); return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US'); };
const r2 = (n: number) => Math.round((+n || 0) * 100) / 100;
const HM: Record<string, string> = { Tishri: 'תשרי', Heshvan: 'חשון', Kislev: 'כסלו', Tevet: 'טבת', Shevat: 'שבט', 'Adar I': "אדר א'", 'Adar II': "אדר ב'", Adar: 'אדר', Nisan: 'ניסן', Iyar: 'אייר', Sivan: 'סיון', Tamuz: 'תמוז', Av: 'אב', Elul: 'אלול' };
const hfmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { year: 'numeric', month: 'long', day: 'numeric' });
function gem(n: number) {
  const L: [number, string][] = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
  n = n % 1000; let s = '';
  while (n > 0) { if (n === 15) { s += 'טו'; break; } if (n === 16) { s += 'טז'; break; } for (const [v, c] of L) if (n >= v) { s += c; n -= v; break; } }
  return s.length === 1 ? s + "'" : s.slice(0, -1) + '"' + s.slice(-1);
}
const hebD = (s: string) => { if (!validD(s)) return ''; const [y, m, d] = s.split('-').map(Number); const p = hfmt.formatToParts(new Date(y, m - 1, d, 12)); const g = (t: string) => (p.find(x => x.type === t) || {} as any).value; return gem(+g('day')) + ' ' + (HM[g('month')] || g('month')) + ' ' + gem(+g('year')); };
const hebYear = (s: string) => { const [y, m, d] = s.split('-').map(Number); return +((hfmt.formatToParts(new Date(y, m - 1, d, 12)).find(x => x.type === 'year') || {} as any).value || 0); };
const frDay = (s: string) => { const [y, m, d] = s.split('-'); return hebD(s) + ' (' + +m + '/' + +d + '/' + y + ')'; };

// ---------- data ----------
async function loadAll() {
  const blob = await (await rest('/storage/v1/object/jls/jls.json.gz')).blob();
  const JD = JSON.parse(await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text());
  const S: any = { task: {}, fr: {}, frin: {}, frex: {}, frexp: {}, frmail: {}, settings: { s: {} } };
  let last = 0;
  for (let g = 0; g < 500; g++) {
    const rows = await (await rest('/rest/v1/events?select=id,k,eid,p&k=in.(task,fr,frin,frex,frexp,frmail,settings)&id=gt.' + last + '&order=id.asc&limit=1000')).json();
    for (const r of rows) { const cur = S[r.k][r.eid] || (S[r.k][r.eid] = {}); Object.assign(cur, r.p); }
    if (rows.length) last = rows[rows.length - 1].id;
    if (rows.length < 1000) break;
  }
  return { JD, S };
}
function fundCalc(JD: any, S: any) {   // same rules as fundCalc() in sections.js
  const s = S.settings.s || {}, pct = s.frPct != null ? +s.frPct : 40, start = s.frStart || '2026-09-12', t = todayS();
  const income: any[] = [];
  JD.payments.forEach((p: any) => { if (validD(p[2]) && p[2] >= start && p[2] <= t && !p[9]) income.push({ d: p[2], amt: p[3], code: p[1], src: 'JLS' }); });
  Object.values(S.frin).forEach((x: any) => { if (!x.del && x.date >= start) income.push({ d: x.date, amt: +x.amt || 0, note: x.note, src: 'app' }); });
  const exempt = Object.values(S.frex).filter((x: any) => !x.del && x.date >= start) as any[];
  const expenses = Object.values(S.frexp).filter((x: any) => !x.del && validD(x.date)) as any[];   // dinner expenses, by Jewish year
  const paid = Object.values(S.fr).filter((x: any) => !x.del) as any[];
  const periods: any[] = [];
  if (t >= start) { const n = Math.floor(daysBetween(start, t) / 14); for (let k = 0; k <= n; k++) periods.push({ k, from: addDays(start, 14 * k), to: addDays(start, 14 * k + 13), income: 0, count: 0, ex: 0, exp: 0, owed: 0, paid: 0 }); }
  income.forEach(i => { const p = periods[Math.floor(daysBetween(start, i.d) / 14)]; if (p) { p.income += i.amt; p.count++; } });
  exempt.forEach(e => { const p = periods[Math.floor(daysBetween(start, e.date) / 14)]; if (p) p.ex += +e.amt || 0; });
  // the year's income first covers that year's dinner expenses (same as fundCalc in sections.js)
  const left: Record<number, number> = {};
  expenses.forEach(e => { const y = +e.hy || hebYear(e.date); left[y] = (left[y] || 0) + (+e.amt || 0); });
  periods.forEach(p => { const y = hebYear(p.from), base = p.income - p.ex, ded = Math.min(Math.max(base, 0), left[y] || 0); p.exp = ded; left[y] = (left[y] || 0) - ded; p.owed = (base - ded) * pct / 100; p.paid = paid.filter(x => x.date >= p.from && x.date <= p.to).reduce((a, x) => a + (+x.amt || 0), 0); });
  const totPaid = paid.reduce((a, x) => a + (+x.amt || 0), 0);
  return { pct, start, income, periods, balance: periods.reduce((a, p) => a + p.owed, 0) - totPaid };
}
const SUBJ_DEF = 'טשעקס פאר די פאנדרעיזערס – {from} ביז {to}: {amount}';
const BODY_DEF = 'שלום,\n\nביטע מאכט טשעקס פאר די פאנדרעיזערס פאר די 2 וואכן {from} ביז {to}:\n\nאריינגעקומען: {income} ({count} באצאלונגען)\nאן פראצענט: {exempt}\nדינער עקספענסעס: {expenses}\n{pct}% פאר די פאנדרעיזערס: {amount}\n\nשוין באצאלט פאר די 2 וואכן: {paid}\nסך הכל נאך שולדיג ביז היינט: {balance}\n\nבייגעלייגט איז אן Excel מיט די נדבנים און זייערע נדבות פון די 2 וואכן.\n\nא דאנק,\nYG Fund';
const fill = (t: string, F: any, p: any) => { const v: any = { from: frDay(p.from), to: frDay(p.to), count: p.count, income: money(p.income), exempt: money(p.ex), expenses: money(p.exp || 0), pct: F.pct, amount: money(p.owed), paid: money(p.paid), balance: money(F.balance) }; return t.replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m); };
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
function b64(u: Uint8Array) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }

async function send(to: string, cc: string, subject: string, html: string, att: { filename: string, content: string }) {
  const toList = to.split(/[,;\s]+/).filter(Boolean), ccList = cc.split(/[,;\s]+/).filter(Boolean);
  const gUser = ENV('GMAIL_USER'), gPass = ENV('GMAIL_APP_PASSWORD').replace(/\s+/g, '');
  const from = ENV('EMAIL_FROM') || 'Yeshivas Maharit Satmar <' + gUser + '>';
  if (gUser && gPass) {
    const tr = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: gUser, pass: gPass }, connectionTimeout: 12000, greetingTimeout: 8000, socketTimeout: 15000 });
    await tr.sendMail({ from, to: toList.join(', '), ...(ccList.length ? { cc: ccList.join(', ') } : {}), subject, html, attachments: [{ filename: att.filename, content: att.content, encoding: 'base64', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }] });
    return;
  }
  if (ENV('BREVO_API_KEY')) {
    const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/), sender = m ? { name: m[1], email: m[2] } : { email: from };
    const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': ENV('BREVO_API_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify({ sender, to: toList.map(email => ({ email })), ...(ccList.length ? { cc: ccList.map(email => ({ email })) } : {}), subject, htmlContent: html, attachment: [{ name: att.filename, content: att.content }] }) });
    if (!r.ok) throw new Error('brevo ' + r.status + ' ' + (await r.text()).slice(0, 200)); return;
  }
  if (ENV('RESEND_API_KEY')) {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + ENV('RESEND_API_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: toList, ...(ccList.length ? { cc: ccList } : {}), subject, html, attachments: [{ filename: att.filename, content: att.content }] }) });
    if (!r.ok) throw new Error('resend ' + r.status + ' ' + (await r.text()).slice(0, 200)); return;
  }
  throw new Error('no e-mail provider is set');
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url), key = ENV('FUNDMAIL_KEY');
  if (!key || (req.headers.get('x-cron-key') || url.searchParams.get('key')) !== key) return json({ error: 'forbidden' }, 403);
  const dry = url.searchParams.get('dry') === '1';
  try {
    const { JD, S } = await loadAll(), s = S.settings.s || {}, F = fundCalc(JD, S), n = F.periods.length, t = todayS();
    if (n < 2) return json({ skipped: 'no finished 2-week period yet' });
    const p = F.periods[n - 2], days = s.frAutoDays != null ? +s.frAutoDays : 2;
    const info = { period: p.from + '..' + p.to, amount: r2(p.owed), count: p.count, sendFrom: addDays(p.to, days), auto: !!s.frAuto, office: s.frOffice || '', cc: s.frCc || '' };
    if (!s.frAuto && !dry) return json({ skipped: 'automatic sending is off', ...info });
    if ((S.frmail[p.from] || {}).sent) return json({ skipped: 'already sent ' + S.frmail[p.from].sent, ...info });
    if (t < addDays(p.to, days) && !dry) return json({ skipped: 'too early', ...info });
    if (!s.frOffice) return json({ skipped: 'no office e-mail', ...info });
    const subject = fill(s.frMailSubject || SUBJ_DEF, F, p), body = fill(s.frMailBody || BODY_DEF, F, p);
    if (dry) return json({ dry: true, subject, body, ...info });
    const by = new Map(JD.accounts.map((a: any) => [a.c, a]));
    const L = F.income.filter((i: any) => i.d >= p.from && i.d <= p.to).sort((a: any, b: any) => a.d.localeCompare(b.d));
    const rows = [['טאג', 'טאג (אידיש)', '#', 'נאמען', 'English', 'סכום', F.pct + '%', 'פון']].concat(L.map((i: any) => { const a: any = i.code ? by.get(i.code) : null; return [i.d, hebD(i.d), i.code || '', a ? (a.h || a.n) : (i.note || ''), a ? a.n : '', r2(i.amt), r2(i.amt * F.pct / 100), i.src === 'JLS' ? 'JLS' : 'מאנועל']; }));
    const dm = new Map<any, any>();
    L.forEach((i: any) => { const k = i.code || ('~' + (i.note || '')); const o = dm.get(k) || { code: i.code, note: i.note, n: 0, t: 0, dates: [] }; o.n++; o.t += i.amt; o.dates.push(i.d); dm.set(k, o); });
    const drows = [['#', 'נאמען', 'English', 'טעלעפאן', 'וויפיל נדבות', 'סך הכל', F.pct + '%', 'טעג']].concat([...dm.values()].sort((a: any, b: any) => b.t - a.t).map((o: any) => { const a: any = o.code ? by.get(o.code) : null; return [o.code || '', a ? (a.h || a.n) : (o.note || 'אריינקומען'), a ? a.n : '', a && a.ph && a.ph[0] ? a.ph[0][1] : '', o.n, r2(o.t), r2(o.t * F.pct / 100), o.dates.sort().join(', ')]; }));
    const blob = XLSX.make([
      { name: 'סך הכל', rows: [['', 'סכום'], ['פון', p.from], ['ביז', p.to], ['באצאלונגען', p.count], ['אריינגעקומען', r2(p.income)], ['אן פראצענט', r2(p.ex)], ['דינער עקספענסעס (אראפגערעכנט)', r2(p.exp || 0)], [F.pct + '% פאר די פאנדרעיזערס', r2(p.owed)], ['שוין באצאלט פאר די 2 וואכן', r2(p.paid)], ['נאך שולדיג ביז היינט', r2(F.balance)]], widths: [32, 18] },
      { name: 'נדבנים', rows: drows },
      { name: 'באצאלונגען', rows }]);
    const html = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">' + esc(body).replace(/\n/g, '<br>') + '</div>';
    await send(s.frOffice, s.frCc || '', subject, html, { filename: 'Fundraisers-' + p.from + '-' + p.to + '.xlsx', content: b64(new Uint8Array(await blob.arrayBuffer())) });
    const ev = [{ k: 'frmail', eid: p.from, p: { sent: t, to: s.frOffice, cc: s.frCc || '', amount: r2(p.owed), by: '⏰ אויטאמאטיש', auto: true }, by: '⏰ אויטאמאטיש' }];
    if (S.task['frmail-' + p.from] && !S.task['frmail-' + p.from].done) ev.push({ k: 'task', eid: 'frmail-' + p.from, p: { done: true, doneAt: t } as any, by: '⏰ אויטאמאטיש' });
    await rest('/rest/v1/events', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(ev) });
    return json({ sent: true, ...info });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
}

if ((globalThis as any).Deno) (globalThis as any).Deno.serve(handle);
export { handle };
