"""One-time login: prints a Telethon StringSession for GitHub Secrets.
Run LOCALLY (it asks for your phone number + the code Telegram sends you):

    pip install telethon
    python scripts/tg_login.py

Then paste the printed line into the TG_SESSION secret (or send it to whoever
manages the repo and they will add it). After that the bridge downloads GIFs
and posts them as real animations, on its own, forever.

NOTE: this needs to be interactive. Telegram sends a login code to your phone,
so no CI runner and no bot can do this step for you.
"""
import sys

try:
    from telethon import TelegramClient
    from telethon.sessions import StringSession
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
client.connect()
# start() is what actually sends the code / asks for the password. Without
# this the session saved below is NOT authorized and the bridge cannot read
# anything - the previous version of this file had that bug.
try:
    client.start()          # asks: phone number -> login code -> 2FA password
except KeyboardInterrupt:
    print('\ncancelled')
    sys.exit(1)

me = client.get_me()
print('\nlogged in as %s (id %s)' % (getattr(me, 'username', None) or me.first_name,
                                     me.id))
print('\n=== COPY THIS INTO THE TG_SESSION SECRET (one line) ===')
print(client.session.save())
print('=== END ===')
print('\nSecrets needed: TG_API_ID=%d, TG_API_HASH=<the hash above>, '
      'TG_SESSION=<the line above>' % api_id)
client.disconnect()