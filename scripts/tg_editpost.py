# -*- coding: utf-8 -*-
"""Targeted post repair: replace the text/caption of specific posts, or
delete them. Dispatch-only, dry-run by default. Bot API only (the news bot
edits its own messages); attached photos/videos stay, only the text changes.

Env: TELEGRAM_BOT_TOKEN, TARGET_CHAT (required), MODE=dry-run|enforce
(default dry-run), EDITS='{"1856":"new text",...}', DELETES='1860,1861'.
Best-effort, exit 0, English logs. Never touches state/repo."""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
import tg_cleanup as tc

SCAN_MAX = 200


def say(s):
    tc.say(s)


def load_edits():
    raw = (os.environ.get('EDITS', '') or '').strip()
    if not raw:
        return {}
    try:
        d = json.loads(raw)
    except Exception as e:
        say('edits: bad JSON (%s)' % str(e)[:100])
        return {}
    out = {}
    for k, v in (d or {}).items():
        try:
            mid = int(str(k).strip())
        except Exception:
            say('edits: skip non-int id %r' % str(k)[:20])
            continue
        if mid <= 0 or not isinstance(v, str) or not v.strip():
            say('edits: skip invalid entry %r' % str(k)[:20])
            continue
        out[mid] = v.strip()[:3900]
    return out


def load_deletes():
    raw = (os.environ.get('DELETES', '') or '').strip()
    out = []
    for part in raw.split(','):
        part = part.strip()
        if not part:
            continue
        try:
            mid = int(part)
        except Exception:
            say('deletes: skip non-int %r' % part[:20])
            continue
        if mid > 0 and mid not in out:
            out.append(mid)
    return out


def fetch_msgs(wanted):
    """id -> (text, has_photo) for every wanted id in the recent window."""
    found, seen, before = {}, [], None
    while wanted - set(found) and len(seen) < SCAN_MAX:
        try:
            batch = tc.parse(tc.preview(before))
        except Exception as e:
            say('scan failed: %s' % str(e)[:100])
            break
        if not batch:
            break
        for mid, txt, ph in batch:
            if mid in seen:
                continue
            seen.append(mid)
            if mid in wanted:
                found[mid] = (txt, ph)
        before = min(seen) - 1
        if len(batch) < 2:
            break
    return found


def main():
    mode = os.environ.get('MODE', 'dry-run').strip().lower()
    token = (os.environ.get('TELEGRAM_BOT_TOKEN', '') or '').strip()
    target = (os.environ.get('TARGET_CHAT', '') or '').strip()
    edits, deletes = load_edits(), load_deletes()
    if not token or not target:
        say('editpost: missing TELEGRAM_BOT_TOKEN or TARGET_CHAT')
        return 0
    if not edits and not deletes:
        say('editpost: nothing requested (EDITS/DELETES empty)')
        return 0
    wanted = set(edits) | set(deletes)
    found = fetch_msgs(wanted)
    for mid in sorted(wanted - set(found)):
        say('#%d NOT FOUND in last %d posts -- skipped' % (mid, SCAN_MAX))
    say('editpost: %d edit(s), %d delete(s), found %d/%d (mode=%s)'
        % (len(edits), len(deletes), len(found), len(wanted), mode))
    if mode != 'enforce':
        for mid in sorted(set(edits) & set(found)):
            txt, ph = found[mid]
            say('#%d EDIT (photo=%s)\n    old: %s\n    new: %s'
                % (mid, ph, ascii((txt or '')[:150]), ascii(edits[mid][:150])))
        for mid in sorted(set(deletes) & set(found)):
            say('#%d DELETE (photo=%s) old: %s'
                % (mid, found[mid][1], ascii((found[mid][0] or '')[:120])))
        say('editpost: dry-run, nothing changed')
        return 0
    ok = 0
    total = 0
    for mid in sorted(wanted):
        if mid not in found:
            continue
        total += 1
        txt, ph = found[mid]
        try:
            if mid in edits:
                new = edits[mid]
                if ph:
                    r = tc.tg.bot('editMessageCaption',
                                  {'chat_id': target, 'message_id': mid,
                                   'caption': new[:1024]})
                else:
                    r = tc.tg.bot('editMessageText',
                                  {'chat_id': target, 'message_id': mid,
                                   'text': new[:3900],
                                   'disable_web_page_preview': True})
                done = bool((r or {}).get('ok'))
                say('#%d edit %s' % (mid, 'ok' if done else
                                     'FAILED %s' % str((r or {}).get('description'))[:80]))
            else:
                r = tc.tg.bot('deleteMessage',
                              {'chat_id': target, 'message_id': mid})
                done = bool((r or {}).get('ok'))
                say('#%d delete %s' % (mid, 'ok' if done else
                                       'FAILED %s' % str((r or {}).get('description'))[:80]))
            ok += bool(done)
        except Exception as e:
            say('#%d crashed: %s %s' % (mid, type(e).__name__, str(e)[:100]))
        try:
            time.sleep(1)
        except Exception:
            pass
    say('editpost: done %d/%d' % (ok, total))
    return 0


if __name__ == '__main__':
    sys.exit(main())
