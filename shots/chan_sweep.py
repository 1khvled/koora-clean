"""Sweep likely romabar channel slugs: which exist, what match each carries."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}

def get(url):
    req = urllib.request.Request(url, headers={**UA, 'Referer': 'https://www.romabar.info/'})
    return urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'replace')

slugs = ([f'bein-{i}' for i in range(1, 13)] + ['bein-news', 'bein-xtra-1', 'bein-xtra-2']
         + ['ssc-1', 'ssc-extra-1', 'ssc-extra-2', 'alkass-one', 'alkass-two'])
for s in slugs:
    url = f'https://www.romabar.info/albaplayer/{s}/?serv=0'
    try:
        html = get(url)
        m = re.search(r'playerv5\.php\?match=(\d+)&key=([a-z0-9]+)', html)
        title = re.search(r'<title>([^<]{0,80})', html)
        print(f'{s}: OK match={m.group(1) if m else "?"} key={m.group(2)[:12]+".." if m else "?"} | {(title.group(1).strip()[:60] if title else "")}')
    except Exception as e:
        print(f'{s}: {str(e)[:60]}')
