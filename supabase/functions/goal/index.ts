// YG Fund – 🎯 donor goals (v1.55, owner's idea): a yearly goal per donor (e.g. $26,000 for 5787), a nice e-mail that
// shows how much he gave and how much is left, a personal page with the animation (goal.html?t=<token>), automatic
// e-mails every 2 weeks and a "mazel tov" e-mail when the goal is reached.
// Supabase Edge Function "goal", Verify JWT OFF.
//   GET  ?t=<token>          public: only that donor's goal, total, payments of the goal year (for goal.html)
//   POST {action:'preview'|'send', code, subject?, note?}   team members only (their login token): the e-mail
//   GET  ?run=1              send the automatic e-mails that are due (called daily by GitHub Actions; safe to repeat)
// State: event kind `acct`, field goal = {amt, hy, tok, auto, note, subject, sentAt, won, wonAt} (the whole object is
// always written, because events merge one level deep). E-mail through Gmail (GMAIL_USER / GMAIL_APP_PASSWORD).
import nodemailer from 'npm:nodemailer@6.9.16';

const ENV = (k: string) => (globalThis as any).Deno?.env.get(k) || (globalThis as any).process?.env?.[k] || '';
const SB_URL = () => ENV('SUPABASE_URL');
const SITE = 'https://yeshivasmaharitdsatmar.github.io/';
const BY = '⏰ אויטאמאטיש';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
const money = (n: number) => { const v = Math.round(Number(n || 0) * 100) / 100, c = Math.round(Math.abs(v) * 100) % 100 !== 0; return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: c ? 2 : 0, maximumFractionDigits: 2 }); };
const shortD = (s: string) => { if (!s) return ''; const [y, m, d] = s.split('-'); return +m + '/' + +d + '/' + y.slice(2); };
const todayS = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const daysAgo = (s: string, n: number) => { const d = new Date(s.slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// owner (v1.58): a goal year runs from after Sukkos (24 Tishrei) to Simchas Torah of the next year
const goalHY = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); const p = new Intl.DateTimeFormat('en-u-ca-hebrew', { year: 'numeric', month: 'long', day: 'numeric' }).formatToParts(new Date(y, m - 1, d, 12)); const g = (t: string) => (p.find(x => x.type === t) || { value: '' }).value; const hy = +g('year'); return /^Tishri/.test(g('month')) && +g('day') <= 23 ? hy - 1 : hy; };
// first name only: the Hebrew name without the family name and without titles (מוה"ר, ר', הרה"ח …)
const firstName = (a: any) => { let w = String(a.h || '').trim().split(/\s+/).filter(Boolean); const l = String(a.lh || '').trim().split(/\s+/).filter(Boolean);
  if (l.length && w.slice(-l.length).join(' ') === l.join(' ')) w = w.slice(0, -l.length); else if (w.length > 1 && !l.length) w = w.slice(0, -1);
  const T = /['"׳״]|^(הרב|רבי|הגאון|הרה"ח|מוהר"ר)$/; while (w.length > 1 && T.test(w[0])) w.shift(); return w.join(' ') || a.h || a.n || ''; };
// the yeshiva's name in the owner's font BA Franknatan, as a picture (e-mail programs do not load web fonts)
const NAME_W = 231;
const MAIL_RX = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;
const mailList = (s: any) => String(s || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
function gem(n: number) {
  const L: [number, string][] = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
  n = n % 1000; let s = '';
  while (n > 0) { if (n === 15) { s += 'טו'; break; } if (n === 16) { s += 'טז'; break; } for (const [v, c] of L) if (n >= v) { s += c; n -= v; break; } }
  return s.length === 1 ? s + "'" : s.slice(0, -1) + '"' + s.slice(-1);
}

// ---------- Supabase (service key, server only) ----------
function svc(extra: Record<string, string> = {}) { const k = ENV('SUPABASE_SERVICE_ROLE_KEY'); const h: Record<string, string> = { apikey: k, ...extra }; if (!k.startsWith('sb_')) h.Authorization = 'Bearer ' + k; return h; }
async function rest(path: string, init: any = {}) { const r = await fetch(SB_URL() + path, { ...init, headers: svc(init.headers || {}) }); if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + (await r.text()).slice(0, 200)); return r; }
async function isTeam(auth: string) {
  const key = ENV('SUPABASE_ANON_KEY') || ENV('SUPABASE_PUBLISHABLE_KEY');
  const r = await fetch(SB_URL() + '/rest/v1/team?select=name,email', { headers: { apikey: key, Authorization: auth } });
  if (!r.ok) return null;
  const rows = await r.json(); return rows.length ? rows : null;   // RLS returns rows only to team members
}
const C: any = { ver: -1, JD: null, by: new Map(), lastId: 0, S: { acct: {}, settings: {} } };
async function load() {
  const meta = await (await rest('/rest/v1/jls_meta?id=eq.1&select=version')).json(), ver = meta[0] ? meta[0].version : 0;
  if (ver && ver !== C.ver) {
    const blob = await (await rest('/storage/v1/object/jls/jls.json.gz')).blob();
    C.JD = JSON.parse(await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text());
    C.by = new Map(C.JD.accounts.map((a: any) => [a.c, a])); C.ver = ver;
  }
  for (let g = 0; g < 300; g++) {
    const rows = await (await rest('/rest/v1/events?select=id,k,eid,p&k=in.(acct,settings)&id=gt.' + C.lastId + '&order=id.asc&limit=1000')).json();
    for (const r of rows) { if (!C.S[r.k]) continue; const o = C.S[r.k][r.eid] || (C.S[r.k][r.eid] = {}); Object.assign(o, r.p || {}); }
    if (rows.length) C.lastId = rows[rows.length - 1].id;
    if (rows.length < 1000) break;
  }
}
// one donor's goal with the payments of the goal year (YG payments, refunds left out)
function calc(code: number) {
  const g = (C.S.acct[code] || {}).goal; if (!g || !(+g.amt > 0)) return null;
  const a = C.by.get(code) || { n: '', h: '' }, hy = +g.hy || goalHY(todayS());
  const pays = C.JD.payments.filter((p: any) => +p[1] === code && !p[9] && p[3] > 0 && p[2] && goalHY(p[2]) === hy).map((p: any) => ({ d: p[2], amt: p[3] })).sort((x: any, y: any) => x.d.localeCompare(y.d));
  const given = Math.round(pays.reduce((s: number, p: any) => s + p.amt, 0) * 100) / 100, amt = +g.amt;
  return { code, g, a, hy, year: gem(hy), name: a.h || a.n, first: firstName(a), amt, given, left: Math.max(0, amt - given), pct: Math.min(100, Math.round(given / amt * 100)), pays, won: given >= amt - 0.005 };
}
const emailOf = (code: number) => (((C.S.acct[code] || {}).email) || ((C.by.get(code) || {}).em || [])[0] || '').trim();

// ---------- the e-mail (tables + inline styles, so every mail program shows it the same) ----------
function letter(D: any, o: { subject?: string, note?: string, celebrate?: boolean } = {}) {
  const cel = o.celebrate || D.won, link = SITE + 'goal.html?t=' + encodeURIComponent(D.g.tok || '');
  const subject = (o.subject || '').trim() || (cel ? `🎉 מזל טוב ר' ${D.first} – איר האט דערגרייכט דעם ציל פאר ${D.year}!` : `ר' ${D.first} – 'פרוטה פרוטה מצטרפת' רעפארט · ${D.pct}% פון אייער ציל`);
  const bar = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:12px;overflow:hidden;background:#e9e2cf;height:26px"><tr>${D.pct > 0 ? `<td width="${D.pct}%" style="background:#c9962b;background:linear-gradient(90deg,#e8c05a,#b8892b);height:26px;color:#fff;font:bold 13px Arial;text-align:center">${D.pct >= 12 ? D.pct + '%' : ''}</td>` : ''}${D.pct < 100 ? `<td style="height:26px;font:bold 13px Arial;color:#8a7a55;text-align:center">${D.pct < 12 ? D.pct + '%' : ''}</td>` : ''}</tr></table>`;
  const box = (label: string, val: string, color: string) => `<td width="33%" style="padding:6px"><div style="background:#fff;border:1px solid #e6dfcf;border-radius:12px;padding:12px 6px;text-align:center"><div style="font:bold 22px Arial;color:${color}">${val}</div><div style="font:12px Arial;color:#777;margin-top:2px">${label}</div></div></td>`;
  const html = `<div dir="rtl" style="background:#f3efe2;padding:18px 8px;font-family:Arial,sans-serif;color:#222">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#faf7f0;border-radius:16px;overflow:hidden;border:1px solid #e6dfcf">
  <tr><td style="background:#1d3557;padding:20px;text-align:center;border-bottom:4px solid #c9962b"><img src="${SITE}logo.png" width="84" alt="" style="display:block;margin:0 auto 6px"><img src="${SITE}yeshiva-name.png" width="${NAME_W}" alt="ישיבת מהרי&quot;ט ד'סאטמאר" style="display:block;margin:0 auto;border:0;color:#f4d48a;font:bold 20px Arial"></td></tr>
  <tr><td style="padding:22px 22px 6px;text-align:center">
   <div style="font:bold 20px Arial;color:#1d3557;line-height:1.5">מע"כ ידידינו הרה"ח ר' ${esc(D.first)} שיחי'${cel ? '' : ` – 'פרוטה פרוטה מצטרפת' רעפארט`}</div>
   ${cel ? '<div style="font:bold 22px Arial;color:#2e7d4f;margin-top:6px">🎉 מזל טוב! איר האט דערגרייכט דעם ציל!</div>' : ''}
   <div style="font:14px Arial;color:#555;margin-top:6px">אייער ציל פאר יאר ${D.year}: <b>${money(D.amt)}</b></div></td></tr>
  <tr><td style="padding:12px 22px">${bar}</td></tr>
  <tr><td style="padding:0 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${box('שוין געגעבן', money(D.given), '#2e7d4f')}${box(cel ? 'איבערן ציל' : 'נאך ביזן ציל', money(cel ? D.given - D.amt : D.left), cel ? '#2e7d4f' : '#b8892b')}${box('דער ציל', money(D.amt), '#1d3557')}</tr></table></td></tr>
  ${cel ? '' : `<tr><td style="padding:12px 22px 0;font:15px Arial;line-height:1.7;color:#333;text-align:center">יעדע איינציגע נדבה געבט אונז חיזוק אנצוגיין, און עס העלפט אייך ענדיגן אויסצאלן אייער ציל בעז"ה! זכות החזקת התורה וועט אייך זיכער ביישטיין.</td></tr>`}
  ${(o.note || '').trim() ? `<tr><td style="padding:12px 22px;font:15px Arial;line-height:1.6;color:#333">${esc(o.note).replace(/\n/g, '<br>')}</td></tr>` : ''}
  <tr><td style="padding:14px 22px;text-align:center"><a href="${link}" style="display:inline-block;background:#1d3557;color:#fff;text-decoration:none;font:bold 16px Arial;padding:13px 26px;border-radius:30px">🎬 זעט אייער חשבון</a></td></tr>
  <tr><td style="padding:0 22px 14px;text-align:center;font:12px Arial;color:#888">אלע באצאלונגען זעט מען אינעם חשבון (דער קנעפל אויבן)</td></tr>
  <tr><td style="background:#1d3557;color:#cfd8e6;font:12px Arial;text-align:center;padding:14px">א הארציגן יישר כח פאר אייער גרויסע שטיצע · Yeshiva Mesivta Torah V'Yirah Maharit D'Satmar</td></tr>
 </table></div>`;
  return { subject, html };
}
async function sendMail(to: string, subject: string, html: string, cc = '') {
  const gUser = ENV('GMAIL_USER'), gPass = ENV('GMAIL_APP_PASSWORD').replace(/\s+/g, '');
  if (!gUser || !gPass) throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD are not set');
  const from = ENV('EMAIL_FROM') || 'Yeshivas Maharit Satmar <' + gUser + '>';
  const tr = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: gUser, pass: gPass }, connectionTimeout: 12000, greetingTimeout: 8000, socketTimeout: 15000 });
  await tr.sendMail({ from, to, subject, html, ...(cc ? { cc } : {}) });
}
async function record(D: any, patch: any, by: string, text: string) {
  const goal = Object.assign({}, D.g, patch);
  await rest('/rest/v1/events', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify([
    { k: 'acct', eid: String(D.code), p: { goal }, by }, { k: 'hist', eid: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), p: { code: D.code, text }, by }]) });
  C.S.acct[D.code] = Object.assign(C.S.acct[D.code] || {}, { goal });
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  try {
    if (req.method === 'GET' && url.searchParams.get('t')) {   // the personal page – only this one donor's goal
      const t = url.searchParams.get('t') || '';
      if (!/^[A-Za-z0-9]{20,64}$/.test(t)) return json({ error: 'not found' }, 404);
      await load();
      const code = Object.keys(C.S.acct).map(Number).find(c => ((C.S.acct[c] || {}).goal || {}).tok === t);
      const D = code ? calc(code) : null; if (!D) return json({ error: 'not found' }, 404);
      return json({ name: D.name, year: D.year, amt: D.amt, given: D.given, left: D.left, pct: D.pct, won: D.won, pays: D.pays.map((p: any) => ({ d: shortD(p.d), amt: p.amt })) });
    }
    if (req.method === 'GET' && url.searchParams.get('run') === '1') {   // automatic e-mails
      await load();
      const t = todayS(), cut = daysAgo(t, -14), sent: any[] = [], errors: any[] = [];
      for (const c of Object.keys(C.S.acct).map(Number)) {
        const g = (C.S.acct[c] || {}).goal; if (!g || !(+g.amt > 0) || !g.tok) continue;
        const D = calc(c); if (!D) continue;
        const to = emailOf(c); if (!to) continue;
        const celebrate = D.won && !g.won, due = g.auto && !D.won && (!g.sentAt || g.sentAt.slice(0, 10) <= cut);
        if (!celebrate && !due) continue;
        try {
          const m = letter(D, { note: celebrate ? '' : g.note, celebrate });
          const cc = mailList(g.cc).filter(x => MAIL_RX.test(x)).join(', ');
          await sendMail(to, m.subject, m.html, cc);
          await record(D, celebrate ? { won: true, wonAt: t, sentAt: new Date().toISOString() } : { sentAt: new Date().toISOString() }, BY, (celebrate ? '🎉 ציל דערגרייכט – אימעיל געשיקט צו ' : '🎯 ציל אימעיל (אויטאמאטיש) צו ') + to);
          sent.push(celebrate ? 'won' : 'auto');
        } catch (e) { errors.push(String((e as any)?.message || e).slice(0, 120)); }
      }
      return json({ sent: sent.length, errors });
    }
    if (req.method === 'POST') {   // preview / send from the app
      const auth = req.headers.get('authorization') || '';
      const team = auth.startsWith('Bearer ') ? await isTeam(auth) : null; if (!team) return json({ error: 'not allowed' }, 403);
      const b = await req.json().catch(() => ({}));
      await load();
      const D = calc(+b.code); if (!D) return json({ error: 'no goal for this account' }, 400);
      if (!D.g.tok) return json({ error: 'no link yet – save the goal first' }, 400);
      const m = letter(D, { subject: b.subject, note: b.note != null ? b.note : D.g.note });
      if (b.action === 'preview') return json({ subject: m.subject, html: m.html, to: emailOf(D.code), cc: D.g.cc || '', pct: D.pct, given: D.given });
      const to = String(b.to || emailOf(D.code)).trim(); if (!MAIL_RX.test(to)) return json({ error: 'no e-mail address' }, 400);
      const ccL = mailList(b.cc), bad = ccL.find(x => !MAIL_RX.test(x)); if (bad) return json({ error: 'bad CC address: ' + bad }, 400);
      const cc = ccL.join(', ');
      await sendMail(to, m.subject, m.html, cc);
      await record(D, { sentAt: new Date().toISOString(), won: D.won || D.g.won || false }, String(b.by || 'app'), '🎯 ציל אימעיל געשיקט צו ' + to + (cc ? ' (CC ' + cc + ')' : '') + ' (' + D.pct + '%)');
      return json({ ok: true, to });
    }
    return json({ app: 'YG Fund goals', gmail: ENV('GMAIL_USER') ? 'set' : 'missing' });
  } catch (e) { return json({ error: String((e as any)?.message || e) }, 500); }
}
if ((globalThis as any).Deno) (globalThis as any).Deno.serve(handle);
