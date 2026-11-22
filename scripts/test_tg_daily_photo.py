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
    def setUp(self):
        # Parsed fixtures now carry real crest URLs; keep these tests offline.
        patcher = mock.patch.object(daily, '_load_logos', return_value={})
        patcher.start()
        self.addCleanup(patcher.stop)

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


class DesignTests(unittest.TestCase):
    """Offline checks for the dark sports-broadcast design system."""

    @staticmethod
    def _rows():
        return [
            {'time': '14:00', 'home': 'Arsenal', 'away': 'Chelsea', 'status': ''},
            {'time': '15:00', 'home': 'Liverpool', 'away': 'Everton', 'status': '1H'},
            {'time': '16:00', 'home': 'Barcelona', 'away': 'Getafe', 'status': '2-1'},
            {'time': '17:00', 'home': 'Real Madrid', 'away': 'Ajax', 'status': 'Canc'},
        ]

    def test_palette_matches_design_system(self):
        self.assertEqual(daily.BG, (11, 16, 32))          # #0B1020
        self.assertEqual(daily.SURFACE_A, (18, 26, 46))   # #121A2E
        self.assertEqual(daily.SURFACE_B, (24, 34, 58))   # #18223A
        self.assertEqual(daily.RED, (220, 38, 38))        # #DC2626
        self.assertEqual(daily.RED_2, (239, 68, 68))      # #EF4444
        self.assertEqual(daily.GOLD, (251, 191, 36))      # #FBBF24
        self.assertEqual(daily.WHITE, (255, 255, 255))
        self.assertEqual(daily.SLATE, (148, 163, 184))    # #94A3B8
        self.assertEqual(daily.FT_GREEN, (110, 231, 183))

    def test_type_scale_has_no_sub_14px_text_and_16px_rows(self):
        self.assertGreaterEqual(daily.MIN_FONT_SIZE, 14)
        for name in ('FONT_TITLE', 'FONT_DATE', 'FONT_COL', 'FONT_ROW',
                     'FONT_PILL', 'FONT_FOOT'):
            self.assertGreaterEqual(getattr(daily, name), daily.MIN_FONT_SIZE, name)
        self.assertGreaterEqual(daily.FONT_ROW, 16)
        self.assertGreaterEqual(daily.FONT_TITLE, 30)
        self.assertLessEqual(daily.FONT_TITLE, 36)

    def test_header_text_is_uppercase_and_english_only(self):
        self.assertEqual(daily.header_text('2026-11-22'),
                         "TODAY'S MATCHES - 2026-11-22")
        self.assertFalse(tg.has_arabic(daily.header_text('2026-11-22')))
        self.assertFalse(tg.has_foreign_script(daily.header_text('2026-11-22')))

    def test_image_text_still_covers_all_drawn_labels(self):
        txt = daily.image_text(self._rows(), '2026-11-22')
        for word in ('TODAY', '2026-11-22', 'TIME', 'MATCH', 'STATUS',
                     'Arsenal', 'Chelsea', '4 matches'):
            self.assertIn(word, txt)

    def test_status_style_mapping(self):
        for live in ('LIVE', '1H', '2H', 'HT'):
            self.assertEqual(daily._status_style(live), (daily.RED, daily.WHITE))
        for done in ('FT', '2-1', '0 - 0'):
            self.assertEqual(daily._status_style(done),
                             (daily.FT_PILL, daily.FT_GREEN))
        for quiet in ('', 'Canc', 'Pstp'):
            self.assertEqual(daily._status_style(quiet),
                             (daily.SLATE_PILL, daily.SLATE))

    def test_rendered_pixels_use_dark_palette(self):
        from PIL import Image
        import io
        rows = self._rows()
        img = Image.open(io.BytesIO(daily.render_png(rows, '2026-11-22')))
        safe_x = daily.WIDTH - daily.PAD - daily.PILL_W - 32  # clear of text/pill
        self.assertEqual(img.getpixel((daily.WIDTH // 2, 2)), daily.RED)
        self.assertEqual(img.getpixel((daily.WIDTH // 2, 20)), daily.BG)
        self.assertEqual(img.getpixel((safe_x, daily.TITLE_H + 4)), daily.COL_BG)
        row0_y = daily.TITLE_H + daily.COL_H + 4
        self.assertEqual(img.getpixel((safe_x, row0_y)), daily.SURFACE_A)
        self.assertEqual(img.getpixel((safe_x, row0_y + daily.ROW_H)),
                         daily.SURFACE_B)
        self.assertEqual(img.getpixel((safe_x, img.height - 2)), daily.SURFACE_A)

    def test_status_pill_colors_in_rendered_png(self):
        from PIL import Image
        import io
        rows = self._rows()
        img = Image.open(io.BytesIO(daily.render_png(rows, '2026-11-22')))
        px = daily.WIDTH - daily.PAD - 6  # inside pill, clear of centred label
        expected = [daily.SLATE_PILL, daily.RED, daily.FT_PILL, daily.SLATE_PILL]
        for i, want in enumerate(expected):
            ry = daily.TITLE_H + daily.COL_H + i * daily.ROW_H
            y = ry + daily.ROW_H // 2
            self.assertEqual(img.getpixel((px, y)), want, 'row %d pill' % i)

    def test_font_falls_back_to_windows_unicode_fonts(self):
        from PIL import ImageFont

        class FakeFont:
            pass

        calls = []

        def fake_truetype(path, size):
            calls.append(str(path))
            low = str(path).lower()
            if 'windows\\fonts\\' in low and ('segoeui' in low or 'arial' in low):
                return FakeFont
            raise OSError('unavailable in this test')

        with mock.patch.object(ImageFont, 'truetype', side_effect=fake_truetype):
            self.assertIs(daily._font(16), FakeFont)
        self.assertTrue(any('C:\\Windows\\Fonts\\' in p for p in calls))
        self.assertTrue(any('segoeui.ttf' in p for p in calls))
        self.assertTrue(any(p.startswith('/usr/share/fonts/') for p in calls))


class LogoTests(unittest.TestCase):
    """Offline coverage for crest fetching, caching, fallback and bounding."""

    @staticmethod
    def _rows():
        return [
            {'time': '14:00', 'home': 'Arsenal', 'away': 'Chelsea', 'status': '',
             'home_tid': 'H', 'home_logo': 'http://crest.test/h',
             'away_tid': 'A', 'away_logo': 'http://crest.test/a'},
        ]

    def test_parsers_carry_fotmob_cdn_and_espn_direct_logo_urls(self):
        fotmob = {'leagues': [{'matches': [{
            'home': {'name': 'Arsenal', 'id': 8650},
            'away': {'name': 'Chelsea', 'id': 631},
            'status': {'utcTime': '2026-11-22T14:00:00Z'},
        }]}]}
        got = daily.parse_fotmob(fotmob)[0]
        self.assertEqual(got['home_tid'], '8650')
        self.assertEqual(got['home_logo'],
                         'https://images.fotmob.com/image_resources/'
                         'logo/teamlogo/8650.png')
        espn = {'events': [{
            'date': '2026-11-22T14:00Z',
            'status': {'type': {'name': 'STATUS_SCHEDULED'}},
            'competitions': [{'competitors': [
                {'homeAway': 'home',
                 'team': {'displayName': 'Barcelona', 'id': '83',
                          'logo': 'https://a.espncdn.com/soccer/83.png'}},
                {'homeAway': 'away',
                 'team': {'displayName': 'Getafe', 'id': '2884',
                          'logo': 'https://a.espncdn.com/soccer/2884.png'}},
            ]}],
        }]}
        e = daily.parse_espn(espn)[0]
        self.assertEqual(e['home_logo'], 'https://a.espncdn.com/soccer/83.png')
        self.assertEqual(e['away_tid'], '2884')

    def test_initials_for_monogram_fallback(self):
        self.assertEqual(daily._initials('Atletico Madrid'), 'AM')
        self.assertEqual(daily._initials('Liverpool'), 'L')
        self.assertEqual(daily._initials('Paris Saint-Germain'), 'PSG')
        self.assertEqual(daily._initials(''), '?')

    def test_monogram_badge_is_drawn_on_failure(self):
        from PIL import Image, ImageDraw
        img = Image.new('RGB', (60, 40), daily.BG)
        d = ImageDraw.Draw(img)
        daily._draw_monogram(img, d, 4, 6, 'Atletico Madrid')
        colors = {img.getpixel((x, y))
                  for x in range(4, 4 + daily.LOGO_SIZE)
                  for y in range(6, 6 + daily.LOGO_SIZE)}
        self.assertIn(daily.BADGE_FILL, colors)

    def test_logo_painted_when_fetch_succeeds_and_monogram_on_failure(self):
        from PIL import Image, ImageDraw
        import io
        tiny = Image.new('RGBA', (8, 8), (0, 0, 255, 255))
        with mock.patch.object(daily, '_LOGO_CACHE', {'H': tiny, 'A': None}):
            png = daily.render_png(self._rows(), '2026-11-22')
        img = Image.open(io.BytesIO(png))
        draw = ImageDraw.Draw(img)
        x = daily.PAD + 96  # x_match
        ry = daily.TITLE_H + daily.COL_H
        logo_y = ry + (daily.ROW_H - daily.LOGO_SIZE) // 2
        cx = x + daily.LOGO_SIZE // 2
        self.assertEqual(img.getpixel((cx, logo_y + daily.LOGO_SIZE // 2)),
                         (0, 0, 255))  # real crest pasted

        v_w = draw.textlength('v', font=daily._font(daily.FONT_ROW, True))
        max_pair = (daily.WIDTH - daily.PAD - daily.PILL_W - 12) - x - 8
        half = max(48, (max_pair - int(v_w) - 24) // 2)
        ax = x + half + int(v_w) + 14
        colors = {img.getpixel((xx, yy))
                  for xx in range(ax + 2, ax + daily.LOGO_SIZE - 2)
                  for yy in range(logo_y + 2, logo_y + daily.LOGO_SIZE - 2)}
        self.assertIn(daily.BADGE_FILL, colors)  # failed away crest -> badge

    def test_cache_hit_avoids_refetch_and_no_duplicate_per_team(self):
        from PIL import Image
        calls = []

        def fake(url):
            calls.append(url)
            return Image.new('RGBA', (8, 8), (1, 2, 3, 255))

        rows = self._rows() + [{
            'home_tid': 'H', 'home_logo': 'http://crest.test/h',
            'away_tid': 'B', 'away_logo': 'http://crest.test/b',
        }]
        with mock.patch.object(daily, '_LOGO_CACHE', {}):
            first = daily._load_logos(rows, fetcher=fake)
            self.assertEqual(sorted(calls),
                             ['http://crest.test/a', 'http://crest.test/b',
                              'http://crest.test/h'])
            second = daily._load_logos(rows, fetcher=fake)
            self.assertEqual(len(calls), 3)  # cache hit: no second fetch
        self.assertEqual(set(first), {'H', 'A', 'B'})
        self.assertTrue(all(im is not None for im in second.values()))

    def test_failed_logo_cached_as_none_and_never_raises(self):
        rows = self._rows()
        with mock.patch.object(daily, '_LOGO_CACHE', {}):

            def boom(url):
                raise OSError('404')

            got = daily._load_logos(rows, fetcher=boom)
            self.assertIsNone(got['H'])
            self.assertIsNone(got['A'])

            called = []

            def count(url):
                called.append(url)
                return None

            daily._load_logos(rows, fetcher=count)
            self.assertEqual(called, [])  # cached failure, not retried

    def test_logo_phase_is_bounded(self):
        import concurrent.futures
        self.assertEqual(daily.LOGO_MAX, 60)
        self.assertLessEqual(daily.LOGO_WORKERS, 12)
        self.assertLessEqual(daily.LOGO_TIMEOUT, 4)
        seen = {}
        real_pool = concurrent.futures.ThreadPoolExecutor

        class RecordingPool(real_pool):
            def __init__(self, max_workers=None, **kwargs):
                seen['workers'] = max_workers
                super().__init__(max_workers=max_workers, **kwargs)

        many = [{'home_tid': str(i), 'home_logo': 'http://c/%d' % i}
                for i in range(70)]
        with mock.patch.object(daily, '_LOGO_CACHE', {}), \
             mock.patch('concurrent.futures.ThreadPoolExecutor', RecordingPool):
            got = daily._load_logos(many, fetcher=lambda u: None)
        self.assertEqual(seen['workers'], daily.LOGO_WORKERS)
        self.assertEqual(len(got), daily.LOGO_MAX)  # capped at 60


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
