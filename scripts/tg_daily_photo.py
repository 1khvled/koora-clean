# -*- coding: utf-8 -*-
"""One daily matches photo for the English-only channel.

Called from scripts/tg_news.py on every scheduled run. Posts at most ONE
photo per UTC calendar day, using a persisted state key that is written ONLY
after Telegram confirms the send. Everything here is fail-open: a dead API, a
bad fixture, a font problem or a rejected send is logged and swallowed, so the
news bridge can never be broken by this feature.

No secrets are stored: the bot token and chat id come from tg.env_or_cfg()
(environment secret first, committed config fallback). The token is never
printed. No source is named, tagged or linked anywhere in the image/caption.

Data: FotMob (primary, English names) -> ESPN (fallback, English names) ->
Tifo (last resort; its Arabic team rows are skipped, never transliterated).
"""
import datetime
import io
import json
import os
import re
import tempfile
import urllib.request
import uuid

import tg_news as tg

STATE_KEY = 'last_daily_photo_date'
MAX_ROWS = 30
FETCH_TIMEOUT = 10
WIDTH = 1000
PAD = 24
TITLE_H = 64
COL_H = 34
ROW_H = 34
FOOTER_H = 40

SOURCES = (
    ('FotMob',
     'https://www.fotmob.com/api/data/matches?date={date}',
     {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.fotmob.com/en-GB'}),
    ('ESPN',
     'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard'
     '?dates={date}&limit=500',
     {'User-Agent': 'Mozilla/5.0'}),
    ('Tifo',
     'https://tifo.elyoxe.com/v1/all/{date}.json',
     {'User-Agent': 'Mozilla/5.0'}),
)

# FotMob statusId -> short status shown in the right column. Scheduled (1)
# deliberately maps to '' because the kickoff time already sits in TIME.
_FOTMOB_STATUS = {1: '', 2: '1H', 3: '2H', 10: 'HT', 6: 'FT', 106: 'Canc'}


# --------------------------------------------------------------------------
# date helpers ("today" is UTC: the same day the API's date= parameter uses)
# --------------------------------------------------------------------------
def today_utc():
    return datetime.datetime.now(datetime.timezone.utc).date()


def date_str(day=None):
    return (day or today_utc()).strftime('%Y%m%d')


def date_display(day=None):
    return (day or today_utc()).strftime('%Y-%m-%d')


# --------------------------------------------------------------------------
# normalising helpers
# --------------------------------------------------------------------------
def _clean_name(value):
    return re.sub(r'\s+', ' ', str(value or '').strip())[:80]


def _utc_key(value):
    """Sortable 'YYYY-MM-DDTHH:MM' UTC key from the kickoff shapes we see."""
    s = str(value or '').strip()
    if not s:
        return ''
    try:
        dt = datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt.astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M')
    except Exception:
        pass
    m = re.match(r'(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})', s)
    if m:
        return '%s-%s-%sT%s' % (m.group(3), m.group(2), m.group(1), m.group(4))
    if s.isdigit() and len(s) >= 10:
        try:
            v = int(s)
            if v > 100000000000:  # milliseconds
                v //= 1000
            return datetime.datetime.fromtimestamp(
                v, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M')
        except Exception:
            pass
    return ''


def _hhmm(key):
    return key[11:16] if len(key) >= 16 else '--:--'


def _redact(text, token=''):
    """Never let a token leak into a log line (an exception may quote a URL)."""
    s = str(text or '')
    if token:
        s = s.replace(str(token), '***')
    return s[:120]


def _match(time_key, home, away, status, league_order):
    return {'time': _hhmm(time_key), 'sort': time_key, 'home': home,
            'away': away, 'status': status, 'league_order': league_order}


def _english(home, away):
    """Tifo can carry Arabic names: skip those rows, never transliterate."""
    return bool(home and away and not tg.has_arabic(home)
                and not tg.has_arabic(away))


# --------------------------------------------------------------------------
# source parsers (each returns normalised, English-only match dicts)
# --------------------------------------------------------------------------
def parse_fotmob(data):
    out = []
    try:
        for order, league in enumerate(data.get('leagues') or []):
            if not isinstance(league, dict):
                continue
            for m in (league.get('matches') or []):
                if not isinstance(m, dict):
                    continue
                h, a = m.get('home') or {}, m.get('away') or {}
                home, away = _clean_name(h.get('name')), _clean_name(a.get('name'))
                if not _english(home, away):
                    continue
                st = m.get('status') or {}
                key = _utc_key(st.get('utcTime') or m.get('timeTS') or m.get('time'))
                hs, as_ = h.get('score'), a.get('score')
                sid = m.get('statusId')
                cancelled = bool(st.get('cancelled')) or sid == 106
                live = bool(st.get('started')) or sid in (2, 3, 10)
                done = bool(st.get('finished')) or sid == 6
                if cancelled:
                    status = 'Canc'
                elif hs is not None and as_ is not None and (live or done):
                    status = '%s-%s' % (hs, as_)
                else:
                    status = _FOTMOB_STATUS.get(sid, 'LIVE' if live else
                                                ('FT' if done else ''))
                out.append(_match(key, home, away, status, order))
    except Exception:
        return []
    return out


def parse_espn(data):
    out = []
    try:
        for order, ev in enumerate(data.get('events') or []):
            if not isinstance(ev, dict):
                continue
            comps = ev.get('competitions') or []
            comp = comps[0] if comps and isinstance(comps[0], dict) else {}
            home = away = ''
            hs = as_ = None
            for c in (comp.get('competitors') or []):
                if not isinstance(c, dict):
                    continue
                team = c.get('team') or {}
                name = _clean_name(team.get('displayName') or team.get('name'))
                if str(c.get('homeAway')) == 'home':
                    home, hs = name, c.get('score')
                elif str(c.get('homeAway')) == 'away':
                    away, as_ = name, c.get('score')
            if not _english(home, away):
                continue
            typ = ((ev.get('status') or {}).get('type') or
                   (comp.get('status') or {}).get('type') or {})
            tname = str(typ.get('name') or '').upper()
            key = _utc_key(ev.get('date') or comp.get('date'))
            if 'CANCEL' in tname:
                status = 'Canc'
            elif 'POSTPONE' in tname:
                status = 'Pstp'
            elif hs is not None and as_ is not None and (
                    'FINAL' in tname or 'PROGRESS' in tname or typ.get('completed')):
                status = '%s-%s' % (hs, as_)
            elif 'PROGRESS' in tname or 'LIVE' in tname:
                status = 'LIVE'
            elif 'FINAL' in tname:
                status = 'FT'
            else:
                status = ''
            out.append(_match(key, home, away, status, order))
    except Exception:
        return []
    return out


def parse_tifo(data):
    """Last resort: usable only if a row already carries Latin team names."""
    out = []
    try:
        rows = data if isinstance(data, list) else (
            data.get('matches') or data.get('data') or data.get('games') or [])
        for order, m in enumerate(rows):
            if not isinstance(m, dict):
                continue
            home = _clean_name(m.get('home') or m.get('home_team') or
                               (m.get('homeTeam') or {}).get('name'))
            away = _clean_name(m.get('away') or m.get('away_team') or
                               (m.get('awayTeam') or {}).get('name'))
            if not _english(home, away):
                continue
            key = _utc_key(m.get('date') or m.get('time') or m.get('kickoff'))
            out.append(_match(key, home, away, '', order))
    except Exception:
        return []
    return out


_PARSERS = {'FotMob': parse_fotmob, 'ESPN': parse_espn, 'Tifo': parse_tifo}


def _get_json(url, headers):
    req = urllib.request.Request(url, headers=headers or {'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as r:
        return json.loads(r.read(4000000).decode('utf-8', 'replace'))


def fetch_today(date_value=None, fetcher=None):
    """FotMob -> ESPN -> Tifo. Never raises; [] on any error (fail-open)."""
    ds = date_value or date_str()
    get = fetcher or _get_json
    for name, url_tpl, headers in SOURCES:
        try:
            data = get(url_tpl.format(date=ds), headers)
            matches = _PARSERS[name](data)
            if matches:
                print('daily photo: %d matches from %s' % (len(matches), name))
                return matches
        except Exception as e:
            print('daily photo: %s unavailable (%s)' % (name, type(e).__name__))
    return []


def select_matches(matches, limit=MAX_ROWS):
    """Prefer the first leagues the source lists (top competitions first),
    then show the chosen subset ordered by kickoff time. Bounded to `limit`."""
    try:
        ordered = sorted(matches, key=lambda m: (int(m.get('league_order', 999)),
                                                 str(m.get('sort') or '')))
        picked = ordered[:limit]
        return sorted(picked, key=lambda m: (str(m.get('sort') or ''),
                                             int(m.get('league_order', 999))))
    except Exception:
        return list(matches or [])[:limit]


# --------------------------------------------------------------------------
# image rendering (Pillow, system DejaVuSans, English text only)
# --------------------------------------------------------------------------
def header_text(date_display_value):
    return "Today's matches - " + date_display_value


def caption_text(date_display_value, count):
    return "Today's matches: %s (%d matches)" % (date_display_value, count)


def image_text(matches, date_display_value):
    """Every human-readable string drawn into the PNG, newline-joined.

    Exposed so tests can assert the rendered content is English-only."""
    parts = [header_text(date_display_value), 'TIME', 'MATCH', 'STATUS']
    for m in matches:
        parts.append('%s | %s v %s | %s' % (
            m.get('time'), m.get('home'), m.get('away'), m.get('status')))
    parts.append('%d matches' % len(matches))
    return '\n'.join(parts)


def _font(size, bold=False):
    from PIL import ImageFont
    names = (['DejaVuSans-Bold.ttf'] if bold else ['DejaVuSans.ttf'])
    paths = ['/usr/share/fonts/truetype/dejavu/' + names[0], names[0]]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size=size)
    except Exception:
        return ImageFont.load_default()


def _fit(draw, text, font, max_px):
    if not text or draw.textlength(text, font=font) <= max_px:
        return text or ''
    ell = '...'
    keep = ''
    for ch in text:
        if draw.textlength(keep + ch, font=font) + draw.textlength(ell, font=font) > max_px:
            break
        keep += ch
    return keep.rstrip() + ell


def render_png(matches, date_display_value):
    """Draw the PNG in memory. 1000px wide, 16px rows, alternating shading."""
    from PIL import Image, ImageDraw
    rows = list(matches)
    height = TITLE_H + COL_H + max(1, len(rows)) * ROW_H + FOOTER_H
    img = Image.new('RGB', (WIDTH, height), (255, 255, 255))
    d = ImageDraw.Draw(img)
    f_title, f_col, f_row = _font(22, True), _font(14, True), _font(16)

    d.rectangle([0, 0, WIDTH, TITLE_H], fill=(18, 26, 43))
    d.text((PAD, (TITLE_H - 22) // 2), header_text(date_display_value),
           font=f_title, fill=(255, 255, 255))

    y0 = TITLE_H
    d.rectangle([0, y0, WIDTH, y0 + COL_H], fill=(232, 236, 243))
    x_time, x_match, x_right = PAD, PAD + 96, WIDTH - PAD
    d.text((x_time, y0 + 10), 'TIME', font=f_col, fill=(70, 80, 95))
    d.text((x_match, y0 + 10), 'MATCH', font=f_col, fill=(70, 80, 95))
    d.text((x_right - d.textlength('STATUS', font=f_col), y0 + 10),
           'STATUS', font=f_col, fill=(70, 80, 95))

    for i, m in enumerate(rows):
        ry = y0 + COL_H + i * ROW_H
        if i % 2:
            d.rectangle([0, ry, WIDTH, ry + ROW_H], fill=(246, 248, 251))
        d.line([0, ry + ROW_H, WIDTH, ry + ROW_H], fill=(225, 230, 237), width=1)
        ty = ry + (ROW_H - 16) // 2
        d.text((x_time, ty), m.get('time') or '--:--', font=f_row, fill=(30, 40, 55))
        pair = _fit(d, '%s  v  %s' % (m.get('home'), m.get('away')),
                    f_row, x_right - x_match - 130)
        d.text((x_match, ty), pair, font=f_row, fill=(20, 28, 42))
        status = m.get('status') or ''
        d.text((x_right - d.textlength(status, font=f_row), ty), status, font=f_row,
               fill=(200, 45, 45) if status in ('LIVE', '1H', '2H', 'HT') else (30, 40, 55))

    fy = y0 + COL_H + len(rows) * ROW_H
    d.rectangle([0, fy, WIDTH, height], fill=(232, 236, 243))
    d.text((PAD, fy + 10), '%d matches' % len(rows), font=f_col, fill=(70, 80, 95))

    out = io.BytesIO()
    img.save(out, format='PNG', optimize=True)
    return out.getvalue()


def render_image(matches, date_display_value):
    """Save the PNG to a tempfile OUTSIDE the repo. Returns (path, bytes)."""
    png = render_png(matches, date_display_value)
    tf = tempfile.NamedTemporaryFile(prefix='tg_daily_', suffix='.png', delete=False)
    try:
        tf.write(png)
    finally:
        tf.close()
    return tf.name, png


# --------------------------------------------------------------------------
# sendPhoto via a small stdlib multipart uploader (never prints the token)
# --------------------------------------------------------------------------
def _send_photo_bytes(png, caption, tgmod=None, timeout=30):
    """POST sendPhoto as multipart/form-data. Returns the parsed API response
    (or {'ok': False, ...}) and never raises."""
    T = tgmod or tg
    token = ''
    try:
        token = T.env_or_cfg('TELEGRAM_BOT_TOKEN', 'bot_token')
        chat = T.env_or_cfg('TARGET_CHAT', 'target_chat')
        if not token or not chat:
            return {'ok': False, 'description': 'missing token or chat_id'}
        url = 'https://api.telegram.org/bot' + token + '/sendPhoto'
        boundary = uuid.uuid4().hex

        def field(name, value):
            return ('--' + boundary + '\r\n'
                    'Content-Disposition: form-data; name="' + name + '"\r\n\r\n'
                    + str(value) + '\r\n').encode('utf-8')

        body = field('chat_id', chat)
        if caption:
            body += field('caption', caption)
        body += ('--' + boundary + '\r\n'
                 'Content-Disposition: form-data; name="photo"; filename="today.png"\r\n'
                 'Content-Type: image/png\r\n\r\n').encode('utf-8')
        body += png + b'\r\n'
        body += ('--' + boundary + '--\r\n').encode('utf-8')

        req = urllib.request.Request(
            url, data=body, method='POST',
            headers={'Content-Type': 'multipart/form-data; boundary=' + boundary,
                     'User-Agent': 'MessiStat-DailyPhoto/1.0 (koora-clean)'})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode('utf-8', 'replace'))
        return data if isinstance(data, dict) else {'ok': False, 'description': 'bad reply'}
    except Exception as e:
        return {'ok': False, 'description': _redact(str(e) or type(e).__name__, token)}


# --------------------------------------------------------------------------
# once-per-day entry point
# --------------------------------------------------------------------------
def post_daily_photo(tgmod=None, day=None):
    """Post once per UTC calendar day. Writes the state key ONLY after a
    confirmed send. Fully fail-open: never raises into the posting loop."""
    T = tgmod or tg
    path = None
    try:
        d = day or today_utc()
        ds, disp = date_str(d), date_display(d)
        state = T.load_state()
        if str(state.get(STATE_KEY) or '') == ds:
            return False  # already posted today -- the only idempotence gate
        matches = fetch_today(ds)
        if not matches:
            print('daily photo: no fixtures for %s, skipping' % ds)
            return False
        picked = select_matches(matches)
        if not picked:
            return False
        caption = caption_text(disp, len(picked))
        # English-only moat: nothing Arabic / non-Latin reaches the channel.
        if T.has_arabic(caption + '\n' + image_text(picked, disp)) or \
                T.has_foreign_script(caption + '\n' + image_text(picked, disp)):
            print('daily photo: non-English text detected, skipping')
            return False
        path, png = render_image(picked, disp)
        result = _send_photo_bytes(png, caption, tgmod=T)
        if not (isinstance(result, dict) and result.get('ok')):
            try:
                tok = T.env_or_cfg('TELEGRAM_BOT_TOKEN', 'bot_token')
            except Exception:
                tok = ''
            print('daily photo: send failed (%s)' % _redact(
                (result or {}).get('description') or 'no response', tok))
            return False
        state[STATE_KEY] = ds
        T.save_state(state)
        print('daily photo: posted %d matches for %s' % (len(picked), ds))
        return True
    except Exception as e:
        try:
            tok = T.env_or_cfg('TELEGRAM_BOT_TOKEN', 'bot_token')
        except Exception:
            tok = ''
        print('daily photo: skipped (%s)' % _redact(str(e) or type(e).__name__, tok))
        return False
    finally:
        if path:
            try:
                os.unlink(path)
            except Exception:
                pass
