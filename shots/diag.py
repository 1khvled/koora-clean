import functools, threading, json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT = r"C:\Users\Abdelli\Desktop\Projects\koora-clean"
srv = ThreadingHTTPServer(("127.0.0.1", 8902), functools.partial(SimpleHTTPRequestHandler, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
    pg.goto("http://127.0.0.1:8902/index.html", wait_until="networkidle")
    pg.wait_for_timeout(2000)
    print(pg.evaluate("""() => {
      const out = {innerWidth: window.innerWidth,
        docScrollW: document.documentElement.scrollWidth,
        bodyRect: JSON.stringify(document.body.getBoundingClientRect()),
        scrollX: window.scrollX, offenders: []};
      document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 2 || r.width > window.innerWidth + 2) {
          const cls = (el.className && el.className.baseVal !== undefined) ? el.className.baseVal : el.className;
          out.offenders.push(el.tagName + '.' + String(cls).slice(0,50) + ' x=' + Math.round(r.x) + ' w=' + Math.round(r.width) + ' right=' + Math.round(r.right) + ' pos=' + getComputedStyle(el).position);
        }
      });
      out.offenders = out.offenders.slice(0, 25);
      return JSON.stringify(out, null, 1);
    }"""))
    b.close()
srv.shutdown()
print("diag done")
