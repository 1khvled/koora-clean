#!/usr/bin/env python3
"""Dev-time generator for scripts/name_map_ar_en.json.

Uses the free, key-less Wikidata Action API to find the Arabic + English
labels of the SAME footballer, validates the hits with one batched call, and
merges the verified pairs into the committed JSON map. This is a MAINTENANCE
script: it is never called by the GitHub workflow at runtime, and it never
posts anything anywhere. It uses only the Python standard library.

Usage (from the repo root)::

    python scripts/build_name_map.py                       # seed from _AR_PROTECT
    python scripts/build_name_map.py "كارلوس إسبي" "فيليوت سفيدبيرغ"
    python scripts/build_name_map.py --limit 20 name1 name2 ...
    WIKIDATA_BASE=https://r.jina.ai/https://www.wikidata.org/w/api.php \
        python scripts/build_name_map.py --limit 20 name1 ...

The live source is rate-limited (429 after ~6 rapid calls from a shared IP),
so calls are throttled to at most 2/second with backoff on 429/5xx. Set the
optional WIKIDATA_BASE env var to point at a plain-text proxy (e.g. r.jina.ai)
when Wikidata is unreachable from a restricted network; no secrets are needed
and nothing is written at runtime. --limit caps how many names a single run
may query (defaults to the bounded roster seed cap of 40). Additions are
checked against the committed keys for normalization collisions before merge.
"""
import ast
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(HERE, 'name_map_ar_en.json')
ROSTER_PATH = os.path.join(HERE, 'tg_names_data.py')
# Optional plain-text proxy, e.g.
#   https://r.jina.ai/https://www.wikidata.org/w/api.php
# A trailing slash is stripped so the '?' below always appends cleanly.
API = os.environ.get('WIKIDATA_BASE',
                     'https://www.wikidata.org/w/api.php').rstrip('/')
UA = 'koora-name-map/1.0 (koora-clean dev-time name map builder; stdlib urllib)'

# A hit only counts if its description says "footballer". This keeps a bare
# surname like "إسبي" from pulling in Espy, Pennsylvania.
_FOOTBALLER = re.compile(
    r'association football player|football player|footballer|لاعب كرة قدم',
    re.IGNORECASE,
)
_FOOTBALL_CLUB = re.compile(
    r'association football club|football club|soccer club|national.*football team'
    r'|نادي كرة قدم|منتخب كرة قدم',
    re.IGNORECASE,
)
_MIN_INTERVAL = 0.5          # <= 2 API calls per second
_TIMEOUT = 20                # seconds per HTTP request (proxy adds latency)
_MAX_ATTEMPTS = 5            # 1 try + 4 retries on 429 / 5xx / transient errors
_BACKOFFS = (2, 4, 8, 16)    # seconds to sleep before retries 1..4
_MAX_SEEDED = 40             # cap for the no-argument roster-seeded run
_last_call = 0.0

# Reserved key in the JSON file; it holds QID -> English name for refresh and
# is not an Arabic->English translation pair.
RESERVED_KEYS = {'qids'}

# Arabic chars folded by tg_news._ar_norm1; mirrored locally so this dev tool
# can detect normalization collisions without importing the posting module.
_NORM_FOLDS = (('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), ('ة', 'ه'),
               ('ى', 'ي'), ('ؤ', 'و'), ('ئ', 'ي'))


def _throttle():
    """Global pacing so no more than 2 requests/second leave this process."""
    global _last_call
    wait = _MIN_INTERVAL - (time.monotonic() - _last_call)
    if wait > 0:
        time.sleep(wait)
    _last_call = time.monotonic()


def _parse_args(argv):
    """Return (names, limit) from CLI args. Stdlib-only hand parser.

    Positional args are Arabic names; --limit N / --limit=N caps the run.
    """
    names, limit, i = [], None, 0
    while i < len(argv):
        arg = argv[i]
        if arg == '--limit':
            i += 1
            if i >= len(argv):
                print('ERROR: --limit needs an integer value', file=sys.stderr)
                raise SystemExit(2)
            raw = argv[i]
        elif arg.startswith('--limit='):
            raw = arg.split('=', 1)[1]
        elif arg in ('-h', '--help'):
            print(__doc__)
            raise SystemExit(0)
        else:
            names.append(arg)
            i += 1
            continue
        try:
            limit = int(raw)
            if limit < 1:
                raise ValueError
        except ValueError:
            print('ERROR: --limit must be a positive integer', file=sys.stderr)
            raise SystemExit(2)
        i += 1
    return names, limit


def _decode_json(text):
    """Parse a JSON object, tolerating text proxies that wrap raw JSON.

    r.jina.ai and similar readers may prepend a source line or fence the
    payload in markdown; fall back to the outermost {...} block.
    """
    text = text.strip()
    try:
        return json.loads(text)
    except ValueError:
        pass
    start, end = text.find('{'), text.rfind('}')
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except ValueError:
            pass
    return None


def api_get(params):
    """One GET to the Wikidata Action API with UA, throttle and backoff.

    Returns a decoded dict, or None on any failure (never raises). Retries
    429/5xx and transient network/parse errors up to _MAX_ATTEMPTS times with
    a bounded 2/4/8/16s backoff."""
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(_MAX_ATTEMPTS):
        _throttle()
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                data = _decode_json(resp.read().decode('utf-8'))
            if isinstance(data, dict):
                return data
            print('  ! API returned non-object JSON; retrying', file=sys.stderr)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                if attempt + 1 < _MAX_ATTEMPTS:
                    delay = _BACKOFFS[attempt]
                    print('  ! HTTP %s; backing off %ss' % (e.code, delay),
                          file=sys.stderr)
                    time.sleep(delay)
                    continue
            print('  ! HTTP %s from Wikidata: %s' % (e.code, e.reason),
                  file=sys.stderr)
            return None
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
            if attempt + 1 < _MAX_ATTEMPTS:
                delay = _BACKOFFS[attempt]
                print('  ! network/parse error (%s); backing off %ss'
                      % (type(e).__name__, delay), file=sys.stderr)
                time.sleep(delay)
                continue
            print('  ! giving up on Wikidata request: %s' % e, file=sys.stderr)
            return None
    return None


def is_footballer(entity):
    """True when an API entity's English/Arabic description names a player."""
    try:
        descs = entity.get('descriptions', {})
        for lang in ('en', 'ar'):
            if _FOOTBALLER.search(descs.get(lang, {}).get('value', '') or ''):
                return True
    except Exception:
        pass
    return False


def is_football_entity(entity):
    """True when an API entity's English/Arabic description names a player or club."""
    if is_footballer(entity):
        return True
    try:
        descs = entity.get('descriptions', {})
        for lang in ('en', 'ar'):
            if _FOOTBALL_CLUB.search(descs.get(lang, {}).get('value', '') or ''):
                return True
    except Exception:
        pass
    return False


def search_candidates(ar_name):
    """Return QIDs for the best footballer-looking hits for an Arabic name."""
    data = api_get({
        'action': 'wbsearchentities', 'format': 'json', 'formatversion': '2',
        'language': 'ar', 'uselang': 'en', 'type': 'item', 'limit': '8',
        'search': ar_name,
    })
    if not data:
        return []
    out = []
    for hit in data.get('search', []):
        qid = hit.get('id', '')
        desc = hit.get('description', '') or ''
        if qid.startswith('Q') and _FOOTBALLER.search(desc):
            out.append(qid)
    return out


def _clean_ar_label(s):
    """Trim whitespace and a trailing Wikidata disambiguation parenthetical.

    Some Arabic labels carry junk like "(لاعب كرة قدم مواليد 2007)" which is
    never part of the name we want to shield. Keep the check narrow so a real
    name is never damaged."""
    s = (s or '').strip()
    s = re.sub(r'\s*\([^)]*(?:لاعب كرة قدم|\d{4})[^)]*\)\s*$', '', s).strip()
    return s


def validate_batch(qids):
    """One wbgetentities call for up to 50 QIDs -> {qid: (ar, en)}.

    All fresh labels/descriptions come from this call, so transient search
    metadata never leaks into the committed map."""
    verified = {}
    for i in range(0, len(qids), 50):
        chunk = qids[i:i + 50]
        data = api_get({
            'action': 'wbgetentities', 'format': 'json', 'formatversion': '2',
            'ids': '|'.join(chunk),
            'props': 'labels|descriptions', 'languages': 'ar|en',
        })
        if not data:
            continue
        for qid, ent in data.get('entities', {}).items():
            if not is_footballer(ent):
                continue
            ar = _clean_ar_label(ent.get('labels', {}).get('ar', {}).get('value', ''))
            en = (ent.get('labels', {}).get('en', {}).get('value', '') or '').strip()
            if ar and en:
                verified[qid] = (ar, en)
    return verified


def seed_from_roster():
    """Read Arabic keys from the hand-curated _AR_PROTECT list via AST.

    Parsing the literal avoids importing the 160 KB posting module (and any
    of its import-time work) from this dev tool. Returns a deduped list."""
    try:
        with open(ROSTER_PATH, encoding='utf-8') as f:
            tree = ast.parse(f.read(), filename=ROSTER_PATH)
        for node in tree.body:
            if (isinstance(node, ast.Assign)
                    and any(isinstance(t, ast.Name) and t.id == '_AR_PROTECT'
                            for t in node.targets)):
                pairs = ast.literal_eval(node.value)
                seen, names = set(), []
                for ar, _lat in pairs:
                    if isinstance(ar, str) and ar not in seen:
                        seen.add(ar)
                        names.append(ar)
                return names
    except Exception as e:
        print('  ! could not read _AR_PROTECT seed: %s' % e, file=sys.stderr)
    return []


def load_existing():
    """Load the current JSON map; return {} if absent. Abort on corruption."""
    if not os.path.exists(OUT_PATH):
        return {}
    try:
        with open(OUT_PATH, encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError('top level is not a JSON object')
        return data
    except Exception as e:
        print('ERROR: %s is unreadable (%s); refusing to overwrite.'
              % (OUT_PATH, e), file=sys.stderr)
        raise SystemExit(1)


def _norm_key(s):
    """Mirror tg_news._ar_norm1 so collision checks see the same keys."""
    t = s or ''
    for src, dst in _NORM_FOLDS:
        t = t.replace(src, dst)
    return t


def collision_safe(existing, verified):
    """Drop verified pairs that would collide with / shadow committed keys.

    tg_news compiles a longest-first regex, so a shorter key cannot match
    inside a longer one (substring shadowing is already impossible). The real
    risks are (a) a key whose normalized form equals an existing key with a
    DIFFERENT English name -> ambiguous mapping, (b) a too-short key that
    _build_protect would drop or that matches far too broadly. Return
    (safe, rejected) where rejected is a list of (ar, en, reason).
    """
    existing_norms = {}
    for k, v in existing.items():
        if k in RESERVED_KEYS or not isinstance(k, str) or not isinstance(v, str):
            continue
        existing_norms.setdefault(_norm_key(k), (k, v))

    safe, rejected, new_norms = {}, [], {}
    for qid, (ar, en) in verified.items():
        nk = _norm_key(ar)
        if len(nk) < 4 and ' ' not in ar:
            rejected.append((ar, en, 'too short / no space'))
            continue
        prev = existing_norms.get(nk)
        if prev and prev[1] != en:
            rejected.append((ar, en, 'normalized collision with %r' % prev[0]))
            continue
        if nk in new_norms and new_norms[nk] != en:
            rejected.append((ar, en, 'duplicate normalized key in batch'))
            continue
        new_norms[nk] = en
        safe[qid] = (ar, en)
    return safe, rejected


def merge(existing, verified):
    """Merge verified pairs/QIDs without dropping hand-curated aliases."""
    out = dict(existing)
    pairs = out.get('qids') if isinstance(out.get('qids'), dict) else {}
    out['qids'] = dict(pairs)
    for qid, (ar, en) in verified.items():
        out.setdefault(ar, en)       # never clobber a hand-curated spelling
        out['qids'][qid] = en        # QID refresh target
    return out


def write_map(data):
    with open(OUT_PATH, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


def main(argv):
    cli_names, limit = _parse_args(argv)
    seeded = not cli_names
    names = list(cli_names) if cli_names else seed_from_roster()
    existing = load_existing()
    # Skip names the committed map already covers; no point re-querying them.
    covered = {k for k in existing if k not in RESERVED_KEYS}
    seen = set()
    names = [n for n in names
             if n and n not in covered and not (n in seen or seen.add(n))]
    cap = limit if limit is not None else (_MAX_SEEDED if seeded else None)
    if cap is not None and len(names) > cap:
        label = '--limit' if limit is not None else 'roster-seed cap'
        print('Input has %d uncovered name(s); capping this run to %d (%s).'
              % (len(names), cap, label))
        names = names[:cap]
    if not names:
        print('No Arabic names to look up (empty CLI args and empty seed). '
              'Nothing to do.')
        return 0

    print('Endpoint: %s' % API)
    print('Looking up %d Arabic name(s) on Wikidata (throttled to <=2/s)...'
          % len(names))
    candidates = []
    for name in names:
        hits = search_candidates(name)
        print('  %s -> %d footballer hit(s)' % (name, len(hits)))
        for qid in hits:
            if qid not in candidates:
                candidates.append(qid)

    if not candidates:
        print('No footballer candidates found; existing map left unchanged.')
        return 0

    verified = validate_batch(candidates)
    print('Batched validation kept %d/%d candidate(s).'
          % (len(verified), len(candidates)))
    if not verified:
        print('Nothing verified; existing map left unchanged.')
        return 0

    verified, rejected = collision_safe(existing, verified)
    for ar, en, why in rejected:
        print('  ! skipped %r -> %r (%s)' % (ar, en, why), file=sys.stderr)
    if not verified:
        print('No collision-safe pairs remain; existing map left unchanged.')
        return 0

    after = merge(existing, verified)
    write_map(after)
    added = [k for k in after if k not in existing and k not in RESERVED_KEYS]
    qids_added = [q for q in after['qids'] if q not in existing.get('qids', {})]
    print('Wrote %s' % OUT_PATH)
    print('  %d pair(s) added: %s' % (len(added), ', '.join(added) or 'none'))
    print('  %d QID(s) added: %s' % (len(qids_added), ', '.join(qids_added) or 'none'))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        print('\nInterrupted; existing map left unchanged.', file=sys.stderr)
        sys.exit(130)
