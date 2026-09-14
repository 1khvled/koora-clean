"""Check hd7livex.com/test1/ redirect chain with plain HTTP."""
import urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        print(f'{code} -> {newurl}')
        return None

opener = urllib.request.build_opener(NoRedirect)
for url in ['https://hd7livex.com/test1/', 'http://hd7livex.com/test1/', 'https://www.hd7livex.com/test1/']:
    print('####', url)
    try:
        r = opener.open(urllib.request.Request(url, headers={**UA, 'Referer': 'https://www.google.com/'}), timeout=20)
        print('OK', r.status, len(r.read()))
    except Exception as e:
        print('ERR:', str(e)[:200])
