"""Find where the actual video player lives: scan day pages + romabar for watch/play links."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml', 'Referer': 'https://kooralive-plus.info/'}

def get(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')

for page in ['https://kooralive-plus.info/', 'https://kooralive-plus.info/today-matches/']:
    try:
        html = get(page)
    except Exception as e:
        print(page, 'ERROR', str(e)[:100]); continue
    print('=====', page, len(html), 'bytes')
    for pat in ['watch', 'play', 'live-tv', 'player', '/server', 'channel', 'bein', 'qanawat', 'tv-']:
        hits = set()
        for m in re.finditer(r'href="([^"]*%s[^"]*)"' % pat, html, re.I):
            hits.add(m.group(1)[:110])
        print(f'  href~{pat}: {len(hits)}')
        for h in sorted(hits)[:8]:
            print('    ', h)
