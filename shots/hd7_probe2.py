"""hd7livex test1 round 2: block YT redirect, log navigations/console, dump player chain."""
import re
from playwright.sync_api import sync_playwright

URL = 'https://hd7livex.com/test1/'
media, navs, consoles = [], [], []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844},
                        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36')
    pg = ctx.new_page()
    pg.route('**://www.youtube.com/**', lambda r: r.abort())
    pg.route('**://youtube.com/**', lambda r: r.abort())
    pg.on('framenavigated', lambda f: navs.append(f.url[:150]))
    pg.on('console', lambda m: consoles.append(f'{m.type}: {m.text[:150]}'))
    pg.on('response', lambda r: media.append(f'{r.status} {r.url[:160]}')
          if re.search(r'm3u8|\.mp4|\.ts(\?|$)|\.m4s|/hls|/live|player|embed|iframe|server', r.url, re.I) else None)
    try:
        pg.goto(URL, timeout=45000, wait_until='domcontentloaded')
    except Exception as e:
        print('GOTO:', str(e)[:150])
    pg.wait_for_timeout(4000)
    print('URL@4s:', pg.url[:120], '| title:', pg.title()[:80])
    print('--- navigations ---')
    for n in navs:
        print('  ', n)
    print('--- iframes@4s ---')
    for f in pg.frames:
        print('  frame:', f.url[:170])
    print('--- console (first 15) ---')
    for c in consoles[:15]:
        print('  ', c)
    pg.wait_for_timeout(8000)
    print('URL@12s:', pg.url[:120], '| title:', pg.title()[:80])
    print('--- media/stream/player responses ---')
    for m in media[:30]:
        print('  ', m)
    html = pg.content()
    print('bytes:', len(html))
    for pat in ['m3u8', 'playerv5', 'yasirtv', 'albaplayer', '<video', '<iframe', 'jwplayer', 'clappr', 'hls\\.']:
        hits = re.findall(r'.{60}' + pat + r'.{80}', html, re.I)
        print(f'  html~{pat}: {len(hits)}')
        for h in hits[:2]:
            print('    ', re.sub(r'\s+', ' ', h)[:170])
    pg.screenshot(path='shots/hd7_player.png')
    print('shot: shots/hd7_player.png')
    b.close()
