/* ads.js — Koora banner slots. Banner units ONLY (no popups, no interstitials,
   nothing inside the video player). Default ON; the user toggle persists in
   localStorage under 'koora_ads'. Units are the owner's own codes, rendered
   inside sandboxed srcdoc iframes so provider document.write calls cannot
   touch the page, and ad clicks can only open a new tab (never hijack). */
(function () {
  'use strict';
  var KEY = 'koora_ads';
  var N_SRC = 'https://pl31775792.profitableratecpmnetwork.com/be0e02a320b5124b4e5f04bdd873852a/invoke.js';
  var N_BOX = 'container-be0e02a320b5124b4e5f04bdd873852a';
  var S_KEY = 'b184c0e669a8ff1f59faf710e4f7304d';
  var S_SRC = 'https://www.highrevenueformat.com/' + S_KEY + '/invoke.js';

  function enabled() {
    try { return localStorage.getItem(KEY) !== '0'; }
    catch (e) { return true; }
  }
  function set(on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
  }

  /* Side rails need room: only wide viewports fill. ?ads=force overrides
     (preview on narrow screens). */
  var RAIL_MIN = 1280;
  function wideEnough() {
    try {
      if (String(location.search || '').indexOf('ads=force') !== -1) return true;
      if (window.matchMedia) return window.matchMedia('(min-width:' + RAIL_MIN + 'px)').matches;
    } catch (e) {}
    return false;
  }

  /* Full srcdoc document for one slot. The provider <script> tags run inside
     this inner document (still open at parse time), so their document.write
     calls land in the frame, never in our page. */
  function doc(kind) {
    var head = '<!doctype html><html><head><meta charset="utf-8">' +
      '<base target="_blank">' +
      '<style>html,body{margin:0;padding:0;background:transparent}' +
      'body{text-align:center}iframe{border:0;max-width:100%}img{max-width:100%;height:auto}</style>' +
      '</head><body>';
    var tail = '</body></html>';
    /* Plain tags: this file is external, so a literal close tag in a JS
       string is perfectly safe (no inline-parser interaction). */
    if (kind === 'side') {
      return head +
        '<script>atOptions={' +
        "'key':'" + S_KEY + "'," +
        "'format':'iframe'," +
        "'height':600," +
        "'width':160," +
        "'params':{}};</script>" +
        '<script src="' + S_SRC + '"></script>' + tail;
    }
    return head +
      '<script async="async" data-cfasync="false" src="' + N_SRC + '"></script>' +
      '<div id="' + N_BOX + '"></div>' + tail;
  }

  /* Auto-size the frame to its creative (same-origin via srcdoc, so readable).
     The 160x600 unit keeps its exact size. */
  function fit(fr, kind) {
    var tries = 0;
    function go() {
      tries++;
      try {
        var b = fr.contentDocument && fr.contentDocument.body;
        if (b) {
          if (kind === 'side') {
            fr.style.width = '160px';
            fr.style.height = '600px';
          } else {
            var h = Math.max(b.scrollHeight || 0,
              (b.firstElementChild && b.firstElementChild.scrollHeight) || 0);
            if (h > 20) fr.style.height = Math.min(h, 700) + 'px';
          }
        }
      } catch (e) {}
      if (tries < 6) setTimeout(go, 900);
    }
    try { fr.addEventListener('load', function () { setTimeout(go, 400); }); } catch (e) {}
    setTimeout(go, 1200);
  }

  /* True when the provider actually put a creative in the frame. Empty
     units stay hidden -- never a big blank "Advertisement" box. */
  function hasContent(slot, kind) {
    try {
      var d = slot.querySelector('iframe').contentDocument;
      if (!d || !d.body) return false;
      if (d.getElementsByTagName('iframe').length > 0) return true;
      if (d.getElementsByTagName('img').length > 0) return true;
      var box = (kind === 'side') ? d.body : d.getElementById(N_BOX);
      if (!box) return false;
      if (box.children.length > 0) return true;
      var t = (box.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length > 30) return true;
      return false;
    } catch (e) { return false; }
  }

  function reveal(slot, fr, kind) {
    slot.classList.add('on');
    slot.hidden = false;
    slot.style.display = '';
    fit(fr, kind);
  }

  /* Poll for a real creative; reveal on first sight, destroy on timeout. */
  function watch(slot, kind, fr) {
    var n = 0;
    var iv = setInterval(function () {
      n++;
      var hit = false;
      try { hit = hasContent(slot, kind); } catch (e) { hit = false; }
      if (hit) {
        try { clearInterval(iv); } catch (e) {}
        try { reveal(slot, fr, kind); } catch (e) {}
      } else if (n >= 24) {
        try { clearInterval(iv); } catch (e) {}
        /* Empty: remove the frame so no blank box remains. data-filled is
           cleared so a later re-enable retries from scratch. */
        try {
          slot.innerHTML = '';
          slot.removeAttribute('data-filled');
          slot.classList.remove('on');
        } catch (e) {}
      }
    }, 500);
  }

  function fill(slot, now) {
    if (!slot || slot.getAttribute('data-filled') === '1') return;
    if (!enabled()) return;
    /* kind: native|side = desktop side rails; flow = in-flow band (watch
       page), fills at any width. unit: side keeps 160x600, else native. */
    var kind = slot.getAttribute('data-ad') || 'native';
    var unit = (kind === 'side') ? 'side' : 'native';
    if (kind !== 'flow' && !wideEnough()) return;
    var lab = document.createElement('div');
    lab.className = 'adtag';
    lab.textContent = 'Advertisement';
    var fr = document.createElement('iframe');
    fr.setAttribute('title', 'Advertisement');
    fr.setAttribute('scrolling', 'no');
    fr.setAttribute('loading', 'lazy');
    /* No allow-top-navigation: ad clicks open a new tab, they can never
       redirect or popup-hijack this page. No allow-forms/pointer-lock. */
    fr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    fr.style.width = unit === 'side' ? '160px' : '100%';
    fr.style.height = unit === 'side' ? '600px' : '120px';
    fr.style.maxWidth = '100%';
    try { fr.srcdoc = doc(unit); }
    catch (e) { return; }
    slot.appendChild(lab);
    slot.appendChild(fr);
    slot.setAttribute('data-filled', '1');
    /* Stays hidden until the watchdog sees a real creative (no blank boxes).
       Toggle-ON fills NOW (explicit intent); initial load may wait for the
       slot to near the viewport. */
    if (now) {
      try { watch(slot, unit, fr); } catch (x) {}
    } else if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        for (var k = 0; k < es.length; k++) {
          if (es[k].isIntersecting) {
            try { watch(slot, unit, fr); } catch (x) {}
            try { io.disconnect(); } catch (x) {}
            break;
          }
        }
      }, { rootMargin: '400px' });
      try { io.observe(slot); } catch (x) { try { watch(slot, unit, fr); } catch (y) {} }
      /* Timer backstop: some environments never fire IntersectionObserver
         (backgrounded/headless tabs); still check for content after 3s. */
      setTimeout(function () {
        try {
          if (slot.getAttribute('data-filled') === '1' && !slot.classList.contains('on')) watch(slot, unit, fr);
        } catch (x) {}
      }, 3000);
    } else {
      try { watch(slot, unit, fr); } catch (x) {}
    }
  }

  function fillAll(now) {
    if (!enabled()) return;
    var slots = document.querySelectorAll('.adslot');
    for (var i = 0; i < slots.length; i++) {
      try { fill(slots[i], now === true); } catch (x) {}
    }
  }

  function clearAll() {
    var slots = document.querySelectorAll('.adslot');
    for (var i = 0; i < slots.length; i++) {
      slots[i].innerHTML = '';
      slots[i].removeAttribute('data-filled');
      slots[i].classList.remove('on');
      slots[i].hidden = true;
      slots[i].style.display = 'none';
    }
  }

  var pill = null;
  function paintPill() {
    if (!pill) return;
    var on = enabled();
    pill.textContent = on ? '\uD83D\uDCE2 Ads: ON' : '\uD83D\uDEAB Ads: OFF';
    pill.setAttribute('aria-pressed', on ? 'true' : 'false');
    pill.title = on ? 'Ads are on — tap to disable' : 'Ads are off — tap to enable';
  }

  function mountPill() {
    if (document.getElementById('adPill')) {
      pill = document.getElementById('adPill');
      paintPill();
      return;
    }
    pill = document.createElement('button');
    pill.id = 'adPill';
    pill.type = 'button';
    pill.addEventListener('click', function () {
      var on = !enabled();
      set(on);
      clearAll();
      if (on) fillAll(true);
      paintPill();
    });
    try { document.body.appendChild(pill); } catch (e) { return; }
    paintPill();
  }

  function init() {
    mountPill();
    if (enabled()) fillAll(false);
    else clearAll();
    /* Growing to rail width (tablet rotate, window resize) fills slots. */
    try {
      var mq = window.matchMedia('(min-width:' + RAIL_MIN + 'px)');
      var onchg = function () {
        try { if (mq.matches && enabled()) fillAll(false); } catch (e) {}
      };
      if (mq.addEventListener) mq.addEventListener('change', onchg);
      else if (mq.addListener) mq.addListener(onchg);
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
