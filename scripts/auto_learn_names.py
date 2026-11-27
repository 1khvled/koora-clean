#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GitHub Actions daily autonomous learner for scripts/learned_name_map.json.

Reads unknown Arabic player/club candidates queued by tg_news.py in
scripts/tg_state.json, resolves verified footballer/club pairs via the free
Wikidata Action API, merges collision-safe pairs into
scripts/learned_name_map.json (stored on the `state` branch so Vercel never
rebuilds), and clears processed candidates from scripts/tg_state.json.

Runs 100% on GitHub Actions; never touches secrets or Telegram.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_name_map as bnm  # noqa: E402
import tg_names_data as nd   # noqa: E402

STATE_PATH = os.path.join(HERE, 'tg_state.json')
LEARNED_PATH = os.path.join(HERE, 'learned_name_map.json')
COMMITTED_PATH = os.path.join(HERE, 'name_map_ar_en.json')
MAX_PER_RUN = 15


def _load_json(path):
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding='utf-8') as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _write_json(path, data):
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


def _verify_entity(ar_name):
    """Search Wikidata for a footballer or club with Arabic+English labels."""
    data = bnm.api_get({
        'action': 'wbsearchentities',
        'format': 'json',
        'formatversion': '2',
        'language': 'ar',
        'uselang': 'en',
        'type': 'item',
        'limit': '8',
        'search': ar_name,
    })
    if not data:
        return None
    qids = []
    for hit in data.get('search', []):
        qid = hit.get('id', '')
        desc = hit.get('description', '') or ''
        if qid.startswith('Q') and (
            bnm._FOOTBALLER.search(desc) or bnm._FOOTBALL_CLUB.search(desc)
        ):
            qids.append(qid)
    if not qids:
        return None
    ent_data = bnm.api_get({
        'action': 'wbgetentities',
        'format': 'json',
        'formatversion': '2',
        'ids': '|'.join(qids[:20]),
        'props': 'labels|descriptions',
        'languages': 'ar|en',
    })
    if not ent_data:
        return None
    entities = ent_data.get('entities', {})
    for qid in qids:
        ent = entities.get(qid)
        if not ent or not bnm.is_football_entity(ent):
            continue
        labels = ent.get('labels', {})
        ar = bnm._clean_ar_label(labels.get('ar', {}).get('value', ''))
        en = (labels.get('en', {}).get('value') or '').strip()
        if not ar or not en or not any('a' <= c.lower() <= 'z' for c in en):
            continue
        if bnm._norm_key(ar) != bnm._norm_key(ar_name):
            continue
        if re_has_arabic(en):
            continue
        return qid, ar, en
    return None


def re_has_arabic(s):
    return any('\u0600' <= c <= '\u06ff' for c in (s or ''))


def run_learn(state_path=STATE_PATH, learned_path=LEARNED_PATH,
              committed_path=COMMITTED_PATH, limit=MAX_PER_RUN,
              verifier=None):
    state = _load_json(state_path)
    queue = state.get('unknown_ar_names')
    if not isinstance(queue, dict) or not queue:
        print('auto-learn: queue empty, nothing to do')
        return 0
    learned = _load_json(learned_path)
    committed = _load_json(committed_path)
    covered = set(bnm._norm_key(ar) for ar, _ in nd._AR_PROTECT)
    covered.update(bnm._norm_key(k) for k in committed if k not in bnm.RESERVED_KEYS)
    covered.update(bnm._norm_key(k) for k in learned if k not in bnm.RESERVED_KEYS)

    # Newest queued names first.
    ranked = sorted(queue.items(), key=lambda kv: int(kv[1] or 0), reverse=True)
    to_check = []
    processed = []
    for ar, _ts in ranked:
        if len(to_check) >= limit:
            break
        processed.append(ar)
        if bnm._norm_key(ar) in covered:
            continue
        to_check.append(ar)

    resolve = verifier or _verify_entity
    verified = {}
    for ar in to_check:
        try:
            hit = resolve(ar)
        except Exception:
            hit = None
        if hit:
            qid, exact_ar, en = hit
            verified[qid] = (exact_ar, en)

    existing_union = dict(committed)
    for k, v in learned.items():
        if k not in bnm.RESERVED_KEYS:
            existing_union.setdefault(k, v)
    safe, rejected = bnm.collision_safe(existing_union, verified)
    for _, _, why in rejected:
        print('auto-learn skipped:', why)

    if safe:
        merged = bnm.merge(learned, safe)
        _write_json(learned_path, merged)
        print('auto-learn: learned %d new entities' % len(safe))
    for k in processed:
        queue.pop(k, None)
    state['unknown_ar_names'] = queue
    _write_json(state_path, state)
    return len(safe)


if __name__ == '__main__':
    added = run_learn()
    print('auto-learn done: added=%d' % added)
