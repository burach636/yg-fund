// YG Fund – click-to-call through TekLink (a Kazoo / 2600hz phone system). Supabase Edge Function "call".
// Deploy with "Verify JWT" OFF (like "EMAIL"): the function itself requires a logged-in user's token and checks
// that the caller is in table `team` (through RLS).
//
// Secret (Supabase > Edge Functions > Secrets), never in the repo:
//   TEKLINK_API_KEY   the account API key TekLink sends through a secure link
//   TEKLINK_URL       optional, default https://portal.theteklink.com:8443
// The account ID and the extensions' user IDs are not secrets; the admin enters them in the app's Settings.
//
// Flow (TekLink's instructions): PUT /v2/api_auth {data:{api_key}} -> auth_token (valid 1 hour), then
// POST /v2/accounts/<account>/users/<user>/quickcall/<number> with X-Auth-Token: the desk phone of that user
// rings, and when it is picked up the number is dialed. POST waits until the desk phone rings (error otherwise).

const ENV = (k: string) => (globalThis as any).Deno?.env.get(k) || (globalThis as any).process?.env?.[k] || '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const HEX32 = /^[0-9a-f]{32}$/;
const base = () => (ENV('TEKLINK_URL') || 'https://portal.theteklink.com:8443').replace(/\/+$/, '');

async function isTeam(auth: string) {
  const key = ENV('SUPABASE_ANON_KEY') || ENV('SUPABASE_PUBLISHABLE_KEY');
  const r = await fetch(ENV('SUPABASE_URL') + '/rest/v1/team?select=email', { headers: { apikey: key, Authorization: auth } });
  if (!r.ok) return false;
  return (await r.json()).length > 0;   // RLS returns rows only to team members
}

let tok = '', tokAt = 0;   // cached while the function is warm; renewed after 50 minutes
async function token(force = false) {
  if (!force && tok && Date.now() - tokAt < 50 * 60 * 1000) return tok;
  const r = await fetch(base() + '/v2/api_auth', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { api_key: ENV('TEKLINK_API_KEY') } }) });
  const t = await r.text();
  if (!r.ok) throw new Error('TekLink login ' + r.status + ': ' + t.slice(0, 200));
  const j = JSON.parse(t);
  tok = j.auth_token || (j.data && j.data.auth_token) || '';
  if (!tok) throw new Error('TekLink login: no auth_token in the answer');
  tokAt = Date.now();
  return tok;
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only', apiKey: ENV('TEKLINK_API_KEY') ? 'set' : 'missing', url: base() }, 405);
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'not logged in' }, 401);
  try {
    if (!(await isTeam(auth))) return json({ error: 'not allowed' }, 403);
    if (!ENV('TEKLINK_API_KEY')) return json({ error: 'TEKLINK_API_KEY is not set in Supabase > Edge Functions > Secrets' }, 500);
    const b = await req.json();
    const account = String(b.account || '').trim().toLowerCase(), user = String(b.user || '').trim().toLowerCase();
    const number = String(b.number || '').replace(/\D/g, '');
    if (!HEX32.test(account)) return json({ error: 'bad account ID' }, 400);
    if (!HEX32.test(user)) return json({ error: 'bad user ID (extension)' }, 400);
    if (number.length < 7 || number.length > 15) return json({ error: 'bad number' }, 400);
    const url = base() + '/v2/accounts/' + account + '/users/' + user + '/quickcall/' + number;
    let r: Response | null = null;
    for (const force of [false, true]) {   // a token that expired early gets one renewal
      r = await fetch(url, { method: 'POST', headers: { 'X-Auth-Token': await token(force), 'Content-Type': 'application/json' }, body: '{}' });
      if (r.status !== 401) break;
    }
    const t = await r!.text();
    if (!r!.ok) {
      let m = t.slice(0, 300); try { const j = JSON.parse(t); m = j.message || (j.data && (j.data.message || JSON.stringify(j.data))) || m; } catch (_) { }
      return json({ error: 'TekLink ' + r!.status + ': ' + m }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
}

if ((globalThis as any).Deno) (globalThis as any).Deno.serve(handle);
export { handle };
