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
# how many recently-posted content fingerprints to remember
SEEN_KEEP = 300


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
        # Spec-correct multipart: every line ends CRLF (\\r\\n). The old code
        # emitted \\r\\r\\n, which telegram tolerates for most files but
        # rejects with an empty HTTP 400 for some (proven live: the same bytes
        # failed via bot() and posted fine with correct framing).
        boundary = uuid.uuid4().hex
        body = b''
        for k, v in (payload or {}).items():
            body += ('--' + boundary + '\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n'
                     % (k, v)).encode('utf-8')
        for k, (fname, data) in files.items():
            low = (fname or '').lower()
            if low.endswith('.png'):
                mime = 'image/png'
            elif low.endswith(('.jpg', '.jpeg')):
                mime = 'image/jpeg'
            elif low.endswith('.mp4'):
                mime = 'video/mp4'
            elif low.endswith('.gif'):
                mime = 'image/gif'
            else:
                mime = 'application/octet-stream'
            body += ('--' + boundary + '\r\nContent-Disposition: form-data; name="%s"; filename="%s"\r\n'
                     'Content-Type: %s\r\n\r\n' % (k, fname, mime)).encode('utf-8') + data + b'\r\n'
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
    seen = d.get('seen')
    if isinstance(seen, list) and len(seen) > SEEN_KEEP:
        d['seen'] = seen[-SEEN_KEEP:]  # bounded: oldest hashes fall off
    with open(STATE_PATH, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


def fingerprint(text):
    """Stable short id for a post's meaning: digits, emoji and punctuation
    dropped so 'GOOOL 34\' [1-0]' and 'goool 34 [1-0]' collide as they should.
    The source reposts the same item under fresh ids, so id dedup is not
    enough."""
    import hashlib
    import re as _re
    t = _re.sub(r'(?im)^\W*watch\s*live:?\s*https?://\S+', ' ', text or '')
    t = _re.sub(r'https?://\S+', ' ', t)   # links are not content
    t = _re.sub(r'[^\w\u0600-\u06FF]+', '', t.lower())
    if not t:
        return ''
    if len(t) < 8:
        return 's:' + hashlib.sha1(t.encode('utf-8')).hexdigest()[:12]
    return hashlib.sha1(t.encode('utf-8')).hexdigest()[:12]


def seed_seen(state, target):
    """Fold our own recent captions into the seen window. Belt and braces:
    if the state file is ever lost or rolled back, the channel itself still
    remembers what went out. Never raises, never sends anything."""
    try:
        html = http_get_text('https://t.me/s/messistatdotcom')
        if not html:
            return
        marks = list(re.finditer(r'data-post="messistatdotcom/(\d+)"', html))
        seen = state.setdefault('seen', [])
        for i, m in enumerate(marks):
            end = marks[i + 1].start() if i + 1 < len(marks) else len(html)
            seg = html[m.start():end]
            j = seg.find('tgme_widget_message_text')
            if j < 0:
                continue
            k = seg.find('>', j)
            depth, p, stop = 1, k + 1, len(seg)
            while p < len(seg) and depth:
                if seg.startswith('<div', p):
                    depth += 1
                    p += 4
                elif seg.startswith('</div>', p):
                    depth -= 1
                    if not depth:
                        stop = p
                        break
                    p += 6
                else:
                    p += 1
            t = re.sub(r'<br\s*/?>', '\r\n', seg[k + 1:stop])
            t = re.sub(r'<[^>]+>', '', t)
            import html as _h
            fp = fingerprint(re.sub(r'[ \t\xa0]+', ' ', _h.unescape(t)).strip())
            if fp and fp not in seen:
                seen.append(fp)
        if len(seen) > SEEN_KEEP:
            state['seen'] = seen[-SEEN_KEEP:]
        print('seen window seeded from channel: %d entries' % len(seen))
    except Exception as e:
        print('seed_seen skipped:', str(e)[:80] or type(e).__name__)


def already_posted(state, *texts):
    """True when any of these contents already went out (within the window).

    Callers pass BOTH the source text and the translated body: the
    channel-seeded window holds English captions while live state holds
    source-language fingerprints, and only checking both covers a rerun
    whose state was lost or rolled back."""
    seen = state.get('seen') or []
    for t in texts:
        fp = fingerprint(t)
        if fp and fp in seen:
            return True
    return False


def record_seen(state, *texts):
    """Remember content fingerprint(s) after a successful post. Both the
    source text and the posted (English) body go in: the channel-seeded
    window holds English captions, so the English fp is what protects a
    rerun with lost/rolled-back state. Never stores '' or duplicates."""
    seen = state.setdefault('seen', [])
    for t in texts:
        fp = fingerprint(t)
        if fp and fp not in seen:
            seen.append(fp)


def http_get_text(url, timeout=25):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')


AVATAR_URL = ''


def scrape_offside_preview(limit=25):
    global AVATAR_URL
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
            txt = re.sub(r'<br\s*/?>', '\r\n', tm.group(1))
            txt = re.sub(r'<[^>]+>', '', txt)
            import html as _html
            txt = _html.unescape(txt)
            txt = re.sub(r'[ \t\xa0]+', ' ', txt).strip()
        pm = re.findall(r'<img[^>]+src="(https://cdn\d*\.telesco\.pe/[^"]+)"', b)
        pm += re.findall(r"background-image:url\('([^']+)'", b)
        pm = [u for u in pm if 'telesco.pe' in u]
        pv = [u for u in re.findall(r'<video[^>]+src="([^"]+)"', b)
              if '.mp4' in u]
        out.append({'key': mid, 'text': txt, 'photos': pm,
                    'preview_video': pv[0] if pv else ''})
    seen = {}
    for x in out:
        for u in set(x['photos']):
            seen[u] = seen.get(u, 0) + 1
    total = len(out) or 1
    avatar = ''
    for u, n in seen.items():
        if n >= 5 or n * 2 > total:
            avatar = u
            break
    AVATAR_URL = avatar
    for x in out:
        uniq = [u for u in x['photos'] if u != avatar]
        x['photo'] = uniq[0] if uniq else ''
        del x['photos']
    out.sort(key=lambda x: x['key'])
    return out[-limit:]


_GAM_MONEY = (r'جنيه|درهم|دينار|دولار|ريال(?!\s*مدريد)|جائزة|جوائز|هدية|كاش|مكافأة'
              r'|\b(?:egp|gbp|eur|usd|cash|prize|bonus|reward|wallet)\b')
_GAM_CONTEST = (r'توقع|اربح|فائز|فائزين|مسابقة|سحب'
                r'|\b(?:predict(?:ion|ions)?|guess|giveaway|raffle|contest)\b')
_GAM_HARD = (r'قمار|مراهن|كازينو|1xbet|melbet|betway|linebet|megapari|stake|'
             r'برومو\s?كود|promo\s?code|بونص|انضم.*قناة|'
             # english (posts are translated before this filter runs)
             r'\b(?:betting|sportsbook|bookmaker|casino|jackpot)\b'
             r'|\b(?:1xbet|betway|linebet|megapari|bet365|betfair|stake\.com)\b'
             r'|\bwager(?:ing|ed)?\b|\bfree\s?bet\b|\bbet\s?now\b'
             r'|\bbetting\s?tips?\b|\b(?:join|subscribe)\s+(?:our|us|now)\b'
             r'|\bpromo(?:tion)?\s?code\b|\bbonus\s?code\b'
             r'|\bwin\s+(?:cash|money|usd|egp|gbp|eur|\d{3,})\b')
_AD_STORE = (r'كود\s*خصم|كوبون|قسيمة|للطلب|اطلب\s+الآن|اشتر|متجر|ستور|'
             r'تخفيضات|خصومات|شحن|'
             # english
             r'\b(?:shop|order|buy|subscribe|install)\s?now\b'
             r'|\b(?:discount\s?code|coupon|voucher|free\s+shipping)\b'
             r'|\b(?:play\s?store|app\s?store|in-app)\b')
_AD_PRICE = r'سعر|أسعار|ثمن|تكلفة|\b(?:price|prices|discount|off)\s?\d+%?'
_AD_PRODUCT = (r'نسخة|تحميل|لعبة|ألعاب|جهاز|بلايستيشن|اكس\s?بوكس|حساب|اشتراك'
                r'|\b(?:download|install|premium|subscription)\b'
                r'|\bplaystation\b|\bxbox\b|\bsteam\b')


def is_promo(t):
    """Betting + store-ad filter (owner: no gambling ads, no ads period).
    Hard signals (brands, casino, promo/discount codes, stores, ordering,
    channel-recruiting) match alone; money+contest and price+product pairs
    must co-occur. Ticket posts stay exempt; punditry ("توقع") and salary /
    transfer figures pass. The riyal-money signal explicitly excludes
    "ريال مدريد" (Real Madrid) via lookahead."""
    t = t or ''
    if re.search(_GAM_HARD, t, re.I):
        return True
    if re.search(_AD_STORE, t, re.I):
        return True
    if re.search(r'تذكرة|تذاكر', t):
        return False
    has_money = bool(re.search(_GAM_MONEY, t))
    has_contest = bool(re.search(_GAM_CONTEST, t, re.I))
    if has_money and has_contest:
        return True
    has_price = bool(re.search(_AD_PRICE, t, re.I))
    has_product = bool(re.search(_AD_PRODUCT, t, re.I))
    return bool((has_price and has_money) or (has_money and has_product) or
                (has_price and has_product))


def is_gambling(t):
    """Kept alias (old name)."""
    return is_promo(t)


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


def dl_video(url, timeout=120, limit=48000000, tries=2):
    """Fetch video bytes (Bot API caps at 50MB; we stop at 48MB).
    Returns bytes, or None with the reason printed -- a silent None here is
    what made 'video sometimes missing' impossible to diagnose."""
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://t.me/s/Offsideahdaff', 'Accept': 'video/*,*/*'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                if (r.status or 200) != 200:
                    print('video: http %s' % r.status)
                    return None
                ct = (r.headers.get('Content-Type') or '').lower()
                if ct and 'video' not in ct and 'octet-stream' not in ct:
                    print('video: unexpected content-type %s' % ct[:30])
                    return None
                out = r.read(limit + 1)
                if not out:
                    print('video: empty body')
                    return None
                if len(out) > limit:
                    print('video: oversize %d > %d (bot api 50MB cap)' % (
                        len(out), limit))
                    return None
                return out
        except Exception as e:
            print('video: attempt %d failed (%s)' % (
                attempt + 1, str(e)[:70] or type(e).__name__))
    return None


def single_region(html, mid):
    """The slice of one message's html (its marker to the next one). '' when
    the message is not on this page."""
    try:
        tag = 'data-post="Offsideahdaff/%s"' % int(mid)
        i = (html or '').find(tag)
        if i < 0:
            return ''
        nxt = (html or '').find('data-post="Offsideahdaff/', i + len(tag))
        return html[i:nxt] if nxt > 0 else html[i:i + 30000]
    except Exception:
        return ''


def _kind_of(seg):
    """What is this message's media? 'video' = a playable mp4 we can re-upload.
    'animation' = a gif (or an oversized video): telegram's web preview serves
    NO bytes for it, only a thumbnail plus 'Media is too big / VIEW IN
    TELEGRAM'. 'photo' = a still. 'none' = text only."""
    if re.search(r'<video[^>]+src="https?://[^"]+"', seg or ''):
        return 'video'
    if 'tgme_widget_message_video_player' in (seg or ''):
        return 'animation'
    if 'tgme_widget_message_photo_wrap' in (seg or ''):
        return 'photo'
    return 'none'


def source_media(mid, also=None):
    """(kind, playable_mp4_url) from one fetch of the message page."""
    try:
        seg = single_region(fetch_single(mid), mid)
    except Exception as e:
        print('media probe failed #%s: %s' % (mid, str(e)[:70]))
        seg = ''
    if not seg:
        return 'none', ''
    kind = _kind_of(seg)
    url = ''
    if kind == 'video':
        for src in (seg, also or ''):
            for m in re.finditer(r'<video[^>]+src="([^"]+)"', src):
                if '.mp4' in m.group(1) and m.group(1) != AVATAR_URL:
                    url = m.group(1)
                    break
            if url:
                break
    return kind, url


def media_kind(mid):
    return source_media(mid)[0]


def post_video(mid, also=None):
    """Direct mp4 URL for one message, from the single-message page. Tokens
    expire, so it is used immediately and never stored. `also` is an mp4 seen
    in the preview page, used only if the single page has none. '' when the
    message genuinely has no video."""
    return source_media(mid, also=also)[1]


def logo_bytes():
    """Our channel logo (scripts/channel_logo.png). Cached, capped 2MB.
    Every post carries it; source photos are never forwarded (owner order)."""
    global _LOGO
    if _LOGO is None:
        try:
            with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                   'channel_logo.png'), 'rb') as f:
                _LOGO = f.read()
            if not _LOGO or len(_LOGO) > 2000000 or _LOGO[:8] != b'\x89PNG\r\r\n\x1a\r\n':
                _LOGO = False
        except Exception:
            _LOGO = False
    return _LOGO or None


def brand_photo(img_bytes, logo=None):
    """Classify only: flat branding graphics -> 'brand', real photos ->
    'photo', undecodable -> 'none'. Originals always post untouched now
    (owner: logo removed, no re-encode, no upscaling)."""
    if not img_bytes:
        return ('none', None)
    try:
        from PIL import Image
        base = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        small = base.resize((64, 64))
        colors = small.getcolors(64 * 64) or []
        total = sum(c for c, _ in colors) or 1
        top2 = sum(c for c, _ in sorted(colors, reverse=True)[:2]) / total
        if top2 > 0.85 and len(colors) < 60:
            return ('brand', None)
        return ('photo', img_bytes)
    except Exception:
        try:
            from PIL import Image
            Image.open(io.BytesIO(img_bytes))
            return ('photo', img_bytes)
        except Exception:
            return ('none', None)


_SINGLE = {}


def fetch_single(mid):
    """Single-post preview page (full text + full-size photo live here)."""
    mid = int(mid)
    if mid in _SINGLE:
        return _SINGLE[mid]
    try:
        _SINGLE[mid] = http_get_text('https://t.me/s/Offsideahdaff/%d' % mid)
    except Exception:
        _SINGLE[mid] = ''
    return _SINGLE[mid]


def head_length(url, timeout=12):
    """Content-Length via HEAD (headers only). -1 when unknown."""
    try:
        req = urllib.request.Request(url, method='HEAD', headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://t.me/s/Offsideahdaff'})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if (r.status or 200) != 200:
                return -1
            return int(r.headers.get('Content-Length') or -1)
    except Exception:
        return -1


def biggest(cands):
    """Pick the largest file by HEAD size; first candidate on any doubt."""
    best, bestn = '', -1
    for u in cands:
        n = head_length(u)
        if n > bestn:
            best, bestn = u, n
    return best or (cands[0] if cands else '')


def extract_post(html, mid):
    """(text, photo) from one message region. Photo = first telesco image
    that is not the channel avatar. Never raises."""
    try:
        i = html.find('data-post="Offsideahdaff/%d"' % int(mid))
        if i < 0:
            return '', ''
        nxt = html.find('data-post="Offsideahdaff/', i + 20)
        seg = html[i:i + 30000] if nxt < 0 else html[i:nxt]
        cands = []
        for pat in (r'<img[^>]+src="(https://cdn\d*\.telesco\.pe/[^"]+)"',
                    r"background-image:url\('([^']+)'"):
            for m in re.finditer(pat, seg):
                u = m.group(1)
                if 'telesco.pe' in u and u != AVATAR_URL and u not in cands:
                    cands.append(u)
        photo = biggest(cands)
        j = seg.find('tgme_widget_message_text')
        if j < 0:
            return '', photo
        k = seg.find('>', j)
        depth, p = 1, k + 1
        end = len(seg)
        while p < len(seg) and depth:
            if seg.startswith('<div', p):
                depth += 1
                p += 4
            elif seg.startswith('</div>', p):
                depth -= 1
                if not depth:
                    end = p
                    break
                p += 6
            else:
                p += 1
        t = re.sub(r'<br\s*/?>', '\r\n', seg[k + 1:end])
        t = re.sub(r'<[^>]+>', '', t)
        import html as _html
        t = _html.unescape(t)
        t = re.sub(r'[ \t\xa0]+', ' ', t).strip()
        return usable_text(t), photo
    except Exception:
        return '', ''


def full_text(mid, fallback):
    """Complete post text: single page wins when longer, else the preview
    text. Falls back on any failure. Never raises."""
    t, _photo = extract_post(fetch_single(mid), mid)
    if len(t) >= len(fallback or ''):
        return t
    return fallback


def post_photo(mid, preview_url):
    """Best photo URL: single-page original first, preview fallback.
    Never the avatar. Returns '' when the post has no real photo."""
    _t, single = extract_post(fetch_single(mid), mid)
    if single:
        return single
    if preview_url and preview_url != AVATAR_URL:
        return preview_url
    return ''


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


ARABIC = re.compile(r'[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]')


# Curated name repairs for slips already observed, applied after translation
# so the same wrong token can never reach the channel again. Case-insensitive,
# tolerant of the spacing/hyphenation variants of a transliteration.
_NAME_FIXES = [
    # any "tibo kort..." variant is Thibaut Courtois
    (re.compile(r'(?i)\btibo[\s-]*kort\w*\b'), 'Thibaut Courtois'),
    (re.compile(r'(?i)\bfabriyo[\s-]*romano\b|\bfabrizo[\s-]*romano\b'),
     'Fabrizio Romano'),
    (re.compile(r'(?i)\bfabriyo\b'), 'Fabrizio'),
    (re.compile(r'(?i)\barling[\s-]*haaland\b|\berleen[\s-]*g\b'),
     'Erling Haaland'),
    (re.compile(r'(?i)\bkylian[\s-]*mbapp\b'), 'Kylian Mbappé'),
]


def repair_names(text):
    t = text or ''
    for rx, good in _NAME_FIXES:
        t = rx.sub(good, t)
    return t


def has_arabic(text):
    """True when the text still carries any Arabic letter or Arabic
    presentation form. The channel is English-only, so this is the single
    definition used by both the translator and the send path."""
    return bool(ARABIC.search(text or ''))


def llm_fix(text):
    """Fix (and translate to English) with the free Groq LLM. Channel is English-only: Arabic in, natural English out, clean bullet list. Fail-open to original. Key in GROQ_API_KEY secret only."""
    text = (text or '').strip()
    if not text:
        return text
    key = os.environ.get('GROQ_API_KEY', '').strip()
    if not key:
        # No key: skip the loop entirely rather than burn a 401 per post.
        print('[lang] no groq key, free fallback only')
        models = []
    else:
        models = [os.environ.get('GROQ_MODEL', '').strip() or 'qwen/qwen3.8-27b',
                  'openai/gpt-oss-20b']
    system = ('You are a football-news translator and copy editor. Translate '
              'the Arabic post to natural ENGLISH and fix it: correct typos and '
              'obvious factual slips (for example a scoreline written backwards '
              'against its own listed goals). Transliterate player and team '
              'names to their standard Latin spelling. A name in the source that is '
              'an Arabic transliteration of a famous player or journalist must become '
              "that real person's actual sport name -- e.g. \"Thibaut Courtois\" (never "
              '"Tibo Kortuwa"), "Fabrizio Romano", "Kylian Mbappé", "Erling Haaland". '
              'Never invent a spelling. Then format it as a clean '
              'readable list: header line first, then one bullet per item, each '
              'on its own line starting with the bullet char. Keep the emojis '
              'and the item order; keep scores, numbers, and minute marks '
              'exactly. The whole output must be English only. Never output '
              'the word "translation" or any label of your own (no '
              '"Translation:", no "Corrected:", no "Here is"), and never restate '
              'the post as instructions. Add nothing else -- no headers, '
              'footers, mentions, tags, links, hashtags, bold, Arabic leftovers, '
              'or commentary. Output ONLY the corrected post.')
    for model in models:
        try:
            out = groq_chat(key, model, system, text[:3500])
            print('[lang] groq ok: %s (%d chars)' % (model, len(out)))
        except Exception as e:
            print('[lang] groq fail: %s %s' % (model, str(e)[:80] or type(e).__name__))
            continue
        if not out or len(out) < 20 or len(out) > 3900:
            continue
        if len(out) > len(text) * 1.5 + 200:
            continue  # bloat guard: never let it ramble
        import re as _re
        if _re.search(r'@\w', out):
            print('[lang] groq output rejected (mention)')
            continue  # a mention/tag slipped in: reject, keep original
        if has_arabic(out):
            print('[lang] groq output rejected (still arabic)')
            continue  # untranslated output: never let it out
        if _re.match(r'(?i)\s*(translation|translated|corrected|here is|output)\b',
                     out):
            print('[lang] groq output rejected (meta-label)')
            continue  # it narrated the job instead of doing it
        return repair_names(out)
    fb = translate_free_ar_en(text)
    if fb and fb != text and not has_arabic(fb):
        print('[lang] free fallback used')
        return repair_names(fb)
    if has_arabic(text):
        # Channel is English-only. Rather than post Arabic, drop the post.
        print('[lang] UNTRANSLATABLE arabic -> skip post')
        return ''
    print('[lang] all engines failed: posting original')
    return text


def photo_name(b):
    """news.png for PNG originals, news.jpg otherwise (bytes untouched)."""
    try:
        if (b or b'')[:8] == b'\x89PNG\r\n\x1a\n':
            return 'news.png'
    except Exception:
        pass
    return 'news.jpg'


def translate_free_ar_en(text):
    """Free no-key Arabic->English (MyMemory -> Google gtx). Plain translation,
    no bullets. Used only when Groq is unreachable. Never raises."""
    text = (text or '').strip()
    if not text:
        return text
    if len(text) > 2500:
        text = text[:2500]
    mm_key = os.environ.get('MYMEMORY_KEY', '').strip()
    try:
        q = {'q': text, 'langpair': 'ar|en'}
        if mm_key:
            q['key'] = mm_key
        d = http_get_json('https://api.mymemory.translated.net/get?' + urllib.parse.urlencode(q))
        out = ((d.get('responseData') or {}).get('translatedText') or '').strip()
        if out and out.lower() != text.lower():
            return out
    except Exception as e:
        print('[lang] mymemory fail: %s' % (str(e)[:70] or type(e).__name__))
    try:
        u = ('https://translate.googleapis.com/translate_a/single?client=gtx'
             '&sl=ar&tl=en&dt=t&q=' + urllib.parse.urlencode({'x': text})[2:])
        d = http_get_json(u)
        out = ''.join(seg[0] for seg in (d[0] or []) if seg and seg[0]).strip()
        if out and out != text:
            return out
    except Exception as e:
        print('[lang] google fail: %s' % (str(e)[:70] or type(e).__name__))
    return text


SITE_BASE = 'https://kooraadz.vercel.app'
_FIXTURES = {'at': 0.0, 'items': []}
_AR_MARKS = '\u064b-\u0652\u0670\u06d6-\u06ed\u0640'


def site_fixtures(max_age=600):
    """Live fixtures from our own site (today + tomorrow), cached briefly.
    Never raises: if the site is down we post news without a link."""
    import time as _t
    if _FIXTURES['items'] and (_t.time() - _FIXTURES['at']) < max_age:
        return _FIXTURES['items']
    out = []
    for day in ('today', 'tomorrow'):
        try:
            d = http_get_json('%s/api/matches?day=%s' % (SITE_BASE, day), timeout=20)
            for m in (d if isinstance(d, list) else []):
                if isinstance(m, dict) and m.get('id'):
                    out.append({'id': str(m['id']), 'day': day,
                                'home': m.get('home') or '',
                                'away': m.get('away') or ''})
        except Exception as e:
            print('fixtures %s failed: %s' % (day, str(e)[:60]))
    if out:
        _FIXTURES['items'] = out
        _FIXTURES['at'] = _t.time()
        print('[links] fixtures loaded: %d (site reachable)' % len(out))
    else:
        print('[links] no fixtures from our site (posts will have no link)')
    return _FIXTURES['items']


def norm_team(s):
    """Arabic-insensitive team key: drop tatweel/harakat, unify alef and ya,
    strip punctuation and a leading article."""
    t = re.sub('[' + _AR_MARKS + ']', '', s or '')
    t = re.sub('[\u0622\u0623\u0625\u0671]', '\u0627', t)
    t = re.sub('\u0649', '\u064a', t)
    t = re.sub('\u0629', '\u0647', t)
    t = re.sub('[^\u0620-\u064a0a-z0-9 ]+', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip().lower()
    return re.sub(r'^\u0627\u0644 ?', '', t)


def team_tokens(name):
    t = [w for w in norm_team(name).split() if len(w) >= 3]
    if t:
        return t
    k = norm_team(name)
    return [k] if len(k) >= 3 else []


def match_link(text):
    """The exact player link for the fixture this post names. Only when
    exactly one of our fixtures matches: two or more means the post is about
    several matches and guessing would post the wrong link."""
    if not text:
        return ''
    fx = site_fixtures()
    if not fx:
        return ''
    nt = norm_team(text)
    hits = [f for f in fx
            if team_tokens(f['home']) and team_tokens(f['away'])
            and all(w in nt for w in team_tokens(f['home']))
            and all(w in nt for w in team_tokens(f['away']))]
    if len(hits) != 1:
        if len(hits) > 1:
            print('match link skipped: %d fixtures named (ambiguous)' % len(hits))
        return ''
    f = hits[0]
    url = '%s/player.html?m=%s&d=%s' % (SITE_BASE, f['id'], f['day'])
    print('[links] match: %s vs %s -> %s' % (
        ascii(f['home']), ascii(f['away']), url))
    return url


def with_link(body, url):
    """Append the watch link, staying inside the 1024-char caption budget."""
    if not url or not body or url in body:
        return body
    line = '\n\n\U0001f3a6 Watch live: %s' % url
    if len(body) + len(line) <= 1024:
        return body + line
    room = 1024 - len(line)
    if room < 40:
        return body
    return body[:room].rstrip() + line


_TELE = {'client': None, 'tried': False}


def ffmpeg_path():
    """ffmpeg is preinstalled on github-hosted ubuntu runners. Nothing is
    installed or downloaded; we only use what is already there."""
    import shutil
    return shutil.which('ffmpeg')


def compress_video(data, limit=48000000, timeout=600):
    """Shrink an oversized clip just enough to fit the bot api cap.

    Never touches anything already under the cap. Tries a CRF ladder and only
    steps down in quality as far as it must; audio is re-encoded small because
    it is a tiny share of the file. Returns (bytes, crf) or (None, 0)."""
    if not data or len(data) <= limit:
        return data, 0
    exe = ffmpeg_path()
    if not exe:
        print('compress: no ffmpeg on this runner, leaving it oversized')
        return None, 0
    import subprocess
    import tempfile
    tmp = tempfile.mkdtemp(prefix='tgvid')
    src = os.path.join(tmp, 'in.mp4')
    dst = os.path.join(tmp, 'out.mp4')
    with open(src, 'wb') as f:
        f.write(data)
    # CRF first, no scaling: usually enough and barely touches the picture.
    ladder = [(24, None), (27, None), (30, None),
              (30, '1280:-2'), (32, '854:-2')]
    try:
        for crf, scale in ladder:
            vf = ['-vf', 'scale=%s' % scale] if scale else []
            cmd = [exe, '-y', '-loglevel', 'error', '-i', src,
                   '-c:v', 'libx264', '-crf', str(crf), '-preset', 'medium',
                   '-profile:v', 'high', '-pix_fmt', 'yuv420p'] + vf + [
                   '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
                   '-movflags', '+faststart', dst]
            try:
                subprocess.run(cmd, timeout=timeout,
                               stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, check=False)
            except Exception as e:
                print('compress: ffmpeg failed (%s)' % type(e).__name__)
                return None, 0
            try:
                with open(dst, 'rb') as f:
                    out = f.read()
            except OSError:
                out = b''
            if out and len(out) <= limit:
                print('compress: %d -> %d bytes (crf %s%s)'
                      % (len(data), len(out), crf,
                         ', %sp' % scale if scale else ''))
                return out, crf
    finally:
        for p in (src, dst):
            try:
                os.unlink(p)
            except OSError:
                pass
        try:
            os.rmdir(tmp)
        except OSError:
            pass
    print('compress: could not reach the cap without hurting quality')
    return None, 0


def _tele_client():
    """The blocking telethon client for the reader session, or None when no
    session is configured."""
    import os as _os
    api_id = int(_os.environ.get('TG_API_ID', '0') or 0)
    api_hash = _os.environ.get('TG_API_HASH', '').strip()
    session = _os.environ.get('TG_SESSION', '').strip()
    if not (api_id and api_hash and session):
        return None
    if _TELE['tried']:
        return _TELE['client']
    try:
        # telethon.sync is the BLOCKING client. The async one returns
        # coroutines that nothing awaits, so every download silently returned
        # nothing (verified: "coroutine ... was never awaited").
        from telethon.sessions import StringSession
        from telethon.sync import TelegramClient
        cl = TelegramClient(
            StringSession(session), api_id, api_hash,
            device_model='koora-news', system_version='1.0',
            app_version='1.0', lang_code='en')
        if not cl.is_connected():
            cl.connect()
        ok = bool(cl.is_user_authorized())
        print('animation: reader session %s' % ('connected' if ok else 'NOT authorized'))
        _TELE['tried'] = True          # never retry per post
        _TELE['client'] = cl if ok else None
    except Exception as e:
        print('reader session failed: %s' % str(e)[:70])
        _TELE['tried'] = True
        _TELE['client'] = None
    return _TELE['client']


def tele_media(mid, limit=48000000):
    """(true_kind, bytes) straight from telegram. true_kind is 'animation' for a
    real gif, 'video' for a normal clip, '' when the message has no document.
    bytes is None when the file exceeds the bot api's 50MB cap -- nothing can be
    done about that, so the caller frames it instead."""
    cl = _tele_client()
    if cl is None:
        return '', None
    try:
        if not cl.is_connected():
            cl.connect()
        msg = cl.get_messages('Offsideahdaff', ids=int(mid))
        if msg is None or getattr(msg, 'document', None) is None:
            return '', None
        doc = msg.document
        kind = 'video'
        try:
            from telethon.tl.types import (DocumentAttributeAnimated,
                                           DocumentAttributeVideo)
            for a in (doc.attributes or []):
                if isinstance(a, DocumentAttributeAnimated):
                    kind = 'animation'
                elif isinstance(a, DocumentAttributeVideo):
                    kind = 'video'
        except Exception:
            pass
        size = int(getattr(doc, 'size', 0) or 0)
        if size > limit:
            # too big for the bot api. Take it once, shrink it just enough,
            # and only frame it if that cannot be done.
            raw = cl.download_media(msg, bytes)
            if raw and len(raw) > limit:
                print('animation: #%d %s is %d bytes - over the cap, '
                      'compressing to fit' % (mid, kind, size))
                small, _crf = compress_video(raw, limit)
                if small:
                    return kind, small
            print('animation: #%d %s is %d bytes and will not fit - '
                  'posting its frame' % (mid, kind, size))
            return kind, None
        out = cl.download_media(msg, bytes)
        return kind, (out if out and len(out) <= limit else None)
    except Exception as e:
        print('animation fetch failed #%s: %s' % (mid, str(e)[:80]))
        return '', None


def tele_animation(mid, limit=48000000):
    """The real clip bytes via a user session, or None. Kept as a thin wrapper
    so callers that only want bytes do not care about the type."""
    return tele_media(mid, limit)[1]


def send_post(target, body, out, video=None, animation=None):
    """Deliver one post. Video first (streamable upload, same caption rules),
    then photo, then text-only. Long captions (>1024) split into media +
    full-text follow-up. Returns True on delivery, None when nothing to send,
    False on failure. Never mentions or tags anyone."""
    # English-only channel, enforced here so no code path can leak Arabic:
    # media is still delivered, the Arabic caption is dropped.
    if body and has_arabic(body):
        print('blocked: arabic caption refused by send_post')
        if not (video or animation or out):
            return None
        body = ''
    try:
        if animation:
            params = {'chat_id': target}
            if body:
                params['caption'] = body[:1024]
            r = bot('sendAnimation', params,
                    files={'animation': ('clip.mp4' if animation[:4] != b'GIF8'
                                         else 'clip.gif', animation)})
            if not (r or {}).get('ok'):
                print('animation rejected:', str((r or {}).get('description'))[:100])
                return False
            return True
        if video:
            if body and len(body) > 1024:
                r1 = bot('sendVideo', {'chat_id': target, 'caption': body[:950] + '\r\n\u2026',
                                      'supports_streaming': True},
                         files={'video': ('news.mp4', video)})
                if not (r1 or {}).get('ok'):
                    print('video rejected:', str((r1 or {}).get('description'))[:100])
                    return False
                r2 = bot('sendMessage', {'chat_id': target, 'text': body[:3900],
                                        'disable_web_page_preview': False})
                if not (r2 or {}).get('ok'):
                    print('text rejected:', str((r2 or {}).get('description'))[:100])
                    return False
                return True
            params = {'chat_id': target, 'supports_streaming': True}
            if body:
                params['caption'] = body[:1024]
            r = bot('sendVideo', params, files={'video': ('news.mp4', video)})
            if not (r or {}).get('ok'):
                print('video rejected:', str((r or {}).get('description'))[:100])
                return False
            return True
        if out:
            if body and len(body) > 1024:
                r1 = bot('sendPhoto', {'chat_id': target, 'caption': body[:950] + '\r\n\u2026'},
                         files={'photo': (photo_name(out), out)})
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
            r = bot('sendPhoto', params, files={'photo': (photo_name(out), out)})
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
    _SINGLE.clear()
    try:
        items = scrape_offside_preview()
    except Exception as e:
        print('preview fetch failed:', type(e).__name__, str(e)[:100])
        return 0
    seed_seen(state, target)
    last = int(state.get('offside', 0) or 0)
    # Retry queue: keys whose send failed on an earlier run. A transient
    # Telegram rejection used to bury the post forever because offside
    # advanced past it. Now failures are remembered and retried; each key
    # gets 3 attempts before we give up loudly.
    tries = state.get('post_retry')
    if not isinstance(tries, dict):
        tries = {}
        state['post_retry'] = tries
    for k in list(tries):
        try:
            tries[int(k)] = int(tries.pop(k))
        except Exception:
            tries.pop(k, None)
    by_key = {x['key']: x for x in items}
    work = []
    for k in sorted(tries):
        if k in by_key:
            work.append(by_key[k])
        else:
            print('dropping retry #%d: left the preview window' % k)
            tries.pop(k, None)
    queued = {x['key'] for x in work}
    fresh = [x for x in items if x['key'] > last and x['key'] not in queued]
    work.extend(fresh)
    posted = 0
    for x in work:
        if posted >= MAX_POSTS_PER_RUN:
            break
        txt = usable_text(x['text'])
        if not txt and not x['photo']:
            print('skipped empty #%d (no text, no photo)' % x['key'])
            state['offside'] = x['key']
            continue
        src_txt = full_text(x['key'], txt)  # never mention/tag source
        # Translate BEFORE the repeat check: the seeded window holds the
        # English captions actually posted, so only the English fingerprint
        # can match them when state was lost or rolled back.
        body = llm_fix(src_txt)
        if already_posted(state, src_txt, body):
            print('skipped repeat #%d fp=%s' % (x['key'], fingerprint(src_txt)))
            state['offside'] = x['key']
            continue
        if is_promo(src_txt) or is_promo(body):
            print('skipped promo post #%d' % x['key'])
            state['offside'] = x['key']
            continue
        body = with_link(body, match_link(src_txt))
        kind, vurl = source_media(x['key'], also=x.get('preview_video'))
        vid = None
        anim = None
        if kind in ('video', 'animation'):
            # Telegram knows the real type (gif vs normal clip) and the real
            # bytes; the web preview cannot always tell or serve them.
            tkind, blob = tele_media(x['key'])
            if tkind and blob:
                if tkind == 'animation':
                    anim = blob
                    print('#%d: real GIF (%d bytes)' % (x['key'], len(blob)))
                else:
                    vid = blob
                    print('#%d: real VIDEO (%d bytes)' % (x['key'], len(blob)))
            elif tkind:
                print('#%d: %s too large for the bot api -> framing it'
                      % (x['key'], tkind))
            elif vurl:
                vid = dl_video(vurl)
                print('#%d: no session, web preview VIDEO (%d bytes)'
                      % (x['key'], len(vid or b'')))
                if not vid:
                    print('#%d: VIDEO FAILED -> falling back to photo' % x['key'])
            elif kind == 'animation':
                print('#%d: GIF but neither telegram nor the preview gave '
                      'bytes; framing it' % x['key'])
        else:
            print('#%d: source has no video (kind=%s)' % (x['key'], kind))
        img = None
        if not vid and not anim:
            url = post_photo(x['key'], x.get('photo') or '')
            if url:
                try:
                    img = dl_photo(url)
                except Exception:
                    img = None
        try:
            out = None
            if img:
                kind, got = brand_photo(img)
                out = got if kind == 'photo' else None  # branding: text only
            result = send_post(target, body, out, vid, anim)
            if result is True:
                posted += 1
                tries.pop(x['key'], None)
                print('#%d: posted %s' % (
                    x['key'], 'GIF' if anim else ('VIDEO' if vid else
                        ('PHOTO' if out else 'TEXT'))))
                record_seen(state, src_txt, body)
            elif result is False:
                n = int(tries.get(x['key'], 0) or 0) + 1
                if n > 3:
                    print('#%d: SEND FAILED %d times, giving up (post lost)'
                          % (x['key'], n))
                    tries.pop(x['key'], None)
                else:
                    print('#%d: SEND FAILED (attempt %d/3), will retry next run'
                          % (x['key'], n))
                    tries[x['key']] = n
        except Exception as e:
            print('post failed:', str(e)[:120])
        state['offside'] = x['key']
        time.sleep(2)
    save_state(state)
    print('preview: %d new (%d queued retries), posted=%d'
          % (len(fresh), len(work) - len(fresh), posted))
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
    # The session exists for GIF/video fetching. The private Kurdish source is a
    # separate, never-requested feed, so it stays off unless explicitly enabled.
    if os.environ.get('ENABLE_KURDISH_SOURCE', '').strip() not in ('1', 'true', 'yes'):
        print('Kurdish source disabled by default (set ENABLE_KURDISH_SOURCE=1 to '
              'turn it on). posted=%d' % posted)
        return 0
    print('reader creds present: pulling Kurdish source too (already posted=%d).' % posted)

    # blocking client: the async one returns coroutines that nothing awaits
    from telethon.sessions import StringSession
    from telethon.sync import TelegramClient
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
                    if already_posted(state, txt, body):
                        print('skipped repeat (kurdish)')
                        state[src['key']] = m.id
                        time.sleep(2)
                        continue
                    raw = None
                    kanim = None
                    try:
                        if getattr(m, 'photo', None):
                            raw = client.download_media(m.photo, bytes)
                    except Exception:
                        raw = None
                    kvid = None
                    try:
                        if getattr(m, 'animation', None):
                            kanim = client.download_media(m.animation, bytes)
                            if kanim and len(kanim) > 48000000:
                                kanim = None
                        elif getattr(m, 'video', None):
                            kvid = client.download_media(m.video, bytes)
                            if kvid and len(kvid) > 48000000:
                                kvid = None
                    except Exception:
                        kvid = None
                        kanim = None
                    try:
                        out = None
                        if raw and not kvid:
                            kind, got = brand_photo(raw)
                            out = got if kind == 'photo' else None
                        if is_promo(txt) or is_promo(body):
                            print('skipped promo post (kurdish)')
                        elif send_post(target, body, out, kvid, kanim) is True:
                            posted += 1
                            record_seen(state, txt, body)
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
