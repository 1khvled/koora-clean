"""One-time login: prints a Telethon StringSession for GitHub Secrets.

Run LOCALLY (it asks for your phone number + the code from your Telegram app):

    python scripts/tg_login.py

Paste the printed line into the TG_SESSION secret. After that the bridge
downloads GIFs and posts them as real animations, on its own, forever.

This MUST be interactive: Telegram sends a login code to your phone, so no CI
runner and no bot can do this step for you.

Two bugs were fixed here on 2026-10-04 after it wasted a successful login:
  * it used the async client, so connect()/get_me() returned coroutines and the
    script died with "'coroutine' object has no attribute ..." AFTER signing
    in - losing the session;
  * it printed a friendly message before the session line, so any later error
    also lost it.
It now uses the blocking client and prints the session first.
"""
import sys

try:
    from telethon.sessions import StringSession
    from telethon.sync import TelegramClient       # blocking, no await needed
except ImportError:
    print('Need Telethon first:  pip install telethon')
    sys.exit(1)

api_id = input('my.telegram.org api_id: ').strip()
api_hash = input('my.telegram.org api_hash: ').strip()
try:
    api_id = int(api_id)
except ValueError:
    print('api_id must be a number.')
    sys.exit(1)
if not api_hash:
    print('api_hash is required.')
    sys.exit(1)

client = TelegramClient(StringSession(), api_id, api_hash,
                        device_model='koora-news', system_version='1.0',
                        app_version='1.0', lang_code='en')
# start() blocks and prompts for phone -> login code -> 2FA password.
client.start()

# The session line comes FIRST and is flushed immediately: nothing after this
# point can lose it.
session = client.session.save()
print('\n=== COPY THIS INTO THE TG_SESSION SECRET (one line) ===')
print(session)
sys.stdout.flush()

try:
    me = client.get_me()
    who = getattr(me, 'username', None) or getattr(me, 'first_name', '') or '?'
    print('=== END ===')
    print('\nsigned in as: %s' % who)
except Exception as e:
    print('=== END ===')
    print('(could not read the account name: %s - the session above is still '
          'fine)' % type(e).__name__)
try:
    client.disconnect()
except Exception:
    pass
print('\nSecrets: TG_API_ID, TG_API_HASH, TG_SESSION (the line above).')