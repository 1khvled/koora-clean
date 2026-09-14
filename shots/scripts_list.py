"""List every script (src + inline size) on the today-matches page."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}
req = urllib.request.Request('https://kooralive-plus.info/today-matches/', headers=UA)
s = urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')
print('--- external ---')
for m in re.findall(r'<script[^>]*src="([^"]+)"', s):
    print(' ', m[:140])
print('--- inline ---')
for m in re.finditer(r'<script(?![^>]*src)[^>]*>(.*?)</script>', s, re.S):
    body = m.group(1).strip()
    if len(body) < 30:
        continue
    print(f'  [{len(body)} chars] {body[:200]!r}')
    print()
