"""Dump hd7livex test1 body: redirect logic + player embeds."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}
req = urllib.request.Request('https://hd7livex.com/test1/', headers={**UA, 'Referer': 'https://www.google.com/'})
html = urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')
print('bytes:', len(html))
print('--- title/head ---')
m = re.search(r'<title>([^<]*)', html)
print('TITLE:', m.group(1).strip() if m else None)
for pat in ['youtube', 'location', 'meta[^>]*refresh', '<iframe', '<video', 'm3u8', 'player', 'server', 'سيرفر']:
    hits = re.findall(r'.{70}' + pat + r'.{90}', html, re.I)
    print(f'== {pat}: {len(hits)}')
    for h in hits[:4]:
        print('   ', re.sub(r'\s+', ' ', h)[:200])
