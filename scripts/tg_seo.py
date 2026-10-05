# -*- coding: utf-8 -*-
"""Channel SEO, applied from the GitHub workflow (never from a laptop).

Two placements, both idempotent so a run never spams the channel:
  1. the channel About text  (setChatDescription, max 255 chars)
  2. one pinned keyword post (edited in place, never re-posted)

English only. No gambling wording and no store/product wording anywhere, by
standing rule.
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tg_news as tg

# --- 1. channel About: the phrases people actually type into telegram search
ABOUT = (
    "⚽ Live football & soccer: live matches, scores, goals and highlights. "
    "Premier League, La Liga, Serie A, Champions League, Bundesliga, Ligue 1, "
    "Europa League, World Cup, AFCON, Nations League. No ads. "
    "Watch live: https://kooraadz.vercel.app/"
)

# --- 2. pinned post: the long-tail league and competition list
PINNED = (
    "\U0001f4fa MESSISTAT — live football & soccer, no ads\n"
    "\U0001f3a6 Watch live streams: https://kooraadz.vercel.app/\n"
    "\n"
    "\U0001f3df Leagues: Premier League · La Liga · Serie A · Champions League · "
    "Europa League · Conference League · Bundesliga · Ligue 1 · Saudi Pro League · "
    "Süper Lig\n"
    "\n"
    "\U0001f30d International: FIFA World Cup · AFCON · Arab Nations Cup · Asian Cup · "
    "Copa América · Nations League · international friendlies\n"
    "\n"
    "Live matches, live scores, goals, highlights and press quotes — as they happen.\n"
    "\n"
    "⚽ #football #soccer #live #livestream #goals #highlights #premierleague "
    "#laliga #seriea #championsleague #worldcup"
)

OWNER_MSGS = ('1', '2')          # never touched


def state_path():
    return tg.STATE_PATH


def load():
    try:
        with open(state_path(), encoding='utf-8') as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def save(d):
    with open(state_path(), 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


def msg_exists(target, mid):
    try:
        html = tg.http_get_text('https://t.me/s/messistatdotcom', timeout=30)
    except Exception:
        return True          # cannot tell: assume it is there, do not repost
    return ('data-post="messistatdotcom/%s"' % mid) in html


def main():
    target = tg.env_or_cfg('TARGET_CHAT', 'target_chat')
    if not target:
        print('TARGET_CHAT missing')
        return 1
    assert len(ABOUT) <= 255, 'about is %d chars, telegram allows 255' % len(ABOUT)

    # 1. About -----------------------------------------------------------------
    cur = ((tg.bot('getChat', {'chat_id': target}, timeout=60) or {})
           .get('result') or {}).get('description') or ''
    if cur.strip() == ABOUT.strip():
        print('about: already correct (%d chars)' % len(ABOUT))
    else:
        r = tg.bot('setChatDescription',
                   {'chat_id': target, 'description': ABOUT}, timeout=60)
        ok = (r or {}).get('ok')
        print('about: %s (%d -> %d chars)%s'
              % ('updated' if ok else 'FAILED %s' % (r or {}).get('description'),
                 len(cur), len(ABOUT),
                 '' if ok else ''))
        if not ok:
            print('about: needs can_change_info on the bot')

    # 2. pinned post -----------------------------------------------------------
    st = load()
    mid = st.get('seo_msg')
    if mid and str(mid) not in OWNER_MSGS and msg_exists(target, mid):
        r = tg.bot('editMessageText',
                   {'chat_id': target, 'message_id': int(mid),
                    'text': PINNED, 'disable_web_page_preview': True},
                   timeout=60)
        if (r or {}).get('ok'):
            print('pinned post: #%s updated in place' % mid)
        else:
            print('pinned post: #%s edit failed %s'
                  % (mid, str((r or {}).get('description'))[:70]))
        return 0

    r = tg.bot('sendMessage',
               {'chat_id': target, 'text': PINNED,
                'disable_web_page_preview': True}, timeout=60)
    if not (r or {}).get('ok'):
        print('pinned post: send failed %s'
              % str((r or {}).get('description'))[:90])
        return 1
    new = ((r or {}).get('result') or {}).get('message_id')
    st['seo_msg'] = new
    save(st)
    print('pinned post: created as #%s' % new)
    p = tg.bot('pinChatMessage',
               {'chat_id': target, 'message_id': new,
                'disable_notification': True}, timeout=60)
    print('pin: %s' % ('ok' if (p or {}).get('ok')
                       else str((p or {}).get('description'))[:70]))
    return 0


if __name__ == '__main__':
    sys.exit(main())