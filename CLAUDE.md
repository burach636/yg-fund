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
  - The parser extracts a slim dataset: all accounts (names in English and Hebrew, default address, phones), plus payments and pledges **only for company 32 = "YG Fund"**.
  - The dataset is gzipped and uploaded to Supabase Storage at bucket `jls`, file `jls.json.gz`. Table `jls_meta` holds a version counter, and clients reload when it changes.
  - Real numbers from the file: 21,104 accounts, 8,111 YG payments, 4,365 YG pledges, 1,380 YG donors (564 of them gave only once).
- **NEVER** read or import the JLS tables `CCTransactions`, `MCCInfo` or `MChecking`, the columns `Members.SSNumF` and `Members.SSNumW`, or the tables `Users` and `MWebLogin`. These hold card, bank, SSN and password data.
- **App data** (to-dos, notes, call marks, assignments, settings) is an append-only event log in table `events`, with columns (k, eid, p jsonb, by, at).
  - Clients replay the log with `applyEvent`. The rule is `state[k][eid] = Object.assign(state[k][eid] || {}, p)`.
  - Event kinds: `acct` (per-account settings: freq, nextAsk, assigned, vip, notes, lastAsk), `task`, `call` (id = `code|YYYY-MM`), `hist` (notes/history), `settings` (id `s`).
  - Clients poll every 15 s.
- **Users**: Supabase Auth with email and password.
  - Access is allowed only for emails listed in table `team` (email, name, is_admin). RLS uses `is_team()` and `is_admin()`.
  - The admin manages `team` from the app's Settings page.
  - The free plan's email sending is rate-limited. To add a user without email, use **Supabase > Authentication > Users > Add user > Create new user** with **Auto Confirm User** checked.

## Files
- `index.html`: the page shell. It loads supabase-js from the jsdelivr CDN, then `config.js`, `jls.js`, `cal.js` and `app.js`.
- `app.js`: all UI and logic. Views:
  - Today (to-do list, auto "ask again" schedule)
  - Monthly pledges (call list that resets each month)
  - Accounts (search across all ~21k)
  - Account modal (payments, pledges, history, tasks, per-account settings)
  - Reports
  - Settings (admin only)
  - Login, signup, password recovery, and a setup self-check screen
- `cal.js`: Hebrew calendar helpers (Intl `en-u-ca-hebrew`), Hebrew numerals, and a dual Hebrew/English date picker. Use `dateField(id, value, {clear})` together with `initDateFields(root)`. The `modal()` function calls it automatically.
- `jls.js`: the Jet 4 reader and `JLS.extract(bytes, company)`.
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

## Planned next (phase 2)
SMS bot: Twilio number plus a Supabase Edge Function webhook.
- Commands in Yiddish and English: `אדרעס/address <name>`, `באלאנס/balance <name>`, `טעלעפאן/phone <name>`, `אינפא <name>`, `היינט`, `פלעדזשעס`, `געקאלט <name>`.
- Only reply to the team's whitelisted phone numbers.
- The user must work from a basic "kosher" SMS-only phone.

## Testing
There is no test framework. Run `node --check app.js` and similar for each file.
