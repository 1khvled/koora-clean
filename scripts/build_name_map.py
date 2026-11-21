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

The live source is rate-limited (429 after ~6 rapid calls from a shared IP),
so calls are throttled to at most 2/second with backoff on 429/5xx. The
no-argument mode skips names already in the map and caps a run at 40 names;
pass explicit names to target a specific batch. Run it manually from your own
machine, not from a CI runner.
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
ROSTER_PATH = os.path.join(HERE, 'tg_news.py')
API = 'https://www.wikidata.org/w/api.php'
UA = 'koora-name-map/1.0 (koora-clean dev-time name map builder; stdlib urllib)'

# A hit only counts if its description says "footballer". This keeps a bare
# surname like "إسبي" from pulling in Espy, Pennsylvania.
_FOOTBALLER = re.compile(
    r'association football player|football player|footballer|لاعب كرة قدم',
    re.IGNORECASE,
)
_MIN_INTERVAL = 0.5          # <= 2 API calls per second
_TIMEOUT = 12                # seconds per HTTP request
_MAX_ATTEMPTS = 3            # retries for 429 / 5xx / transient network errors
_MAX_SEEDED = 40             # cap for the no-argument roster-seeded run
_last_call = 0.0

# Reserved key in the JSON file; it holds QID -> English name for refresh and
# is not an Arabic->English translation pair.
RESERVED_KEYS = {'qids'}


def _throttle():
    """Global pacing so no more than 2 requests/second leave this process."""
    global _last_call
    wait = _MIN_INTERVAL - (time.monotonic() - _last_call)
    if wait > 0:
        time.sleep(wait)
    _last_call = time.monotonic()


def api_get(params):
    """One GET to the Wikidata Action API with UA, throttle and backoff.

    Returns a decoded dict, or None on any failure (never raises)."""
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(_MAX_ATTEMPTS):
        _throttle()
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            if isinstance(data, dict):
                return data
            print('  ! API returned non-object JSON; retrying', file=sys.stderr)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt + 1 < _MAX_ATTEMPTS:
                delay = 2 ** attempt
                print('  ! HTTP %s; backing off %ss' % (e.code, delay),
                      file=sys.stderr)
                time.sleep(delay)
                continue
            print('  ! HTTP %s from Wikidata: %s' % (e.code, e.reason),
                  file=sys.stderr)
            return None
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
            if attempt + 1 < _MAX_ATTEMPTS:
                delay = 2 ** attempt
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
            ar = ent.get('labels', {}).get('ar', {}).get('value', '')
            en = ent.get('labels', {}).get('en', {}).get('value', '')
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
    seeded = not argv
    names = list(argv) if argv else seed_from_roster()
    # Skip names the committed map already covers; no point re-querying them.
    # (Keep the comprehension out of the assignment target so `seen` is bound
    # before the comprehension reads it.)
    existing = load_existing() if os.path.exists(OUT_PATH) else {}
    covered = {k for k in existing if k not in RESERVED_KEYS}
    seen = set()
    names = [n for n in names
             if n and n not in covered and not (n in seen or seen.add(n))]
    if seeded and len(names) > _MAX_SEEDED:
        print('Roster seed has %d uncovered names; capping this run to %d to '
              'respect Wikidata rate limits. Pass explicit names for a '
              'specific batch.' % (len(names), _MAX_SEEDED))
        names = names[:_MAX_SEEDED]
    if not names:
        print('No Arabic names to look up (empty CLI args and empty seed). '
              'Nothing to do.')
        return 0

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

    before = load_existing()
    after = merge(before, verified)
    write_map(after)
    added = [k for k in after if k not in before and k not in RESERVED_KEYS]
    qids_added = [q for q in after['qids'] if q not in before.get('qids', {})]
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
