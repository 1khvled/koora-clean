"""Screenshot the new own-UI index + player (local server, matches.json fallback)."""
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
import functools

Handler = functools.partial(SimpleHTTPRequestHandler, directory=r'C:\Users\Abdelli\Desktop\Projects\koora-clean')
srv = ThreadingHTTPServer(('127.0.0.1', 8921), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
    pg.goto('http://127.0.0.1:8921/index.html', wait_until='networkidle', timeout=30000)
    pg.wait_for_timeout(2500)
    info = pg.evaluate("""() => {
      const bad = [];
      document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > 391 && r.width < 5000) bad.push(el.tagName + '.' + el.className.toString().slice(0,40) + '=' + Math.round(r.width));
      });
      return {scrollW: document.documentElement.scrollWidth,
              cards: document.querySelectorAll('.m').length,
              live: document.querySelectorAll('.live-card').length,
              chips: document.querySelectorAll('.chip').length,
              bad};
    }""")
    print('INDEX:', info)
    pg.screenshot(path=r'C:\Users\Abdelli\Desktop\Projects\koora-clean\shots\own_index.png')
    pg2 = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
    pg2.goto('http://127.0.0.1:8921/player.html?demo=1', wait_until='domcontentloaded', timeout=30000)
    pg2.wait_for_timeout(4000)
    info2 = pg2.evaluate("""() => ({scrollW: document.documentElement.scrollWidth,
      title: document.getElementById('matchTitle').textContent,
      shield: !document.getElementById('clickShield').classList.contains('hidden')})""")
    print('PLAYER:', info2)
    pg2.screenshot(path=r'C:\Users\Abdelli\Desktop\Projects\koora-clean\shots\own_player.png')
    b.close()
srv.shutdown()
print('done')
