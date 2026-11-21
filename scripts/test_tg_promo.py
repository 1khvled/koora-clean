# -*- coding: utf-8 -*-
"""Offline tests for the rebalanced promo cadence.

No network, no Telegram messages, no model calls, no state-file writes: state,
send, the clock and the fixture fetch are all mocked. Run with:
    python scripts/test_tg_promo.py
"""
import datetime
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tg_news as tg       # noqa: E402
import tg_promo as promo   # noqa: E402
import tg_seo as seo       # noqa: E402

_EPOCH = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
_H = 3600


def abs_ts(hours):
    """Real Unix timestamp `hours` after the epoch (state stores these)."""
    return _EPOCH.timestamp() + hours * _H


def run_at(hours, state, fixtures=None):
    """Run promo.main() at a fixed timestamp with a shared, mocked state."""
    dt = _EPOCH + datetime.timedelta(seconds=hours * _H)
    with mock.patch.object(tg, 'env_or_cfg', return_value='@chan'), \
         mock.patch.object(tg, 'load_state', return_value=state), \
         mock.patch.object(tg, 'save_state'), \
         mock.patch.object(tg, 'site_fixtures',
                           return_value=[] if fixtures is None else fixtures), \
         mock.patch.object(promo, 'now', return_value=dt), \
         mock.patch.object(promo, 'send', return_value=101) as snd:
        rc = promo.main()
    return rc, snd


class CadenceTests(unittest.TestCase):
    """The rate limits and the alternation between the two owned sites."""

    def test_intervals(self):
        self.assertGreaterEqual(promo.KICKOFF_EVERY, 24 * _H)
        self.assertGreaterEqual(promo.HEARTBEAT_EVERY, 24 * _H)
        self.assertLessEqual(promo.HEARTBEAT_EVERY, 48 * _H)
        self.assertLessEqual(promo.SITE_PROMO_EVERY, 12 * _H)
        self.assertEqual(promo.PROMO_GAP, _H)

    def test_site_promos_alternate_messistat_ronaldo(self):
        state = {}
        texts = []
        for hour in (13, 26, 39, 52):
            rc, snd = run_at(hour, state)
            self.assertEqual(rc, 0)
            self.assertEqual(snd.call_count, 1, 'one promo per run')
            texts.append(snd.call_args.args[1])
        self.assertIn(promo.MESSI_URL, texts[0])
        self.assertIn(promo.RONALDO_URL, texts[1])
        self.assertIn(promo.MESSI_URL, texts[2])
        self.assertIn(promo.RONALDO_URL, texts[3])
        self.assertEqual(state['site_promo_index'], 0)   # back to Messi

    def test_at_most_one_promo_per_run_when_all_are_due(self):
        state = {'last_promo': 0.0, 'last_kickoff': 0.0,
                 'last_heartbeat': 0.0, 'last_site_promo': 0.0,
                 'promo_matches': []}
        dt = _EPOCH + datetime.timedelta(seconds=100 * _H)
        fx = [{'id': '1', 'day': 'today', 'home': 'A', 'away': 'B',
               'status': 'LIVE',
               'start': (dt - datetime.timedelta(minutes=5)).isoformat()}]
        rc, snd = run_at(100, state, fx)
        self.assertEqual(rc, 0)
        self.assertEqual(snd.call_count, 1)
        self.assertIn('KICK-OFF', snd.call_args.args[1])  # kickoff wins

    def test_global_gap_blocks_second_promo_within_an_hour(self):
        state = {'last_site_promo': 0.0}
        rc, snd = run_at(13, state)
        self.assertEqual(snd.call_count, 1)
        rc, snd = run_at(13.5, state)
        self.assertEqual(rc, 0)
        snd.assert_not_called()

    def test_heartbeat_is_slow_and_only_on_match_days(self):
        # Site and kickoff both recently posted; only the heartbeat is due.
        state = {'last_promo': 0.0, 'last_kickoff': abs_ts(99),
                 'last_site_promo': abs_ts(99), 'last_heartbeat': 0.0}
        fx = [{'id': '9', 'day': 'today', 'home': 'A', 'away': 'B'}]
        rc, snd = run_at(100, state, fx)
        self.assertEqual(snd.call_count, 1)
        self.assertIn('Watch every match live', snd.call_args.args[1])
        self.assertEqual(state['last_heartbeat'], abs_ts(100))
        # No fixtures: no Koora heartbeat at all (keep other promos out so the
        # assertion isolates the heartbeat branch).
        state['last_site_promo'] = abs_ts(198)
        state['last_kickoff'] = abs_ts(198)
        state['last_promo'] = abs_ts(198)
        rc, snd = run_at(200, state, [])
        snd.assert_not_called()


class CopyTests(unittest.TestCase):
    """English-only, factual, no invites/gambling/store wording, owned sites."""

    def assert_clean(self, text):
        self.assertFalse(tg.has_arabic(text))
        self.assertNotIn('kooraadz', text.lower())
        self.assertNotIn('t.me', text.lower())
        self.assertNotIn('@', text)
        low = text.lower()
        for bad in ('bet', 'gambl', 'casino', 'odds', 'store', 'shop'):
            self.assertNotIn(bad, low)

    def test_owned_site_promo_copy(self):
        self.assertIn(promo.MESSI_URL, promo.MESSI_PROMO)
        self.assertIn(promo.RONALDO_URL, promo.RONALDO_PROMO)
        self.assertIn('MESSISTAT', promo.MESSI_PROMO)
        self.assertIn('RONALDO STATS', promo.RONALDO_PROMO)
        for text in promo.SITE_PROMOS:
            self.assert_clean(text)
            self.assertIn('career stats', text)
            self.assertIn('Verified', text)

    def test_seo_placements_promote_owned_sites(self):
        self.assertLessEqual(len(seo.ABOUT), 255)
        self.assertLessEqual(len(seo.PINNED), 4096)
        about = seo.ABOUT.replace('\u26bd', '')  # ball emoji is fine
        pinned = seo.PINNED
        self.assertIn(promo.MESSI_URL, about)
        self.assertIn(promo.RONALDO_URL, about)
        self.assertLess(about.index('messistat.com'), about.index('ronaldostats'))
        self.assertIn(promo.MESSI_URL, pinned)
        self.assertIn(promo.RONALDO_URL, pinned)
        self.assertLess(pinned.index('messistat.com'), pinned.index('ronaldostats'))
        for text in (about, pinned):
            self.assert_clean(text)
            self.assertIn('Premier League', text)
        self.assertIn('#football', pinned)


class WatchLinkCapTests(unittest.TestCase):
    """The Koora watch link survives as context, at 1 in N match posts."""

    def test_cap_is_one_in_n_and_persisted(self):
        state = {}
        fx = [{'id': '77', 'day': 'today', 'home': 'Barcelona',
               'away': 'Getafe'}]
        text = 'Barcelona edged Getafe 2-1'
        with mock.patch.object(tg, 'site_fixtures', return_value=fx):
            links = [tg.match_link(text, state)
                     for _ in range(tg.WATCH_LINK_EVERY * 2)]
        got = [x for x in links if x]
        self.assertEqual(len(got), 2)
        self.assertTrue(got[0].endswith('/watch/77'))
        self.assertEqual(links[0], got[0])
        self.assertEqual(state['watch_link_count'], tg.WATCH_LINK_EVERY * 2)

    def test_non_match_posts_do_not_spend_a_slot(self):
        state = {'watch_link_count': 3}
        fx = [{'id': '77', 'day': 'today', 'home': 'Barcelona',
               'away': 'Getafe'}]
        with mock.patch.object(tg, 'site_fixtures', return_value=fx):
            self.assertEqual(tg.match_link('Team news and transfer talk', state), '')
        self.assertEqual(state['watch_link_count'], 3)


if __name__ == '__main__':
    unittest.main(verbosity=2)
