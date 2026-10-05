# -*- coding: utf-8 -*-
"""Kooradz promos, posted from the GitHub workflow (never from a laptop).

Two kinds, both rate-limited in tg_state.json so runs never spam:
  1. KICKOFF - a fixture on our own site started in the last 15 minutes and
     was never announced: one post with its exact player link. Several at
     once become a single combined post, never a burst.
  2. HEARTBEAT - at most once per 6 hours, only on days our site actually
     lists matches, and never within an hour of a kickoff post.

Copy is English-only and names no teams (our fixtures are Arabic-only, and
translating team names is exactly how mangled names happen). The exact link
carries the match identity instead. No gambling wording, no store wording.
"""
import datetime
import io
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tg_news as tg

SITE = 'https://kooraadz.vercel.app/'
KICKOFF_WINDOW = 15 * 60       # announce matches started in the last 15 min
HEARTBEAT_EVERY = 6 * 3600     # general promo at most once per 6 hours
OVER_STATUSES = ('FT', 'AET', 'PEN', 'CANC', 'POST', 'PSTP', 'SUSP', 'ABD',
                 'WO', 'AWD')
MAX_RUN_KICKOFFS = 4           # links per combined post, at most
SEEN_KEEP = 200                # fixture ids remembered

SINGLE = ("\U0001f534 KICK-OFF \u2014 a match just started.\n"
          "\n"
          "\U0001f3a6 Watch it live, no ads:\n"
          "%s")
MULTI = ("\U0001f534 KICK-OFF \u2014 %d matches just started.\n"
         "\n"
         "\U0001f3a6 Watch live, no ads:\n"
         "%s")
HEARTBEAT = ("\U0001f4fa Watch every match live \u2014 no ads.\n"
             "\n"
             "\U0001f3a6 %s\n"
             "\n"
             "Live scores, goals and highlights as they happen." % SITE)


def now():
    return datetime.datetime.now(datetime.timezone.utc)


def started_at(fx):
    try:
        t = datetime.datetime.fromisoformat(str(fx.get('start') or ''))
    except ValueError:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=datetime.timezone.utc)
    return t


def kickoffs(fixtures, at, done):
    """Fixtures that kicked off within the window, not announced before,
    and not already over. Oldest kickoff first."""
    out = []
    for f in fixtures:
        if not f.get('id') or str(f['id']) in done:
            continue
        if str(f.get('status') or '').upper() in OVER_STATUSES:
            continue
        t = started_at(f)
        if t is None:
            continue
        age = (at - t).total_seconds()
        if 0 <= age <= KICKOFF_WINDOW:
            out.append((age, f))
    out.sort(key=lambda x: -x[0])
    return [f for _, f in out]


def link_for(f):
    return '%s/player.html?m=%s&d=%s' % (
        SITE.rstrip('/'), f['id'], f.get('day') or 'today')


def send(target, text):
    # preview left on: the site card unfurls, which is the point of an ad.
    r = tg.bot('sendMessage', {'chat_id': target, 'text': text[:3900]},
               timeout=60)
    if not (r or {}).get('ok'):
        print('promo failed: %s' % str((r or {}).get('description'))[:90])
        return None
    return ((r or {}).get('result') or {}).get('message_id')


def main():
    target = tg.env_or_cfg('TARGET_CHAT', 'target_chat')
    if not target:
        print('TARGET_CHAT missing')
        return 1
    state = tg.load_state()
    seen = state.get('promo_matches') or []
    last = float(state.get('last_promo') or 0)
    at = now()

    fixtures = tg.site_fixtures()
    if not fixtures:
        print('promo: our site gave no fixtures, nothing to announce')
        return 0
    print('promo: %d fixtures on our site' % len(fixtures))

    fresh = kickoffs(fixtures, at, set(seen))[:MAX_RUN_KICKOFFS]
    if fresh:
        if len(fresh) == 1:
            text = SINGLE % link_for(fresh[0])
        else:
            text = MULTI % (len(fresh),
                            '\n'.join(link_for(f) for f in fresh))
        mid = send(target, text)
        if mid:
            seen = (seen + [str(f['id']) for f in fresh])[-SEEN_KEEP:]
            state['promo_matches'] = seen
            state['last_promo'] = at.timestamp()
            tg.save_state(state)
            print('promo: kickoff post #%s for %d match(es)'
                  % (mid, len(fresh)))
        return 0

    if at.timestamp() - last < HEARTBEAT_EVERY:
        print('promo: heartbeat due in %.1fh'
              % ((HEARTBEAT_EVERY - (at.timestamp() - last)) / 3600.0))
        return 0
    mid = send(target, HEARTBEAT)
    if mid:
        state['last_promo'] = at.timestamp()
        tg.save_state(state)
        print('promo: heartbeat #%s' % mid)
    return 0


if __name__ == '__main__':
    sys.exit(main())
