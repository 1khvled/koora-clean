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

UNDRAWER_1000 = """/* MOBILE-FIX-v2 — dead drawer becomes an inline nav row (theme ships no opener) */
@media (max-width:1000px){
  .STING-web-Header-Menu{ position:static !important; right:auto !important; top:auto !important; float:none !important; width:100% !important; height:auto !important; margin:0 !important; padding:0 !important; background:transparent !important; box-shadow:none !important; border:0 !important; z-index:auto !important; transition:none !important; overflow:visible !important; }
}
"""

# ============ INDEX ============
idx = load('index.html')
assert 'MOBILE-FIX-v2' not in idx, 'index fix2 already applied'

# 1) Neutralize the dead drawer across the theme's whole <=1000px drawer range.
idx = rep1(idx,
    "/* MOBILE-TUNE-v1 — thumb-first match-day */",
    UNDRAWER_1000 + "/* MOBILE-TUNE-v1 — thumb-first match-day */",
    'index undrawer 1000 block')

# 2) Mobile nav pill row (replaces the v1 line that widened the parked drawer).
idx = rep1(idx,
    "  .STING-web-Header-Menu{ width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; }",
    ("  .STING-web-Header-Menu{ margin:10px 0 0 !important; padding:0 0 4px !important; overflow-x:auto !important; overflow-y:hidden !important; -webkit-overflow-scrolling:touch; }\n"
     "  .STING-web-Menu{ flex-wrap:nowrap !important; }\n"
     "  .STING-web-Menu > li{ flex:none; }\n"
     "  .STING-web-Menu > li > a{ background:var(--card); border:1px solid var(--line); border-radius:999px; }\n"
     "  .STING-web-Menu > li > a:hover{ border-color:var(--brand); }"),
    'index nav pill row')
save('index.html', idx)

# ============ PLAYER ============
pl = load('player.html')
assert 'MOBILE-FIX-v2' not in pl, 'player fix2 already applied'

pl = rep1(pl,
    "/* MOBILE-TUNE-v1 — full-bleed player, stacked 44px controls */",
    UNDRAWER_1000 + "/* MOBILE-TUNE-v1 — full-bleed player, stacked 44px controls */",
    'player undrawer 1000 block')

pl = rep1(pl,
    "  header{ width:100%; }",
    ("  header{ width:100%; }\n"
     "  .STING-web-Header-Menu{ margin:10px 0 0 !important; padding:0 0 4px !important; overflow-x:auto !important; overflow-y:hidden !important; -webkit-overflow-scrolling:touch; }\n"
     "  .STING-web-Menu{ flex-wrap:nowrap !important; }\n"
     "  .STING-web-Menu > li{ flex:none; }"),
    'player nav pill row')
save('player.html', pl)

print('mobile_fix2 applied: index + player')
