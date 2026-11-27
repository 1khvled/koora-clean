"""Telegram public web-preview scraper, promo/link scrubbers, and web
photo/video downloaders for scripts/tg_news.py.
"""
import io
import json
import os
import re
import urllib.error
import urllib.request

_LOGO = None

def http_get_text(url, timeout=25):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')


AVATAR_URL = ''


def _tag_span(seg, ds, tag):
    """(start, end) of the balanced <tag>...</tag> opening at ds, else None.
    Shared by the quote cut and the photo-region finder. Never raises."""
    try:
        depth, p = 0, ds
        open_t, close_t = '<' + tag, '</' + tag + '>'
        while p < len(seg or ''):
            if seg.startswith(open_t, p) and (len(seg) == p + len(open_t) or not seg[p + len(open_t)].isalnum()):
                depth += 1
                p += len(open_t)
            elif seg.startswith(close_t, p):
                depth -= 1
                p += len(close_t)
                if not depth:
                    return (ds, p)
            else:
                p += 1
    except Exception:
        pass
    return None


def _in_tag(seg, pos):
    """True when pos sits inside an HTML tag (not text/CSS content)."""
    try:
        s = seg or ''
        return s.rfind('<', 0, pos) > s.rfind('>', 0, pos)
    except Exception:
        return False


def _msg_span(html, mid):
    """One message's own region: enclosing tgme_widget_message_wrap to the
    next one. data-post markers are sparse on single pages (neighbors carry
    only href links), so marker-to-marker scoping balloons to ~30KB spanning
    many posts — and biggest() then attaches a NEIGHBOR's photo/video.
    Fail-open: falls back to the marker with a length cap. Never raises."""
    try:
        tag = 'data-post="Offsideahdaff/%s"' % int(mid)
        h = html or ''
        i = h.find(tag)
        if i < 0:
            return ''
        ws = h.rfind('tgme_widget_message_wrap', 0, i)
        if ws >= 0:
            ds = h.rfind('<div', 0, ws)
            start = ds if ds >= 0 else ws
        else:
            start = i
        wn = h.find('tgme_widget_message_wrap', i + len(tag))
        end = wn if wn > 0 else i + 30000
        return h[start:end]
    except Exception:
        return ''


def _cut_quote(seg):
    """Remove the reply-quote element (it carries the PARENT post's thumbnail:
    without this, biggest() can attach another post's photo). The element is
    an <a> or a <div>. Fail-open: returns seg unchanged when the shape is
    unexpected. Never raises."""
    try:
        import re as _re
        i = (seg or '').find('tgme_widget_message_reply')
        if i < 0 or not _in_tag(seg, i):
            return seg
        m = _re.search(r'<(a|div)\b[^>]*$', (seg or '')[:i])
        if not m:
            return seg
        span = _tag_span(seg, m.start(), m.group(1))
        if not span:
            return seg
        return seg[:span[0]] + seg[span[1]:]
    except Exception:
        return seg


def _photo_regions(seg):
    """(start, end) spans of message-photo elements (the post's OWN photos).
    The class may sit on a wrapper with the URL in a nested tag, so spans are
    used instead of same-tag matching. Never raises."""
    import re as _re
    regs = []
    try:
        for m in _re.finditer(r'tgme_widget_message_photo', seg or ''):
            if not _in_tag(seg, m.start()):
                continue
            subm = _re.search(r'<(a|div)\b[^>]*$', (seg or '')[:m.start()])
            if not subm:
                continue
            span = _tag_span(seg, subm.start(), subm.group(1))
            if span and span not in regs:
                regs.append(span)
    except Exception:
        pass
    return regs


def _own_photos(seg):
    """Photo URLs living inside the post's own message-photo elements, in
    page order, avatar excluded. Never raises."""
    try:
        regs = _photo_regions(seg)
        out = []
        for pat in (r'<img[^>]+src="(https://cdn\d*\.telesco\.pe/[^"]+)"',
                    r"background-image:url\('([^']+)'"):
            for m in re.finditer(pat, seg or ''):
                u = m.group(1)
                if 'telesco.pe' not in u or u == AVATAR_URL or u in out:
                    continue
                if any(a <= m.start() < b for a, b in regs):
                    out.append(u)
        return out
    except Exception:
        return []


def own_text(b):
    """THIS message's own text from a t.me/s block: the reply-quote (the
    PARENT's text, rendered FIRST in the block) is cut before extraction,
    then the own text div is depth-walked -- nested markup cannot truncate
    it and the footer (views/time) cannot leak in. Same normalization as
    the old inline extraction: br->newline, tags stripped, entities
    decoded, space runs collapsed, trimmed. '' when no text. Never
    raises."""
    try:
        seg = _cut_quote(b)
        j = seg.find('tgme_widget_message_text')
        if j < 0:
            return ''
        k = seg.find('>', j)
        if k < 0:
            return ''
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
        return re.sub(r'[ \t\xa0]+', ' ', _h.unescape(t)).strip()
    except Exception:
        return ''


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
        txt = own_text(b)
        rm = re.search(r'tgme_widget_message_reply[^>]*href="[^"]*/(\d+)"', b)
        # Quote carries the parent post's thumbnail: cut it before collecting
        # this post's photos (else biggest() can attach another post's photo).
        bq = _cut_quote(b)
        pm = _own_photos(bq)
        pm += [u for u in re.findall(r'<img[^>]+src="(https://cdn\d*\.telesco\.pe/[^"]+)"', bq)
               if u not in pm]
        pm += [u for u in re.findall(r"background-image:url\('([^']+)'", bq)
               if 'telesco.pe' in u and u not in pm]
        pm = [u for u in pm if 'telesco.pe' in u]
        pv = [u for u in re.findall(r'<video[^>]+src="([^"]+)"', b)
              if '.mp4' in u]
        rm = re.search(r'tgme_widget_message_reply[^>]*href="[^"]*/(\d+)"', b)
        out.append({'key': mid, 'text': txt, 'photos': pm,
                    'preview_video': pv[0] if pv else '',
                    'reply_to': int(rm.group(1)) if rm else 0})
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
_GAM_HARD = (r'قمار|مراهن|كازينو|1xbet|melbet|betway|linebet|megapari|stake\.com|'
             r'برومو\s?كود|promo\s?code|بونص|'
             # english (posts are translated before this filter runs)
             r'\b(?:betting|sportsbook|bookmaker|casino|jackpot)\b'
             r'|\b(?:1xbet|betway|linebet|megapari|bet365|betfair|stake\.com)\b'
             r'|\bwager(?:ing|ed)?\b|\bfree\s?bet\b|\bbet\s?now\b'
             r'|\bbetting\s?tips?\b'
             r'|\bpromo(?:tion)?\s?code\b|\bbonus\s?code\b'
             r'|\bwin\s+(?:cash|money|usd|egp|gbp|eur|\d{3,})\b')
_AD_STORE = (r'كود\s*خصم|كوبون|قسيمة|للطلب|اطلب\s+الآن|اشتر(?!ك)|متجر|ستور|'
             r'تخفيضات|خصومات|شحن|'
             # english
             r'\b(?:shop|order|buy|subscribe|install)\s?(?:now|today)\b'
             r'|\b(?:discount\s?code|coupon|voucher|free\s+shipping)\b'
             r'|\b(?:play\s?store|app\s?store|in-app)\b|\b\d+\s?%\s*off\b')
_AD_PRICE = r'سعر|أسعار|ثمن|تكلفة|\b(?:prices?|discount)\s?\d*%?|\b\d+\s?%\s*off\b'
_AD_PRODUCT = (r'نسخة|تحميل|لعبة|ألعاب|جهاز|بلايستيشن|اكس\s?بوكس|حساب|اشتراك'
                r'|\b(?:download|install|premium|subscription)\b'
                r'|\bplaystation\b|\bxbox\b|\bsteam\b')


def is_promo(t):
    """Betting + store-ad filter (owner: no gambling ads, no ads period).
    BLATANT ONLY: hard brands, casino words, promo codes, explicit buy /
    order / discount CTAs, and percent-off lines match alone; money+contest
    and price+product pairs must co-occur. Everyday football language
    ("at stake", "kicked off", subscribe footers, punditry, team names)
    never matches. Ticket posts stay exempt; punditry ("توقع") and salary /
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


_SCHED_AR_DIACRITICS = re.compile(r'[\u064B-\u065F\u0670\u0640]')
_SCHED_AR_HEAD = re.compile(
    r'^\W*(?:(?:عاجل|رسمياً|رسميا)\s*[:|\-–—]\s*)?'
    r'(?:جدول\s+|مواعيد\s+|(?:ابرز|أبرز|اهم|أهم)\s+)?'
    r'مباريات\s+(?:اليوم|الغد|هذا\s+اليوم|الليلة)\b'
)
_SCHED_AR_DAY = re.compile(
    r'(?:السبت|الأحد|الاحد|الإثنين|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة)'
    r'|\d{1,2}\s*[:.]\s*\d{2}'
)
_SCHED_EN_HEAD = re.compile(
    r"^\W*(?:today'?s\s+(?:matches|fixtures|games|schedule)"
    r"|matches\s+(?:set\s+for|of\s+the\s+day|for\s+today|today)"
    r"|fixtures\s+(?:for\s+)?(?:today|\w+day))\b",
    re.I,
)


def is_daily_schedule(t):
    """Detect source daily-matches schedule posts (e.g. Offsideahdaff's
    '• مُباريات اليوم: الجمعة 27 نوفمبر 2026.') so the bridge skips them
    and lets our own daily matches board be the channel's sole schedule."""
    raw = (t or '').strip()
    if not raw:
        return False
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    first = _SCHED_AR_DIACRITICS.sub('', lines[0])
    if _SCHED_AR_HEAD.search(first):
        norm = _SCHED_AR_DIACRITICS.sub('', raw)
        if len(norm) <= 220 or len(lines) <= 2 or _SCHED_AR_DAY.search(norm):
            return True
    if _SCHED_EN_HEAD.search(lines[0]):
        if len(raw) <= 220 or len(lines) <= 2 or re.search(
            r'\b(?:mon|tue|wed|thu|fri|sat|sun)\w*day\b|\d{1,2}\s*[:.]\s*\d{2}',
            raw, re.I,
        ):
            return True
    return False


def usable_text(t):
    # Autonomous posting: everything goes out, even one-liners and photo-only
    # items. Only truly empty texts and bot commands are skipped.
    t = (t or '').strip()
    if len(t) < 3:
        return ''
    if t.startswith('/'):
        return ''
    return t[:3900]



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
        seg = _cut_quote(_msg_span(html, mid))
        if not seg:
            return ''
        return seg
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
        seg = _cut_quote(_msg_span(html, mid))
        own = _own_photos(seg)
        cands = list(own)
        for pat in (r'<img[^>]+src="(https://cdn\d*\.telesco\.pe/[^"]+)"',
                    r"background-image:url\('([^']+)'"):
            for m in re.finditer(pat, seg):
                u = m.group(1)
                if 'telesco.pe' in u and u != AVATAR_URL and u not in cands:
                    cands.append(u)
        # Own message-photo first: biggest() must choose among THIS post's
        # photos, never a quote/chrome leftover. No own-container photo ->
        # legacy behavior (biggest of everything).
        photo = biggest(own) if own else biggest(cands)
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



_TLINK = re.compile(r'(?i)\b(?:https?://)?(?:t\.me|telegram\.me|telegram\.dog)/[A-Za-z0-9_+-]+/?[^\s<>"]*')


def scrub_links(text):
    """Remove Telegram invite/channel links from post text (a reposted channel
    promo leaks someone else's channel into ours). Keeps everything else
    byte-identical, collapses leftover blank lines. Ordinary http(s) links
    (our player links) are untouched. Never raises."""
    try:
        import re as _re
        t = _TLINK.sub('', text or '')
        t = _re.sub(r'[ \t\xa0]+', ' ', t)
        t = _re.sub(r'\n[ \t]*\n(?:[ \t]*\n)*', '\n\n', t)
        return t.strip()
    except Exception:
        return text


def was_link_only(text):
    """True when the text is nothing but channel-invite links (a bare promo).
    Distinguishes terminal ad-skips from transient empty bodies (failed
    translation), which must join the retry queue instead. Never raises."""
    try:
        return bool((text or '').strip()) and scrub_links(text) == ''
    except Exception:
        return False



def photo_name(b):
    """news.png for PNG originals, news.jpg otherwise (bytes untouched)."""
    try:
        if (b or b'')[:8] == b'\x89PNG\r\n\x1a\n':
            return 'news.png'
    except Exception:
        pass
    return 'news.jpg'


