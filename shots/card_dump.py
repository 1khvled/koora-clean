"""Dump the FULL match card div for Abha (4788139): every attr, channel info?."""
import re, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}
req = urllib.request.Request('https://kooralive-plus.info/today-matches/', headers={**UA, 'Referer': 'https://kooralive-plus.info/'})
html = urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')
i = html.find('id="4788139"')
# find enclosing card: back up to <div class="STING-web-Match", forward past its close
start = html.rfind('<div class="STING-web-Match"', 0, i)
# crude: take 6000 chars
card = html[start:start+6000]
card = card[:card.find('<div class="STING-web-Match"', 10) if card.find('<div class="STING-web-Match"', 10) > 0 else 6000]
print(re.sub(r'><', '>\n<', card)[:5000])
