// YG Fund – SMS bot (Supabase Edge Function "sms").
// The owner texts from a basic (kosher) phone; this answers with donor info and adds to-dos.
// Works with Telnyx (JSON webhook, reply through the Telnyx API) or Twilio (form webhook, TwiML reply).
// Only team members whose phone is saved in table `team` get an answer.
//
// Secrets (Supabase > Edge Functions > Secrets), never in the repo:
//   Telnyx: TELNYX_API_KEY, TELNYX_PUBLIC_KEY      Twilio: TWILIO_AUTH_TOKEN
// Deploy with "Verify JWT" OFF (the phone company cannot send a Supabase login).

const ENV = (k: string) => (globalThis as any).Deno?.env.get(k) || (globalThis as any).process?.env?.[k] || '';
const SB_URL = () => ENV('SUPABASE_URL');
const SB_KEY = () => ENV('SUPABASE_SERVICE_ROLE_KEY') || ENV('SB_SECRET_KEY');
const TZ = 'America/New_York';
const MAX_REPLY = 480;   // ~7 Hebrew SMS parts

// ---------- small helpers ----------
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayS = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const addMonths = (s: string, n: number) => { const d = parse(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return iso(d); };
const validD = (s: string) => !!s && s >= '1990-01-01' && s <= '2100-01-01';
const money = (n: number) => '$' + Math.round(n || 0).toLocaleString('en-US');
const shortD = (s: string) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return +m + '/' + +d + '/' + y.slice(2); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const digits10 = (p: string) => String(p || '').replace(/\D/g, '').slice(-10);
const FREQM: Record<string, number> = { m1: 1, m3: 3, m6: 6, m12: 12 };
const hebFmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { month: 'long', day: 'numeric' });
const YT = [['Elul', 1], ['Kislev', 10], ['Adar', 1], ['Adar II', 1], ['Nisan', 1]];
function nextYomTov(from: string) {
  const d = parse(addDays(from, 14));
  for (let i = 0; i < 400; i++) {
    const p = hebFmt.formatToParts(d), mo = (p.find(x => x.type === 'month') || {} as any).value, dy = +(p.find(x => x.type === 'day') || {} as any).value;
    if (YT.some(t => t[0] === mo && t[1] === dy)) return iso(d);
    d.setDate(d.getDate() + 1);
  }
  return addMonths(from, 3);
}
const addFreq = (s: string, f: string) => f === 'yt' ? nextYomTov(s) : (FREQM[f] ? addMonths(s, FREQM[f]) : null);

// ---------- Supabase REST (service key; this runs on the server only) ----------
function sbHeaders(extra: Record<string, string> = {}) {
  const k = SB_KEY(), h: Record<string, string> = { apikey: k, ...extra };
  if (!k.startsWith('sb_')) h.Authorization = 'Bearer ' + k;   // legacy JWT key
  return h;
}
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(SB_URL() + path, { ...init, headers: sbHeaders((init.headers || {}) as Record<string, string>) });
  if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r;
}

// ---------- data cache (kept while the function stays warm) ----------
const C: any = { jlsVer: -1, JD: null, IDX: null, lastId: 0, S: { acct: {}, task: {}, call: {}, hist: {}, shul: {}, settings: { s: { defFreq: 'm12', maxYears: 5 } } } };
async function load() {
  const meta = await (await rest('/rest/v1/jls_meta?id=eq.1&select=version')).json();
  const ver = meta[0] ? meta[0].version : 0;
  if (ver && ver !== C.jlsVer) {
    const blob = await (await rest('/storage/v1/object/jls/jls.json.gz')).blob();
    const txt = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    C.JD = JSON.parse(txt); C.jlsVer = ver; buildIndex();
  }
  for (let g = 0; g < 200; g++) {
    const rows = await (await rest('/rest/v1/events?select=id,k,eid,p,by,at&id=gt.' + C.lastId + '&order=id.asc&limit=1000')).json();
    for (const r of rows) {
      if (!C.S[r.k]) continue;
      const cur = C.S[r.k][r.eid] || (C.S[r.k][r.eid] = {});
      Object.assign(cur, r.p);
      if (r.k === 'hist') { cur.by = r.by; cur.at = r.at; }
    }
    if (rows.length) C.lastId = rows[rows.length - 1].id;
    if (rows.length < 1000) break;
  }
}
function buildIndex() {
  const by = new Map(), yg = new Map(), pl = new Map(), today = todayS();
  const prank = (d: string) => { d = (d || '').toLowerCase(); if (/cel|mobile|סעל/.test(d)) return /mother|wife|מאמע/.test(d) ? 1 : 0; if (/home|היים/.test(d)) return 2; return 3; };
  for (const a of C.JD.accounts) {
    a.ph.sort((x: any, y: any) => prank(x[0]) - prank(y[0]));
    a._s = (a.n + ' ' + a.h + ' ' + a.w + ' ' + a.wh + ' ' + a.a + ' #' + a.c + ' ' + a.ph.map((p: any) => p[1] + ' ' + p[1].replace(/\D/g, '')).join(' ')).toLowerCase();
    by.set(a.c, a);
  }
  for (const p of C.JD.payments) {
    const [, code, date, amt] = p;
    let g = yg.get(code); if (!g) yg.set(code, g = { total: 0, count: 0, last: '', lastAmt: 0, list: [] });
    g.total += amt; g.count++; g.list.push(p);
    if (validD(date) && date <= today && date > g.last) { g.last = date; g.lastAmt = amt; }
  }
  const eom = (() => { const d = parse(today); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); })();
  for (const c of C.JD.pledges) {
    const [, code, due, amt, , bal, , , , hold] = c;
    let g = pl.get(code); if (!g) pl.set(code, g = { open: 0, dueNow: 0, total: 0 });
    g.total += amt;
    if (!hold && bal > 0.009) { g.open += bal; if (!due || due <= eom) g.dueNow += bal; }
  }
  C.IDX = { by, yg, pl };
}
const SET = () => C.S.settings.s || {};
function ask(code: number) {
  const st = C.S.acct[code] || {}, g = C.IDX.yg.get(code), set = SET();
  const freq = st.freq || (!g ? 'none' : (set.skipOnce && g.count === 1 ? 'once' : set.defFreq || 'm12'));
  let next = st.nextAsk || null;
  if (!next && freq !== 'none' && freq !== 'once' && g && g.last) {
    if (g.last >= addMonths(todayS(), -12 * (+set.maxYears || 5))) next = addFreq(g.last, freq);
  }
  return { freq, next, st };
}
const nm = (a: any) => a.h || a.n;
async function addEvents(rows: any[], by: string) {
  await rest('/rest/v1/events', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(rows.map(r => ({ ...r, by }))) });
}

// ---------- find a donor by name / phone / #number ----------
function find(q: string) {
  q = q.trim().toLowerCase();
  const num = q.replace(/^#/, '');
  if (/^\d{1,7}$/.test(num) && C.IDX.by.has(+num)) return [C.IDX.by.get(+num)];
  const words = q.split(/\s+/).filter(Boolean), qd = q.replace(/\D/g, '');
  let L = C.JD.accounts.filter((a: any) => (words.length && words.every(w => a._s.includes(w))) || (qd.length >= 7 && a._s.includes(qd)));
  L.sort((x: any, y: any) => ((C.IDX.yg.get(y.c) || {}).total || 0) - ((C.IDX.yg.get(x.c) || {}).total || 0));
  return L;
}
function pickOne(q: string): { a?: any, msg?: string } {
  if (!q.trim()) return { msg: 'שרייבט א נאמען נאכן ווארט.' };
  const L = find(q);
  if (!L.length) return { msg: 'נישט געפונען: ' + q };
  if (L.length === 1) return { a: L[0] };
  // exact Hebrew/English full-name match wins
  const ex = L.filter((a: any) => [a.h, a.n].some(v => (v || '').toLowerCase().endsWith(q.trim().toLowerCase())));
  if (ex.length === 1) return { a: ex[0] };
  return { msg: L.length + ' געפונען, שיקט נאכאמאל מיט דעם #נומער:\n' + L.slice(0, 6).map((a: any) => '#' + a.c + ' ' + nm(a) + (a.a ? ', ' + a.a.split(',')[0] : '')).join('\n') };
}

// ---------- commands ----------
const CMDS: [string[], string][] = [
  [['טעלעפאן', 'טעל', 'phone', 'tel', 'p'], 'phone'],
  [['אדרעס', 'address', 'addr', 'a'], 'address'],
  [['באלאנס', 'balance', 'bal', 'b'], 'balance'],
  [['אינפא', 'info', 'i'], 'info'],
  [['געגעבן', 'given', 'gave', 'g'], 'given'],
  [['היינט', 'today', 't'], 'today'],
  [['פלעדזשעס', 'pledges', 'pl'], 'pledges'],
  [['געקאלט', 'called', 'c'], 'called'],
  [['טאדו', 'טודו', 'todo', 'td', '+'], 'todo'],
  [['נאטיץ', 'note', 'n'], 'note'],
  [['שול', 'shul'], 'shul'],
  [['הילף', 'help', '?', 'h'], 'help']
];
const HELP = 'YG Fund SMS:\n' +
  'נאמען - אלע אינפא\n' +
  'טעלעפאן נאמען\n' +
  'אדרעס נאמען\n' +
  'געגעבן נאמען - נדבות לעצטע יאר\n' +
  'באלאנס נאמען\n' +
  'היינט - מיינע To-Do\n' +
  'פלעדזשעס\n' +
  'געקאלט נאמען\n' +
  'טאדו טעקסט - נייע To-Do\n' +
  'נאטיץ נאמען: טעקסט\n' +
  'שול';

async function answer(text: string, member: any): Promise<string> {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return HELP;
  let cmd = 'info', rest = t;
  if (t.startsWith('+')) { cmd = 'todo'; rest = t.slice(1); }
  else {
    const first = t.split(' ')[0].toLowerCase();
    const hit = CMDS.find(([ws]) => ws.includes(first));
    if (hit) { cmd = hit[1]; rest = t.slice(first.length); }
  }
  rest = rest.trim();
  const me = member.name, today = todayS();
  if (cmd === 'help') return HELP;

  if (cmd === 'todo') {
    if (!rest) return 'שרייבט: טאדו און וואס צו טון';
    await addEvents([{ k: 'task', eid: uid(), p: { title: rest, due: today, who: me, who2: '', code: '', pri: 'norm', note: '📱 SMS', repeat: '', done: false, priv: false } }], me);
    return '✓ צוגעלייגט צו To-Do: ' + rest;
  }
  if (cmd === 'note') {
    const i = rest.indexOf(':');
    if (i < 1) return 'שרייבט: נאטיץ נאמען: טעקסט';
    const r = pickOne(rest.slice(0, i)); if (!r.a) return r.msg!;
    const note = rest.slice(i + 1).trim(); if (!note) return 'וואס איז די נאטיץ?';
    await addEvents([{ k: 'hist', eid: uid(), p: { code: r.a.c, text: '📱 ' + note } }], me);
    return '✓ נאטיץ ביי ' + nm(r.a);
  }
  if (cmd === 'today') {
    const out: string[] = [];
    for (const [, x] of Object.entries(C.S.task) as any) {
      if (!x.title || x.done || x.del || !x.due || x.due > today) continue;
      if (x.priv && (x.owner || '').toLowerCase() !== member.email.toLowerCase()) continue;
      if (x.who === me || x.who2 === me) out.push('• ' + x.title);
    }
    const codes = new Set([...C.IDX.yg.keys(), ...Object.keys(C.S.acct).map(Number)]);
    let asks = 0; const askL: string[] = [];
    for (const code of codes) {
      if (!C.IDX.by.has(code)) continue;
      const k = ask(code);
      if (k.next && k.next <= today && (k.st.assigned || '') === me) { asks++; if (askL.length < 5) { const a = C.IDX.by.get(code); askL.push('• בעטן ' + nm(a) + (a.ph[0] ? ' ' + a.ph[0][1] : '')); } }
    }
    if (!out.length && !asks) return '🎉 גארנישט פאר היינט';
    return 'היינט (' + (out.length + asks) + '):\n' + out.slice(0, 8).concat(askL).join('\n');
  }
  if (cmd === 'pledges') {
    const mk = today.slice(0, 7), L: any[] = [];
    C.IDX.pl.forEach((g: any, c: number) => { if (g.open > 0.009 && C.IDX.by.has(c) && !(C.S.call[c + '|' + mk] || {}).v) L.push([c, g]); });
    L.sort((x, y) => y[1].dueNow - x[1].dueNow);
    if (!L.length) return '✓ אלע פלעדזשעס געקאלט דעם חודש';
    return 'פלעדזשעס (' + L.length + '):\n' + L.slice(0, 8).map(([c, g]) => { const a = C.IDX.by.get(c); return '• ' + nm(a) + ' ' + money(g.dueNow) + (a.ph[0] ? ' ' + a.ph[0][1] : ''); }).join('\n');
  }
  if (cmd === 'shul') {
    const L = Object.entries(C.S.shul).filter(([, x]: any) => !x.del && !x.paused).map(([id, x]: any) => ({ id, ...x })).sort((a: any, b: any) => (a.ord || 0) - (b.ord || 0));
    if (!L.length) return 'קיין שולן';
    let st = SET().shulStart; if (!st) { const d = parse(today); st = addDays(today, (3 - d.getDay() + 7) % 7); }
    let k = today > st ? Math.ceil((parse(today).getTime() - parse(st).getTime()) / 864e5 / 14) : 0;
    const lines = [0, 1].map(i => { const s: any = L[(k + i) % L.length]; return shortD(addDays(st, 14 * (k + i))) + ' ' + s.name + (i === 0 && s.addr ? '\n' + s.addr : ''); });
    return '🕍 ' + lines.join('\n');
  }
  // donor commands
  const r = pickOne(rest); if (!r.a) return r.msg!;
  const a = r.a, g = C.IDX.yg.get(a.c), p = C.IDX.pl.get(a.c);
  const phones = a.ph.slice(0, 3).map((x: any) => (x[0] ? x[0] + ' ' : '') + x[1]).join('\n') || 'קיין טעלעפאן';
  const yearAgo = addMonths(today, -12);
  const lastYear = g ? g.list.filter((x: any) => validD(x[2]) && x[2] >= yearAgo && x[2] <= today && !x[9]) : [];
  const lyTotal = lastYear.reduce((s: number, x: any) => s + x[3], 0);
  if (cmd === 'phone') return nm(a) + '\n' + phones;
  if (cmd === 'address') return nm(a) + '\n' + (a.a || 'קיין אדרעס');
  if (cmd === 'balance') return nm(a) + '\nבאלאנס: ' + money(p ? p.open : 0) + (p && p.dueNow > 0.009 ? '\nפעליג יעצט: ' + money(p.dueNow) : '');
  if (cmd === 'given') {
    if (!lastYear.length) return nm(a) + '\nלעצטע יאר: גארנישט' + (g && g.last ? '\nלעצטע מאל: ' + money(g.lastAmt) + ' ' + shortD(g.last) : '');
    return nm(a) + '\nלעצטע יאר: ' + money(lyTotal) + ' (' + lastYear.length + ')\n' + lastYear.slice(0, 6).map((x: any) => shortD(x[2]) + ' ' + money(x[3])).join('\n');
  }
  if (cmd === 'called') {
    await addEvents([{ k: 'call', eid: a.c + '|' + today.slice(0, 7), p: { v: true } }, { k: 'hist', eid: uid(), p: { code: a.c, text: 'פלעדזש קאל: 📱 SMS' } }], me);
    return '✓ ' + nm(a) + ' אנגעמערקט געקאלט';
  }
  // info (default)
  const k = ask(a.c), last = Object.values(C.S.hist).filter((h: any) => h.code === a.c).sort((x: any, y: any) => (y.at || '').localeCompare(x.at || ''))[0] as any;
  return [nm(a) + ' #' + a.c, phones, a.a || '',
    'לעצטע יאר: ' + money(lyTotal) + ' · סך הכל: ' + money(g ? g.total : 0),
    g && g.last ? 'לעצטע: ' + money(g.lastAmt) + ' ' + shortD(g.last) : '',
    p && p.open > 0.009 ? 'באלאנס: ' + money(p.open) : '',
    k.next ? 'ווייטער בעטן: ' + shortD(k.next) : '',
    last ? '💬 ' + String(last.text).slice(0, 60) : ''].filter(Boolean).join('\n');
}

// ---------- webhook signature checks ----------
const b64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function twilioOk(req: Request, params: URLSearchParams) {
  const token = ENV('TWILIO_AUTH_TOKEN'), sig = req.headers.get('x-twilio-signature') || '';
  if (!token || !sig) return false;
  const url = ENV('SMS_PUBLIC_URL') || SB_URL() + '/functions/v1/sms';
  const data = url + [...params.keys()].sort().map(k => k + params.get(k)).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return btoa(String.fromCharCode(...mac)) === sig;
}
async function telnyxOk(req: Request, raw: string) {
  const pub = ENV('TELNYX_PUBLIC_KEY'), sig = req.headers.get('telnyx-signature-ed25519') || '', ts = req.headers.get('telnyx-timestamp') || '';
  if (!pub || !sig || !ts) return false;
  if (Math.abs(Date.now() / 1000 - +ts) > 300) return false;
  const key = await crypto.subtle.importKey('raw', b64(pub), { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify('Ed25519', key, b64(sig), new TextEncoder().encode(ts + '|' + raw));
}
async function memberFor(from: string) {
  const team = await (await rest('/rest/v1/team?select=*')).json();
  const d = digits10(from);
  return d.length === 10 ? team.find((t: any) => t.phone && digits10(t.phone) === d) : null;
}
const clip = (s: string) => s.length > MAX_REPLY ? s.slice(0, MAX_REPLY - 1) + '…' : s;
const xml = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
const twiml = (msg?: string) => new Response('<?xml version="1.0" encoding="UTF-8"?><Response>' + (msg ? '<Message>' + xml(msg) + '</Message>' : '') + '</Response>', { headers: { 'Content-Type': 'text/xml' } });

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('YG Fund SMS', { status: 200 });
  const raw = await req.text(), ct = req.headers.get('content-type') || '';
  try {
    if (ct.includes('application/x-www-form-urlencoded')) {          // ---- Twilio
      const params = new URLSearchParams(raw);
      if (!(await twilioOk(req, params))) return new Response('forbidden', { status: 403 });
      const m = await memberFor(params.get('From') || '');
      if (!m) return twiml();                                          // not on the team: no answer
      await load();
      return twiml(clip(await answer(params.get('Body') || '', m)));
    }
    // ---- Telnyx
    if (!(await telnyxOk(req, raw))) return new Response('forbidden', { status: 403 });
    const ev = JSON.parse(raw).data || {};
    if (ev.event_type !== 'message.received') return new Response('ok');
    const pl = ev.payload || {}, from = (pl.from || {}).phone_number || '', to = ((pl.to || [])[0] || {}).phone_number || '';
    const m = await memberFor(from);
    if (!m) return new Response('ok');
    await load();
    const reply = clip(await answer(pl.text || '', m));
    await fetch('https://api.telnyx.com/v2/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ENV('TELNYX_API_KEY') }, body: JSON.stringify({ from: to, to: from, text: reply }) });
    return new Response('ok');
  } catch (e) {
    console.error(e);
    return ct.includes('urlencoded') ? twiml('⚠️ א טעות, פרובירט שפעטער') : new Response('error', { status: 200 });
  }
}

if ((globalThis as any).Deno) (globalThis as any).Deno.serve(handle);
export { handle, answer, load, C };
