"""Fetch sting iframes API from inside real Chromium (legit origin+cookies), dump match entries."""
import sys, json
from playwright.sync_api import sync_playwright

mid = sys.argv[1] if len(sys.argv) > 1 else '4788139'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--disable-blink-features=AutomationControlled'])
    pg = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
    pg.goto('https://kooralive-plus.info/', wait_until='domcontentloaded', timeout=45000)
    pg.wait_for_timeout(6000)
    for base in ['https://kooralive-plus.info', 'https://kooralive24.com', 'https://www.romabar.info']:
        r = pg.evaluate("""async (base) => {
          try {
            const res = await fetch(base + '/wp-json/sting/v1/iframes',
              {headers: {'X-Requested-With': 'XMLHttpRequest'}});
            const txt = await res.text();
            return res.status + ' :: ' + txt.slice(0, 300);
          } catch(e) { return 'JSERR ' + e; }
        }""", base)
        print(base, '->', r[:400])
        print('---')
    b.close()
print('api browser probe done, match_id sought:', mid)
