"""Load a live match page in real Chromium, report iframes + player clues."""
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--disable-blink-features=AutomationControlled'])
    pg = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
    try:
        pg.goto(url, wait_until='domcontentloaded', timeout=45000)
    except Exception as e:
        print('NAV:', str(e)[:150])
    pg.wait_for_timeout(12000)
    print('title:', pg.title()[:100])
    print('cf-challenge:', pg.evaluate("document.title + ' | ' + document.body.innerText.slice(0,120)"))
    frames = pg.evaluate("""() => Array.from(document.querySelectorAll('iframe')).map(f => f.src)""")
    print('iframes:', frames)
    print('sting-api-calls:', pg.evaluate(
        """() => (window.performance.getEntriesByType('resource') || [])"""
        """.map(r => r.name).filter(u => u.includes('sting') || u.includes('iframe')).join('\\n')"""))
    pg.screenshot(path=r'C:\Users\Abdelli\Desktop\Projects\koora-clean\shots\live-match-page.png')
    b.close()
print('browser probe done')
