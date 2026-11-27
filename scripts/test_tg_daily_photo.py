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


def utc(hh, mm=0, day=DAY):
    """Timezone-aware UTC instant for the time-gate tests (no real clock)."""
    return datetime.datetime(day.year, day.month, day.day, hh, mm,
                             tzinfo=datetime.timezone.utc)


NOW = utc(12, 0)   # safely after the default 08:00 posting hour

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


def run(state, fetch=None, send=OK, day=DAY, fetch_side=None, now=None, cfg=None):
    """post_daily_photo with every boundary mocked; returns (rc, send_mock).

    The clock and runtime config are pinned so these tests never depend on the
    real UTC time or on whatever tg_runtime.json happens to contain.
    """
    with mock.patch.object(tg, 'load_state', return_value=state), \
         mock.patch.object(tg, 'save_state'), \
         mock.patch.object(daily, 'runtime_config', return_value=cfg or {}), \
         mock.patch.object(daily, 'fetch_today',
                           return_value=sample_matches() if fetch is None else fetch,
                           side_effect=fetch_side) as ft, \
         mock.patch.object(daily, '_send_photo_bytes', return_value=send) as snd:
        rc = daily.post_daily_photo(day=day, now=now or NOW)
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

    def test_top_leagues_preferred_over_earlier_kickoff(self):
        top = {'time': '20:00', 'sort': '2026-11-22T20:00', 'home': 'Top',
               'away': 'Side', 'status': '', 'league_order': 9,
               'competition': 'Premier League'}
        lower = {'time': '12:00', 'sort': '2026-11-22T12:00', 'home': 'Lower',
                 'away': 'Side', 'status': '', 'league_order': 0,
                 'competition': 'Lower Division'}
        self.assertEqual(daily.select_matches([lower, top], limit=1), [top])

    def test_live_matches_come_before_top_competitions(self):
        live = {'time': '21:00', 'sort': '2026-11-22T21:00', 'home': 'Live',
                'away': 'Side', 'status': '1H', 'league_order': 8,
                'competition': 'Lower Division'}
        top = {'time': '13:00', 'sort': '2026-11-22T13:00', 'home': 'Top',
               'away': 'Side', 'status': '', 'league_order': 0,
               'competition': 'UEFA Champions League'}
        self.assertEqual(daily.select_matches([top, live]), [live, top])

    def test_live_payload_flag_wins_even_with_a_score(self):
        live = {'home': 'Live', 'sort': '2026-11-22T22:00', 'status': '2-1',
                'live': True, 'competition': 'Lower Division'}
        done = {'home': 'Done', 'sort': '2026-11-22T10:00', 'status': '3-0',
                'live': False, 'competition': 'Premier League'}
        self.assertEqual(daily.select_matches([done, live], limit=1)[0]['home'],
                         'Live')

    def test_top_allowlist_is_normalized(self):
        for name in ('LaLiga', 'la liga', 'UEFA Champions League',
                     'Saudi Pro League'):
            self.assertTrue(daily._is_top({'competition': name}), name)
        self.assertFalse(daily._is_top({'competition': 'Local Amateur Cup'}))

    def test_ambiguous_premier_league_filtered_by_ccode(self):
        eng = {'competition': 'Premier League', 'ccode': 'ENG'}
        wal = {'competition': 'Premier League', 'ccode': 'WAL'}
        aze = {'competition': 'Premier League', 'ccode': 'AZE'}
        ger = {'competition': 'Bundesliga', 'ccode': 'GER'}
        aut = {'competition': 'Bundesliga', 'ccode': 'AUT'}
        self.assertTrue(daily._is_top(eng))
        self.assertFalse(daily._is_top(wal))
        self.assertFalse(daily._is_top(aze))
        self.assertTrue(daily._is_top(ger))
        self.assertFalse(daily._is_top(aut))
        self.assertEqual(daily._comp_badge(wal), 'WAL')
        self.assertEqual(daily._comp_badge(eng), 'PREMIER LGE')

    def test_parsers_carry_competition_and_live_flags(self):
        payload = {'leagues': [{'name': 'Premier League', 'matches': [
            {'statusId': 2,
             'status': {'utcTime': '2026-11-22T20:00:00Z', 'started': True},
             'home': {'name': 'Arsenal', 'score': 1},
             'away': {'name': 'Chelsea', 'score': 0}},
        ]}]}
        parsed = daily.parse_fotmob(payload)
        self.assertEqual(parsed[0]['competition'], 'Premier League')
        self.assertTrue(parsed[0]['live'])
        self.assertTrue(daily._is_top(parsed[0]))
        espn = {'leagues': [{'name': 'La Liga'}], 'events': [{
            'date': '2026-11-22T18:00Z',
            'status': {'type': {'name': 'STATUS_IN_PROGRESS'}},
            'competitions': [{'competitors': [
                {'homeAway': 'home', 'team': {'displayName': 'Barcelona'}},
                {'homeAway': 'away', 'team': {'displayName': 'Getafe'}},
            ]}],
        }]}
        e = daily.parse_espn(espn)[0]
        self.assertEqual(e['competition'], 'La Liga')
        self.assertTrue(e['live'])


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
        from PIL import Image
        import io
        tiny = Image.new('RGBA', (8, 8), (0, 0, 255, 255))
        with mock.patch.object(daily, '_LOGO_CACHE', {'H': tiny, 'A': None}):
            png = daily.render_png(self._rows(), '2026-11-22')
        img = Image.open(io.BytesIO(png))
        x_match = daily.MATCH_X
        max_pair = (daily.WIDTH - daily.PAD - daily.PILL_W - 14) - x_match - 8
        geo = daily._pair_layout(x_match, max_pair)
        ry = daily.TITLE_H + daily.COL_H
        logo_y = ry + (daily.ROW_H - daily.LOGO_SIZE) // 2
        cx = geo['hx_crest'] + daily.LOGO_SIZE // 2
        self.assertEqual(img.getpixel((cx, logo_y + daily.LOGO_SIZE // 2)),
                         (0, 0, 255))  # real crest pasted inside medallion

        ax = geo['ax_crest']
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


class PostingHourTests(unittest.TestCase):
    """Fixed posting hour: no post before it, always a post after it."""

    CFG = {'daily_photo_time_utc': '08:00'}

    def test_default_and_invalid_configs(self):
        self.assertEqual(daily.configured_photo_time({}), '08:00')
        for bad in ('nonsense', '25:00', '08:99', '', None):
            self.assertEqual(
                daily.configured_photo_time({'daily_photo_time_utc': bad}),
                '08:00', bad)

    def test_config_is_parsed_and_zero_padded(self):
        self.assertEqual(
            daily.configured_photo_time({'daily_photo_time_utc': '9:05'}),
            '09:05')
        cfg = {'daily_photo_time_utc': '9:05'}
        self.assertFalse(daily.past_posting_hour(utc(9, 4), cfg))
        self.assertTrue(daily.past_posting_hour(utc(9, 5), cfg))

    def test_before_configured_hour_does_not_post_or_fetch(self):
        state = {}
        rc, snd, ft = run(state, now=utc(7, 59), cfg=self.CFG)
        self.assertFalse(rc)
        snd.assert_not_called()
        ft.assert_not_called()
        self.assertNotIn(daily.STATE_KEY, state)

    def test_at_configured_hour_posts_once(self):
        state = {}
        rc, snd, _ = run(state, now=utc(8, 0), cfg=self.CFG)
        self.assertTrue(rc)
        self.assertEqual(snd.call_count, 1)
        rc2, snd2, _ = run(state, now=utc(9, 0), cfg=self.CFG)
        self.assertFalse(rc2)
        snd2.assert_not_called()

    def test_late_start_still_posts_no_missed_day(self):
        state = {}
        rc, snd, _ = run(state, now=utc(23, 30), cfg=self.CFG)
        self.assertTrue(rc)
        self.assertEqual(snd.call_count, 1)
        self.assertEqual(state[daily.STATE_KEY], DS)
        rc2, snd2, _ = run(state, now=utc(23, 59), cfg=self.CFG)
        self.assertFalse(rc2)
        snd2.assert_not_called()

    def test_custom_hour_is_respected(self):
        cfg = {'daily_photo_time_utc': '20:00'}
        rc, snd, _ = run({}, now=utc(19, 59), cfg=cfg)
        self.assertFalse(rc)
        snd.assert_not_called()
        rc, snd, _ = run({}, now=utc(20, 0), cfg=cfg)
        self.assertTrue(rc)
        self.assertEqual(snd.call_count, 1)

    def test_state_guard_still_wins_after_the_hour(self):
        state = {daily.STATE_KEY: DS}
        rc, snd, ft = run(state, now=utc(12, 0), cfg=self.CFG)
        self.assertFalse(rc)
        snd.assert_not_called()
        ft.assert_not_called()

    def test_new_day_posts_again_after_the_hour(self):
        state = {}
        run(state, now=utc(12, 0), cfg=self.CFG)
        rc, snd, _ = run(state, day=NEXT_DAY, now=utc(8, 1), cfg=self.CFG)
        self.assertTrue(rc)
        self.assertEqual(snd.call_count, 1)
        self.assertEqual(state[daily.STATE_KEY], '20261123')

    def test_runtime_config_is_fail_silent(self):
        import tempfile
        missing = os.path.join(tempfile.gettempdir(),
                               'tg_runtime_missing_test.json')
        if os.path.exists(missing):
            os.unlink(missing)
        with mock.patch.object(daily, 'RUNTIME_PATH', missing):
            self.assertEqual(daily.runtime_config(), {})
        fd, bad = tempfile.mkstemp(suffix='.json')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write('{not json')
            with mock.patch.object(daily, 'RUNTIME_PATH', bad):
                self.assertEqual(daily.runtime_config(), {})
        finally:
            os.unlink(bad)


class SponsorTests(unittest.TestCase):
    """The optional muted footer slot: absent by default, plain text when set."""

    SPONSOR = 'Powered by Example Media'

    def setUp(self):
        patcher = mock.patch.object(daily, '_load_logos', return_value={})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_absent_by_default(self):
        self.assertEqual(daily.configured_sponsor_line({}), '')
        rows = sample_matches(2)
        self.assertNotIn(self.SPONSOR, daily.image_text(rows, '2026-11-22'))
        self.assertNotIn(self.SPONSOR,
                         daily.caption_text('2026-11-22', len(rows)))
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(daily.render_png(rows, '2026-11-22')))
        footer = [img.getpixel((x, y))
                  for x in range(daily.WIDTH - 300, daily.WIDTH - daily.PAD)
                  for y in range(img.height - daily.FOOTER_H, img.height)]
        self.assertNotIn(daily.MUTED, footer)

    def test_rendered_when_set(self):
        rows = sample_matches(2)
        cfg = {'sponsor_line': self.SPONSOR}
        self.assertEqual(daily.configured_sponsor_line(cfg), self.SPONSOR)
        self.assertIn(self.SPONSOR,
                      daily.image_text(rows, '2026-11-22', self.SPONSOR))
        plain = daily.render_png(rows, '2026-11-22')
        with_line = daily.render_png(rows, '2026-11-22', self.SPONSOR)
        self.assertNotEqual(plain, with_line)
        from PIL import Image
        import io
        a, b = Image.open(io.BytesIO(plain)), Image.open(io.BytesIO(with_line))
        self.assertEqual(a.height, b.height)   # no layout shift / extra rows
        footer = [b.getpixel((x, y))
                  for x in range(daily.WIDTH - 300, daily.WIDTH - daily.PAD)
                  for y in range(b.height - daily.FOOTER_H, b.height)]
        self.assertIn(daily.MUTED, footer)

    def test_sponsor_is_english_only_and_plain_text(self):
        txt = daily.image_text(sample_matches(2), '2026-11-22', self.SPONSOR)
        self.assertFalse(tg.has_arabic(txt))
        self.assertFalse(tg.has_foreign_script(txt))
        low = txt.lower()
        for bad in ('t.me', 'http', 'www.', '@', 'bet', 'casino', 'shop',
                    'store'):
            self.assertNotIn(bad, low)

    def test_non_english_sponsor_is_skipped_by_english_only_moat(self):
        state = {}
        rc, snd, _ = run(state, cfg={'sponsor_line': 'رعاة'})
        self.assertFalse(rc)
        snd.assert_not_called()
        self.assertNotIn(daily.STATE_KEY, state)

    def test_sponsor_line_is_trimmed(self):
        self.assertEqual(
            daily.configured_sponsor_line({'sponsor_line': '  Hello  '}),
            'Hello')


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
