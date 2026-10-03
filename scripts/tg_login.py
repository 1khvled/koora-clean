"""One-time login: prints a Telethon StringSession for GitHub Secrets.
Run LOCALLY (it asks for your phone number + the code Telegram sends you):

    pip install telethon
    python scripts/tg_login.py

Then: join the private channel (+X4KcXCUFXPIxN2Q6) with that same account
at least once — or let tg_news.py auto-join on first run.
"""
from telethon.sessions import StringSession
from telethon.sync import TelegramClient

api_id = int(input('my.telegram.org api_id: ').strip())
api_hash = input('my.telegram.org api_hash: ').strip()
with TelegramClient(StringSession(), api_id, api_hash) as client:
    print('\n=== COPY THIS INTO THE TG_SESSION SECRET (one line) ===')
    print(client.session.save())
    print('=== END ===')
