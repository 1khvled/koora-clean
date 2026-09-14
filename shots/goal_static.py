"""Static fetch of goalkooora player pages (no JS => no ad redirect)."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}

def get(url, ref):
    req = urllib.request.Request(url, headers={**UA, 'Referer': ref, 'Accept': 'text/html,application/xhtml+xml'})
    return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')

h1 = get('https://goalkooora.info/live/test1.php', 'https://hd7livex.com/test1/')
print('live/test1.php bytes:', len(h1))
m = re.search(r'<title>([^<]*)', h1)
print('TITLE:', m.group(1).strip() if m else None)
for pat in ['m9/', 'location', 'window.open', '<iframe', 'player', 'server', 'سيرفر', 'albaplayer', 'yasirtv', 'm3u8']:
    hits = re.findall(r'.{60}' + pat + r'.{90}', h1, re.I)
    print(f'== {pat}: {len(hits)}')
    for h in hits[:3]:
        print('   ', re.sub(r'\s+', ' ', h)[:190])

print()
print('############ m9 page ############')
h2 = get('https://goalkooora.info/m9/test1.php', 'https://goalkooora.info/live/test1.php')
print('m9/test1.php bytes:', len(h2))
m = re.search(r'<title>([^<]*)', h2)
print('TITLE:', m.group(1).strip() if m else None)
for pat in ['<iframe', 'src="http', 'player', 'server', 'سيرفر', 'albaplayer', 'yasirtv', 'm3u8', '<video', 'serv=']:
    hits = re.findall(r'.{60}' + pat + r'.{90}', h2, re.I)
    print(f'== {pat}: {len(hits)}')
    for h in hits[:5]:
        print('   ', re.sub(r'\s+', ' ', h)[:200])
