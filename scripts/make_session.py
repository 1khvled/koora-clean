# -*- coding: utf-8 -*-
"""One-time helper: log in with your Telegram account and print the session
string to paste into the TG_SESSION Actions secret.

Run it on YOUR machine (not on a server):
    pip install telethon
    python scripts/make_session.py

It asks for your phone number and the login code / password, prints one line,
and stores nothing on disk. Paste the printed line into the repo secret
TG_SESSION. Delete this file afterwards if you prefer.
"""
import sys


def main():
    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession
    except ImportError:
        print('Need Telethon first:  pip install telethon')
        return 1
    print('Get api_id / api_hash from https://my.telegram.org -> API '
          'development tools.')
    try:
        api_id = int(input('api_id: ').strip())
    except ValueError:
        print('api_id must be a number.')
        return 1
    api_hash = input('api_hash: ').strip()
    if not api_hash:
        print('api_hash is required.')
        return 1
    # in-memory session: nothing is written to disk
    client = TelegramClient(StringSession(), api_id, api_hash,
                            device_model='koora-news', system_version='1.0',
                            app_version='1.0', lang_code='en')
    client.connect()
    # telethon prompts for phone number, then the login code / 2FA password
    try:
        client.start()
    except KeyboardInterrupt:
        print('cancelled')
        return 1
    me = client.get_me()
    print('')
    print('logged in as: %s (%s)' % (getattr(me, 'username', None), me.id))
    print('')
    print('--- paste this whole line into the TG_SESSION secret ---')
    print(client.session.save())
    print('--- end ---')
    print('Then add the two other secrets: TG_API_ID=%d and TG_API_HASH=%s'
          % (api_id, api_hash))
    client.disconnect()
    return 0


if __name__ == '__main__':
    sys.exit(main())