"""Fetch s15.yallaxsport.com/ch/ch9.php — the real stream embed. Scan for m3u8/video/config."""
import re, urllib.request
from collections import Counter

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}

def get(url, ref):
    req = urllib.request.Request(url, headers={**UA, 'Referer': ref, 'Accept': 'text/html,application/xhtml+xml'})
    return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')

h = get('https://s15.yallaxsport.com/ch/ch9.php', 'https://goalkooora.info/m9/test1.php')
print('ch9.php bytes:', len(h))
m = re.search(r'<title>([^<]*)', h)
print('TITLE:', m.group(1).strip() if m else None)
for pat in ['m3u8', '<video', '<iframe', 'source', 'jwplayer', 'clappr', '\\.mpd', 'rtmp', 'wmsAuthSign', 'token']:
    hits = re.findall(r'.{60}' + pat + r'.{90}', h, re.I)
    print(f'== {pat}: {len(hits)}')
    for x in hits[:4]:
        print('   ', re.sub(r'\s+', ' ', x)[:200])
print('--- script srcs ---')
for s in re.findall(r'<script[^>]+src="([^"]+)', h):
    print('  ', s[:150])
print('--- hosts ---')
hosts = Counter(re.sub(r'^www\.', '', u) for u in re.findall(r'https?://([A-Za-z0-9_.\-]+)', h))
for host, n in hosts.most_common(25):
    print(f'  {n:4d}  {host}')
