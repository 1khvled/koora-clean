# Telegram news bridge — setup (5 minutes)

Automated poster: reads `@Offsideahdaff` (Arabic, as-is) + the private
Kurdish channel (auto-translated to Arabic, **no LLM needed** — free
translation APIs with fallbacks), posts text + photo to **your** channel
via your bot, every 20 minutes. Dedupes so nothing posts twice.

## 0. URGENT: revoke the exposed token

You pasted the bot token in chat. Anyone who saw it can control your bot.
In BotFather: `/revoke` → pick the bot → use the **new** token below.

## 1. Bot admin in YOUR channel

1. Create/open your channel (public `@name` or private).
2. Add the bot as **administrator** (post messages permission).
3. Note the destination: `@channelname`, or the numeric id (`-100...` —
   get it by forwarding any channel post to `@userinfobot`).

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
- Nothing secret is ever committed — the workflow reads Secrets only.
