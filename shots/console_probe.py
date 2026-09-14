"""Capture console errors on both pages."""
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
import functools

Handler = functools.partial(SimpleHTTPRequestHandler, directory=r'C:\Users\Abdelli\Desktop\Projects\koora-clean')
srv = ThreadingHTTPServer(('127.0.0.1', 8924), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    for url, wait in [('http://127.0.0.1:8924/index.html', 'networkidle'),
                      ('http://127.0.0.1:8924/player.html?demo=1', 'domcontentloaded')]:
        pg = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True)
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)[:160]))
        pg.on('console', lambda m: errs.append('CONSOLE-' + m.type + ': ' + m.text[:160]) if m.type in ('error',) else None)
        pg.goto(url, wait_until=wait, timeout=30000)
        pg.wait_for_timeout(4000)
        print(url.split('/')[-1], '->', errs if errs else 'CLEAN')
        pg.close()
    b.close()
srv.shutdown()
print('done')
