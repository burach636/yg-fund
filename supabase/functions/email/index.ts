// YG Fund – send one e-mail (a receipt PDF) for a logged-in team member. Supabase Edge Function "email".
// Deploy with "Verify JWT" ON (the default): only logged-in users can call it, and we also check the
// caller is in table `team` (through RLS, with the caller's own token).
//
// Secrets (Supabase > Edge Functions > Secrets), never in the repo – set ONE provider:
//   RESEND_API_KEY   (resend.com)   or   BREVO_API_KEY (brevo.com)
//   EMAIL_FROM       e.g.  Yeshivas Maharit Satmar <office@yourdomain.org>   (must be verified at the provider)
//   EMAIL_REPLY_TO   optional reply-to address

const ENV = (k: string) => (globalThis as any).Deno?.env.get(k) || (globalThis as any).process?.env?.[k] || '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

async function isTeam(auth: string) {
  const key = ENV('SUPABASE_ANON_KEY') || ENV('SUPABASE_PUBLISHABLE_KEY');
  const r = await fetch(ENV('SUPABASE_URL') + '/rest/v1/team?select=email,name', { headers: { apikey: key, Authorization: auth } });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows.length ? rows : null;   // RLS returns rows only to team members
}
function parseFrom(f: string) { const m = f.match(/^\s*(.*?)\s*<([^>]+)>\s*$/); return m ? { name: m[1].replace(/^"|"$/g, ''), email: m[2] } : { name: '', email: f.trim() }; }

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'not logged in' }, 401);
  try {
    if (!(await isTeam(auth))) return json({ error: 'not allowed' }, 403);
    const b = await req.json();
    const to = String(b.to || '').trim().toLowerCase();
    if (!EMAIL_RE.test(to)) return json({ error: 'bad address: ' + to }, 400);
    const subject = String(b.subject || '').slice(0, 300), html = String(b.html || '').slice(0, 100000);
    const pdf = b.pdf ? String(b.pdf).replace(/^data:[^,]*,/, '') : '', filename = String(b.filename || 'receipt.pdf').replace(/[^\w.\- ]/g, '_');
    if (pdf.length > 7_000_000) return json({ error: 'attachment too big' }, 400);
    const from = ENV('EMAIL_FROM'), replyTo = ENV('EMAIL_REPLY_TO');
    if (!from) return json({ error: 'EMAIL_FROM is not set' }, 500);
    let r: Response;
    if (ENV('RESEND_API_KEY')) {
      r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + ENV('RESEND_API_KEY'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}), ...(pdf ? { attachments: [{ filename, content: pdf }] } : {}) }) });
    } else if (ENV('BREVO_API_KEY')) {
      const f = parseFrom(from);
      r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': ENV('BREVO_API_KEY'), 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: f, to: [{ email: to }], subject, htmlContent: html, ...(replyTo ? { replyTo: { email: replyTo } } : {}), ...(pdf ? { attachment: [{ name: filename, content: pdf }] } : {}) }) });
    } else return json({ error: 'no e-mail provider key is set (RESEND_API_KEY or BREVO_API_KEY)' }, 500);
    const txt = await r.text();
    if (!r.ok) return json({ error: 'provider ' + r.status + ': ' + txt.slice(0, 300) }, 502);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
}

if ((globalThis as any).Deno) (globalThis as any).Deno.serve(handle);
export { handle };
