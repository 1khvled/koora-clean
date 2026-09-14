"""hd7 round 3: block ad chain, stay on goalkooora player page, dump the player."""
import re
from playwright.sync_api import sync_playwright

URL = 'https://hd7livex.com/test1/'
media, navs = [], []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844},
                        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36')
    pg = ctx.new_page()
    for pat in ['**://www.youtube.com/**', '**://youtube.com/**', '**://nn125.com/**',
                '**://ab.blxwnnw.com/**', '**://*.blxwnnw.com/**', '**://doubleclick.net/**']:
        pg.route(pat, lambda r: r.abort())
    pg.on('framenavigated', lambda f: navs.append(f.url[:160]))
    pg.on('response', lambda r: media.append(f'{r.status} {r.url[:170]}')
          if re.search(r'm3u8|\.mp4|\.ts(\?|$)|\.m4s|/hls|player|embed|iframe|server|goalkooora', r.url, re.I) else None)
    try:
        pg.goto(URL, timeout=45000, wait_until='domcontentloaded')
    except Exception as e:
        print('GOTO:', str(e)[:150])
    pg.wait_for_timeout(10000)
    print('URL@10s:', pg.url[:150], '| title:', pg.title()[:90])
    print('--- navs ---')
    for n in navs:
        print('  ', n)
    print('--- frames ---')
    for f in pg.frames:
        print('  frame:', f.url[:180])
    print('--- video tags ---')
    for sel in ['video', 'iframe']:
        for el in pg.query_selector_all(sel):
            print(f'  {sel}:', ((el.get_attribute('src') or '')[:180]))
    print('--- clickable server/quality buttons ---')
    for el in pg.query_selector_all('button, a, li, div[onclick]'):
        try:
            t = (el.inner_text() or '').strip()
        except Exception:
            continue
        if t and re.search(r'سيرفر|server|جودة|bein|SSC|الكأس|مشاهدة|تشغيل|play|720|480|1080', t, re.I):
            print('  btn: "%s"' % t[:50].replace('\n', ' '))
    print('--- player-ish responses ---')
    for m in media[:40]:
        print('  ', m)
    html = pg.content()
    print('bytes:', len(html))
    for pat in ['m3u8', '<video', '<iframe', 'jwplayer', 'clappr', 'source src', 'file:']:
        hits = re.findall(r'.{60}' + pat + r'.{80}', html, re.I)
        print(f'  html~{pat}: {len(hits)}')
        for h in hits[:3]:
            print('    ', re.sub(r'\s+', ' ', h)[:180])
    pg.screenshot(path='shots/hd7_player.png')
    print('shot: shots/hd7_player.png')
    b.close()
