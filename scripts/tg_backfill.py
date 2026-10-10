# -*- coding: utf-8 -*-
"""Backfill old channel photos with full-quality originals (editMessageMedia,
captions untouched) + targeted wrong-photo fixes via DONOR map.

Dispatch-only, dry-run by default. Needs the reader session for originals
(TG_API_ID/HASH/SESSION); without it, dry-run still maps candidates.

Env: TELEGRAM_BOT_TOKEN, TARGET_CHAT (required), MODE=dry-run|enforce
(default dry-run), MAX=40 posts scanned, MAXEDITS=10 edits cap,
DONOR="1788:377508" (channel:source overrides, comma separated).
Best-effort, exit 0, English logs. Never touches state/repo."""
import json
import os
import re
import struct
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
import tg_news as tg

UA = {'User-Agent': 'Mozilla/5.0'}


def say(s):
    try:
        print(s)
    except UnicodeEncodeError:
        print(s.encode('ascii', 'backslashreplace').decode('ascii'))


def preview(before=None):
    url = 'https://t.me/s/messistatdotcom'
    if before:
        url += '?before=%d' % before
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')


def parse(html):
    out = []
    for b in re.split(r'tgme_widget_message_wrap', html)[1:]:
        m = re.search(r'data-post="messistatdotcom/(\d+)"', b)
        if not m:
            continue
        tm = re.search(r'tgme_widget_message_text[^>]*>([\s\S]*?)</div>\s*</div>', b)
        txt = ''
        if tm:
            txt = re.sub(r'<br\s*/?>', '\n', tm.group(1))
            txt = re.sub(r'<[^>]+>', '', txt)
            import html as _h
            txt = _h.unescape(txt)
        pm = re.search(r'tgme_widget_message_photo[^>]*background-image:url\(\'([^\']+)\'', b)
        out.append((int(m.group(1)), txt, pm.group(1) if pm else ''))
    return out


def dl(url):
    req = urllib.request.Request(url, headers={**UA, 'Referer': 'https://t.me/s/'})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()


def jpeg_size(b):
    try:
        i = 2
        while i < len(b) - 8:
            if b[i] != 0xFF:
                i += 1
                continue
            m = b[i + 1]
            if m in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack('>HH', b[i + 5:i + 9])
                return w, h
            if m in (0xD8, 0xD9, 0x01) or 0xD0 <= m <= 0xD7:
                i += 2
                continue
            ln = struct.unpack('>H', b[i + 2:i + 4])[0]
            i += 2 + ln
    except Exception:
        pass
    return (0, 0)


def state_msgmap():
    try:
        subprocess.run(['git', 'fetch', 'origin',
                        'state:refs/remotes/origin/state'],
                       capture_output=True, timeout=60)
        raw = subprocess.run(['git', 'show', 'origin/state:scripts/tg_state.json'],
                             capture_output=True, timeout=30).stdout
        mm = json.loads(raw.decode('utf-8')).get('msgmap') or {}
        rev = {}
        for k, v in mm.items():
            rev.setdefault(v, []).append(k)
        return rev
    except Exception as e:
        print('backfill: state unreadable: %s %s' % (type(e).__name__, str(e)[:80]))
        return {}


def donor_bytes(skey):
    """Full original for a source key: reader session first, web biggest
    fallback. None when unavailable. Never raises."""
    try:
        b = tg.tele_photo(int(skey))
        if b:
            return b
    except Exception:
        pass
    try:
        _t, single = tg.extract_post(tg.fetch_single(int(skey)), int(skey))
        if single:
            req = urllib.request.Request(single, headers={
                'User-Agent': UA['User-Agent'],
                'Referer': 'https://t.me/s/Offsideahdaff'})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
    except Exception as e:
        print('backfill: donor web fallback failed #%s (%s)' % (skey, type(e).__name__))
    return None


def main():
    mode = os.environ.get('MODE', 'dry-run').strip().lower()
    try:
        maxn = max(1, min(120, int(os.environ.get('MAX', '40') or 40)))
    except Exception:
        maxn = 40
    try:
        maxed = max(1, min(30, int(os.environ.get('MAXEDITS', '10') or 10)))
    except Exception:
        maxed = 10
    donors = {}
    for pair in (os.environ.get('DONOR', '') or '').split(','):
        if ':' in pair:
            c, s = pair.split(':', 1)
            try:
                donors[int(c.strip())] = int(s.strip())
            except Exception:
                pass
    target = (os.environ.get('TARGET_CHAT', '') or '').strip()
    if not os.environ.get('TELEGRAM_BOT_TOKEN', '').strip() or not target:
        print('backfill: missing TELEGRAM_BOT_TOKEN or TARGET_CHAT, nothing to do')
        return 0
    rev = state_msgmap()
    seen, jobs, before = [], [], None
    try:
        while len(seen) < maxn:
            posts = parse(preview(before))
            if not posts:
                break
            for mid, txt, curl in posts:
                if mid in seen:
                    continue
                seen.append(mid)
                if not curl:
                    continue
                try:
                    cb = dl(curl)
                except Exception:
                    continue
                w, h = jpeg_size(cb)
                if max(w, h, 1) < 200:
                    continue  # thumb/emoji grab, not a real photo post
                if mid in donors:
                    jobs.append((mid, donors[mid], txt, len(cb), 'donor-override'))
                    say('#%d DONOR -> source #%d (caption kept)' % (mid, donors[mid]))
                    continue
                if max(w, h) >= 1000:
                    continue
                sk = (rev.get(mid) or [None])[0]
                if sk is None:
                    continue
                jobs.append((mid, int(sk), txt, len(cb), '%dx%d' % (w, h)))
                say('#%d UPGRADE source #%s (%dx%d %dB)' % (mid, sk, w, h, len(cb)))
                if len(seen) >= maxn:
                    break
            before = min(seen) - 1
            if len(posts) < 2:
                break
    except Exception as e:
        print('backfill: scan failed: %s %s' % (type(e).__name__, str(e)[:100]))
    print('backfill: scanned %d, jobs %d (mode=%s)' % (len(seen), len(jobs), mode))
    if mode != 'enforce':
        print('backfill: dry-run, nothing changed')
        return 0
    ok = 0
    for mid, skey, caption, oldn, why in jobs[:maxed]:
        try:
            nb = donor_bytes(skey)
            if not nb:
                print('#%d: no original available, skipped' % mid)
                continue
            if why != 'donor-override' and len(nb) <= oldn:
                print('#%d: original not bigger (%d<=%d), skipped' % (mid, len(nb), oldn))
                continue
            import json as _j
            media = _j.dumps({'type': 'photo', 'media': 'attach://p',
                              'caption': (caption or '')[:1024]})
            r = tg.bot('editMessageMedia',
                       {'chat_id': target, 'message_id': mid, 'media': media},
                       files={'p': ('news.jpg', nb)})
            done = bool((r or {}).get('ok'))
            print('#%d upgraded %dB->%dB %s' % (
                mid, oldn, len(nb),
                'ok' if done else 'FAILED %s' % str((r or {}).get('description'))[:80]))
            ok += bool(done)
        except Exception as e:
            print('#%d crashed: %s %s' % (mid, type(e).__name__, str(e)[:100]))
        try:
            time.sleep(2)
        except Exception:
            pass
    print('backfill: upgraded %d/%d' % (ok, min(len(jobs), maxed)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
