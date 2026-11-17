// YG Fund – click-to-call through TekLink (a Kazoo / 2600hz phone system). Supabase Edge Function "call".
// Deploy with "Verify JWT" OFF (like "EMAIL"): the function itself requires a logged-in user's token and checks
// that the caller is in table `team` (through RLS).
//
// Secrets (Supabase > Edge Functions > Secrets), never in the repo or the app's database:
//   TEKLINK_API_KEY   the account API key from TekLink
//   TEKLINK_URL       optional, default https://portal.theteklink.com:8443
//
// Flow (as TekLink explained it, v1.42):
//   1. PUT /v2/api_auth {data:{api_key}} -> auth_token + data.account_id (token cached ~50 min, renewed on 401)
//   2. action "users":   GET /v2/accounts/<acct>/users                 -> the admin maps each team member to one
//   3. action "devices": GET /v2/accounts/<acct>/users/<user>/devices  -> each member picks the device to ring
//   4. action "dial":    POST /v2/accounts/<acct>/devices/<device>/quickcall/<number> (blocking: errors if the
//      device cannot be rung); without a device: POST …/users/<user>/quickcall/<number> (all the user's devices).
//   action "info": is the key set, which account.

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

let tok = '', tokAt = 0, acct = '';   // cached while the function is warm
async function login(force = false) {
  if (!force && tok && Date.now() - tokAt < 50 * 60 * 1000) return;
  const r = await fetch(base() + '/v2/api_auth', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { api_key: ENV('TEKLINK_API_KEY') } }) });
  const t = await r.text();
  if (!r.ok) throw new Error('TekLink login ' + r.status + ': ' + t.slice(0, 200));
  const j = JSON.parse(t);
  tok = j.auth_token || (j.data && j.data.auth_token) || '';
  acct = String((j.data && j.data.account_id) || '').toLowerCase();
  if (!tok) throw new Error('TekLink login: no auth_token in the answer');
  tokAt = Date.now();
}
// One Kazoo request; a token that expired early gets one renewal
async function kz(method: string, path: string) {
  let r: Response | null = null;
  for (const force of [false, true]) {
    await login(force);
    r = await fetch(base() + '/v2/accounts/' + acct + path, { method, headers: { 'X-Auth-Token': tok, 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) });
    if (r.status !== 401) break;
  }
  const t = await r!.text();
  let j: any = null; try { j = JSON.parse(t); } catch (_) { }
  if (!r!.ok) {
    const m = (j && (j.message || (j.data && (j.data.message || JSON.stringify(j.data))))) || t.slice(0, 300);
    throw Object.assign(new Error('TekLink ' + r!.status + ': ' + m), { http: 502 });
  }
  return j;
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only', apiKey: ENV('TEKLINK_API_KEY') ? 'set' : 'missing', url: base() }, 405);
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'not logged in' }, 401);
  try {
    if (!(await isTeam(auth))) return json({ error: 'not allowed' }, 403);
    if (!ENV('TEKLINK_API_KEY')) return json({ error: 'TEKLINK_API_KEY is not set in Supabase > Edge Functions > Secrets', apiKey: 'missing' }, 500);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || 'dial');
    if (action === 'info') { await login(); return json({ ok: true, apiKey: 'set', account: acct, url: base() }); }
    if (action === 'users') {
      const j = await kz('GET', '/users');
      return json({ users: (j.data || []).map((u: any) => ({ id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || u.id, username: u.username || '', ext: u.presence_id || '' })) });
    }
    const user = String(b.user || '').trim().toLowerCase(), device = String(b.device || '').trim().toLowerCase();
    if (user && !HEX32.test(user)) return json({ error: 'bad user ID' }, 400);
    if (device && !HEX32.test(device)) return json({ error: 'bad device ID' }, 400);
    if (action === 'devices') {
      if (!user) return json({ error: 'no user' }, 400);
      const j = await kz('GET', '/users/' + user + '/devices');
      return json({ devices: (j.data || []).map((d: any) => ({ id: d.id, name: d.name || d.id, type: d.device_type || '', enabled: d.enabled !== false })) });
    }
    if (action === 'dial') {
      const number = String(b.number || '').replace(/\D/g, '');
      if (number.length < 7 || number.length > 15) return json({ error: 'bad number' }, 400);
      if (!device && !user) return json({ error: 'no user or device chosen' }, 400);
      await kz('POST', (device ? '/devices/' + device : '/users/' + user) + '/quickcall/' + number);
      return json({ ok: true });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, (e as any)?.http || 500);
  }
}

if ((globalThis as any).Deno) (globalThis as any).Deno.serve(handle);
export { handle };
