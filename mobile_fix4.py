import os

BASE = os.path.dirname(os.path.abspath(__file__))

def load(p):
    with open(os.path.join(BASE, p), encoding='utf-8') as f:
        return f.read()

def save(p, s):
    with open(os.path.join(BASE, p), 'w', encoding='utf-8', newline='') as f:
        f.write(s)

def rep1(s, old, new, name):
    n = s.count(old)
    if n == 0 and new in s:
        return s  # already applied (idempotent re-run)
    assert n == 1, f'EXPECTED 1, FOUND {n}: {name}'
    return s.replace(old, new)

# ============ INDEX ============
idx = load('index.html')
assert 'MOBILE-FIX-v4' not in idx, 'index fix4 already applied'

# 1) REVERT fix3 timing-stack: the red "live now" banner is a ::before
#    absolutely positioned against .STING-web-Data (position:relative).
#    Forcing position:static re-anchored it to the whole card (full-width bar).
#    Theme already stacks time/score/status vertically — leave it alone.
idx = rep1(idx,
    ("  #STING-web-Result{ font-size:20px; }\n"
     "  /* MOBILE-FIX-v3 — stack time/score/status, kill pill overlap */\n"
     "  .STING-web-Match-Timing{ display:flex; flex-direction:column; align-items:center; gap:6px; }\n"
     "  .STING-web-Match-Timing > div{ position:static !important; transform:none !important; float:none !important; margin:0 !important; }"),
    ("  #STING-web-Result{ font-size:20px; }\n"
     "  /* MOBILE-FIX-v4 — reverted v3 timing stack: broke .STING-web-Data.LIVE::before anchor (theme owns live banner) */"),
    'index revert timing stack')

save('index.html', idx)

# ============ PLAYER ============
pl = load('player.html')
assert 'MOBILE-FIX-v4' not in pl, 'player fix4 already applied'

# 2) Nav pills: theme's <=1000px drawer styles links dark bg + white text
#    (display:grid stack). We set bg #fff but never set color -> invisible text.
#    Kill the grid, force ink text.
pl = rep1(pl,
    ("  /* MOBILE-FIX-v3 — readable nav pills */\n"
     "  .STING-web-Menu > li > a{ background:#fff; border:1px solid #e2e8f0; border-radius:999px; min-height:44px; display:inline-flex; align-items:center; padding:8px 16px; white-space:nowrap; }"),
    ("  /* MOBILE-FIX-v3 — readable nav pills */\n"
     "  /* MOBILE-FIX-v4 — ink text (drawer leaks white), kill drawer grid stack */\n"
     "  .STING-web-Menu{ display:flex !important; margin-top:0 !important; }\n"
     "  .STING-web-Menu > li{ margin-bottom:0 !important; }\n"
     "  .STING-web-Menu > li > a{ background:#fff; border:1px solid #e2e8f0; border-radius:999px; min-height:44px; display:inline-flex; align-items:center; padding:8px 16px; white-space:nowrap; color:#141b26 !important; height:auto !important; border-bottom:0 !important; }"),
    'player pill ink + grid kill')

# 3) Header: let logo center on its own row, pills scroll below it.
pl = rep1(pl,
    "  .STING-web-Menu{ flex-wrap:nowrap !important; }",
    ("  /* MOBILE-FIX-v4 — wrap header: centered logo row, pills row below */\n"
     "  .STING-web-Header{ flex-wrap:wrap !important; row-gap:8px; }\n"
     "  .STING-web-Header-Right{ flex-wrap:wrap !important; gap:10px !important; flex:1 1 100%; min-width:0; }\n"
     "  .STING-web-Header-Logo{ margin:8px auto !important; white-space:nowrap !important; }\n"
     "  .STING-web-Menu{ flex-wrap:nowrap !important; }"),
    'player header wrap')

save('player.html', pl)

print('mobile_fix4 applied: index revert + player pills/header')
