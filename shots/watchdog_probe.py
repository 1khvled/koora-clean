"""Probe the #8 watchdog: 3 blocks in 15s must auto-advance the server."""
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
import functools

Handler = functools.partial(SimpleHTTPRequestHandler, directory=r'C:\Users\Abdelli\Desktop\Projects\koora-clean')
srv = ThreadingHTTPServer(('127.0.0.1', 8922), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
    pg.goto('http://127.0.0.1:8922/player.html?demo=1', wait_until='domcontentloaded', timeout=30000)
    pg.wait_for_timeout(2500)
    r = pg.evaluate("""() => {
      showServers('https://one.example/a', 'https://two.example/b', 'https://fb.example/c');
      const before = document.getElementById('player').src;
      bumpBlocked(); bumpBlocked(); bumpBlocked();
      const after = document.getElementById('player').src;
      const t = document.getElementById('toast').textContent;
      return {before_len: before.length, after: after,
              toast: t, advanced: after.indexOf('two.example') >= 0,
              counter: document.getElementById('status').textContent};
    }""")
    print('WATCHDOG:', r)
    b.close()
srv.shutdown()
print('done')
