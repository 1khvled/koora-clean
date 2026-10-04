# Telegram news bridge — setup (5 minutes)

Automated poster: reads `@Offsideahdaff` (Arabic, as-is) + the private
Kurdish channel (auto-translated to Arabic, **no LLM needed** — free
translation APIs with fallbacks), posts text + photo to **your** channel
via your bot, every 20 minutes. Dedupes so nothing posts twice.

## Where it stands (verified 2026-10-04)

| Piece | State |
|---|---|
| Bot token | **works** — `@messistatBOT`, verified with `getMe` |
| Repo | private; `TELEGRAM_BOT_TOKEN` + `TARGET_CHAT` already set as Actions secrets |
| Target chat `1759675108` | **works** — `getChat` OK, type `private` (you pressed Start) |
| Reader credentials | still missing (`TG_API_ID` / `TG_API_HASH` / `TG_SESSION`) — step 2 |

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

## 2. Telegram API credentials (reader account)

1. Go to https://my.telegram.org → log in → **API development tools** →
   create an app → copy **api_id** + **api_hash**.
2. Locally once:
   ```
   pip install telethon
   python scripts/tg_login.py
   ```
   Enter api_id, api_hash, your phone number, then the login code.
   It prints a one-line session string.
3. With that same account, open the private invite
   `https://t.me/+X4KcXCUFXPIxN2Q6` once (or let the bridge auto-join).

## 3. GitHub Secrets (repo → Settings → Secrets → Actions)

| Secret | Value |
|---|---|
| `TG_API_ID` | api_id from step 2 |
| `TG_API_HASH` | api_hash from step 2 |
| `TG_SESSION` | session string from step 2 |
| `TELEGRAM_BOT_TOKEN` | the NEW bot token from step 0 |
| `TARGET_CHAT` | `@channelname` or `-100...` from step 1 |
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
