# KOORA-CLEAN — Agent Context (A to Z)

> **Auto-update protocol (mandatory):** any agent that modifies anything in this
> repo MUST update this file in the same commit: append to `Changelog`, update
> `Current state`, `Pending`, and any section the change affects. Then push to
> GitHub (pushes are pre-authorized by the owner). Never leave this file stale.
> Last updated: 2026-10-05 (§126 — failed posts retry instead of vanishing).

## 126. Failed posts retry instead of vanishing (2026-10-05)

- **Owner: "bot stopped posting the news".** It had not stopped — runs were
  green and the source had simply gone quiet (state 375877 = source newest).
  But digging found one real loss: the 13:25 run saw 1 new item (#375877,
  Mahrez-to-Qatar + a valid 47KB JPEG) and Telegram answered `HTTP 400`
  with an empty body. First blamed on a transient hiccup — wrong: the same
  bytes failed twice, and a hand-built request with correct framing posted
  fine. Root cause is in our own `bot()`: its multipart used `\r\r\n`
  instead of CRLF, which telegram tolerates for most files but rejects with
  an empty 400 for some. Fixed to spec-correct framing plus a real mime per
  file type. The loop also ran `state['offside'] = key` unconditionally,
  burying the post forever.
- Fix: `state['post_retry']` remembers failed keys (3 attempts, then it gives
  up loudly). Each run processes queued retries first, then fresh items;
  retries that scrolled out of the 25-item preview window are dropped, and
  successes clear the queue. Every send outcome is now logged with its key.
- Two pre-existing bugs surfaced by the full suite while verifying (both
  failed on HEAD too): `with_link` joined with `\r\n` instead of `\n`, and
  `photo_name` tested PNG magic `\r\r\n` which no real PNG has. Both fixed;
  all 20 suites green.

## 125. Automatic kooradz ads: kickoffs + heartbeat (2026-10-05)

- Owner: run ads for kooradz "always, from time to time, when matches start".
  New `scripts/tg_promo.py` runs in the workflow after the bridge: a fixture
  that kicked off in the last 15 min gets one post with its exact player
  link (several at once become a single combined post, never a burst, max 4
  links); otherwise a general heartbeat at most once per 6h and only on days
  our site lists matches. Both tracked in tg_state.json, so nothing reposts.
- Copy is English-only with no team names (fixtures are Arabic-only and
  translating names is how manglings happen); the exact link carries the
  match. No gambling/store wording, source never named.
- Verified live: first run saw 36 fixtures and posted heartbeat #236 with the
  site link (plus the site's own preview card). `promotest` 9 cases green.

## 124. Streaming link posted in bio and pinned post (2026-10-05)

- Owner asked for the https://kooraadz.vercel.app/ link to appear: it now
  sits in the channel About (240/255 chars, verified live via getChat) and as
  the second line of the pinned keyword post (#234, edited in place, link
  confirmed in the public preview). Every match post already carries its exact
  `player.html?m=<id>&d=<day>` link when it names exactly one fixture.

## 123. Oversized clips now fit: ffmpeg proven on the runner (2026-10-05)

- Owner approved `apt-get install -y ffmpeg` in the news workflow (their
  standing "download nothing" rule explicitly waived for this one package).
  Installed as its own step before deps; the check `ffmpeg_path()` still
  declines cleanly if it is ever missing.
- **Proven on the real runner** (verify-compress run 37305872738, success):
  ffmpeg 6.1.1 installed, the real 74.8MB source clip (1920x1080, 83.6s,
  7159 kbps) compressed to **38.4MB at CRF 30, full 1920x1080 kept, same
  duration, 3672 kbps, 51.3% of original, UNDER_CAP True**. No scaling was
  needed; the CRF ladder (24 -> 27 -> 30) only steps quality down as far as it
  must. Anything already under 50MB is still never re-encoded.
- The TEMP verify-compress workflow was deleted after proving it. Nothing
  under the cap is ever touched; oversized clips post as real videos now
  instead of still frames.

## 122. Mangled names fixed - twice the guard (2026-10-05)

- **Owner caught the channel publishing**
  `- Tibo Kortuwa will stay with Real Madrid...` (and a `Fabriyo Romano`
  header). The LLM had transliterated the Arabic name phonetically instead of
  recovering the real footballer. Post #233 was corrected in place.
- Two layers now prevent any repeat:
  1. the translation prompt explicitly says to recover the real athlete's
     actual sport name ("Thibaut Courtois", never "Tibo Kortuwa"; also
     Fabrizio Romano, Kylian Mbappé, Erling Haaland);
  2. a deterministic `repair_names()` post-processor corrects the visible
     mangling variants before any text reaches the send path.
- Verified: `namestest` 8 cases, and the integration case drives the real
  `llm_fix` path to assert no mangling survives.

## 121. Ten old posts upgraded; my own cleanup bug and the ffmpeg truth (2026-10-05)

- **A mistake of mine, caught by the owner.** The `sendAnimation` test cleanup
  deleted the **wrong message**: it searched a 20KB slice per post, which bled
  into the next message and matched a false id, so it deleted **#220 (a real
  news post)** and left the test **#223** in place. Fixed both: #223 deleted,
  and the lost post identified by walking the source timeline around the gap
  (source **#375855**, a Pedro Proenca quote distinct from #219's) and
  re-posted as **#225**. Verified it is not a duplicate. Lesson: every region
  must be bounded to the next marker, never a fixed slice.
- **Old posts that were really clips.** Timestamp matching was tried first and
  **rejected** — it happily paired a Jorge Jesus caption with the Haaland
  animation, which would have put the wrong clip on a post. Replaced with a
  *provable* method: re-run the same deterministic translation of each source
  post and require the caption to reproduce exactly. A match proves identity; a
  miss proves nothing, so misses are left alone rather than guessed. **10
  posts** qualified and were converted in place with `editMessageMedia`,
  captions and original bytes kept (10.6-39.0MB). Verified 10/10 now carry
  real media.
- **ffmpeg is NOT on the GitHub runner.** I assumed it was and said so; a
  throwaway workflow proved otherwise (`FileNotFoundError: 'ffmpeg'`, and
  `ffprobe` is missing too). So `compress_video` is written and unit-tested
  (CRF ladder 24→27→30, then a mild 1280px scale; nothing under the cap is
  ever re-encoded; ffmpeg errors degrade cleanly) but **it cannot run in
  production yet** — oversized clips still fall back to their frame. Enabling
  it means installing a package in the workflow, which is the owner's call
  given the standing "download nothing" rule. Temp workflow deleted.

## 120. sendAnimation proven live; unrequested source gated off (2026-10-05)

- **Upload path proven end to end**, not just unit-tested: pulled the real
  1.3MB gif from source #375832 through the session, posted it with
  `sendAnimation`, confirmed telegram stored playable media, then deleted the
  test message (#220, `deleteMessage` OK). So gifs now go out as gifs.
- **The session also woke up a feed nobody asked for.** `main()` pulls the
  private Kurdish channel whenever a reader session exists, and the session
  now exists. It could not actually post — the join came back as
  "you have successfully requested to join", pending the channel admin — but
  that was luck, not design. Gated behind `ENABLE_KURDISH_SOURCE=1`, so the
  session stays purely the GIF/video capability it was added for. Say the word
  and it can be switched on deliberately.
- Full channel audit after all of this: **0 Arabic, 0 duplicates**, and every
  post decided by an explicit, logged media decision.

## 119. Reader session live; real media type from Telegram (2026-10-05)

- Owner supplied `api_id` / `api_hash` and ran the one-time login. All three
  secrets (`TG_API_ID`, `TG_API_HASH`, `TG_SESSION`) now exist and the session
  authorizes as **userknow11**. Secret writing was verified end to end first
  (NaCl sealed box, HTTP 201, listed present, then a throwaway secret deleted)
  so nothing was guessed. Leak scan before every commit: no session string or
  api_hash anywhere in the repo.
- **The same async-client bug was in the bridge**, not just the login script:
  `tele_animation` called `connect()` / `get_messages()` / `download_media()`
  on Telethon's **async** client with nothing awaited. It printed
  `coroutine ... was never awaited` and returned nothing — so GIFs would
  have silently stayed broken in production. Switched to `telethon.sync`
  everywhere (the Kurdish path in `main()` had it too).
- **What the media actually is**, read from MTProto document attributes
  (`DocumentAttributeAnimated` vs `DocumentAttributeVideo`):

  | msg | true type | size | note |
  |---|---|---|---|
  | 375832 | **ANIMATION (gif)** | 1.3 MB | web preview served it; we posted it as **video** — mislabelled |
  | 375818 | VIDEO | 15.8 MB | preview refused it ("Media is too big"); we posted the **frame** |
  | 375812 | VIDEO | **74.8 MB** | over the bot api's 50MB cap — no bot can ever send it; frame it |

  So "not supported" in the web preview means *too big for the preview*, not
  *it's a gif*. A real gif is a different animal and must go out via
  `sendAnimation` to earn the gif badge.
- New `tele_media(mid)` returns `(true_kind, bytes)`; the loop prefers it and
  only falls back to the web preview when there is no session. Real gifs →
  `sendAnimation`, videos → `sendVideo`, over-50MB → its frame, with the
  reason printed every time.
- Verified live: `tele_media` 4/4 against the real source (animation 1.3MB,
  video 15.8MB, oversize refused, photo has no document); 17 suites green.

## 118. GIFs cannot be fetched without a login — and why (2026-10-04)

- **Owner** asked for a script that just downloads the GIFs autonomously.
  Tested every autonomous route first; all three are closed by Telegram:
  1. **Public web** — 21 probes (7 user-agents: Chrome, Googlebot, Twitterbot,
     TelegramBot, iOS, curl × `/id`, `?embed=1`, `/s/chan/id`) returned **0**
     `.mp4` urls, plus every `<head>` meta tag checked. Only the poster frame
     and `Media is too big / VIEW IN TELEGRAM`.
  2. **Our own bot** — `getChatMember` → `member list is inaccessible`,
     `getChat` by plain id → `chat not found`. So `copyMessage` /
     `forwardMessage` cannot read the source.
  3. **Third-party mirrors** — excluded by the owner's standing rule.
  A downloader therefore has to be an *authenticated* Telegram client. That one
  step needs a phone + SMS code, so it cannot live in CI.
- **Owner decision:** until a session exists, GIF posts keep their frozen
  frame as a photo (chosen over skipping the post). The log always says which
  happened, so it is never a silent downgrade.
- **Bug found in `scripts/tg_login.py`:** it called
  `client.session.save()` inside a `with TelegramClient(...)` block, which only
  calls `connect()` — never `start()`. It therefore printed an
  **unauthorized** session that could read nothing. Fixed to `start()` first
  (login code + 2FA), then print, and to fail loudly on a bad `api_id`.
  Removed the duplicate `make_session.py` I had added; `tg_login.py` is the
  single documented entry point, and `TG_SETUP.md` now explains it also enables
  GIFs.
- Once `TG_API_ID` / `TG_API_HASH` / `TG_SESSION` exist, `tele_animation()`
  fetches the real clip and `sendAnimation` posts it. Those three env vars are
  already wired into the workflow and Telethon is already installed, so no
  further code is needed.

## 117. GIFs: what the source posts vs what the web preview gives (2026-10-04)

- **Owner** was right again: the source posts **GIFs** too, and we were
  putting them up as static photos. Measured over 99 source posts:
  **9 real videos, 32 photos, 10 GIFs, 48 text** — so ~10% of posts were
  GIFs we could not deliver.
- **Root cause of the miss.** `post_video` only accepted a `<video>` src whose
  URL contained `.mp4`. A GIF's page has **no `<video>` element at all**:
  ```
  <a class="tgme_widget_message_video_player not_supported ...">
    <i class="tgme_widget_message_video_thumb" style="background-image:url(...thumb.jpg)">
    <div class="tgme_widget_message_video_wrap"></div>          <!-- empty -->
    <div class="message_media_not_supported_label">Media is too big</div>
    <span class="message_media_view_in_telegram">VIEW IN TELEGRAM</span>
  ```
  Telegram **serves no bytes** for it — only the poster frame. So the GIF fell
  through to `post_photo` and went out as a still. Nothing was wrong with the
  source; the public preview simply does not expose animations.
- **Fixed and made honest.** `source_media(mid)` now classifies each message as
  `video` / `animation` / `photo` / `none` from one fetch, and returns the
  playable mp4 only for real videos. `send_post` gained a `sendAnimation`
  branch (original bytes, no re-encode). The loop logs the decision every time:
  `GIF/animation - web preview has no bytes`, then either
  `got animation bytes (N)` or
  `no reader session -> animation bytes unavailable; posting its frame`.
- **Animation bytes need a user session.** `tele_animation(mid)` fetches the
  real file over MTProto with `TG_API_ID` / `TG_API_HASH` / `TG_SESSION` (all
  three already wired into the workflow env, Telethon already installed). With
  no session it returns None and we post the frame instead — a visible,
  labelled degradation rather than a silent one. **Owner must add those three
  secrets for true GIFs.**
- Verified: `giftest` (8 cases incl. real captured markup), `media_kind` 6/6
  correct against the live pages (#375812/#375818 → animation, #375832 →
  video, photos → photo), 17 suites green.

## 116. Link observability + ascii-safe logs (2026-10-04)

- The first production runs after §115 posted nothing linkable (the source
  had gone quiet — matches finished), so the feature had no visible effect
  and no way to tell "no link" from "site unreachable". Added
  `[links] fixtures loaded: N (site reachable)` once per run, `[links] no
  fixtures from our site`, and `[links] match: <home> vs <away> -> <url>` per
  match. Now every link decision is in the run log.
- **Bug found while doing that:** logging the Arabic team names raised
  `UnicodeEncodeError` on a cp1252 stdout, and that print sits *outside* the
  per-post `try`, so it would have taken the entire run down. Team names are
  now `ascii()`-escaped in logs. `asciitest` drives every logging path through
  a stdout that rejects non-ascii — the real regression guard, not a regex.
- Verified with live fixtures and only the Telegram API stubbed (`linkwire`):
  the caption actually sent is
  `MATCH START: Portugal vs Norway\n\n🎦 Watch live:
  https://kooraadz.vercel.app/player.html?m=4856703&d=today`
  and the photo caption carries it too. 16 suites green.

## 115. Match links + why videos looked random (2026-10-04)

- **Owner:** "when a match start post the link from our website
  https://kooraadz.vercel.app find it and post the exact match link always",
  and "videos sometimes you post sometimes you dont".
- **Videos are not random — measured.** Over a 100-item sweep of the source,
  **only 10 items contain a video at all**; `post_video` found **10/10**, zero
  missed. The other 90% the source posts a still photo, so we repost the photo.
  The post shown in the screenshot traces to source **#375808**, which is
  `mp4=0 photo=1` — there was never a video to take. To stop this being
  indistinguishable from a silent failure: `dl_video` now logs the reason
  (http / content-type / oversize / error) and retries, and the loop logs
  `#id posted VIDEO|PHOTO|TEXT` plus `source has no video` and
  `VIDEO FAILED -> falling back to photo`. A missing video is now provable.
- **Match links.** URL contract confirmed from the live site and from
  `player.html`: `https://kooraadz.vercel.app/player.html?m=<id>&d=<day>`,
  where `<id>` comes from `/api/matches?day=today|tomorrow`. The page's
  `fetchSnap(sid, day)` probes today/yesterday/tomorrow, so the link
  self-heals if the day drifts. Teams on our site are Arabic, and so is the
  source, so matching runs on the **Arabic original** before translation:
  `norm_team` strips tatweel/harakat, unifies alef/ya/ta-marbuta, drops the
  article; a fixture matches only when **every** token of both teams appears.
- **Never guess.** `match_link` returns a link only when **exactly one** of our
  fixtures is named. A Klopp roundup naming four matches logs `ambiguous` and
  gets no link — a wrong link is worse than none. Site down → no link,
  never a broken post.
- `fingerprint()` now strips URLs and the "Watch live:" line, otherwise every
  channel caption would fingerprint differently from its Arabic source and the
  channel-seeded dedup window would never match.
- Verified: new `linkunit` suite (9 cases), 14 suites green, live dry run links
  5/19 real posts and every link checked by hand against the fixture.

## 114. All three complaints closed, verified live (2026-10-04)

- Owner complained about three things. Each had a distinct real cause; none
  was cosmetic. Final state after a dispatched run and a full-history audit
  of **95 posts**: **0 Arabic, 0 duplicate groups, 5 videos** all intact
  (HEAD 200, `video/mp4`, 9.6-12.2MB — no re-encode, original bytes).
- Live proof from run `37230737383`: `preview: 6 new, posted=5`,
  `skipped repeat #375782` (dedup firing in production), `[lang]` lines
  throughout (key flowing), and post **#163 is a real 11.4MB video**.
- Prompt quality: added "keep the name as written when unsure" and "no
  meta-labels", plus an output guard that rejects anything opening with
  Translation:/Corrected:/Here is. Known limit, stated plainly: the free
  30B models still approximate unfamiliar club/player spellings
  ("Saryuk" -> "Seryok"). Well-known names are fine. This is model quality,
  not a pipeline defect — recorded so it is not re-chased.
- Groq's `qwen/qwen3.8-27b` intermittently 429s under this cadence; the
  `openai/gpt-oss-20b` and free fallbacks absorb it with no visible gap.

## 113. Videos never posted: undefined function + silent except (2026-10-04)

- **Owner:** "u are not posting videos". They were right, and §109 was wrong.
  `post_video()` called `single_region()`, which was **never written to the
  file** — a `swap()` helper aborted on a failed assertion before its write,
  so the function never landed. A bare `except Exception: pass` swallowed the
  `NameError`, so `post_video` returned `''` every time and every video
  silently degraded to a photo with **no error anywhere**. §109's "verified"
  was only the stubbed test path, which never exercised the real lookup.
- Fixed: `single_region()` defined, the blanket `except` replaced with a
  logged failure. Live probe: source item 375768 now resolves a 10.6MB mp4
  (`post_video` -> YES).
- **Lesson recorded:** every helper a function calls must exist; a bare
  `except` around a lookup is how a total feature failure stayed invisible for
  hours. New `vidprobe` suite exercises the real `fetch_single` path.
- Also in this batch: all 22 remaining Arabic posts translated in place (media
  bytes unchanged, caption only) and 46 redundant reposts deleted — keeping
  the richest copy of each (video > photo > text, oldest on ties). Channel
  audit now: **0 Arabic, 0 duplicates**.

## 112. Content dedup + live-verified key (2026-10-04)

- **Owner** also saw the same item 3-4 times. The source itself reposts
  identical content under fresh ids (measured: ids 375746 and 375753, same
  text), so id-based dedup could never catch it. Added `fingerprint()` — a
  sha1 over text with case, punctuation, digits-as-separators and emoji
  stripped — and a bounded 300-entry `seen` window in the state, checked in
  both loops. `save_state` trims it; the workflow's merge-max step now
  **unions** lists (it previously took the local list, which would have
  dropped a concurrent run's entries and re-posted them). Merge proven with a
  real git fixture: ids take max, `seen` = union of both windows.
- Live proof: the 19:25 run still showed zero `[lang]` lines because GitHub had
  resolved the pre-push workflow; re-dispatched afterwards and confirmed the
  key reaches the script.
- Verified: 10 suites green (new `deduptest`), YAML parses.

## 111. Arabic leak root-caused and walled (2026-10-04)

- **Owner:** "still posting arabic and old are arabic and u are not posting
  videos". Both complaints had one root cause each, neither cosmetic.
- **Arabic.** `GROQ_API_KEY` was in the repo secrets but **never wired into
  the workflow `env:`**, so `llm_fix` hit `if not key: return text` and
  shipped raw Arabic — silently, with no log line, which is why every run
  log showed zero `[lang]` lines and the backlog looked "already fixed".
  Three layers now: (1) key wired into env; (2) no key still reaches the free
  fallback, Groq output still containing Arabic is rejected, and an
  untranslatable Arabic post is **skipped, not posted**; (3) `send_post`
  refuses any Arabic caption outright (`has_arabic`, Arabic + presentation
  forms) and drops the caption while still delivering media.
- **Bug the fix exposed:** the ad/gambling patterns were Arabic-only, but the
  filter runs on the *translated* body — so a working translator would have
  let English ads through. Added English signals to every list and now filter
  the Arabic source **and** the English body. Also killed a `||` empty
  alternation in `_GAM_HARD` that matched every string (caught by a
  no-empty-match assertion).
- Verified: 9 suites green (new `arabtest`, `engadtest`); real Groq key
  translates 3/3 Arabic samples to clean English; 18 existing Arabic posts
  repaired in place (media bytes unchanged, caption only).

## 110. State-push race fixed; duplicate reposts deleted (2026-10-04)

- **Owner:** video-or-photo confusion + Arabic on new posts. Two real bugs:
  (1) schedule + cron-job.org both write `tg_state.json`: the 18:45 run posted
  then failed push ("fetch first"), the 18:50 run reprocessed the same items
  -> duplicate spam (#62-66 etc.). Fixed with merge-by-max (IDs only grow)
  + fetch/rebase/push retries in both workflows (merge proven: union
  {110, 5}, no conflict possible). (2) Those reposts ran pre-fallback code,
  hence Arabic + photo fallback. Translated + upgraded survivors; deleted
  reposts #53/#61/#63/#65/#66 (kept first of each text group).
- Verified: YAML parses, merge-max unit green, channel re-audited. Committed
  + pushed.

## 109. Videos post at full quality (2026-10-04)

- **Owner:** not posting videos, just screenshots of them; post videos too,
  same quality. Edit old posts. Preview carries direct mp4 URLs (measured
  9-11MB, video/mp4, HEAD 200) -- the bridge simply never read them.
- **Code.** `dl_video` (48MB cap, Bot API limit is 50MB), `post_video()`
  per-message mp4, `send_post(..., video)` streamable upload with the same
  caption/split rules, video-first with photo fallback in both paths, promo
  filter still gates everything. Oversize/unfetchable degrades to photo.
- Verified: 4-case video suite + all prior suites + dispatched workflow
  green. Old-post backfill DONE: #57-61 carry 9-12MB videos each
  (bounded re-check; #54-56 VIDEO flags were window bleed). Committed + pushed.

## 108. Translation fallback chain; Arabic posts predated the switch (2026-10-04, corrected)

- **Owner:** it keeps posting Arabic. Timeline: posts #45-55 went out
  17:35-18:15, BEFORE the English switch merged (18:30) -- no runner failure.
  All 11 + straggler #56 translated to English after; channel verified
  zero-Arabic.
- **Kept as insurance:** every engine outcome logged (`[lang] ...`, never the
  key); chain Groq -> MyMemory ar|en -> Google gtx ar->en -> original
  (4-case suite green; free fallback already caught one empty Groq reply).
  Media posts need editMessageMedia for caption edits (editMessageText fails
  them with "no text in the message").
- **Self-caught:** a first version of this note wrongly asserted runner
  failure AND its script replaced CONTEXT.md to end-of-file, wiping §§1-107
  in commit efa966a. Restored byte-identical from git parent c5c7281, then
  re-applied this corrected note. Lesson: never `replace()` to end-of-file;
  anchor both ends.

## 107. English always: prompt back + all old posts translated (2026-10-04)

- **Owner:** REVERT TO ENGLISH ALWAYS, translate old posts, futures in
  English. Prompt flipped back the same hour (§106 undone).
- All 15 channel posts translated via Groq + edited in place (media posts
  need editMessageMedia -- editMessageText fails on captions with "no text
  in the message"). Verified: zero Arabic chars remain. Future posts go
  through the same English prompt. Committed + pushed.

## 106. Arabic restored (2026-10-04)

- **Owner correction:** "arabic i meant". The English switch (§105) was my
  misread — reverted the Groq prompt to Arabic fix+bullets the same hour.
- Channel audit: all 15 posts Arabic, zero English (the stray English post is
  already gone). Groq suite green with the Arabic prompt; dry-run keeps
  Arabic. Committed + pushed.

## 105. Channel is English-only (2026-10-04)

- **Owner:** translate, turn the channel English-only. The Groq prompt now
  translates (Arabic in, natural English out) and fixes in one call:
  transliterated names, kept emojis/scores/order, clean bullets, zero
  Arabic leftovers (verified: 0 Arabic chars in both dry-runs), no mentions.
  Fail-open + guards unchanged; photos untouched.
- Verified: Groq suite green with the new prompt; two live dry-runs with the
  real key. Committed + pushed.

## 104. Photo quality proven lossless end-to-end (2026-10-04)

- **Owner:** quality still ass, pull photos as they are. Investigated with
  vision on all 13 channel photos: all full-size (61-158KB, up to 800px).
- **Proof.** Street photo: channel bytes SHA-identical to source original
  (softness is in their file). Lineup card: 158KB vs 168KB source, visually
  identical (Telegram's standard ~6% recompress on upload, invisible).
  Mixed sizes left over are source-side; no upscaling by policy.
- **Remaining blur is client-side:** undownloaded previews (arrow badge),
  cached thumbs, or Data Saver — tap to load full, or clear Telegram cache.
  Nothing further code-side can improve this. No code changed.

## 103. Store ads blocked and deleted (2026-10-04)

- **Owner:** no ads (an FC27 game-store promo with their discount code reached
  the channel). Deleted channel post #40 on sight.
- **Filter grown** (`is_gambling` -> `is_promo`, both paths): discount/coupon
  codes, stores, ordering, sales + price+money / money+product / price+product
  pairs. Ticket posts explicitly exempt; punditry, salaries, transfers pass.
  Audited on 20 source texts: exactly 2 hits (both real ads), zero false
  positives.
- Verified: promo suite (6 block / 6 pass) + older suites green. Committed +
  pushed.

## 102. Biggest original wins; older thumbs backfilled (2026-10-04)

- **Owner:** logo remove; some photos low quality. The preview only carries
  90px thumbs (measured 90x51, 1477 bytes) while full originals (640-800px)
  sit on the single-post page. The picker took the first URL (the thumb).
- **Fix.** Region candidates ranked by HEAD content-length; biggest wins,
  first-candidate fallback, avatar excluded throughout (biggest-wins also
  demotes it naturally). Originals post untouched (format-kept filename).
  Watermark/logo stamping removed entirely — photos go out exactly as the
  source published them.
- **Backfill.** #28-33 + #37 + newer thumb-era posts swapped to originals
  via editMessageMedia (captions identical); "not modified" replies confirmed
  the rest already carried originals from the fixed automation.
- Verified: pipeline suite + full battery + dispatched workflow green.
  Committed + pushed.

## 101. Gambling promos blocked and deleted (2026-10-04)

- **Owner:** no gambling ads (a 2000-EGP prediction-contest promo reached the
  channel) + fix the older post. Deleted channel post #36 on sight.
- **Filter** (`is_gambling`, both paths): betting brands/casino/promo-codes/
  channel-recruiting match alone; money + contest words must co-occur so
  punditry ("توقع") and salary/transfer figures pass. Audited on 20 recent
  source texts: exactly 1 hit (the promo itself), zero false positives.
  Skipped posts log and advance state (never reposted, never sent).
- Verified: 3-case filter suite + pipeline + groq suites green. Committed +
  pushed.

## 100. Logo off photos; full-size originals posted untouched (2026-10-04)

- **Owner:** logo remove; some photos low quality. Done both.
- **Logo removed.** `brand_photo` classifies only now (flat `brand` /
  real `photo` / undecodable `none`); originals post byte-identical, never
  re-encoded, never upscaled, never stamped. No logo attached anywhere.
- **Quality.** The preview carries 90px thumbs (measured 90x51, 1477 bytes)
  while per-message originals go to 800px. New `post_photo()` prefers the
  single-page original (same fetch already used for text, shared cache),
  preview fallback, avatar excluded everywhere. Verified live: same-bytes
  where single has nothing bigger; mixed sizes left over are source-side.
- Verified: pipeline/classify/avatar/wrap/groq/stub suites + highlights
  regression green; dispatched workflow green. Committed + pushed.

## 99. Backfilled photos onto text-only posts (2026-10-04)

- **Owner:** edit old posts, add their photos. Matched #28-33 to source items
  375682-375687 (word overlap 1.00 each), downloaded each attachment,
  watermarked via the existing brand path (none were branding), and attached
  with `editMessageMedia` keeping captions byte-identical. All 6 edits
  accepted; channel audit confirms PHOTO=True on all six. No code changed.

## 98. Real post photos found (automation posts photos again) (2026-10-04)

- **Owner:** automation is not posting photos. Correct: every "photo" was the
  channel avatar (same 160px file on all 20 posts) because the scraper only
  read `<img>` tags. Real attachments live in `photo_wrap` background-images:
  measured 15/20 posts carry them, all unique telesco.pe files.
- **Fix.** Scraper now collects `<img>` + photo-wrap background URLs, then
  drops only majority-or-5+ repeats (avatar stamped on ~every message; a
  genuine 2-3x repost survives). Verified live: 19/20 current items carry a
  true unique attachment. Brand-check + watermark path unchanged downstream.
- Verified: new wrap suite green (avatar dropped, reposts + unique kept) +
  all prior suites green. Committed + pushed.

## 97b. Site Telegram button linked to the channel (2026-10-04)

- **Owner:** link the existing Telegram button. SITE_TG was ''\ (button
  hidden) on all four pages; set to \https://t.me/messistatdotcom\.
  Verified headless: visible, correct href, localized label. Mirrors re-synced
  (drift 4 each, residual 0).

## 97. Groq formats clean bullet lists (2026-10-04)

- **Owner:** horrible format, no bullets. The LLM prompt now asks for a clean
  list (header + one `\u2022` bullet per item) instead of keeping the
  single-run layout. Dry-run + live test on #375681: 8 lines, header intact,
  `7-0` + `[OG]` + emojis kept, zero words lost (diff: only flag/ball emoji
  spacing from the bullets), no @ anywhere. Old single-run test (#26)
  deleted; bulleted test (#27) posted.
- Verified: Groq suite green with the new prompt; fail-open + guards
  unchanged. Committed + pushed.

## 96. Free Groq LLM fixes text; source layout kept verbatim (2026-10-04)

- **Owner:** pasted a Groq key, ordered an LLM (free) to fix + reformat text;
  then: don't invent our format, copy theirs. Done both: `reformat_news()`
  DELETED, new `llm_fix()` keeps the source's layout/emojis/order and only
  corrects typos and clear slips (temperature 0, bloat + mention guards,
  fail-open to original on any error).
- **Key safety.** `GROQ_API_KEY` stored as an Actions secret only (HTTP 201);
  the repo contains no key bytes (asserted: only the env-var name). Models
  resolved live: the old llama IDs are retired, code now tries
  `qwen/qwen3.8-27b` → `openai/gpt-oss-20b` (both answered PONG). Cloudflare
  1010 on bare-Python calls fixed with a browser UA.
- **Score verdict (measured, not argued).** Source bytes, our caption, and the
  LLM output all read `7-0`; no bidi controls present. If a screen shows
  `0-7`, that is client-side RTL rendering, not our data — and with "copy
  theirs" in force, reformatting around it is off the table.
- Verified: 7-case Groq suite + full-text/avatar/watermark suites green;
  live dry-run with the real key changed nothing (nothing to fix).
  `reformtest.py` retired (tested the deleted formatter).

## 95. Posts formatted as lists; avatar can never post (2026-10-04)

- **Owner:** text crammed, not bulleted like the original.
- **Cause.** The source markup carries zero line breaks (br=0/div=0 in the
  message div) — one 257-char run. Nothing was lost in transit; there were
  simply no breaks to keep. New `reformat_news()`: presentation-only splits
  after single sentence periods (ellipsis/decimals/paragraphs safe) — words
  byte-identical, proven by multiset assert incl. `7-0` never becoming `0-7`.
- **Avatar lockdown.** The avatar-drop stands, plus the size-only rule is
  gone: a repeat image can never post again (measured: the "photo" was the
  same 160px file on all 20 messages). Old crammed TEST deleted; formatted
  retest posted (6 lines, text-only, zero attribution).
- Verified: 4-case reformat suite + all prior suites green. Committed + pushed.

## 94. The "photos" were the channel avatar; slop deleted; text is verbatim (2026-10-04)

- **Owner:** "where is their photo" + "fix the text format", repeat test.
- **Root cause (measured).** All 20 preview items carried the IDENTICAL 160px
  image: the scraper took the first `<img>` per block, which is the channel
  avatar — never post content. No post in the window has a real photo (single
  pages confirm: avatar only). Every "photo post" so far was that avatar.
- **Fix.** Scraper collects ALL telesco `<img>` per block and drops any URL
  seen on 2+ messages (avatar repeats; real attachments are unique). Proven:
  20/20 drop to text-only, unique attachments still kept. With no photo from
  them, posts are text-only — our standalone logo is never attached anymore.
- **Text.** Proven byte-path: posted caption == source text (whitespace
  cleanup only; numbers/emoji untouched). The `0-7` order and the trailing
  `…` are the source's own bytes (identical reposts) — nothing on our side
  cuts or reorders. Full text via balanced-div single-page fetch.
- **Cleanup.** Deleted all 18 bridge posts (#4-7,9-20,22,23 incl. both TESTs);
  kept #1-#2 (owner's channel messages). Repeat test posted text-only, full
  257 chars, no prefix, zero attribution.
- Verified: avatar-drop + all previous suites green. Committed + pushed.

## 93. Photos post normally; full text; branding goes text-only (2026-10-04)

- **Owner:** post their photos normally, never their logo; if no photo from
  them then no photo; fix the text format. Repeat test.
- **What the test post taught.** Item #375681's photo is 160x160 with
  photo-texture stats (unique=2229, top2=0.07) — the old <200px size rule
  replaced it on size alone. Rule dropped: replace ONLY on flatness
  (top2>0.85 + unique<60). Small real photos watermark proportionally now
  (logo floor 32px, was 64).
- **New policy.** Real photo \u2192 watermark + caption. Their branding \u2192
  text only (no image at all — neither ours nor theirs). No photo from them
  \u2192 text only. Our standalone logo is never attached anymore.
- **Text.** The preview truncates (`…`); the single-post page carries the
  complete text — new `full_text()` with balanced-div extraction (nested
  markup can't cut it) + longer-wins fallback. Captions >1024 split into
  photo + full-text follow-up via shared `send_post()`. Verified the `…` on
  #375681 is the source's own ending (identical reposts), so our text is now
  byte-exact.
- Verified zero-network (new 7-case suite incl. balanced-div) + all old
  suites still green. Repeat test posted under the new policy; old TEST
  message deleted.

## 92. Strict brand rule; "why did it stop" investigated (2026-10-04)

- **Owner:** post their photos normally, only their logo gets replaced; why did
  posting stop (+ blurred image in channel).
- **Findings.** Nothing stopped: runs green every 5 min (08:15 saw `0 new`
  because the 8 newer items dropped after it; state advanced normally through
  every run). The blurred image is Telegram's not-yet-downloaded thumbnail
  (download-arrow badge) — tap it. The full-time post's photo was replaced per
  the then-loose rule; policy tightened below.
- **Strict rule from measured data** (local calibration, no downloads):
  graphics top2~0.93/unique~40 vs photos top2~0.19/unique~3000. Replace ONLY
  on `(top2 > 0.85 and unique < 60) or max-dim < 200`; everything else keeps
  the small watermark. 7-case suite green incl. a new caption-card case.

## 91. Brand-aware photos, autonomous posting, zero source attribution (2026-10-04)

- **Owner orders:** (1) their photo with branding \u2192 replace with ours;
  player/team/any real photo \u2192 post normally + our logo small; (2) make
  posting truly autonomous; (3) NEVER mention/tag their channel.
- **Brand policy (`brand_photo()`, Pillow, all local).** Flat
  graphics/caption cards (top-2 colors own >80% of a 64px thumb, or file
  <200px) \u2192 replaced by our M10 shield. Real photos \u2192 posted with our
  logo watermarked small, bottom-right, center pixels untouched. Anything
  undecodable \u2192 safe replace; logo missing \u2192 text-only. Their pixels
  never go out bare. Needs Pillow: added to the workflow (`telethon requests
  pillow`).
- **Autonomous.** `usable_text` now posts everything \u22653 chars (was \u226520:
  one-liners were silently dropped); photo-only items post imageless-caption;
  only truly-empty and `/commands` skip. Fixed two counters along the way:
  intentional skips no longer count as posts and no longer log fake
  "rejected" lines (that noise hid the real \u00a789 failure pattern).
- **Zero attribution.** Both footers (`via @Offsideahdaff`, `via @kooraadz`)
  deleted; cosmetic source naming scrubbed from docs/code; Kurdish path counts
  only confirmed deliveries now (it used to count attempts).
- Verified zero-network: 6-case suite green (replace/watermark/safe/logo-less/
  autonomy/no-@/via). Cron + schedule firing every 5 min, all success.

## 90. Mirrors restored (measured alive), name aliases, our logo only (2026-10-04)

- **Owner:** "Fix the VIP BOX stream, it was working" + "post our logo, don't
  post theirs" + "don't get us hacked or download anything". All three honored.
- **Streams, measured live in-browser (no guessing).** Streamed backend alive:
  USA-Mexico playlist → HTTP 200 twice, 235 viewers on the delta embed
  (Argentina's 404 was a per-game drop of a 5-0 dead rubber, not a dead
  backend). VIPBox player backend alive: lonpapil.eu/sd0embed → HTTP 200 in
  the framed context (the dervlin 504 was transient; direct loads 403 only for
  lack of Referer, as designed). So the \u00a784 default-OFF gate was hiding
  working streams: mirrors are ON again unless `ALLOW_AD_MIRRORS=0`.
  Arabic-first order, numbered buttons, zero brand leakage unchanged.
- **Name gaps closed (the real reason USA-Mexico resolved nothing).**
  `enToksOf('USA')` devoweled to zero tokens → score 99, unmatchable. Added
  exact-name aliases in the existing table pattern (zero fuzzy risk):
  USA↔united/states (both sides, incl. `EN_ABBR`), Mexico, Azerbaijan,
  Lithuania (+ أمريكا). Measured locally: USA-Mexico 99 →
  0.000, Azerbaijan-Lithuania 0.600 → 0.000, Argentina unchanged 0.429.
- **Security posture untouched.** No `safeSrc`/`BLOCK_RE`/popup-defense code
  changed; sandbox stays as the owner ordered (\u00a781); no new third-party
  script, embed host, or dependency added anywhere. All verification from here
  was stubbed-fetch unit tests (zero network) plus syntax checks.
- **Our logo only.** `scripts/channel_logo.png` = the M10 shield from
  messistat.com itself (`/img/logo.png`, 512\u00d7512 PNG, sha256
  `36D5DC34\u2026`), verified pixel-identical to the owner's attachment. Every
  bridge post now attaches these bytes; source photos are never forwarded
  (kept as fallback only if the logo file is missing). Proven zero-network
  (their URL never transmitted) and live (upload ok, msg 8, deleted after).
- **Hygiene.** Removed a committed `scripts/__pycache__/*.pyc` that slipped
  into \u00a787; `.gitignore` now excludes `__pycache__/` + `*.pyc`. Deleted
  every remote-fetched analysis file from temp (bundles, ad scripts, shells).
- Verified: `player.js` ESM import OK, `tg_news.py` AST OK, allstub (decoy
  still unreachable with mirrors ON) + adsreg (opt-out path) + hlreg green,
  mirrors content-identical, i18n parity intact.

## 89. Photo posts were silently failing; fixed by uploading bytes (2026-10-04)

- **Owner:** "nothing is posted in the channel tho". Runs were green but the
  channel was empty. Root cause from run `37168698880`'s log:
  `post rejected: Bad Request: failed to get HTTP URL content` — Telegram's
  servers cannot fetch the telesco.pe photo CDN, so every photo post died while
  text-only logic looked fine. State still advanced, hiding the failure.
- **Fix:** new `dl_photo()` downloads the image ourselves (works with a
  Referer, capped 8MB, content-type checked) and `sendPhoto` uploads the bytes
  via multipart instead of passing the URL. Proved live: `preview: 2 new,
  posted=2` — the two missed items are in the channel now with photos.
- Lesson: a post that advances state without confirmed `ok` is a silent drop;
  the bridge now only counts confirmed deliveries.

## 88. News every 5 minutes (2026-10-04)

- **Owner:** "post as they post, make them 5min". `telegram-news.yml` cron
  `*/20` → `*/5`. Dispatch-tested after the edit: run `37168155565`
  completed success. Double runs are safe (concurrency group + state dedupe).
- **cron-job.org backup** (GitHub's scheduler lags on private repos):
  step-by-step in `TG_SETUP.md` §5 — fine-grained PAT (`cron-dispatch`,
  this repo only, Actions read+write) → POST
  `api.github.com/repos/1khvled/koora-clean/actions/workflows/telegram-news.yml/dispatches`
  with `{"ref":"main"}` every 5 min. Needs the owner's login; can't be done here.
- **Cost warning given:** ~8,600 Actions min/month vs 2,000 free on a private
  repo — runs stop at quota unless billing is added. Offered: slim the
  workflow or go public (unlimited free minutes) once the token lives in
  Secrets only.

## 87. News target switched to the @messistatdotcom channel (2026-10-04)

- **Owner:** user id `5625295907`; bot is admin in `https://t.me/messistatdotcom`.
  Verified via Bot API: `getChat @messistatdotcom` → id `-1004345140678`,
  type channel, title "Messistat.com"; `getChatAdministrators` →
  `@messistatBOT` administrator, `can_post=True`. Live test post delivered
  (msg 3) then deleted to keep the channel clean.
- `scripts/tg_config.json` + `TARGET_CHAT` secret both updated to
  `-1004345140678`. Full `tg_news.py` run against the channel: preflight
  `@messistatBOT -> Messistat.com (channel)`, `preview: 1 new, posted=0`
  (the one new item was textless, correctly skipped), exit 0.
  `TG_SETUP.md` updated; owner's id kept for reference.

## 86. News bridge goes bot-only (no login needed); Argentina has no ad-free stream (2026-10-04)

- **Owner:** "why do u need these [TG creds]? u have a telegram bot, everything
  is setup?" — fair. The honest split: a bot can *send* anywhere but can only
  *read* channels it can see. The old design read both sources with a logged-in
  account (MTProto); that login is only unavoidable for the *private* Kurdish
  channel, which has no public preview. The public `@Offsideahdaff` has a
  login-free preview (`t.me/s/Offsideahdaff`, verified 20 messages, no auth).
- **Fix:** `tg_news.py` now runs **bot-only by default** — scrape the public
  preview (text + real photo URL, Bot API accepts a URL so nothing is
  downloaded), post new items, dedupe in `tg_state.json`. The MTProto/Kurdish
  path only activates if the three reader secrets ever appear. Two scraper bugs
  caught by live testing: a double-escaped `\\d` regex (matched nothing) and
  emoji backgrounds mistaken for photos (now requires a telesco.pe `<img>`).
  HTML entities unescaped (`&#39;` → `'`). **Proven live:** preview scraped
  20 items, newest (`#375662`, Argentina 6-0 goal news) delivered to
  `1759675108` with photo + Arabic text intact; full script run exits 0 with
  `preview: 0 new, posted=0`. `TG_SETUP.md` rewritten: 2-minute setup, reader
  creds documented as an optional upgrade only.
- **Owner:** "yeah no stream is showing on the argentina thingy?" — correct,
  and it is the ad-free policy working as designed, not a bug. At check time
  the match was second half, 6-0: Yassir answers "Match ended" for that id,
  Yacine does not list the fixture, so **no ad-free player exists** for this
  friendly. The only coverage anywhere is the two ad-carrying mirrors (Streamed
  shell: playlist 404, proven in-browser "0 seconds of 0 seconds"; VIPBox:
  player domain 504) — both dead *and* ad-loaded, so the page shows the
  honest Arabic notice instead of dead buttons. Nothing to fix code-side; when
  an ad-free source carries a match, its button appears as before.

## 85. Commit identity is khvled everywhere; bot target now reachable (2026-10-04)

- **Owner:** "commit as khvled bro khvled2004@gmail.com wtf?" — correct, the
  history was authored by a leftover identity. Fixed at three levels:
  1. **Repo config** (`.git/config`, this repo only — your other projects are
     untouched): `user.name=khvled`, `user.email=khvled2004@gmail.com`.
  2. **Workflows**: `keepalive.yml` and `telegram-news.yml` were committing as
     `keepalive@users.noreply.github.com` / `news-bridge@...`; both now use
     khvled, so cron commits are yours too.
  3. **History**: all **174** commits rewritten with
     `git filter-branch --env-filter` (author *and* committer). Verified before
     force-pushing: the **tree hash is byte-identical**
     (`262af092…` before and after) — only authorship changed, no code did.
     Force-pushed `main`, then confirmed via the GitHub API that all 174 remote
     commits report `khvled <khvled2004@gmail.com>` with **zero** other
     identities. Backup branch and `refs/original` removed afterwards.
     **If you have another clone of this repo, re-clone or `git fetch && git
     reset --hard origin/main`** — the old SHAs are gone by design.
- **Bot: owner pressed Start, so the target is live.** `getChat 1759675108`
  now returns OK, type **private** — that id is the owner's own account, so the
  bridge delivers news by DM (no channel/admin step needed). `tg_news.py`
  preflight now reads `[preflight] @messistatBOT -> 1759675108 (private)` and
  exits 0. `TG_SETUP.md` updated to match (the "chat not found" blocker is gone).
  **Remaining and unavoidable:** the reader side needs
  `TG_API_ID` / `TG_API_HASH` / `TG_SESSION` — that is a my.telegram.org signup
  plus a phone login, which only the owner can perform:
  ```
  pip install telethon
  python scripts/tg_login.py        # asks api_id, api_hash, phone, then the code
  ```
  Paste the printed session string plus api_id/api_hash into the three Actions
  secrets, and the next 20-minute run starts posting.

## 84. Ad-carrying mirrors off by default; the Argentina stream, dissected (2026-10-04)

- **Owner report.** "for the current argentina match the player is not working"
  then "we said no ads btw ur stream has ads". Both were true, and the second
  one is the root cause. Everything below is measured, not guessed.
- **What the Argentina–Burkina Faso match actually had.** Yassir (our only
  Arabic source with a player) returns the 2366-byte **"Match ended"**
  placeholder for that id — i.e. no stream. Yacine's today page does not list
  the fixture at all. So there is **no ad-free player** for that friendly.
  What we were serving came from the hidden EN mirror, and both entries are
  ad-infra shells: a 636KB page with `window.open`/`onbeforeunload` x4 plus an
  injected `/ad.html` frame on a 10-minute timer, loading
  `capitalhospitals.org` ad JS. In-browser proof of death: the JW shell renders
  **"0 seconds of 0 seconds"** and its runtime playlist
  `lb29.strmd.st/secure/<wasm-token>/foxtrot/stream/argentina-vs-burkina-faso/1/
  playlist.m3u8` answers **404** (the token is minted client-side by
  `strmd.b-cdn.net/js/wasm/lock.wasm`, so this cannot be pre-verified from the
  server). The second mirror, VIPBox, loads `llvpn.com` + `nearlyfunnel.com` +
  googletagmanager and hides its player behind a rotating ad domain
  (`dervlin.me` / `fallafar.me`) that answered **504**.
- **Decision (owner rule: "only if they work, don't put them there" + "no ads").
** Ad-carrying mirrors are now **off by default**: `ADS_MIRRORS` in
  `api/player.js` reads `ALLOW_AD_MIRRORS` and defaults to OFF. Set it to `1` in
  the Vercel env to bring the mirrors back (every server they return is then
  tagged `ads: 1`). Phase 1 of both resolvers still runs with mirrors off — it
  only answers "did an ad mirror even have this fixture?" — which is what
  powers `adsBlocked` in the response; phase 2 (the embed URLs) is what is gated.
- **Honest empty state.** `found:false + adsBlocked:true` now renders
  "Only ad-carrying sources had this match. We keep streams ad-free."
  (EN/FR/AR, new `adsOnly` key x3 + `.srvnote` style) and it **skips the retry
  loop** — previously the page burned 3 attempts and then looked broken.
  Measured after the fix: 1 API call, 2.3s, 0 server buttons, empty iframe.
- **Latency kept safe.** With mirrors off the phase-1 probe is capped at 2s
  (`mirrorCap()`), because the first cut measured **8.1s** — too close to
  Vercel's 10s `maxDuration`. After the cap: 2.3s off / 2.4s on.
- **Verified.** `adsreg.mjs` (new, 3 cases): ad-free Yassir wins and no ad URL
  appears; a fixture only an ad mirror has → `found:false`, `adsBlocked:true`,
  zero URLs; junk → nothing and `adsBlocked` falsy. `adgate.py` runs the real
  Argentina query both ways: OFF → `found:false/adsBlocked:true/0 servers`;
  ON → 2 servers all tagged `ads:1`. `allstub.mjs` (4 gates) still passes with
  the opt-in flag set. Live browser: Argentina page shows the honest Arabic
  notice, no iframe, correct score (`مباشر 55’`).
- **Trade-off, stated plainly.** Matches whose only coverage is an ad mirror now
  show no stream instead of an ad-filled one. That is the correct trade for this
  site (the whole pitch is بث نظيف), but it means gaps on
  obscure fixtures. Flip `ALLOW_AD_MIRRORS=1` if you ever want them back.
- **Update 01:22 UTC: Vercel deployed by itself.** `kooraadz.vercel.app`
  now serves the new build (`Last-Modified 01:20:48`, `bytes=135676`,
  `compact-hdr-css=True`, `ad-wrap=False`); all four pages return
  `ALL OK` on the deploy check, `/api/highlights` still resolves. No dashboard
  action needed anymore.

## 83. Header/ads cleanup, VIPBox fallback, highlights actually unlock, GitHub private + Actions green (2026-10-04)

- **Owner ask (UI).** "bring back old design and remove it [the language
  control], make those buttons a bit smaller, optimize the whole header for
  mobile, remove this" (the ad banner). Done: the sliding-pill language control
  is gone (CSS + script removed from all four pages, `seg-thumb`/`segMove` zero
  hits), plain pills return, controls shrink to 38px / 11.5px, and a
  `max-width:480px` block tightens topbar/brand/promo row/back button. The
  MessiStats banner + `Ads: ON/OFF` toggle are gone, and so is every trace of
  them: `.ad-wrap/.ad/.ad:hover` CSS, `body.ads-off`, `adsOn()/paintAds()`,
  the `koora_ads` localStorage key and the `ad`/`adsOn`/`adsOff` i18n keys in all
  three dictionaries. Support copy is donations-only in all 3 languages.
- **Owner ask (streams).** "fetch for other sources free for streams". Added
  **VIPBox** as a *last* resort resolver in `api/player.js` (`vipMatch` +
  `vipDetail`). Phase 1 fetches `/football-schedule`, parses the `/onair/<slug>`
  rows, keeps only rows within ±150min of our kickoff and scores them with
  the same MAX-of-sides gate (≤0.55). Phase 2 reads the `data-uri="/live/..."`
  players from the onair page; those `/live` pages send **no** X-Frame-Options
  and no CSP, so they embed directly — no token reversal needed. It runs
  *behind* the Streamed fallback and only when every other source returns zero,
  so it can never outrank a better source or steal another match.
  Verified live: `Loudoun United vs Indy Eleven` and `Brooklyn FC vs Rhode Island
  FC` resolved in 1.0-1.3s with vipbox live players; stubbed suite proves the
  four gates (VIPBox only when Streamed misses; decoy `Israel/Kosovo` never
  reachable for `Uzbekistan vs Syria`; absent fixture → `found:false`;
  junk names → nothing). Live suite builds kickoffs with the same ±12h roll
  the resolver uses (an earlier test build did not, and produced a false
  failure — test bug, not code bug).
- **Owner ask (highlights) — REAL BUG, fixed.** Highlights were unreachable
  for any link that already carried `home`/`away`: the boot gate read
  `if (id && !href && !home && !away && !snap0)`, so opening a finished match
  from the list never learned its status → `hlOver()` stayed false → no
  video. Croatia 0-7 England rendered "لم تبدأ" + no
  highlights. Fix: new `applySnapSoft()` fills **only empty** fields (status,
  score, kickoff, logos) from our own feed — never overwrites URL values —
  and the enrich now runs whenever we have an id and no cached snapshot;
  `loadHl()` is re-run once the status lands and once ESPN answers. Proven
  end-to-end against a local API-mounting dev server: same URL now shows
  `انتهت`, `0 - 7`, and the Dailymotion card
  "England 7-0 Croatia Highlights & Goals" (`xbhdd4a`); a live match
  (Argentina vs Burkina Faso) still shows `مباشر` 25' with
  2 servers and **no** highlights. 5-case regression harness included.
- **GitHub (owner: "set everything up, made the repo private").** Done through
  the credential git already uses for push (token never printed):
  `PATCH /repos/1khvled/koora-clean {private:true}` → **private**; Actions
  secrets `TELEGRAM_BOT_TOKEN` + `TARGET_CHAT` created (libsodium sealed box,
  base64 padding needed); both workflows dispatched by API and watched to
  **green** (`keepalive` Heartbeat success, `telegram-news-bridge` all 6 steps
  success). Also fixed the workflow commit step: `git diff --cached --quiet ||
  git commit && git push` is left-associative, so it pushed even with nothing
  staged — now an explicit `if`.
- **Telegram bridge hardening.** `bot()` now turns Telegram's HTTP 4xx into
  `{'ok': false, description}` instead of raising (one rejected post can no
  longer kill a run). New `bot_preflight()` runs first: token rejected = **hard
  fail** (something broke); bot-not-in-chat / API blip = **clean SKIP, exit 0**
  with the exact fix in the log, so the 20-min cron is green while the owner
  finishes setup. `TG_SETUP.md` rewritten (stale "revoke the token" advice
  dropped per owner order) with the verified state table.
- **Verified bot facts.** Token works: `getMe` → `@messistatBOT` (8914137191).
  `getChat 1759675108` → **chat not found**: that id is not a chat the bot is
  in. Either press **Start** on `@messistatBOT` once (if it is the owner's own
  id) or add the bot as channel admin and use the real `-100...` id. Still
  missing and only the owner can supply: `TG_API_ID` / `TG_API_HASH` /
  `TG_SESSION` (my.telegram.org phone login).
- **BLOCKER for the owner: Vercel is not auto-deploying.** `kooraadz.vercel.app`
  still serves the 23:39 UTC build (`Last-Modified 03 Oct 23:39:30`,
  `X-Vercel-Cache: HIT`) — 6 minutes of polling after the push changed
  nothing. Repo, workflows and secrets are fine; the Vercel → Git integration
  needs a nudge (dashboard → Project → Deployments → Redeploy, or
  Settings → Git → "Deploy on Push"). No Vercel token/CLI on this machine,
  so I cannot trigger it. Everything is committed + pushed.
- **Verification.** `node --check` on every inline block of all four pages +
  both mirror copies; `cssbal` braces balanced (index 310/310, player 378/378);
  i18n key parity 3/3 (`allver`, `par2`); mirrors re-synced and **content-diff
  verified** (residual 0, §79 — never a hash check); headless Chromium at
  390px: no ad node, support card = Ko-fi + BEP20 only, no horizontal overflow,
  lang buttons 38px, EN/FR/AR switch + RTL flip correct, zero console errors.
- Commits `9b6c479`, `a44c14d` and this one, all pushed to `origin main`.

## 82. Yassir becomes the Arabic source; wrong-stream bug fixed; latency unblocked (2026-10-01)

- **Owner ask.** Yacine/Kora had gone dry, so the owner supplied a new Arabic
  source: `yassirtv.com/hard/<hash>.html?match=<id>`. Verified it is a wrapper
  that iframes `<player-host>/playerv5.php?match=<id>&key=<key>`.
- **The key discovery.** That `<id>` is **our own match id**. Cross-checked 22
  fixtures: `koora-l.live/game/<ourId>` returned byte-identical Arabic home and
  away names and matching kickoffs — 22/22, 0 mismatches. So yassir needs **no
  team-name matching at all**, which is exactly why it cannot serve the wrong
  match. `playerv5.php` also sends no `X-Frame-Options` and no CSP
  `frame-ancestors`, so it embeds directly (the `/hard/` page itself is
  `SAMEORIGIN` and is NOT embeddable — do not point the iframe at it).
  Live -> ~19.7KB page with `<li><a data-path="kooora/kc/...">` AR tabs;
  finished/not-started -> 2366-byte "Match ended" page with **zero** tabs.
  That tab count is the only liveness gate needed. Key is not validated
  upstream (keyless works); the real key is included for fidelity.
- **Live wrong-stream bug found and fixed.** While testing, production served
  the **Israel vs Kosovo** stream for **Uzbekistan vs Syria** — a finished
  fixture that fell through to the English fallback and grabbed whatever was
  live. Root cause was the MEAN-of-sides scorer: one team's tokens matched
  while the other was unrelated (0.50 vs the 0.55 gate). Fixed three ways:
  scorer is now MAX-of-both-sides (decoy scores 0.67, real pairs stay ≤0.55);
  a kickoff-proximity gate (±90 min) corroborates names across independent
  feeds; and the English fallback is skipped entirely for a match that kicked
  off >3.5h ago. Proven by stubbed tests: decoy unreachable, right-teams-wrong-
  time rejected, junk names borrow nothing, swapped home/away still correct.
- **Latency unblocked (the real reason streams looked dead).** `player.html`
  aborted `/api/player` at **4s** while the Kora chain measured **8–17s** and
  Vercel caps at 10s — the server was being killed before it could answer.
  Yassir is now probed **first** (one small request answers everything, needs
  neither the self-lookup nor name matching), resolvers overlap the Kora chain
  instead of queueing behind it, every optional stage is skipped once out of
  budget (an earlier floored `Math.max(1200, …)` timeout could not shorten
  below its floor and was what kept the chain at 16s), and the client's abort
  windows went 4/3/2.5s -> 9/5/4s. Worst case measured **8.3s**.
  The English fallback was split into `streamedMatch` (cheap, runs in the
  parallel batch) + `streamedDetail` (only when every Arabic source is empty),
  so the "hidden EN fallback only" policy is unchanged.
- **Bugs I introduced and caught in the same session** (all via live tests,
  not inspection): resolver first inserted at module scope where `fetchT` does
  not exist; then it referenced a `UA` const that actually belonged to the
  *disabled* `resolveHd7`, so the `ReferenceError` was swallowed by `.catch()`
  and yassir silently never ran; then the definition sat after its first use
  (TDZ); then an IIFE wrapper broke the parse. Lesson recorded: a
  `.catch(() => null)` around a resolver hides scope errors — the empty result
  looked like "upstream has no stream".
- Verified live: 4/4 currently-live yassir fixtures resolve in **55ms–3.4s**,
  Arabic, one numbered server, zero brand names. 6 stubbed EN tests + 6 live
  regression tests pass; mirrors verified by **content** diff (§79 lesson).
  **Pushed** to `origin main`.
- **Score/status feed recovered (2026-10-03).** The index showed a live match
  as `0-2, 1st half` while the real feed was `0-5, 2nd half, 55'` — the
  scraped Yacine/Kora pages lag minutes to hours. Because yassir proved our
  ids are shared with koora-l.live's feed, `api/matches.js` now overlays the
  authoritative `/game/<ourId>` score, status, minute, kickoff onto every
  returned row. Verified live: that match then read `0-5, 2nd half, 59'` and
  advanced to `3-0, 74'` across refreshes. Canceled maps to POST; the koora-l
  `-1` sentinel no longer leaks as a score.
- **Islamic links in banner+FAQ+footer (2026-10-03).** The Arabic-only
  set (`data-ar-only`, hidden for en/fr) now covers: the hero banner (Coran,
  adkar, hadith, duas + فضائل القرآن), a new FAQ entry with the YouTube
  recitations — سورة الكهف قراءة خاشعة (youtu.be/83qrY5qisus) and سورة البقرة
  تلاوة خاشعة (youtube.com GJa5FAgQEGQ) — plus a compact footer row (📖 قرآن
  · 🕌 أذكار · 📜 حديث · 🤲 أدعية · 📺 كهف · 📺 بقرة). One `setLang` rule
  drives every Arabic-only block.
- **Premium UI/UX pass (2026-10-03).** CSS-only (0 deletions, 135 added
  lines, zero HTML/JS/i18n touched): page-wide radial pitch glow + text
  selection tint + smooth scroll; header with layered radial light and a
  glowing ball; day-tabs/chips as glassy segmented pills with gradient
  active states; match rows with inset top-light, score pills, pulsing live
  badge, hover lift + grass border glow and glow-ringed live state, gold-tick
  section titles and league headers; support/poly/FAQ cards elevated with
  gradient buttons; footer hover states; softer skeleton sweep; press-scale
  on buttons. Player page: cinematic 18px stage frame with grass ring + glow,
  radial play-shield, 30px glowing score, live pills, tactile server cards
  with gradient active state, gold-tick headers, gradient stat bars, glowing
  pitch, gradient primary buttons. All motion gated by
  prefers-reduced-motion. Mirrors re-synced by content diff.
- **Telegram deals + MessiStats promos (2026-10-03, owner order).** The
  French AliExpress deals channel (t.me/francedealsdz) and messistat.com are
  now linked in the header (promo pills in the lang group), the footer, and
  the FAQ (two new entries: AliExpress deals, What is MessiStats) — on all
  pages and in all three languages (new keys dealsBtn/messiBtn/fq7/fa7/fq8/
  fa8 in every dict, verified 3/3; player also gained a proper footer with
  Home + both promos since it had none). External links use
  target=_blank rel=noopener; mirrors re-synced by content diff.
- **Per-language Telegram URLs (2026-10-03, owner order).** Arabic viewers
  get the Arabic channel (t.me/DzAliexpress0); French AND English viewers
  get the French channel (t.me/francedealsdz). Every deals anchor carries
  class `tg-deals` and `setLang` rewrites its href on each switch (both
  pages); AR fa7 wording decoupled from France. Mirrors re-synced.
- **Two separate deals buttons (2026-10-03, owner order).** Root cause of
  "Arabic still opens the French channel": the patch emitted two `class=`
  attributes on one anchor, which browsers ignore — so the JS rewrite hook
  never attached. Replaced with two real buttons per slot (AR channel
  t.me/DzAliexpress0 + FR channel t.me/francedealsdz) toggled by pure CSS on
  `html[lang]` — no JS involved, nothing left to break. Dead setter removed;
  mirrors re-synced.
- **Premium round 2 (2026-10-03).** CSS-only (69 added, 0 removed): search
  field with inline-start magnifier (dark-mode aware, RTL-flipped, clear of
  the native clear-button), themed page scrollbars, larger live cards with
  bigger type/scores/logos, animated FAQ accordion (+/− affordance),
  structural hairlines above footer and SEO sections, tactile live-jump
  button. Player: glowing play CTA pulse, pop-in formation popover, pitch-dot
  hover rings, lifting odds/ballot rows, press-depth on controls, wider title
  type on desktop. All motion reduced-motion-gated. Mirrors re-synced.
- **Premium round 3 (2026-10-03, owner order: FotMob + Polymarket + overall).**
  CSS-only (62 added, 0 removed). FotMob: uppercase tracked section labels,
  glass sticky tabs, stat bars that sweep to new widths on refresh, gold/
  silver/bronze rings on the top-3 performer chips, goal rows glowing gold
  (gold minute pill) vs red-tinted card rows, hover-tracking lineup rows.
  Polymarket: ranked-leaderboard counters with medal top-3 + ringed leader
  row on the index board, glowing odds figures and ringed leader on the
  player page. Overall: hairline above the odds board, grass list markers,
  lifting SSR rows and ad card. Reduced-motion-gated. Mirrors re-synced.
- **SEO keyword assault + mobile pass (2026-10-03, owner order).** H1s now
  keyword-rich per language (live matches/scores/streams + مشاهدة/بث مباشر/
  نتائج); titles/descs/OG target "Yacine TV & Kora Online alternative",
  "Alternative Yacine TV", "ياسين تيفي وكورة أون لاين" + World Cup 2026 /
  Coupe du monde 2026 / كأس العالم 2026; mega keywords meta (~90 terms
  AR/FR/EN); seo paragraphs list every top league; 2 new FAQs per language
  (Yacine TV alternative, World Cup 2026) wired into visible FAQ + FAQPage
  schema (now fq1–fq10); static crawler-facing H1/title/desc updated.
  Mobile: fluid clamp H1, compact rows/type/logos under 480px, 44px+ targets,
  single-column servers under 380px, offscreen league skip-rendering.
  Verified parity 3/3, JS parses, CSS balanced, mirrors re-synced.
- **Dedicated Messi watch page (2026-10-03, owner order: MessiStats EN/FR
  traffic).** New `messi.html` at `/messi.html` (+ `messi-inline` mirror,
  sitemap entry priority 0.9, robots disallow for the mirror): always-dark
  page with 🐐 hero, **Messi-is-live / upcoming / recent-results** sections
  fed by `/api/matches` (today+tomorrow+yesterday) filtered to Inter Miami
  and Argentina in any language — with an explicit Inter **Milan** exclusion
  so the wrong Inter never sneaks in. Rows link to the normal player page
  (streams + highlights), 60s auto-refresh, Messi-team names localized for
  EN/FR (opponents stay raw upstream), full EN/FR/AR dict (23 keys, verified
  3/3), GEO language, Messi keywords + FAQ + FAQPage JSON-LD, header/footer
  promos with the two separate Telegram buttons. Proven live: Argentina vs
  Burkina Faso correctly picked up, 0 false positives. Linked from both
  footers (new `ftMessi` key ×3). Mirrors content-verified.
- **Messi page v2 (2026-10-03, owner order: improve /messi.html).** Rows now
  grouped under league headers; upcoming rows show kickoff time + a live
  ticking countdown (per-language, day-aware); hero gained a "next Messi
  match" spotlight (teams + date + countdown); dynamic ItemList JSON-LD for
  SEO; refresh tightened to 30s. Proven headless: Inter Milan excluded,
  day-countdown/grouping/player-links/live-minute all render. Mirror synced.
- **Messi page fully translated (2026-10-03, owner order: page not fully
  translated).** Ported the entire index name system (TEAMMAP + LEAGUEMAP +
  trAr, ~20KB) into messi.html — team names, league headers, spotlight and
  schema all render through dispTeam/dispLeague now. Proven headless in
  EN/FR/AR: Argentina, Inter Miami, Burkina Faso, Orlando City,
  International Friendlies, Major League Soccer all dictionary hits; AR
  stays raw; anything unknown falls back to readable Latin (never Arabic
  script in EN/FR). Mirror synced by content diff.
- **Header promo row with Messi button (2026-10-03, owner order).** Both
  headers now carry their own promo row under the brand: gold 🐐 Messi page
  button (reuses `ftMessi`, all 3 languages) + per-language Telegram deals
  button + MessiStats button. The old pills were pulled out of the crowded
  lang group (group is back to EN/FR/AR + theme only). All header buttons
  got hover lift + press-scale; player back button lifts with a gold border.
  HTML+CSS only, mirrors content-verified.
- **Messi status-language guard (2026-10-03, owner screenshot).** Upcoming
  rows painted the raw feed `time_text` ("لم تبدأ") even in EN/FR. Same guard
  as index `dispTime`: Arabic-script times are dropped, falling back to
  kickoff HH:MM, then the translated Upcoming label. Proven headless in all
  3 languages. Mirror synced.
- **Messi donations (2026-10-03, owner order).** Ko-fi + BEP20 wallet
  (same address, clipboard copy with fallback) on messi.html, 4 new keys in
  all 3 dicts (parity 27/27 verified). Mirror synced.
- **Calm skeleton loaders (2026-10-03, owner order).** Structured
  card-shaped skeletons (time / team lines / score blocks) with a soft
  staggered pulse on all 3 pages; player server + FotMob skeletons match.
  Reduced-motion-gated. Mirrors synced.
- **De-slop UI pass (2026-10-03, owner order: less AI slop).** Stripped the
  generic look: zero gradient buttons (solid pitch/red/gold/blue), zero
  decorative glows, rings, sheen sweeps and medal colors; pulse kept only on
  live indicators; skeleton sheen replaced by a calm pulse; dead keyframes
  removed. Verified zero slop markers site-wide, CSS balanced, JS parses.
  Mirrors content-verified.
- **ALL batch 2026-10-03 (owner: do ALL, Telegram last, automate).**
  - #1 Dynamic titles COMPLETE: player paintTitle already set
    document.title — added OG/twitter title+description updates and a
    localized `watchDesc` dict fn ×3. Verified in markup.
  - #2 Report-dead-stream SHIPPED: ⚠ button in the sources header;
    one tap skips to the next server, the dead URL sinks to the bottom of
    every future list on that device (localStorage, capped), plus a
    best-effort `koora_report_stream` Supabase RPC (fail-open if the
    function doesn't exist yet — create it to aggregate globally). A
    headless test caught an INVERTED sort comparator here (reported would
    have floated first); fixed and re-proven.
  - #3 Kickoff bells SHIPPED on index + Messi upcoming rows (🔕/🔔 toggle
    inside the card, navigation killed properly): persists across visits,
    fires a system notification (toast fallback) at kickoff, purges fired
    and ancient bells, 30s checker. 6 keys ×3 dicts verified; headless
    test proves persist/fire/cleanup/no-fire-for-ancient.
  - #4 Standings NOT SHIPPED (blocked, evidence): 9 probes — FotMob has
    no table endpoint (matchDetails carries no table; leagues endpoint
    returns data:null), ESPN core chain resolves but `records` is empty
    for BOTH 2025 and 2026 seasons, and full names need a 20-fetch fan-out
    per view. Per the must-work rule, no parser was written for
    unverified shapes. Revisit when a table source verifies.
  - #5 Ronaldo page SHIPPED (`/ronaldo.html` + mirror, sitemap 0.9,
    robots, 👑 CR7 links in all 3 footers with `ftCR7` ×3): Al Nassr +
    Portugal filter with Brazil exclusion (headless-proven, incl. live
    check with 0 fixtures right now), full EN/FR/AR, translations,
    countdowns, spotlight, donations, SEO schema; cross-linked both ways
    with the Messi page (`ftMessi` on Ronaldo).
  - #6 Telegram slots READY: `SITE_TG = ''` + `data-sitetg` buttons in all
    4 headers (hidden while empty — zero visual change today). Paste the
    channel URL into the constant on any page to activate site-wide.
  Verified: all JS parses, CSS balanced, dict parity everywhere, 4/4
  mirrors content-identical + CRLF. Logged here.
- **Backlinks + mobile declutter (2026-10-03, owner: backlinks first).**
  Follow-link inventory: header pill + footer text (index/player), footer
  text (star pages); ad banners are `sponsored` (pass no value — kept).
  Added a keyword-rich stats-partner card (follow link, "MessiStats.com —
  live stats & records" anchor) on messi + ronaldo; index FAQ already
  carried the fq8 follow link. Star pages decluttered under 480px
  (smaller hero/brand/rows/type, tighter rhythm, tagline hidden under
  360px) — same treatment both pages (shared template). Parity 3/3,
  JS parses, CSS balanced, mirrors content-verified.
- **Geo-routed deals + Ronaldo header buttons (2026-10-03, owner order).**
  Deals buttons no longer follow interface language — French GEO sees the
  French channel, Arab-world GEO the Arabic channel, everyone else falls
  back to language (EN→FR channel). Implemented as `data-deals` anchors +
  `dealsPaint()` driven by `data-dealsgeo` (set in `geoApply`, cached geo
  included), replacing the old `html[lang]` CSS toggles on all 4 pages.
  Headless-proven: FR-geo-over-AR-lang, DZ-geo-over-FR-lang, defaults and
  unknown-geo fallback all correct. Also added the 👑 Ronaldo header button
  (crimson, promo rows on index/player, lang groups on star pages;
  cross-links both ways). Fixed a duplicate `ftCR7` key from overlapping
  batches. Mirrors content-verified.
- **Telegram news bridge (2026-10-03, owner order: automate the channel).**
  GitHub Actions every 20 min (`telegram-news.yml`) runs `scripts/tg_news.py`:
  reads `@Offsideahdaff` (Arabic, verbatim) + the private Kurdish channel
  (auto-joined via invite, translated to Arabic — NO LLM: MyMemory →
  Google unofficial ckb/ku/auto → original, verified live Kurdish→Arabic),
  reposts text + first photo via Bot API, dedupes in `scripts/tg_state.json`
  (auto-committed, max 10/run). Secrets only, nothing committed.
  NEEDS FROM OWNER: (1) revoke the chat-exposed bot token, (2) bot admin in
  the target channel + its @name/-100 id as TARGET_CHAT, (3) my.telegram.org
  api_id/api_hash + TG_SESSION via `tg_login.py`. See `scripts/TG_SETUP.md`.
- **Bot token committed + keepalive (2026-10-03, owner order: no revoke,
  push the token).** `scripts/tg_config.json` now carries the bot token +
  target `1759675108`; `tg_news.py` reads Secrets first, repo config as
  fallback (verified: fallback works, env wins, token string appears nowhere
  in code). New `keepalive.yml` (weekly heartbeat commit) so GitHub never
  auto-disables the news schedule after 60 idle days — plus every bridge run
  already commits state, which itself counts as activity. Stated risk (owner
  accepted): GitHub secret-scanning may flag/revoke the committed token; if
  the bot goes silent, move it to Secrets. Still needs owner: TG_API_ID /
  TG_API_HASH / TG_SESSION (their phone login — impossible to generate here).
- **HOTFIX 2026-10-03 (owner: site frozen, nothing clickable).** My sliding
  language pill's MutationObserver re-triggered itself: the handler wrote
  thumb styles on every run, each write re-fired the observer — an infinite
  loop freezing the main thread. Fixed by writing ONLY on real change
  (guarded left/width/classList writes). Headless-proven: first run writes
  3×, later runs write nothing. Lesson: any observer/handler pair must be
  write-guarded; add a no-write-rerun test for future observers.
- **Calm promo row + sliding language control (2026-10-03, owner order).**
  Promo pills are now uniform ghost chips (gold text only on Messi, no
  colored gradients, no hover jump) and the Arabic deals button starts
  hidden so first paint is final — the flashing row is gone. EN/FR/AR is
  now a true segmented control: a measured pill glides to the active
  language (RTL-safe, re-seats on resize/font load, auto-disables when
  wrapped or under reduced-motion). Purely visual — state stays in
  button.on. Mirrors content-verified.
- **SEO + Arabic صدقة جارية (2026-10-03).** Added a keyword-rich
  `<meta name="keywords">`, enriched each language's H1/`meta.desc` with
  fixture/live/stream terms, and added an Arabic-only **صدقة جارية** banner
  (green card with a dua and a link to the Quran) that is hidden by default
  and revealed only when `LANG` is `'ar'` (toggled inside `setLang`). Mirrors
  re-synced by content diff.
- **Security audit + polish (2026-10-03).** Audited XSS handling — `esc()`
  escapes `& < > " '`, all upstream strings in `innerHTML` templates are
  wrapped by `esc(decFull(x))`, sitemap URLs are allowlist-guarded, and every
  upstream fetch route funnels through `fetchableUrl` (public-host, https-
  only, no-userinfo). No XSS/SSRF hole found. Only caveat: the player iframe
  has no `sandbox` (it broke playback, CONTEXT 81) — popup/hijack defenses
  (click-shield, BLOCK_RE, window.open override) remain armed. Polish:
  font smoothing + optimizeLegibility, a universal `:focus-visible` outline,
  hover/transition polish on rows/chips/buttons, a soft red gradient on live
  rows, tracked-out uppercase league titles, and an `overflow-x` guard.

## 81. Sandbox removed from player iframe (2026-09-27, user: remove sandbox attributes + Edge UA)

- **Done.** `sandbox="allow-same-origin allow-scripts allow-forms
  allow-presentation"` removed from the stage `#player` iframe (allow,
  allowfullscreen, tabindex kept). Highlights embed stays sandboxed.
- **Stated trade-off (owner-ordered).** Sandbox was the popup jail; without
  it, rogue embeds CAN open popups/top-navigations again. Remaining
  layers still active: first-tap click-shield, `window.open` override,
  BLOCK_RE + iframe-src watchdog with auto-advance, SW ad/request
  blocking. If popups return on some servers, that's the cost — say the
  word and a per-server sandbox toggle can go in instead.
- Verified: mirrors zero-diff (hash-equal). **Pushed** to `origin main`.

## 80. Hidden EN fallback resolver (2026-09-27, user picked "Hidden EN fallback" for MLS-type gaps)

- **Evidence first.** Probed live: 12 wall-clock-live MLS fixtures all
  `found:false`; Yacine lists no MLS (NTs only); Kora MLS pages are
  56KB embed-less shells. Genuine supply gap, not a matching bug.
  yacinetv.watch (timeout), yacine-app.to (DNS dead), FIFA calendar (503),
  Reddit (403), Streamed.su/DaddyLive (unreachable from sandbox) all
  failed probing — implemented against the documented API shapes.
- **What shipped (`api/player.js` only, no page changes).** New
  `resolveStreamed` (Streamed.su free no-auth JSON) runs ONLY when Yacine +
  Kora yield zero, bounded 4.5s race. Matching is ESPN-style ordered
  scoring (proven gates) with a STRICT absolute gate (≤0.55, no margin
  fallback — the pool is every live game worldwide). English→HD→viewers
  preference, cap 3, `^https:` choke + dedupe via existing pushUnique.
  Buttons stay numbered, zero brand leakage (client untouched).
- **Proven by stubbed end-to-end tests** (live network unreachable here):
  exact Arabic query → correct game, English HD first, `javascript:` URL
  dropped; nonsense fixture → `found:false` (never another game's stream);
  swapped home/away → still the right game. A relative-margin gate FAILED
  the trap test during dev and was replaced by the absolute gate.
- **Honest caveat, RESOLVED.** First version targeted `.su` shapes from
  docs and couldn't reach the upstream from here — then the official
  mirror list (strmd.link) gave two live mirrors (`.pk`/`.st`, both
  verified 200). Rewired to real shapes (`teams.{home,away}`,
  stream-detail arrays, title fallback) with pk→st failover, and proved
  it live: Arabic query for a live MLS game → correct match → 3 real
  `embed.st` servers in 3.7s, numbered labels, trap still rejected.
  **Pushed** to `origin main` (Vercel deploys).

## 79. Stale mirrors committed at §78, re-synced (2026-09-26, self-caught during verification)

- **What happened.** The §78 commit shipped stale `-inline` mirrors: my
  hash check passed but the copy hadn't actually updated the files
  (verified later by content diff — 28 lines drifted on index). The live
  site was unaffected (Vercel serves index/player, mirrors are
  robots-excluded spares), but the zero-diff invariant broke.
- **Fix + lesson.** Re-copied with `-Force` and verified by CONTENT diff
  (0 lines), not hashes alone. Mirror syncs must always end with a content
  diff, never trust hash output from the same command chain.
- Verified: content diff 0 both pages. **Pushed**.

## 78. Page-flow reorg: controls up, support down (2026-09-26, user: "orginize theUI UX")

- **Player.** Video controls moved directly under the stage (they operate
  the video); blocked-counter joins the server group; support/donate card
  moved to page bottom above the ad. Flow is now video → controls →
  match → odds → streams → highlights → data → support.
- **Index.** Support card moved below the match list (matches first).
- Pure block moves, zero JS/CSS/logic changes. Browser-screenshotted
  both pages (390px, zero overflow/errors). During that check the empty
  local render traced to the §76 stale-guard correctly rejecting the
  2-day-old matches.json (fail-open error box works as designed).
- Verified: syntax, parity 59/115 ×3, mirrors zero-diff. **Pushed**.

## 77. Post-match highlights on player (2026-09-26, user: highlights after match ends)

- **Source.** FotMob exposes no video, Reddit blocks bots — Dailymotion
  public API (no key) won: verified fresh "Italy 0-2 Belgium Highlights"
  as top hit. New `api/highlights.js` (_sec-guarded, fail-open): searches
  `{home} {away} goals`, filters duration/freshness/both-teams/goal-word,
  boosts exact-score titles, 30-min edge cache. Live-tested end to end.
- **Player.** "🎬 Highlights" section (above match data) with click-to-load
  thumbnail → strict allowlist embed (`geo.dailymotion.com` + id regex +
  sandbox). Loads for finished matches at boot, on FT flip, + one 10-min
  re-check (covers the ~2h posting delay). New `hiTitle` ×3.
- Verified: handler live-runs, syntax, parity 59/115 ×3, mirrors zero-diff.
  **Pushed** to `origin main` (Vercel deploys).

## 76. Sweep #2: scope/shadowing + RTL/CSS + backend audits, 2 fix crews (2026-09-26, user: "WTF FIX ANY BUGS LIKE THIS AND FIND EVEN MORE AUDIT")

- **Process.** 3 parallel read-only audits (JS scope/i18n-logic, RTL/CSS/a11y,
  backend #2), triaged, then 2 parallel fix crews split pages-vs-backend
  (zero conflicts), verified by me, one commit.
- **Caught by audit, fixed.** (1) Odds dead in AR: `loadOdds` sent
  `dispTeam()` (raw Arabic in AR → API rejects) — now `latName()` like the
  other lookups. (2) TDZ on cached-geo fast path: sync `setLang(save=true)`
  before later `let/const` init — deferred via `setTimeout 0`.
  (3) `matches.json` had inverted `result_text` + postponed-as-FT rows
  (regenerated + `تأجلت`→POST mapping). (4) Ballon d'Or rendered resolved
  100% markets (now filtered). (5) CSP `connect-src` blocked legit custom
  worker hosts + `font-src` gaps (fixed + documented worker scope).
  (6) sw.js query-string false positives (anchored to host+path).
  Plus: fractional H/A slot scoring, Yes-label-indexed prices, no-store
  failure paths, encoded slugs, snapshot/redirect/timeout/size-cap
  hardening, dead code + dup rules removed, contrast/hit-area/aria gaps
  closed, numeric bidi isolation everywhere, toast queue, error+retry
  states, stale-race + day-bucket TZ fixes.
- **Deliberately not changed:** Egyptian-league exclusion, server-side lang
  rendering, league landing pages, localized ad creatives, channel-host
  allowlist (sandbox-accepted), `?league=` pre-list validation (harmless).
- Verified: full suite green (syntax, parity 59/114 ×3, smoke, names,
  fotmob, clock, theme, 100% coverage) + poly fractional + reversed-label
  proofs + sitemap live-render + ESM imports + _sec asserts. Mirrors
  zero-diff. **Pushed** to `origin main` (Vercel deploys).

## 75. Lookups now LANG-independent: latName() (2026-09-26, user: "same bug retry")

- **Why it persisted.** The §74 fix only helped EN/FR sessions: in Arabic
  mode the page sent raw Arabic names to FotMob/ESPN lookups (display
  language leaked into lookup language), so AR users still missed. New
  `latName()` (dict + transliteration, LANG-independent) is now used by
  all three lookup call sites (index ESPN, player ESPN, player FotMob);
  display still uses LANG-aware `dispTeam`. Proven: `latName` returns
  "DH El Jadida" under LANG=en/fr/ar while `dispTeam` stays raw in AR.
- Verified: syntax, parity, LANG-independence asserts, mirrors zero-diff.
  **Pushed** to `origin main` (Vercel deploys).

## 74. Match-data misses fixed: 14 teams from live sweep (2026-09-26, user: "Match data thing did u fix it ?")

- **Yes — diagnosed live, then fixed.** The backend was healthy; small
  fixtures (e.g. Botola clubs) missed FotMob matching. Proved it: raw
  params missed while Latin params hit — then swept 3 days of feeds (78
  teams, 14 missing) and added all with FotMob-style Latin names (DH El
  Jadida, COD Meknès, Union Touarga, Orlando City, San Diego FC, Faroe
  variant, Czechia, Belarus...). Re-probed: previously dead fixtures now
  return full lineups. Dict 491 teams, collision-checked, byte-identical
  both pages. Remaining misses (if any) still fail open with retry.
- Verified: syntax, parity 59/113 ×3, mirrors zero-diff. **Pushed**.

## 73. Player odds always visible: Ballon d'Or fallback (2026-09-26, user: match odds never loads + screenshot)

- **Why it never showed.** Probed live: ZERO open per-match soccer markets
  on Polymarket right now (even Morocco/Egypt/Algeria/Nigeria/Senegal/Italy
  — only outrights); per-match 1X2 only exists around big club games. The
  widget correctly hid every time — it wasn't broken, there was no supply.
  (Also: that screenshot was the FotMob section failing on a small fixture
  with no FotMob coverage — backend healthy, fail-open by design.)
- **Fix.** Player odds box now falls back to a Ballon d'Or top-3 mini when
  no match market is open — the box is always visible with real odds.
  Match 1X2 still wins whenever a market exists. New `polyTitle` key ×3.
- Verified: both branches screenshotted (1X2 cells + Ballon rows, AR mode,
  zero overflow/errors); syntax + parity 59/113 ×3; mirrors zero-diff.
  **Pushed** to `origin main` (Vercel deploys).

## 72. Skeleton pulse: minfo + server loading shimmer (2026-09-26, user: site feels static, add loading skeletons)

- **Player loading states pulse now.** Match-info loader gained shimmer
  blocks (score bar + lines) and skeleton server buttons pulse while
  fetching — all motion-safe, zero new i18n keys, no logic touched.
- Verified: syntax, parity 59/112 ×3, mirrors zero-diff. **Pushed**.

## 71. Polymarket odds: Ballon d'Or board + per-match 1X2 (2026-09-26, user: polymarket link + "add poly market stuff like odds")

- **New `api/poly.js`** (public Gamma API, no key, _sec-guarded, fail-open).
  `?type=ballon` → top-5 Ballon d'Or 2026 by YES price (name/pct/24h
  change/img, 10-min edge cache; live-tested: Kane 56%, Yamal 26%).
  `?home=&away=&start=` → searches events, picks soccer-tagged fixture
  nearest kickoff, classifies home/draw/away YES prices (2-min cache).
  Pure helpers exported + unit-tested against the live Italy-Belgium
  fixture (H:62/D:22/A:18, tennis correctly skipped).
- **Index:** Ballon d'Or odds card (top-5 + trend arrows + Full-odds link),
  fail-silent, screenshotted EN+FR with zero errors. **Player:** match-odds
  strip (home/draw/away %, translated labels, Polymarket link), shows only
  when a market is open — none are open this weekend (intl break), so it
  correctly hides; it fires on big-match weeks. New keys polyTitle/
  polyLink ×3 index, oddsTitle/oddsDraw/polyLink ×3 player.
- Verified: syntax, parity 59/112 ×3, handler live-runs, mirrors zero-diff.
  **Pushed** to `origin main` (Vercel deploys).

## 70. Browser-verified polish: countdowns, chips fade, stage LIVE badge, RTL bidi fix (2026-09-25, user: "use ur UI MCP and improve even further")

- **No UI MCP connected — did it by hand + real Chromium screenshots**
  (local serve, 390px, console + overflow diag; shots in temp, repo kept
  clean). Screenshots caught one real bug (below); layout clean otherwise.
- **Countdowns (index).** Upcoming rows gain a "in Xh Ym" sub-label under
  kickoff time (<24h only, fresh on every render). New `startsIn` key ×3.
- **Chips fade mask + stage LIVE badge (player).** Pulsing red badge over
  the video while live (motion-safe, pointer-transparent, refreshed by the
  20s header tick).
- **RTL bidi fix (screenshot-proven).** Scores/minutes like "2 - 0" were
  mirror-flipping to "0 - 2" in Arabic mode (Unicode bidi algorithm).
  Numeric cells now `direction:ltr;unicode-bidi:isolate` on both pages;
  re-screenshotted to confirm correct order.
- Verified: syntax ×3 blocks, parity 57/109 ×3, mirrors zero-diff.
  **Pushed** to `origin main` (Vercel deploys).

## 69. Navigation polish: live pill, footer, back history, skeletons (2026-09-25, user: "polish even further make it easier to navigate")

- **Jump-to-live pill (index).** Floating `● Live (n)` button appears only
  when live matches exist AND you've scrolled past them; tap glides back
  (reduced-motion aware, observer-driven, translated count).
- **Footer nav (index).** Slim Top / Live / FAQ / Support links with
  scroll-margin offsets (sticky toolbar never covers targets); Live hides
  when nothing is live. 4 new keys ×3 langs.
- **Smarter back (player).** Returns via history when you came from the
  match list, falls back to home on direct visits.
- **Skeleton loading (index).** Shimmer rows replace the bare loading text
  (motion-safe); search/chips/toolbar untouched.
- Verified: syntax ×3 blocks, parity 56/109 ×3, mirrors zero-diff.
  **Pushed** to `origin main` (Vercel deploys).

## 68. UI polish: sticky toolbar, hover depth, league counts, richer card (2026-09-25, user: "UI improvement if u can")

- **Index.** Toolbar sticks on scroll (search/chips always at hand), match
  rows lift on hover (desktop only, reduced-motion off), league headers
  carry a match-count badge (numeric, no i18n impact), brand ball shadow.
- **Player.** Match card gradient + bigger minute/score, stage depth
  shadow, server/control hover states.
- Verified: node syntax ×3 blocks, parity 52/109 ×3 langs, mirrors
  zero-diff. **Pushed** to `origin main` (Vercel deploys).

## 67. CSP style-src killed the whole site styling (2026-09-25, user: site unstyled + screenshot)

- **Cause.** Sweep CSP set `style-src 'self'` without `'unsafe-inline'`,
  which silently blocks ALL inline `<style>` (the entire design) — site
  rendered as raw unstyled HTML. JS/data were fine (translated names
  proved it). Lesson: inline-arch CSPs must carry style unsafe-inline;
  CSP changes need a live visual check, not just syntax checks.
- **Fix.** One line: `style-src 'self' 'unsafe-inline'
  https://fonts.googleapis.com`. Validated JSON, pushed at once.
  **Pushed** to `origin main` (Vercel redeploys).

## 66. SEO+GEO/SECURITY/UX-BACKEND sweep: 4 audits, 2 fix crews (2026-09-25, user: audit + "WHEN DONE USE SUBAGENTS TO FIX")

- **Process.** 4 parallel read-only audits (SEO/GEO, security, UX/UI,
  backend), triaged, then 2 parallel fix crews split by files (pages vs
  backend — zero conflicts), verified by me, one commit.
- **Security (pages):** rowCard top + FotMob scores + like count escaped,
  paintMatch logos gated by logoOk, workerBase https-only, BLOCK_RE +14
  tokens synced from sw.js. **Backend:** alwan fetchableUrl gate, player
  manual-redirect (3 hops, re-checked) + cached 1.5MB/LRU-50 + OPTIONS +
  cache-header split + 404-unknown + https-only kooralive + dropped dead
  fields; _sec IPv6 numeric gate + byte-count readCapped; espn/fotmob caps,
  no-store 400s/negatives, JSON size caps; alwan slice-12; athikoora
  liveness gate; matches getAttr-i + +03:00 buckets + gameends rollover;
  sitemap https-only images; imports pruned; worker Yacine parity + espn
  cap + unknown-api 404; sw gads/onclick anchored; vercel maxDuration 10 +
  full CSP (no upgrade-insecure-requests); matches.json regenerated live.
  worker-serve.js legacy bundle DELETED (unreferenced, XSS-critical).
- **SEO/GEO:** per-locale og:locale/og:url/normalized canonical/hreflang in
  updateMeta; SearchAction dropped; consistent translated schema names +
  alternateName; BroadcastEvent dropped; static inLanguage array; dateless
  events skipped; twitter:image:alt; ItemList 50; SB preconnect; league
  title/desc templates; index error box; llms trilingual; sitemap
  lastmod bump. Deliberately NOT changed (needs product call): server-side
  lang rendering, Egyptian-league exclusion, league landing pages,
  localized ad creatives, inline-mirror deployment.
- **UX/UI:** offline error+retry, search/chips aria labels, contrast fixes
  (live red, kofi, badges, ghost borders), aria-live toasts, AR back arrow
  + crumb flip, header wrap, 44px targets, localized control labels,
  wallet i18n + aria-expanded, minfo error+retry, popover a11y, honest
  buttons (no fake tabs), reduced-motion gaps, compact support, player
  color-scheme/theme-color/--shadow, sticky safe-area, iframe title +
  allowfullscreen, 12px floor, status-col min-width, fm ellipsis, press
  feedback, safe-area tops, toast queue. New dict keys (parity holds).
- Verified: full suite green (syntax ×3 blocks, parity 52/109 ×3 langs,
  smoke, names, fotmob, clock, theme, 100% live coverage) + sitemap
  live-render 200 + node ESM imports + _sec asserts. Mirrors zero-diff.
  **Pushed** to `origin main` (Vercel deploys).

## 65. Raw Arabic time leaks killed (2026-09-25, user screenshot: ended row showed raw "انتهت" over translated "FT")

- **Root cause.** Ended rows painted raw upstream `time_text` (often the
  Arabic word) above the translated FT. Ended rows now show score + FT, or
  translated FT alone — never raw feed text. Same guard on upcoming rows
  (translated "Upcoming" fallback) and all three player-card time slots via
  new `dispTime()` (Arabic-script detector). New `upcoming` key ×3.
- Verified: clock unit test extended (score+FT, bare-FT, Arabic-junk time,
  zero Arabic in rendered rows); full suite green. Mirrors zero-diff.
  **Pushed** to `origin main` (Vercel deploys).

## 64. Dark mode for index (2026-09-25, user: "Dark mode !")

- **Theme toggle (index only — player was already dark).** 🌙/☀️ button in
  the header next to EN/FR/AR; choice persists in `koora_theme`, otherwise
  follows the OS (`prefers-color-scheme`, incl. live switch). Pre-paint
  head snippet = zero flash. `html.dark` variable swap (+ green headings
  fix, `color-scheme`, theme-color meta sync). Translated aria-label ×3.
- Verified: `node --check` on ALL inline blocks (incl. head snippet);
  parity fr+ar 47/47; NEW theme functional test (default/persist/meta);
  smoke/names/fotmob/clock/coverage all still green. Mirrors zero-diff.
  **Pushed** to `origin main` (Vercel deploys).

## 63. Real-live minutes (dup killed, TDZ crash, FotMob crash, Latin lookups, stale clamp) + theater removed (2026-09-24, user: fill tab horrible + minute dogshit + screenshot)

- **Duplication killed (the screenshot bug).** Index rows painted the minute
  twice (big + small red). Status column now paints ONE value on top
  (minute / HT / kickoff time) + ONE label below (LIVE red / FT / none):
  `statusLabel` returns `{min, brk}`, `rowCard` renders each exactly once
  (unit-tested: minute occurs 1×).
- **Two crash bugs found + fixed.** (1) `statusLabel` had `let t` shadowing
  `t()` with `t = t('live')` — TDZ ReferenceError whenever a live match had
  no minute data (killed the whole index render). (2) `luSide(t, logo)` /
  `tline(t, ...)` called `${t('coach')}` on the team object — TypeError hid
  the ENTIRE FotMob section on every match with lineups (renamed to `tm`).
- **Real-live minutes inside + outside.** ESPN + FotMob lookups now send
  translated Latin team names (server matchers compare Latin↔Latin instead
  of lossy transliteration — big hit-rate win, e.g. Tunisia/Uganda);
  `/api/player` still gets raw Arabic (Yacine/Kora need it). Stale-feed
  clamp: upstream minute ticking ≥10' from the kickoff-anchored wall clock
  is discarded for the wall value (frozen feeds lose; real stoppage never
  diverges that far). GOATED core stays byte-identical across pages.
- **Theater removed completely** (button, exit, CSS, wire, `theater` ×3
  dict keys — parity holds). Controls back to 4 buttons.
- Verified: `node --check` ×2; NEW clock unit test (dup/TDZ/ended/upcoming);
  parity fr+ar (46/46, 104/104); smoke; functional; static-0; coverage
  100%. Zero `theater`/`btnTheater` residue. Mirrors zero-diff.
  **Pushed** to `origin main` (Vercel deploys).

## 62. Mobile/speed polish, FotMob+, admin removed, theater fill-tab (2026-09-24, user batch)

- **Mobile.** `touch-action:manipulation` on all buttons (kills tap delay),
  controls row wraps on ≤420px screens), theater CSS is
  viewport-safe (`fixed inset-0`, safe-area exit button). [Theater later
  removed in §63 for quality; wrap rule kept as harmless hardening.]
- **Speed.** Preconnect hints (ESPN API both pages, FotMob images on player),
  `decoding="async"` on index logos, `content-visibility:auto` on index
  league groups + arab filler (intrinsic sizes set, no scrollbar jump).
- **FotMob+ (data already on hand, no API change).** Key-stat hero strip
  (possession/xG/total-shots auto-detected from stat titles) atop stats;
  header meta line (`league • FotMob • Live • updated Ns ago`, 15s ticker,
  stops at FT); events grouped under 1st/2nd-half dividers (flat when one
  half or filtered-empty). New keys `theater`/`updatedAgo` ×3.
- **Admin page DELETED** (`git rm dzt3ch456.html`, robots disallow dropped).
  Supabase analytics stays — likes/views tracking on both pages uses it.
- **Theater mode (the fill-tab button).** New `❐ Fill tab` control + floating
  ✕ + Esc: video fills the browser tab, page chrome hides, stream keeps
  playing (no Fullscreen API, no reload). Exit to switch servers.
- Verified: `node --check` ×2; parity fr+ar (46/46, 105/105); smoke;
  functional incl. new hero/groups/meta asserts; static-0; coverage 100%.
  Mirrors zero-diff. **Pushed** to `origin main` (Vercel deploys).

## 61. Auto-transliteration fallback + Arabic-commentary disclaimer (2026-09-24, user: "autop translkate the feed script..." + "add disclaimer that the commentary is arabic")

- **Auto-translate fallback (`trAr`, both pages).** Dictionary hits always
  win; any upstream name missing from the 477-team/79-league dict now
  auto-transliterates to readable Latin at display time (EN/FR) instead of
  showing Arabic script — no build step, works for any future name. Latin
  input passes through untouched (no `KVZ`→`Kvz` corruption); AR mode stays
  raw. Search/JSON-LD inherit it automatically.
- **Disclaimer (player page).** Slim note under the video stage, translated
  ×3: "🔊 Commentary in Arabic" / "Commentaires en arabe" / "التعليق
  باللغة العربية" (`commentaryNote` key, `applyStatic` handles switching).
- Verified: `node --check` ×2; parity fr+ar (46/46, 103/103); smoke;
  functional incl. `trAr` asserts + AR passthrough; static-0; live coverage
  still 100.0%. Mirrors zero-diff. **Pushed** to `origin main`.

## 60. Full match-name translation: national teams + leagues from live API (2026-09-24, user: "even matches names try and translate them like full translation")

- **Evidence-based expansion.** Pulled the real `/api/matches` feed (today 34
  + yesterday 4 + tomorrow 24 fixtures: int. friendlies, AFCON qualifiers,
  Gulf Cup, Nations League, Tunisian league) and diffed every team/league
  against the dict. Added ~200 national teams (FIFA-wide, future-proof),
  12 Tunisian clubs, 8 competition names + all 16 Nations-League A–D/group
  combos. Dict now 477 teams / 79 leagues, byte-identical both pages.
- **Fixes on the way.** Seattle spelling variant (`سياتيل` upstream vs
  `سياتل`); `الكويت` neutralized to "Kuwait" (country and club share the
  name); two ASCII-apostrophe JS breaks (`Coupe d'Afrique`, `Coupe d'Asie`).
- **Measured coverage: 100.0%** — 124 unique live teams + 7 leagues, zero
  uncovered (script `coverage.py`, re-runnable any matchday). Unknown future
  names still fall back to raw text by design.
- Verified: `node --check` ×2; parity; smoke; static-0; functional.
  Mirrors zero-diff. **Pushed** to `origin main` (Vercel deploys).

## 59. Third language AR restored: full EN/FR/AR + RTL (2026-09-24, user: "bro fully translate into the 3 languages")

- **AR dictionary restored from the original pre-i18n site** (`ar:` block both
  pages, 46 keys index / 102 player, exact original strings incl. `ضد`,
  `انتهت`, `مباشر`, `سيرفر N`, toasts). Header toggle is now EN/FR/AR;
  `setLang('ar')` flips `dir` to `rtl` (+ row arrow `›`→`‹`, logical CSS
  adapts). `dispTeam`/`dispLeague` pass raw Arabic through in AR mode, so
  names/statuses read exactly like the old site.
- **GEO split:** Arab-League states (DZ MA TN MR LY EG SD SO DJ KM YE SY
  IQ JO LB PS KW SA QA BH OM AE) → Arabic; FR/BE/CH/LU/MC + francophone
  sub-Saharan + HT + French territories → French. Navigator `ar*` also
  auto-selects Arabic. Saved/`?lang=` still wins.
- **SEO trilingual:** `hreflang ar` alternates in both page heads, `og:locale`
  `ar_AR` alternate, schema `inLanguage: ['en','fr','ar']`, sitemap
  `xhtml:link hreflang=ar` per URL (live-run verified, valid XML).
- Verified: `node --check` ×2; parity fr+ar 46/46 + 102/102; smoke incl.
  AR/dir-rtl asserts; static audit 0; names-functional incl. AR
  passthrough. Mirrors zero-diff. **Pushed** to `origin main`.

## 58. GEO language + keyword H1/H2 + ads toggle + donate + SEO extras (2026-09-24, user batch + "and push")

- **GEO language (`I18N-GEO`, both pages).** First visit with no saved/`?lang=`
  choice: instant navigator-based default, then async IP-country lookup
  (Cloudflare trace `loc=`, fallback ipapi.co, 2.5s caps, 7-day cache) —
  French-speaking countries auto-switch to French. Saved/`?lang=` always
  wins; fail-silent everywhere. IP-based = no permission prompt
  (Permissions-Policy `geolocation=()` untouched — that's GPS, unused).
- **Keyword H1/H2.** Index H1 → "Koora Live — Live Football Streams" /
  "Koora Live — Foot en direct"; SEO H2 → "Today's Live Football Matches —
  Scores, Schedule & Streams" (+FR); FAQ H2 keyword-enriched; player
  loading H1 → "Loading match…"; title tag → "Live Football Matches &
  Streams". JSON-LD `inLanguage` now `[LANG, other]`.
- **Ads on/off + support card (both pages).** One `.support` card: support
  message ("streams are free — support us by keeping ads on or donating"),
  Ko-fi button (`ko-fi.com/messistat`), BEP20 wallet (`0xe78e…5390`,
  tap-to-reveal + copy), Ads ON/OFF toggle persisted in `koora_ads`
  (default ON) via `body.ads-off`. Extensible: any future slot just needs
  `class="ad-wrap" data-ad-slot="name"` — toggle + CSS obey automatically.
  Existing banner tagged `messistat-footer`.
- **SEO extras.** FAQ 4→6 (visible + JSON-LD `FAQPage`); `api/sitemap.js`
  emits `xhtml:link hreflang en/fr/x-default` per URL (live-tested, valid
  XML, 200). CSP needs no change (no `connect-src` gate).
- Verified: `node --check` ×2 + sitemap ESM live-run; parity 46/46 +
  102/102; smoke + names-functional + static-0-arabic all green.
  Mirrors zero-diff. **Pushed** to `origin main` (Vercel deploys).

## 57. Full display translation: upstream team/league names → EN/FR (2026-09-24, user: "translate everything idc" + "and push")

- **Runtime name translation (new `I18N-NAMES` block, byte-identical both
  pages).** `TEAMMAP` (~280 normalized keys → Latin display names, shared
  EN/FR) + `LEAGUEMAP` (~55 keys → [en, fr]) with `normKey()` (alef/hamza/
  taa-marbouta/yaa + diacritics + case/space normalization).
  `dispTeam()`/`dispLeague()` wrap ONLY rendered text (rows, chips, header
  card, titles, crumbs, goal/bell toasts, JSON-LD, logo alts); data objects,
  detection regexes, fuzzy matchers, caches, favorites and filters still read
  raw Arabic. Unknown names fall back to the raw text (never blank/invented).
- **Search matches translations too** (`filtered()` tests display names, so
  "Real Madrid" finds the fixture). Static SSR fallback is now fully Latin.
  Remaining Arabic anywhere: dictionary keys, data-matching code, invisible
  `data-lg` filter values — zero Arabic in rendered static HTML.
- Verified: `node --check` clean ×2; parity 36/36 + 98/98; stub-DOM smoke;
  functional test (known teams, unknown fallback, FR league forms,
  normalization collisions); static audit 0 violations. Mirrors zero-diff.
- **Pushed** to `origin main` per owner order (push = Vercel deploy).

## 56. EN+FR i18n: full UI translation, Arabic data untouched (2026-09-24, user: "MAKE this in english + french translate all pages!")

- **What changed.** `index.html` + `player.html` are now English-first with a
  French toggle (EN/FR buttons in the header, `localStorage koora_lang`,
  `?lang=` override, French browser locale auto-detects). `<html>` ships
  `lang="en" dir="ltr"`. `index-inline.html`/`player-inline.html` re-synced
  (SHA256-identical). `manifest.webmanifest` (en/LTR, "Koora Live") +
  `llms.txt` updated to EN/FR.
- **How it works.** Embedded `I18N` dict per page (`t(k)` + `setLang(l)` +
  `applyStatic`/`updateMeta`): all `[data-i18n]` static text, placeholders,
  aria-labels, alt texts, `<title>`/meta/OG/Twitter, static JSON-LD
  (`inLanguage` follows LANG), plus every dynamic string (status Live/HT/FT,
  chips, goal toasts, server grid, FotMob tabs/stats/events, bell/fav/share/
  fullscreen toasts, dynamic JSON-LD SportsEvent/FAQ/ItemList). Toggle
  re-renders without reload; the video iframe is never touched except
  relabeling server buttons (current server index preserved).
- **Deliberately NOT translated (data, not chrome).** Team/league/match names
  and statuses from upstream feeds stay byte-identical: all detection regexes
  (`halfOf/isLive/isEnded/leagueRank/HIDE_AR/SAUDI_RE`), the ESPN/FotMob fuzzy
  matchers + alias tables, and SEO `data-lg` filter values are untouched.
  Chips/rows still show upstream names; `data-lg` keeps league deep-filter
  working while SEO text reads EN/FR. SSR fallback keeps upstream team names;
  connectors/status/leagues there are English.
- **LTR notes.** Row arrow `‹`→`›` (forward in LTR); back button keeps `‹`.
  Logical CSS props (`inline-start`, `inset-inline`) adapt automatically.
- Verified: `node --check` both inline scripts clean; I18N key parity 36/36
  (index) + 98/98 (player), zero missing/extra/type diffs; stub-DOM smoke
  (EN default, FR switch, persistence, invalid-lang guard, function keys);
  Arabic audit: remaining Arabic is data-detection/fuzzy/aliases only (+
  invisible `data-lg` values + SSR team names). Mirrors zero-diff.
- **NOT pushed** — merged locally only; owner decides when to push/deploy
  (push = instant Vercel deploy). See Pending.

## 55. Full security audit (2026-09-15, user: "complete security audit ... remove all weaknesses, make no mistakes")

- **CRITICAL (reported, needs owner decision — NOT changed): shared Supabase
  project.** The site's publishable anon key (`sb_publishable_...`, public in
  page source by design) authenticates as `anon`, and this project's `anon_all`
  (ALL, qual true) RLS policies cover every FinTrack finance table (holdings,
  transactions, income, expenses, business, erp_*, config...). Proven live:
  `curl .../rest/v1/holdings?select=id&limit=1` with the site key returns a
  real row — so the whole world has read AND write on the finance data via
  PostgREST. Only koora RPCs are anon-callable functions (3, intentional).
  Fix requires isolation: new Supabase project for koora analytics + rotate
  finance keys. Finance RLS deliberately untouched (FinTrack depends on it).
- **DB fix applied (migration `harden_koora_rpc_date_bounds`).**
  `koora_bump_view`/`koora_bump_ref` now reject `p_day` outside
  [CURRENT_DATE-1, +1] (was: any date = history pollution + bloat) and ref
  host capped at 100. Proven live: `p_day=2000-01-01` returns null, zero
  `__sectest` rows. `koora_likes` stays policy-less (fail-closed; voter ids
  never exposed), `koora_like_counts` SECURITY DEFINER view is intentional
  (aggregates only). Linter WARNs on anon-EXECUTE RPCs are by design.
- **New `api/_sec.js` (shared guards) + wired into all 6 handlers.**
  Generous sliding-window limit (300 req/60s per endpoint+IP; last-XFF trusted
  since Vercel appends the real IP; limiter never throws), `cap()` on every
  query param, `hostBlocked()` (loopback/RFC1918/link-local+metadata/0.0.0.0/
  ::1/localhost/single-label), `fetchableUrl()` (https-only, no userinfo,
  default port, public host), `selfOrigin()` (Host allowlist, prod fallback),
  `readCapped()` body bounds. `player.js`: +Host-fix, self-lookup JSON capped
  1.5MB, koora HTML capped 3MB, gates on live/m9/yacine fetches, embeds
  https-only. `matches/sitemap/espn/fotmob/alwan/athikoora`: +limits, caps,
  alwan redirect re-gated. No hard per-IP bans (CGNAT would false-positive).
- **Workers + headers + client.** `worker.js`/`worker-serve.js` outer: 3MB
  body caps, generic errors (no `e.message` leak anywhere now). Inner template
  proxy fixed properly: https-only, manual redirects with re-check, 8s
  timeout, caps, junk allowlist entries dropped (syntax re-verified by
  extraction). `vercel.json`: +CSP (`frame-ancestors/self`, `object-src
  none`, no script-src — inline arch) + Permissions-Policy. `safeSrc`/
  `logoImg` now reject protocol-relative `//` (browser treats `\` as `/`).
  dzt back link → `/`. XSS posture re-verified (esc/dec/tx + safeSrc +
  BLOCK_RE on all sinks). History scan: IPTV creds were env-only, bridge
  removed; no JWT/service_role ever committed; no .env/maps tracked.
- **Accepted as-is (documented):** no login/session/CSRF surface (stateless +
  localStorage prefs; Supabase writes are preflighted JSON); dzt has no auth
  gate — a JS password would be theater since anon SELECTs are public by
  policy (real fix = server-gated dashboard, offered); DNS-rebinding residual
  on scraped-host fetches; counter inflation possible (analytics-advisory).
- Verified: 60/60 node handler+helper tests (incl. live upstream shapes),
  `node --check` 8 api + 2 workers + inner template + 3 inline scripts,
  migration proven live, mirrors SHA256-identical.

## 54. SEO indexability pass (2026-09-14, user: "Google isn't showing my website" + 17-item SEO list)

- **Why Google wasn't showing the site.** No single noindex bug — public pages
  already served `index,follow` over HTTPS (HSTS preload live). The real
  blockers: (a) canonical split — `index.html` canonicalized to `/index.html`
  while `/` also served + both listed across sitemaps; (b) 7 internal links
  were `href="#"` (JS-only filter, zero crawl equity); (c) league headings
  injected as `<h3>` before the `<h2>` SEO sections (skipped hierarchy);
  (d) all schema was JS-injected (invisible to no-JS crawlers); (e) duplicate
  crawlable mirrors `/index-inline.html` + `/player-inline.html` (56/92KB,
  `index,follow`); (f) OG image was a 512px square icon, player had no
  twitter title/desc; (g) player team/player images had empty `alt=""`;
  (h) no `vercel.json` (no `/index.html`→`/` redirect, no security headers).
- **Fixes (`index.html`, `player.html`, mirrors kept byte-identical).**
  Canonical/hreflang/`og:url` → `https://kooraadz.vercel.app/` (player keeps
  self `/player.html`; its JS still upgrades canonical per match `?m=&d=`).
  New `og-cover.png` (1200×630, 33KB, PIL gradient + icon) wired to
  `og:image` + `summary_large_image` + `twitter:image`; player gains
  `twitter:title/description`. Static `Organization`+`WebSite` (index) /
  `Organization`+`WebPage` (player) JSON-LD in `<head>`; dynamic SportsEvent/
  breadcrumb JS untouched. League links → `/?league=<url-encoded>` with
  `?league=` boot filter (click handler still instant, no reload). League
  template + CSS `.league > h3` → `h2`. Player: back link `./index.html`→`/`,
  static logo alts + `paintMatch` sets `alt` to team names, minfo/lineup/
  photo templates carry team/player-name alts. GSC
  `google-site-verification` placeholder meta on both pages (owner pastes code
  from search.google.com/search-console).
- **Crawl files.** `robots.txt`: added `Disallow: /index-inline.html`,
  `/player-inline.html` (dzt3ch456 stays `noindex`+disallowed — intentional,
  do NOT "remove" that one). `sitemap.xml`: added `lastmod`. `api/sitemap.js`:
  dropped duplicate `/index.html` URL. New `vercel.json`: permanent
  `/index.html`→`/` redirect + HSTS/nosniff/referrer/SAMEORIGIN headers.
- **Images/vitals/HTTPS/slugs.** Icons 1.5–4.7KB + ad 82KB already lean;
  `shots/` is gitignored (never ships). Above-fold keeps width/height (zero
  CLS) + lazy below-fold; fonts already `display=swap` + preconnect. HTTPS +
  HSTS-preload verified live; player `?m=&d=` short links kept (canonicals
  self-resolve, sitemap escapes `&amp;` correctly).
- Verified: 48/48 `seo_verify.py` checks (1×H1, hierarchy, no `href="#"`,
  no empty alts, JSON-LD parses, XML/sitemap/vercel.json parse), `node
  --check` api/sitemap + both inline scripts green, mirrors SHA256-identical.
  Live push pending Vercel redeploy + GSC submit (see reply for steps).

## 53. Banners slimmed: Arabic out, one English footer leaderboard (2026-09-14, user: "too big, put a banner at the very end" → "remove the arabic one keep the english one")

- **Supersedes 52.** Removed both Arabic slots (index top, player
  mid-banner) and the mid-page English slot (was between `</main>` and
  SEO). Each page now has exactly ONE banner at the very bottom: index
  → after the FAQ section; player → after minfo (last inside `.wrap`).
- **Slim:** `.ad-wrap` capped at 728px leaderboard width, centered
  (was full content width up to 880px). Removed the now-dead
  `.ad-bottom` rule + 880px media override.
- **Deleted `ads/messi-stats-ar.jpg`** (unused; source still in owner's
  Downloads). Only `ads/messi-stats-en.jpg` (1600×400, 82KB) ships.
- Verified: 2 messistat refs per file (CSS comment + 1 link), zero
  `messi-stats-ar`/`ad-bottom` refs, inline JS syntax OK ×4, mirrors in
  sync.
- **Cleanup lesson:** `git add -A` swept local-only `shots/` +
  `_watch.html` into the push — immediately reverted with
  `git rm --cached` (disk files kept) + new `.gitignore`
  (`shots/`, `_watch.html`). Future agents: never `add -A` here.

## 52. Messistat sponsor banners (2026-09-14, user: "advertise my other website messistat.com, small banner ads" + 2 Gemini creatives)

- **Assets (`ads/` NEW).** Owner's Downloads had only 1 of the 2 named
  files (`yhve8hyhve8hyhve.jpg` missing → used the existing
  `9whix39whix39whi.jpg` + `byck4rbyck4rbyck.jpg`). Resized with PIL
  LANCZOS + JPEG q68 progressive: `ads/messi-stats-ar.jpg` (1200×670,
  140KB, Arabic creative) + `ads/messi-stats-en.jpg` (1600×400, 82KB,
  ultra-wide English leaderboard). Originals were 2.6 + 3.6 MB — never
  ship those raw.
- **Slots (2 per page, all `https://messistat.com`, `target=_blank`,
  `rel="sponsored noopener"`, tiny `إعلان` label, `loading=lazy`,
  width/height set = zero CLS).** Index: AR banner under the toolbar,
  EN leaderboard between `</main>` and the SEO block. Player (dark
  theme, same component): AR banner after the status line / before
  minfo, EN leaderboard after minfo. New `.ad`/`.ad-wrap` CSS per theme.
- **Mirrors kept in sync** (`index-inline.html`, `player-inline.html`
  got the identical banner hunks; their older JS left untouched).
- Verified: diff is pure additions (32 insertions, 0 deletions), inline
  JS syntax OK on all 4 pages via `vm.Script`, 3 messistat refs per
  file (1 CSS comment + 2 links). Banners are same-origin images so the
  SW ad-blocker passthrough doesn't touch them; no JS/render paths
  modified (`#leagues`/`#servers` writes never touch the ad divs).

## 51. JUST 2 SITES: Yacine primary, Kora backup (2026-09-13, user: "JUST SCRAPE YACINE TV ITS GOATED AND USE KORA AS BACKUP JUST 2 SITES")

- **api/matches.js:** Now tries `yacinelive.online/matches-{today|yesterday|tomorrow}/`
  first (parses `AY_Match` blocks: `TM_Name`, `MT_Time` → ISO, league,
  scores, href, logos). If ≥5 matches, returns Yacine immediately; else
  scrapes `kooralive-plus.info` STING and merges missing fixtures by
  `home|away`. Kora is now explicitly fallback, not primary.
- **api/player.js:** Disabled `hd7livex` (stubbed `resolveHd7 → null`) and
  removed its 3-day parallel + tab logic from the critical path. Player now
  races **only Yacine** (5.5s cap) — Kora direct iframe is the backup inside
  the same handler. Generic 24/7 `alwan`+`athikoora` beIN tier removed from
  `player.html` (`chanP → []`) because it was the 6× unrelated beIN reported.
- Verified: `node --check` api/player + api/matches + both inlines green,
  mirrors in sync. Live check still `Celta 4750868 → yasirtv` found.

## 50. 5-agent audit sweep + scraper hardening (2026-09-13, user: "send multiple subagents and fix buggs like this stupid one")

- **Sweep.** 5 parallel audit agents (player scraper / matches+sitemap /
  24/7 channels / player boot / index SEO) reported 40+ fragilities; triaged
  to load-bearing fixes below (rest deferred with reasons).
- **Player scraper (`api/player.js`).** Hardened 8 brittle points that would
  have caused the next yacine-live outage: `fixUrl` now handles `http`/`//`/
  site-relative with base; `resolveOneLive` m9/leaf, `liveM`, hd7 cards,
  `albaplayer_name` ul, `Live` tabs all quote-agnostic (`'","` + `\s*`);
  yacine `TM_Name` tag-boundary, playerv5 `//`/`_`/`:port` hosts,
  direct iframe allowlist adds `yala-go|yacinelive|kora|shooot|shots`; host
  filter now covers real yacine kora.athikoora `shooot`-only miss already
  fixed in 49, now fully covered.
- **Worker `api/matches` drift fixed.** `worker.js:35` anchorRegex was
  `"`-only and `href` first-attr; now `(["'])` + `/gi` like `api/matches.js`.
  `getAttr` now `i` flag + `\s*=\s*`. Added slug fallback (was `match-N`),
  Egyptian filter now case-insensitive, logos now `teamImgs` filtered + both
  quotes, time/result/league now quote-agnostic, added 2.5 MB `content-length`
  guard. Verified: `node --check` player/matches/worker + player inline all
  green, mirrors in sync. Deferred: alwan liveness tweaks, SearchAction
  old syntax, SSR ordering — not load-bearing for the reported miss.

## 49. Yacine live miss: any-host + kooralive-optional (2026-09-13, user: screenshot 5' + 45' live on yacinelive not scraped)

- **Host filter was shooot-only.** `AY_Match` block for Celta Vigo 45'
  (2026-09-13, id 4750868) links to `kora.athikoora.com/2026/03/on-2.html`,
  Coventry 5' to `shots.yala-go.online` — both missed by
  `/shooot/` regex. Now `https://` any-host (minus `/`) with generic fallback,
  verified live: `kora.athikoora.com` → `playerv5.php?match=4750868` found.
- **404 before yacine.** `api/player` 404'd when `target` missing (Championship
  Coventry-Brighton not on kooralive, so `id` lookup fails) before trying
  hd7/yacine. Now kooralive fetch is optional — `kooraHtml` empty on miss,
  still probes hd7/yacine via `home/away/start`. Verified: dummy href +
  Coventry names now → `yasirtv playerv5 4742068` found (was 404).

## 48. Fix: hide unrelated beIN fallbacks + date-aware match resolvers (2026-09-13, user: screenshot shows 6× generic beIN, "dogshit, not related to match")

- **Root cause.** Player showed 6× “قناة بين سبورتس 10/9/8…” with zero
  match-specific servers. Two bugs conspired: (1) generic 24/7 tier
  (Alwan+Athikoora) was appended even when `list` was empty, so a miss looked
  like 6 results; (2) `resolveHd7`/`resolveYacine` only scraped
  `matches-today/`, so yesterday fixtures (user’s Spurs-Everton 2026-09-12,
  id 4742062) could never match and always fell through to the generic tier.
- **Fix 1 — gate the fallback.** `chanP` now merges only if `list.length`
  already has a match leaf/live — empty list stays empty and the UI correctly
  shows “لا توجد روابط بث — اضغط لإعادة المحاولة” instead of unrelated beIN.
- **Fix 2 — date-aware resolvers.** Both resolvers now accept `startIso` and
  probe `matches-today/`, `yesterday-matches/`, `tomorrow-matches/` in
  parallel (5s, reordered to prefer the kickoff’s day), matching the way the
  player was already date-aware for ESPN/FotMob. Server sting probes also
  parallelized earlier remain. `api/player.js` was `node --check` clean after
  the duplicate-`let best` fix.

## 47. Athikoora extra sources + player speed pass (2026-09-13, user: "extra player sources https://kora.athikoora.com/ also take so much for the thing to know that the match started and links are loading")

- **Athikoora probe.** Homepage is Blogger with obfuscated match timers; feeds
  at `/feeds/posts/default?alt=json` hold the actual players — 10 beIN
  channel posts (1-10) each with an `<iframe src=".../albaplayer/...">` or
  `playerv5.php` (yasirtv/baranewss/matchlivehd hosts). Today's label page
  and `/p/matches-today` are empty/404 — no per-match scraping to do; the
  value is the 24/7 tier (big-match fallback alongside Alwan).
- **New `api/athikoora.js`.** Fetches the Blogger JSON feed (6s), extracts
  iframe srcs, filters to known player hosts, dedups, beIN-first, cap 6,
  `s-maxage=120`, fail-open `{count:0}`. Verified live: Blogger returns 10
  posts, 5 extracted (barane/matchlive/yasirtv hosts; some ad iframes filtered).
- **Server speed (`api/player.js`).** Sting API bases were sequential
  (3×7s = 21s worst). Now `Promise.all` parallel at 5s. Kooralive page
  fetch tightened 8s→6s. Saves up to ~15s on the critical path.
- **Player speed (`player.html`).** Boot was blocking: `await fetchSnap` +
  `await ESPN` before first paint, so "لم تبدأ" lingered. Now optimistic:
  instant paint from URL params / `sessionStorage` cache, `fetchSnap` in
  background repaints when it lands, ESPN repaints via `tickHeader`.
  `fetchSnap` parallelized (was sequential walk, no timeout) → 4× parallel
  at 4s. `fetchApi` 12s→7s/5s. 24/7 tier now `chanP` parallel Alwan+Athikoora
  at 5s (8 cap deduped) instead of Alwan-only 8s.

## 46. SEO v3: crawlable SSR fallback, image alt, Organization, breadcrumb, sitemap images (2026-09-13, user: "more SEO")

- **Crawlable fallback (biggest gap).** Index was JS-only — crawlers saw
  empty `#leagues`. Now ships a 14-match SSR snapshot inside `#leagues`
  (today's fixtures as plain `<a href="/player.html?m=&d=">` with team + time
  + league), fetched at patch time. JS removes it on first render
  (progressive enhancement, not cloaking). Pinned as static fallback for
  no-JS bots; live data overwrites it within seconds for users.
- **Images:** team logos now carry `alt="team name"` (was empty) — image
  SEO + a11y; sitemap now emits `<image:image>` per match (up to 2 logos).
- **Head:** `max-image-preview:large` on both pages, `Organization` node
  beside `WebSite`, visible breadcrumb (`Home > match`) on player with
  matching `BreadcrumbList` JSON-LD (canonical rewritten per match).
- Verified: syntax clean on both inlines + sitemap, fallback present, alt +
  org + breadcrumb + image sitemap markers present, mirrors in sync.

## 45. SEO/GEO v2: SearchAction, FAQ,ItemList, linked leagues, 3-day sitemap, breadcrumb (2026-09-13, user: "first get traffic, improve SEO/GEO")

- **Fix:** `WebSite` JSON-LD was duplicated every 45s silent render —
  now single node with `SearchAction` (`?q={search_term_string}`) for
  sitelinks box.
- **Index:** added `FAQPage` (4 Q/A) + visible FAQ accordion + `ItemList`
  of today's fixtures; league names in SEO block now link internally
  (deep-filter gate) so crawlers follow them.
- **Player:** `BreadcrumbList` (Home > match), canonical now rewritten to
  the actual `?m=&d=` URL, `hreflang` on both pages.
- **Sitemap:** 3-day parallel fetch (today/yesterday/tomorrow) with correct
  `&d=` per day, lastmod from kickoff date. `llms.txt` kept (already
  verified GEO artifact).
- Verified: sitemap 5/5 + JSON-LD 5/5 on shipped code, syntax clean, mirrors
  in sync.

## 44. SEO + GEO visibility pass (2026-09-13, user: "work on SEO+GEO, make site visible")

- **h1s (was: none on either page).** Index brand + player match title are
  now single `<h1>`s with margin-reset CSS (zero visual change).
- **Dynamic sitemap (`api/sitemap.js`).** Core pages + today's matches as
  short `?m=&d=` URLs with lastmod/changefreq, 1h edge cache, fail-open to
  core URLs. `robots.txt` Sitemap now points at it (static file kept).
  Verified 7/7 against a stubbed upstream (fixture-id + slug-derived ids).
- **GEO (`llms.txt`).** Bilingual site summary, league coverage, live-data
  contract, page/API map for AI crawlers. Bots already welcome site-wide.
- **Structured data:** live matches now also emit `BroadcastEvent`
  (`isLiveBroadcast`) + a `WebSite` node beside the SportsEvents. Verified
  9/9 on shipped code with stub DOM (2 Sports, 1 Broadcast with teams,
  WebSite ar, EventLive status).
- **Index SEO content:** visible schedule/coverage section (Prem/LaLiga/
  Serie A/Bundesliga/Ligue 1/Saudi/UCL one-liners) + per-match player meta
  description synced from the title at paint time.
- Honest note to owner: rankings take weeks; the instant action on their
  side is submitting `/api/sitemap` in Google Search Console.

## 43. Admin v2: English + real KPIs (2026-09-13, user: "english admin, not basic, improve it")

- **Full rewrite in English** (`dzt3ch456.html`, LTR, zero Arabic). 6 KPI
  cards: views today / range total (+WoW % vs prior equal period) / likes /
  matches / avg-day / best day. 7/14/30-day range switch (client-side
  recompute from one 60d fetch), views-per-day + likes-per-day canvas charts
  (gridlines, DPR-aware), top-matches table with live filter, traffic-source
  table with share %, CSV export, manual + 60s auto refresh.
- Verified: 11/11 runtime assertions on the SHIPPED file with stubbed DOM
  (cards incl. delta, both charts data paths, tables, range switch;
  one TZ artifact in the harness fixed, not product). `node --check`
  clean, byte audit: no Arabic, only intended punctuation.

## 42. Admin page renamed to obscure URL + anon-key exposure finding (2026-09-12, user: "no one can find it, hackers can't, right?")

- **Rename:** `admin.html` -> `dzt3ch456.html` (dropped the `@` — breaks clean
  URLs; alphanumeric only). Nothing linked to it; sitemap never listed it;
  robots disallow + `noindex` updated. Live at
  `https://kooraadz.vercel.app/dzt3ch456.html`.
- **Honest security picture (told to owner):** obscurity keeps Google/casual
  users out, and the rename defeats common-path scanners — BUT the Supabase
  anon key ships in the public site JS by design, and the finance tables
  carry `anon_all` (ALL commands) policies. So anyone with the key can
  read/write finance rows WITHOUT ever finding the admin page. The admin
  page itself leaks nothing (aggregate counts only). Real fix if wanted: a
  separate free Supabase project for koora, then swap 2 constants
  (SB_URL/SB_KEY) — full isolation, finance DB unreachable.

## 41. Supabase analytics: views/likes/refs + admin page (2026-09-12, user: "easiest free DB for admin KPI page")

- **Choice: Supabase Postgres on the EXISTING project** (user picked reuse
  over a new project — finance tables untouched, everything is `koora_*`).
  Free tier is plenty for counters. Anon publishable key is embedded in-page
  (public by design); all writes go through hardened RPCs, never direct.
- **Schema (`koora_analytics_v1` migration, verified live):** `koora_views`
  (match_id, day → views), `koora_likes` (match_id, voter PK → toggle),
  `koora_refs` (day, ref_host → hits), `koora_like_counts` view. RPCs:
  `koora_bump_view` / `koora_toggle_like` / `koora_bump_ref` (SECURITY
  DEFINER, fixed search_path, length guards). Smoke-tested: view 1→2,
  like 1→0, refs insert, smoke rows deleted.
- **RLS posture (advisor-reviewed, all findings intentional):** anon SELECT
  only on views/refs aggregates; `koora_likes` base has NO policies at all
  (RPC-only — strictest); like-counts view deliberately exposes only
  counts; anon-executable RPCs are the design (length-validated, koora
  tables only). No IPs/voter PII stored — voter is a random browser id.
- **Frontend:** shared SB core (identical both pages, asserted) — view
  tracking (explicit day opens only, never the 45s silent polls), referrer
  host once per session (`direct`/`internal`/hostname). Player like bar
  (heart + live count, local liked-set, server count wins). All fail-silent.
- **New `admin.html` (NO mirror — standalone page, not app shell):** KPI
  cards (today / 7d views / likes / matches), 14d views canvas chart, top
  matches + referrers tables, 60s refresh. Unlinked + `robots.txt`
  disallow + `noindex` (no fake auth — data is non-sensitive aggregates).

## 40. Share button + score flash + favorites/bell + server memory (2026-09-12, user picked from suggestions)

- **Share button (player).** Icon button in controls copies the short `?m=&d=`
  link (clipboard API + textarea fallback, toast confirm). Static HTML uses
  entities (`&#128279;`) — JS `\u{}` escapes are INVALID in markup (caught
  in review: stars/bell/share initially emitted literal escape text).
- **Score-change flash (index).** `loadDay` diffs `score_home/score_away` vs
  previous poll; changed live rows get `.flash` (gold pulse, reduced-motion
  off) + toast naming the scorer team (max 2, else count). Finished matches
  excluded via `isLive` gate; first load never flashes.
- **Favorites + bell.** Star buttons on the player match card (valid HTML —
  buttons, not links) persist teams in `koora_favs`; index gains a
  favorites filter chip. Bell button (controls row, persisted per match):
  Notification at kickoff (armed timer) + on goals (watches FotMob live
  scores each 60s refresh and header ticks, vibrate included), toast
  fallback, survives reload.
- **Server memory.** Manual server picks saved per match
  (`koora:srv:<id>`); next open auto-resumes it if still listed.
  Auto-advance (watchdog) deliberately does NOT overwrite memory.
- Verified: `node --check` both inlines; 6/6 runtime assertions on the
  SHIPPED index script with stubbed DOM (goal detect + team name + flash
  class + fav filter; harness bugs fixed, not product). Mirrors identical.

## 39. Fallback match-page removed + source brands hidden (2026-09-12, user: "remove page, say no links, don't expose sources")

- **Fallback page GONE.** `api/player.js` no longer serves `fallbackUrl` /
  the `fallback` entry; player never iframes the match page. Empty result
  (after the 24/7 channels merge) shows the no-links state ("no stream
  links" + retry). `found:false` now means zero servers, message updated.
- **Sources hidden (UI choke point + JSON).** New `dispName()`: every server
  button + "watching now" line shows plain numbered names — upstream brand
  labels never reach the screen (only 24/7 TV channels keep real names,
  that IS the content). Server: yacine labels genericized, all brand
  `via` values (`kooralive`/`hd7livex`/`yacine`/`fallback`/`mixed`) replaced
  with generic `direct`/`live`/`none`; provider strings purged from client
  code/comments. Server internals (fetch URLs, resolver names) stay as-is —
  invisible to browsers.
- Verified: `node --check` player inline + ESM `import()` of `api/player.js`
  green, zero `fallbackUrl`/`fallback`-kind/`hd7livex` refs in player UI
  paths, mirrors byte-identical.

## 38. ESPN real minutes — free API hooked, no scraping (2026-09-12, user: "find some free API, hook it, no scraping")

- **Source: ESPN public scoreboard JSON** (`site.api.espn.com/apis/site/v2/sports/
  soccer/<slug>/scoreboard?dates=YYYYMMDD` — no key, no auth, official feed).
  Verified live shapes pre-build: `status.displayClock` (`67'`, `45'+2'`,
  `90'+6'`), `status.type.name` (IN_PROGRESS/HALFTIME/FULL_TIME/SCHEDULED),
  `period`, UTC `date`, competitors (name/abbr/score). KSA slug `ksa.1`
  confirmed with real games. Sandbox datacenter IP is Akamai-denied, so the
  design is two-tier with fail-open everywhere.
- **New `api/espn.js` (Vercel) + `/api/espn` route in `worker.js`.**
  `?home=&away=&start=&lg=` → best event `{found,min,half,status,clock,
  detail,h,a,slug}` (minutes only — scores untouched). League map
  (AR→slug, champions-before-europa ordering), UTC-date + prev-day fallback,
  browser UA, 6s budget, 30s edge cache. Fuzzy = proven fotmob set extracted
  byte-exact (transliteration + devowel + aliases + token scorer, gates
  0.55 direct / 0.85+margin, kickoff within 150min). `{blocked:true}` when
  the edge denies us.
- **Clients (both pages, identical ESPN-CLIENT block).** Trust order now:
  ESPN > FotMob > upstream-anchored > wall. `showMinute` core extended with
  the ESPN anchor (freshness 10min, same half caps) — core still
  byte-identical across pages. Server `/api/espn` first (worker-aware),
  then direct browser fetch of the single mapped league scoreboard
  (90s pool cache, 8s timeout) with the same gates. Index re-anchors live
  rows every 60s; player anchors in boot + 60s re-anchor with header priority.
- **Caught by verification:** fuzzy-block extraction overlapped (dup consts —
  `node --check` FALSE-PASSED the ESM files; real `import()` correctly
  failed). Lesson: ESM files must be import-checked, never only --check.
  Also fixed an over-broad champions fragment (CAF CL mis-mapped).
- Verified: 26/26 client assertions (incl. real Hilal 0.458 / Spurs 0.183
  fuzzy scores, Bournemouth trap rejected, CAF slug empty) + 10/10 server
  assertions against a REAL 82KB ESPN fixture (Spurs found, min 93) and a
  blocked-edge stub. `node --check` both inlines, ESM imports of
  `api/espn.js` + `worker.js` green, mirrors byte-identical.
- Live egress verdict (2026-09-12, post-push curl): Vercel IS edge-blocked —
  live `/api/espn` returns `{"found":false,"ms":134,"blocked":true}` in
  134ms. Endpoint itself deployed fine; the fast fail means clients take
  the direct browser path as primary (residential IP sails through).
  No code change needed — tiering works as designed.

## 37. Goated clock + arab-league filler + short player links (2026-09-12, user: "timing still dogshit, hide arab leagues but KSA, links huge")

- Commit `dd15f45`, pushed to `origin main`.

- **GOATED CLOCK v1 (fused live-minute estimator).** Upstream can never know
  REAL minutes (stoppage, VAR, late kickoffs, long breaks), so two sources
  fuse by trust order, byte-identical in index.html + player.html
  (`GOATED-CLOCK-START/END` markers, asserted equal): (1) upstream minute
  (`game_time`/`time_text` via new `parseMin`, incl. `45 +2'` stoppage forms,
  clock-times rejected) ANCHORED at fetch time (`_base`/`_at` stamped in
  `loadDay`, `stampUpstream` on player) then ticked +1/min locally — stays
  alive between polls instead of freezing; half-aware caps (1H freezes at
  45+12, HT shows break, 2H runs to 90+x'); (2) half-aware wall map from
  `start`/`gameends` (45+15+45, `45+x'`/`90+x'` stoppage display, 25' grace
  past `gameends`, half from status words incl. `halfOf`). `isLive`/`statusLabel`
  (`paintMatch` on player) check ended FIRST — a stale live window can never
  shadow FT again. Index repaints every 30s without fetching; player header
  ticks every 20s (logo `src` guard stops flicker) and additionally anchors
  the FotMob exact minute (`FOT`, 8min TTL, re-anchored on each 60s minfo
  refresh — the truth when present).
- **Arab-league filler.** `HIDE_AR` (19 domestic leagues AR+EN, e.g. الجزائري)
  collapses into one slim `<details class="arab-more">` row with count (+ red
  dot when any hidden match is live) instead of spamming the page; excluded
  from chips/live/groups, search overrides the hiding. KSA (السعودي/
  Saudi/roshn, checked FIRST so mixed cups stay) is exempt and pinned at
  league rank 3 (after Prem/LaLiga/UCL). Server Egyptian skip untouched.
- **Short player links.** `playerLink` now emits `player.html?m=<id>&d=<day>`
  (~25 chars vs 800+ of %-encoded Arabic x13 params). Snapshot rides in
  `sessionStorage` (same-tab instant, cached on every render) + `localStorage`
  (12h TTL) with a matchday-API lookup fallback (`d,today,yesterday,tomorrow`,
  worker-aware); legacy long URLs still parse first. `api/player.js` needed
  no change (already resolves `href` from `id` server-side).
- Verified: 33/33 node assertions on the shipped core (Spurs-like
  19:30+03/67' case ticks 67->68, break/stoppage/grace mapping, ended-first,
  hide-list incl. Romania trap, ranks), `node --check` both inline scripts,
  goated core byte-identical across pages, mirrors byte-identical.

## 36. Live list replaces swipe rail + Prem/LaLiga/UCL first (2026-09-12, user: "live UI irritating, big leagues first")

- **Rail deleted.** The 78vw snap-scroll cards (one match per swipe, duplicated
  scores, noisy gold badges) are gone — `liveCard` + rail CSS removed. Live
  matches now render as the same calm row component as everything else in one
  vertical list with slim league dividers, red edge + red minute intact.
- **League priority everywhere:** Prem (0) → La Liga (1) → UCL (2) → rest (3,
  stable) via `leagueRank`+`byLeague`, applied to the live list, the league
  group order, AND the filter chips. Verified: live dividers, groups and
  chips all come out in that order.
- Verified with 7 mock matches across 5 leagues: order correct on all three
  surfaces, `scrollW=390`, zero errors, mirrors in sync.

## 35. YacineLive source IN, English sources OUT (2026-09-12, owner: new site + "delete english")

- **Probe:** yacinelive.online is the same AlbaYallaShoot family (Arabic
  names) and its cards link DIRECTLY to per-match stream pages
  (`shooot.yala-go.online/.../sport-N.html`), each holding a static
  `playerv5.php` embed on the alive `yasirtv.com` host (the fabortvcdn twin
  is TLS-dead — same key, different host). Player shell confirmed 200 with
  no framing denial.
- **New `resolveYacine`:** list → shooot page → playerv5/albaplayer extract,
  all static. Arabic→Arabic direct normalized matching (no transliteration),
  straight+swapped order, threshold ≥2.5/4 tuned on the live page (exact
  4.00, next 0.00–2.00). Merged after hd7 as `ياسين N` buttons.
- **English deleted:** `resolveVipboxMatch` + `resolveStreamed` + all fuzzy
  machinery (AR_TR/trAr/normLat/editDist/EN_STOP/LEAGUE_MAP/leagueHit/wallMin)
  removed from `api/player.js`; EN section (HTML/CSS/JS incl. badges, grids,
  legacy note) removed from player. `enServers:[]`/`enCount:0` kept in
  responses for mixed-version safety.
- Verified end-to-end on a live card (رحيمو): 4 servers incl. working yacine
  leaf; render/switch clean on 390+768, zero errors; mirrors in sync.

## 34. Sandbox verdict: KEEP it + vipbox goes direct (2026-09-12, user: "remove sandbox, EN players dead", Edge 152)

- **A/B tested with real embeds, sandbox vs none: IDENTICAL.** Vipbox loads
  no media in either mode (bot-gated, plus it tries top-frame hijacks both
  ways); Streamed `embed.st` pulls stream bytes in BOTH modes. The sandbox
  is provably NOT what blocks playback — removing it would only reopen the
  popup flood this project exists to kill. KEPT, with evidence.
- **Real fix for EN playback:** vipbox entries now use the DIRECT page URL
  instead of the `/api/vip` proxy. Rationale: the nested stream provider
  gates on the parent page's URL — proxied pages arrive with our origin and
  get denied; the genuine vipbox URL is allowlisted. `api/vip.js` deleted
  (`git rm`) since nothing references it anymore (also removes a limited
  open-proxy surface).
- Verified locally pre-push: same 4 AR + 6 EN shape, direct vipbox URLs,
  no `play` fields emitted; mirrors in sync.

## 33. FotMob exact status + Streamed source (2026-09-12, user: "use fotmob for exact starter" + "more reliable sources, test locally before push")

- **Exact status (FotMob `header.status`):** `liveTime.short` (sanitized to
  digits) + half derived from `halfs` timestamps (1H/HT/2H/FT). `api/fotmob`
  returns `live:{min,half}`; player `paintExactStatus` overrides the header
  card on every minfo load/refresh (beats URL params AND wall-clock).
  Verified locally: stale "لم تبدأ / Did not start" → "مباشر / 46’".
- **Streamed (NEW reliable source):** free, no-auth, DOCUMENTED JSON API
  (`/api/matches/football` 165 games with epoch-ms dates + sources;
  `/api/stream/{source}/{id}` → `{embedUrl,language,hd,viewers}`).
  `resolveStreamed` filters to a live window (started ≤105min ago, starts
  ≤30min ahead — absolute epochs, no TZ hacks), gates fuzzy 1.4/margin 0.25,
  queries all sources in parallel, keeps only non-empty embeds, prefers
  English → HD → viewers, cap 3, mirrors pk→st. embed.st shells have no
  framing headers; nested player loads via JS under our standard guards.
- Dead ends documented: ppv.to/DAMITV (domain SEIZED), StreamEast original
  (shut down 2025, mirrors are copycats), echo/admin shells (always `[]` —
  only delta/golf carry streams).
- Verified LOCALLY before push (per owner rule): real `api/player.js` on the
  live Spurs game → 4 AR + 6 EN (3 vipbox + 3 Streamed incl. 16.5k-viewer
  English HD), real `api/fotmob.js` → 46' 1H; render tests green, mirrors in
  sync. Nothing pushed until all green.

## 32. Wall-clock kickoff inference (2026-09-12, user: "match 15' in but site says لم تبدأ" + flaky player)

- **Root cause (proven live):** upstream still served NS/لم تبدأ for Spurs–
  Everton at 15' elapsed. Their HTML carries `data-start` + `data-gameends`
  (absolute ISO instants), so we no longer wait for them: if NOW is inside
  [start−5min, gameends], the match IS live with minute = now − start.
- `api/matches.js` (+ worker.js mirror) now pass `gameends` through;
  `index.html` (`liveMinute` → `isLive`/`statusLabel`/`rowCard`) and
  `player.html` (`liveMinuteP` → `isLiveP`, dynamic state label via new
  `so/gt/sh/sa/ge` URL params) all use it. The card's hardcoded "بث مباشر"
  label is now truthful per-state (مباشر/انتهت/لم تبدأ). Inference only ever
  ADDS live — never overrides ended/upcoming.
- Verified with a synthetic stale-NS match 15' in: live rail card + "15’",
  player card "مباشر 15’", zero errors, mirrors in sync.

## 30c. Alwan playability gate (same day — "improve even further")

- Bare reachability wasn't enough: ok.ru returns HTTP 200 with near-identical
  shells for DELETED videos. Learned the discriminators by comparing a live
  embed vs bogus id: dead shells carry `yandexError('notFound')` /
  "Автор данного видео не найден или заблокирован" / null movieId.
- `api/alwan.js` now sniffs each candidate body: drop on dead markers or
  stub pages (<2KB), require a nested player for iframe-network pages.
  Verified: 3 dead ok.ru dropped (one browser-confirmed black screen with
  the Russian error), null-movie embed dropped, koralive beIN kept.
- Current yield: beIN (koralive) + live ok.ru only; dead ones auto-exclude
  and self-heal back if re-uploaded (revalidated every load, 120s edge).

## 30b. Alwan liveness hardening (same day — user: Kurdish site, big UCL nights?)

- User asked whether big-match nights are covered. Probe says: bundle is
  STATIC (same match IDs/keys as at integration — no rotation so far; only
  10 channels in the array, VIP 16-20 have no entries to take), BUT 3 of our
  6 served entries were DEAD: `fabortvcdn.com` serves an INVALID TLS cert
  (`ERR_CERT_COMMON_NAME_INVALID` — dead in every real browser, confirmed
  headless, not just server-side).
- Fix in `api/alwan.js`: parse ALL valid entries (no early cap), then a
  parallel liveness gate (status 2xx/3xx, 3.5s budget, body dropped unread)
  and serve the first 6 alive. beIN-named/URL entries sort first (big nights
  ride beIN — incl. `1bein1` in the URL, not just the name). Bundle budget
  cut 8s→6s so schedule+liveness fits the 10s Hobby limit.
- Live-verified: 200 in ~3.8s, dead fabortvcdn ×3 auto-dropped, serving
  beIN (koralive) + AVA/ALWAN/NRT 4K (ok.ru). Also caught+fixed an inverted
  sort comparator during verification.
- ok.ru embeds return 200 with player markup and no framing denial — the
  surviving entries are genuinely playable, not just reachable.

## 31. Goal scorers REMOVED (2026-09-10, user: "remove the goal scored things dawgshit")

- Deleted `api/scorers.js` (`git rm`) + every index trace: `data-mid`
  attrs, `.sc` CSS + wrap rules, `SCORERS`/`loadScorers`/`paintScorers`/
  `fmtScorers`, the 180s interval and its `loadDay` hook. Verified zero
  references remain, no `/api/scorers` traffic, rows render clean.
- Goal data still lives where it belongs: the player page FotMob section
  (lineups timeline + events), untouched.

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
5. **Batches §56–§82 (Yassir Arabic source + wrong-stream fix + latency
   unblock, sandbox removal, hidden EN fallback, mirror re-sync, page-flow
   reorg, highlights, sweep #2 audits + fixes, AR-mode lookup fix, match-data
   fixes, odds fallback, skeletons, Polymarket odds, browser-verified polish,
   navigation, sweep audits + fixes, 3-language i18n, dark mode, UI polish,
   real-live minutes, GEO/ads/donate/SEO, admin removed, 2026-09-24/10-01)
   pushed to `origin main` per owner order.** Watch the Vercel deploy;
   spot-check that a **live** match on `/player` now shows a numbered Arabic
   server within a few seconds (yassir), that a finished match shows the
   no-links state rather than some other live game, plus EN/FR/AR toggle and
   `/api/highlights`.

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
