"""Scroll a live match page, hunt the player block, click server buttons, capture iframe."""
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--disable-blink-features=AutomationControlled'])
    pg = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
    pg.goto(url, wait_until='domcontentloaded', timeout=45000)
    pg.wait_for_timeout(8000)
    # scroll through page to trigger lazy loads
    for _ in range(8):
        pg.mouse.wheel(0, 900)
        pg.wait_for_timeout(1200)
    pg.wait_for_timeout(4000)
    print('== candidate player controls ==')
    print(pg.evaluate("""() => Array.from(document.querySelectorAll(
      'button, a.btn, .server, [class*=server], [class*=Server], [class*=player], [class*=Player], [onclick*=play], [onclick*=server], [data-server], [data-src]'
    )).slice(0, 40).map(e => (e.tagName + ' | ' + (e.className.baseVal !== undefined ? '' : e.className) + ' | ' + (e.innerText||'').slice(0,40) + ' | ' + (e.getAttribute('onclick')||'').slice(0,80)).trim()).join('\\n')"""))
    print('== iframes after scroll ==')
    print(pg.evaluate("() => Array.from(document.querySelectorAll('iframe')).map(f => f.src).join('\\n')"))
    print('== video tags ==')
    print(pg.evaluate("() => Array.from(document.querySelectorAll('video')).map(v => v.currentSrc || v.src || '[video]').join('\\n')"))
    print('== sting net calls ==')
    print(pg.evaluate("() => (window.performance.getEntriesByType('resource')||[]).map(r=>r.name).filter(u=>/sting|iframe|server|stream|m3u8/i.test(u)).join('\\n')"))
    pg.screenshot(path=r'C:\Users\Abdelli\Desktop\Projects\koora-clean\shots\match-scrolled.png', full_page=True)
    b.close()
print('hunt done')
