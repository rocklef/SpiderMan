# (user r14d) Rocketbox texture atlas for rb_people.json: one GRIDxGRID atlas, per avatar a square tile holding the body
# texture (top 11/16), head (bottom-left) and opacity cards (bottom-right, RGBA). Matches tile_rects() in
# rocketbox_to_crowd.py. python tools/crowd/rb_atlas.py <src dir> <rb_people.json> <out.webp> [tile px]
import sys, os, json, glob
from PIL import Image, ImageFilter
src, meta_p, out = sys.argv[1:4]; T = int(sys.argv[4]) if len(sys.argv) > 4 else 1024
meta = json.load(open(meta_p)); G = meta['grid']
A = Image.new('RGBA', (G * T, G * T), (128, 110, 100, 255))
pad = round(6 / 1024 * T)
def paste(img, x, y, w, h, alpha):
    img = img.convert('RGBA') if alpha else img.convert('RGB').convert('RGBA')
    im = img.resize((w - 2 * pad, h - 2 * pad), Image.LANCZOS)
    # bleed border: stretch the edge pixels into the padding so mips / bilinear never pick up the neighbours
    big = im.resize((w, h), Image.LANCZOS); A.paste(big, (x, y)); A.paste(im, (x + pad, y + pad))
for slot, name in enumerate(meta['avatars']):
    tex = os.path.join(src, name, 'Textures')
    f = lambda k: (glob.glob(os.path.join(tex, '*_%s_color.tga' % k)) + [None])[0]
    tx, ty = slot % G, slot // G; x0, y0 = tx * T, ty * T
    hb = T * 11 // 16
    paste(Image.open(f('body')), x0, y0, T, hb, False)
    paste(Image.open(f('head')), x0, y0 + hb, T // 2, T - hb, False)
    if f('opacity'): paste(Image.open(f('opacity')), x0 + T // 2, y0 + hb, T // 2, T - hb, True)
    print(name, 'ok', bool(f('opacity')))
A.save(out, 'WEBP', quality=88, method=5)
print('wrote', out, os.path.getsize(out) / 1e6, 'MB')
