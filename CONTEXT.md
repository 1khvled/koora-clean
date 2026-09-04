# KOORA-CLEAN — Agent Context (A to Z)

> **Auto-update protocol (mandatory):** any agent that modifies anything in this
> repo MUST update this file in the same commit: append to `Changelog`, update
> `Current state`, `Pending`, and any section the change affects. Then push to
> GitHub (pushes are pre-authorized by the owner). Never leave this file stale.
> Last updated: 2026-09-04 (commit `7513cda`).

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
| `index.html` | Project A. Single file: minified STING theme CSS + custom override `<style>` + inline `<script>` (fetch `/api/matches?day=`, render cards). |
| `player.html` | Project B. Single file: player shell, controls, inline sample data in head for offline layout. Has hidden `📡 سيرفرات بديلة` button (revealed when `via==='hd7livex'`) that swap-toggles iframe between leaf embed and full `livePage` server UI. |
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

## 3. Design system

- RTL Arabic, flat (no glass/gradients — that direction was tried and reverted).
- Tokens: `--brand:#750044` (maroon), `--ink:#141b26`, `--card`, `--line`,
  `--muted`, `--radius`, `--shadow`. Live red `#d00000`.
- Theme classes keep STING names (`.STING-web-Match[.LIVE|.END|.SOON]`,
  `.STING-web-Match-Timing > #STING-web-Match-Time / #STING-web-Result /
  .STING-web-Data`, `.STING-web-Match-Center`, `.STING-web-Header…`,
  `.STING-web-Menu`, `.STING-web-Matches-Toggle`).
- Live card anatomy: score `#STING-web-Result`; league pill `.STING-web-Data`;
  red blinking **"جارية الآن" banner is a `::before` on
  `.STING-web-Data.LIVE`**, absolutely positioned against the pill
  (`position:relative` on the pill is load-bearing — see fix3 incident §5).
  Theme hides `#STING-web-Match-Time` for LIVE
  (`.STING-web-Match.LIVE #STING-web-Match-Time{display:none}`).
- Live matches render twice by design (dark live-rail + main list) — leave alone.
- Mobile rules: 44px touch targets, 16px inputs (iOS zoom),
  `env(safe-area-inset-bottom)`, `:focus-visible`, `prefers-reduced-motion`,
  `margin-inline-start` for RTL.

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

## 7. Current state (2026-09-04, after `7513cda`)

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
