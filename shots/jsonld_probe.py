"""Probe the #9 JSON-LD injection on index."""
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
import functools, json

Handler = functools.partial(SimpleHTTPRequestHandler, directory=r'C:\Users\Abdelli\Desktop\Projects\koora-clean')
srv = ThreadingHTTPServer(('127.0.0.1', 8923), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
    pg.goto('http://127.0.0.1:8923/index.html', wait_until='networkidle', timeout=30000)
    pg.wait_for_timeout(2500)
    r = pg.evaluate("""() => {
      const s = document.getElementById('jsonld');
      if (!s) return {present: false};
      const g = JSON.parse(s.textContent)['@graph'];
      return {present: true, count: g.length, first: g[0].name, types: [...new Set(g.map(e => e['@type']))]};
    }""")
    print('JSONLD:', r)
    b.close()
srv.shutdown()
print('done')
