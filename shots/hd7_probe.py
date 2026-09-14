"""Inspect the user's player lead: hd7livex.com/test1/ — dump player chain."""
import re, sys
from playwright.sync_api import sync_playwright

URL = 'https://hd7livex.com/test1/'
media, iframes_seen = [], []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 390, 'height': 844},
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36')
    pg.on('response', lambda r: media.append(f'{r.status} {r.url[:160]}')
          if re.search(r'm3u8|\.mp4|\.ts(\?|$)|\.m4s|/hls|/live|/stream|player|embed', r.url, re.I) else None)
    try:
        pg.goto(URL, timeout=45000, wait_until='domcontentloaded')
    except Exception as e:
        print('GOTO:', str(e)[:120])
    pg.wait_for_timeout(9000)
    print('TITLE:', pg.title()[:100])
    print('FINAL URL:', pg.url[:120])
    print('--- iframes ---')
    for f in pg.frames:
        print('  frame:', f.url[:170])
    print('--- iframe tags ---')
    for el in pg.query_selector_all('iframe'):
        print('  tag src=', (el.get_attribute('src') or '')[:170])
    print('--- video tags ---')
    for el in pg.query_selector_all('video'):
        print('  video src=', (el.get_attribute('src') or '')[:150], '| inner:', (el.inner_html() or '')[:150])
    print('--- server-ish buttons/links ---')
    for el in pg.query_selector_all('button, a'):
        t = (el.inner_text() or '').strip()
        if t and re.search(r'سيرفر|server|جودة|bein|SSC|الكأس|مشاهدة|play|تشغيل', t, re.I):
            print(f'  [{el.tag_name()}] "{t[:40]}" href={(el.get_attribute("href") or "")[:100]}')
    html = pg.content()
    print('bytes:', len(html))
    for pat in ['m3u8', 'playerv5', 'yasirtv', 'albaplayer', 'koralive', '<video', '<iframe', 'jwplayer', 'clappr', 'hls']:
        hits = re.findall(r'.{60}' + pat + r'.{80}', html, re.I)
        print(f'  html~{pat}: {len(hits)}')
        for h in hits[:2]:
            print('    ', re.sub(r'\s+', ' ', h)[:170])
    print('--- media/stream responses ---')
    for m in media[:30]:
        print('  ', m)
    pg.screenshot(path='shots/hd7_player.png')
    print('shot: shots/hd7_player.png')
    b.close()
