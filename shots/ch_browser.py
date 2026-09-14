"""Browser on the leaf stream page s15.yallaxsport.com/ch/ch9.php: catch video/m3u8 at runtime."""
import re
from playwright.sync_api import sync_playwright

URL = 'https://s15.yallaxsport.com/ch/ch9.php'
media, navs, consoles = [], [], []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844},
                        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36')
    pg = ctx.new_page()
    for pat in ['**://www.youtube.com/**', '**://youtube.com/**', '**://nn125.com/**',
                '**://acscdn.com/**', '**://toprevenuegate.com/**', '**://llvpn.com/**',
                '**://*.dynbetray.net/**']:
        pg.route(pat, lambda r: r.abort())
    pg.on('framenavigated', lambda f: navs.append(f.url[:160]))
    pg.on('console', lambda m: consoles.append(f'{m.type}: {m.text[:150]}'))
    pg.on('response', lambda r: media.append(f'{r.status} {r.url[:180]}')
          if re.search(r'm3u8|\.mp4|\.ts(\?|$)|\.m4s|/hls|\.mpd|/live/|seg|\.aac', r.url, re.I) else None)
    try:
        pg.goto(URL, timeout=45000, wait_until='domcontentloaded')
    except Exception as e:
        print('GOTO:', str(e)[:150])
    pg.wait_for_timeout(5000)
    print('URL@5s:', pg.url[:150], '| title:', pg.title()[:90])
    print('--- video/iframe tags ---')
    for sel in ['video', 'iframe']:
        for el in pg.query_selector_all(sel):
            print(f'  {sel}:', ((el.get_attribute('src') or '')[:180]))
    html = pg.content()
    print('bytes:', len(html))
    for pat in ['m3u8', '<video', 'source src', '.mpd']:
        hits = re.findall(r'.{50}' + pat + r'.{70}', html, re.I)
        print(f'  html~{pat}: {len(hits)}')
        for h in hits[:3]:
            print('    ', re.sub(r'\s+', ' ', h)[:170])
    pg.screenshot(path='shots/hd7_player.png')
    pg.wait_for_timeout(9000)
    print('URL@14s:', pg.url[:150])
    print('--- stream-ish responses ---')
    for m in media[:40]:
        print('  ', m)
    print('--- navs ---')
    for n in navs:
        print('  ', n)
    print('--- console (first 10) ---')
    for c in consoles[:10]:
        print('  ', c)
    b.close()
