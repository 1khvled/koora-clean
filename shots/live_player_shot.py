"""Render OUR deployed player page for the live Abha match, screenshot + iframe report."""
import urllib.parse
from playwright.sync_api import sync_playwright

home = urllib.parse.quote('أبها')
away = urllib.parse.quote('الاتفاق')
url = f'https://kooraadz.vercel.app/player.html?id=4788139&home={home}&away={away}'

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
    errs = []
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text[:160]}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append(f'pageerror: {str(e)[:160]}'))
    pg.goto(url, wait_until='networkidle', timeout=45000)
    pg.wait_for_timeout(6000)
    info = pg.evaluate("""() => {
      const f = document.querySelector('iframe');
      const btn = document.getElementById('btnServers');
      const cs = btn ? getComputedStyle(btn) : null;
      return {iframe: f ? f.src : null,
              serversVisible: btn ? (cs.display !== 'none' && btn.style.display !== 'none') : null,
              docScrollW: document.documentElement.scrollWidth};
    }""")
    print('IFRAME:', info['iframe'])
    print('SERVERS BTN VISIBLE:', info['serversVisible'])
    print('SCROLLW:', info['docScrollW'])
    pg.screenshot(path='shots/live_player.png')
    print('CONSOLE:')
    for e in errs[:12]:
        print('  ', e)
    b.close()
print('done')
