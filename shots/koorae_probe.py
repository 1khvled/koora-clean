"""Probe koorae.live (romabar's match frontend) for real player embeds on the Abha match."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}

def get(url, ref='https://www.romabar.info/'):
    req = urllib.request.Request(url, headers={**UA, 'Referer': ref, 'Accept': 'text/html,application/xhtml+xml'})
    return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')

html = get('https://koorae.live/matches-today/')
print('matches-today bytes:', len(html))
i = html.find('4788139')
if i < 0:
    # find Abha by name
    i = html.find('أبها')
print('abha at:', i)
if i >= 0:
    print(re.sub(r'\s+', ' ', html[max(0, i-800):i+800])[:1700])
    m = re.search(r'href="([^"]+)"[^>]{0,300}4788139|4788139[^>]{0,300}href="([^"]+)"', html)
    # simpler: nearest href before the hit
    hrefs = re.findall(r'href="([^"]+)"', html[max(0, i-2000):i])
    print('NEAREST HREF:', hrefs[-1][:150] if hrefs else None)
    if hrefs:
        mp = get(hrefs[-1] if hrefs[-1].startswith('http') else 'https://koorae.live' + hrefs[-1], 'https://koorae.live/matches-today/')
        print('match page bytes:', len(mp))
        for pat in ['<iframe', 'yasirtv', 'albaplayer', 'm3u8', '<video', 'serv=', 'server']:
            hits = re.findall(r'.{50}' + pat + r'.{70}', mp, re.I)
            print(f'  matchpage~{pat}: {len(hits)}')
            for h in hits[:3]:
                print('    ', re.sub(r'\s+', ' ', h)[:150])
