"""Probe upstream kooralive-plus.info for currently LIVE matches (read-only)."""
import re, urllib.request, sys

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml', 'Referer': 'https://kooralive-plus.info/'}

def get(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')

def get_attr(tag, name):
    m = re.search(name + '="([^"]*)"', tag)
    return m.group(1) if m else ''

day = sys.argv[1] if len(sys.argv) > 1 else 'today'
target = {'today': 'https://kooralive-plus.info/today-matches/',
          'yesterday': 'https://kooralive-plus.info/yesterday-matches/',
          'tomorrow': 'https://kooralive-plus.info/tomorrow-matches/'}[day]
html = get(target)
live, others = [], 0
for m in re.finditer(r'<a href="([^"]*)"[^>]*>', html):
    tag = m.group(0)
    if 'data-home' not in tag:
        continue
    others += 1
    home = get_attr(tag, 'data-home')
    away = get_attr(tag, 'data-away')
    status = get_attr(tag, 'data-status-code')
    official = get_attr(tag, 'data-official-status')
    gt = get_attr(tag, 'data-game-time')
    if status.upper() == 'LIVE' or 'جارية' in official or gt:
        live.append({'href': m.group(1), 'id': get_attr(tag, 'data-fixture-id'),
                     'home': home, 'away': away, 'league': get_attr(tag, 'data-league'),
                     'status': status, 'official': official, 'game_time': gt})
print(f'{day}: {others} matches parsed, {len(live)} look live')
for m in live:
    print(' LIVE:', m['home'], 'vs', m['away'], '|', m['league'], '|',
          m['status'], '|', m['official'], '|', m['game_time'], '|', m['href'], '| id=', m['id'])
