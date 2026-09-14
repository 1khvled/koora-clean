"""Extract the big obfuscated inline script, save it, and surface any cleartext clues."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}
req = urllib.request.Request('https://kooralive-plus.info/today-matches/', headers=UA)
s = urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')
scripts = [m.group(1) for m in re.finditer(r'<script(?![^>]*src)[^>]*>(.*?)</script>', s, re.S)
           if len(m.group(1).strip()) > 5000]
print('big inline scripts:', len(scripts))
big = max(scripts, key=len)
open(r'C:\Users\Abdelli\Desktop\Projects\koora-clean\shots\obf.js', 'w', encoding='utf-8').write(big)
print('saved', len(big), 'chars')
for pat in ['wp-json', 'sting', 'iframe', 'm3u8', 'server', 'match', 'https:', 'fetch(', 'XMLHttpRequest', '.php', 'player']:
    hits = [m.group(0) for m in re.finditer(r'.{50}' + pat + r'.{60}', big)][:4]
    print(f'--- {pat}: {len(hits)} shown of {big.count(pat)}')
    for h in hits:
        print('   ', re.sub(r'\s+', ' ', h)[:120])
