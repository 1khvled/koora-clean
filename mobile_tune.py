import os
import re

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

# ============ INDEX: expand 640px block (idempotent via marker) ============
idx = load('index.html')
assert 'MOBILE-TUNE-v1' not in idx, 'index mobile tune already applied'

OLD_640 = ("@media (max-width:640px){\n"
           "  .STING-web-Header{ flex-wrap:wrap; }\n"
           "  .live-card{ min-width:220px; }\n"
           "}")

NEW_640 = ("""/* MOBILE-TUNE-v1 — thumb-first match-day */
@media (max-width:640px){
  html,body{ overflow-x:hidden; }
  .STING-web-Max-Size{ width:100%; padding:0 10px; box-sizing:border-box; }
  header{ width:100%; }
  .STING-web-Header{ flex-wrap:wrap; gap:10px; padding:10px 12px; }
  .STING-web-Header-Right{ flex-wrap:wrap; gap:10px; width:100%; }
  .STING-web-Header-Logo{ height:52px; min-width:0; }
  .STING-WEB-SiteName{ font-size:20px !important; }
  .STING-web-Header-Menu{ width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; }
  .STING-web-Menu{ gap:8px; }
  .STING-web-Menu > li > a{ min-height:44px; align-items:center; padding:8px 14px; white-space:nowrap; }
  .STING-web-Container-Matches-Top{ top:0; }
  .STING-web-Matches-Toggle{ overflow-x:auto; -webkit-overflow-scrolling:touch; }
  .STING-web-Matches-Toggle > li > a{ min-height:44px; white-space:nowrap; display:flex; align-items:center; justify-content:center; }
  .search-box input{ font-size:16px; padding:12px 14px; padding-inline-start:42px; }
  .league-filter{ flex-wrap:nowrap; overflow-x:auto; padding-bottom:6px; -webkit-overflow-scrolling:touch; }
  .league-pill{ flex:none; min-height:44px; display:inline-flex; align-items:center; font-size:13px; padding:9px 16px; }
  .live-rail{ padding:12px; border-radius:14px; }
  .live-card{ min-width:78vw; max-width:78vw; }
  .lc-score{ font-size:18px; }
  .STING-web-Team-NAME{ font-size:13px !important; }
  #STING-web-Result{ font-size:20px; }
  #toast{ bottom:calc(20px + env(safe-area-inset-bottom)); }
}
@media (max-width:400px){
  /* MOBILE-TUNE-v1-fine */
  .STING-web-Team-Logo img{ width:38px; height:38px; }
  .lc-teams{ font-size:12px; }
  .STING-web-Header-Logo > a{ padding:6px 10px; }
}
@media (prefers-reduced-motion:reduce){
  /* MOBILE-TUNE-v1-motion */
  *,*::before,*::after{ animation:none !important; transition:none !important; }
  .live-dot{ animation:none !important; }
}
/* MOBILE-TUNE-v1-focus */
a:focus-visible,button:focus-visible,input:focus-visible{ outline:2px solid var(--brand); outline-offset:2px; }""")

idx = rep1(idx, OLD_640, NEW_640, 'index 640 block')
save('index.html', idx)

# ============ PLAYER: append mobile block + RTL inline fix ============
pl = load('player.html')
assert 'MOBILE-TUNE-v1' not in pl, 'player mobile tune already applied'

OLD_TAIL = (".ratio{ border-radius:0 0 16px 16px; }\n"
            ".player-header{ border-radius:16px 16px 0 0; }\n"
            "</style>")

NEW_TAIL = (""".ratio{ border-radius:0 0 16px 16px; }
.player-header{ border-radius:16px 16px 0 0; }
/* MOBILE-TUNE-v1 — full-bleed player, stacked 44px controls */
@media (max-width:640px){
  .player-wrap{ width:100%; padding:0 10px; box-sizing:border-box; }
  header{ width:100%; }
  .STING-web-Post{ margin:10px auto; }
  .player-card{ margin:10px 0; border-radius:14px !important; }
  .ratio{ border-radius:0 0 14px 14px; }
  .player-header{ border-radius:14px 14px 0 0; font-size:12px; }
  .controls{ margin:10px 0; padding:10px; gap:10px; }
  .controls .btn{ flex:1 1 100%; min-height:44px; font-size:14px; padding:12px 14px; }
  #blockCount{ margin-left:0; margin-inline-start:auto; width:100%; text-align:center; }
  .click-shield button{ min-height:48px; font-size:16px; max-width:88vw; }
  .log{ margin:10px 0; }
  .warn{ margin:10px 0; }
  .clean-toast{ bottom:calc(16px + env(safe-area-inset-bottom)); max-width:92vw; text-align:center; }
}
@media (prefers-reduced-motion:reduce){
  /* MOBILE-TUNE-v1-motion */
  .banner-mini-removed .heart{ animation:none; }
  .click-shield{ transition:none; }
}
/* MOBILE-TUNE-v1-rtl-focus */
#blockCount{ margin-inline-start:auto; }
a:focus-visible,button:focus-visible{ outline:2px solid #750044; outline-offset:2px; }
</style>""")

pl = rep1(pl, OLD_TAIL, NEW_TAIL, 'player style tail')

OLD_COUNT = '<span id="blockCount" style="margin-left:auto;'
NEW_COUNT = '<span id="blockCount" style="margin-inline-start:auto;'
pl = rep1(pl, OLD_COUNT, NEW_COUNT, 'blockCount RTL inline')
save('player.html', pl)

print('mobile_tune applied: index + player')
