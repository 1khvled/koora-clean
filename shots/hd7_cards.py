"""Find hd7livex match CARD links (scripts stripped) for Abha + list match URL patterns."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}
req = urllib.request.Request('https://hd7livex.com/', headers={**UA, 'Referer': 'https://www.google.com/'})
home = urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')
noscr = re.sub(r'<script.*?</script>', '', home, flags=re.S)
print('bytes noscript:', len(noscr))
j = noscr.find('أبها')
print('abha card at:', j)
if j >= 0:
    print(re.sub(r'\s+', ' ', noscr[max(0, j-1500):j+1500])[:3000])
print()
print('--- all internal hrefs containing match-ish slugs ---')
seen = set()
for h in re.findall(r'href="(https://hd7livex\.com/[^"]+)"', noscr):
    if h not in seen and not re.search(r'\.(css|js|png|jpg|webp|ico)', h):
        seen.add(h)
for h in sorted(seen)[:60]:
    print('  ', h[:130])
