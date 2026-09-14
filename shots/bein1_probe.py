"""Dump bein-1 page iframe + serv structure (differs from bein-9)."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}
req = urllib.request.Request('https://www.romabar.info/albaplayer/bein-1/?serv=0',
                             headers={**UA, 'Referer': 'https://www.romabar.info/'})
html = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'replace')
print('bytes:', len(html))
for m in re.finditer(r'<iframe[^>]*>', html):
    print('IFRAME:', m.group(0)[:220])
t = re.search(r'<title>([^<]+)', html)
print('TITLE:', t.group(1).strip() if t else None)
for m in set(re.findall(r'href="([^"]*serv=\d[^"]*)"', html)):
    print('SERV:', m[:90])
