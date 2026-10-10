# -*- coding: utf-8 -*-
"""One-off channel cleaner: delete channel posts carrying foreign Telegram
invite links (leaked channel promos). Dispatch-only, dry-run by default.

Env: TELEGRAM_BOT_TOKEN (required), TARGET_CHAT (required, channel id),
MODE=dry-run|delete (default dry-run), MAX=40 (posts scanned back).
Only message TEXT is matched (preview chrome ignored). Best-effort, exit 0,
English logs. Never touches state, repo, or anything else."""
import os
import re
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
        out.append((int(m.group(1)), txt))
    return out


def main():
    mode = os.environ.get('MODE', 'dry-run').strip().lower()
    try:
        maxn = max(1, min(100, int(os.environ.get('MAX', '40') or 40)))
    except Exception:
        maxn = 40
    target = (os.environ.get('TARGET_CHAT', '') or '').strip()
    if not os.environ.get('TELEGRAM_BOT_TOKEN', '').strip() or not target:
        print('cleanup: missing TELEGRAM_BOT_TOKEN or TARGET_CHAT, nothing to do')
        return 0
    seen, flagged, before = [], [], None
    try:
        while len(seen) < maxn:
            posts = parse(preview(before))
            if not posts:
                break
            for mid, txt in posts:
                if mid in seen:
                    continue
                seen.append(mid)
                if tg._TLINK.search(txt or ''):
                    snippet = re.sub(r'\s+', ' ', txt or '')[:120]
                    flagged.append((mid, snippet))
                    say('#%d FOREIGN LINK: %s' % (mid, snippet))
                if len(seen) >= maxn:
                    break
            before = min(p[0] for p in posts) - 1
            if len(posts) < 2:
                break
    except Exception as e:
        print('cleanup: preview scan failed: %s %s' % (type(e).__name__, str(e)[:100]))
    print('cleanup: scanned %d, flagged %d (mode=%s)' % (len(seen), len(flagged), mode))
    if mode != 'delete':
        print('cleanup: dry-run, nothing deleted')
        return 0
    ok = 0
    for mid, _ in flagged:
        try:
            r = tg.bot('deleteMessage', {'chat_id': target, 'message_id': mid})
            if (r or {}).get('ok'):
                ok += 1
                print('#%d deleted' % mid)
            else:
                print('#%d delete failed: %s' % (mid, str((r or {}).get('description'))[:100]))
        except Exception as e:
            print('#%d delete crashed: %s %s' % (mid, type(e).__name__, str(e)[:100]))
        try:
            time.sleep(1)
        except Exception:
            pass
    print('cleanup: deleted %d/%d' % (ok, len(flagged)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
