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
assert 'MOBILE-FIX-v3' not in idx, 'index fix3 already applied'

# 1) One brand color for day tabs: ghost when idle, maroon when active.
idx = rep1(idx,
    "  .STING-web-Matches-Toggle > li > a{ min-height:44px; white-space:nowrap; display:flex; align-items:center; justify-content:center; }",
    ("  .STING-web-Matches-Toggle > li > a{ min-height:44px; white-space:nowrap; display:flex; align-items:center; justify-content:center; }\n"
     "  /* MOBILE-FIX-v3 — single brand color for day tabs (theme leaks blue/orange) */\n"
     "  .STING-web-Matches-Toggle > li > a:not(.on){ background:var(--card) !important; color:var(--muted) !important; }\n"
     "  .STING-web-Matches-Toggle > li > a.on{ background:var(--brand) !important; color:#fff !important; box-shadow:none !important; }"),
    'index day-tab unify')

# 2) Timing column: clean vertical stack, no absolute overlap of status pills.
idx = rep1(idx,
    "  #STING-web-Result{ font-size:20px; }",
    ("  #STING-web-Result{ font-size:20px; }\n"
     "  /* MOBILE-FIX-v3 — stack time/score/status, kill pill overlap */\n"
     "  .STING-web-Match-Timing{ display:flex; flex-direction:column; align-items:center; gap:6px; }\n"
     "  .STING-web-Match-Timing > div{ position:static !important; transform:none !important; float:none !important; margin:0 !important; }"),
    'index timing stack')
save('index.html', idx)

# ============ PLAYER ============
pl = load('player.html')
assert 'MOBILE-FIX-v3' not in pl, 'player fix3 already applied'

# 3) Player header logo was shipped with empty spans (collapsed box).
pl = rep1(pl,
    '<div class="STING-web-Header-Logo"><a href="./"><span class="STING-WEB-SiteName"></span><span class="STING-WEB-SiteUrl"></span></a></div>',
    '<div class="STING-web-Header-Logo"><a href="./"><span class="STING-WEB-SiteName">كورة لايف</span><span class="STING-WEB-SiteUrl">بث نظيف بدون إعلانات</span></a></div>',
    'player logo text')

# 4) Player nav pills: same readable pill treatment as index.
pl = rep1(pl,
    ("  .STING-web-Menu{ flex-wrap:nowrap !important; }\n"
     "  .STING-web-Menu > li{ flex:none; }"),
    ("  .STING-web-Menu{ flex-wrap:nowrap !important; }\n"
     "  .STING-web-Menu > li{ flex:none; }\n"
     "  /* MOBILE-FIX-v3 — readable nav pills */\n"
     "  .STING-web-Menu > li > a{ background:#fff; border:1px solid #e2e8f0; border-radius:999px; min-height:44px; display:inline-flex; align-items:center; padding:8px 16px; white-space:nowrap; }"),
    'player nav pills')
save('player.html', pl)

print('mobile_fix3 applied: index + player')
