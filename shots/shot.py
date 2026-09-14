import functools, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = r"C:\Users\Abdelli\Desktop\Projects\koora-clean"
OUT = ROOT + r"\shots"
import os
os.makedirs(OUT, exist_ok=True)

srv = ThreadingHTTPServer(("127.0.0.1", 8901),
    functools.partial(SimpleHTTPRequestHandler, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844},
                    device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.goto("http://127.0.0.1:8901/index.html", wait_until="networkidle")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=OUT + r"\m-index-top.png")
    pg.screenshot(path=OUT + r"\m-index-full.png", full_page=True)
    # scroll mid-page for match cards
    pg.evaluate("window.scrollTo(0, 900)")
    pg.wait_for_timeout(400)
    pg.screenshot(path=OUT + r"\m-index-mid.png")
    pg2 = b.new_page(viewport={"width": 390, "height": 844},
                     device_scale_factor=2, is_mobile=True, has_touch=True)
    pg2.goto("http://127.0.0.1:8901/player.html", wait_until="networkidle")
    pg2.wait_for_timeout(1500)
    pg2.screenshot(path=OUT + r"\m-player-top.png")
    pg2.screenshot(path=OUT + r"\m-player-full.png", full_page=True)
    b.close()
srv.shutdown()
print("shots done")
