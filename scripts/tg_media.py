"""FFmpeg video compression and optional Telethon media fetcher for
scripts/tg_news.py.
"""
import os

_TELE = {'client': None, 'tried': False}


def ffmpeg_path():
    """ffmpeg is preinstalled on github-hosted ubuntu runners. Nothing is
    installed or downloaded; we only use what is already there."""
    import shutil
    return shutil.which('ffmpeg')


def compress_video(data, limit=48000000, timeout=90):
    """Shrink an oversized clip just enough to fit the bot api cap.

    Never touches anything already under the cap. Tries a CRF ladder and only
    steps down in quality as far as it must; audio is re-encoded small because
    it is a tiny share of the file. Returns (bytes, crf) or (None, 0).
    Bounded on purpose: 90s per encode and at most 2 ladder steps, so one
    oversized clip can never eat the whole workflow job budget."""
    if not data or len(data) <= limit:
        return data, 0
    exe = ffmpeg_path()
    if not exe:
        print('compress: no ffmpeg on this runner, leaving it oversized')
        return None, 0
    import subprocess
    import tempfile
    tmp = tempfile.mkdtemp(prefix='tgvid')
    src = os.path.join(tmp, 'in.mp4')
    dst = os.path.join(tmp, 'out.mp4')
    with open(src, 'wb') as f:
        f.write(data)
    # CRF first, no scaling: usually enough and barely touches the picture.
    ladder = [(24, None), (27, None), (30, None),
              (30, '1280:-2'), (32, '854:-2')]
    failed = 0
    try:
        for crf, scale in ladder:
            vf = ['-vf', 'scale=%s' % scale] if scale else []
            cmd = [exe, '-y', '-loglevel', 'error', '-i', src,
                   '-c:v', 'libx264', '-crf', str(crf), '-preset', 'medium',
                   '-profile:v', 'high', '-pix_fmt', 'yuv420p'] + vf + [
                   '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
                   '-movflags', '+faststart', dst]
            try:
                subprocess.run(cmd, timeout=timeout,
                               stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, check=False)
            except Exception as e:
                print('compress: ffmpeg failed (%s)' % type(e).__name__)
                return None, 0
            try:
                with open(dst, 'rb') as f:
                    out = f.read()
            except OSError:
                out = b''
            if out and len(out) <= limit:
                print('compress: %d -> %d bytes (crf %s%s)'
                      % (len(data), len(out), crf,
                         ', %sp' % scale if scale else ''))
                return out, crf
            # Two steps still over the cap: stop the ladder rather than
            # spend more of the job budget on a clip that will not fit.
            failed += 1
            if failed >= 2:
                break
    finally:
        for p in (src, dst):
            try:
                os.unlink(p)
            except OSError:
                pass
        try:
            os.rmdir(tmp)
        except OSError:
            pass
    print('compress: could not reach the cap without hurting quality')
    return None, 0


def _tele_client():
    """The blocking telethon client for the reader session, or None when no
    session is configured."""
    import os as _os
    api_id = int(_os.environ.get('TG_API_ID', '0') or 0)
    api_hash = _os.environ.get('TG_API_HASH', '').strip()
    session = _os.environ.get('TG_SESSION', '').strip()
    if not (api_id and api_hash and session):
        return None
    if _TELE['tried']:
        return _TELE['client']
    try:
        # telethon.sync is the BLOCKING client. The async one returns
        # coroutines that nothing awaits, so every download silently returned
        # nothing (verified: "coroutine ... was never awaited").
        from telethon.sessions import StringSession
        from telethon.sync import TelegramClient
        cl = TelegramClient(
            StringSession(session), api_id, api_hash,
            device_model='koora-news', system_version='1.0',
            app_version='1.0', lang_code='en')
        if not cl.is_connected():
            cl.connect()
        ok = bool(cl.is_user_authorized())
        print('animation: reader session %s' % ('connected' if ok else 'NOT authorized'))
        _TELE['tried'] = True          # never retry per post
        _TELE['client'] = cl if ok else None
    except Exception as e:
        print('reader session failed: %s' % str(e)[:70])
        _TELE['tried'] = True
        _TELE['client'] = None
    return _TELE['client']


def tele_photo(mid, limit=10000000):
    """Original photo bytes straight from telegram (full quality). The web
    preview only serves ~800px downscales (measured live: channel 640x800 vs
    the same photo sharper in-app), so the reader session's bytes win whenever
    present. ''/None when unavailable or over the cap (web fallback covers
    it). Never raises, never re-encodes."""
    try:
        cl = _tele_client()
        if cl is None:
            return None
        try:
            if not cl.is_connected():
                cl.connect()
            msg = cl.get_messages('Offsideahdaff', ids=int(mid))
            ph = getattr(msg, 'photo', None)
            if ph is None:
                return None
            raw = cl.download_media(ph, bytes)
            if not raw or len(raw) > limit:
                return None
            return raw
        except Exception as e:
            print('photo: tele fetch failed #%s (%s)'
                  % (mid, str(e)[:70] or type(e).__name__))
            return None
    except Exception:
        return None


def tele_media(mid, limit=48000000):
    """(true_kind, bytes) straight from telegram. true_kind is 'animation' for a
    real gif, 'video' for a normal clip, '' when the message has no document.
    bytes is None when the file exceeds the bot api's 50MB cap -- nothing can be
    done about that, so the caller frames it instead."""
    cl = _tele_client()
    if cl is None:
        return '', None
    try:
        if not cl.is_connected():
            cl.connect()
        msg = cl.get_messages('Offsideahdaff', ids=int(mid))
        if msg is None or getattr(msg, 'document', None) is None:
            return '', None
        doc = msg.document
        kind = 'video'
        try:
            from telethon.tl.types import (DocumentAttributeAnimated,
                                           DocumentAttributeVideo)
            for a in (doc.attributes or []):
                if isinstance(a, DocumentAttributeAnimated):
                    kind = 'animation'
                elif isinstance(a, DocumentAttributeVideo):
                    kind = 'video'
        except Exception:
            pass
        size = int(getattr(doc, 'size', 0) or 0)
        if size > limit:
            # too big for the bot api. Take it once, shrink it just enough,
            # and only frame it if that cannot be done.
            raw = cl.download_media(msg, bytes)
            if raw and len(raw) > limit:
                print('animation: #%d %s is %d bytes - over the cap, '
                      'compressing to fit' % (mid, kind, size))
                small, _crf = compress_video(raw, limit)
                if small:
                    return kind, small
            print('animation: #%d %s is %d bytes and will not fit - '
                  'posting its frame' % (mid, kind, size))
            return kind, None
        out = cl.download_media(msg, bytes)
        return kind, (out if out and len(out) <= limit else None)
    except Exception as e:
        print('animation fetch failed #%s: %s' % (mid, str(e)[:80]))
        return '', None


def tele_animation(mid, limit=48000000):
    """The real clip bytes via a user session, or None. Kept as a thin wrapper
    so callers that only want bytes do not care about the type."""
    return tele_media(mid, limit)[1]


