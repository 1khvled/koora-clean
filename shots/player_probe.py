"""Test player resolution for a live match (read-only probes)."""
import re, sys, json, urllib.request

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'

def get(url, headers=None):
    h = {'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml',
         'Referer': 'https://kooralive-plus.info/'}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')

href = sys.argv[1]
mid = sys.argv[2] if len(sys.argv) > 2 else ''
print('match page:', href[:100])
html = get(href)
m = re.search(r'<iframe[^>]*src=(["\'])([^"\']*(?:yasirtv|romabar|alba|player)[^"\']*)\1[^>]*>', html, re.I)
print('direct iframe in match HTML:', m.group(2) if m else None)
if not m:
    for base in ['https://kooralive-plus.info', 'https://kooralive24.com', 'https://www.romabar.info']:
        try:
            r = get(base + '/wp-json/sting/v1/iframes',
                    {'Accept': 'application/json', 'Referer': base + '/',
                     'Origin': base, 'X-Requested-With': 'XMLHttpRequest'})
            data = json.loads(r)
            if not isinstance(data, list):
                print(base, '->', str(data)[:80]); continue
            hit = [x for x in data
                   if str(x.get('match_id')) == mid or str(x.get('id')) == mid]
            print(base, f'-> {len(data)} entries, match hits: {len(hit)}')
            for x in hit:
                sm = re.search(r'src=(["\'])([^"\']+)\1', x.get('code', ''))
                print('   code src:', sm.group(2) if sm else None)
                print('   keys:', list(x.keys()))
            break
        except Exception as e:
            print(base, 'ERROR', str(e)[:120])
