# Telegram news bridge — setup (2 minutes)

Automated poster: reads the public `@Offsideahdaff` (Arabic, as-is, text +
photo) through its login-free preview and posts it to **you** via
`@messistatBOT`, every 20 minutes. Dedupes so nothing posts twice.
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

`@messistatBOT` now reaches `1759675108`, which is a **private chat** (your own
account), so news is delivered to you directly — no admin step needed.

If you would rather have it post in a channel: create/open the channel, add
`@messistatBOT` as **administrator with "post messages"**, then get the real id
(forward any channel post to `@userinfobot` → `id: -100xxxxxxxxxx`) and put it in
`TARGET_CHAT` (Actions secret + `scripts/tg_config.json`). The bridge posts
wherever `TARGET_CHAT` points, so nothing else changes.

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
| `TARGET_CHAT` | `1759675108` (already set ✅) |
| `TG_API_ID` | only for the optional Kurdish source (step 2) |
| `TG_API_HASH` | only for the optional Kurdish source (step 2) |
| `TG_SESSION` | only for the optional Kurdish source (step 2) |
| `MYMEMORY_KEY` | optional, free key = bigger translate quota |

## 4. Run it

Actions tab → **telegram-news-bridge** → **Run workflow**.
Check your channel. The schedule takes over (every 20 min).

## Notes

- Translation chain: MyMemory (if key) → Google unofficial (ckb/ku/auto)
  → original text. Short news blurbs translate reliably; no LLM, no cost.
- Only text + first photo repost; videos/albums are skipped, state in
  `scripts/tg_state.json` (auto-committed, max 10 posts/run).
- Secrets win over the repo config, so a leaked/rotated token is fixed by
  editing the secret alone.
- Preflight runs every time: bad token = red run (fix it), bot not in the chat
  yet = clean skip with the exact fix printed in the log.
