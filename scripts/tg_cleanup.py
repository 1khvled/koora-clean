# -*- coding: utf-8 -*-
"""Channel cleaner: foreign Telegram invite links in posts.
Dispatch-only, dry-run by default. For each flagged post:
  - real content left after scrubbing -> edit it out (editMessageCaption for
    photo posts, editMessageText for text posts), caption/text otherwise kept
    byte-identical;
  - nothing but promo -> deleteMessage.
Best-effort, exit 0, English logs. Never touches state/repo.

Env: TELEGRAM_BOT_TOKEN, TARGET_CHAT (required), MODE=dry-run|enforce
(default dry-run), MAX=40 posts scanned back."""
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
        has_photo = bool(re.search(
            r'tgme_widget_message_photo[^>]*background-image:url\(\'([^\']+)\'', b))
        out.append((int(m.group(1)), txt, has_photo))
    return out


def scrubbed(text):
    """Remove foreign invite links; drop lines left empty or as dangling
    short labels ("Match Goals:"). Content lines keep everything else."""
    kept = []
    for ln in (text or '').split('\n'):
        ln = tg._TLINK.sub('', ln)
        s = ln.strip()
        if not s:
            continue
        if re.match(r'^.{0,40}:$', s) and len(s.split()) <= 4:
            continue
        kept.append(ln.strip())
    t = '\n'.join(kept)
    t = re.sub(r'\n[ \t]*\n(?:[ \t]*\n)*', '\n\n', t)
    return t.strip()


def main():
    mode = os.environ.get('MODE', 'dry-run').strip().lower()
    try:
        maxn = max(1, min(300, int(os.environ.get('MAX', '40') or 40)))
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
            for mid, txt, has_photo in posts:
                if mid in seen:
                    continue
                seen.append(mid)
                if tg._TLINK.search(txt or ''):
                    fixed = scrubbed(txt)
                    action = 'edit' if len(re.sub(r'\s+', '', fixed)) > 80 else 'delete'
                    flagged.append((mid, has_photo, fixed, txt))
                    say('#%d FOREIGN LINK -> %s (photo=%s)' % (mid, action, has_photo))
                if len(seen) >= maxn:
                    break
            before = min(seen) - 1
            if len(posts) < 2:
                break
    except Exception as e:
        print('cleanup: preview scan failed: %s %s' % (type(e).__name__, str(e)[:100]))
    print('cleanup: scanned %d, flagged %d (mode=%s)' % (len(seen), len(flagged), mode))
    if mode != 'enforce':
        print('cleanup: dry-run, nothing changed')
        return 0
    ok = 0
    for mid, has_photo, fixed, _ in flagged:
        try:
            if len(re.sub(r'\s+', '', fixed)) > 80:
                if has_photo:
                    r = tg.bot('editMessageCaption',
                               {'chat_id': target, 'message_id': mid,
                                'caption': fixed[:1024]})
                else:
                    r = tg.bot('editMessageText',
                               {'chat_id': target, 'message_id': mid,
                                'text': fixed[:3900],
                                'disable_web_page_preview': True})
                done = bool((r or {}).get('ok'))
                print('#%d scrub-edit %s' % (mid, 'ok' if done else 'FAILED %s' % str((r or {}).get('description'))[:80]))
            else:
                r = tg.bot('deleteMessage', {'chat_id': target, 'message_id': mid})
                done = bool((r or {}).get('ok'))
                print('#%d delete %s' % (mid, 'ok' if done else 'FAILED %s' % str((r or {}).get('description'))[:80]))
            ok += bool(done)
        except Exception as e:
            print('#%d crashed: %s %s' % (mid, type(e).__name__, str(e)[:100]))
        try:
            time.sleep(1)
        except Exception:
            pass
    print('cleanup: fixed %d/%d' % (ok, len(flagged)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
