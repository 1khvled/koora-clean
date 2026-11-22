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

# Canvas geometry (the *_H names are asserted by the offline image tests).
WIDTH = 1000
PAD = 24
ACCENT_H = 6
TITLE_H = 76
COL_H = 34
ROW_H = 40
FOOTER_H = 44

# Team-crest badges (logo phase is bounded and fully fail-open).
LOGO_SIZE = 28
LOGO_MAX = 60                 # 30 matches x 2 teams, never more
LOGO_WORKERS = 10
LOGO_TIMEOUT = 2.5           # 6 rounds x 2.5s = ~15s worst case
BADGE_FILL = (24, 34, 62)
BADGE_OUTLINE = (100, 120, 160)

# Sports-broadcast palette: dark navy surfaces, team red, championship gold.
BG = (11, 16, 32)            # #0B1020 page background
SURFACE_A = (18, 26, 46)     # #121A2E row/card surface
SURFACE_B = (24, 34, 58)     # #18223A alternating row surface
COL_BG = (22, 32, 56)        # column-label band
RED = (220, 38, 38)          # #DC2626 primary accent (LIVE states, rules)
RED_2 = (239, 68, 68)        # #EF4444 secondary accent (the "v" separator)
GOLD = (251, 191, 36)        # #FBBF24 kickoff time + date
WHITE = (255, 255, 255)      # #FFFFFF team names / title
SLATE = (148, 163, 184)      # #94A3B8 muted labels / scheduled status
FT_GREEN = (110, 231, 183)   # #6EE7B7 finished results (muted emerald)
FT_PILL = (16, 45, 42)       # dark green pill behind a finished result
SLATE_PILL = (32, 44, 70)    # neutral pill for scheduled/cancelled matches
LINE = (40, 52, 80)          # subtle divider on the dark surfaces
PILL_W = 92
PILL_H = 22

# Type scale. Floor of 14px for metadata, 16px for match rows (never smaller).
FONT_TITLE = 34
FONT_DATE = 20
FONT_COL = 14
FONT_ROW = 16
FONT_PILL = 14
FONT_FOOT = 14
MIN_FONT_SIZE = 14

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
# Verified against live 20261122 payloads (200 image/png for real team ids).
_FOTMOB_LOGO = 'https://images.fotmob.com/image_resources/logo/teamlogo/%s.png'


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


def _match(time_key, home, away, status, league_order, logos=None):
    """A normalised match row. `logos` carries optional crest URL + team id."""
    logos = logos or {}
    return {'time': _hhmm(time_key), 'sort': time_key, 'home': home,
            'away': away, 'status': status, 'league_order': league_order,
            'home_logo': str(logos.get('home_logo') or ''),
            'away_logo': str(logos.get('away_logo') or ''),
            'home_tid': str(logos.get('home_tid') or ''),
            'away_tid': str(logos.get('away_tid') or '')}


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
                logos = {}
                for side, team in (('home', h), ('away', a)):
                    tid = team.get('id')
                    if tid not in (None, ''):
                        logos[side + '_tid'] = str(tid)
                        logos[side + '_logo'] = _FOTMOB_LOGO % tid
                out.append(_match(key, home, away, status, order, logos))
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
            home_team = away_team = {}
            for c in (comp.get('competitors') or []):
                if not isinstance(c, dict):
                    continue
                team = c.get('team') or {}
                name = _clean_name(team.get('displayName') or team.get('name'))
                if str(c.get('homeAway')) == 'home':
                    home, hs, home_team = name, c.get('score'), team
                elif str(c.get('homeAway')) == 'away':
                    away, as_, away_team = name, c.get('score'), team
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
            logos = {}
            for side, team in (('home', home_team), ('away', away_team)):
                url = team.get('logo') or ''
                tid = team.get('id')
                if url:
                    logos[side + '_logo'] = str(url)
                if tid not in (None, ''):
                    logos[side + '_tid'] = str(tid)
            out.append(_match(key, home, away, status, order, logos))
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
            logos = {}
            for side, keys in (('home', ('home_logo', 'homeLogo', 'home_crest')),
                               ('away', ('away_logo', 'awayLogo', 'away_crest'))):
                url = next((m.get(k) for k in keys if m.get(k)), '')
                if url:
                    logos[side + '_logo'] = str(url)
                    logos[side + '_tid'] = str(url)  # URL itself is the cache key
            out.append(_match(key, home, away, '', order, logos))
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
    """Uppercase broadcast title (the date is drawn separately on the right).

    Kept as one string so image_text()/the English-only moat still cover every
    human-readable value that reaches the PNG.
    """
    return "TODAY'S MATCHES - " + date_display_value


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
    """First Unicode-capable font available: runner (Linux) first, then Windows.

    DejaVuSans stays first for the CI runner; Segoe UI / Arial / Calibri make
    local previews render accented team names correctly. A font missing glyphs
    is never silently preferred over one that has them; load_default() is only
    the last-resort fail-open when no system font can be opened at all.
    """
    from PIL import ImageFont
    if bold:
        names = ('DejaVuSans-Bold.ttf', 'segoeuib.ttf', 'arialbd.ttf',
                 'calibrib.ttf', 'DejaVuSans.ttf', 'segoeui.ttf', 'arial.ttf')
    else:
        names = ('DejaVuSans.ttf', 'segoeui.ttf', 'arial.ttf', 'calibri.ttf',
                 'DejaVuSans-Bold.ttf', 'segoeuib.ttf', 'arialbd.ttf')
    paths = ['/usr/share/fonts/truetype/dejavu/' + names[0]]
    paths += list(names)
    paths += ['C:\\Windows\\Fonts\\' + n for n in names]
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


# --------------------------------------------------------------------------
# team crests: bounded, cached, fail-open; a monogram badge is the fallback
# --------------------------------------------------------------------------
_LOGO_CACHE = {}


def _initials(name, limit=3):
    """1-3 initials from an English team name for the fallback badge."""
    parts = [p for p in re.split(r'[^A-Za-z0-9]+', str(name or '')) if p]
    return (''.join(p[0] for p in parts[:limit]).upper() or '?')[:limit]


def _fetch_logo(url, timeout=LOGO_TIMEOUT):
    """One crest download -> RGBA image. Raises; _load_logos swallows it."""
    from PIL import Image
    req = urllib.request.Request(
        str(url), headers={'User-Agent': 'MessiStat-DailyPhoto/1.0 (koora-clean)'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read(200000)
    return Image.open(io.BytesIO(body)).convert('RGBA')


def _load_logos(matches, fetcher=None):
    """Return {team key: RGBA image or None}, at most LOGO_MAX unique teams.

    Uses a small thread pool and a process-level cache; never raises into the
    posting path. Both FotMob and ESPN crests are keyed by their team id.
    """
    get = fetcher or _fetch_logo
    wanted = {}
    for m in matches or []:
        for side in ('home', 'away'):
            key = str(m.get(side + '_tid') or '') or str(m.get(side + '_logo') or '')
            url = str(m.get(side + '_logo') or '')
            if key and url:
                wanted[key] = url
    items = list(wanted.items())[:LOGO_MAX]
    missing = [(k, u) for k, u in items if k not in _LOGO_CACHE]
    if missing:
        try:
            from concurrent.futures import ThreadPoolExecutor

            def work(pair):
                key, url = pair
                try:
                    return key, get(url)
                except Exception:
                    return key, None

            with ThreadPoolExecutor(max_workers=LOGO_WORKERS) as pool:
                for key, image in pool.map(work, missing):
                    _LOGO_CACHE[key] = image
        except Exception:
            for key, _ in missing:
                _LOGO_CACHE.setdefault(key, None)
    return {key: _LOGO_CACHE.get(key) for key, _ in items}


def _draw_monogram(img, d, x, y, name):
    """Dark circular badge with 1-3 gold initials (no emoji, no dependencies)."""
    x, y = int(x), int(y)
    d.ellipse([x, y, x + LOGO_SIZE - 1, y + LOGO_SIZE - 1],
              fill=BADGE_FILL, outline=BADGE_OUTLINE, width=1)
    font = _font(14, True)
    label = _fit(d, _initials(name), font, LOGO_SIZE - 6)
    tw = d.textlength(label, font=font)
    d.text((x + (LOGO_SIZE - tw) / 2, y + (LOGO_SIZE - FONT_FOOT) / 2 - 1),
           label, font=font, fill=GOLD)


def _draw_crest(img, d, x, y, image, name):
    """Paste a real crest with alpha; fall back to the monogram on any problem."""
    from PIL import Image as PILImage
    x, y = int(x), int(y)
    if image is not None:
        try:
            resample = getattr(getattr(PILImage, 'Resampling', PILImage),
                               'LANCZOS', 3)
            tile = image.resize((LOGO_SIZE, LOGO_SIZE), resample)
            img.paste(tile, (x, y), tile)
            return
        except Exception:
            pass
    _draw_monogram(img, d, x, y, name)


def _status_style(status):
    """Return (pill_fill, text_color) for a score/status value."""
    s = (status or '').strip()
    if s in ('LIVE', '1H', '2H', 'HT', 'ET', 'PEN'):
        return RED, WHITE                 # live: team red, white text (4.8:1)
    if s == 'FT' or re.match(r'^\d+\s*-\s*\d+$', s):
        return FT_PILL, FT_GREEN          # finished: muted emerald result
    return SLATE_PILL, SLATE              # blank / Canc / Pstp: quiet slate


def _draw_pair(img, d, x, y, logo_y, home, away, crests, f_team, f_v, max_px):
    """[crest] Home  v  [crest] Away on fixed columns like a broadcast board."""
    v_w = d.textlength('v', font=f_v)
    half = max(48, (int(max_px) - int(v_w) - 24) // 2)
    x_v = x + half
    x_away = x_v + int(v_w) + 14
    gap = LOGO_SIZE + 8
    x_home_text, x_away_text = x + gap, x_away + gap
    h = _fit(d, home or '', f_team, max(24, x_v - x_home_text - 8))
    a = _fit(d, away or '', f_team, max(24, int(max_px) - (x_away_text - x) - 2))
    _draw_crest(img, d, x, logo_y, crests[0], home)
    d.text((x_home_text, y), h, font=f_team, fill=WHITE)
    d.text((x_v, y), 'v', font=f_v, fill=RED_2)
    _draw_crest(img, d, x_away, logo_y, crests[1], away)
    d.text((x_away_text, y), a, font=f_team, fill=WHITE)


def _draw_pill(d, x_right, y_center, label, fill, color, font):
    """Right-aligned status block; an empty label stays a quiet placeholder."""
    x0 = int(x_right) - PILL_W
    y0 = int(y_center) - PILL_H // 2
    d.rounded_rectangle([x0, y0, x0 + PILL_W, y0 + PILL_H], radius=6, fill=fill)
    label = (label or '').strip() or '-'  # a dash reads as "upcoming", not missing
    label = _fit(d, label, font, PILL_W - 12)
    tw = d.textlength(label, font=font)
    d.text((x0 + (PILL_W - tw) / 2, y0 + (PILL_H - FONT_PILL) / 2 - 1),
           label, font=font, fill=color)


def render_png(matches, date_display_value):
    """Draw the PNG in memory: dark sports-broadcast board, 1000px wide."""
    from PIL import Image, ImageDraw
    rows = list(matches)
    height = TITLE_H + COL_H + max(1, len(rows)) * ROW_H + FOOTER_H
    img = Image.new('RGB', (WIDTH, height), BG)
    d = ImageDraw.Draw(img)

    f_title = _font(FONT_TITLE, True)
    f_date = _font(FONT_DATE, True)
    f_col = _font(FONT_COL, True)
    f_time = _font(FONT_ROW, True)
    f_team = _font(FONT_ROW)
    f_v = _font(FONT_ROW, True)
    f_pill = _font(FONT_PILL, True)
    f_foot = _font(FONT_FOOT, True)

    # Header: red accent bar, uppercase title, gold date, thin divider.
    d.rectangle([0, 0, WIDTH, ACCENT_H], fill=RED)
    d.text((PAD, 20), "TODAY'S MATCHES", font=f_title, fill=WHITE)
    date_s = date_display_value or ''
    d.text((WIDTH - PAD - d.textlength(date_s, font=f_date), 26),
           date_s, font=f_date, fill=GOLD)
    d.line([0, TITLE_H - 1, WIDTH, TITLE_H - 1], fill=LINE, width=1)

    y0 = TITLE_H
    d.rectangle([0, y0, WIDTH, y0 + COL_H], fill=COL_BG)
    x_time, x_match, x_right = PAD, PAD + 96, WIDTH - PAD
    cy = y0 + (COL_H - FONT_COL) // 2
    d.text((x_time, cy), 'TIME', font=f_col, fill=SLATE)
    d.text((x_match, cy), 'MATCH', font=f_col, fill=SLATE)
    d.text((x_right - d.textlength('STATUS', font=f_col), cy),
           'STATUS', font=f_col, fill=SLATE)
    d.line([0, y0 + COL_H - 1, WIDTH, y0 + COL_H - 1], fill=LINE, width=1)

    crests = _load_logos(rows)
    x_status_start = x_right - PILL_W - 12
    max_pair = x_status_start - x_match - 8
    for i, m in enumerate(rows):
        ry = y0 + COL_H + i * ROW_H
        d.rectangle([0, ry, WIDTH, ry + ROW_H],
                    fill=SURFACE_A if i % 2 == 0 else SURFACE_B)
        d.line([0, ry + ROW_H - 1, WIDTH, ry + ROW_H - 1], fill=LINE, width=1)
        ty = ry + (ROW_H - FONT_ROW) // 2
        logo_y = ry + (ROW_H - LOGO_SIZE) // 2
        d.text((x_time, ty), m.get('time') or '--:--', font=f_time, fill=GOLD)
        hk = str(m.get('home_tid') or '') or str(m.get('home_logo') or '')
        ak = str(m.get('away_tid') or '') or str(m.get('away_logo') or '')
        _draw_pair(img, d, x_match, ty, logo_y, m.get('home'), m.get('away'),
                   (crests.get(hk), crests.get(ak)), f_team, f_v, max_pair)
        status = (m.get('status') or '').strip()
        fill, color = _status_style(status)
        _draw_pill(d, x_right, ry + ROW_H // 2, status, fill, color, f_pill)

    fy = y0 + COL_H + len(rows) * ROW_H
    d.rectangle([0, fy, WIDTH, height], fill=SURFACE_A)
    d.rectangle([PAD, fy + 9, PAD + 48, fy + 12], fill=RED)
    d.text((PAD + 60, fy + (FOOTER_H - FONT_FOOT) // 2),
           '%d MATCHES' % len(rows), font=f_foot, fill=SLATE)

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
