import re, subprocess
html = open('player.html', encoding='utf-8').read()
blocks = re.findall(r'<script>([\s\S]*?)</script>', html)
main = [b for b in blocks if 'loadRealPlayer' in b][0]
open('shots/player_inline.js', 'w', encoding='utf-8').write(main)
r = subprocess.run(['node', '--check', 'shots/player_inline.js'], capture_output=True)
print('node --check exit:', r.returncode)
print(r.stderr.decode('utf-8', 'replace')[:800] if r.stderr else 'OK')
