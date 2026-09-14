"""Verify the full static chain on a SECOND match (Lyon): card -> page -> live -> m9 -> leaf."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}

def get(url, ref='https://hd7livex.com/'):
    req = urllib.request.Request(url, headers={**UA, 'Referer': ref, 'Accept': 'text/html,application/xhtml+xml'})
    return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')

day = get('https://hd7livex.com/matches-today/')
noscr = re.sub(r'<script.*?</script>', '', day, flags=re.S)
j = noscr.find('ليون')
print('lyon at:', j)
card = noscr[max(0, j-1500):j+500]
m = re.search(r"href='([^']+)'[^>]*title='([^']*ليون[^']*)'|href='([^']+)'", card)
hrefs = re.findall(r"href='([^']+)'", card)
print('CARD HREFS:', [h[:100] for h in hrefs])
page_url = [h for h in hrefs if 'hd7livex.com/' in h and 'matches-' not in h]
if not page_url:
    print('NO CARD LINK FOUND')
    raise SystemExit
print('MATCH PAGE:', page_url[-1])
mp = get(page_url[-1], 'https://hd7livex.com/matches-today/')
live = re.findall(r'<iframe[^>]+src="([^"]+)"', mp)
print('PAGE IFRAMES:', [u[:100] for u in live])
lv = [u for u in live if '/live/' in u]
if lv:
    h = get(lv[0], page_url[-1])
    m9 = re.findall(r'<iframe[^>]+src="([^"]+)"', h)
    print('LIVE IFRAMES:', [u[:100] for u in m9])
    inner = [u for u in m9 if '/m9/' in u]
    if inner:
        h2 = get(inner[0], lv[0])
        print('M9 BODY:', h2[:400])
