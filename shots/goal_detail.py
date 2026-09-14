"""Extract server list + stream config from goalkooora /live/ page; print /m9/ shell fully."""
import re, urllib.request
from collections import Counter

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}

def get(url, ref):
    req = urllib.request.Request(url, headers={**UA, 'Referer': ref, 'Accept': 'text/html,application/xhtml+xml'})
    return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')

print('############ /m9/ FULL (279 bytes) ############')
print(get('https://goalkooora.info/m9/test1.php', 'https://goalkooora.info/live/test1.php'))
print()
print('############ /live/ detail ############')
h = get('https://goalkooora.info/live/test1.php', 'https://hd7livex.com/test1/')
print('script srcs:')
for s in re.findall(r'<script[^>]+src="([^"]+)', h):
    print('  ', s[:150])
print('--- server/channel buttons ---')
for m in re.finditer(r'<(li|button|a|div)[^>]*(server|channel|serv|bein|SSC|iality)[^>]*>([^<]{0,60})', h, re.I):
    print('  ', re.sub(r'\s+', ' ', m.group(0))[:180])
print('--- onclick/data handlers ---')
seen = set()
for m in re.findall(r'(onclick|data-[a-z-]+)="([^"]{0,200})"', h):
    k = m[0] + '=' + m[1][:80]
    if k not in seen and re.search(r'serv|play|load|switch|go|channel', m[1], re.I):
        seen.add(k)
        print('  ', k[:180])
print('--- inline script: interesting chunks ---')
for sc in re.findall(r'<script(?![^>]*src=)[^>]*>(.*?)</script>', h, re.S):
    if re.search(r'server|source|file|m3u8|embed|iframe|http', sc, re.I):
        print('  ...', re.sub(r'\s+', ' ', sc.strip())[:600])
        print('  -----')
print('--- URL hosts referenced ---')
hosts = Counter(re.sub(r'^www\.', '', u.split('/')[2]) for u in re.findall(r'https?://([A-Za-z0-9_.\-]+)', h))
for host, n in hosts.most_common(25):
    print(f'  {n:4d}  {host}')
