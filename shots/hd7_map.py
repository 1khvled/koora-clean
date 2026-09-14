"""Find Abha match on hd7livex homepage -> its live page -> embedded ch number (the match->channel mapping)."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}

def get(url, ref='https://hd7livex.com/'):
    req = urllib.request.Request(url, headers={**UA, 'Referer': ref, 'Accept': 'text/html,application/xhtml+xml'})
    return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')

home = get('https://hd7livex.com/')
print('home bytes:', len(home))
m = re.search(r'<title>([^<]*)', home)
print('TITLE:', m.group(1).strip() if m else None)
for name in ['أبها', 'ابها', 'الاتفاق', 'الخناشلة', 'اتحاد العاصمة', 'ليون', 'أوكسير']:
    j = home.find(name)
    if j >= 0:
        print(f'--- "{name}" at {j} ---')
        print(re.sub(r'\s+', ' ', home[max(0, j-300):j+500])[:850])
        hrefs = re.findall(r'href="([^"]+)"', home[max(0, j-3000):j])
        print('   NEAREST HREF:', hrefs[-1][:150] if hrefs else None)
