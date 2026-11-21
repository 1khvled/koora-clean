# -*- coding: utf-8 -*-
"""Channel promos, posted from the GitHub workflow (never from a laptop).

The Koora footprint is deliberately small:
  1. KICKOFF - at most ONE combined post per 24h, for fixtures on our own site
     that started in the last 15 minutes and were never announced before.
  2. HEARTBEAT - at most once per 36h, only on days our site lists matches.

The rest of the promotion budget goes to the two OWNED stats sites (MessiStat
and RonaldoStats): one site promo every 12h, alternating, never two promos in
one run and never within an hour of another promo.

Every rate limit lives in tg_state.json so runs never spam. Only NEW keys are
added; the existing keys (last_promo, promo_matches) are kept and reused as the
global "any promo" clock and the seen-fixture set. Promo send failures never
block the workflow's state-save step: this module always returns 0 and never
raises.

Copy is English-only and factual (drawn from each site's own home page). It
names no scraped source, no t.me invite, and carries no gambling/store wording.
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
MESSI_URL = 'https://www.messistat.com/en'
RONALDO_URL = 'https://ronaldostats.vercel.app/en'

KICKOFF_WINDOW = 15 * 60       # announce matches started in the last 15 min
KICKOFF_EVERY = 24 * 3600      # at most ONE combined kickoff post per day
HEARTBEAT_EVERY = 36 * 3600    # Koora heartbeat at most once per 36h (24-48h)
SITE_PROMO_EVERY = 12 * 3600   # one owned-site promo every 12h
PROMO_GAP = 3600               # never within an hour of ANY other promo
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

# Factual descriptions from the two owned sites' own English home pages:
#   MessiStat  - "verified career archive & video database", 937 goals,
#                1,185 matches, 47 trophies, updated after each match.
#   RonaldoStats - "verified statistics & video database", 986 goals,
#                  1,344 matches, 35 trophies, updated after each match.
# Headline numbers change after every match, so the copy stays feature-based
# rather than quoting a count that would soon go stale.
MESSI_PROMO = (
    "\U0001f4ca MESSISTAT \u2014 Lionel Messi career stats.\n"
    "\n"
    "Verified goals, assists and trophies, with match records and video "
    "replays. Updated after every match.\n"
    "\n"
    "%s" % MESSI_URL
)
RONALDO_PROMO = (
    "\U0001f4ca RONALDO STATS \u2014 Cristiano Ronaldo career stats.\n"
    "\n"
    "Verified goals, assists and trophies, with match records and video "
    "replays. Updated after every match.\n"
    "\n"
    "%s" % RONALDO_URL
)
SITE_PROMOS = (MESSI_PROMO, RONALDO_PROMO)
SITE_NAMES = ('messistat', 'ronaldo')


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
    base = '%s/watch/%s' % (SITE.rstrip('/'), f['id'])
    day = f.get('day') or 'today'
    return base if day == 'today' else '%s?d=%s' % (base, day)


def send(target, text):
    # preview left on: the site card unfurls, which is the point of an ad.
    try:
        r = tg.bot('sendMessage', {'chat_id': target, 'text': text[:3900]},
                   timeout=60)
    except Exception as e:
        print('promo failed: %s' % str(e)[:90])
        return None
    if not (r or {}).get('ok'):
        print('promo failed: %s' % str((r or {}).get('description'))[:90])
        return None
    return ((r or {}).get('result') or {}).get('message_id')


def _save(state):
    """A disk hiccup here must never turn into a non-zero exit: the workflow's
    Save-dedup-state step still has to run."""
    try:
        tg.save_state(state)
    except Exception as e:
        print('promo state save failed: %s' % str(e)[:80])


def main():
    target = tg.env_or_cfg('TARGET_CHAT', 'target_chat')
    if not target:
        print('TARGET_CHAT missing')
        return 0
    state = tg.load_state()
    seen = state.get('promo_matches') or []
    last = float(state.get('last_promo') or 0)
    at = now()
    ts = at.timestamp()

    # Seed the new keys. They are persisted on the first successful promo;
    # existing keys are never reset or overwritten here.
    state.setdefault('last_kickoff', 0.0)
    state.setdefault('last_heartbeat', 0.0)
    state.setdefault('last_site_promo', 0.0)
    state.setdefault('site_promo_index', 0)

    # Global gap: never two promos close together, whatever their type.
    if ts - last < PROMO_GAP:
        print('promo: last promo %.1fm ago, global gap %dm not reached'
              % ((ts - last) / 60.0, PROMO_GAP // 60))
        return 0

    fixtures = tg.site_fixtures()  # may be empty; site promos need no fixtures

    # 1. KICKOFF (Koora) - at most one combined post per day. ---------------
    if fixtures and ts - float(state['last_kickoff']) >= KICKOFF_EVERY:
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
                state['last_kickoff'] = ts
                state['last_promo'] = ts
                _save(state)
                print('promo: kickoff post #%s for %d match(es)'
                      % (mid, len(fresh)))
            return 0

    # 2. OWNED SITE PROMO - alternate MessiStat / RonaldoStats, every 12h. --
    if ts - float(state['last_site_promo']) >= SITE_PROMO_EVERY:
        idx = int(state['site_promo_index'] or 0) % len(SITE_PROMOS)
        mid = send(target, SITE_PROMOS[idx])
        if mid:
            state['site_promo_index'] = (idx + 1) % len(SITE_PROMOS)
            state['last_site_promo'] = ts
            state['last_promo'] = ts
            _save(state)
            print('promo: site promo #%s -> %s' % (mid, SITE_NAMES[idx]))
        return 0

    # 3. HEARTBEAT (Koora) - at most once per 36h, match days only. --------
    if (fixtures and
            ts - float(state['last_heartbeat']) >= HEARTBEAT_EVERY):
        mid = send(target, HEARTBEAT)
        if mid:
            state['last_heartbeat'] = ts
            state['last_promo'] = ts
            _save(state)
            print('promo: heartbeat #%s' % mid)
        return 0

    return 0


if __name__ == '__main__':
    sys.exit(main())
