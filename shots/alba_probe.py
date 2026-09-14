"""Map romabar AlbaPlayer: full yasirtv src, serv buttons, channel list, yasir internals."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml'}

def get(url, ref='https://www.romabar.info/'):
    req = urllib.request.Request(url, headers={**UA, 'Referer': ref})
    return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')

# 1. full iframe src + serv links from bein-9 page
html = get('https://www.romabar.info/albaplayer/bein-9/?serv=0')
m = re.search(r'<iframe[^>]*src="([^"]+)"', html)
print('FULL YASIR SRC:', m.group(1) if m else None)
print('SERV LINKS:', sorted(set(re.findall(r'href="([^"]*albaplayer/bein-9/[^"]*)"', html)))[:6])

# 2. yasirtv player internals -> m3u8?
if m:
    try:
        y = get(m.group(1), ref='https://www.romabar.info/albaplayer/bein-9/?serv=0')
        print('yasir bytes:', len(y))
        for pat in ['m3u8', '<source', 'file:', 'src:', 'iframe', 'playerSetup', '.mpd', 'token', 'key']:
            hits = re.findall(r'.{50}' + pat + r'.{70}', y, re.I)
            print(f'  yasir~{pat}: {len(hits)}')
            for h in hits[:3]:
                print('    ', re.sub(r'\s+', ' ', h)[:150])
    except Exception as e:
        print('yasir ERROR', str(e)[:150])

# 3. channel list from romabar homepage
try:
    home = get('https://www.romabar.info/')
    chans = sorted(set(re.findall(r'href="([^"]*albaplayer/[^"]*)"', home)))
    print('CHANNEL PAGES:', len(chans))
    for c in chans[:40]:
        print('  ', c[:100])
except Exception as e:
    print('home ERROR', str(e)[:120])
