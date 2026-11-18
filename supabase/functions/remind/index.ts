// YG Fund – ⏰ e-mail reminder for office work that was not opened (v1.34, owner's wish).
// When someone puts a task on a team member (task.who / who2, from someone else) and that member did not open the
// office-work list within 24 hours, they get ONE e-mail per task reminding them to open it.
// "Opened" = event kind `seen` (id = <email>|<area>, p {at}), written by the app when the list is opened.
// Sent reminders are event kind `remind` (id = <task id>|<name>), so nobody gets the same reminder twice.
// Supabase Edge Function "remind", Verify JWT OFF. Called every hour by GitHub Actions (.github/workflows/remind.yml).
// Calling it needs no key: it only ever sends reminders that are due, once – safe to call many times.
// ?dry=1&key=<FUNDMAIL_KEY> shows what it would send, without sending. Setting `remindOff` = true turns it off.
import nodemailer from 'npm:nodemailer@6.9.16';

const ENV = (k: string) => (globalThis as any).Deno?.env.get(k) || (globalThis as any).process?.env?.[k] || '';
const SB = () => ENV('SUPABASE_URL');
function svc(extra: Record<string, string> = {}) { const k = ENV('SUPABASE_SERVICE_ROLE_KEY'); const h: Record<string, string> = { apikey: k, ...extra }; if (!k.startsWith('sb_')) h.Authorization = 'Bearer ' + k; return h; }
async function rest(path: string, init: any = {}) { const r = await fetch(SB() + path, { ...init, headers: svc(init.headers || {}) }); if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + (await r.text()).slice(0, 200)); return r; }
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);

const SITE = 'https://yeshivasmaharitdsatmar.github.io/';
const HOURS = 24;
const START = '2026-11-17T03:20:00Z';   // tasks made before this feature existed get no reminder
const BY = '⏰ אויטאמאטיש';

const nyDate = (s: string) => { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(s)); } catch { return s; } };
const dayS = (s: string) => { if (!s) return ''; const [y, m, d] = s.split('-'); return +m + '/' + +d + '/' + y; };

async function loadEvents() {
  const S: any = { task: {}, seen: {}, remind: {}, settings: {} };
  let last = 0;
  for (let g = 0; g < 500; g++) {
    const rows = await (await rest(`/rest/v1/events?select=id,k,eid,p&k=in.(task,seen,remind,settings)&id=gt.${last}&order=id.asc&limit=1000`)).json();
    for (const r of rows) { const o = S[r.k][r.eid] || (S[r.k][r.eid] = {}); Object.assign(o, r.p || {}); }
    if (rows.length) last = rows[rows.length - 1].id;
    if (rows.length < 1000) break;
  }
  return S;
}

// Who should get a reminder now: [{name, email, tasks: [[id, task]]}]
export function due(S: any, team: any[], now = Date.now()) {
  const byName = new Map<string, string>();
  team.forEach(t => { if (t.name && t.email) byName.set(t.name, String(t.email).trim().toLowerCase()); });
  const cut = new Date(now - HOURS * 3600e3).toISOString(), out = new Map<string, any>();
  for (const [id, x] of Object.entries<any>(S.task)) {
    if (!x || !x.title || x.del || x.done || x.priv || !x.from || !x.created) continue;
    // owner (v1.52): a task counts from its day (due date, New York midnight ≈ 05:00 UTC) if that is after it was made
    const arr = x.due && x.due + 'T05:00:00.000Z' > x.created ? x.due + 'T05:00:00.000Z' : x.created;
    if (x.created < START || arr > cut) continue;
    for (const n of [x.who, x.who2]) {
      if (!n || n === x.from || !byName.has(n)) continue;
      const email = byName.get(n)!, seen = (S.seen[email + '|' + (x.area || 'fund')] || {}).at || '';
      if (seen >= arr || S.remind[id + '|' + n]) continue;
      if (!out.has(n)) out.set(n, { name: n, email, tasks: [] });
      out.get(n).tasks.push([id, x]);
    }
  }
  return [...out.values()];
}

export function letter(u: any) {
  const n = u.tasks.length;
  const subject = '🔔 דערמאנונג: ' + (n === 1 ? 'א נייע זאך' : n + ' נייע זאכן') + ' פאר אייך אין YG Fund – נאך נישט געעפנט';
  const rows = u.tasks.map(([, x]: any) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee"><b>${esc(x.title)}</b>${x.note ? '<br><small style="color:#666">' + esc(x.note) + '</small>' : ''}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap">${esc(x.from)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap">${esc(nyDate(x.created))}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap">${x.due ? esc(dayS(x.due)) : '—'}</td></tr>`).join('');
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">
  <p>שלום ${esc(u.name)},</p>
  <p>מען האט אייך געגעבן ${n === 1 ? 'א נייע זאך' : n + ' נייע זאכן'} אין <b>🗂️ אפיס ארבעט</b>, און איר האט ${n === 1 ? 'עס' : 'זיי'} נאך נישט געעפנט – שוין מער ווי 24 שעה.</p>
  <table style="border-collapse:collapse;font-size:14px;margin:10px 0"><tr style="background:#f3efe2"><th style="padding:6px 10px;text-align:right">וואס</th><th style="padding:6px 10px;text-align:right">פון</th><th style="padding:6px 10px;text-align:right">ווען</th><th style="padding:6px 10px;text-align:right">ביז</th></tr>${rows}</table>
  <p><a href="${SITE}" style="display:inline-block;background:#1d3557;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">עפנט YG Fund ←</a></p>
  <p style="color:#888;font-size:12px">דאס איז אן אויטאמאטישע דערמאנונג. ווען איר עפנט "אפיס ארבעט" קומט מער נישט קיין דערמאנונג פאר די זאכן.</p></div>`;
  return { subject, html };
}

async function send(to: string, subject: string, html: string) {
  const gUser = ENV('GMAIL_USER'), gPass = ENV('GMAIL_APP_PASSWORD').replace(/\s+/g, '');
  const from = ENV('EMAIL_FROM') || 'Yeshivas Maharit Satmar <' + gUser + '>';
  if (gUser && gPass) {
    const tr = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: gUser, pass: gPass }, connectionTimeout: 12000, greetingTimeout: 8000, socketTimeout: 15000 });
    await tr.sendMail({ from, to, subject, html }); return;
  }
  if (ENV('BREVO_API_KEY')) {
    const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/), sender = m ? { name: m[1], email: m[2] } : { email: from };
    const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': ENV('BREVO_API_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }) });
    if (!r.ok) throw new Error('brevo ' + r.status); return;
  }
  if (ENV('RESEND_API_KEY')) {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + ENV('RESEND_API_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, html }) });
    if (!r.ok) throw new Error('resend ' + r.status); return;
  }
  throw new Error('no e-mail provider is set');
}

export async function handle(req: Request) {
  const url = new URL(req.url), dry = url.searchParams.get('dry') === '1';
  if (dry && (!ENV('FUNDMAIL_KEY') || url.searchParams.get('key') !== ENV('FUNDMAIL_KEY'))) return json({ error: 'forbidden' }, 403);
  try {
    const S = await loadEvents();
    if ((S.settings.s || {}).remindOff) return json({ off: true });
    const team = await (await rest('/rest/v1/team?select=name,email')).json();
    const L = due(S, team);
    if (dry) return json({ dry: true, would: L.map(u => ({ name: u.name, tasks: u.tasks.map(([id, x]: any) => ({ id, title: x.title, from: x.from, created: x.created })) })) });
    const sent: any[] = [], errors: any[] = [];
    for (const u of L) {
      try {
        const m = letter(u);
        await send(u.email, m.subject, m.html);
        const at = new Date().toISOString();
        const ev = u.tasks.map(([id]: any) => ({ k: 'remind', eid: id + '|' + u.name, p: { at, to: u.email }, by: BY }));
        await rest('/rest/v1/events', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(ev) });
        sent.push(u.tasks.length);
      } catch (e) { errors.push({ error: String((e as any)?.message || e) }); }
    }
    return json({ sent, errors });
  } catch (e) { return json({ error: String((e as any)?.message || e) }, 500); }
}

(globalThis as any).Deno?.serve(handle);
