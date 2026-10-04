# Telegram news bridge — setup (2 minutes)

Automated poster: reads the public source channel (Arabic, as-is) through
its login-free preview and posts it to **you** via `@messistatBOT`, every
5 minutes. Dedupes so nothing posts twice. Every post carries **our M10
logo**: source branding is swapped out, real photos keep our small watermark,
and the source is never named, mentioned, tagged, or linked.
**No login, no extra secrets needed** — the bot token + target you already
set are enough. Verified live 2026-10-04 (message delivered, photo + Arabic
text intact).

## Where it stands (verified 2026-10-04)

| Piece | State |
|---|---|
| Bot token | **works** — `@messistatBOT`, verified with `getMe` |
| Repo | private; `TELEGRAM_BOT_TOKEN` + `TARGET_CHAT` already set as Actions secrets |
| Target chat `1759675108` | **works** — `getChat` OK, type `private` (you pressed Start) |
| Reader credentials | optional upgrade, not needed (step 2) |

Until both rows below are done the cron **skips** (green, no posts) instead of
failing every 20 minutes. The token is committed in `scripts/tg_config.json` on
purpose (your call); if GitHub secret-scanning ever revokes it, replace it in
`tg_config.json` + the Actions secret and the bridge picks it up again.

## 1. Bot → destination (done, verified)

News goes to the **@messistatdotcom channel** (`-1004345140678`). Verified:
`getChat` OK, bot is administrator with `can_post=True`, test post delivered
then removed. Both `scripts/tg_config.json` and the `TARGET_CHAT` secret point
there. Owner's own id is `5625295907` (kept for reference; not the target).

## 2. Optional upgrade: the private Kurdish source (skip if you don't need it)

Why it is optional: a bot can *send* anywhere but can only *read* channels it
can see. The public `@Offsideahdaff` has a login-free preview, so the bridge
reads it with zero secrets. The private Kurdish channel
(`https://t.me/+X4KcXCUFXPIxN2Q6`) has no preview — only a real logged-in
account can read it, which is what these three secrets are for. Skip this
whole step and everything else keeps working.

1. Go to https://my.telegram.org → log in → **API development tools** →
   create an app → copy **api_id** + **api_hash**.
2. Locally once:
   ```
   pip install telethon
   python scripts/tg_login.py
   ```
   Enter api_id, api_hash, your phone number, then the login code.
   It prints a one-line session string (`TG_SESSION`).
3. With that same account, open the private invite
   `https://t.me/+X4KcXCUFXPIxN2Q6` once (or let the bridge auto-join).
4. Add `TG_API_ID` / `TG_API_HASH` / `TG_SESSION` to repo
   Settings → Secrets → Actions. The next run pulls the Kurdish channel too
   (auto-translated to Arabic, no LLM).

## 3. GitHub Secrets (repo → Settings → Secrets → Actions)

| Secret | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | bot token (already set ✅) |
| `TARGET_CHAT` | `-1004345140678` = @messistatdotcom channel (bot is admin, can post ✅) |
| `TG_API_ID` | only for the optional Kurdish source (step 2) |
| `TG_API_HASH` | only for the optional Kurdish source (step 2) |
| `TG_SESSION` | only for the optional Kurdish source (step 2) |
| `MYMEMORY_KEY` | optional, free key = bigger translate quota |

## 4. Run it

Actions tab → **telegram-news-bridge** → **Run workflow**.
Check your channel. The 5-minute schedule takes over (GitHub cron + cron-job.org backup).

## Notes

- Translation chain: MyMemory (if key) → Google unofficial (ckb/ku/auto)
  → original text. Short news blurbs translate reliably; no LLM, no cost.
- Only text + first photo repost; videos/albums are skipped, state in
  `scripts/tg_state.json` (auto-committed, max 10 posts/run).
- Secrets win over the repo config, so a leaked/rotated token is fixed by
  editing the secret alone.
- Preflight runs every time: bad token = red run (fix it), bot not in the chat
  yet = clean skip with the exact fix printed in the log.

## 5. Backup trigger: cron-job.org every 5 min (so posts never wait on GitHub's scheduler)

GitHub's own cron can lag on private repos. This makes cron-job.org poke the
workflow every 5 minutes as well. Double runs are harmless: the `tg-news`
concurrency group serialises them and the state file dedupes, so the second
run finds nothing new and exits.

### Step A — one token (2 min, on github.com, only you can do this)

1. GitHub → your avatar → **Settings** → **Developer settings** (bottom left) →
   **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Token name: `cron-dispatch` · Expiration: 90 days (or No expiration).
3. **Repository access** → *Only select repositories* → pick `koora-clean`.
4. **Permissions** → *Account permissions*: nothing. *Repository permissions* →
   **Actions** → **Read and write**. Nothing else.
5. **Generate token** → copy it (starts with `github_pat_`). GitHub never shows
   it again. You can revoke it anytime on the same page.

### Step B — the cron job (3 min, on cron-job.org)

1. Log in at https://cron-job.org → **Create cronjob**.
2. **URL:** `https://api.github.com/repos/1khvled/koora-clean/actions/workflows/telegram-news.yml/dispatches`
3. **Request method:** POST. **Request body**, type JSON:
   `{"ref":"main"}`
4. **Headers** (advanced settings → add each):
   - `Accept: application/vnd.github+json`
   - `X-GitHub-Api-Version: 2022-11-28`
   - `Content-Type: application/json`
   - `Authorization: Bearer github_pat_...` (the token from Step A)
5. **Schedule:** every 5 minutes. Save, then press **Run now** once and check
   the channel + the repo's Actions tab — you should see a new run within a minute.
6. Optional: turn on cron-job.org failure notifications so you hear about it if
   the token expires.

### Honest cost note

~290 runs/day × ~1 min each ≈ 8,600 Actions minutes/month, but a private repo
only includes 2,000 free minutes — past that, runs stop until the monthly
reset (unless you add billing). If that bites: tell me and I'll either slim
the workflow further or move the token into Secrets-only and flip the repo
public (public repos get unlimited free minutes).
