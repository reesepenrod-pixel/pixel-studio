import sys, re, json, base64, gzip, os
src, out = sys.argv[1], sys.argv[2]
h = open(src, encoding='utf-8').read()
def block(t):
    m = re.search(r'<script type="__bundler/%s">(.*?)</script>' % t, h, re.S)
    return m.group(1) if m else None
manifest = json.loads(block('manifest'))
template = json.loads(block('template'))
ext = block('ext_resources'); order = block('page_order')
os.makedirs(out, exist_ok=True)
open(os.path.join(out,'template.html'),'w').write(template if isinstance(template,str) else json.dumps(template))
open(os.path.join(out,'ext_resources.json'),'w').write(ext or '')
open(os.path.join(out,'page_order.json'),'w').write(order or '')
for u,e in manifest.items():
    b = base64.b64decode(e['data'])
    if e.get('compressed'): b = gzip.decompress(b)
    ext_ = e['mime'].split('/')[-1].split('+')[0].replace('javascript','js')
    open(os.path.join(out, f"{u}.{ext_}"),'wb').write(b)
    print(u, e['mime'], len(b), e.get('compressed'))
