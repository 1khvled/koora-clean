"""Apply the NET effect of mobile_fix2+fix3+fix4 to the -inline mirrors.

Mirrors lag behind index.html/player.html (fix2..fix4 never applied there).
fix3's timing-stack was reverted by fix4, so it is skipped here on purpose.
Idempotent: rep1 no-ops when the new text is already present.
"""
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

# ============ INDEX MIRROR ============
idx = load('index-inline.html')

idx = rep1(idx,
    "/* MOBILE-TUNE-v1 — thumb-first match-day */",
    UNDRAWER_1000 + "/* MOBILE-TUNE-v1 — thumb-first match-day */",
    'mirror index undrawer 1000 block')

idx = rep1(idx,
    "  .STING-web-Header-Menu{ width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; }",
    ("  .STING-web-Header-Menu{ margin:10px 0 0 !important; padding:0 0 4px !important; overflow-x:auto !important; overflow-y:hidden !important; -webkit-overflow-scrolling:touch; }\n"
     "  .STING-web-Menu{ flex-wrap:nowrap !important; }\n"
     "  .STING-web-Menu > li{ flex:none; }\n"
     "  .STING-web-Menu > li > a{ background:var(--card); border:1px solid var(--line); border-radius:999px; }\n"
     "  .STING-web-Menu > li > a:hover{ border-color:var(--brand); }"),
    'mirror index nav pill row')

idx = rep1(idx,
    "  .STING-web-Matches-Toggle > li > a{ min-height:44px; white-space:nowrap; display:flex; align-items:center; justify-content:center; }",
    ("  .STING-web-Matches-Toggle > li > a{ min-height:44px; white-space:nowrap; display:flex; align-items:center; justify-content:center; }\n"
     "  /* MOBILE-FIX-v3 — single brand color for day tabs (theme leaks blue/orange) */\n"
     "  .STING-web-Matches-Toggle > li > a:not(.on){ background:var(--card) !important; color:var(--muted) !important; }\n"
     "  .STING-web-Matches-Toggle > li > a.on{ background:var(--brand) !important; color:#fff !important; box-shadow:none !important; }"),
    'mirror index day-tab unify')

save('index-inline.html', idx)

# ============ PLAYER MIRROR ============
pl = load('player-inline.html')

pl = rep1(pl,
    "/* MOBILE-TUNE-v1 — full-bleed player, stacked 44px controls */",
    UNDRAWER_1000 + "/* MOBILE-TUNE-v1 — full-bleed player, stacked 44px controls */",
    'mirror player undrawer 1000 block')

pl = rep1(pl,
    "  header{ width:100%; }",
    ("  header{ width:100%; }\n"
     "  .STING-web-Header-Menu{ margin:10px 0 0 !important; padding:0 0 4px !important; overflow-x:auto !important; overflow-y:hidden !important; -webkit-overflow-scrolling:touch; }\n"
     "  .STING-web-Menu{ flex-wrap:nowrap !important; }\n"
     "  .STING-web-Menu > li{ flex:none; }"),
    'mirror player nav pill row')

pl = rep1(pl,
    '<div class="STING-web-Header-Logo"><a href="./"><span class="STING-WEB-SiteName"></span><span class="STING-WEB-SiteUrl"></span></a></div>',
    '<div class="STING-web-Header-Logo"><a href="./"><span class="STING-WEB-SiteName">كورة لايف</span><span class="STING-WEB-SiteUrl">بث نظيف بدون إعلانات</span></a></div>',
    'mirror player logo text')

pl = rep1(pl,
    ("  .STING-web-Menu{ flex-wrap:nowrap !important; }\n"
     "  .STING-web-Menu > li{ flex:none; }"),
    ("  /* MOBILE-FIX-v4 — wrap header: centered logo row, pills row below */\n"
     "  .STING-web-Header{ flex-wrap:wrap !important; row-gap:8px; }\n"
     "  .STING-web-Header-Right{ flex-wrap:wrap !important; gap:10px !important; flex:1 1 100%; min-width:0; }\n"
     "  .STING-web-Header-Logo{ margin:8px auto !important; white-space:nowrap !important; }\n"
     "  .STING-web-Menu{ flex-wrap:nowrap !important; }\n"
     "  .STING-web-Menu > li{ flex:none; }\n"
     "  /* MOBILE-FIX-v4 — ink text (drawer leaks white), kill drawer grid stack */\n"
     "  .STING-web-Menu{ display:flex !important; margin-top:0 !important; }\n"
     "  .STING-web-Menu > li{ margin-bottom:0 !important; }\n"
     "  .STING-web-Menu > li > a{ background:#fff; border:1px solid #e2e8f0; border-radius:999px; min-height:44px; display:inline-flex; align-items:center; padding:8px 16px; white-space:nowrap; color:#141b26 !important; height:auto !important; border-bottom:0 !important; }"),
    'mirror player pills + header (fix3+fix4 net)')

save('player-inline.html', pl)

print('mirrors synced: index-inline + player-inline')
