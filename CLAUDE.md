# YG Fund – fundraising web app for Yeshivas Maharit D'Satmar

## Talk to the user in Yiddish
The owner speaks Yiddish (Hasidic spelling, with English loanwords) and is not technical. Reply in Yiddish. Give short, numbered, click-by-click steps. Code, comments and commit messages are in English. The whole UI is Yiddish/Hebrew, right-to-left (RTL).

## What this is
A static web app (no build step) hosted on **Netlify**, at https://yeshivasmaharitdsatmar.netlify.app.
- Netlify should auto-deploy this repo from the root folder. There is no build command, and the publish directory is the root.
- After a change is pushed, the site updates in about a minute. Tell the user to press Ctrl+F5.

Backend is **Supabase** (project `qrudivrakwoathgbzrwd`).
- `config.js` holds the project URL and the **publishable** key. That key is public by design; security comes from Row Level Security.
- **Never** put a `service_role` or `sb_secret_` key in this repo.

`SETUP.sql` is the database schema. The user already ran it. If you change the schema, give the user a new SQL snippet to paste into **Supabase > SQL Editor > New query > Run**.

## Data model
- **JLS Solutions** (the user's existing Windows donor software) stores everything in an Access/Jet 4 file, `Tuition.mdb` (~460 MB).
  - The user drags that file into the app (header button "דערהיינטיג פון JLS").
  - `jls.js` parses it **in the browser**. It is a pure-JS Jet 4 reader, tested on the real file.
  - The parser extracts a slim dataset: all accounts (names in English and Hebrew, default address, phones), plus payments and pledges **only for company 32 = "YG Fund"** (pledge index 11 = DateE, entry date). Accounts get `em` (e-mails: MPhone values with @ and MAInfo values that look like e-mails). Also `udf` ([code, type, value] from MAInfo, only UDF* types) and `camphits` ([campaign, code, 1 paid | 2 pledged] for all companies, last ~4 years).
  - The dataset is gzipped and uploaded to Supabase Storage at bucket `jls`, file `jls.json.gz`. Table `jls_meta` holds a version counter, and clients reload when it changes.
  - Real numbers from the file: 21,104 accounts, 8,111 YG payments, 4,365 YG pledges, 1,380 YG donors (564 of them gave only once).
- **NEVER** read or import the JLS tables `CCTransactions` or `MChecking`, the columns `Members.SSNumF` and `Members.SSNumW`, or the tables `Users` and `MWebLogin`. These hold card, bank, SSN and password data.
- `MCCInfo` (recurring credit-card plans): the owner explicitly allowed (2026-11) reading **only** `Code, ChargeFreq, StartDate, EndDate, Amount, CampaignNum, TempOnly`, filtered by `CompanyNum`, into `JD.ccplans`. **Never** decode `CCNum, Name, ExpDate, Last4, TrackInfo, Address, Zip, Note, Comments, CreditID` or any other column. The Jet reader decodes only the columns listed, so keep that list exact. Reports project the upcoming charges (`ccCharges`, 24 months ahead) in green.
- **App data** (to-dos, notes, call marks, assignments, settings) is an append-only event log in table `events`, with columns (k, eid, p jsonb, by, at).
  - Clients replay the log with `applyEvent`. The rule is `state[k][eid] = Object.assign(state[k][eid] || {}, p)`.
  - Event kinds: `acct` (per-account settings: freq, nextAsk, assigned, vip, notes, lastAsk, shul, tags[], email), `task`, `fr`, `frin`, `frex`, `shul`, `rcpt` (printed, ed = hand-edited receipt text, emailed, emailTo), `stmt` (id = code: sent, bal), `jrep` (report definitions), `call` (id = `code|YYYY-MM`), `hist` (notes/history), `settings` (id `s`).
  - Clients poll every 15 s.
- **Users**: Supabase Auth with email and password.
  - Access is allowed only for emails listed in table `team` (email, name, is_admin). RLS uses `is_team()` and `is_admin()`.
  - The admin manages `team` from the app's Settings page.
  - The free plan's email sending is rate-limited. To add a user without email, use **Supabase > Authentication > Users > Add user > Create new user** with **Auto Confirm User** checked.

## Files
- `index.html`: the page shell. It loads supabase-js from the jsdelivr CDN, then `config.js`, `jls.js`, `cal.js`, `xlsx.js`, `sections.js`, `receipts.js`, `jreports.js` and `app.js`.
- `sections.js` (v1.2, loaded before app.js, functions only): Home dashboard (default view `home`), To-Do list (`todo`), fundraiser accounts (`fund`), shuls (`shuls`).
  - Tasks: `who` + optional `who2` (two users); `priv: true` + `owner` (email) = private. Always write tasks via `emitTask`, which keeps priv/owner on every event. SETUP.sql section 5 makes RLS hide priv events from others.
  - Fundraisers: `fr` events (payments to them), `frin` (income not in JLS), `frex` (amounts with no percentage, subtracted from that period's income before the %). Settings `frPct` (default 40), `frStart` (default RH 5787 = 2026-09-12). Income = JLS payments (not refunded) from frStart; 14-day periods from frStart.
  - Shuls: `shul` events (name, addr, notes, ord, paused, del). Setting `shulStart` (a Wednesday); every 14 days the next active shul in `ord`. Per-account `acct.shul`.
- `app.js`: all UI and logic. Views:
  - Today (to-do list, auto "ask again" schedule)
  - Monthly pledges (call list that resets each month)
  - Accounts / "נדבות" (search across all ~21k; default filter YG donors; default sort A-B by Hebrew last name `lh` = JLS `LNameH`, falling back to the last word of the Hebrew name until a re-import)
  - Account modal (payments, pledges, history, tasks, per-account settings)
  - Reports: totals per Jewish year with a box per Hebrew month (13 in leap years) and the year total; click a month (or the total) for its donors (`monthDonors`, Excel `xlsMonth`); optional "scheduled" amounts (`expPledges`: open JLS charges, not on hold, due from today on – this is where scheduled credit-card installments show up) shown in green per month; Excel `xlsReports` (5 sheets)
  - Settings (admin only)
  - Login, signup, password recovery, and a setup self-check screen
- `cal.js`: Hebrew calendar helpers (Intl `en-u-ca-hebrew`), Hebrew numerals, and a dual Hebrew/English date picker. Use `dateField(id, value, {clear})` together with `initDateFields(root)`. The `modal()` function calls it automatically.
- `receipts.js` (view `rcpt`): printable receipts copied from the user's Word mail-merge template. `receipt-bg.jpg` is the template's background image; `RC_BOX` holds the exact text-box positions (inches) from the .docx. One Letter page per JLS payment, opened in a new window and printed. Printed marks: event kind `rcpt` (id = PaymentNum). Every 2 weeks (same periods as the fundraisers) `ensureRcptTask` adds a to-do with fixed id `rcpt-<periodFrom>` and `rc: {from, to}`. Settings `rcptBy`, `rcptSuffix`, `rcptWho`.
  - The view is "רעסיטס/סטעיטמענטס" with two tabs (`ui.rcTab`). Receipt items come from `rcItems()`: payments, except campaigns in setting `rcptPlCamps`, whose **pledges** become the receipts (key `pl<ChargeNum>`, date = pledge entry date). ✏️ per receipt saves `rcpt.ed` overrides (top, amt, date, heb, eng, a1, a2, by). Search box (`ui.rc.q`: name/phone/#code/amount) looks in all years and shows printed ones too; 🖨️ prints a single receipt again (`rcPrintOne`), also from the donor's payments tab (`rcPrintPay`); chips for last year / all years.
  - Statements tab (`vStmt`): donors with open, not-on-hold pledges (filter by campaign, due-now/all, minimum); one Letter page each (logo, address, table, editable text `stmtTitle`/`stmtText`); "mark sent" writes `stmt` + a history note.
- `jreports.js` (view `jrep`, "רופארטס"): call lists = accounts with a UDF value (MAInfo) who did not pay or pledge to a campaign in any company (`JD.camphits`), optional tag. Default report `r983`: UDF4 in 1,2,3, not campaign 983 "dinner maharit 2026". Also the 🏷️ tag helpers (`tagsOf`, `tagChips`, `tagEditor`).
- `xlsx.js`: tiny .xlsx writer, `xlsx([{name, rows}], file)`. All "⬇ Excel" buttons use it (donors list, one donor, pledges, fundraisers with 5 sheets, one 2-week period, shul donors).
- `jls.js`: the Jet 4 reader, `JLS.extract(bytes, company)`, and `JLS.schema(bytes)` (table + column names and row counts only, no values; Settings > "🔍 JLS טאבעלעס"). The reader decodes only the columns asked for.
- `style.css`, `logo.png` (the yeshiva's logo; never alter it), `icon.png`.

## UX rules the user asked for
- Hebrew name first and bold. The English name comes after it, smaller and lighter.
- Phones: cell first, then home.
- Every date input offers both the Jewish and the English calendar.
- An assignee (one of the team) can be set per account or task, with "who calls" dropdowns on rows. There is a quick "📝 נאטיץ" note button, and the last note is shown on rows.
- "Ask again" schedule per account:
  - Options: monthly, 3, 6 or 12 months, before each Yom Tov, one-time (`once`), or none.
  - Default for YG donors is the last gift plus the default frequency from Settings.
  - Settings has a "skipOnce" option, so donors who gave only once are not auto-scheduled.
- The logo has a 3D look done with CSS only (`.logo3d`: drop-shadow extrusion, shine, tilt). The image itself must never be changed.

## SMS bot (v1.6)
- `supabase/functions/sms/index.ts`: Supabase Edge Function `sms`, deployed by the user from the dashboard editor with **Verify JWT off**. Plain fetch to Supabase REST/Storage with the built-in `SUPABASE_SERVICE_ROLE_KEY`; caches the JLS data and the event log while warm.
- Works with **Telnyx** (JSON webhook, Ed25519 signature `TELNYX_PUBLIC_KEY`, reply via API `TELNYX_API_KEY`) or **Twilio** (form webhook, HMAC `TWILIO_AUTH_TOKEN`, TwiML reply). Requests without a valid signature get 403. Secrets live only in Supabase > Edge Functions > Secrets.
- Only phones in `team.phone` (SETUP.sql section 6) get answers. Commands (Yiddish/English): a plain name = info, `טעלעפאן`, `אדרעס`, `געגעבן` (last 12 months), `באלאנס`, `היינט`, `פלעדזשעס`, `געקאלט`, `טאדו`/`+` (new task for the sender), `נאטיץ name: text`, `שול`, `?`. Several matches → list of `#code`.
- Test locally: copy to `.mts` and run with `node --experimental-strip-types` against a mocked `fetch` (exports `handle`, `answer`, `load`).

## E-mail receipts (v1.8)
- `supabase/functions/email/index.ts`: Edge Function `email` (the owner's is named `EMAIL`), deployed with **Verify JWT OFF** (with the new API keys the legacy gateway check blocks the browser call; the function checks the user itself); checks the caller is in `team` via RLS (caller's token + `SUPABASE_ANON_KEY`), then sends through **Gmail SMTP** (`GMAIL_USER` + `GMAIL_APP_PASSWORD`, smtp.gmail.com:465 via `npm:nodemailer` – the owner sends from bt.maharit@gmail.com; not yet verified live) or **Resend** (`RESEND_API_KEY`) or **Brevo** (`BREVO_API_KEY`), from `EMAIL_FROM` (optional `EMAIL_REPLY_TO`). Secrets only in Supabase.
- receipts.js: `emailOf(code)` = `acct.email` or JLS `a.em[0]`; `rcPdf(d)` renders the printed receipt page in a hidden iframe with html2canvas 1.4.1 + jsPDF 2.5.1 (cdnjs, loaded on first use) into a Letter PDF; `rcSendMail` calls `sb.functions.invoke` on `email`, falling back to `EMAIL` (the owner's function was created as **EMAIL**; the working name is remembered in localStorage `yg_mailfn`), then writes `rcpt.emailed` and a history note. ✉️ per row and bulk "✉️ שיק אימעיל". Subject/body settings `mailSubject`/`mailBody` with {name} {amount} {date}.
- Test: copy the function to `.mts` and run with `node --experimental-strip-types` against a mocked `fetch`; in Playwright route cdnjs to the npm copies (the sandbox cannot reach cdnjs).

## Click to call
- `callBtn(num, code)` in sections.js puts a 📞 link next to phones. The link template is per computer (localStorage `yg_call`, header button "📞 טעלעפאן"): Yealink preset = `http(s)://<phone IP>/servlet?key=number={digits}` (owner's phone is at 192.168.0.242; http refused, try https) (the owner's office phone; needs Action URI Allow IP List on the phone), default `tel:{num}` (opens the office softphone), or an http click-to-dial URL for desk phones (`{num}` = +1…, `{digits}` = 10 digits), opened in a small window that closes itself.
- The owner's office uses **TekLink** click-to-call: the JLS "CALL URL" line `https://users.theteklink.com/lic/clicktocall/v1/callPOSTJLSPOST<body>` means HTTP POST of `<body>` (`license_key=…&connect=%PhoneNum%`, PhoneNum = 10 digits). The app sends it as a hidden form POST into a small popup. The license key lives only in each computer's localStorage – **never commit it**. The setup has "שיקן ווי" (POST / GET / with a leading 1: `{num1}`) and a 🧪 test that keeps the popup open so the owner can read TekLink's answer (not yet confirmed which variant TekLink wants; our sandbox cannot reach that host).

## Testing
There is no test framework. Run `node --check app.js` and similar for each file.
