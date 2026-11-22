# -*- coding: utf-8 -*-
"""Offline tests for the daily matches photo.

No network, no real Telegram message, no state-file write, no model call.
Network fetches, the multipart upload, state load/save and the clock are all
mocked. Run with:  python scripts/test_tg_daily_photo.py
"""
import datetime
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tg_news as tg          # noqa: E402
import tg_daily_photo as daily  # noqa: E402

DAY = datetime.date(2026, 11, 22)
NEXT_DAY = datetime.date(2026, 11, 23)
DS = '20261122'

FOTMOB = {
    'leagues': [
        {'name': 'Premier League', 'matches': [
            {'id': 1, 'statusId': 1, 'time': '22.11.2026 15:00',
             'status': {'utcTime': '2026-11-22T14:00:00.000Z', 'started': False,
                        'cancelled': False, 'finished': False},
             'home': {'name': 'Arsenal', 'score': 0},
             'away': {'name': 'Chelsea', 'score': 0}},
            {'id': 2, 'statusId': 6, 'time': '22.11.2026 18:00',
             'status': {'utcTime': '2026-11-22T17:00:00.000Z', 'started': False,
                        'cancelled': False, 'finished': True},
             'home': {'name': 'Liverpool', 'score': 2},
             'away': {'name': 'Everton', 'score': 1}},
        ]},
        {'name': 'La Liga', 'matches': [
            {'id': 3, 'statusId': 106, 'time': '22.11.2026 21:00',
             'status': {'utcTime': '2026-11-22T20:00:00.000Z',
                        'cancelled': True},
             'home': {'name': 'Real Madrid', 'score': 0},
             'away': {'name': 'Getafe', 'score': 0}},
        ]},
    ]
}

ESPN = {
    'events': [
        {'id': 'e1', 'date': '2026-11-22T14:00Z',
         'status': {'type': {'name': 'STATUS_FINAL', 'completed': True}},
         'competitions': [{'competitors': [
             {'homeAway': 'home', 'team': {'displayName': 'Barcelona'}, 'score': '3'},
             {'homeAway': 'away', 'team': {'displayName': 'Getafe'}, 'score': '0'},
         ]}]},
    ]
}

TIFO_AR = {'matches': [
    {'home': 'الجزائر', 'away': 'مصر', 'date': '2026-11-22T14:00:00Z'}
]}

OK = {'ok': True, 'result': {'message_id': 42}}


def sample_matches(n=3):
    return [
        {'time': '14:00', 'sort': '2026-11-22T14:00', 'home': 'Arsenal',
         'away': 'Chelsea', 'status': '', 'league_order': 0}
    ] + [
        {'time': '%02d:00' % (15 + i), 'sort': '2026-11-22T%02d:00' % (15 + i),
         'home': 'Team %d' % i, 'away': 'Rovers %d' % i, 'status': '1-0',
         'league_order': i % 2}
        for i in range(max(0, n - 1))
    ]


def run(state, fetch=None, send=OK, day=DAY, fetch_side=None):
    """post_daily_photo with every boundary mocked; returns (rc, send_mock)."""
    with mock.patch.object(tg, 'load_state', return_value=state), \
         mock.patch.object(tg, 'save_state'), \
         mock.patch.object(daily, 'fetch_today',
                           return_value=sample_matches() if fetch is None else fetch,
                           side_effect=fetch_side) as ft, \
         mock.patch.object(daily, '_send_photo_bytes', return_value=send) as snd:
        rc = daily.post_daily_photo(day=day)
    return rc, snd, ft


class ParserTests(unittest.TestCase):
    def test_fotmob_english_names_and_statuses(self):
        got = daily.parse_fotmob(FOTMOB)
        self.assertEqual(len(got), 3)
        by_home = {m['home']: m for m in got}
        self.assertEqual(by_home['Arsenal']['status'], '')       # scheduled
        self.assertEqual(by_home['Liverpool']['status'], '2-1')  # finished
        self.assertEqual(by_home['Real Madrid']['status'], 'Canc')
        self.assertEqual(by_home['Arsenal']['time'], '14:00')    # UTC kickoff
        for m in got:
            self.assertFalse(tg.has_arabic(m['home'] + m['away']))

    def test_espn_scores(self):
        got = daily.parse_espn(ESPN)
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]['home'], 'Barcelona')
        self.assertEqual(got[0]['away'], 'Getafe')
        self.assertEqual(got[0]['status'], '3-0')
        self.assertEqual(got[0]['time'], '14:00')

    def test_tifo_arabic_rows_are_skipped_not_transliterated(self):
        self.assertEqual(daily.parse_tifo(TIFO_AR), [])

    def test_failopen_never_raises(self):
        self.assertEqual(daily.parse_fotmob({'leagues': None}), [])
        self.assertEqual(daily.parse_espn({'events': 'x'}), [])
        self.assertEqual(daily.parse_tifo({'matches': [1, None, {}]}), [])

    def test_fetch_order_and_failover(self):
        urls = []

        def fetcher(url, headers):
            urls.append(url)
            if 'fotmob' in url:
                raise RuntimeError('down')
            return ESPN

        got = daily.fetch_today(DS, fetcher=fetcher)
        self.assertEqual(len(got), 1)
        self.assertIn('fotmob.com', urls[0])
        self.assertIn('espn.com', urls[1])
        self.assertIn(DS, urls[0])

    def test_fetch_all_dead_returns_empty(self):
        def boom(url, headers):
            raise OSError('offline')

        self.assertEqual(daily.fetch_today(DS, fetcher=boom), [])


class SelectionTests(unittest.TestCase):
    def test_cap_and_kickoff_order(self):
        many = [
            {'time': '12:00', 'sort': '2026-11-22T12:00', 'home': 'A',
             'away': 'B', 'status': '', 'league_order': 0}
        ] + [
            {'time': '13:00', 'sort': '2026-11-22T13:00', 'home': 'C%d' % i,
             'away': 'D%d' % i, 'status': '', 'league_order': i % 3}
            for i in range(100)
        ]
        picked = daily.select_matches(many)
        self.assertEqual(len(picked), daily.MAX_ROWS)
        self.assertEqual([m['sort'] for m in picked],
                         sorted(m['sort'] for m in picked))

    def test_top_leagues_preferred(self):
        a = {'time': '20:00', 'sort': '2026-11-22T20:00', 'home': 'Top',
             'away': 'Side', 'status': '', 'league_order': 0}
        b = {'time': '12:00', 'sort': '2026-11-22T12:00', 'home': 'Lower',
             'away': 'Side', 'status': '', 'league_order': 9}
        self.assertEqual(daily.select_matches([b, a], limit=1), [a])


class ImageTests(unittest.TestCase):
    def test_caption_and_image_text_are_english_only(self):
        picked = daily.select_matches(daily.parse_fotmob(FOTMOB))
        cap = daily.caption_text('2026-11-22', len(picked))
        txt = cap + '\n' + daily.image_text(picked, '2026-11-22')
        self.assertFalse(tg.has_arabic(txt))
        self.assertFalse(tg.has_foreign_script(txt))
        low = txt.lower()
        for bad in ('t.me', 'http', '@', 'bet', 'casino', 'store', 'shop', 'fotmob', 'espn'):
            self.assertNotIn(bad, low)
        self.assertIn("Today's matches:", cap)

    def test_png_dimensions_and_signature(self):
        from PIL import Image
        import io
        picked = daily.select_matches(daily.parse_fotmob(FOTMOB))
        png = daily.render_png(picked, '2026-11-22')
        self.assertEqual(png[:8], b'\x89PNG\r\n\x1a\n')
        img = Image.open(io.BytesIO(png))
        self.assertEqual(img.width, daily.WIDTH)
        self.assertGreater(img.height, daily.TITLE_H)
        # 3 rows -> title + columns + 3*row + footer
        self.assertEqual(img.height, daily.TITLE_H + daily.COL_H +
                         3 * daily.ROW_H + daily.FOOTER_H)

    def test_render_uses_tempfile_outside_repo(self):
        picked = daily.select_matches(daily.parse_fotmob(FOTMOB))
        path, png = daily.render_image(picked, '2026-11-22')
        try:
            self.assertTrue(os.path.isabs(path))
            self.assertNotIn(os.path.dirname(os.path.abspath(__file__)), path)
            with open(path, 'rb') as f:
                self.assertEqual(f.read(), png)
        finally:
            os.unlink(path)


class OncePerDayTests(unittest.TestCase):
    def test_posts_once_then_skips_same_day(self):
        state = {}
        rc, snd, _ = run(state)
        self.assertTrue(rc)
        self.assertEqual(snd.call_count, 1)
        self.assertEqual(state[daily.STATE_KEY], DS)
        rc2, snd2, _ = run(state)
        self.assertFalse(rc2)
        snd2.assert_not_called()

    def test_no_duplicate_send_across_many_runs(self):
        state = {}
        total = 0
        for _ in range(6):
            rc, snd, _ = run(state)
            total += snd.call_count
        self.assertEqual(total, 1)

    def test_state_written_only_after_success(self):
        state = {}
        rc, snd, _ = run(state, send={'ok': False, 'description': 'rejected'})
        self.assertFalse(rc)
        self.assertEqual(snd.call_count, 1)
        self.assertNotIn(daily.STATE_KEY, state)
        # A later success DOES persist the key.
        rc, snd, _ = run(state, send=OK)
        self.assertTrue(rc)
        self.assertEqual(state[daily.STATE_KEY], DS)

    def test_failopen_on_fetch_error(self):
        state = {}
        rc, snd, _ = run(state, fetch_side=RuntimeError('api down'))
        self.assertFalse(rc)
        snd.assert_not_called()
        self.assertNotIn(daily.STATE_KEY, state)

    def test_failopen_on_empty_fixtures(self):
        state = {}
        rc, snd, _ = run(state, fetch=[])
        self.assertFalse(rc)
        snd.assert_not_called()
        self.assertNotIn(daily.STATE_KEY, state)

    def test_next_calendar_day_posts_again(self):
        state = {}
        run(state, day=DAY)
        rc, snd, _ = run(state, day=NEXT_DAY)
        self.assertTrue(rc)
        self.assertEqual(snd.call_count, 1)
        self.assertEqual(state[daily.STATE_KEY], '20261123')

    def test_send_receives_png_and_caption(self):
        state = {}
        _, snd, _ = run(state)
        args = snd.call_args.args
        self.assertEqual(args[0][:8], b'\x89PNG\r\n\x1a\n')
        self.assertIn("Today's matches: 2026-11-22", args[1])
        self.assertIn('(3 matches)', args[1])


class UploadTests(unittest.TestCase):
    def test_multipart_uploader_never_prints_token_and_has_no_cr_cr_lf(self):
        png = daily.render_png(sample_matches(1), '2026-11-22')
        env = {'TELEGRAM_BOT_TOKEN': 'SECRET_TOKEN_XYZ',
               'TARGET_CHAT': '@messistatdotcom'}

        def env_or_cfg(key, cfg):
            return env.get(key, '')

        class FakeResp:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return b'{"ok":true,"result":{"message_id":7}}'

        seen = {}

        def urlopen(req, timeout=None):
            seen['req'] = req
            return FakeResp()

        with mock.patch.object(tg, 'env_or_cfg', side_effect=env_or_cfg), \
             mock.patch('urllib.request.urlopen', side_effect=urlopen):
            res = daily._send_photo_bytes(png, 'Today\'s matches: 2026-11-22')

        self.assertTrue(res['ok'])
        req = seen['req']
        self.assertTrue(req.full_url.startswith(
            'https://api.telegram.org/botSECRET_TOKEN_XYZ/sendPhoto'))
        body = req.data
        self.assertIn(b'name="chat_id"', body)
        self.assertIn(b'@messistatdotcom', body)
        self.assertIn(b'name="caption"', body)
        self.assertIn(b'name="photo"; filename="today.png"', body)
        self.assertIn(b'Content-Type: image/png', body)
        self.assertIn(png, body)
        self.assertNotIn(b'\r\r\n', body)
        self.assertIn('multipart/form-data; boundary=', req.headers['Content-type'])

    def test_uploader_missing_credentials_is_failopen(self):
        with mock.patch.object(tg, 'env_or_cfg', return_value=''), \
             mock.patch('urllib.request.urlopen') as net:
            res = daily._send_photo_bytes(b'png', 'caption')
        self.assertFalse(res['ok'])
        net.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)
