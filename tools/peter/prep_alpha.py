# (user r14e) The Sketchfab Peter Parker GLB ships its hair / brow textures without alpha: the hair cap's fringe maps onto
# the flat backdrop colour (74, 64, 54) around the hair islands, the brow cards are strands on black. This writes RGBA
# PNGs (alpha = not-backdrop, softened; backdrop RGB filled with the nearest strand colour so filtering never bleeds dark)
# that build_peter.py swaps in.   python tools/peter/prep_alpha.py <in.glb> <out dir>
import sys, os, io, json, struct
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
data = open(src, 'rb').read(); ln = struct.unpack('<I', data[12:16])[0]; j = json.loads(data[20:20 + ln]); off = 20 + ln + 8
def tex(mname):
    m = next(m for m in j['materials'] if m['name'] == mname)
    im = j['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source']; bv = j['bufferViews'][j['images'][im]['bufferView']]
    o = off + bv.get('byteOffset', 0); return np.asarray(Image.open(io.BytesIO(data[o:o + bv['byteLength']])).convert('RGB')).astype(np.float32)
def fill(rgb, keep):
    _, (iy, ix) = ndi.distance_transform_edt(~keep, return_indices=True)
    return rgb[iy, ix]
# hair: backdrop = colour-matched pixels connected to the border (or big pockets)
I = tex('short02'); bg = I[5:40, 5:200].reshape(-1, 3).mean(0)
near = np.abs(I - bg).max(2) <= 6
lab, n = ndi.label(near); sizes = ndi.sum(near, lab, range(1, n + 1))
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
back = np.isin(lab, [i + 1 for i in range(n) if (i + 1) in border or sizes[i] > 4000])
back = ndi.binary_opening(back, iterations=2)
a = ndi.gaussian_filter((~back).astype(np.float32), 1.6)
rgb = fill(I, ~back)
Image.fromarray(np.dstack([rgb, a * 255]).clip(0, 255).astype(np.uint8)).save(os.path.join(out, 'short02.png'))
print('hair backdrop', back.mean())
# brows: alpha from strand brightness over the black card
B = tex('eyebrow008'); mx = B.max(2)
# coverage of the whole brow (not just the bright strand edges): blurred strand density, the dark core filled in
a = np.clip(ndi.gaussian_filter((mx > 8).astype(np.float32), 2.0) * 1.6, 0, 1) * np.clip(ndi.gaussian_filter(mx, 1.0) / 10, 0.35, 1)
rgb = fill(B, mx > 20) * 0.75
Image.fromarray(np.dstack([rgb, a * 255]).clip(0, 255).astype(np.uint8)).save(os.path.join(out, 'eyebrow008.png'))
print('brow coverage', (a > 0.5).mean())
