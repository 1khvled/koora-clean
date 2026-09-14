"""A) raw match anchors on kooralive day page (channel attrs?)  B) romabar match pages (players?)."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}

def get(url, ref):
    req = urllib.request.Request(url, headers={**UA, 'Referer': ref})
    return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')

print('######## A: kooralive anchor for Abha match')
html = get('https://kooralive-plus.info/today-matches/', 'https://kooralive-plus.info/')
i = html.find('4788139')
print(re.sub(r'\s+', ' ', html[max(0, i-1500):i+200])[-1700:])

print()
print('######## B: romabar homepage match links')
home = get('https://www.romabar.info/', 'https://www.romabar.info/')
links = sorted(set(re.findall(r'href="([^"]+)"', home)))
match_links = [l for l in links if 'match' in l.lower() or 'albaplayer' in l.lower() or 'channel' in l.lower() or 'bein' in l.lower()]
print(len(links), 'total links;', len(match_links), 'match/player-ish:')
for l in match_links[:20]:
    print('  ', l[:120])
