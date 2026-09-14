import re, glob
urls = set()
files = glob.glob(r'C:\Users\Abdelli\Desktop\Projects\koora-clean\*.*')
files += glob.glob(r'C:\Users\Abdelli\Desktop\Projects\koora-clean\api\*')
for f in files:
    try:
        s = open(f, encoding='utf-8').read()
    except Exception:
        continue
    name = f.split('\\')[-1]
    for m in re.finditer(r'https?://[A-Za-z0-9._-]*vercel\.app[^\s"\'<>]*', s):
        urls.add((name, m.group(0)))
    for m in re.finditer(r'https?://[A-Za-z0-9._-]*workers\.dev[^\s"\'<>]*', s):
        urls.add((name, m.group(0)))
print('\n'.join(f'{a}: {b}' for a, b in sorted(urls)) or 'NONE FOUND')
