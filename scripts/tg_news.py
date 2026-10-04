"""Telegram news bridge: reads two source channels (MTProto user session),
translates the Kurdish one to Arabic (free APIs, no LLM needed),
posts text+photo to the owner's channel via Bot API. Dedupes via state file.

Env (GitHub Secrets, never committed):
  TG_API_ID, TG_API_HASH      from https://my.telegram.org
  TG_SESSION                  StringSession, generated once via tg_login.py
  TELEGRAM_BOT_TOKEN          bot token (bot must be ADMIN in target channel)
  TARGET_CHAT                 @channelusername or -100... id
  MYMEMORY_KEY                optional, free key = higher translate quota
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

STATE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tg_state.json')
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tg_config.json')


def file_config():
    """Repo-committed fallback (owner order) when Secrets are absent."""
    try:
        with open(CONFIG_PATH, encoding='utf-8') as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except Exception:
        return {}


FILE_CFG = file_config()


def env_or_cfg(env_key, cfg_key):
    v = os.environ.get(env_key, '').strip()
    if v:
        return v
    try:
        return str(FILE_CFG.get(cfg_key, '') or '').strip()
    except Exception:
        return ''
SOURCES = [
    {'key': 'offside', 'ref': 'Offsideahdaff', 'name': 'Offside', 'translate': False},
    {'key': 'k2', 'ref': '+X4KcXCUFXPIxN2Q6', 'name': 'Kurdish source', 'translate': True},
]
MAX_POSTS_PER_RUN = 10
FETCH_LIMIT = 25


def http_get_json(url, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8', 'replace'))


def translate_ku_ar(text):
    """Kurdish (Sorani) -> Arabic. Chain of free endpoints, original on failure."""
    text = (text or '').strip()
    if not text:
        return text
    if len(text) > 3500:
        text = text[:3500]
    mm_key = os.environ.get('MYMEMORY_KEY', '').strip()
    # 1. MyMemory (free; key raises quota)
    try:
        q = {'q': text, 'langpair': 'ckb|ar'}
        if mm_key:
            q['key'] = mm_key
        d = http_get_json('https://api.mymemory.translated.net/get?' + urllib.parse.urlencode(q))
        out = ((d.get('responseData') or {}).get('translatedText') or '').strip()
        if out and out.lower() != text.lower():
            return out
    except Exception:
        pass
    # 2. Google unofficial (short texts; sl=ckb then ku then auto)
    try:
        for sl in ('ckb', 'ku', 'auto'):
            u = ('https://translate.googleapis.com/translate_a/single?client=gtx'
                 '&sl=' + sl + '&tl=ar&dt=t&q=' + urllib.parse.urlencode({'x': text})[2:])
            d = http_get_json(u)
            out = ''.join(seg[0] for seg in (d[0] or []) if seg and seg[0]).strip()
            if out and out != text:
                return out
    except Exception:
        pass
    return text


def bot(method, payload=None, files=None, timeout=60):
    token = env_or_cfg('TELEGRAM_BOT_TOKEN', 'bot_token')
    if not token:
        raise RuntimeError('TELEGRAM_BOT_TOKEN missing')
    url = 'https://api.telegram.org/bot' + token + '/' + method
    if files:
        import uuid
        boundary = uuid.uuid4().hex
        body = b''
        for k, v in (payload or {}).items():
            body += ('--' + boundary + '\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n'
                     % (k, v)).encode('utf-8')
        for k, (fname, data) in files.items():
            body += ('--' + boundary + '\r\nContent-Disposition: form-data; name="%s"; filename="%s"\r\n'
                     'Content-Type: application/octet-stream\r\n\r\n' % (k, fname)).encode('utf-8') + data + b'\r\n'
        body += ('--' + boundary + '--\r\n').encode('utf-8')
        req = urllib.request.Request(url, data=body,
                                     headers={'Content-Type': 'multipart/form-data; boundary=' + boundary})
    else:
        req = urllib.request.Request(url, data=json.dumps(payload or {}).encode('utf-8'),
                                     headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode('utf-8', 'replace'))
    except urllib.error.HTTPError as e:
        # Telegram answers 4xx with a JSON body; surface it instead of raising so
        # one rejected post cannot abort the run (bot() callers check .ok).
        try:
            body = json.loads(e.read().decode('utf-8', 'replace'))
            if isinstance(body, dict):
                body.setdefault('description', 'HTTP %s' % e.code)
                return body
        except Exception:
            pass
        return {'ok': False, 'description': 'HTTP %s' % e.code}


def load_state():
    try:
        with open(STATE_PATH, encoding='utf-8') as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def save_state(d):
    with open(STATE_PATH, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


def usable_text(t):
    t = (t or '').strip()
    if len(t) < 20:
        return ''
    if t.startswith('/'):
        return ''
    return t[:3900]


def bot_preflight(target):
    """Prove the bot token + target chat BEFORE spending MTProto work.
    Returns (ok, message, hard). hard=True only when the TOKEN itself is
    rejected (a real breakage); everything else is owner-setup pending.
    Never prints the token."""
    tok = env_or_cfg('TELEGRAM_BOT_TOKEN', 'bot_token')
    if not tok:
        return False, 'TELEGRAM_BOT_TOKEN missing (secret + tg_config.json)', True
    try:
        me = bot('getMe')
    except Exception as e:
        return False, 'Telegram API unreachable: %s' % (str(e)[:70] or type(e).__name__), False
    if not me.get('ok'):
        return False, 'bot token rejected by Telegram: %s' % me.get('description'), True
    who = (me.get('result') or {}).get('username') or 'id%s' % (me.get('result') or {}).get('id')
    try:
        ch = bot('getChat', {'chat_id': target})
    except Exception as e:
        return False, 'Telegram API unreachable: %s' % (str(e)[:70] or type(e).__name__), False
    if not ch.get('ok'):
        return False, ('@%s cannot reach chat %s: %s -- add the bot to that '
                       'channel/group as an ADMIN (channels use -100... ids); '
                       'see scripts/TG_SETUP.md' % (who, target, ch.get('description'))), False
    title = (ch.get('result') or {}).get('title') or target
    return True, '@%s -> %s (%s)' % (who, title, (ch.get('result') or {}).get('type')), False


def main():
    target = env_or_cfg('TARGET_CHAT', 'target_chat')
    if not target:
        raise RuntimeError('TARGET_CHAT missing')
    ok, msg, hard = bot_preflight(target)
    print('[preflight] %s' % msg)
    if not ok:
        if hard:
            raise RuntimeError(msg)
        # Owner setup still pending (bot not in the channel yet / no phone login).
        # Skip instead of failing every 20 minutes; nothing to post until then.
        print('SKIP: %s' % msg)
        return 0
    api_id = int(os.environ.get('TG_API_ID', '0') or 0)
    api_hash = os.environ.get('TG_API_HASH', '').strip()
    session = os.environ.get('TG_SESSION', '').strip()
    if not (api_id and api_hash and session):
        # Owner has not done the my.telegram.org phone login yet. Skip with a
        # clear log line instead of a red X every 20 minutes (scripts/TG_SETUP.md).
        print('SKIP: TG_API_ID / TG_API_HASH / TG_SESSION not set yet - '
              'see scripts/TG_SETUP.md (bot side is verified working).')
        return 0

    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from telethon.tl.functions.messages import ImportChatInviteRequest

    state = load_state()
    client = TelegramClient(StringSession(session), api_id, api_hash)
    client.connect()
    if not client.is_user_authorized():
        raise RuntimeError('TG_SESSION expired — regenerate via tg_login.py')
    posted = 0
    try:
        for src in SOURCES:
            if posted >= MAX_POSTS_PER_RUN:
                break
            try:
                try:
                    ent = client.get_entity(src['ref'])
                except Exception:
                    if src['ref'].startswith('+'):
                        client(ImportChatInviteRequest(src['ref'][1:]))
                        ent = client.get_entity(src['ref'])
                    else:
                        raise
                last = int(state.get(src['key'], 0) or 0)
                msgs = client.get_messages(ent, limit=FETCH_LIMIT)
                fresh = [m for m in (msgs or []) if m and getattr(m, 'id', 0) > last]
                fresh.sort(key=lambda m: m.id)
                for m in fresh:
                    if posted >= MAX_POSTS_PER_RUN:
                        break
                    txt = usable_text(getattr(m, 'message', '') or getattr(m, 'text', ''))
                    if not txt:
                        state[src['key']] = m.id
                        continue
                    if src['translate']:
                        txt = translate_ku_ar(txt)
                    body = txt + '\n\n📰 via @kooraadz'
                    photo_bytes = None
                    try:
                        if getattr(m, 'photo', None):
                            photo_bytes = client.download_media(m.photo, bytes)
                    except Exception:
                        photo_bytes = None
                    try:
                        if photo_bytes:
                            bot('sendPhoto', {'chat_id': target, 'caption': body[:1024],
                                              'parse_mode': 'HTML'},
                                files={'photo': ('news.jpg', photo_bytes)})
                        else:
                            bot('sendMessage', {'chat_id': target, 'text': body,
                                                'disable_web_page_preview': False})
                        posted += 1
                    except Exception as e:
                        print('post failed:', str(e)[:120])
                    state[src['key']] = m.id
                    time.sleep(2)
            except Exception as e:
                print('source failed', src['key'], str(e)[:150])
    finally:
        try:
            client.disconnect()
        except Exception:
            pass
    save_state(state)
    print('posted=%d' % posted)


if __name__ == '__main__':
    sys.exit(main())
