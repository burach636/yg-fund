/* YG Fund fundraising app – client */
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => { const v = Math.round(Number(n || 0)); return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US'); };
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayS = () => iso(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const addMonths = (s, n) => { const d = parse(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return iso(d); };
const monthKey = () => todayS().slice(0, 7);
const fmtD = s => { if (!s) return '—'; if (calPref() === 'heb' && s >= '1900') return HEB.fmtHeb(s); const [y, m, d] = s.split('-'); return +d + '/' + +m + '/' + y; };
const validD = s => s && s >= '1990-01-01' && s <= '2100-01-01';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), 3200); }
function busy(t) { if (t === false) { $('#busy').classList.remove('on'); return; } $('#busyTxt').textContent = t; $('#busy').classList.add('on'); }

const FREQ = { m1: ['יעדן חודש', 1], m3: ['יעדע 3 חדשים', 3], m6: ['יעדע 6 חדשים', 6], m12: ['איינמאל א יאר', 12], yt: ['פאר יעדן יום טוב', 0], once: ['איינמאליגע נדבה – נישט בעטן ווייטער', 0], none: ['נישט בעטן אויטאמאטיש', 0] };
const RESULTS = ['האט געגעבן', 'האט צוגעזאגט (פלעדזש)', 'נישט געענטפערט', 'קאלן צוריק שפעטער', 'האט אפגעזאגט'];

// ---------- Yom Tov dates via Intl Hebrew calendar ----------
const hebFmt = (() => { try { return new Intl.DateTimeFormat('en-u-ca-hebrew', { month: 'long', day: 'numeric' }); } catch (e) { return null; } })();
const YT_TARGETS = [['Elul', 1, 'ראש השנה'], ['Kislev', 10, 'חנוכה'], ['Adar', 1, 'פורים'], ['Adar II', 1, 'פורים'], ['Nisan', 1, 'פסח']];
function nextYomTov(fromS) {
  if (!hebFmt) return addMonths(fromS, 3);
  let d = parse(addDays(fromS, 14));
  for (let i = 0; i < 400; i++) {
    const parts = hebFmt.formatToParts(d);
    const mo = (parts.find(p => p.type === 'month') || {}).value, dy = +(parts.find(p => p.type === 'day') || {}).value;
    if (YT_TARGETS.some(t => t[0] === mo && t[1] === dy)) return iso(d);
    d.setDate(d.getDate() + 1);
  }
  return addMonths(fromS, 3);
}
function addFreq(s, f) { if (f === 'yt') return nextYomTov(s); const m = (FREQ[f] || [0, 0])[1]; return m ? addMonths(s, m) : null; }

// ---------- cloud (Supabase) ----------
const CFG = window.YG_CONFIG || {};
const sb = (window.supabase && /^https:\/\//.test(CFG.url || '') && CFG.key && CFG.key.length > 20) ? window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
let TEAM = [], myEmail = '', lastId = 0, jlsVersion = -1;
async function q(promise) { const { data, error } = await promise; if (error) throw error; return data; }
async function gz(text) { const s = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip')); return await new Response(s).blob(); }
async function gunzip(blob) { const s = blob.stream().pipeThrough(new DecompressionStream('gzip')); return await new Response(s).text(); }

// ---------- state ----------
let JD = null;            // imported JLS data
let IDX = null;           // derived indexes
let S = { acct: {}, task: {}, call: {}, hist: {}, fr: {}, frin: {}, frex: {}, frexp: {}, shul: {}, rcpt: {}, stmt: {}, tust: {}, frmail: {}, jrep: {}, settings: { s: { users: ['באניצער 1', 'באניצער 2', 'באניצער 3'], defFreq: 'm12', maxYears: 5 } } };
let status = {}, me = '', view = 'home';
// Two areas after login: 'fund' (fundraising) and 'tu' (tuition, tuition.js); kept per tab
let AREA = (() => { try { return sessionStorage.getItem('yg_area') || ''; } catch (e) { return ''; } })();
const TU_VIEWS = ['thome', 'tuition', 'tubill', 'tustmt'];
let ui = { todayF: 'all', todayN: 50, accQ: '', accF: 'yg', accN: 100, accSort: 'abc', accShul: '', todoF: 'mine', todoDone: false };
const SET = () => S.settings.s;

function applyEvent(ev) {
  if (!ev || !ev.k || !S[ev.k]) return;
  const cur = S[ev.k][ev.id] || (S[ev.k][ev.id] = {});
  Object.assign(cur, ev.p);
  if (ev.k === 'hist') { cur.by = ev.by; cur.at = ev.at; }
}
async function emit(k, id, p) {
  const ev = { k, id: String(id), p, by: me, at: new Date().toISOString() };
  applyEvent(ev);
  try { await q(sb.from('events').insert({ k, eid: String(id), p, by: me })); }
  catch (e) { toast('⚠️ נישט געקענט אפהיטן! קוקט צי איר זענט אויפן אינטערנעט.'); }
}
async function pullLog() {
  let changed = false;
  for (let guard = 0; guard < 200; guard++) {
    const rows = await q(sb.from('events').select('id,k,eid,p,by,at').gt('id', lastId).order('id', { ascending: true }).limit(1000));
    rows.forEach(r => applyEvent({ k: r.k, id: r.eid, p: r.p, by: r.by, at: r.at }));
    if (rows.length) { lastId = rows[rows.length - 1].id; changed = true; }
    if (rows.length < 1000) break;
  }
  return changed;
}
async function loadJLS() {
  const m = await q(sb.from('jls_meta').select('*').eq('id', 1).single());
  if (!m.version) { JD = null; jlsVersion = 0; return; }
  const blob = await q(sb.storage.from('jls').download('jls.json.gz'));
  JD = JSON.parse(await gunzip(blob)); buildIndex(); jlsVersion = m.version;
}
async function loadTeam() {
  TEAM = await q(sb.from('team').select('*').order('added_at', { ascending: true }));
  const t = TEAM.find(x => x.email.toLowerCase() === myEmail.toLowerCase());
  me = t ? t.name : myEmail;
}

// ---------- derived indexes ----------
// Sort key: Hebrew last name (LNameH from JLS; before re-import, the last word of the Hebrew name), else English last name.
// The leading '0'/'1' puts Hebrew names first, English-only names after them.
function hebLast(a) {
  const lh = a.lh || (a.h ? a.h.trim().split(/\s+/).pop() : '');
  return lh ? '0' + lh + ' ' + (a.h || '') : '1' + (a.ln || a.n || '').toLowerCase() + ' ' + (a.n || '').toLowerCase();
}
function buildIndex() {
  const by = new Map(), yg = new Map(), pl = new Map();
  const prank = d => { d = (d || '').toLowerCase(); if (/cel|mobile|סעל/.test(d)) return /mother|wife|מאמע/.test(d) ? 1 : 0; if (/home|היים/.test(d)) return 2; return 3; };
  JD.accounts.forEach(a => {
    a.ph.sort((x, y) => prank(x[0]) - prank(y[0]));
    by.set(a.c, a);
    a._k = hebLast(a);
    a._s = (a.n + ' ' + a.h + ' ' + a.w + ' ' + a.wh + ' ' + a.a + ' ' + a.co + ' #' + a.c + ' ' + (a.em || []).join(' ') + ' ' + ((S.acct[a.c] || {}).email || '') + ' ' + a.ph.map(p => p[1] + ' ' + p[1].replace(/\D/g, '')).join(' ')).toLowerCase();
  });
  const today = todayS();
  JD.payments.forEach(p => {
    const [num, code, date, amt] = p;
    let g = yg.get(code); if (!g) yg.set(code, g = { total: 0, count: 0, last: '', lastAmt: 0, list: [] });
    g.total += amt; g.count++; g.list.push(p);
    if (validD(date) && date <= today && date > g.last) { g.last = date; g.lastAmt = amt; }
  });
  yg.forEach(g => g.list.sort((a, b) => (b[2] || '').localeCompare(a[2] || '')));
  const eom = iso(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
  JD.pledges.forEach(c => {
    const [num, code, due, amt, paid, bal, camp, desc, sol, hold] = c;
    let g = pl.get(code); if (!g) pl.set(code, g = { open: 0, dueNow: 0, total: 0, list: [], sol: '' });
    g.list.push(c); g.total += amt;
    if (!hold && bal > 0.009) { g.open += bal; if (!due || due <= eom) g.dueNow += bal; if (sol) g.sol = sol; }
  });
  pl.forEach(g => g.list.sort((a, b) => (b[2] || '').localeCompare(a[2] || '')));
  IDX = { by, yg, pl };
}
const acctName = c => { const a = IDX.by.get(c); return a ? (a.h || a.n || ('#' + c)) : '#' + c; };
function ask(code) {
  const st = S.acct[code] || {}, g = IDX.yg.get(code), set = SET();
  const freq = st.freq || (!g ? 'none' : (set.skipOnce && g.count === 1 ? 'once' : set.defFreq));
  let next = st.nextAsk || null;
  if (!next && freq !== 'none' && freq !== 'once' && g && g.last) {
    const cutoff = addMonths(todayS(), -12 * (+set.maxYears || 5));
    if (g.last >= cutoff) next = addFreq(g.last, freq);
  }
  return { freq, next, st };
}

// ---------- boot / login ----------
async function boot() {
  wire();
  if (!sb) { $('#main').innerHTML = '<div class="empty">⚠️ די וועבסייט איז נאך נישט פארבונדן מיט Supabase (config.js).</div>'; return; }
  const hp = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  let recovering = hp.get('type') === 'recovery';
  sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY' && !recovering) { recovering = true; vNewPw(); } });
  if (hp.get('error_code') || hp.get('error')) {
    history.replaceState(null, '', location.pathname);
    vLogin();
    $('#lerr').textContent = /expired/i.test(hp.get('error_code') + hp.get('error_description')) ? 'דער לינק איז שוין אויסגעגאנגען. דריקט נאכאמאל "פארגעסן דעם פאסווארט?" און ניצט דעם נייעסטן אימעיל.' : 'דער לינק האט נישט געארבעט: ' + (hp.get('error_description') || hp.get('error'));
    return;
  }
  const { data } = await sb.auth.getSession();
  if (recovering) { if (data.session) { vNewPw(); } else { vLogin(); $('#lerr').textContent = 'דער לינק האט נישט געארבעט. פרובירט נאכאמאל "פארגעסן דעם פאסווארט?"'; } return; }
  // Idle longer than 10 minutes (also while the browser was closed) -> log out
  if (data.session && lastActive() && Date.now() - lastActive() > IDLE_MS) { try { sessionStorage.setItem('yg_idle', '1'); } catch (e) { } await sb.auth.signOut().catch(() => { }); vLogin(); return; }
  if (data.session) await afterLogin(data.session); else vLogin();
}
async function afterLogin(session) {
  markActive();
  myEmail = session.user.email || '';
  let setupErr = null;
  try { await loadTeam(); } catch (e) { TEAM = []; setupErr = e; }
  if (setupErr || !TEAM.length) { vSetupHelp(setupErr); return; }
  if (!TEAM.some(x => x.email.toLowerCase() === myEmail.toLowerCase())) {
    loginShell(`<div class="box" style="text-align:right;background:#fff"><h2>נישט ערלויבט</h2><p class="sub">דער אימעיל <b>${esc(myEmail)}</b> איז נישט אויף דער ליסטע. דער אדמין דארף אייך צולייגן אין סעטינגס.</p><button class="btn" onclick="logout()">Back</button></div>`);
    return;
  }
  busy('לאדנט...');
  try { await pullLog(); await loadJLS(); } catch (e) { busy(false); toast('⚠️ ' + (e.message || e)); return; }
  try { await ensureRcptTask(); await ensureFundMailTask(); await tagMigrate(); } catch (e) { }
  busy(false);
  await start();
}
// ---------- setup self-check: tells the admin exactly what is missing ----------
function vSetupHelp(err) {
  const msg = String(err && (err.message || err.code) || '');
  const noTables = /does not exist|42P01|relation|schema cache/i.test(msg);
  const sql = `insert into public.team (email, name, is_admin)\nvalues ('${myEmail.replace(/'/g, "''")}', 'אדמין', true)\non conflict (email) do update set is_admin = true;`;
  loginShell(`<div class="box" style="text-align:right;background:#fff"><h2>🔧 נאך איין שריט</h2>
   ${noTables ? `<p>די טאבעלעס זענען נאך נישט אויפגעשטעלט אין Supabase. גייט אין Supabase אויף <b>SQL Editor</b> > <b>New query</b>, פעיסט אריין די גאנצע <b>SETUP.sql</b>, און דריקט <b>Run</b>. דערנאך קומט צוריק אהער.</p>`
      : `<p>אלעס איז אויפגעשטעלט, נאר אייער אימעיל <b dir="ltr">${esc(myEmail)}</b> איז נאך נישט אויף דער ליסטע פון ערלויבטע באניצער.</p>
   <p>גייט אין Supabase אויף <b>SQL Editor</b> > <b>New query</b>, פעיסט אריין די 3 שורות, און דריקט <b>Run</b>:</p>
   <pre id="sqlbox" style="direction:ltr;text-align:left;background:#faf7f0;border:1px solid var(--line);border-radius:8px;padding:10px;white-space:pre-wrap;font-size:13px">${esc(sql)}</pre>
   <button class="btn ghost sm" onclick="navigator.clipboard.writeText(document.getElementById('sqlbox').textContent).then(()=>toast('✓ קאפירט'))">📋 קאפיר</button>`}
   ${msg ? `<p class="sub" style="direction:ltr;text-align:left;margin-top:10px">${esc(msg)}</p>` : ''}
   <div class="row" style="margin-top:14px"><button class="btn" onclick="location.reload()">⟳ פרוביר נאכאמאל</button><button class="btn ghost" onclick="logout()">ארויסגיין</button></div></div>`);
}
let started = false;
async function start() {
  document.body.classList.remove('locked');
  setupUser();
  const want = AREA;
  if (AREA === 'tu' && !canView('tuition')) AREA = '';
  if (AREA === 'fund' && !canFund()) AREA = '';
  if (want && !AREA) setTimeout(() => toast('🔒 ' + (want === 'tu' ? 'שכר לימוד' : 'פאנדרעיזינג') + ' איז נישט אפן פאר אייך'), 300);
  if (!AREA && !canFund()) AREA = 'tu';
  if (!AREA && !canView('tuition')) AREA = 'fund';
  if (AREA) setArea(AREA, true); else vChooser();
  if (started) return; started = true;
  setInterval(poll, 15000);
  idleWatch();
}
// ---------- automatic log out after 10 minutes without use ----------
const IDLE_MS = 10 * 60 * 1000;
function markActive() { try { localStorage.setItem('yg_act', String(Date.now())); } catch (e) { } }
function lastActive() { try { return +localStorage.getItem('yg_act') || 0; } catch (e) { return 0; } }
function idleWatch() {
  let t = 0, warned = false;
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart'].forEach(ev => window.addEventListener(ev, () => {
    const n = Date.now(); if (n - t > 15000) { t = n; markActive(); warned = false; }
  }, { passive: true, capture: true }));
  setInterval(() => {
    if (document.body.classList.contains('locked')) return;
    if ($('#busy').classList.contains('on')) { markActive(); return; }   // a long job (JLS update, sending) is running
    const idle = Date.now() - lastActive();   // shared by all open tabs
    if (idle > IDLE_MS) { try { sessionStorage.setItem('yg_idle', '1'); } catch (e) { } logout(); }
    else if (idle > IDLE_MS - 60000 && !warned) { warned = true; toast('⏳ אין א מינוט ווערט איר ארויסגעלאגט – רירט די מויז צו בלייבן'); }
  }, 10000);
}
function setupUser() {
  $('#whoBox').innerHTML = `👤 <b>${esc(me)}</b>${isAdmin() ? ' <span class="tag ask">Admin</span>' : ''} <button class="btn ghost sm" onclick="callSetup()">📞 Phone</button> <button class="btn ghost sm" onclick="pwForm()">🔑 Password</button> <button class="btn ghost sm" onclick="logout()">Log out</button>`;
}
const USERS = () => TEAM.map(a => a.name);
const isAdmin = () => !!(TEAM.find(a => a.email.toLowerCase() === myEmail.toLowerCase()) || {}).is_admin;
async function logout() { try { await sb.auth.signOut(); } catch (e) { } try { sessionStorage.removeItem('yg_area'); } catch (e) { } location.hash = ''; location.reload(); }
function loginShell(inner) {
  document.body.classList.add('locked');
  $('#main').innerHTML = `<div class="welcome loginbg" style="max-width:460px"><div class="logo3d big"><div class="in"><img src="logo.png" alt=""><i class="shine"></i></div></div><div class="ltitle">ישיבה גדולה ומתיבתא תו"י מהרי"ט ד'סאטמאר<small>YG Fund</small></div>${inner}</div>`;
}
// Before logging in, choose which part of the program to open (tuition or fundraising)
function preArea(a) { AREA = a; try { sessionStorage.setItem('yg_area', a); } catch (e) { } vLogin(); }
function vLogin(mode) {
  const signup = mode === 'signup';
  if (!signup && (mode === 'choose' || !AREA)) {
    AREA = ''; try { sessionStorage.removeItem('yg_area'); } catch (e) { }
    loginShell(`<div class="box prechoose" style="background:#fff"><h2 style="text-align:center">וואס ווילט איר עפענען?</h2>
     <div class="pre2"><div class="choice c1" onclick="preArea('tu')"><i>🎓</i><h3>שכר לימוד</h3></div>
     <div class="choice c2" onclick="preArea('fund')"><i>💵</i><h3>פאנדרעיזינג</h3></div></div></div>`);
    try { if (sessionStorage.getItem('yg_idle')) { sessionStorage.removeItem('yg_idle'); $('.prechoose').insertAdjacentHTML('beforeend', '<p class="sub" style="text-align:center;margin:10px 0 0">⏳ מ\'האט אייך ארויסגעלאגט נאך 10 מינוט אן ניצן.</p>'); } } catch (e) { }
    return;
  }
  const areaName = AREA === 'tu' ? '🎓 שכר לימוד' : '💵 פאנדרעיזינג';
  loginShell(`<div class="box" style="text-align:right;background:#fff"><div class="row" style="margin:0 0 4px"><span class="tag ${AREA === 'tu' ? 'blue' : 'gold'}" style="font-size:14px">${areaName}</span><div class="spacer"></div><a class="name" style="font-size:13px" onclick="vLogin('choose')">⇄ ענדערן</a></div><h2>${signup ? 'ערשטע מאל: מאכט א פאסווארט' : 'Log in'}</h2>
   ${signup ? '<p class="sub">שרייבט דעם אימעיל וואס דער אדמין האט צוגעלייגט, און קלייבט א פאסווארט.</p>' : ''}
   <label class="f" style="margin:10px 0">Email<input id="le" type="email" autocomplete="username" style="direction:ltr"></label>
   <label class="f" style="margin:10px 0">Password<input id="lp" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}"></label>
   <div id="lerr" class="bal" style="min-height:20px;font-size:13px"></div>
   <button class="btn" style="width:100%;padding:10px;font-size:15px" id="lbtn">${signup ? 'מאך דעם אקאונט' : 'Log in'}</button>
   <div class="row" style="justify-content:space-between;margin:12px 0 0">
    ${signup ? '<a class="name" onclick="vLogin()">איך האב שוין א פאסווארט</a>' : '<a class="name" onclick="vLogin(\'signup\')">ערשטע מאל דא?</a><a class="name" onclick="forgotPw()">פארגעסן דעם פאסווארט?</a>'}
   </div></div>`);
  let last = ''; try { last = localStorage.getItem('yg_last') || ''; } catch (e) { }
  try { if (sessionStorage.getItem('yg_idle')) { sessionStorage.removeItem('yg_idle'); $('#lerr').innerHTML = '<span style="color:var(--navy)">⏳ מ\'האט אייך ארויסגעלאגט נאך 10 מינוט אן ניצן. לאגט אריין נאכאמאל.</span>'; } } catch (e) { }
  if (last) $('#le').value = last;
  const go2 = async () => {
    const email = $('#le').value.trim(), password = $('#lp').value;
    if (!email || password.length < 6) { $('#lerr').textContent = 'אימעיל און א פאסווארט פון כאטש 6 אותיות'; return; }
    $('#lbtn').disabled = true;
    try {
      try { localStorage.setItem('yg_last', email); } catch (e) { }
      if (signup) {
        const r = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
        if (r.error) throw r.error;
        if (!r.data.session) { $('#lerr').innerHTML = '<span style="color:var(--green)">✓ קוקט אין אייער אימעיל און דריקט אויפן לינק, דערנאך לאגט אריין.</span>'; $('#lbtn').disabled = false; return; }
        await afterLogin(r.data.session);
      } else {
        const r = await sb.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
        await afterLogin(r.data.session);
      }
    } catch (e) { $('#lerr').textContent = /invalid/i.test(e.message) ? 'פאלשער אימעיל אדער פאסווארט' : (e.message || String(e)); $('#lbtn').disabled = false; }
  };
  $('#lbtn').onclick = go2; $('#lp').onkeydown = e => { if (e.key === 'Enter') go2(); };
  setTimeout(() => (last ? $('#lp') : $('#le')).focus(), 50);
}
async function forgotPw() {
  const email = $('#le').value.trim();
  if (!email) { $('#lerr').textContent = 'שרייבט ערשט אייער אימעיל'; return; }
  const r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  $('#lerr').innerHTML = r.error ? (/rate|limit|seconds/i.test(r.error.message) ? 'צופיל אימעילס אין א קורצער צייט. ווארט א שעה און פרובירט נאכאמאל.' : esc(r.error.message)) : '<span style="color:var(--green)">✓ מ\'האט אייך געשיקט אן אימעיל מיט א לינק צו מאכן א נייעם פאסווארט. עפנט דעם לינק אויף <b>דעם זעלבן קאמפיוטער</b>.</span>';
}
function vNewPw() {
  loginShell(`<div class="box" style="text-align:right;background:#fff"><h2>🔑 נייער פאסווארט</h2>
   <label class="f" style="margin:10px 0">נייער פאסווארט<input id="np1" type="password" autocomplete="new-password"></label>
   <label class="f" style="margin:10px 0">נאכאמאל<input id="np2" type="password" autocomplete="new-password"></label>
   <div id="nerr" class="bal" style="min-height:20px;font-size:13px"></div>
   <button class="btn" style="width:100%;padding:10px" onclick="saveNewPw(true)">Save</button></div>`);
}
async function saveNewPw(fromRecovery) {
  const a = $('#np1').value, b = $('#np2').value, err = $('#nerr');
  if (a.length < 6) { err.textContent = fromRecovery ? 'כאטש 6 אותיות' : 'At least 6 characters'; return; }
  if (a !== b) { err.textContent = fromRecovery ? 'די צוויי זענען נישט גלייך' : 'The two passwords are not the same'; return; }
  const r = await sb.auth.updateUser({ password: a });
  if (r.error) { err.textContent = r.error.message; return; }
  if (fromRecovery) { history.replaceState(null, '', location.pathname); const { data } = await sb.auth.getSession(); toast('✓ נייער פאסווארט אפגעהיטן'); await afterLogin(data.session); }
  else { closeM(); toast('✓ Password changed'); }
}
function pwForm() {
  modal(`<div dir="ltr" style="text-align:left"><h2>Change my password</h2><div class="grid2">
   <label class="f">New password<input id="np1" type="password" autocomplete="new-password"></label><label class="f">Again<input id="np2" type="password" autocomplete="new-password"></label></div>
   <div id="nerr" class="bal" style="min-height:20px;font-size:13px;margin-top:6px"></div>
   <div class="row" style="justify-content:flex-end"><button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="saveNewPw(false)">Save</button></div></div>`, 'narrow');
}
// ---------- who calls / notes ----------
function whoSel(onch, cur) {
  return `<select class="mini" title="ווער קאלט" onchange="${onch}"><option value="">👤 נישט צוגעטיילט</option>${USERS().map(u => `<option value="${esc(u)}" ${u === cur ? 'selected' : ''}>👤 ${esc(u)}</option>`).join('')}</select>`;
}
async function assign(code, v) { await emit('acct', code, { assigned: v }); counts(); toast(v ? '✓ ' + v + ' וועט קאלן ' + acctName(+code) : 'נישט צוגעטיילט'); }
async function assignTask(id, v) { await emitTask(id, { who: v }); counts(); toast('✓'); }
function lastNotes() { const m = new Map(); Object.values(S.hist).forEach(h => { const c = +h.code; if (!m.has(c) || (h.at || '') > (m.get(c).at || '')) m.set(c, h); }); return m; }
function lastNoteHTML(code, br) {
  const h = code && window._ln ? window._ln.get(+code) : null; if (!h) return '';
  return `${br ? '<br>' : ''}<span class="lnote" title="${esc(h.text)}">💬 ${esc(h.text.length > 70 ? h.text.slice(0, 70) + '…' : h.text)} <small>– ${esc(h.by || '')}, ${fmtD((h.at || '').slice(0, 10))}</small></span>`;
}
function noteForm(code) {
  const a = IDX.by.get(+code), st = S.acct[code] || {};
  modal(`<h2>📝 נאטיץ: ${esc(a.h || a.n)}</h2><p class="sub">${a.ph.slice(0, 3).map(p => callBtn(p[1], code) + ' ' + esc(p[0] + ' ' + p[1])).join(' · ')}</p>
   <label class="f">וואס האט ער געענטפערט?<textarea id="nn" rows="3"></textarea></label>
   <div class="grid2" style="margin-top:10px"><label class="f">ווער קאלט אים ווייטער<select id="nw"><option value="">נישט צוגעטיילט</option>${USERS().map(u => `<option ${u === st.assigned ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
   <label class="f">רימיינד ווידער (אפציאנאל)${dateField('nd', '', { clear: true })}</label></div>
   <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="saveNote(${+code})">Save</button></div>`, 'narrow');
  setTimeout(() => $('#nn').focus(), 50);
}
async function saveNote(code) {
  const t = $('#nn').value.trim(), w = $('#nw').value, d = $('#nd').value, st = S.acct[code] || {};
  if (t) await emit('hist', uid(), { code, text: t });
  if (w !== (st.assigned || '')) await emit('acct', code, { assigned: w });
  if (d) await emitTask(uid(), { title: 'קאלן ' + acctName(code), due: d, who: w || me, code, pri: 'norm', note: t });
  closeM(); render(); toast('✓ אפגעהיטן');
}
async function poll() {
  try {
    const logCh = await pullLog();
    await ensureRcptTask(); await ensureFundMailTask();
    const m = await q(sb.from('jls_meta').select('version').eq('id', 1).single());
    const jlsCh = m.version && m.version !== jlsVersion;
    if (jlsCh) { await loadJLS(); toast('⟳ נייע JLS דאטא געלאדן'); }
    if ((logCh || jlsCh) && !$('#ov').classList.contains('on')) render();
  } catch (e) { }
}
// ---------- import ----------
async function importFile(file) {
  try {
    busy('לייענט ' + file.name + '...');
    const buf = new Uint8Array(await file.arrayBuffer());
    await doImport(buf, file.name, { name: file.name, size: file.size, mtime: new Date(file.lastModified).toISOString() });
  } catch (e) { busy(false); toast('⚠️ ' + errMsg(e)); }
}
function errMsg(e) {
  const m = String(e && e.message || e);
  if (m === 'NOT_MDB') return 'די פייל איז נישט קיין MDB (Access) פייל';
  if (m === 'NOT_JET4') return 'אומבאקאנטע MDB ווערסיע';
  if (m === 'NO_MDB_IN_ZIP') return 'אין דעם ZIP איז נישטא קיין .mdb פייל';
  return m;
}
async function unzipMdb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('NO_MDB_IN_ZIP');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl));
    if (/\.mdb$/i.test(name)) {
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const data = buf.subarray(start, start + csize);
      if (method === 0) return data;
      const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(ds).arrayBuffer());
    }
    p += 46 + nl + xl + cl;
  }
  throw new Error('NO_MDB_IN_ZIP');
}
async function doImport(buf, name, source) {
  if (buf[0] === 0x50 && buf[1] === 0x4B) { busy('עפנט דעם ZIP...'); buf = await unzipMdb(buf); }
  await new Promise(r => setTimeout(r, 30));
  const tco = SET().tuitionCompany === 0 ? 0 : (+SET().tuitionCompany || 15);
  const data = JLS.extract(buf, +SET().company || 32, t => { $('#busyTxt').textContent = t; }, { tuition: tco });
  data.source = source; data.importedBy = me;
  busy('לייגט ארויף אויפן אינטערנעט...');
  const tu = data.tuition; delete data.tuition;
  if (tu) {   // tuition goes to its own file, loaded only when the tuition section is opened
    tu.importedAt = data.importedAt;
    await q(sb.storage.from('jls').upload('jls-tuition.json.gz', await gz(JSON.stringify(tu)), { upsert: true, contentType: 'application/gzip' }));
    TU = tu; tuVersion = -1;
  }
  const blob = await gz(JSON.stringify(data));
  try { await q(sb.storage.from('jls').upload('jls.json.gz', blob, { upsert: true, contentType: 'application/gzip' })); }
  catch (e) { if (/bucket/i.test(e.message || '')) throw new Error('אין Supabase פעלט דער "jls" Storage bucket – לאזט נאכאמאל לויפן SETUP.sql'); throw e; }
  const m = await q(sb.from('jls_meta').select('version').eq('id', 1).single());
  const v = (m.version || 0) + 1;
  await q(sb.from('jls_meta').update({ version: v, imported_at: data.importedAt, imported_by: me, summary: { accounts: data.accounts.length, payments: data.payments.length, pledges: data.pledges.length } }).eq('id', 1));
  JD = data; buildIndex(); jlsVersion = v; if (TU) tuVersion = v;
  busy(false); render();
  toast('✓ דערהיינטיגט פון JLS: ' + data.accounts.length.toLocaleString() + ' אקאונטס, ' + data.payments.length.toLocaleString() + ' באצאלונגען, ' + data.pledges.length.toLocaleString() + ' פלעדזשעס');
}
function importDialog() {
  modal(`<h2>דערהיינטיג פון JLS</h2>
  <p class="sub">לייגט אריין א פרישע <b>Tuition.mdb</b> (אדער א ZIP מיט איר). עס ווערט דערהיינטיגט ביי <b>אלע באניצער</b>. אייערע To-Do'ס, נאטיצן און רימיינדערס ווערן <b>נישט</b> אויסגעמעקט.</p>
  <p class="sub">💡 די MDB פייל אליין ווערט נישט ארויפגעלייגט. די פראגראם נעמט פון איר נאר וואס מ'דארף (נעמען, אדרעסן, טעלעפאנען, YG Fund באצאלונגען און פלעדזשעס). פון די אנגעשטעלטע קרעדיט קארדס נאר ווער, וויפיל און ווען – קיינמאל נישט קיין קארטל נומער אדער באנק אינפארמאציע.</p>
  <label class="drop" id="dz">⬇️ לאזט די פייל אראפ דא, אדער קליקט צו אויסוועלן<input type="file" accept=".mdb,.zip" id="fpick" hidden></label>
  <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" onclick="closeM()">צומאכן</button></div>`, 'narrow');
  $('#fpick').onchange = e => { const f = e.target.files[0]; if (f) { closeM(); importFile(f); } };
}

// ---------- nav / render ----------
function wire() {
  $('#nav').onclick = e => { const b = e.target.closest('button'); if (!b) return; view = b.dataset.v; document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b)); render(); window.scrollTo(0, 0); };
  $('#btnImport').onclick = importDialog;
  $('#ov').onclick = e => { if (e.target.id === 'ov') closeM(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeM(); });
  let dc = 0;
  window.addEventListener('dragenter', e => { e.preventDefault(); dc++; $('#dropmask').classList.add('on'); });
  window.addEventListener('dragleave', e => { e.preventDefault(); if (--dc <= 0) { dc = 0; $('#dropmask').classList.remove('on'); } });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { e.preventDefault(); dc = 0; $('#dropmask').classList.remove('on'); const f = e.dataTransfer.files[0]; if (f) { closeM(); importFile(f); } });
}
function setArea(a, keepView) {
  AREA = a; try { sessionStorage.setItem('yg_area', a); } catch (e) { }
  document.body.classList.toggle('area-tu', a === 'tu');
  $('#logoTxt').innerHTML = a === 'tu' ? 'שכר לימוד<small>Tuition · v1.17.2</small>' : 'YG Fund<small>פאנדרעיזינג סיסטעם · v1.17.2</small>';
  $('#btnArea').style.display = canFund() && canView('tuition') ? '' : 'none';
  $('#btnArea').textContent = a === 'tu' ? '⇄ צו פאנדרעיזינג' : '⇄ צו שכר לימוד';
  if (!keepView || (a === 'tu') !== TU_VIEWS.includes(view)) view = a === 'tu' ? 'thome' : 'home';
  render(); window.scrollTo(0, 0);
}
function chooseArea() { if (!canFund() || !canView('tuition')) return; setArea(AREA === 'tu' ? 'fund' : 'tu'); }
function vChooser() {
  document.querySelectorAll('nav [data-v]').forEach(b => { b.style.display = 'none'; });
  $('#main').innerHTML = `<div class="chooser"><h2>וואו ווילט איר אריינגיין?</h2><div class="choose2">
    <div class="choice c1" onclick="setArea('tu')"><i>🎓</i><h3>שכר לימוד</h3><p>עלטערן, תלמידים, Billing, סטעיטמענטס</p></div>
    <div class="choice c2" onclick="setArea('fund')"><i>💵</i><h3>פאנדרעיזינג</h3><p>נדבות, רעסיטס, פאנדרעיזערס, שולן, רופארטס</p></div></div></div>`;
}
function render() {
  if (!AREA) { vChooser(); return; }
  impInfo();
  const sb = document.querySelector('nav [data-v=settings]'); if (sb) sb.style.display = isAdmin() ? '' : 'none';
  if (view === 'settings' && !isAdmin()) view = 'home';
  if (AREA === 'tu' && (view === 'home' || (!TU_VIEWS.includes(view) && view !== 'todo' && view !== 'settings'))) view = 'thome';
  if (AREA === 'fund' && TU_VIEWS.includes(view)) view = 'home';
  if (!canView(view)) view = AREA === 'tu' ? 'thome' : 'home';
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x.dataset.v === view && (!x.dataset.a || x.dataset.a === AREA)));
  if (!JD) { vWelcome(); return; }
  counts();
  ({ home: vHome, thome: vTuHome, tubill: vTuBill, tustmt: vTuStmt, tuition: vTuition, rcpt: vRcpt, jrep: vJrep, todo: vTodo, fund: vFund, shuls: vShuls, today: vToday, pledges: vPledges, accounts: vAccounts, reports: vReports, settings: vSettings }[view] || vHome)();
  applyPerms();
}
// ---------- which main sections each user may open (team.perms; null = everything; admins always everything) ----------
const SECTIONS = [['accounts', '👥 נדבות'], ['rcpt', '🧾 רעסיטס/סטעיטמענטס'], ['todo', '✅ To-Do'], ['fund', '💵 פאנדרעיזינג חשבונות'], ['shuls', '🕍 שולן'], ['today', '📋 היינט צו בעטן'], ['pledges', '📞 פלעדזשעס'], ['reports', '📊 באריכטן'], ['jrep', '📑 רופארטס'], ['tuition', '🎓 שכר לימוד (גאנצער טייל)']];
const myPerms = () => { const t = TEAM.find(a => a.email.toLowerCase() === myEmail.toLowerCase()); return t && !t.is_admin && Array.isArray(t.perms) ? t.perms : null; };
const canView = v => { if (TU_VIEWS.includes(v)) v = 'tuition'; return v === 'home' || v === 'settings' || !myPerms() || myPerms().includes(v); };
const canFund = () => !myPerms() || myPerms().some(v => v !== 'tuition');
function applyPerms() {
  document.querySelectorAll('nav [data-v]').forEach(b => { if (b.dataset.v !== 'settings') b.style.display = canView(b.dataset.v) && (!b.dataset.a || b.dataset.a === AREA) ? '' : 'none'; });
  document.querySelectorAll('.tile[onclick]').forEach(t => { const m = t.getAttribute('onclick').match(/go\('(\w+)'\)/); if (m && !canView(m[1])) t.remove(); });
  if (!canView('todo')) document.querySelectorAll('.hcol.t2').forEach(e => e.remove());
  if (!canView('shuls')) document.querySelectorAll('.hcol.t4').forEach(e => e.remove());
}
function impInfo() {
  $('#impInfo').innerHTML = JD ? `JLS: ${new Date(JD.importedAt).toLocaleString()}<br>${JD.accounts.length.toLocaleString()} אקאונטס · ${esc(JD.companyName || 'Company ' + JD.company)}` : '';
}
function vWelcome() {
  $('#main').innerHTML = `<div class="welcome"><div class="logo3d big"><div class="in"><img src="logo.png" alt=""><i class="shine"></i></div></div><h1>ברוך הבא!</h1>
  <p>כדי אנצוהייבן, דארף די פראגראם די <b>Tuition.mdb</b> פייל פון JLS. מ'דארף דאס טון נאר איין מאל, און דערנאך יעדעס מאל וואס איר ווילט דערהיינטיגן.</p>
  <label class="drop" style="display:block;margin:20px 0">⬇️ לאזט אראפ די Tuition.mdb (אדער ZIP) דא, אדער קליקט צו אויסוועלן<input type="file" accept=".mdb,.zip" id="fpick0" hidden></label></div>`;
  $('#fpick0').onchange = e => { const f = e.target.files[0]; if (f) importFile(f); };
}
function counts() {
  $('#cToday').textContent = todayItems('mine').length || '';
  const mk = monthKey(); let n = 0;
  IDX.pl.forEach((g, c) => { if (g.open > 0.009 && !(S.call[c + '|' + mk] || {}).v) n++; });
  $('#cPl').textContent = n || '';
  const t = todayS(), nT = Object.values(S.task).filter(x => taskVisible(x) && !x.done && taskMine(x) && x.due && x.due <= t).length || '';
  $('#cTodo').textContent = AREA === 'tu' ? '' : nT; $('#cTodoT').textContent = AREA === 'tu' ? nT : '';
}

// ---------- TODAY ----------
function todayItems(filter) {
  const t = todayS(), out = [];
  const ok = who => filter === 'all' || (filter === 'mine' ? who === me : !who);
  const codes = new Set([...IDX.yg.keys(), ...Object.keys(S.acct).map(Number)]);
  codes.forEach(code => {
    if (!IDX.by.has(code)) return;
    const a = ask(code);
    if (a.next && a.next <= t && ok(a.st.assigned || '')) out.push({ kind: 'ask', code, due: a.next, who: a.st.assigned || '', vip: !!a.st.vip, w: (IDX.yg.get(code) || {}).total || 0, freq: a.freq });
  });
  Object.entries(S.task).forEach(([id, x]) => {
    if (!taskVisible(x) || x.done || !x.due || x.due > t || !(ok(x.who || '') || (x.who2 && ok(x.who2)))) return;
    out.push({ kind: 'task', id, task: x, code: x.code ? +x.code : null, due: x.due, who: x.who || '', vip: x.code ? !!(S.acct[x.code] || {}).vip : false, w: 1e12, hi: x.pri === 'hi' });
  });
  return out.sort((a, b) => (b.hi ? 1 : 0) - (a.hi ? 1 : 0) || (b.vip - a.vip) || (a.kind === 'task' ? -1 : 0) - (b.kind === 'task' ? -1 : 0) || b.w - a.w);
}
function vToday() {
  window._ln = lastNotes();
  const items = todayItems(ui.todayF), t = todayS();
  const upcoming = Object.entries(S.task).filter(([, x]) => taskVisible(x) && !x.done && x.due > t && x.due <= addDays(t, 14)).sort((a, b) => a[1].due.localeCompare(b[1].due));
  let owed = 0, nOwed = 0; IDX.pl.forEach(g => { if (g.dueNow > 0.009) { owed += g.dueNow; nOwed++; } });
  const yr = t.slice(0, 4); let ytd = 0; JD.payments.forEach(p => { if ((p[2] || '').slice(0, 4) === yr) ytd += p[3]; });
  const mine = todayItems('mine').length, all = todayItems('all').length, un = todayItems('none').length;
  $('#main').innerHTML = `
  <div class="stats">
    <div class="stat"><b>${all.toLocaleString()}</b><span>אויף דער ליסטע היינט (אלע)</span></div>
    <div class="stat click" onclick="go('pledges')"><b>${nOwed}</b><span>פלעדזשעס צו קאלן · ${money(owed)} פעליג</span></div>
    <div class="stat"><b>${money(ytd)}</b><span>${esc(JD.companyName)} באצאלט ${yr}</span></div>
    <div class="stat"><b>${IDX.yg.size.toLocaleString()}</b><span>נדבנים וואס האבן אמאל געגעבן</span></div>
  </div>
  <div class="row"><div><h2>To-Do פאר היינט</h2><p class="sub">ווער מ'דארף בעטן (לויט ווען לעצטנס געגעבן/געבעטן) + אייערע ארבעטן. דרינגענד און VIP ערשט, דערנאך די גרעסטע נדבנים.</p></div><div class="spacer"></div>
    <div class="chips">${[['mine', 'מיינע (' + mine + ')'], ['none', 'נישט צוגעטיילט (' + un + ')'], ['all', 'אלע (' + all + ')']].map(([k, l]) => `<button class="chip ${ui.todayF === k ? 'on' : ''}" onclick="ui.todayF='${k}';ui.todayN=50;render()">${l}</button>`).join('')}</div>
    <button class="btn gold" onclick="taskForm()">+ נייע ארבעט</button></div>
  ${items.length ? items.slice(0, ui.todayN).map(taskRow).join('') + (items.length > ui.todayN ? `<div class="more"><button class="btn ghost" onclick="ui.todayN+=50;render()">ווייז נאך (${items.length - ui.todayN} פארבליבן)</button></div>` : '') : '<div class="empty">🎉 גארנישט פאר היינט!</div>'}
  ${upcoming.length ? `<h3>קומענדיגע ארבעטן (2 וואכן)</h3>${upcoming.map(([id, x]) => `<div class="task"><span>📅</span><div><div class="t">${esc(x.title)}</div><div class="m"><span>📅 ${fmtDual(x.due)}</span><span>👤 ${esc(taskWho(x))}</span>${x.code ? `<a class="name" onclick="openAcct(${x.code})">${esc(acctName(+x.code))}</a>` : ''}</div></div><div class="acts"><button class="btn ghost sm" onclick="taskForm('${id}')">ענדער</button></div></div>`).join('')}` : ''}`;
}
function taskRow(x) {
  const late = x.due < todayS() ? daysBetween(x.due, todayS()) : 0;
  const a = x.code ? IDX.by.get(x.code) : null, g = x.code ? IDX.yg.get(x.code) : null, p = x.code ? IDX.pl.get(x.code) : null;
  const title = x.kind === 'ask' ? `<span class="tag ask">בעטן</span> <a class="name" onclick="openAcct(${x.code})">${esc(a.h || a.n)}</a><span class="heb">${esc(a.h ? a.n : '')}</span>`
    : `<span class="tag custom">ארבעט</span> ${esc(x.task.title)} ${a ? `· <a class="name" onclick="openAcct(${x.code})">${esc(a.h || a.n)}</a>` : ''}`;
  return `<div class="task"><div class="chk" title="געטון" onclick="${x.kind === 'ask' ? `askForm(${x.code})` : `taskDone('${x.id}')`}"></div>
  <div><div class="t">${title} ${x.vip ? '<span class="tag hi">⭐ VIP</span>' : ''} ${x.hi ? '<span class="tag hi">דרינגענד</span>' : ''} ${late ? `<span class="tag late">שפעט ${late > 365 ? Math.floor(late / 365) + ' יאר' : late + ' טעג'}</span>` : ''}</div>
  <div class="m">${a && a.ph[0] ? `<span>${callBtn(a.ph[0][1], x.code)} <span class="num">${esc(a.ph[0][1])}</span></span>` : ''}${g ? `<span>לעצטע מתנה: ${money(g.lastAmt)} · ${fmtD(g.last)}</span><span>סך הכל: ${money(g.total)}</span>` : ''}${p && p.open > 0.009 ? `<span class="bal">באלאנס ${money(p.open)}</span>` : ''}${x.kind === 'ask' ? `<span>${FREQ[x.freq] ? FREQ[x.freq][0] : ''}</span>` : ''}${x.task && x.task.note ? `<span>📝 ${esc(x.task.note)}</span>` : ''}${whoSel(x.kind === 'ask' ? `assign(${x.code},this.value)` : `assignTask('${x.id}',this.value)`, x.who)}${lastNoteHTML(x.code)}</div></div>
  <div class="acts">${x.code ? `<button class="btn ghost sm" onclick="noteForm(${x.code})">📝 נאטיץ</button>` : ''}${x.kind === 'ask' ? `<button class="btn sm" onclick="askForm(${x.code})">✓ געבעטן</button>` : `${x.task.rc ? `<button class="btn gold sm" onclick="rcOpenTask('${x.id}')">🖨️ רעסיטס</button>` : ''}${x.task.fm ? `<button class="btn gold sm" onclick="frMailTask('${x.id}')">✉️ שיק צום אפיס</button>` : ''}<button class="btn sm" onclick="taskDone('${x.id}')">✓ געטון</button><button class="btn ghost sm" onclick="taskForm('${x.id}')">ענדער</button>`}
  ${x.kind === 'ask' ? `<button class="btn ghost sm" title="איינמאליגע נדבה – נישט בעטן ווייטער" onclick="markOnce(${x.code})">🚫 איינמאליג</button>` : ''}<button class="btn ghost sm" onclick="snooze('${x.kind}','${x.kind === 'ask' ? x.code : x.id}',7)">אין א וואך</button><button class="btn ghost sm" onclick="snooze('${x.kind}','${x.kind === 'ask' ? x.code : x.id}',30)">אין א חודש</button></div></div>`;
}
function go(v) { if (!canView(v)) { toast('🔒 No access'); return; } view = v; document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x.dataset.v === v)); render(); }
async function snooze(kind, id, n) {
  const d = addDays(todayS(), n);
  if (kind === 'ask') { await emit('acct', id, { nextAsk: d }); await emit('hist', uid(), { code: +id, text: 'אפגעשטופט אויף ' + fmtD(d) }); }
  else await emitTask(id, { due: d });
  render(); toast('אפגעשטופט אויף ' + fmtD(d));
}
async function markOnce(code) {
  await emit('acct', code, { freq: 'once', nextAsk: '' });
  await emit('hist', uid(), { code: +code, text: '🚫 אנגעצייכנט אלס איינמאליגע נדבה – נישט בעטן ווייטער' });
  render();
  toast('✓ ' + acctName(+code) + ' וועט שוין נישט ארויפקומען. צוריקטוישן: אין זיין בלאט > ווי אפט בעטן.');
}
async function taskDone(id) {
  const x = S.task[id];
  await emitTask(id, { done: true, doneAt: todayS() });
  if (x.code && !x.priv) await emit('hist', uid(), { code: +x.code, text: '✓ ' + x.title });
  if (x.repeat && FREQ[x.repeat]) { const nid = uid(); await emitTask(nid, { title: x.title, due: addFreq(x.due && x.due > todayS() ? x.due : todayS(), x.repeat), who: x.who, who2: x.who2 || '', code: x.code, pri: x.pri, note: x.note, repeat: x.repeat, priv: !!x.priv, owner: x.owner || '' }); }
  render(); toast('✓ אפגעמארקירט');
}
function askForm(code) {
  const a = IDX.by.get(code), k = ask(code);
  modal(`<h2>וואס איז געווען מיט ${esc(a.h || a.n)}?</h2><p class="sub">${a.ph.map(p => callBtn(p[1], code) + ' ' + esc(p[0] + ' ' + p[1])).join(' · ')}</p>
  <div class="grid2"><label class="f">רעזולטאט<select id="res">${RESULTS.map(r => `<option>${r}</option>`).join('')}</select></label>
  <label class="f">סכום (אויב געגעבן/צוגעזאגט)<input id="amt" type="number" placeholder="$"></label>
  <label class="f">ווי אפט בעטן<select id="fq">${Object.entries(FREQ).map(([kk, v]) => `<option value="${kk}" ${kk === k.freq ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
  <label class="f">ווייטער בעטן${dateField('nx', '', { clear: true })}</label></div>
  <label class="f" style="margin-top:10px">נאטיץ<textarea id="nt" rows="2"></textarea></label>
  <p class="sub" style="margin-top:8px">💡 באצאלונגען זעלבסט פארשרייבט מען ווייטער אין JLS. דא איז נאר א נאטיץ.</p>
  <div class="row" style="justify-content:flex-end"><button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="saveAsk(${code})">Save</button></div>`, 'narrow');
}
async function saveAsk(code) {
  const res = $('#res').value, amt = +$('#amt').value || 0, fq = $('#fq').value, nt = $('#nt').value.trim(), t = todayS();
  let next = $('#nx').value;
  if (!next) next = (res === RESULTS[2] || res === RESULTS[3]) ? addDays(t, 3) : (addFreq(t, fq) || '');
  if (fq === 'once' && !$('#nx').value && !(res === RESULTS[2] || res === RESULTS[3])) next = '';
  await emit('acct', code, { freq: fq, nextAsk: next, lastAsk: t });
  await emit('hist', uid(), { code, text: res + (amt ? ' – ' + money(amt) : '') + (nt ? ' · ' + nt : ''), res, amt });
  closeM(); render(); toast('✓ אפגעהיטן. ווייטער בעטן: ' + (next ? fmtD(next) : '—'));
}
function taskForm(id, code) {
  const x = id ? S.task[id] : { title: '', due: todayS(), who: me, who2: '', code: code || '', pri: 'norm', note: '', repeat: '', priv: false };
  const canPriv = !id || !x.priv || (x.owner || '').toLowerCase() === myKey();
  modal(`<h2>${id ? 'ענדער ארבעט' : 'נייע ארבעט'}</h2><div class="grid2">
  <label class="f" style="grid-column:1/-1">וואס דארף מען טון?<input id="tt" value="${esc(x.title)}"></label>
  <label class="f">ביז ווען${dateField('td', x.due)}</label>
  <label class="f">פאר וועמען<select id="tw"><option value="">נישט צוגעטיילט</option>${USERS().map(u => `<option ${u === x.who ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
  <label class="f">👥 און אויך (צווייטער באניצער)<select id="tw2"><option value="">—</option>${USERS().map(u => `<option ${u === x.who2 ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
  ${canPriv ? `<label style="display:flex;gap:8px;align-items:center;font-size:14px;grid-column:1/-1"><input type="checkbox" id="tpv" ${x.priv ? 'checked' : ''}> 🔒 פריוואט – נאר איך זע דאס (פאר מיר אליין)</label>` : ''}
  <label class="f">אקאונט (נומער, אפציאנאל)<input id="tc" type="number" value="${x.code || ''}" placeholder="למשל 12345"></label>
  <label class="f">וויכטיגקייט<select id="tp"><option value="norm">נארמאל</option><option value="hi" ${x.pri === 'hi' ? 'selected' : ''}>דרינגענד</option></select></label>
  <label class="f">איבערחזרן<select id="tr"><option value="">נישט</option>${['m1', 'm3', 'm6', 'm12', 'yt'].map(k => `<option value="${k}" ${x.repeat === k ? 'selected' : ''}>${FREQ[k][0]}</option>`).join('')}</select></label>
  <label class="f" style="grid-column:1/-1">נאטיץ<input id="tn" value="${esc(x.note || '')}"></label></div>
  <div class="row" style="justify-content:flex-end;margin-top:14px">${id ? `<button class="btn red" onclick="delTask('${id}')">אויסמעקן</button><div class="spacer"></div>` : ''}<button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="saveTask('${id || ''}')">Save</button></div>`, 'narrow');
  setTimeout(() => $('#tt').focus(), 50);
}
async function saveTask(id) {
  const title = $('#tt').value.trim(); if (!title) { $('#tt').focus(); return; }
  const code = $('#tc').value ? +$('#tc').value : '';
  if (code && !IDX.by.has(code)) { toast('אקאונט #' + code + ' עקזיסטירט נישט'); return; }
  const priv = !!($('#tpv') && $('#tpv').checked);
  let who = $('#tw').value, who2 = $('#tw2').value;
  if (priv) { who = me; who2 = ''; }
  if (who2 === who) who2 = '';
  const p = { title, due: $('#td').value || todayS(), who, who2, code, pri: $('#tp').value, note: $('#tn').value.trim(), repeat: $('#tr').value, done: false, priv };
  if (!id && AREA === 'tu') p.area = 'tu';
  if (priv) p.owner = myEmail.toLowerCase();
  await emitTask(id || uid(), p);
  closeM(); render(); toast('✓ אפגעהיטן');
}
async function delTask(id) { await emitTask(id, { del: true }); closeM(); render(); }

// ---------- PLEDGES ----------
function vPledges() {
  window._ln = lastNotes();
  const mk = monthKey(), rows = [];
  IDX.pl.forEach((g, c) => { if (g.open > 0.009 && IDX.by.has(c)) rows.push({ c, g, called: (S.call[c + '|' + mk] || {}).v, a: IDX.by.get(c), y: IDX.yg.get(c), st: S.acct[c] || {} }); });
  rows.sort((x, y) => (x.called ? 1 : 0) - (y.called ? 1 : 0) || y.g.dueNow - x.g.dueNow);
  const done = rows.filter(r => r.called).length;
  const mName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  window._plRows = rows;
  $('#main').innerHTML = `<div class="row"><div><h2>פלעדזשעס – ${mName}</h2><p class="sub">אלע וואס האבן אן אפענעם ${esc(JD.companyName)} פלעדזש-באלאנס. די ליסטע הייבט זיך אן פון פריש יעדן חודש.</p></div><div class="spacer"></div><button class="btn ghost" onclick="csvPledges()">⬇ Excel</button></div>
  <div class="stats"><div class="stat"><b>${done} / ${rows.length}</b><span>געקאלט דעם חודש</span><div class="bar"><i style="width:${rows.length ? done / rows.length * 100 : 0}%"></i></div></div>
  <div class="stat"><b>${money(rows.reduce((s, r) => s + r.g.dueNow, 0))}</b><span>פעליג ביז סוף חודש</span></div>
  <div class="stat"><b>${money(rows.reduce((s, r) => s + r.g.open, 0))}</b><span>סך הכל אפען (אויך שפעטערדיגע)</span></div></div>
  <table><thead><tr><th></th><th>נאמען</th><th>טעלעפאנען</th><th>פעליג יעצט</th><th>סך הכל אפען</th><th>לעצטע באצאלונג</th><th>ווער קאלט / לעצטע נאטיץ</th><th></th></tr></thead><tbody>
  ${rows.map(r => `<tr style="${r.called ? 'opacity:.45' : ''}"><td>${r.called ? '✅' : '⬜'}</td>
   <td><a class="name" onclick="openAcct(${r.c})">${esc(r.a.h || r.a.n)}</a> ${r.st.vip ? '⭐' : ''}<div class="heb">${esc(r.a.h ? r.a.n : '')}</div></td>
   <td class="num" style="font-size:13px">${r.a.ph.slice(0, 2).map(p => callBtn(p[1], r.c) + ' ' + esc(p[1])).join('<br>')}</td>
   <td class="num bal">${money(r.g.dueNow)}</td><td class="num">${money(r.g.open)}</td>
   <td class="num" style="font-size:13px">${r.y && r.y.last ? money(r.y.lastAmt) + '<br>' + fmtD(r.y.last) : '—'}</td>
   <td style="font-size:13px">${r.g.sol ? esc(r.g.sol) + '<br>' : ''}${whoSel(`assign(${r.c},this.value)`, r.st.assigned || '')}${lastNoteHTML(r.c, true)}</td>
   <td><div class="acts" style="justify-content:flex-start">${r.called ? `<button class="btn ghost sm" onclick="setCalled(${r.c},false)">Undo</button>` : `<button class="btn sm" onclick="callForm(${r.c})">✓ געקאלט</button>`}<button class="btn ghost sm" onclick="noteForm(${r.c})">📝</button></div></td></tr>`).join('') || '<tr><td colspan="8" class="empty">קיין אפענע פלעדזשעס</td></tr>'}
  </tbody></table>`;
}
function callForm(c) {
  const a = IDX.by.get(c);
  modal(`<h2>געקאלט: ${esc(a.h || a.n)}</h2><div class="grid2">
  <label class="f">רעזולטאט<select id="cr"><option>וועט באצאלן</option><option>האט באצאלט</option><option>נישט געענטפערט</option><option>קאלן צוריק שפעטער</option><option>אנדערש</option></select></label>
  <label class="f">נאטיץ<input id="cn"></label></div>
  <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="saveCall(${c})">Save</button></div>`, 'narrow');
}
async function saveCall(c) {
  const r = $('#cr').value, n = $('#cn').value.trim();
  if (r === 'נישט געענטפערט' || r === 'קאלן צוריק שפעטער') {
    await emitTask(uid(), { title: 'קאלן צוריק פאר פלעדזש – ' + acctName(c), due: addDays(todayS(), 3), who: me, code: c, pri: 'norm', note: n });
  } else await setCalled(c, true, true);
  await emit('hist', uid(), { code: c, text: 'פלעדזש קאל: ' + r + (n ? ' · ' + n : '') });
  closeM(); render(); toast('✓ אפגעהיטן');
}
async function setCalled(c, v, quiet) { await emit('call', c + '|' + monthKey(), { v }); if (!quiet) render(); }
const r2 = n => Math.round((+n || 0) * 100) / 100;
const hebD = d => (d && d >= '1900') ? HEB.fmtHeb(d) : '';
function csvPledges() {
  xlsx([{ name: 'פלעדזשעס', rows: [['#', 'נאמען', 'English', 'טעלעפאן 1', 'טעלעפאן 2', 'אדרעס', 'פעליג יעצט', 'סך הכל אפען', 'לעצטע באצאלונג', 'סאליסיטאר', 'ווער קאלט', 'געקאלט']].concat(window._plRows.map(r => [r.c, r.a.h || r.a.n, r.a.n, (r.a.ph[0] || [])[1], (r.a.ph[1] || [])[1], r.a.a, r2(r.g.dueNow), r2(r.g.open), r.y ? r.y.last : '', r.g.sol, r.st.assigned || '', r.called ? 'יא' : ''])) }], 'pledges-' + monthKey() + '.xlsx');
}

// ---------- ACCOUNTS ----------
function filterAccounts() {
  const q = ui.accQ.trim().toLowerCase(), qd = q.replace(/\D/g, '');
  const words = q.split(/\s+/).filter(Boolean);
  let L = JD.accounts.filter(a => !words.length || words.every(w => a._s.includes(w)) || (qd.length >= 4 && a._s.includes(qd)));
  const f = ui.accF;
  if (f === 'yg') L = L.filter(a => IDX.yg.has(a.c));
  if (f === 'bal') L = L.filter(a => (IDX.pl.get(a.c) || {}).open > 0.009);
  if (f === 'vip') L = L.filter(a => (S.acct[a.c] || {}).vip);
  if (f === 'mine') L = L.filter(a => (S.acct[a.c] || {}).assigned === me);
  if (f === 'active') L = L.filter(a => !a.x);
  if (f === 'once') L = L.filter(a => ask(a.c).freq === 'once');
  if (ui.accShul) L = L.filter(a => (S.acct[a.c] || {}).shul === ui.accShul);
  if (ui.accTag) L = L.filter(a => tagsOf(a.c).includes(ui.accTag));
  if (ui.accSort === 'total') L.sort((x, y) => ((IDX.yg.get(y.c) || {}).total || 0) - ((IDX.yg.get(x.c) || {}).total || 0) || x._k.localeCompare(y._k, 'he'));
  else L.sort((x, y) => x._k.localeCompare(y._k, 'he') || (x.h || x.n).localeCompare(y.h || y.n, 'he'));
  return L;
}
function vAccounts() {
  const L = filterAccounts();
  window._accL = L;
  $('#main').innerHTML = `<div class="row"><div><h2>נדבות – אקאונטס</h2><p class="sub">אלע ${JD.accounts.length.toLocaleString()} אקאונטס פון JLS. זוכט אויף ענגליש אדער לשון קודש, לויט טעלעפאן, אדרעס אדער נומער.</p></div><div class="spacer"></div><button class="btn ghost" onclick="csvAcc()">⬇ Excel</button></div>
  <div class="row"><input id="q" placeholder="🔍 זוך..." value="${esc(ui.accQ)}" style="flex:1;min-width:240px;font-size:16px">
  <div class="chips">${[['all', 'אלע'], ['yg', 'YG נדבנים'], ['bal', 'מיט באלאנס'], ['vip', '⭐ VIP'], ['mine', 'מיינע'], ['once', '🚫 איינמאליגע'], ['active', 'אקטיוו']].map(([k, l]) => `<button class="chip ${ui.accF === k ? 'on' : ''}" onclick="ui.accF='${k}';ui.accN=100;vAccounts()">${l}</button>`).join('')}</div>
  ${allTags().length ? `<select class="mini" onchange="ui.accTag=this.value;ui.accN=100;vAccounts()"><option value="">🏷️ אלע פלאגס</option>${allTags().map(t => `<option value="${esc(t)}" ${t === ui.accTag ? 'selected' : ''}>🏷️ ${esc(t)}</option>`).join('')}</select>` : ''}
  ${shulList().length ? `<select class="mini" onchange="ui.accShul=this.value;ui.accN=100;vAccounts()"><option value="">🕍 אלע שולן</option>${shulList().map(x => `<option value="${x.id}" ${x.id === ui.accShul ? 'selected' : ''}>🕍 ${esc(x.name)}</option>`).join('')}</select>` : ''}</div>
  <div class="row" style="margin-bottom:6px"><span class="sub" style="margin:0">${L.length.toLocaleString()} געפונען · ריי:</span><div class="chips">${[['abc', 'א-ב (לעצטער נאמען)'], ['total', 'גרעסטע נדבנים']].map(([k, l]) => `<button class="chip ${ui.accSort === k ? 'on' : ''}" onclick="ui.accSort='${k}';vAccounts()">${l}</button>`).join('')}</div></div>
  <table class="acclist"><thead><tr><th>#</th><th>נאמען</th><th>טעלעפאן</th><th>אדרעס</th><th>YG סך הכל</th><th>לעצטע</th><th>באלאנס</th><th>ווייטער בעטן</th><th>שול</th></tr></thead><tbody>
  ${L.slice(0, ui.accN).map(a => { const g = IDX.yg.get(a.c), p = IDX.pl.get(a.c), k = ask(a.c), st = S.acct[a.c] || {}; return `<tr>
   <td class="num" style="color:var(--muted)">${a.c}</td><td><a class="name" onclick="openAcct(${a.c})">${esc(a.h || a.n)}</a> ${tagChips(a.c)} ${st.vip ? '⭐' : ''} ${a.x ? '<span class="tag gray">נישט אקטיוו</span>' : ''}<div class="heb">${esc(a.h ? a.n : '')}</div></td>
   <td class="num" style="font-size:13px">${a.ph[0] ? callBtn(a.ph[0][1], a.c) + ' ' + esc(a.ph[0][1]) : ''}</td><td style="font-size:13px"><span class="ltr">${esc(a.a)}</span></td>
   <td class="num">${g ? money(g.total) : ''}</td><td class="num" style="font-size:13px">${g && g.last ? fmtD(g.last) : ''}</td>
   <td class="num ${p && p.open > 0.009 ? 'bal' : ''}">${p && p.open > 0.009 ? money(p.open) : ''}</td>
   <td style="font-size:13px">${k.next ? (k.next <= todayS() ? '<span class="tag late">היינט</span>' : fmtDual(k.next)) : ''}</td><td style="font-size:13px">${esc(shulName(st.shul))}</td></tr>`; }).join('') || '<tr><td colspan="9" class="empty">נישט געפונען</td></tr>'}
  </tbody></table>${L.length > ui.accN ? `<div class="more"><button class="btn ghost" onclick="ui.accN+=200;vAccounts()">ווייז נאך</button></div>` : ''}`;
  const qi = $('#q'); qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length);
  let tm; qi.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { ui.accQ = qi.value; ui.accN = 100; vAccounts(); }, 250); };
}
function csvAcc() {
  xlsx([{ name: 'נדבנים', rows: [['#', 'נאמען', 'English', 'ווייב', 'טעלעפאן 1', 'טעלעפאן 2', 'אדרעס', 'YG סך הכל', 'וויפיל מאל', 'לעצטע מתנה', 'לעצטע סכום', 'אפענער באלאנס', 'ווייטער בעטן', 'VIP', 'אחראי', 'שול', 'נאטיצן']].concat(window._accL.map(a => { const g = IDX.yg.get(a.c) || {}, p = IDX.pl.get(a.c) || {}, st = S.acct[a.c] || {}; return [a.c, a.h || a.n, a.n, a.wh || a.w, (a.ph[0] || [])[1], (a.ph[1] || [])[1], a.a, r2(g.total), g.count || 0, g.last || '', g.last ? r2(g.lastAmt) : '', r2(p.open), ask(a.c).next || '', st.vip ? 'יא' : '', st.assigned || '', shulName(st.shul), st.notes || '']; })) }], 'nedavos-' + todayS() + '.xlsx');
}
// One donor: payments + pledges as two sheets
function xlsAcct(code) {
  const a = IDX.by.get(code), g = IDX.yg.get(code), p = IDX.pl.get(code), camp = n => JD.campaigns[n] || (n ? '#' + n : '');
  xlsx([
    { name: 'באצאלונגען', rows: [['טאג', 'טאג (אידיש)', 'סכום', 'קאמפעין', 'סארט', 'טשעק', 'סאליסיטאר', 'ריפאנד']].concat((g ? g.list : []).map(x => [x[2], hebD(x[2]), r2(x[3]), camp(x[6]), x[4], x[5], x[7], x[9] ? 'יא' : ''])) },
    { name: 'פלעדזשעס', rows: [['פעליג', 'סכום', 'באצאלט', 'באלאנס', 'קאמפעין', 'באשרייבונג']].concat((p ? p.list : []).map(x => [x[2], r2(x[3]), r2(x[4]), r2(x[5]), camp(x[6]), x[7]])) }
  ], (a.n || 'account').replace(/[^\w ]+/g, '').trim().replace(/ +/g, '-') + '-' + code + '.xlsx');
}

// ---------- ACCOUNT PAGE ----------
let acctTab = 'pay';
function openAcct(code) {
  code = +code;
  const a = IDX.by.get(code); if (!a) return;
  const g = IDX.yg.get(code), p = IDX.pl.get(code), k = ask(code), st = k.st, camp = n => JD.campaigns[n] || (n ? '#' + n : '');
  const hist = Object.entries(S.hist).filter(([, h]) => h.code === code).map(([, h]) => ({ d: (h.at || '').slice(0, 10), t: h.text, by: h.by, src: 'app' }))
    .concat(JD.notes.filter(n => n[0] === code).map(n => ({ d: n[1], t: n[2], by: n[3] + (n[4] ? ' · ' + n[4] : ''), src: 'JLS' })))
    .sort((x, y) => (y.d || '').localeCompare(x.d || ''));
  const tasks = Object.entries(S.task).filter(([, x]) => +x.code === code && taskVisible(x)).sort((x, y) => (x[1].done ? 1 : 0) - (y[1].done ? 1 : 0) || (x[1].due || '').localeCompare(y[1].due || ''));
  const tabBody = {
    pay: g ? `<table><thead><tr><th>טאג</th><th>סכום</th><th>קאמפעין</th><th>סארט</th><th>טשעק</th><th>סאליסיטאר</th><th>רעסיט</th></tr></thead><tbody>${g.list.map(x => `<tr><td class="num">${fmtD(x[2])}</td><td class="num">${money(x[3])}${x[9] ? ' <span class="tag late">ריפאנד</span>' : ''}</td><td>${esc(camp(x[6]))}</td><td>${esc(x[4])}</td><td class="num">${esc(x[5])}</td><td style="font-size:12px">${esc(x[7])}</td><td>${x[9] ? '' : `<button class="btn ghost sm" title="פרינט א רעסיט פאר די באצאלונג" onclick="rcPrintPay('${esc(String(x[0]))}')">🖨️</button>${rcPrinted(x) ? ` <small class="dim">✓ ${fmtD(rcPrinted(x))}</small>` : ''}`}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">קיין באצאלונגען צו ' + esc(JD.companyName) + '</div>',
    pl: p ? `<table><thead><tr><th>פעליג</th><th>סכום</th><th>באצאלט</th><th>באלאנס</th><th>קאמפעין</th><th>באשרייבונג</th></tr></thead><tbody>${p.list.map(x => `<tr style="${x[9] ? 'opacity:.5' : ''}"><td class="num">${fmtD(x[2])}</td><td class="num">${money(x[3])}</td><td class="num">${money(x[4])}</td><td class="num ${x[5] > 0.009 ? 'bal' : 'zero'}">${money(x[5])}</td><td>${esc(camp(x[6]))}</td><td style="font-size:12px">${esc(x[7])}${x[9] ? ' (Hold)' : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">קיין פלעדזשעס</div>',
    hist: `<div class="row"><input id="hn" placeholder="שרייבט א נאטיץ..." style="flex:1"><button class="btn" onclick="addNote(${code})">צולייגן</button></div><div class="hist">${hist.map(h => `<div><small>${fmtD(h.d)} · ${esc(h.by || '')} ${h.src === 'JLS' ? '<span class="tag gray">JLS</span>' : ''}</small><br>${esc(h.t)}</div>`).join('') || '<div class="sub">נאך קיין היסטאריע</div>'}</div>`,
    tasks: `<div class="row"><button class="btn gold sm" onclick="taskForm(null,${code})">+ נייע ארבעט</button></div>${tasks.map(([id, x]) => `<div class="ph"><span>${x.done ? '✅' : '⬜'} ${esc(x.title)} <small class="heb">${fmtD(x.due)} · ${esc(x.who || '')}</small></span><button class="btn ghost sm" onclick="taskForm('${id}')">ענדער</button></div>`).join('') || '<div class="sub">קיין ארבעטן</div>'}`
  };
  modal(`<div class="row" style="margin:0"><div><h2 style="margin:0">${esc(a.h || a.n)} ${st.vip ? '⭐' : ''}</h2><div class="heb" style="margin:0;font-size:16px">${esc(a.h ? a.n : '')}</div></div><div class="spacer"></div><span class="num" style="color:var(--muted)">#${code}</span><button class="btn ghost sm" onclick="acctMail(${code})">✉️ אימעיל</button><button class="btn ghost sm" onclick="xlsAcct(${code})">⬇ Excel</button><button class="btn ghost sm" onclick="closeM()">✕</button></div>
  <div class="stats" style="margin:14px 0">
   <div class="stat"><b>${g ? money(g.total) : '$0'}</b><span>${esc(JD.companyName)} סך הכל (${g ? g.count : 0})</span></div>
   <div class="stat"><b>${g && g.last ? money(g.lastAmt) : '—'}</b><span>לעצטע: ${g ? fmtD(g.last) : '—'}</span></div>
   <div class="stat"><b class="${p && p.open > 0.009 ? 'bal' : ''}">${money(p ? p.open : 0)}</b><span>אפענער פלעדזש</span></div>
   <div class="stat"><b style="font-size:19px">${k.next ? fmtDual(k.next) : '—'}</b><span>ווייטער בעטן</span></div></div>
  <div class="cols"><div class="box"><div class="k">פון JLS</div>
   ${a.w || a.wh ? `<div style="margin:4px 0">👩 <b>${esc(a.wh || a.w)}</b> <span class="heb">${esc(a.wh ? a.w : '')}</span></div>` : ''}
   <div style="margin:6px 0">🏠 <span class="ltr">${esc(a.a || '—')}</span></div>
   ${(a.em || []).map(e => `<div style="margin:4px 0">✉️ <span class="ltr">${esc(e)}</span></div>`).join('')}
   ${a.ph.map(x => `<div class="ph"><span>${esc(x[0] || 'טעלעפאן')}</span><span class="num">${esc(x[1])} ${callBtn(x[1], code)}</span></div>`).join('')}
   ${a.co ? `<div class="sub" style="margin-top:6px">${esc(a.co)}</div>` : ''}
   ${a.x ? '<span class="tag gray">נישט אקטיוו אין JLS</span>' : ''}</div>
  <div class="box"><div class="k">מיינע איינשטעלונגען</div><div class="grid2" style="margin-top:6px">
   <label class="f">ווי אפט בעטן<select id="af">${Object.entries(FREQ).map(([kk, v]) => `<option value="${kk}" ${kk === k.freq ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
   <label class="f">ווייטער בעטן${dateField('an', st.nextAsk || '', { clear: true })}</label>
   <label class="f" style="grid-column:1/-1">✉️ אימעיל<input id="aem" type="email" style="direction:ltr" value="${esc(emailOf(code))}" placeholder="${esc((a.em || [])[0] || 'name@example.com')}"></label>
   <label class="f">אחראי<select id="aa"><option value="">נישט צוגעטיילט</option>${USERS().map(u => `<option ${u === st.assigned ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
   <div style="grid-column:1/-1"><div class="k" style="margin-bottom:4px">🏷️ פלאגס (וועלכע סארט מענטש)</div>${tagEditor(code)}</div>
   <label class="f">🕍 געטראפן אין שול${shulSel('ash', st.shul || '')}</label>
   <label class="f">VIP<select id="av"><option value="">ניין</option><option value="1" ${st.vip ? 'selected' : ''}>⭐ יא</option></select></label>
   <label class="f" style="grid-column:1/-1">נאטיצן<textarea id="ao" rows="2">${esc(st.notes || '')}</textarea></label></div>
   <div class="row" style="margin:8px 0 0;justify-content:flex-end"><button class="btn gold sm" onclick="askForm(${code})">✓ געבעטן</button><button class="btn sm" onclick="saveAcct(${code})">Save</button></div></div></div>
  <div class="tabs2">${[['pay', 'באצאלונגען'], ['pl', 'פלעדזשעס'], ['hist', 'היסטאריע (' + hist.length + ')'], ['tasks', 'ארבעטן (' + tasks.filter(t => !t[1].done).length + ')']].map(([kk, l]) => `<button class="${acctTab === kk ? 'on' : ''}" onclick="acctTab='${kk}';openAcct(${code})">${l}</button>`).join('')}</div>
  <div class="scroll">${tabBody[acctTab]}</div>`);
}
async function saveAcct(code) {
  await emit('acct', code, { freq: $('#af').value, nextAsk: $('#an').value, assigned: $('#aa').value, vip: !!$('#av').value, notes: $('#ao').value, shul: $('#ash').value, email: $('#aem').value.trim().toLowerCase() === ((IDX.by.get(code) || {}).em || [])[0] ? '' : $('#aem').value.trim().toLowerCase() });
  openAcct(code); render(); toast('✓ אפגעהיטן');
}
async function addNote(code) {
  const t = $('#hn').value.trim(); if (!t) return;
  await emit('hist', uid(), { code, text: t }); openAcct(code);
}

// ---------- REPORTS ----------
// Payments by Jewish year and month (refunds left out)
function hebYears() {
  const Y = {};
  JD.payments.forEach(p => {
    if (!validD(p[2]) || p[9]) return;
    const h = HEB.parts(p[2]); if (!h) return;
    const y = Y[h.y] || (Y[h.y] = { y: h.y, t: 0, n: 0, m: {} });
    const m = y.m[h.m] || (y.m[h.m] = { t: 0, n: 0 });
    y.t += p[3]; y.n++; m.t += p[3]; m.n++;
  });
  return Object.values(Y).sort((a, b) => b.y - a.y);
}
// Credit-card plans from JLS (MCCInfo schedule columns): [code, freq, start, end, amount, campaign]
// ChargeFreq is free text in JLS; unknown values are counted as monthly and listed on the reports page.
const CC_HORIZON = 24;   // months ahead
function ccStep(f) {
  f = (f || '').toLowerCase();
  if (/once|one ?time|single|איינמאל/.test(f)) return null;
  if (/bi.?week|2 ?week|every other week/.test(f)) return { d: 14 };
  if (/week|וואך/.test(f)) return { d: 7 };
  if (/dail|day/.test(f)) return { d: 1 };
  if (/quarter|3 ?month/.test(f)) return { m: 3 };
  if (/semi|half|6 ?month|bi.?annual/.test(f)) return { m: 6 };
  if (/bi.?month|2 ?month/.test(f)) return { m: 2 };
  if (/year|annual|yearly|יאר/.test(f)) return { m: 12 };
  return { m: 1, guess: !/month|חודש/.test(f) };
}
function ccCharges() {
  const t = todayS(), until = addMonths(t, CC_HORIZON), out = [];
  (JD.ccplans || []).forEach(p => {
    const [code, freq, start, end, amt, camp] = p;
    if (!validD(start) || !IDX.by.has(code) || (validD(end) && end < t)) return;
    const st = ccStep(freq), last = validD(end) && end < until ? end : until;
    const push = d => out.push([null, code, d, amt, 0, amt, camp, '💳 ' + (freq || 'קרעדיט קארד'), '', 0]);
    if (!st) { if (start >= t && start <= last) push(start); return; }
    for (let k = 0, d = start; k < 5000 && d <= last; k++) {
      d = st.m ? addMonths(start, k * st.m) : addDays(start, k * st.d);
      if (d >= t && d <= last) push(d);
    }
  });
  return out;
}
function ccFreqs() { const m = {}; (JD.ccplans || []).forEach(p => { const k = p[1] || '—'; m[k] = (m[k] || 0) + 1; }); return m; }
// Still to come: open JLS charges (pledges, not on hold) due from today on + upcoming credit-card plan charges
function expPledges(hy, m) {
  const t = todayS();
  return JD.pledges.filter(c => !c[9] && c[5] > 0.009 && validD(c[2]) && c[2] >= t && IDX.by.has(c[1])).concat(ccCharges())
    .filter(c => hy == null || (() => { const h = HEB.parts(c[2]); return h && h.y === hy && (!m || h.m === m); })())
    .sort((a, b) => a[2].localeCompare(b[2]));
}
function expYears() {
  const Y = {};
  expPledges().forEach(c => {
    const h = HEB.parts(c[2]); if (!h) return;
    const y = Y[h.y] || (Y[h.y] = { y: h.y, t: 0, n: 0, m: {} });
    const m = y.m[h.m] || (y.m[h.m] = { t: 0, n: 0 });
    y.t += c[5]; y.n++; m.t += c[5]; m.n++;
  });
  return Y;
}
function vReports() {
  const byCamp = {};
  JD.payments.forEach(p => { const k = p[6] || 0; byCamp[k] = byCamp[k] || { t: 0, n: 0, last: '' }; byCamp[k].t += p[3]; byCamp[k].n++; if ((p[2] || '') > byCamp[k].last) byCamp[k].last = p[2]; });
  const useExp = ui.repExp !== false, EY = useExp ? expYears() : {}, A = hebYears();
  Object.keys(EY).forEach(y => { if (!A.some(a => a.y === +y)) A.push({ y: +y, t: 0, n: 0, m: {} }); });
  const HY = A.sort((a, b) => b.y - a.y), shown = HY.slice(0, ui.repN || 6);
  const ex = y => EY[y.y] || { t: 0, n: 0, m: {} }, max = Math.max(...HY.map(y => y.t + ex(y).t), 1);
  const expAll = Object.values(EY).reduce((s, y) => s + y.t, 0);
  const now = HEB.parts(todayS());
  const camps = Object.entries(byCamp).sort((a, b) => b[1].last.localeCompare(a[1].last)).slice(0, 15);
  const top = [...IDX.yg.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 25);
  const lapsed = [...IDX.yg.entries()].filter(([, g]) => g.last && g.last < addMonths(todayS(), -12) && g.last >= addMonths(todayS(), -36)).sort((a, b) => b[1].total - a[1].total).slice(0, 25);
  $('#main').innerHTML = `<div class="row"><div><h2>באריכטן – ${esc(JD.companyName)}</h2><p class="sub">באזירט אויף דער לעצטער JLS דאטא (${new Date(JD.importedAt).toLocaleDateString()}). ריפאנדס זענען נישט גערעכנט.</p></div><div class="spacer"></div><button class="btn ghost" onclick="xlsReports()">⬇ Excel</button></div>
  <div class="row" style="margin:18px 0 8px"><h3 style="margin:0">לויט אידישע יארן</h3><div class="spacer"></div>
   <label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" ${useExp ? 'checked' : ''} onchange="ui.repExp=this.checked;vReports()"> רעכן אויך וואס איז שוין אנגעשטעלט אויף די קומענדיגע חדשים (קרעדיט קארד / פלעדזשעס אין JLS)${expAll ? ' – <b class="num" style="color:var(--green)">' + money(expAll) + '</b>' : ''}</label></div>
  ${useExp ? (JD.ccplans ? (() => { const F = ccFreqs(), n = JD.ccplans.length, odd = Object.keys(F).filter(k => (ccStep(k) || {}).guess); return `<p class="sub">💳 ${n} קרעדיט קארד פלאנען פון JLS (${Object.entries(F).map(([k, v]) => esc(k) + ': ' + v).join(' · ')}), גערעכנט ${CC_HORIZON} חדשים פאראויס.${odd.length ? ' ⚠️ נישט באקאנט ווי אפט (גערעכנט ווי יעדן חודש): ' + odd.map(esc).join(', ') : ''}</p>`; })() : '<p class="sub">💳 צו זען די קרעדיט קארדס: דריקט <b>"⟳ דערהיינטיג פון JLS"</b> איינמאל.</p>') : ''}
  ${shown.map(y => { const e = ex(y); return `<div class="yrcard"><div class="row" style="margin:0 0 8px"><b class="yr">${HEB.gem(y.y)}</b><div class="bar" style="flex:1;height:12px;margin:0;display:flex"><i style="width:${y.t / max * 100}%"></i><i class="expbar" style="width:${e.t / max * 100}%"></i></div><b class="num">${money(y.t)}</b>${e.t ? `<b class="num" style="color:var(--green)">+${money(e.t)}</b>` : ''}<span class="sub" style="margin:0">${y.n.toLocaleString()} נדבות</span></div>
   <div class="mgrid" style="--n:${HEB.monthsOf(y.y).length + 1}">${HEB.monthsOf(y.y).map(m => { const v = y.m[m], w = e.m[m]; const cur = now && now.y === y.y && now.m === m; return `<div class="mbox${v || w ? ' click' : ' empty0'}${!v && w ? ' exp' : ''}${cur ? ' cur' : ''}"${v || w ? ` onclick="monthDonors(${y.y},'${m}')" title="ווייז די נדבנים"` : ''}><span>${HEB.MONTHS[m]}</span><b>${v ? money(v.t) : w ? money(w.t) : '—'}</b><small>${v ? v.n + ' נדבות' : w ? w.n + ' אנגעשטעלט' : ''}</small>${v && w ? `<small class="expl">+${money(w.t)} אנגעשטעלט</small>` : ''}</div>`; }).join('')}
    <div class="mbox tot click" onclick="monthDonors(${y.y},'')" title="ווייז די נדבנים פון גאנצן יאר"><span>ס"ה ${HEB.gem(y.y)}</span><b>${money(y.t + e.t)}</b><small>${e.t ? money(y.t) + ' + ' + money(e.t) + ' אנגעשטעלט' : y.n + ' נדבות'}</small></div></div></div>`; }).join('') || '<div class="empty">קיין באצאלונגען</div>'}
  ${HY.length > shown.length ? `<div class="more"><button class="btn ghost" onclick="ui.repN=(ui.repN||6)+6;vReports()">ווייז נאך יארן (${HY.length - shown.length})</button></div>` : ''}
  <div class="cols"><div>
  <h3>קאמפעינס (לעצטע)</h3><table><thead><tr><th>קאמפעין</th><th>באצאלונגען</th><th>סך הכל</th></tr></thead><tbody>${camps.map(([k, v]) => `<tr><td>${esc(+k ? (JD.campaigns[k] || '#' + k) : 'אן קאמפעין')}</td><td class="num">${v.n}</td><td class="num">${money(v.t)}</td></tr>`).join('')}</tbody></table>
  <h3>האבן אויפגעהערט געבן (1–3 יאר)</h3><table><thead><tr><th>נאמען</th><th>סך הכל</th><th>לעצטע</th></tr></thead><tbody>${lapsed.map(([c, g]) => `<tr><td><a class="name" onclick="openAcct(${c})">${esc(acctName(c))}</a></td><td class="num">${money(g.total)}</td><td class="num">${fmtD(g.last)}</td></tr>`).join('') || '<tr><td colspan="3" class="sub">קיינער</td></tr>'}</tbody></table></div>
  <div><h3>גרעסטע נדבנים</h3><table><thead><tr><th>נאמען</th><th>סך הכל</th><th>לעצטע</th></tr></thead><tbody>${top.map(([c, g]) => `<tr><td><a class="name" onclick="openAcct(${c})">${esc(acctName(c))}</a></td><td class="num">${money(g.total)}</td><td class="num">${fmtD(g.last)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
// Payments of one Hebrew month (or whole year when m is ''), grouped by donor
function monthPays(hy, m) {
  return JD.payments.filter(p => { if (!validD(p[2]) || p[9]) return false; const h = HEB.parts(p[2]); return h && h.y === hy && (!m || h.m === m); })
    .sort((a, b) => a[2].localeCompare(b[2]));
}
function monthDonors(hy, m) {
  const P = monthPays(hy, m), by = new Map();
  P.forEach(p => { const d = by.get(p[1]) || by.set(p[1], { c: p[1], t: 0, n: 0, list: [] }).get(p[1]); d.t += p[3]; d.n++; d.list.push(p); });
  const L = [...by.values()].sort((a, b) => b.t - a.t), tot = P.reduce((s, p) => s + p[3], 0);
  const title = (m ? HEB.MONTHS[m] + ' ' : 'גאנץ יאר ') + HEB.gem(hy);
  const E = ui.repExp !== false ? expPledges(hy, m) : [], etot = E.reduce((s, c) => s + c[5], 0);
  modal(`<div class="row"><div><h2 style="margin:0">📅 ${title}</h2><p class="sub" style="margin:2px 0 0">${L.length} נדבנים · ${P.length} נדבות · <b>${money(tot)}</b>${E.length ? ` · <b style="color:var(--green)">+${money(etot)} אנגעשטעלט</b>` : ''}</p></div><div class="spacer"></div>
   <button class="btn ghost sm" onclick="xlsMonth(${hy},'${m}')">⬇ Excel</button><button class="btn ghost sm" onclick="closeM()">✕</button></div>
   <div class="scroll" style="max-height:65vh;margin-top:10px"><table><thead><tr><th>#</th><th>נאמען</th><th>טעלעפאן</th><th>נדבות</th><th>סך הכל</th></tr></thead><tbody>
   ${L.map(d => { const a = IDX.by.get(d.c) || { n: '#' + d.c, h: '', ph: [] }; return `<tr><td class="num" style="color:var(--muted)">${d.c}</td><td><a class="name" onclick="closeM();openAcct(${d.c})">${esc(a.h || a.n)}</a><div class="heb">${esc(a.h ? a.n : '')}</div></td>
    <td class="num" style="font-size:13px">${a.ph[0] ? callBtn(a.ph[0][1], d.c) + ' ' + esc(a.ph[0][1]) : ''}</td>
    <td style="font-size:12.5px">${d.list.map(p => `${fmtD(p[2])}: <b class="num">${money(p[3])}</b>`).join('<br>')}</td><td class="num"><b>${money(d.t)}</b></td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">נאך קיין נדבות</td></tr>'}
   </tbody></table>
   ${E.length ? `<h3 style="color:var(--green)">📅 נאך צו קומען – אנגעשטעלט אין JLS (${E.length} · ${money(etot)})</h3><table><thead><tr><th>#</th><th>נאמען</th><th>טעלעפאן</th><th>ווען</th><th>סכום</th><th>באשרייבונג</th></tr></thead><tbody>
   ${E.map(c => { const a = IDX.by.get(c[1]); return `<tr><td class="num" style="color:var(--muted)">${c[1]}</td><td><a class="name" onclick="closeM();openAcct(${c[1]})">${esc(a.h || a.n)}</a><div class="heb">${esc(a.h ? a.n : '')}</div></td><td class="num" style="font-size:13px">${a.ph[0] ? callBtn(a.ph[0][1], c[1]) + ' ' + esc(a.ph[0][1]) : ''}</td><td class="num" style="font-size:13px">${fmtD(c[2])}</td><td class="num"><b style="color:var(--green)">${money(c[5])}</b></td><td style="font-size:12px">${esc(c[7] || '')}</td></tr>`; }).join('')}</tbody></table>` : ''}</div>`);
}
function xlsMonth(hy, m) {
  const P = monthPays(hy, m), by = new Map(), camp = n => JD.campaigns[n] || (n ? '#' + n : '');
  P.forEach(p => { const d = by.get(p[1]) || by.set(p[1], { c: p[1], t: 0, n: 0 }).get(p[1]); d.t += p[3]; d.n++; });
  const who = c => { const a = IDX.by.get(c) || {}; return [c, a.h || a.n || '', a.n || '', ((a.ph || [])[0] || [])[1] || '', a.a || '']; };
  xlsx([
    { name: 'נדבנים', rows: [['#', 'נאמען', 'English', 'טעלעפאן', 'אדרעס', 'וויפיל נדבות', 'סך הכל']].concat([...by.values()].sort((a, b) => b.t - a.t).map(d => who(d.c).concat([d.n, r2(d.t)]))) },
    { name: 'אלע נדבות', rows: [['טאג', 'טאג (אידיש)', '#', 'נאמען', 'English', 'סכום', 'קאמפעין', 'סארט', 'טשעק', 'סאליסיטאר']].concat(P.map(p => { const a = IDX.by.get(p[1]) || {}; return [p[2], hebD(p[2]), p[1], a.h || a.n || '', a.n || '', r2(p[3]), camp(p[6]), p[4], p[5], p[7]]; })) },
    { name: 'אנגעשטעלט', rows: [['ווען', 'ווען (אידיש)', '#', 'נאמען', 'English', 'טעלעפאן', 'סכום', 'קאמפעין', 'באשרייבונג']].concat((ui.repExp !== false ? expPledges(hy, m) : []).map(c => { const a = IDX.by.get(c[1]) || {}; return [c[2], hebD(c[2]), c[1], a.h || a.n || '', a.n || '', ((a.ph || [])[0] || [])[1] || '', r2(c[5]), camp(c[6]), c[7]]; })) }
  ], 'donors-' + hy + (m ? '-' + m.replace(/\s+/g, '') : '') + '.xlsx');
}
function xlsReports() {
  const HY = hebYears(), M = HEB.MONTHS, EY = expYears();
  const cols = ['Tishri', 'Heshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar', 'Adar II', 'Nisan', 'Iyar', 'Sivan', 'Tamuz', 'Av', 'Elul'];
  const val = (y, m) => { if (m === 'Adar') { const a = y.m['Adar'] || y.m['Adar I']; return a ? r2(a.t) : ''; } const v = y.m[m]; return v ? r2(v.t) : ''; };
  const cnt = (y, m) => { if (m === 'Adar') { const a = y.m['Adar'] || y.m['Adar I']; return a ? a.n : ''; } const v = y.m[m]; return v ? v.n : ''; };
  const head = ['יאר'].concat(cols.map(m => m === 'Adar' ? 'אדר / אדר א\'' : M[m]), ['ס"ה']);
  const top = [...IDX.yg.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 200);
  const lapsed = [...IDX.yg.entries()].filter(([, g]) => g.last && g.last < addMonths(todayS(), -12) && g.last >= addMonths(todayS(), -36)).sort((a, b) => b[1].total - a[1].total);
  const byCamp = {}; JD.payments.forEach(p => { const k = p[6] || 0; byCamp[k] = byCamp[k] || { t: 0, n: 0, last: '' }; byCamp[k].t += p[3]; byCamp[k].n++; if ((p[2] || '') > byCamp[k].last) byCamp[k].last = p[2]; });
  const who = c => { const a = IDX.by.get(c) || {}; return [c, a.h || a.n || '', a.n || '', ((a.ph || [])[0] || [])[1] || '']; };
  xlsx([
    { name: 'סכומים לויט חדשים', rows: [head].concat(HY.map(y => [HEB.gem(y.y)].concat(cols.map(m => val(y, m)), [r2(y.t)]))) },
    { name: 'אנגעשטעלט לויט חדשים', rows: [head].concat(Object.values(EY).sort((a, b) => a.y - b.y).map(y => [HEB.gem(y.y)].concat(cols.map(m => val(y, m)), [r2(y.t)]))) },
    { name: 'צאל נדבות לויט חדשים', rows: [head].concat(HY.map(y => [HEB.gem(y.y)].concat(cols.map(m => cnt(y, m)), [y.n]))) },
    { name: 'קאמפעינס', rows: [['קאמפעין', 'באצאלונגען', 'סך הכל', 'לעצטע']].concat(Object.entries(byCamp).sort((a, b) => b[1].last.localeCompare(a[1].last)).map(([k, v]) => [+k ? (JD.campaigns[k] || '#' + k) : 'אן קאמפעין', v.n, r2(v.t), v.last])) },
    { name: 'גרעסטע נדבנים', rows: [['#', 'נאמען', 'English', 'טעלעפאן', 'סך הכל', 'וויפיל מאל', 'לעצטע']].concat(top.map(([c, g]) => who(c).concat([r2(g.total), g.count, g.last]))) },
    { name: 'אויפגעהערט געבן', rows: [['#', 'נאמען', 'English', 'טעלעפאן', 'סך הכל', 'וויפיל מאל', 'לעצטע']].concat(lapsed.map(([c, g]) => who(c).concat([r2(g.total), g.count, g.last]))) }
  ], 'reports-' + todayS() + '.xlsx');
}

// ---------- SETTINGS (admin only) ----------
const FREQ_EN = { m1: 'Every month', m3: 'Every 3 months', m6: 'Every 6 months', m12: 'Once a year', yt: 'Before every Yom Tov', once: 'One-time gift – do not ask again', none: 'Do not ask automatically' };
function vSettings() {
  const s = SET();
  $('#main').innerHTML = `<div dir="ltr" style="text-align:left"><h2>Settings</h2><p class="sub">Only the admin sees this page.</p>
  <div class="cols"><div class="box"><h3 style="margin-top:0">Users</h3>
   <p class="sub">Only the e-mails on this list can log in. To add a user: add the e-mail here; the user opens the website, clicks <b>"ערשטע מאל דא?"</b> and makes a password.</p>
   <table><thead><tr><th style="text-align:left">Name</th><th style="text-align:left">E-mail</th><th style="text-align:left">📱 Cell phone (SMS)</th><th>Admin</th><th style="text-align:left">🔒 Access</th><th></th></tr></thead><tbody id="ulist">
   ${TEAM.map(t => urow(t)).join('')}</tbody></table>
   <div class="row" style="margin-top:10px"><button class="btn ghost sm" onclick="addURow()">+ New user</button><div class="spacer"></div><button class="btn" onclick="saveUsers()">Save users</button></div>
   <div id="uerr" class="bal" style="font-size:13px"></div>
   <h3>Automatic asking</h3>
   <label class="f" style="margin-bottom:8px">How often to ask donors that have no setting of their own<select id="sf">${Object.keys(FREQ).map(k => `<option value="${k}" ${k === s.defFreq ? 'selected' : ''}>${FREQ_EN[k] || FREQ[k][0]}</option>`).join('')}</select></label>
   <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px;font-size:14px"><input type="checkbox" id="so" ${s.skipOnce ? 'checked' : ''}> <span>Donors who gave <b>only once</b> – do not ask automatically (can still be set per donor)</span></label>
   <label class="f" style="margin-bottom:8px">Only donors who gave in the last ... years<input id="sy" type="number" min="1" max="50" value="${s.maxYears || 5}"></label>
   <label class="f" style="margin-bottom:8px">JLS company number (payments and pledges)<input id="sc" type="number" value="${s.company || 32}"></label>
   <label class="f" style="margin-bottom:8px">JLS tuition company number (0 = off)<input id="stc" type="number" value="${s.tuitionCompany === 0 ? 0 : (s.tuitionCompany || 15)}"></label>
   <button class="btn" onclick="saveSettings()">Save</button></div>
  <div class="box"><h3 style="margin-top:0">Last JLS update</h3><p class="sub">${new Date(JD.importedAt).toLocaleString()} · ${esc(JD.importedBy || '')} · ${esc((JD.source || {}).name || '')}<br>${JD.accounts.length.toLocaleString()} accounts · ${JD.payments.length.toLocaleString()} payments · ${JD.pledges.length.toLocaleString()} pledges · ${esc(JD.companyName)}</p>
   <h3>Import from the desktop version</h3>
   <p class="sub">If you worked with the desktop version: choose the file <span class="path">data\\log.jsonl</span>, and all to-dos, notes and reminders from there are copied over.</p>
   <label class="btn ghost sm">📥 Choose log.jsonl<input type="file" accept=".jsonl,.txt" hidden onchange="importDesktopLog(this.files[0])"></label>
   <h3>🔍 JLS tables (names only)</h3>
   <p class="sub">Shows the names of all tables and columns in Tuition.mdb – <b>no</b> data from them. Nothing leaves this computer.</p>
   <label class="btn ghost sm">🔍 Choose Tuition.mdb<input type="file" accept=".mdb,.zip" hidden onchange="jlsSchema(this.files[0])"></label>
   <h3>📱 SMS from a cell phone</h3>
   <p class="sub">Text the system's SMS number. Only the cell phones on the users list get an answer.</p>
   <table><tbody>${[['שווארץ', 'All info (name, phone, address, gifts)'], ['טעלעפאן שווארץ', 'Phone numbers'], ['אדרעס שווארץ', 'Address'], ['געגעבן שווארץ', 'What he gave in the last year'], ['באלאנס שווארץ', 'Open pledge balance'], ['היינט', 'My to-dos for today'], ['פלעדזשעס', 'Pledges to call this month'], ['געקאלט שווארץ', 'Mark as called'], ['טאדו קויפן פאפיר', 'New item in my to-do list'], ['נאטיץ שווארץ: וועט געבן נאך פסח', 'Note on the donor'], ['שול', 'Next shul'], ['?', 'The list of commands']].map(([c, d]) => `<tr><td dir="rtl" style="text-align:right"><b>${esc(c)}</b></td><td style="font-size:13px">${esc(d)}</td></tr>`).join('')}</tbody></table>
   <p class="sub" style="margin-top:6px">If several people have the same name, it answers with a list of #numbers; then send for example <b>#1234</b>.</p></div></div></div>`;
}
function urow(t) {
  t = t || { email: '', name: '', is_admin: false };
  const pv = Array.isArray(t.perms) ? t.perms : null;
  return `<tr data-old="${esc(t.email)}" data-perms="${esc(pv ? JSON.stringify(pv) : '')}"><td><input class="un" value="${esc(t.name)}" style="width:100%"></td><td><input class="ue" type="email" value="${esc(t.email)}" style="width:100%;direction:ltr"></td><td><input class="up" type="tel" value="${esc(t.phone || '')}" placeholder="845-555-1234" style="width:100%;direction:ltr"></td><td style="text-align:center"><input class="ua" type="checkbox" ${t.is_admin ? 'checked' : ''}></td><td><button class="btn ghost sm upb" onclick="permForm(this.closest('tr'))">${permLabel(pv)}</button></td><td><button class="btn red sm" onclick="this.closest('tr').remove()">✕</button></td></tr>`;
}
const FUND_SECTIONS = () => SECTIONS.filter(([v]) => v !== 'tuition');
const permLabel = pv => {
  if (!pv) return '✓ Both · all';
  const tu = pv.includes('tuition'), nf = pv.filter(v => v !== 'tuition').length, all = FUND_SECTIONS().length;
  if (tu && !nf) return '🎓 Tuition only';
  if (!tu) return '💵 Fundraising only' + (nf < all ? ' · ' + nf + ' of ' + all : '');
  return '✓ Both' + (nf < all ? ' · ' + nf + ' of ' + all : '');
};
// Edit one user's access (kept on the row until "Save users"): which part(s) of the program, and which fundraising sections
function permForm(tr) {
  window._permTr = tr;
  const cur = tr.dataset.perms ? JSON.parse(tr.dataset.perms) : null, name = tr.querySelector('.un').value || tr.querySelector('.ue').value;
  const tu = !cur || cur.includes('tuition'), fu = !cur || cur.some(v => v !== 'tuition');
  const area = tu && fu ? 'both' : tu ? 'tu' : 'fund';
  const radio = (v, l) => `<label style="display:flex;gap:8px;align-items:center;font-size:15px;margin:4px 0"><input type="radio" name="parea" value="${v}" ${area === v ? 'checked' : ''} onchange="permAreaCh()"> ${l}</label>`;
  modal(`<div dir="ltr" style="text-align:left"><h2>🔒 Access for ${esc(name)}</h2>
   ${tr.querySelector('.ua').checked ? '<p class="sub"><b>This user is an admin</b> – admins always see everything; the choice below only matters if admin is turned off.</p>' : ''}
   <h3 style="margin:10px 0 4px">Which part of the program?</h3>
   ${radio('both', '🎓 + 💵 Both – tuition and fundraising')}${radio('tu', '🎓 Tuition (שכר לימוד) only')}${radio('fund', '💵 Fundraising only')}
   <div id="pfund"><h3 style="margin:14px 0 4px">Fundraising sections</h3><p class="sub">The home page is always shown.</p>
   <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin:10px 0">${FUND_SECTIONS().map(([v, l]) => `<label style="display:flex;gap:8px;align-items:center;font-size:14px" dir="rtl"><input type="checkbox" class="pcb" value="${v}" ${!cur || cur.includes(v) || !fu ? 'checked' : ''}> ${l}</label>`).join('')}</div>
   <div class="row"><button class="btn ghost sm" onclick="document.querySelectorAll('.pcb').forEach(c=>c.checked=true)">All</button><button class="btn ghost sm" onclick="document.querySelectorAll('.pcb').forEach(c=>c.checked=false)">None</button></div></div>
   <div class="row" style="margin-top:12px"><div class="spacer"></div><button class="btn ghost" onclick="closeM()">Back</button><button class="btn" onclick="permSet()">OK</button></div>
   <p class="sub" style="margin-top:8px">Then press <b>Save users</b>.</p></div>`, 'narrow');
  permAreaCh();
}
function permAreaCh() { const a = (document.querySelector('input[name=parea]:checked') || {}).value; $('#pfund').style.display = a === 'tu' ? 'none' : ''; }
function permSet() {
  const tr = window._permTr, a = document.querySelector('input[name=parea]:checked').value;
  const f = [...document.querySelectorAll('.pcb:checked')].map(c => c.value);
  if (a !== 'tu' && !f.length) { toast('Pick at least one fundraising section'); return; }
  const pv = a === 'tu' ? ['tuition'] : a === 'fund' ? f : (f.length === FUND_SECTIONS().length ? null : f.concat('tuition'));
  tr.dataset.perms = pv ? JSON.stringify(pv) : '';
  tr.querySelector('.upb').textContent = permLabel(pv);
  closeM(); toast('Press "Save users" to keep it');
}
function addURow() { $('#ulist').insertAdjacentHTML('beforeend', urow()); }
async function saveUsers() {
  const err = t => { $('#uerr').textContent = t; };
  const rows = [...document.querySelectorAll('#ulist tr')], out = [];
  for (const r of rows) {
    const name = r.querySelector('.un').value.trim(), email = r.querySelector('.ue').value.trim().toLowerCase(), admin = r.querySelector('.ua').checked, phone = r.querySelector('.up').value.trim();
    if (!name && !email) continue;
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return err('Every user needs a name and a valid e-mail');
    if (out.some(a => a.email === email)) return err('The same e-mail appears twice');
    if (out.some(a => a.name === name)) return err('The same name appears twice');
    if (phone && phone.replace(/\D/g, '').length < 10) return err('The cell phone number of ' + name + ' is incomplete (10 digits)');
    out.push({ email, name, is_admin: admin, phone, perms: r.dataset.perms ? JSON.parse(r.dataset.perms) : null, old: r.dataset.old.toLowerCase() });
  }
  if (!out.some(a => a.is_admin)) return err('At least one admin must remain');
  const mine = out.find(a => a.email === myEmail.toLowerCase());
  if (!mine || !mine.is_admin) return err('You cannot remove yourself or your own admin rights');
  try {
    const renames = {};
    for (const t of TEAM) { const n = out.find(a => a.email === t.email.toLowerCase()); if (n && n.name !== t.name) renames[t.name] = n.name; }
    const keep = out.map(a => a.email);
    for (const t of TEAM) if (!keep.includes(t.email.toLowerCase())) await q(sb.from('team').delete().eq('email', t.email));
    const hasPhone = TEAM.some(t => 'phone' in t), hasPerms = TEAM.some(t => 'perms' in t);
    if (!hasPerms && out.some(a => a.perms)) return err('To limit sections, first run this in Supabase > SQL Editor:  alter table public.team add column if not exists perms text[];');
    if (!hasPhone && out.some(a => a.phone)) return err('צו אפהיטן סעלפאון נומערן דארף מען ערשט לויפן די SQL פון v1.6 אין Supabase (זעט SETUP.sql טייל 6)');
    for (const a of out) await q(sb.from('team').upsert(Object.assign({ email: a.email, name: a.name, is_admin: a.is_admin }, hasPhone ? { phone: a.phone || null } : {}, hasPerms ? { perms: a.perms } : {})));
    for (const [o, n] of Object.entries(renames)) {
      for (const [c, st] of Object.entries(S.acct)) if (st.assigned === o) await emit('acct', c, { assigned: n });
      for (const [id, t] of Object.entries(S.task)) { if (t.who === o) await emitTask(id, { who: n }); if (t.who2 === o) await emitTask(id, { who2: n }); }
    }
    await loadTeam(); setupUser(); render(); toast('✓ באניצער אפגעהיטן');
  } catch (e) { err(e.message || String(e)); }
}
async function importDesktopLog(file) {
  if (!file) return;
  const lines = (await file.text()).split('\n').map(l => l.trim()).filter(Boolean);
  const evs = [];
  for (const l of lines) { try { const e = JSON.parse(l); if (e.k && e.k !== 'settings' && S[e.k]) evs.push({ k: e.k, eid: String(e.id), p: e.p, by: e.by || me }); } catch (e) { } }
  if (!evs.length) { toast('גארנישט געפונען'); return; }
  busy('נעמט אריבער ' + evs.length + ' ענדערונגען...');
  try { for (let i = 0; i < evs.length; i += 500) await q(sb.from('events').insert(evs.slice(i, i + 500))); await pullLog(); busy(false); render(); toast('✓ אריבערגענומען ' + evs.length + ' ענדערונגען'); }
  catch (e) { busy(false); toast('⚠️ ' + (e.message || e)); }
}
async function jlsSchema(file) {
  if (!file) return;
  try {
    busy('לייענט די נעמען פון די טאבעלעס...');
    let buf = new Uint8Array(await file.arrayBuffer());
    if (buf[0] === 0x50 && buf[1] === 0x4B) buf = await unzipMdb(buf);
    await new Promise(r => setTimeout(r, 30));
    const L = JLS.schema(buf); buf = null;
    busy(false);
    const hot = t => /cc|credit|card|recur|sched|auto|charge|plan|install/i.test(t.name + ' ' + t.cols.join(' '));
    const txt = L.map(t => (hot(t) ? '* ' : '') + t.name + ' (' + t.rows + '): ' + t.cols.join(', ')).join('\n');
    window._schemaTxt = txt;
    modal(`<div class="row"><h2 style="margin:0">🔍 JLS טאבעלעס (${L.length})</h2><div class="spacer"></div><button class="btn sm" onclick="navigator.clipboard.writeText(window._schemaTxt).then(()=>toast('✓ קאפירט'))">📋 קאפיר אלעס</button><button class="btn ghost sm" onclick="closeM()">✕</button></div>
     <p class="sub">נאר נעמען פון טאבעלעס און קאלומס, און וויפיל שורות. ★ = מעגליך שייך צו קרעדיט קארדס / פלאנען.</p>
     <div class="scroll" style="max-height:65vh"><table><thead><tr><th>טאבעלע</th><th>שורות</th><th>קאלומס</th></tr></thead><tbody>${L.map(t => `<tr style="${hot(t) ? 'background:#fff8e6' : ''}"><td class="ltr"><b>${hot(t) ? '★ ' : ''}${esc(t.name)}</b></td><td class="num">${t.rows}</td><td class="ltr" style="font-size:12px;white-space:normal">${esc(t.cols.join(', '))}</td></tr>`).join('')}</tbody></table></div>`);
  } catch (e) { busy(false); toast('⚠️ ' + errMsg(e)); }
}
async function saveSettings() {
  const old = SET().company || 32, nc = +$('#sc').value || 32;
  await emit('settings', 's', { defFreq: $('#sf').value, maxYears: +$('#sy').value || 5, company: nc, tuitionCompany: $('#stc').value === '' ? 15 : +$('#stc').value, skipOnce: $('#so').checked });
  toast(nc !== old ? 'Company changed – update from JLS for it to take effect' : '✓ Saved');
  render();
}

// ---------- modal ----------
function modal(h, cls) { const m = $('#modal'); m.className = 'modal' + (cls ? ' ' + cls : ''); m.innerHTML = h; initDateFields(m); $('#ov').classList.add('on'); }
function closeM() { $('#ov').classList.remove('on'); }

const setHH = () => document.documentElement.style.setProperty('--hh', document.querySelector('header').offsetHeight + 'px');
window.addEventListener('resize', setHH); window.addEventListener('load', setHH); setHH();
boot();
