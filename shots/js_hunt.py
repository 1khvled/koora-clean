"""Find the theme JS that calls sting/v1/iframes and learn its exact convention."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      'Referer': 'https://kooralive-plus.info/'}

def get(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')

html = get('https://kooralive-plus.info/today-matches/')
scripts = re.findall(r'<script[^>]*src="([^"]+)"', html)
print(len(scripts), 'script tags')
for s in scripts:
    if 'sting' in s.lower() or 'yalla' in s.lower() or 'shoot' in s.lower() or 'custom' in s.lower() or 'main' in s.lower():
        print('CANDIDATE:', s[:130])
        try:
            js = get(s if s.startswith('http') else 'https://kooralive-plus.info' + s)
        except Exception as e:
            print('  fetch err', str(e)[:80]); continue
        for pat in ['sting/v1', 'iframes', 'match_id', 'nonce', 'admin-ajax', 'server']:
            if pat in js:
                print(f'  has "{pat}"')
                for m in re.finditer(r'.{80}' + re.escape(pat) + r'.{100}', js):
                    print('   ', re.sub(r'\s+', ' ', m.group(0))[:190])
