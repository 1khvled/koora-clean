"""Scan a match page HTML for player-loader clues (read-only)."""
import re, sys, urllib.request

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
req = urllib.request.Request(sys.argv[1], headers={'User-Agent': UA, 'Referer': 'https://kooralive-plus.info/'})
html = urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')
print('page bytes:', len(html))
for pat in ['sting', 'iframe', 'admin-ajax', 'nonce', 'player', 'server', 'code']:
    hits = re.findall(r'.{60}' + pat + r'.{80}', html, re.I)
    print(f'--- {pat}: {len(hits)}')
    for h in hits[:6]:
        print('   ', re.sub(r'\s+', ' ', h)[:140])
