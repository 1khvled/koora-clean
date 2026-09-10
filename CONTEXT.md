# KOORA-CLEAN — Agent Context (A to Z)

> **Auto-update protocol (mandatory):** any agent that modifies anything in this
> repo MUST update this file in the same commit: append to `Changelog`, update
> `Current state`, `Pending`, and any section the change affects. Then push to
> GitHub (pushes are pre-authorized by the owner). Never leave this file stale.
> Last updated: 2026-09-10 (Alwan extra source §30, pending commit).

## 30. Alwan Sport extra channels (2026-09-10, user gave a worker link + "send a subagent")

- **Source:** `ahamadsport…workers.dev` serves static `app.js` with a
  `channels=[{id,name,url,type}]` array (Kurdish sports site). Types: `hls`
  (expiring Periscope tokens), `okru` (ok.ru embeds), `iframe` (fabortvcdn
  playerv5, koralive albaplayer). Generic always-on channels, NOT
  match-specific → fallback entries, never mapped. Implemented by a subagent,
  verified by me.
- **New `api/alwan.js`:** fetches the bundle (8s timeout, 500KB cap),
  regex-extracts + field-parses the array (no eval), returns ONLY okru+iframe
  (hls skipped: expiring tokens, no HLS player), cap 6, per-URL validation
  (https-only, no javascript:/data:/t.me), edge-cached 120s, fail-open empty.
  No credentials anywhere. Live-verified independently: 200 in ~450ms,
  6 channels (3 fabortvcdn + 3 ok.ru), zero violations.
- **Player:** `/api/alwan` fetched in parallel with match streams; entries
  merged as `kind:'tv'` after leafs, before fallback (re-added the `tv` →
  قناة ٢٤/٧ tag; subTag stays brand-free). Existing safeSrc/BLOCK_RE/popup
  machinery covers them with no new guards. Browser-verified 390+768:
  ordering, click-to-load, counter, zero overflow/errors.
- Never iframes their page itself (ad-infested: ratecpm, telegram modal) —
  only extracted embeds.

Final live count after wave-2 deploy: **17/17 matches HIT** (was 9/14) —
Vancouver/Galaxy + USM Alger flipped by the new aliases, everything else
held. Zero misses on the current matchday.

Wave-2 validation (local handler, live FotMob): Vancouver Whitecaps vs LA
Galaxy + USM Alger vs JS El Biar both HIT correctly (new aliases); DC,
Toronto, Kholood, Liverpool stay hit; Atalanta-trap still rejected.
Zamalek-cup residual stands (documented in §29).

## 29. FotMob coverage + loading speed (2026-09-10, user: "not all matches get fotmob, site laggy, make data loading faster")

- **Coverage 9/14 → 13/14 (measured live).** Three fixes: (1) explicit ALIAS
  table (abbreviations + notorious transliterations: DC United, Philadelphia,
  Columbus, Montreal, Charlotte, LA, NY) applied as token substitution;
  (2) second-chance gate (`fz ≤ 2.0`, margin `≥ 0.20`, league + kickoff ≤120)
  for poor transliterations with unmistakable context; (3) MLS league-map
  rows (`major`/`soccer` — FotMob calls it "Major League Soccer", the old
  map had no overlapping token). Mirrored in `scorers.js` so rows and player
  data never disagree. Validated by battery: DC/Montreal/Philly flip to
  correct accepts; Toronto/Atlanta/Kholood/Liverpool stay hit; Kairat/
  Atlante/Pyramids/Boca traps still reject. Remaining misses (Sporting CP —
  no Lisbon token anywhere; Stuttgart — upstream calls Viking "Stavanger")
  are unmatchable without gutting the gates: safe fails, accepted.
- **Known residual:** same-team-different-opponent same evening (e.g. a test
  query matching a cup game) can pass the second-chance gate — needs the
  queried fixture absent from FotMob AND a same-team game the same evening,
  near-impossible with real fixture lists. Documented, accepted.
- **Speed:** `api/matches` edge cache 60s (every other 45s poll instant);
  player `fetchT` default 8s→6s; index skips JSON-LD rebuild on silent
  renders (every ~4min instead of 45s). Measured: player API 4.7s cold →
  0.0s cached; matches 3.5s cold. The 45s/60s/180s pollers were already
  tab-hidden-aware and fail-silent.

## 28. Goal scorers on live + finished rows (2026-09-09, user: "type who scored… like always")

- **New `api/scorers.js`:** one batched call per day — self-fetches own
  `/api/matches`, keeps LIVE/FINISHED matches, resolves each against FotMob
  day lists (same strict fuzzy gate), pulls details in parallel (cap 14),
  returns `{matchId: {h:[{p,m}], a:[...]}}` (max 4 goals/side). Edge-cached
  60s. Fail-open empty.
- **Index:** `data-mid` on both card types, `.sc` scorer lines under team
  names (`⚽ name min’`, max 3/side), painted after every render, refreshed
  on explicit loads + every 3min (45s silent keeps scores fresh without the
  heavy call). Upcoming rows untouched. Scorer text via `textContent`
  (XSS-proof by construction, proven with live payload).
- Verified: mock render (2 lines live / 0 upcoming, no overflow, no errors);
  screenshot `shots/scorers.png` (untracked); `node --check` clean; mirrors
  byte-identical. Live endpoint test after deploy: **7 matches with real
  scorers** (Ronaldo, Dembélé ×2, Ødegaard, Szoboszlai, Raphinha, Yamal…).
  Follow-up fix: stoppage-time minutes came out "45 + 6+6’" — deduped in both
  `scorers.js` and `fotmob.js`.
- **Scorer display fix (same day, user: "only 3 shown of 6, UI horrible").**
  Cap was 3-4/side and one ellipsis-truncated line. Now: cap 12/side,
  grouped per player ("Dembélé 17’, 23’"), flowing onto wrapped lines —
  verified with a 6-goal mock, all names visible, no overflow.

## 27. Five-agent audit triage + interactive FotMob section (2026-09-09, user: "fix all bugs, send 5 subagents" → "make fotmob interactive not STATIC")

- **5 parallel read-only audit agents** (player / index / apis / workers+PWA /
  entity-pipeline) returned ~130 findings; triaged to the real ones below.
  Everything else was deferred with reasons (validated gates, conventions,
  can't-verify).
- **Interactive minfo (delegated to 1 subagent, verified by me):** FotMob-style
  tabs (نظرة/التشكيلة/الأحداث, sticky, aria-selected), clickable pitch dots
  → clamped popover card (photo/rating/events, Esc/outside/✕ close),
  timeline filter chips (الكل/أهداف/بطاقات/تبديلات), 60s live auto-refresh
  (hidden-tab skip, stops at FT, never touches iframe/servers), stats period
  switcher (All/1H/2H from new `periods` API field). Verified live in-browser
  390+768: tabs/dots/popover/filters/periods/timer all green, zero pageerrors.
- **Entity pipeline (the "38&95&" garbage):** decode-once server-side in
  `api/matches.js` + `decFull` loop-decoder (named/decimal/hex, handles
  double-encoded `&amp;#039;`) in both pages, applied as `esc(decFull(x))`
  at every sink; statusLabel appends `’` only if missing; logoImg validates
  scheme; FotMob `Own goal` stays English.
- **Player:** `safeSrc` also rejects ad/telegram URLs + `goServer` auto-skips
  dead servers (bounded); Safari fullscreen guard + webkit fallback; fetch
  in-flight guard; fail/skeleton states reset counts; `subTag` brand-free;
  live-dot via CSS `::after`; dead `trackServer`/`showServers` deleted.
- **Index:** null-item guard, empty-array = valid day, stale-kept offline,
  reqSeq anti-race, word-boundaried LIVE/FT, minute-only game_time, chips
  rebuild on silent, case-insensitive search + debounce, rail scroll preserve,
  snap proximity, corrected empty-state + JSON-LD (absolute URL, ISO dates),
  visibility catch-up, chip scrollIntoView, day-tab aria roles.
- **Backend:** vipbox video verify parallelized (was ~26s worst case);
  fotmob dates parallel + 7/8s budgets + same-match dedupe; matchesRes
  ok/array guards + String id compare; `found` now post-filter (a dropped
  `javascript:` URL can't report found:true); no-store on all error paths;
  `api/matches` day allowlist + ok/size caps + quote-agnostic attrs +
  logo-preference + slug-stable ids; `api/vip` redirect pathname re-check +
  cache-only-on-200 + 7s budget; fotmob matchId digits + min-suffix/red-word/
  topPlayers-guard/logo-https fixes.
- **Workers/SW/PWA:** redirect re-validation + https-only + 8s timeouts in
  both proxies; dead bare-TLD allowlist entries dropped; SW regexes anchored
  (verified 13/13 incl. `exoclick.com` fix + `t.me` query-string safety);
  manifest `id` + categories; sitemap canonical + hourly.
- Deliberately NOT changed: validated fuzzy gates/thresholds, v/p conflation
  scope, SW silent catch (console-noise rule), demo branch, slop scripts
  (edit-record convention), worker-serve legacy bundle (deployment unknown),
  pitch aspect math, rearmShield-per-switch protection.
- Verified: `node --check` all 9 JS surfaces; Playwright XSS-smuggle +
  viewports + interactive suite green; mirrors byte-identical.

## 26. Live-bug batch: card status, flaky loads, FotMob U19 collisions (2026-09-09, user: "match started but says لم تبدأ, player needs refresh, no fotmob")

- **Card lied (FIXED).** The header card painted `tm` verbatim and the middle
  label was a hardcoded "بث مباشر" — a match that kicked off after the index
  rendered showed "بث مباشر / لم تبدأ" next to a live player. Now the player
  computes its own state (same live/ended rules as index) from new `so/gt/
  sh/sa` URL params: live → red "مباشر" + minute, ended → "انتهت" + score,
  upcoming → "لم تبدأ" + time. Also decodes `&#039;` entities (upstream sends
  `63&#039;`, `textContent` showed it raw). Verified all three states live.
- **Flaky loads (FIXED).** `loadRealPlayer` had no timeout — a hung API left a
  dead skeleton until manual refresh. Now: 12s AbortController timeout + ONE
  automatic retry (proven firing in tests), visible "جاري تحميل البث… /
  إعادة المحاولة…" status, then the manual retry button. Same 12s timeout
  for the FotMob fetch (fail-hide instead of hanging on "loading…").
- **FotMob missed every live UCL match (FIXED).** Root cause: matchday Youth
  League games (same clubs, earlier kickoffs) tie the fuzzy score EXACTLY
  (extra EN tokens are ignored by design) → margin gate killed all four.
  Fix: youth/reserve titles (U19/U21/youth/reserve/II) are dropped from the
  candidate pool outright — a genuine youth query safely hides instead.
  The senior sides now win cleanly.
- **Vowel-insensitive scoring (same push).** الفتح/fateh can only align
  consonant-to-consonant (Arabic omits short vowels), so both sides now strip
  vowels before edit distance. Battery-tested: fixes Fateh, improves every
  correct margin, all wrong cases (Pyramids-trap, Atlanta-trap, Kairat-trap)
  still gate out via margin/league/time.   `min-len-3` variant was tried and
  REJECTED (created the traps instead of fixing them).
- Live re-test after deploy: **5/6 with full live data** (11/11 lineups,
  8 stats, 8–17 events each). Only Sporting–Galatasaray misses ("Sporting CP"
  contains no Lisbon token — unmatchable without gutting the gates; safe
  fail, accepted).

## 25. Mobile + console + security pass (2026-09-09, user: "optimize for mobiles ipads, fix console errors, fix security")

- **Audit first:** 360/390/768/1024 viewports — docScrollW == viewport
  everywhere, TRUE overflow offenders NONE (earlier flags were by-design
  horizontal scrollers: chips row, live rail), all touch targets ≥40px.
  So no broken layout — this pass is polish + hardening.
- **Console:** removed the redundant `allowfullscreen` attribute (the `Allow`
  warning; `allow="fullscreen"` already grants it, provider fullscreen
  buttons keep working). The `sandbox` warning is inherent and stays —
  mitigated (`/api/vip` forces opaque origin via CSP header). Local-only
  `/api/*` 404s don't occur on Vercel.
- **Mobile/iPad CSS:** league chips 40→44px targets; pitch capped at 560px
  and centered on tablets/desktops; sub-360px dot/label shrink; ≥768px gets
  roomier player wrap + minfo padding, wider index content (880px), larger
  brand/rows.
- **Security — REAL find: `javascript:` iframe smuggling.** Server-extracted
  stream URLs were assigned to `iframe.src` unchecked — a compromised
  upstream returning `javascript:…`/`data:` as embedUrl would execute in our
  origin (sandbox has `allow-scripts`). Fixed at BOTH ends: client `safeSrc()`
  choke point in `goServer` (+ demo branch, reload inherits it), and
  server-side `pushUnique` allowlists `https?://` only. Proven live:
  `javascript:`/`data:`/newline-smuggled URLs all refused, legit https +
  `/api/` relatives pass, zero execution, no dialogs.
- **Security — FotMob id:** `matchId` from FotMob JSON is now digits-guarded
  before URL interpolation. Re-ran the secret scan: clean (only the known
  `mask-composite` CSS false positive); `shots/` + `_watch.html` untracked.
- Accepted as-is: SW `PATH_BLOCK` breadth, `e.message` passthrough,
  legacy worker-serve bundle (see §17).
- Verified: `node --check` all 7 JS surfaces; Playwright XSS-smuggle +
  360/768 render, `scrollW` clean, zero pageerrors; mirrors byte-identical.

## 24. FotMob-layout copy: pitch, faces, badges (2026-09-09, user: "copy the fotmob layout with rating all stuff and team placing ect")

- **Reference studied in-browser:** score header (logos/score/status/scorers),
  tab bar, momentum, top-stats, POTM, events timeline, lineup pitch (photo
  dots + rating badges + sub/card/goal badges + MOTM star), lists, team form.
  Screenshots in `shots/fm_ref_*.png` (untracked).
- **Rebuilt in `player.html`:** FotMob score header (grouped scorers per side
  + red-card marks), green pitch card with team rails (rating pill + logo +
  name + formation), 22 photo dots from
  `images.fotmob.com/image_resources/playerimages/{id}.png` (verified 200s;
  initials fallback when missing), rating badges (green ≥7 / orange ≥5 /
  red below, blue ★ MOTM), sub-minute / card / goal badges matched by player
  id, then lists + coach + unavailable + top players + stats + timeline.
- **Placement math (verified vs reference):** `horizontalLayout` x/y are full-
  pitch attack-right coordinates; home `top = 5 + x·41`, away
  `top = 95 − x·41`, both `left = 4 + y·92` (shared flank, NO horizontal flip
  — the flip put both teams on top of each other). First attempt WAS that
  overlap bug, caught on screenshot. Taller pitch (34/58) + 34px dots so rows
  breathe. All data stays English, UI chrome Arabic.
- **`api/fotmob.js` additions:** `pid`/`short` per player, event `pid` +
  `swapPids` + `red` flag, `unavailable[]`, team logos already there.
- Verified: real Lille 4-2-3-1 coordinates render clean (screenshot
  `shots/fm_pitch2.png`, untracked); `node --check`; `scrollW=390`, zero
  pageerrors; mirrors byte-identical.

Live re-test after deploy: 5/6 current matches HIT (was 1/6) with full
lineups. The one miss (Stuttgart vs "فيشينغ ستافانغير") is bad upstream data
— FotMob lists the opponent as Viking (the club; Stavanger is its city), so
no transliteration can bridge it. Safe fail, accepted as-is.

## 23. FotMob lineups / ratings / stats / events below the match view (2026-09-09, user: "use footmob to get players lineup ratings everything")

- **Probe:** direct `/api/*` paths 404, but the web app's bundles reveal
  `/api/data/*`, which is OPEN with plain browser headers (no keys/tokens):
  `allLeagues` (league ids), `matches?date=YYYYMMDD` (all matches + FotMob
  ids + EN names + scores), `matchDetails?matchId=` (lineup/formations/
  starters+ratings/coach/subs, top_stats group, playerStats/topPlayers/POTM,
  events with goals/cards/subs). Shapes verified on finished (AEK-LASK,
  Lille-Betis) and upcoming (Barca-Feyenoord, empty starters) matches.
- **`api/fotmob.js` (NEW):** `?home=&away=&start=&lg=` → tries match-day then
  the UTC-adjacent day (late +03:00 games belong to the previous UTC day),
  same strict fuzzy gate as streams (`fz ≤ 1.4`, margin `≥ 0.25`, league-word
  hit or kickoff ≤ 120min — validated: Lille-Betis hit, fake match + missing
  params correctly miss). Returns trimmed display JSON (~5KB): formations,
  XI+ratings+shirt numbers, subs, coach, top-4 players + MOTM, 8 stats,
  24 events (goals/cards/subs only — Comment/AddedTime/Half noise filtered,
  swap names joined with ⇄, stat values digit-whitelisted). Fail-open
  `{found:false}` → section hides.
- **Player:** new `📊 بيانات المباراة` section after the status line (below
  the match view): top-rated chips with color pills + ⭐, dual stat bars,
  two-column lineups (formation • team rating, coach, XI + subs with pills),
  event timeline (⚽/🟨/🔄 + minute + score). Loads in parallel, never blocks
  streams; all strings through §17 `esc()`, ratings via Number().
- Verified: REAL handler e2e (Lille-Betis full data, fake→miss, bad→400);
  in-browser render + XSS payload neutralized + fail-hide path; screenshot
  `shots/minfo.png` (untracked); `scrollW=390`, zero pageerrors;
  `node --check` clean; mirrors byte-identical.
- **Recall fixes (same day, user: "i see nothing").** Live test showed 1/6
  hits — three matcher bugs: (1) FotMob times look like "09.09.2026 18:45"
  and the HH:MM regex grabbed the DATE part ("09.09") → take the LAST match;
  (2) league map has أوروبا but upstream writes اوروبا → hamza-insensitive
  compare (also applied to the VIPBox `leagueHit` in `api/player.js`);
  (3) transliteration gaps (ليفربول/liverpool just over threshold) → conflated
  v→f, p→b on the English side (also applied to `api/player.js` matcher).
  Plus a relaxed margin (≥0.10) when league AND kickoff both corroborate
  (Saudi-derby transliteration collisions). All data values stay English —
  the one Arabic literal (`هدف عكسي`) became `Own goal`; Arabic UI chrome
  unchanged per "keep the site language".

## 22. Personal IPTV bridge REMOVED (2026-09-09, user: "do i have to use my subscription? if yes then delete it")

- Straight answer that triggered this: YES — every site viewer would consume
  the owner's single connection slot (`max_connections: 1` on a sub expiring
  2026-09-21), plus ~2GB/hour/viewer of Vercel bandwidth. So per the owner's
  conditional, the whole thing is deleted.
- Removed: `api/iptv.js` (`git rm`), player HLS stack (`hls.js` CDN,
  `<video>`, `playHls`/`stopHls`, hls branches in goServer/fullscreen/reload),
  beIN fetch+merge, `tv` kind + subTag branch, url-or-hls dedup (back to
  url-only). `s.play` preference kept (VIPBox `play` URLs still use it).
- Credentials were NEVER in the repo (env-only design held) — nothing to
  rotate on our side. Reminder stands from §21: the login was pasted in chat,
  so rotating the panel password with the provider is still smart.
- Verified: zero references to iptv/hls/daddy in `player.html`/
  `api/player.js`; `node --check` clean; Playwright grid/switching/empty-hide
  green, `scrollW=390`, zero pageerrors; mirrors byte-identical. Site is back
  to hd7 + VIPBox + fallback sources.

## 21. Personal IPTV beIN bridge (2026-09-09, user supplied an Xtream panel link)

- **What was done with the account:** ONE read-only probe (auth status,
  categories, channel list — never played a stream, never held a connection).
  Panel: Active, NOT trial, expires 2026-09-21, **`max_connections: 1`**,
  formats m3u8/ts/rtmp. Arabic beIN HD bouquet = category 108 (beIN 1–9 +
  News/XTRA/English). NO credentials are stored anywhere in this repo, chat
  history aside — see rule below.
- **Design (siphon without leaking).** There is no such thing as a login-free
  Xtream link — every stream URL embeds user/pass. So: `api/iptv.js` (NEW)
  reads `IPTV_SERVER`/`IPTV_USER`/`IPTV_PASS` **from Vercel env vars only**
  (no defaults — not even the panel hostname), exposes 3 allowlisted actions:
  `bein` (beIN 1/2/3/News ids+names, edge-cached 10min), `play&sid=` (m3u8
  with creds injected server-side, URIs rewritten to `seg`), `seg&u=`
  (segment/key bytes, host MUST equal the panel host, Range + size caps).
  The browser only ever sees stream ids and `/api/iptv?...` URLs — verified
  byte-level: no credential strings in any response. Abuse paths unit-tested
  (bad action/sid/host → 400/403). Player reuses the HLS stack for `kind:
  'tv'` entries merged into the Arabic grid ahead of the fallback; missing
  env (503) = section silently absent.
- **RULE (owner + future agents): credentials NEVER enter git, CONTEXT, logs,
  or client-visible URLs. Env vars are set by the owner in the Vercel
  dashboard. If this rule is ever broken, rotate the IPTV password first.**
- **Warnings the owner accepted by asking for this:** (1) Vercel bandwidth —
  ~2GB/hour/viewer through the proxy; (2) `max_connections: 1` — ANY site
  viewer consumes the owner's single slot: while someone watches via the
  site, the owner's own app/TV gets kicked (and multi-IP use can get the line
  banned); recommend personal use only; (3) sub expires 2026-09-21 — after
  that the section silently disappears until renewed.
- Verified: REAL handler against the REAL panel (`bein` 4 channels, `play`
  200 + rewritten segments, no cred leak); in-browser tv render + fatal-error
  auto-advance to next server; `node --check`; secret scan clean (only the
  known `mask-composite` CSS false positive); mirrors byte-identical.
- **Owner action required:** add the 3 env vars in Vercel (project Settings →
  Environment Variables → Production): `IPTV_SERVER` = panel http(s) origin,
  `IPTV_USER`, `IPTV_PASS` → Redeploy. Until then the site behaves exactly as
  before (no beIN section, zero errors).

## 20. DaddyLive REMOVED (2026-09-09, user: "just delete that")

- User still saw "Access Denied / not available on your domain" and ordered
  full removal — done, no debate. Even the §19 HLS-proxy fix (technically
  verified working) goes with it: a source that fights its consumers isn't
  worth the bandwidth bill or the support load.
- Removed: `api/player.js` `resolveDaddy` + `resolveDaddyStream` + `DADDY_BEIN`
  + `deEmoji` + `leagueHitEn` (all Daddy-only; `LEAGUE_MAP`/`fuzzyArEn`/
  `wallMin` stay — VIPBox uses them), beIN `tv` merge, `api/hls.js` deleted
  (`git rm`), player HLS stack (`hls.js` CDN, `<video>`, `playHls`/`stopHls`,
  hls branches in goServer/fullscreen/reload, `tv` kind + note mentions).
- Kept: VIPBox EN section (unchanged contract), hd7 chain, `s.play`
  preference in goServer (VIPBox `play` URLs still use it), unified-list
  autoplay + atomic EN reveal from §16.
- Verified: zero remaining references to daddy/hls/dlive/premiumtv in
  `player.html`/`api/player.js`; `node --check` clean; Playwright mock grid
  (AR 2 + EN 2, switching, empty-hide) green, `scrollW=390`, zero pageerrors;
  mirrors byte-identical.

## 19. "Access Denied / not available on your domain" — DaddyLive Referer gate → native HLS (2026-09-09, user report + screenshot text)

- **Root cause (proven, not guessed).** DaddyLive leaf pages carry a base64
  m3u8 (`source:window.atob(...)` → `xameleon.phantemlis.top/.../index.m3u8`).
  Playlist fetch tests with 4 Referers: ONLY `Referer: <exact leaf URL>` → 200
  (master 1080p50); no-referer / dlive.sx / our domain → 403. Browsers can't
  spoof Referer, so NO iframe arrangement can play — hence the denial screen.
- **Fix: `api/hls.js` (NEW) + native playback.** Proxy re-sends every
  playlist/segment/key with the spoofed leaf Referer (manual redirect loop
  re-applies it per hop), rewrites all playlist URIs (URI lines + `URI=""`
  attrs) back through itself, validates `ref` looks like a daddy leaf page
  (not a generic open proxy), caps bodies (2.5MB playlists / 12MB segments),
  forwards Range, caches segments. `resolveDaddy` now extracts the m3u8 per
  channel and emits HLS-ONLY entries (`hls: /api/hls?u=…&ref=…`) — anything
  without an m3u8 is dropped so no dead "Access Denied" button can appear.
- **Player:** hls.js 1.5.18 (pinned) + `<video>` in the stage; `goServer`
  branches on `s.hls` (video) vs iframe; fullscreen/reload/error paths handle
  both; fatal HLS errors auto-advance like the popup watchdog; muted autoplay
  behind the existing click-shield with an unmute toast. Popup guard/SW
  untouched (nothing to block — no iframe in HLS mode).
- **Bug caught in testing:** desktop Chrome answers "maybe" to native-HLS
  `canPlayType` but can't play it (loadstart → suspend, dead player) — hls.js
  (MSE) is now tried FIRST, native only as the Safari fallback.
- **Stream facts:** single 1080p50 HEVC (hvc1) rendition — nothing to strip;
  Chrome-desktop-without-HEVC falls back to next server gracefully;
  Safari/iOS play natively. Segments are signed R2 URLs (15-min expiry —
  harmless: live playlists refresh continuously, resolver runs per page load).
- **COST WARNING (read before matchday):** video bytes flow through Vercel —
  ~2.5GB/hour/viewer at 1080p50; the 100GB/mo free tier ≈ 40 viewer-hours.
  Kill-switch: stop emitting `hls` in `resolveDaddy` (one spot) — iframe
  sources (hd7/vipbox, which don't gate) keep working.
- Verified: REAL `api/hls.js` invoked with mocked req/res — master rewrite
  1/1, variant 6/6 segments proxied, 2.27MB segment bytes flow, bad-ref /
  http / garbage → 400; in-browser hls.js playback CONFIRMED (currentTime
  7.76→10.73, playing, 512px wide); iframe↔video switching, `scrollW=390`,
  zero pageerrors; `node --check` all; mirrors byte-identical.

## 18. DaddyLive source: match channels + beIN 24/7 fallback (2026-09-09, user: "search up other players we can scrape")

- **Research:** surveyed the landscape (search + technical probes). DaddyLive
  won by far: `dlhd.st` serves a FULLY STATIC schedule (254 events, EN names,
  UK times, `/watch.php?id=N` channel links), watch pages hand out 7 static
  player mirrors + an official embed code, their own `api.php` docs bless
  iframe embedding with exact URL construction rules, and ZERO framing
  headers anywhere in the chain. Rejected: LiveTV.sx (static schedule but
  P2P/Acestream playback — embed friction), Totalsportek mirrors (JS-rendered
  schedule, 50+ ad-infested links/event), STING sisters (no sting API —
  `rest_no_route` on yallashootkoora; direct-iframe path already covered),
  YouTube official (geo-blocked, blocked by our player by design).
- **Chain (verified live):** schedule event → `dlive.sx/stream/stream-<id>.php`
  → ONE static iframe to a player-only Clappr leaf (3KB, no site chrome —
  embed directly like hd7 leafs, no cleaning proxy needed). Verified for an
  event channel (110 → `daddy5.php?id=110`) and beIN 91/61.
- **`api/player.js` `resolveDaddy`:** parses schedule events (⚽-only via the
  `data-title` emoji — tennis doubles "A/B vs C" titles polluted the pool in
  testing), splits "League : A vs B", reuses `fuzzyArEn` + strict gate
  (`fz ≤ 1.4`, margin `≥ 0.25`, league-word hit or kickoff ≤ 60min), +0.6
  youth/reserve (U19/U21/…) penalty so senior queries can't land on youth
  games. Channels capped at 2 (real names preferred over generic "Event
  Stream"), leafs resolved in parallel. Validated on the live schedule: Lille-
  Betis + Watford-Preston ACCEPTED (correct), barca/villa/egyptian/
  Saudi absent-cases all correctly REJECTED (incl. right-team-wrong-opponent).
  Known safe-fail: senior+U19 same-day coexistence → thin margin → hidden.
- **beIN fallback:** fixed Arabic 24/7 ids 91/92/93 (verified live), resolved
  in parallel, merged into `servers[]` as `kind: 'tv'` ahead of the match-page
  fallback — always-on Arabic safety net. Event channels join `enServers`
  (`kind: 'en'`, `via: 'daddylive'`). No frontend structural change:
  `kindTag` learned `'tv'` (قناة ٢٤/٧), EN note generalized to VIPBox/DaddyLive.
- **Security:** channel ids digit-validated, leaf URLs https-validated via
  `fixUrl`, all upstream labels go through the §17 `esc()`; fetch hosts are
  hardcoded (dlhd.st/dlive.sx), timeouts throughout, fail-open.
- Verified: `node --check` clean; Playwright 390px (AR 3 incl. tv tag, EN 1,
  counter 1/4, `scrollW=390`, zero pageerrors); mirrors byte-identical.
- **Not yet proven:** leaf actually playing in a real browser (same standing
  caveat as hd7/vipbox — needs a live match + real browser).

## 17. Security / bug / slop audit (2026-09-08, user: "DEBUG FIX / ANY ERROR ANY SLOP ANY SECURITY Issues if there is")

Full read-through of index/player/api×3/workers/sw + secret scan + live payload tests.

- **XSS — stored via upstream scrape (FIXED, was the big one).** Every match
  field comes from third-party HTML; `index.html` interpolated home/away/
  league/scores/logos raw into `innerHTML` (incl. `src="${logo}"` attr
  breakout → `<img onerror>`), and `player.html` did the same with hd7/vipbox
  server labels. A compromised upstream owned the page. Fix: `esc()` helper
  in both pages, applied to all upstream interpolations (cards, chips, group
  headers, logos, server buttons). Proven with live `"><img onerror>` payloads
  in team/league/logo/label fields: zero execution, layout intact.
- **XSS-adjacent crash (FIXED).** `player.html` ran bare `decodeURIComponent`
  on query params at top level — a crafted link with a stray `%` threw and
  killed the ENTIRE script (no servers, no popup guard). Fix: `safeDec()`
  wrapper everywhere. Proven: `?href=%&home=%E0%A4%A` loads fine now.
- **SSRF via `?href=` / `?url=` proxies (FIXED).** `api/player.js` fetched ANY
  user-supplied absolute URL server-side (cloud metadata 169.254.169.254,
  intranet). Fix: strict allowlist — kooralive-plus.info (+www) only, exact/
  subdomain match, 400 otherwise. Both workers (`worker.js`,
  `worker-serve.js` ×2 lists) used SUBSTRING `includes` matching → allowed
  `kooralive-plus.info.evil.com`; fixed to exact-or-suffix (incl. dropping a
  bare `'kooralive'` entry). `api/vip.js` already dot-anchored; added
  post-redirect final-host re-check + 2.5MB body cap. Gate matrix unit-tested:
  9/9 (legit pass, evil-subdomain/query-trick/metadata/loopback rejected).
- **Hanging upstreams burning serverless time (FIXED).** Plain `fetch` with no
  timeout on `api/matches`, direct page + sting API + self-lookup fetches in
  `api/player` (Vercel Hobby = 10s). Fix: 7–8s AbortController timeouts on all.
- **Reload hash bug (FIXED).** Cache-bust string-concat broke URLs containing
  `#`; now uses the URL API with fallback.
- **Chips correctness (kept while escaping).** `data-l` held raw league names;
  escaping it would have broken filtering — switched to index-based
  `data-i` + `LEAGUE_LIST`. Verified filtering still works post-change.
- **Secrets scan:** all 30 tracked files clean (one false positive:
  `mask-composite` CSS in `premium_ui.py`). `shots/` + `_watch.html` correctly
  untracked. No keys/tokens anywhere.
- **Slop verdict:** `*.py` scripts are the intentional edit record (§5); old
  STING files + `style.css` stay for the legacy worker-serve bundle (noted,
  untouched — deployment status unknown, not going to yank blindly).
- **Accepted risks (documented, not changed):** iframe `sandbox` keeps
  `allow-same-origin` (silencing the console warning would risk breaking leaf
  playback; `/api/vip`'s CSP-sandbox header already forces opaque origin
  there); `e.message` in API errors (debug value, personal project); SW
  `PATH_BLOCK` substring breadth (no legit fetches match it).
- Verified: `node --check` on all 7 JS surfaces; Playwright XSS + malformed-
  query + chip-filter + EN-grid tests green, `scrollW=390`, zero pageerrors;
  mirrors byte-identical.

## 16. EN "header with no buttons" hardening (2026-09-08, user: "shows nothing" + screenshot of EN header, zero buttons)

- **Reproduction:** live deployment behaves correctly (Ettifaq test: 3 Arabic
  buttons, EN properly hidden, `enCount 0`; mock grid tests: counts, clicks,
  active-sync all pass). No code path in §14/§15 renders the EN header without
  its grid — the render is atomic. Prime suspect for the user's screenshot:
  an ad-block cosmetic rule removing buttons that mention stream brands
  (only EN buttons contained the text "VIPBox"), and/or the real first-load
  bug below. Could not reproduce the exact half-state locally.
- **Fixes (all safe, verified):**
  1. EN buttons no longer contain brand text (`إنجليزي • 20:00` instead of
     `إنجليزي • VIPBox • 20:00`) — brand stays in header/note only.
  2. Header reveals only AFTER the grid has children (`enEl.children.length`
     check) — a header-with-no-buttons is now structurally impossible even
     under exceptions.
  3. First-load auto-play reads the UNIFIED `serverList` (was: Arabic `list`
     only) — previously a black player when Arabic was empty but English
     videos existed.
- Verified: Playwright cases A (ar+en), B (ar-empty+en → auto-play source
  found), C (both empty → retry, EN hidden); `scrollW=390`, zero pageerrors,
  `node --check` clean, mirrors byte-identical.
- **Still needed from user:** WHICH match showed this (to inspect its exact
  `/api/player` response), and whether an ad-blocker is active — if the
  half-state persists with this build, that data will pin it.

## 15. VIPBox fix — match-only videos + cleaned embed (2026-09-08, user: "player is not good like that, displaying random matches")

§14 shipped two mistakes: (1) the EN section listed ~12 nearest-kickoff matches
(random other games in YOUR match's player), (2) EN buttons iframed the whole
vipbox site (header/titles/chat squeezed in 16:9, real player below the fold —
screenshot `shots/vip_embed.png` proved it).

- **Matching (the hard part — Arabic names, English slugs).** Built
  Arabic→Latin transliteration + per-token normalized edit-distance fuzzy
  scorer. Tuned on 11 real pairs (correct title always won), then validated
  the ACCEPT/reject gate on 10 end-to-end cases against the real schedule:
  4/4 present matches ACCEPTED (Lille-Betis, Dortmund-Villarreal, Real-Inter,
  Porto-City), 6/6 absent correctly REJECTED — incl. the nasty
  Atalanta/Atlante near-collision (fz 0.96!) killed by corroboration. Gate:
  `fz ≤ 1.4 && margin ≥ 0.25 && (leagueHit || kickoff within 45min)`.
  League map: 30 Arabic→vipbox-token rows. Wall-clock compare (no Date/TZ
  math — the sites use different zones). Result: `enServers` = ONLY this
  match's videos, each status+title-verified (Video 1..3, all 200 on the
  reference match). No confident match → `[]` → section hides. NEVER a list
  of other matches again.
- **Playback (`api/vip.js`, NEW).** Proxies the vipbox `/live/<slug>-N` page
  through Vercel (no user worker config needed): injects
  `<base href="https://vipbox.lc/">` (relative assets/APIs keep working),
  CSS hiding site chrome (`nav.navbar,h1,h2,[data-item=chat],footer` —
  stable selectors only, obfuscated classes avoided), keeps player scripts +
  the in-page video switcher, adds a `window.open` ad-guard, forces opaque
  origin via CSP `sandbox` so third-party scripts can't touch our page.
  Verified via local transform replay: chrome gone, switcher + 16:9 player
  at top (`shots/vip_clean.png`). EN buttons now play `play:
  /api/vip?u=…` (goServer prefers `play`, falls back to `url`).
- **Stream 403 (honest status).** The cleaned player boots and requests its
  stream host (`posamari.me/sd0embed/…` → 403) — but the reference match had
  likely just ended (21:47 UTC vs 20:00 kickoff) AND headless is bot-gated, so
  headless cannot confirm playback. Same standard as the hd7 leaf: resolved +
  rendering, needs a real browser on a LIVE match. User check required.
- Verified: `node --check` api/player + api/vip + both inline scripts;
  Playwright 390px: EN section shows this match's videos only, EN click loads
  proxied URL, empty-EN hides section, `scrollW=390 offenders=[]`, zero
  pageerrors; mirrors byte-identical. Probes in TEMP (untracked), screenshots
  in `shots/` (untracked, never commit).

## 14. VIPBox English sources section (2026-09-08, user: "this website got player but its english… include it into another section")

- **Probe (live 2026-09-08):** `vipbox.lc/live/football/lille-vs-real-betis-1`
  is JS-rendered + encrypted (`window['ZpQ…']` blob decodes to binary, video
  tabs 1–10 only in JS, one static `javascript:;` "more video/stream option"
  anchor) → deep server-side leaf extraction = breaking obfuscated crypto,
  fragile. BUT the `/football-schedule` page IS static HTML: 53 unique
  `/onair/football/<slug>` anchors with English `title=""`, kickoff `<span
  content="ISO">HH:MM</span>`, league icon class. Each match plays at
  `/live/football/<slug>-1` (Video 1; page's own UI switches 2..N in-page, so
  one URL per match suffices). Cross-language team mapping (Arabic→English
  slug) is unreliable → no fake matching: rank schedule by kickoff distance
  to `?start=` so the user's match floats near the top, user picks by English
  name.
- **`api/player.js`:** new `resolveVipbox(startIso)` (8s `fetchT`, fail-open
  → `[]`), parses slug/title/kickoff/league, ranks by `|kickoff − start|`,
  takes 12, returns `{label, sub, url: live/<slug>-1, onair, kind:'en',
  via:'vipbox'}`. Runs in `Promise.all` with `resolveHd7`. New `?start=`
  param; responses add `enServers`/`enCount` (both found + not-found paths).
- **`player.html`:** new `🇬🇧 مصادر إنجليزية` section (`#enHead/#enServers/
  #enNote`, hidden when empty): same grid styling + `EN` badge + LTR labels
  (`direction:ltr; unicode-bidi:plaintext`), sub-line `EN • VIPBox •
  20:00`. One unified `serverList` (Arabic + EN) → shared iframe,
  `تشاهد الآن (i/N)`, synced `.on` in both grids, watchdog auto-advance works
  across sections. `loadRealPlayer` sends `start: startP`.
- **`index.html`:** `playerLink()` forwards `st: m.start` for the ranking.
- **Bug caught by probe:** long EN titles stretched the page (`scrollW=477`,
  every element offender — grid items default `min-width:auto`) → fixed with
  `.srv{min-width:0}`.
- Verified: parser replayed on real schedule HTML (53 matches, Lille-Betis
  ranked top for 20:00 ref, constructed URL == user's URL pattern);
  Playwright 390px (`verify_en.py`, TEMP-untracked): EN section shows/counts
  (2+2), EN click loads vipbox URL + active sync, empty-EN hides section,
  `scrollW=390 offenders=[]`, zero pageerrors; `node --check` clean; mirrors
  byte-identical.
- **Not yet proven in a real browser:** vipbox iframe actually playing inside
  OUR player (X-Frame-Options unknown — vipbox distributes embeds so likely
  allowed; same ad-guard caveat as hd7 leaf). Needs user check on
  `kooraadz.vercel.app`.

## 1. What this is

Ad-free Arabic RTL **Koora Live** clone. Two user-facing surfaces ("both projects"):

- **Project A — Match-day site** (`index.html`): today's/yesterday's/tomorrow's
  matches, live rail, league groups, search, league filter chips, day tabs.
- **Project B — Player** (`player.html` + `api/player.js`): opens from a match,
  resolves the real stream iframe server-side, wraps it in an ad-blocking
  shell (fullscreen / reload / telegram-hide buttons, popup kill, SW blocker).

Live data is scraped from `kooralive-plus.info` (STING-theme clone ecosystem).
Repo: `https://github.com/1khvled/koora-clean.git`, branch `main`.
Local path: `C:\Users\Abdelli\Desktop\Projects\koora-clean`.

## 2. Architecture

| File | Role |
|---|---|
| `index.html` | Project A. **OWN UI v1 (no theme)**: pitch-night skin, day segmented control, search + league chips, live snap rail w/ minute badges, league-grouped rows. Same `/api/matches?day=` contract + worker→api→`matches.json` fallback. |
| `player.html` | Project B. **OWN UI v1 (no theme)**: dark night page, 16:9 stage, click-shield, `المشغّل الرئيسي` / `📡 سيرفرات بديلة` server toggle (revealed when `via==='hd7livex'`), fullscreen/reload, popup guard, `?demo=1` mode. Same `/api/player` contract. |
| `index-inline.html`, `player-inline.html` | **Mirrors — must stay byte-identical to sources** (verified with difflib; residual diff must be 0). Historically built by inlining `style.css`/`matches.json`; currently exact copies. Any fix script that touches a source must also touch its mirror (`mobile_fix_mirrors.py` pattern). |
| `api/matches.js` | Vercel fn: scrapes kooralive-plus.info today/yesterday/tomorrow pages, parses `<a data-home …>` anchors + logos/time/result/league, **skips Egyptian league** (no الدوري المصري), 30s cache. |
| `api/player.js` | Vercel fn: given `?id=&href=[&home=&away=]`, fetches match page, extracts stream iframe (`yasirtv\|romabar\|alba\|player`); else queries sister domains' `/wp-json/sting/v1/iframes` (origin-allowlisted `"Unauthorized origin"` — effectively dead); else tries **hd7livex resolver** (§10) and returns `{found:true, via:'hd7livex', playerSrc:leaf, livePage}`; else returns `fallbackUrl`. |
| `worker.js` | Cloudflare worker: LIVE scraper + proxy (`/api/matches`). |
| `worker-serve.js` | Cloudflare worker: allowlisted stream proxy (`kooralive-plus.info`, `romabar.info`, `yasirtv.com`, …). |
| `matches.json` | Static fallback match data. |
| `style.css` | External stylesheet (legacy; live pages are self-contained). |
| `sw.js` | Service worker: network-level ad + telegram blocker (`t.me`, popads/popcash/adcash/propeller/exoclick/adsterra/doubleclick/…). |
| `fix_player.py` | Old: multi-domain sting API resolution. References stale `C:/Users/Abdelli/Documents/make_inline.py` (that folder no longer exists — do not rely on it). |
| `ui_improve.py` | Old: modern cards, search, league filter, live pulse, hover, shadows. |
| `premium_ui.py` | Old: glass/gradients hero (REVERTED in `b6b49c3` — do not re-apply). |
| `ui_redesign.py` | `d4a9d45`: flat Arabic RTL redesign (live rail, league groups, tabular numerals; JS hooks unchanged). |
| `mobile_tune.py` | `378fb12` (MOBILE-TUNE-v1): 640px expansion, 44px targets, 16px search, full-bleed player. |
| `mobile_fix2.py` … `mobile_fix4.py`, `mobile_fix_mirrors.py` | This session's fixes (see §5). Kept in repo as the edit record. |
| `shots/shot.py` | Playwright screenshots 390×844 (index top/full/mid, player top/full) via local HTTP server. **Untracked, never commit.** |
| `shots/diag.py` | Overflow-offender evaluator (elements wider than viewport). **Untracked.** |
| `_watch.html` | Scratch file. **Never commit.** |

## 3. Design system (OWN UI v1 — STING theme fully removed 2026-09-04)

- RTL Arabic, flat, mobile-first. Own pitch-night identity (nothing copied
  from the clone sites).
- Tokens: `--night:#071f19`, `--pitch:#0b3d2e`, `--grass:#16a34a`,
  `--paper:#f2f5f2` (index) / `#0c1a15` (player), `--ink`, `--muted`,
  `--line`, `--live:#e0202e`, `--gold:#ffb800` (minute badge). One font:
  Cairo (Google Fonts + system fallback), tabular numerals.
- Signature: live minute badge (gold pill + pulsing dot), grass-green
  "touchline" edge on live cards, header center-circle + halfway-line motif.
- Index: dark header → overlapping day segmented control → search + league
  chips → live snap rail → league-grouped rows (status col + teams + `‹`).
- Player: dark page, 16:9 stage, translucent click-shield, server toggle
  pair, fullscreen/reload, blocked-counter.
- Mobile rules: 44px+ targets, 16px inputs (iOS zoom),
  `env(safe-area-inset-bottom)`, `:focus-visible`, `prefers-reduced-motion`.
- (Historical: maroon `#750044` brand + all `.STING-web-*` classes, drawer,
  `::before` live banner — deleted with the rewrite. See git for the old.)

## 4. Full history (git, oldest → newest)

- `b04dc27` "I love AMINA ❤️" — initial clean koora live, zero ads.
- `e2a891f` — remove AMINA branding, player fallback for FT, demo link.
- `85cb380`, `24963c2` — buttons working (fullscreen/reload/hide), theme back
  to original kooralive (no pink), player fallback, real player fetch.
- `f698d9c`, `bc9f5b4` — LIVE scraping via worker/Vercel `/api/matches`,
  today/yesterday/tomorrow tabs, robust parsing (Team 1/Unknown fix).
- `51e4a3b`, `86a30eb` — modern cards, search, league filter (`data-league`
  exact match), hide proxy box, remove spam banner.
- `c056e57` → `b6b49c3` — premium glass UI tried, then **reverted**.
- `498111c` — player fetches real stream via `/api/player`, buttons fixed.
- `89982e9` — multi-domain sting API resolution, dead yasirtv guess dropped.
- `ad584dc` — Egyptian league removed.
- `d4a9d45` — flat Arabic RTL redesign (live rail, league groups, tabular
  numerals; JS hooks unchanged).
- `378fb12` — mobile tune v1 (640px, 44px targets, 16px search, player).
- `27b1ba9` — mobile fixes v2–v4 + mirror sync (this session, see §5).
- `7513cda` — live-player hd7livex resolver (this session, see §10).
- `fc98577` — OWN UI v1: both pages rewritten from scratch, pitch-night
  identity, zero STING CSS (this session, see §11).
- `aea1779` — improvement batch #2/#4/#8/#9 (this session, see §12).

## 5. Mobile-fix saga (2026-09-04, user: "still not mobile optimized")

Root cause of the worst bug: theme turns `.STING-web-Header-Menu` into an
off-canvas drawer ≤1000px (`position:fixed; right:-300px; width:245px`) but the
redesign ships **no hamburger/opener** (zero JS refs) — a dead drawer. V1 had
set it to `width:100%` while still parked off-screen → white slab hiding nav +
away teams.

- **fix2** (`mobile_fix2.py`): un-drawer block ≤1000px
  (`position:static !important; width:100% !important; …`) + nav becomes a
  horizontal scrollable pill row. Verified: slab gone, both teams + minute
  badge visible.
- **fix3** (`mobile_fix3.py`): unified rainbow day tabs (theme leaked
  blue `#104783` أمس / orange `#af5100` الغد) to ghost + maroon `.on`; filled
  player's empty logo spans ("كورة لايف / بث نظيف بدون إعلانات"); white pill
  links on player. **REGRESSION**: timing-stack rule
  (`.STING-web-Match-Timing{display:flex}` +
  `> div{position:static !important}`) re-anchored the red `::before` live
  banner from the pill to the whole card → full-width pink bars on live cards.
  Lesson: never `position:static` inside `.STING-web-Match-Timing`.
- **fix4** (`mobile_fix4.py`): reverted the timing-stack (theme owns the live
  banner; its blink mid-state only *looked* like overlap); player pills got
  `color:#141b26` (theme drawer leaked white text → invisible on white pills),
  killed drawer `display:grid` stack, wrapped header
  (`.STING-web-Header` + `-Right` wrap; logo `margin:auto` + `nowrap` centers
  on its own row).
- **Mirror sync** (`mobile_fix_mirrors.py` + parity notes): applied net
  fix2–fix4 effect to `index-inline.html`/`player-inline.html`; difflib
  residual diff = 0.

## 6. Verification workflow (use every time)

1. Serve repo via `ThreadingHTTPServer` on 127.0.0.1:890x, Playwright Chromium
   390×844 `is_mobile`, screenshots (`shots/shot.py`).
2. Overflow diag: no element may exceed viewport width (`shots/diag.py`
   pattern); last run: `docScrollW=390 offenders=[]` on both pages.
3. `node --check` every inline `<script>` (extract blocks without `src=`).
4. Mirrors at zero diff vs sources.
5. Commit (include fix scripts) + push to `origin main`. Never commit
   `_watch.html` or `shots/`.

## 7. Current state (2026-09-04, after batch §12)

- Index: 45s silent score refresh (visible-tab only, LEAGUE + scroll kept);
  JSON-LD SportsEvent graph (≤50) injected per render; SW registered.
- Player: ordered server list [leaf → livePage → fallbackUrl]; watchdog
  auto-advances on ≥3 blocks/15s with "نحاول سيرفراً آخر…" toast (probe:
  advanced one.example→two.example, counter محظور: 3); SW BLOCKED msgs
  wired into the counter; dynamic `document.title` per match.
- PWA: `manifest.webmanifest` + 3 PIL icons (192/512/maskable,
  apple-touch 180); `robots.txt` + `sitemap.xml` (canonical
  `https://kooraadz.vercel.app/`); OG/twitter/canonical meta both pages.
- Verified: node --check 0/0; 390px scrollW=390 both, no overflow;
  console clean except benign local-/api-404 + upstream autoplay noise.
  Mirrors at zero diff.
- Index mobile: clean header pills, unified day tabs, live cards (score +
  league pill + blinking banner), ended cards ("انتهت"), no overflow.
- Player mobile: centered logo, readable pills, back button clear, stacked
  44px controls. Logo "ghosting" seen once was a screenshot downscale artifact
  (zoomed clip is crisp).
- **Player stream path RESOLVED server-side, NOT yet confirmed in a real
  browser** (see §10): `/api/player?id=4788139&home=أبها&away=الاتفاق`
  returns `{found:true, via:'hd7livex',
  playerSrc:'https://s15.yallaxsport.com/ch/ch9.php',
  livePage:'https://goalkooora.info/live/test1.php'}` (STATUS 200, real
  handler e2e). Headless Playwright is Adscore-gated at the leaf embed, so
  only a human opening OUR player link can confirm video plays. See Pending.

- Index mobile: clean header pills, unified day tabs, live cards (score +
  league pill + blinking banner), ended cards ("انتهت"), no overflow.
- Player mobile: centered logo, readable pills, back button clear, stacked
  44px controls. Logo "ghosting" seen once was a screenshot downscale artifact
  (zoomed clip is crisp).
- **Player stream path RESOLVED server-side, NOT yet confirmed in a real
  browser** (see §10): `/api/player?id=4788139&home=أبها&away=الاتفاق`
  returns `{found:true, via:'hd7livex',
  playerSrc:'https://s15.yallaxsport.com/ch/ch9.php',
  livePage:'https://goalkooora.info/live/test1.php'}` (STATUS 200, real
  handler e2e). Headless Playwright is Adscore-gated at the leaf embed, so
  only a human opening OUR player link can confirm video plays. See Pending.

## 8. Pending — what we are waiting for

1. **Deployed site URL — GOT IT: `https://kooraadz.vercel.app/`.** Live e2e
   2026-09-04 ~19:00 UTC: `/api/player?id=4788139&home=أبها&away=الاتفاق`
   → 200 `{found:true, via:'hd7livex',
   playerSrc:'https://s15.yallaxsport.com/ch/ch9.php'}`; headless 390px
   render of OUR player page shows the leaf iframe loaded, `📡 سيرفرات
   بديلة` visible, `docScrollW=390`, click-shield overlay up, console clean
   except benign upstream font-CORS + permissions-policy noise (ad-blocker
   correctly eating `adsco.re`). Proof: `shots/live_player.png` (untracked).
2. **Real-browser play confirmation (needs user).** User opens OUR Abha player
   link in a real browser and confirms video plays (headless can't — Adscore
   gate). If it plays, the deferred live-player work is DONE.
3. **Armed live-match monitor (background task, inherited).** When it fires:
   wire the server-rendered player iframe into `api/player.js`/`player.html`,
   push, reply. Do not poll it. (Largely superseded by §10 resolver, but keep
   armed until play is confirmed.)
4. **This file.** Update + push on every change (protocol at top).

## 9. Hard-won environment notes (Windows, PowerShell 5.1)

- Tool cwd is `C:\Users\Abdelli\Desktop`, NOT the repo — always use absolute
  paths (this bit us twice: `shots\shot.py`, `mobile_tune.py`).
- No heredocs (`<<` fails), no `head`/`grep`/`tail`/`&&` — use `;` chains and
  `python -c` for text processing.
- Edit scripts: guarded `load`/`save`/`rep1` idiom
  (`EXPECTED 1, FOUND n` asserts, marker comments `MOBILE-FIX-vN`, idempotent
  re-runs, `BASE = os.path.dirname(os.path.abspath(__file__))`).

## 10. Live-player resolver saga (2026-09-04 evening, user: "there is a match")

User reported a live match, then gave the breakthrough lead:
`https://hd7livex.com/test1/` ("this one has a player"). Provenance: 5 live
matches at the time (Abha-Ettifaq `4788139` 2nd half, Khenchela-USMA
`4827476`, Lyon-Auxerre `4735277`, Swehly-KVZ `4805131`, AS Port-Zamalek
`4805134`).

- **Everything old is dead (verified live).** Kooralive match pages are SEO
  articles (no watch links even rendered); the sister-domain sting
  `/wp-json/sting/v1/iframes` API is origin-allowlisted
  (`{"error":"Unauthorized origin"}`, CORS fail, HTTP 403 on all 3 domains);
  packed theme JS has no player; cards carry no channel data; `koorae.live`
  is DNS-dead.
- **Working chain (verified on 2 matches, Abha + Lyon, different leaf
  schemes):** hd7livex `matches-today` card →
  per-match page (e.g. `/أبها-ضد-الاتفاق-2/`) → `goalkooora.info/live/*.php`
  (full AlbaPlayer v10 UI with server buttons) → `goalkooora.info/m9/*.php`
  (279-byte iframe shell) → **leaf provider embed** (Abha→
  `s15.yallaxsport.com/ch/ch9.php`; Lyon→
  `cup.kora-live-live.com/albaplayer/sports-4/`). **Every step is statically
  fetchable** (no JS needed); the leaf is bot-gated (Adscore — headless gets
  a 3KB ad shell / hijack nav to YouTube) but plays in real browsers.
- **Headless trap (don't repeat):** plain-HTTP hd7livex returns 200 with no
  server redirect, yet Playwright navigated to YouTube — it was a client-side
  ad/hijack top-nav (`nn125.com`, fingerprints `Chrome Headless`, geo DZ).
  Blocking ad requests kills the main frame via the aborted top-nav. Static
  fetching sidesteps all of it.
- **Implementation.** `api/player.js`: `resolveHd7(home, away)` — Arabic-loose
  `normAr` matching (أ/إ/آ→ا, ة→ه, ى→ي, strip tashkeel) of card titles from
  the script-stripped day page
  (`class='alba_sports_events_link'\s+href='([^']+)'\s+title='([^']+)'`,
  title-includes-home-or-away), then live→m9→leaf iframe regexes with
  `//`→`https:` fixups; 8s `fetchT` AbortController timeouts. New optional
  `?home=&away=` params (also used by local tests; falls back to
  `/api/matches` self-lookup by id). `player.html`: `via==='hd7livex'` loads
  the leaf **directly** (never via worker proxy — proxying breaks the
  provider), reveals the `📡 سيرفرات بديلة` button to swap-toggle leaf ↔
  `livePage`. Probes live in `shots/` (hd7_*, goal_*, ch_*, card_dump.py,
  live_probe.py, …). **Never commit `shots/` or `_watch.html`.**
- **Not yet proven:** video actually playing in OUR player (needs deployed URL
  + real browser — see §8.1–8.2).

## 11. OWN UI v1 rewrite (2026-09-04 ~19:00 UTC, user: "UI is dawg shit, make our own")

Both `index.html` + `player.html` rewritten from scratch — zero STING CSS,
zero maroon, zero drawer. Pitch-night identity (§3). User confirmed
"everything is working" on the stream side first, then asked for this.

- Kept contracts: `/api/matches?day=` fields, worker→api→`matches.json`
  fallback, `/api/player` found/via/embedUrl/livePage/fallbackUrl, popup
  guard regexes, click-shield, `?demo=1`. Dropped: inline sample data in
  player head (demo mode covers it), telegram-hide button (nothing to hide
  anymore — no telegram links in our own UI).
- Verified: `node --check` exit 0 both; local 390px render
  (`shots/own_index.png`, `shots/own_player.png`, untracked):
  `docScrollW=390`, no overflow offenders, 3 live rail cards + league rows
  from `matches.json`, player shield up. Live classifier: `isLive()` on
  official_status/status/game_time/result_text, `isEnded()` on انتهت/FT.
- Deployed-URL check of the new UI on `kooraadz.vercel.app` still pending
  at time of commit — verify after Vercel rebuilds.

## 12. Improvement batch #2/#4/#8/#9 (2026-09-04 ~19:20 UTC, user: "do 2 and 4 and 8 and 9")

From the 10-item improvement list: user picked #2 auto-refresh, #4 PWA,
#8 fallback chain, #9 SEO.

- **#2 auto-refresh (index):** `loadDay` split into `fetchData(day, silent)` +
  `loadDay(day, silent)`; `setInterval 45s` calls `loadDay(DAY, true)` —
  skips when `document.hidden`, keeps scroll + LEAGUE, cache-busts `_=Date.now()`.
- **#4 PWA:** `manifest.webmanifest` (ar/rtl, standalone, #071f19, 192+512+
  maskable) + PIL icons (`icon-192/512.png`, `apple-touch-icon.png` —
  green rounded square, white ball, 5 dots); SW registered on load in both
  pages; SW `{type:'BLOCKED'}` messages wired into player's `bumpBlocked()`.
- **#8 fallback chain (player):** `showServers(main, alt, fb)` builds deduped
  `serverList` [embed/leaf → livePage → fallbackUrl]; watchdog in
  `bumpBlocked()` auto-advances (`goServer(srvIdx+1)`) on ≥3 blocks/15s with
  toast; manual toggle preserved (+`trackServer`). Demo branch registers its
  single server too.
- **#9 SEO:** description/canonical/OG/twitter/manifest/apple-touch meta both
  pages; dynamic player `document.title` (`مشاهدة home × away بث مباشر`);
  `robots.txt` + `sitemap.xml`; `injectJsonLd()` writes ≤50 SportsEvent
  `@graph` per render. **Bug caught by probe:** `$('#jsonld').remove()`
  threw on first render (null) — fixed with `getElementById()?.remove()`.
- Verified: node --check 0/0; `shots/watchdog_probe.py` (advanced ✓, toast ✓,
  counter ✓); `shots/jsonld_probe.py` (5 SportsEvent ✓); `shots/console_probe.py`
  (only benign local-/api-404 + upstream autoplay noise); 390px scrollW=390,
  no overflow; mirrors 0/0. New probes live in `shots/` — untracked, never commit.

## 13. Player sources upgrade (2026-09-08, user: "improve the sources of player how they are displayed etc")

Root cause of "only 2 generic buttons": `api/player.js` resolved ONLY the first
AlbaPlayer tab (Live 1 → m9 → leaf) and returned `{embedUrl, livePage,
fallbackUrl}`; `player.html` rendered them as two fixed buttons (`srvMain` /
`srvAlt`) with the fallback unreachable manually (watchdog-only).

- **Probe (live 2026-09-08):** `hd7livex.com/matches-today` → 18 cards (incl.
  spam); `test1/` → `goalkooora.info/live/test1.php` → `<ul
  class="albaplayer_name">` with **3 tabs** (Live 1/2/3 → test1/test11/test111.
  php), each with its own `/m9/*.php` → leaf (`cup.kora-live-live.com/
  albaplayer/sports-5/` for test1). Same pattern on test2 (test2/22/222). So
  every match has 3+ playable servers, we exposed 1.
- **`api/player.js`:** new `resolveHd7` parses ALL `<ul class="albaplayer_name">`
  tabs (cap 1+3), resolves each via `resolveOneLive` (live → m9 → leaf, 6s
  `fetchT`, `Promise.all`, `allSettled`-style per-tab try/catch), returns
  `servers: [{label, url, livePage, m9, leaf, kind, via}]` + `count`, keeping
  legacy `embedUrl/livePage/fallbackUrl` fields. Direct kooralive iframe +
  hd7 merged (`via: 'mixed'`), fallback always last (`kind: 'fallback'`).
- **`player.html`:** new match card (`#matchCard`: logos + names + league +
  time, painted instantly from URL params `hl/al/lg/tm`, enriched by API
  `home/away`); new sources header (`مصادر البث (N)` + `تشاهد الآن: X (i/N)`);
  responsive grid (`#serverGrid` 2-col mobile, 3-col ≥640px) with numbered
  buttons + kind badges (سيرفر/مباشر/واجهة كاملة/احتياطي) + via + live-dot;
  skeleton (3 shimmer) while loading, retry button on error/empty, `srcNote`
  explainer; watchdog + popup guard + click-shield + SW unchanged.
  Legacy `showServers(main, alt, fb)` kept as a compat shim onto
  `showServersFromList`.
- **`index.html`:** `playerLink()` now forwards `hl/al/lg/tm` so the player
  header renders without an extra fetch.
- **Mirrors:** `Copy-Item` sources → `*-inline.html`, verified byte-identical.
- Verified: `node --check` api/player + both inline scripts OK; Playwright
  390px (`verify_player2.py`, untracked TEMP): matchCard visible, retry state
  clean, mock 4-server grid renders (count=4, `تشاهد الآن: Live 1 (1/4)`),
  click → Live 2 (2/4) + iframe src swaps, `scrollW=390 offenders=[]`,
  zero pageerrors.
