"""Telegram news bridge (bot-only by default -- no login needed).

Reads the public source channel through its login-free web preview
and posts new items to the target via Bot API. Never names, mentions, tags,
or links the source in any post (owner order).
Dedupes via state file.

Optional upgrade (only for the PRIVATE Kurdish channel, which has no public
preview): set TG_API_ID / TG_API_HASH / TG_SESSION (my.telegram.org + phone
login via tg_login.py) and the bridge also pulls + translates that source.
MYMEMORY_KEY is optional (bigger free-translate quota).

Secrets needed for the default path: TELEGRAM_BOT_TOKEN + TARGET_CHAT only.
"""
import io
import json
import os
import re
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
# Only the optional MTProto upgrade reads this (public path scrapes the web
# preview instead). The public entry was removed: nothing may name the source.
SOURCES = [
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


def http_get_text(url, timeout=25):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')


def scrape_offside_preview(limit=25):
    """Login-free reader for the public source channel (web preview).
    Returns [{key, text, photo}] newest-last. Photo = direct https URL (Bot API
    accepts a URL, so no download needed)."""
    html = http_get_text('https://t.me/s/Offsideahdaff')
    blocks = re.split(r'tgme_widget_message_wrap', html)[1:]
    out = []
    for b in blocks:
        m = re.search(r'data-post="Offsideahdaff/(\d+)"', b)
        if not m:
            continue
        mid = int(m.group(1))
        tm = re.search(r'tgme_widget_message_text[^>]*>([\s\S]{0,4000}?)</div>', b)
        txt = ''
        if tm:
            txt = re.sub(r'<br\s*/?>', '\n', tm.group(1))
            txt = re.sub(r'<[^>]+>', '', txt)
            import html as _html
            txt = _html.unescape(txt)
            txt = re.sub(r'[ \t\xa0]+', ' ', txt).strip()
        # ALL telesco <img> in this block. The channel avatar repeats on
        # every message (NOT post content); real attachments are unique.
        # Emoji backgrounds live in the text div, so <img> never matches emoji.
        pm = re.findall(r'<img[^>]+src="(https://cdn\d*\.telesco\.pe/[^"]+)"', b)
        out.append({'key': mid, 'text': txt, 'photos': pm})
    seen = {}
    for x in out:
        for u in x['photos']:
            seen[u] = seen.get(u, 0) + 1
    for x in out:
        uniq = [u for u in x['photos'] if seen.get(u, 0) < 2]
        x['photo'] = uniq[0] if uniq else ''
        del x['photos']
    # numeric order, newest last, cap
    out.sort(key=lambda x: x['key'])
    return out[-limit:]


def usable_text(t):
    # Autonomous posting: everything goes out, even one-liners and photo-only
    # items. Only truly empty texts and bot commands are skipped.
    t = (t or '').strip()
    if len(t) < 3:
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


def dl_photo(url, timeout=25, limit=8000000):
    """Fetch photo bytes for re-upload. Capped, Referer set (CDN blocks
    referer-less + Telegram-side fetches). Returns bytes or None."""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://t.me/s/Offsideahdaff', 'Accept': 'image/*,*/*'})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if (r.status or 200) != 200:
                return None
            ct = (r.headers.get('Content-Type') or '').lower()
            if ct and 'image' not in ct:
                return None
            out = r.read(limit + 1)
            if not out or len(out) > limit:
                return None
            return out
    except Exception:
        return None


_LOGO = None


def logo_bytes():
    """Our channel logo (scripts/channel_logo.png). Cached, capped 2MB.
    Every post carries it; source photos are never forwarded (owner order)."""
    global _LOGO
    if _LOGO is None:
        try:
            with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                   'channel_logo.png'), 'rb') as f:
                _LOGO = f.read()
            if not _LOGO or len(_LOGO) > 2000000 or _LOGO[:8] != b'\x89PNG\r\n\x1a\n':
                _LOGO = False
        except Exception:
            _LOGO = False
    return _LOGO or None


def brand_photo(img_bytes, logo):
    """Owner photo policy, decided locally with Pillow (no uploads, no APIs).
    Their branding/flat graphics -> ('ours', logo). Real photos (players,
    teams, anything else) -> ('watermarked', photo + our logo small,
    bottom-right). Anything undecodable or logo-less -> ('none', None) and the
    caller falls back to a text post -- their pixels never go out bare."""
    if not img_bytes or not logo:
        return ('none', None)
    try:
        from PIL import Image
    except Exception:
        return ('ours', logo)
    try:
        base = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    except Exception:
        return ('ours', logo)
    W, H = base.size
    try:
        small = base.resize((64, 64))
        colors = small.getcolors(64 * 64) or []
        total = sum(c for c, _ in colors) or 1
        top2 = sum(c for c, _ in sorted(colors, reverse=True)[:2]) / total
        # Strict (measured: graphics top2~0.93/unique~40, photos top2~0.19/
        # unique~3000). Replace ONLY on flatness; size alone proves nothing
        # (a 160px textured photo scored top2=0.07). Real photos always pass
        # through with the small watermark.
        is_brand = top2 > 0.85 and len(colors) < 60
    except Exception:
        is_brand = False
    if is_brand:
        return ('ours', logo)
    try:
        mark = Image.open(io.BytesIO(logo)).convert('RGBA')
        lw = max(32, W // 4)
        lh = max(1, round(lw * mark.height / mark.width))
        mark = mark.resize((lw, lh))
        if mark.height > H // 3:
            sc = (H // 3) / mark.height
            mark = mark.resize((max(1, round(mark.width * sc)), H // 3))
        base.paste(mark, (W - mark.width - 12, H - mark.height - 12), mark)
        buf = io.BytesIO()
        base.save(buf, 'JPEG', quality=82)
        return ('watermarked', buf.getvalue())
    except Exception:
        return ('ours', logo)


def full_text(mid, fallback):
    """Complete post text via the single-post preview page. The channel view
    truncates long posts (stray trailing …); the single page carries the whole
    thing. Falls back to the preview text on any failure. Never raises."""
    try:
        html = http_get_text('https://t.me/s/Offsideahdaff/%d' % int(mid))
    except Exception:
        return fallback
    try:
        i = html.find('data-post="Offsideahdaff/%d"' % int(mid))
        if i < 0:
            return fallback
        j = html.find('tgme_widget_message_text', i)
        if j < 0:
            return fallback
        k = html.find('>', j)
        depth, p = 1, k + 1
        end = len(html)
        while p < len(html) and depth:
            if html.startswith('<div', p):
                depth += 1
                p += 4
            elif html.startswith('</div>', p):
                depth -= 1
                if not depth:
                    end = p
                    break
                p += 6
            else:
                p += 1
        t = re.sub(r'<br\s*/?>', '\n', html[k + 1:end])
        t = re.sub(r'<[^>]+>', '', t)
        import html as _html
        t = _html.unescape(t)
        t = re.sub(r'[ \t\xa0]+', ' ', t).strip()
        t = usable_text(t)
        if len(t) >= len(fallback or ''):
            return t
        return fallback
    except Exception:
        return fallback


def groq_chat(key, model, system, user, timeout=30):
    """One OpenAI-compatible chat call. Returns text or raises."""
    import urllib.error
    payload = {'model': model,
               'messages': [{'role': 'system', 'content': system},
                            {'role': 'user', 'content': user}],
               'temperature': 0,
               'max_tokens': 1500}
    req = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json',
                 'Authorization': 'Bearer ' + key,
                 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.loads(r.read().decode('utf-8', 'replace'))
    except urllib.error.HTTPError as e:
        raise RuntimeError('groq HTTP %s' % e.code)
    try:
        return ((((d.get('choices') or [{}])[0].get('message') or {}).get('content')) or '').strip()
    except Exception:
        raise RuntimeError('groq bad response')


def llm_fix(text):
    """Fix the post with the free Groq LLM, keeping the SOURCE's own layout
    (owner: copy theirs, never invent ours). Fixes typos and obvious slips
    like a scoreline reversed against its own goal list; keeps language,
    emojis, order, and line breaks; adds nothing (no mentions/tags/links).
    Fail-open: any problem returns the original text untouched. The key lives
    only in the GROQ_API_KEY secret -- never in this repo."""
    text = (text or '').strip()
    if not text:
        return text
    key = os.environ.get('GROQ_API_KEY', '').strip()
    if not key:
        return text
    models = [os.environ.get('GROQ_MODEL', '').strip() or 'qwen/qwen3.8-27b',
              'openai/gpt-oss-20b']
    system = ('You are a careful Arabic football-news copy editor. Fix the post: '
              'correct typos and obvious factual slips (for example a scoreline '
              'written backwards against its own listed goals). Then format it '
              'as a clean readable list: header line first, then one bullet per '
              'item, each on its own line starting with the bullet char. Keep '
              'the language, the emojis, and the item order. Add nothing else -- '
              'no headers, footers, mentions, tags, links, hashtags, bold, or '
              'commentary. Output ONLY the corrected post.')
    for model in models:
        try:
            out = groq_chat(key, model, system, text[:3500])
        except Exception:
            continue
        if not out or len(out) < 20 or len(out) > 3900:
            continue
        if len(out) > len(text) * 1.5 + 200:
            continue  # bloat guard: never let it ramble
        import re as _re
        if _re.search(r'@\w', out):
            continue  # a mention/tag slipped in: reject, keep original
        return out
    return text


def send_post(target, body, out):
    """Deliver one post. Photo posts carry watermarked bytes; captions over
    1024 chars split into photo + full-text follow-up. Returns True when the
    content was delivered, None when there was nothing to send, False on
    failure. Never mentions or tags anyone."""
    try:
        if out:
            if body and len(body) > 1024:
                r1 = bot('sendPhoto', {'chat_id': target, 'caption': body[:950] + '\n\u2026'},
                         files={'photo': ('news.png', out)})
                if not (r1 or {}).get('ok'):
                    print('photo rejected:', str((r1 or {}).get('description'))[:100])
                    return False
                r2 = bot('sendMessage', {'chat_id': target, 'text': body[:3900],
                                        'disable_web_page_preview': False})
                if not (r2 or {}).get('ok'):
                    print('text rejected:', str((r2 or {}).get('description'))[:100])
                    return False
                return True
            params = {'chat_id': target}
            if body:
                params['caption'] = body[:1024]
            r = bot('sendPhoto', params, files={'photo': ('news.png', out)})
            if not (r or {}).get('ok'):
                print('post rejected:', str((r or {}).get('description'))[:100])
                return False
            return True
        if body:
            r = bot('sendMessage', {'chat_id': target, 'text': body[:3900],
                                    'disable_web_page_preview': False})
            if not (r or {}).get('ok'):
                print('post rejected:', str((r or {}).get('description'))[:100])
                return False
            return True
        return None
    except Exception as e:
        print('post failed:', str(e)[:120])
        return False


def public_preview_run(target):
    """One run over the public preview. Returns posts made. Bot-only."""
    state = load_state()
    try:
        items = scrape_offside_preview()
    except Exception as e:
        print('preview fetch failed:', type(e).__name__, str(e)[:100])
        return 0
    last = int(state.get('offside', 0) or 0)
    fresh = [x for x in items if x['key'] > last]
    posted = 0
    for x in fresh:
        if posted >= MAX_POSTS_PER_RUN:
            break
        txt = usable_text(x['text'])
        if not txt and not x['photo']:
            state['offside'] = x['key']
            continue
        body = llm_fix(full_text(x['key'], txt))  # never mention/tag source
        img = None
        if x['photo']:
            try:
                img = dl_photo(x['photo'])
            except Exception:
                img = None
        try:
            logo = logo_bytes()
            if img:
                _kind, out = brand_photo(img, logo)
                if _kind == 'ours':
                    out = None  # their branding: text only, no image at all
            else:
                _kind, out = ('none', None)
            if send_post(target, body, out) is True:
                posted += 1
        except Exception as e:
            print('post failed:', str(e)[:120])
        state['offside'] = x['key']
        time.sleep(2)
    save_state(state)
    print('preview: %d new, posted=%d' % (len(fresh), posted))
    return posted


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
    # Default path: public preview, zero extra secrets.
    posted = public_preview_run(target)
    # Upgrade path: private Kurdish source joins in when reader creds exist.
    api_id = int(os.environ.get('TG_API_ID', '0') or 0)
    api_hash = os.environ.get('TG_API_HASH', '').strip()
    session = os.environ.get('TG_SESSION', '').strip()
    if not (api_id and api_hash and session):
        print('reader creds absent: Kurdish source skipped (public source done, posted=%d).' % posted)
        return 0
    print('reader creds present: pulling Kurdish source too (already posted=%d).' % posted)

    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from telethon.tl.functions.messages import ImportChatInviteRequest

    state = load_state()
    client = TelegramClient(StringSession(session), api_id, api_hash)
    client.connect()
    if not client.is_user_authorized():
        raise RuntimeError('TG_SESSION expired — regenerate via tg_login.py')
    try:
        ksrc = [s for s in SOURCES if s['key'] == 'k2']
        for src in ksrc:
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
                    has_photo = bool(getattr(m, 'photo', None))
                    if not txt and not has_photo:
                        state[src['key']] = m.id
                        continue
                    if src['translate'] and txt:
                        txt = translate_ku_ar(txt)
                    body = llm_fix(txt)  # never mention/tag anyone
                    raw = None
                    try:
                        if getattr(m, 'photo', None):
                            raw = client.download_media(m.photo, bytes)
                    except Exception:
                        raw = None
                    try:
                        _logo = logo_bytes()
                        if raw:
                            _kind, out = brand_photo(raw, _logo)
                            if _kind == 'ours':
                                out = None  # their branding: text only
                        else:
                            _kind, out = ('none', None)
                        if send_post(target, body, out) is True:
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
    print('posted=%d (total incl. public preview)' % posted)


if __name__ == '__main__':
    sys.exit(main())
