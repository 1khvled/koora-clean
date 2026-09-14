"""Probe sister STING domains: romabar albaplayer + kooralive24 structure."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml'}

def get(url, ref='https://kooralive-plus.info/'):
    req = urllib.request.Request(url, headers={**UA, 'Referer': ref})
    r = urllib.request.urlopen(req, timeout=25)
    return r.status, r.read().decode('utf-8', 'replace')

def scan(name, html):
    print(f'===== {name}: {len(html)} bytes')
    for pat in ['<iframe', 'm3u8', 'yasirtv', 'albaplayer', 'sting/v1', 'wp-json', 'watch', '<video', 'source src', 'Cloudfare|cloudflare|challenge|Just a moment']:
        hits = re.findall(r'.{40}' + pat + r'.{60}', html, re.I | re.S)
        print(f'  {pat}: {len(hits)}')
        for h in hits[:3]:
            print('    ', re.sub(r'\s+', ' ', h)[:130])

targets = [
    ('romabar-alba-bein9', 'https://www.romabar.info/albaplayer/bein-9/?serv=0'),
    ('romabar-home', 'https://www.romabar.info/'),
    ('koora24-home', 'https://kooralive24.com/'),
]
for name, url in targets:
    try:
        st, html = get(url)
        print(f'##### {name} HTTP {st}')
        scan(name, html)
    except Exception as e:
        print(f'##### {name} ERROR {str(e)[:120]}')
