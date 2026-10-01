# Build step 1 of public/assets/spiderman.glb: the Amazing Spider-Man 2 (2014) suit re-rigged onto the game's SpiderRig.
#
#   blender -b --factory-startup -P tools/asm2/build_spiderman.py -- --asm2 <asm2.glb> --rig <rig.glb> --out <mesh.glb>
#
#   --asm2  "Spider-Man (2014; The Amazing Spider-Man 2)" by Mr. P (sketchfab.com/mrpgremlin), CC-BY-4.0, Mixamo-rigged
#   --rig   the previous public/assets/spiderman.glb (SpiderRig skeleton + the 79 authored clips), e.g.
#           git show 4361e15:public/assets/spiderman.glb > rig.glb
#
# The game's animation layer, the thugs (crimeactors.js) and the combat pose layer all play the SpiderRig clips, so the
# new body is skinned to *that* skeleton (same bone names / hierarchy / helper bones) instead of its Mixamo one:
#  - every SpiderRig bone is re-seated on the matching ASM2 joint; its rest frame is the old rest frame turned by the
#    minimal rotation from the old bone direction to the new one (same anatomical axes / roll), so a clip's LOCAL
#    rotations drive the same world pose on both rigs -> finalize.mjs copies the clip keys unchanged;
#  - hips stays at the old rest height (0.98 m), so the clips' hips translation keys fit as they are;
#  - Mixamo weights are renamed onto SpiderRig bones, then split onto the half-rotation helpers the animator drives
#    (deltoid / glute: 50 % of the upper arm / thigh, forearmTwist: 50 % of the wrist roll) with the falloffs measured
#    on the old SpiderMan mesh; lenses are rigid on the head.
# Output (Blender glTF, Y-up, metres, 1.79 m, feet at 0, facing +Z): nodes SpiderRig > hips..., meshes SpiderMan (suit,
# emblems, soles, pads, web-shooters), SpiderWebs (the raised web lines), Lenses (Lens, LensFrame). Textures are capped at
# 2048 px and WebP-encoded; finalize.mjs adds the SpiderRig clips (verbatim glTF channels) and writes spiderman.glb.
import bpy, sys, os, math, re, time
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {argv[i][2:]: argv[i + 1] for i in range(0, len(argv) - 1, 2) if argv[i].startswith('--')}
ASM2, RIG, OUT = opt['asm2'], opt['rig'], opt['out']
HEIGHT = float(opt.get('height', 1.79))   # SpiderMan mesh height of the previous model
WEBRATIO = float(opt.get('webratio', 0.25))  # decimate ratio for the raised web-line mesh
T0 = time.time()
log = lambda *a: print('[asm2 %5.1fs]' % (time.time() - T0), *a, flush=True)


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ------------------------------------------------------------------------------------------------ old rig (reference)
bpy.ops.import_scene.gltf(filepath=RIG, bone_heuristic='BLENDER')
old = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
old.name = 'OldRig'
for o in [o for o in bpy.data.objects if o.type != 'ARMATURE']: bpy.data.objects.remove(o, do_unlink=True)
# drop the old suit's materials / textures / meshes, or the ASM2 renames below would bind to them (wrong UV layout)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
    for d in list(coll): coll.remove(d)
bpy.context.view_layer.update()
OLD = {}  # bone -> (parent, world rest matrix)
for b in old.data.bones: OLD[b.name] = (b.parent.name if b.parent else None, old.matrix_world @ b.matrix_local)
ORDER = [b.name for b in old.data.bones]  # parents before children
log('old rig', len(OLD), 'bones')
ACTS_KEEP = [a for a in bpy.data.actions]

# ------------------------------------------------------------------------------------------------ ASM2 source
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=ASM2, bone_heuristic='BLENDER')
new_objs = [o for o in bpy.data.objects if o not in before]
bpy.context.view_layer.update()
mix = next(o for o in new_objs if o.type == 'ARMATURE')
src = [o for o in new_objs if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
junk = [o for o in new_objs if o not in src and o is not mix]
mixname = lambda n: re.sub(r'_\d+$', '', n.replace('mixamorig:', ''))

# Sketchfab/Mixamo stays Y-up in Blender; SpiderRig is Z-up. Rotate +90° about X when hips sit on Y.
hips_bone = next(b for b in mix.data.bones if mixname(b.name) == 'Hips')
hw = mix.matrix_world @ hips_bone.head_local
if abs(hw.y) > abs(hw.z) + 0.2:
    R90 = Matrix.Rotation(math.radians(90), 4, 'X')
    mix.matrix_world = R90 @ mix.matrix_world
    for o in src: o.matrix_world = R90 @ o.matrix_world
    bpy.context.view_layer.update()
    log('rotated ASM2 Y-up -> Z-up')

J = {mixname(b.name): mix.matrix_world @ b.head_local for b in mix.data.bones}

# Height from body verts near the skeleton (ignore Sketchfab ±1 helper cubes)
def body_z(objs):
    zs = []
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            if w.z < -0.2: continue
            zs.append(w.z)
    return (min(zs), max(zs)) if zs else (0.0, 1.79)
zmin, zmax = body_z(src)
S = HEIGHT / max(0.5, zmax - zmin)
oldHips = OLD['hips'][1].translation
# feet to z=0, hips X/Y over the old hips, uniform scale
off = Vector((oldHips.x - J['Hips'].x * S, oldHips.y - J['Hips'].y * S, -zmin * S))
TM = Matrix.Translation(off) @ Matrix.Scale(S, 4)
J = {k: TM @ v for k, v in J.items()}
log('ASM2 height %.3f -> scale %.4f; mixamo hips z %.3f, old hips z %.3f' % (zmax - zmin, S, J['Hips'].z, oldHips.z))

# ------------------------------------------------------------------------------------------------ joints -> SpiderRig bones
def side(S_):
    return 'Left' if S_ == 'L' else 'Right'
def extrap(a, b, k=0.8):  # continue segment a->b by k of its length
    d = J[b] - J[a]; return J[b] + d * k
HEAD = {'hips': J['Hips'].copy()}
TAIL = {}
seg = lambda bone, a, b: (HEAD.__setitem__(bone, J[a].copy()), TAIL.__setitem__(bone, J[b].copy()))
seg('spine', 'Spine', 'Spine1'); seg('spine1', 'Spine1', 'Spine2'); seg('spine2', 'Spine2', 'Neck'); seg('neck', 'Neck', 'Head')
TAIL['hips'] = J['Spine'].copy()
HEAD['head'] = J['Head'].copy(); TAIL['head'] = J['Head'] + Vector((0, 0, 0.2))
for s_ in 'LR':
    P = side(s_)
    seg('shoulder.' + s_, P + 'Shoulder', P + 'Arm')
    seg('upperArm.' + s_, P + 'Arm', P + 'ForeArm'); seg('deltoid.' + s_, P + 'Arm', P + 'ForeArm')
    mid = (J[P + 'ForeArm'] + J[P + 'Hand']) * 0.5
    HEAD['forearm.' + s_] = J[P + 'ForeArm'].copy(); TAIL['forearm.' + s_] = mid.copy()
    HEAD['forearmTwist.' + s_] = mid.copy(); TAIL['forearmTwist.' + s_] = J[P + 'Hand'].copy()
    HEAD['hand.' + s_] = J[P + 'Hand'].copy()
    TAIL['hand.' + s_] = J[P + 'Hand'] + (J[P + 'HandMiddle1'] - J[P + 'Hand']).normalized() * 0.032
    for f in ('thumb', 'index', 'middle', 'ring', 'pinky'):
        F = P + 'Hand' + f.capitalize()
        seg(f + '1.' + s_, F + '1', F + '2'); seg(f + '2.' + s_, F + '2', F + '3')
        HEAD[f + '3.' + s_] = J[F + '3'].copy(); TAIL[f + '3.' + s_] = extrap(F + '2', F + '3')
    seg('thigh.' + s_, P + 'UpLeg', P + 'Leg'); seg('glute.' + s_, P + 'UpLeg', P + 'Leg')
    seg('shin.' + s_, P + 'Leg', P + 'Foot'); seg('foot.' + s_, P + 'Foot', P + 'ToeBase')
    fw = J[P + 'ToeBase'] - J[P + 'Foot']; fw.z = 0; fw.normalize()
    HEAD['toe.' + s_] = J[P + 'ToeBase'].copy(); TAIL['toe.' + s_] = J[P + 'ToeBase'] + fw * 0.064
missing = [b for b in ORDER if b not in HEAD]
assert not missing, missing

# rest frames: old frame turned by the minimal rotation old dir -> new dir (keeps the roll / anatomical axes)
FRAME = {}
for b in ORDER:
    Mo = OLD[b][1]
    Xo, Yo, Zo = (Mo.col[i].xyz.normalized() for i in range(3))
    Yn = (TAIL[b] - HEAD[b]).normalized()
    R = Yo.rotation_difference(Yn)
    Xn, Zn = R @ Xo, R @ Zo
    M = Matrix((Xn, Yn, Zn)).transposed().to_4x4(); M.translation = HEAD[b]
    FRAME[b] = M
    ang = math.degrees(Yo.angle(Yn))
    if ang > 25: log('  bone %-14s turned %.0f deg' % (b, ang))

rig_data = bpy.data.armatures.new('SpiderRig')
rig = bpy.data.objects.new('SpiderRig', rig_data)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for b in ORDER:
    eb = rig_data.edit_bones.new(b)
    eb.head = HEAD[b]; eb.tail = HEAD[b] + Vector((0, 0.1, 0))
    eb.matrix = FRAME[b]
    eb.length = max(0.012, (TAIL[b] - HEAD[b]).length)
for b in ORDER:
    p = OLD[b][0]
    if p: rig_data.edit_bones[b].parent = rig_data.edit_bones[p]
bpy.ops.object.mode_set(mode='OBJECT')
log('SpiderRig built', len(rig_data.bones), 'bones')

# ------------------------------------------------------------------------------------------------ meshes
MAT = {  # ASM2 material -> game material name ('SpiderSuit*' = recoloured by the suit system)
    'material': 'SpiderSuit', 'Blue': 'SpiderSuitBlue', 'webs': 'SpiderSuitWebs', 'FrontLogo': 'SpiderSuitEmblem',
    'Backlogo': 'SpiderSuitEmblemBack', 'Soles': 'SpiderSuitSoles', 'material_8': 'SpiderSuitPads',
    'ShooterB': 'WebShooter', 'Webshooter': 'WebShooterRed', 'ShooterMetal': 'WebShooterMetal',
    'lens': 'Lens', 'frames': 'LensFrame', 'glass': None,
}
GROUP = {'body': 'SpiderMan', 'webs': 'SpiderWebs', 'lens': 'Lenses'}
def group_of(o):
    m = o.get('srcmat') or (o.data.materials[0].name if o.data.materials else '')
    return 'webs' if m == 'webs' else 'lens' if m in ('lens', 'frames', 'glass') else 'body'

for o in list(src):
    m0 = o.data.materials[0].name if o.data.materials else ''
    o['srcmat'] = m0
    if MAT.get(m0, '') is None: src.remove(o); junk.append(o)   # glass shell over the lenses: dropped (glossy Lens instead)

# bake world transform + normalisation into the mesh data, drop the Mixamo skin
for o in src:
    o.data = o.data.copy()
    Mw = o.matrix_world.copy()
    o.parent = None
    for md in list(o.modifiers): o.modifiers.remove(md)
    o.matrix_world = TM @ Mw
bpy.ops.object.select_all(action='DESELECT')
for o in src: o.select_set(True)
bpy.context.view_layer.objects.active = src[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in junk + [mix]: bpy.data.objects.remove(o, do_unlink=True)

# vertex colours / extra UV sets are unused by the materials
for o in src:
    me = o.data
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    while len(me.uv_layers) > 1: me.uv_layers.remove(me.uv_layers[-1])
    if me.uv_layers: me.uv_layers[0].name = 'UVMap'
    for i, m in enumerate(me.materials):
        n = MAT.get(m.name, m.name)
        if n and m.name != n:
            if n in bpy.data.materials and bpy.data.materials[n] is not m: me.materials[i] = bpy.data.materials[n]
            else: m.name = n

# ------------------------------------------------------------------------------------------------ weights
def bone_of(g):
    n = mixname(g)
    if n in ('Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'): return {'Hips': 'hips', 'Spine': 'spine', 'Spine1': 'spine1', 'Spine2': 'spine2', 'Neck': 'neck', 'Head': 'head'}[n]
    if n in ('HeadTop_End', 'Head_end'): return 'head'
    m = re.match(r'(Left|Right)(.*)$', n)
    if not m: return None
    s_ = 'L' if m.group(1) == 'Left' else 'R'; r = m.group(2)
    fm = re.match(r'Hand(Thumb|Index|Middle|Ring|Pinky)(\d)', r)
    if fm: return '%s%d.%s' % (fm.group(1).lower(), min(3, int(fm.group(2))), s_)
    base = {'Shoulder': 'shoulder', 'Arm': 'upperArm', 'ForeArm': 'forearm', 'Hand': 'hand', 'UpLeg': 'thigh', 'Leg': 'shin', 'Foot': 'foot',
            'ToeBase': 'toe', 'ToeBase_end': 'toe', 'Toe_End': 'toe'}.get(r)
    return base + '.' + s_ if base else None

# helper falloffs, measured on the previous SpiderMan mesh (share of the base bone's weight moved to the helper)
HELP = [  # helper, base, (joint a, joint b) of the measured axis, share(t)
    ('deltoid', 'upperArm', 'Arm', 'ForeArm', lambda t: 0.72 * (1 - smoothstep(0.05, 0.42, t))),
    ('glute', 'thigh', 'UpLeg', 'Leg', lambda t: 0.75 * (1 - smoothstep(0.0, 0.38, t))),
    ('forearmTwist', 'forearm', 'ForeArm', 'Hand', lambda t: 0.85 * smoothstep(0.25, 0.9, t)),
]
for o in src:
    me = o.data
    vg = o.vertex_groups
    W = [dict() for _ in me.vertices]
    names = {g.index: g.name for g in vg}
    unmapped = set()
    for v in me.vertices:
        acc = W[v.index]
        for g in v.groups:
            if g.weight <= 1e-5: continue
            b = bone_of(names[g.group])
            if b is None: unmapped.add(names[g.group]); continue
            acc[b] = acc.get(b, 0) + g.weight
    if unmapped: log('  unmapped groups on', o.name, sorted(unmapped))
    if group_of(o) == 'lens':
        W = [{'head': 1.0} for _ in me.vertices]
    for helper, base, ja, jb, share in HELP:
        for s_ in 'LR':
            P = side(s_); a = J[P + ja]; ax = J[P + jb] - a; L = ax.length; ax = ax / L
            hb, bb = helper + '.' + s_, base + '.' + s_
            for v in me.vertices:
                w = W[v.index].get(bb)
                if not w: continue
                k = share((v.co - a).dot(ax) / L)
                if k > 1e-3: W[v.index][bb] = w * (1 - k); W[v.index][hb] = W[v.index].get(hb, 0) + w * k
    # 4 strongest influences, normalised
    for acc in W:
        top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]
        t = sum(w for _, w in top) or 1
        acc.clear(); acc.update({k: w / t for k, w in top if w / t > 1e-3})
    for g in list(vg): vg.remove(g)
    groups = {b: vg.new(name=b) for b in ORDER}
    byw = {}
    for i, acc in enumerate(W):
        for b, w in acc.items(): byw.setdefault((b, round(w, 4)), []).append(i)
    for (b, w), idx in byw.items(): groups[b].add(idx, w, 'REPLACE')

# ------------------------------------------------------------------------------------------------ crotch weight relax
# The Mixamo thigh weights meet in a hard seam between the legs, which crumples in the wide crawl / perch / swing poses.
# Relax them on the welded base body (Laplacian, faded out over CROTCH m around the crotch), then resample every part
# (webs, emblems, pads...) from that surface so the overlay layers keep moving with the skin under them.
CROTCH = float(opt.get('crotch', 0.24)); RELAX = int(opt.get('relax', 24))
if CROTCH > 0:
    import bmesh
    from mathutils.bvhtree import BVHTree
    from mathutils.interpolate import poly_3d_calc
    cc = (HEAD['thigh.L'] + HEAD['thigh.R']) * 0.5 - Vector((0, 0, 0.07))
    fall = lambda p: 1 - smoothstep(CROTCH * 0.55, CROTCH, (p - cc).length)
    def read_w(o):
        names = {g.index: g.name for g in o.vertex_groups}
        return [{names[g.group]: g.weight for g in v.groups if g.weight > 1e-5} for v in o.data.vertices]
    def write_w(o, W):
        vg = o.vertex_groups
        for g in list(vg): vg.remove(g)
        groups = {b: vg.new(name=b) for b in ORDER}
        byw = {}
        for i, acc in enumerate(W):
            top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]; t = sum(w for _, w in top) or 1
            for b, w in top:
                if w / t > 1e-3: byw.setdefault((b, round(w / t, 4)), []).append(i)
        for (b, w), idx in byw.items(): groups[b].add(idx, w, 'REPLACE')
    dups = []
    for o in src:
        if o.get('srcmat') in ('material', 'Blue'):
            d = o.copy(); d.data = o.data.copy(); scene.collection.objects.link(d); dups.append(d)
    bpy.ops.object.select_all(action='DESELECT')
    for d in dups: d.select_set(True)
    bpy.context.view_layer.objects.active = dups[0]
    if len(dups) > 1: bpy.ops.object.join()
    ref = bpy.context.view_layer.objects.active
    bm = bmesh.new(); bm.from_mesh(ref.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-4); bm.to_mesh(ref.data); bm.free()
    me = ref.data; W = read_w(ref); co = [v.co.copy() for v in me.vertices]
    nb = [[] for _ in co]
    for e in me.edges: a_, b_ = e.vertices; nb[a_].append(b_); nb[b_].append(a_)
    F = [fall(c) for c in co]; act = [i for i in range(len(co)) if F[i] > 0 and nb[i]]
    for it in range(RELAX):
        upd = {}
        for i in act:
            avg = {}
            for j in nb[i]:
                for b, w in W[j].items(): avg[b] = avg.get(b, 0) + w / len(nb[i])
            k = 0.5 * F[i]
            upd[i] = {b: W[i].get(b, 0) * (1 - k) + avg.get(b, 0) * k for b in set(W[i]) | set(avg)}
        for i, m in upd.items(): W[i] = m
    polys = [list(p.vertices) for p in me.polygons]
    bvh = BVHTree.FromPolygons(co, polys)
    nmod = 0
    for o in src:
        if group_of(o) == 'lens': continue
        Wo = read_w(o); hit = False
        for v in o.data.vertices:
            f = fall(v.co)
            if f <= 0: continue
            loc, nrm, pi, dist = bvh.find_nearest(v.co)
            if pi is None or dist > 0.05: continue
            pv = polys[pi]; bw = poly_3d_calc([co[k] for k in pv], loc)
            acc = {}
            for k, wk in zip(pv, bw):
                for b, w in W[k].items(): acc[b] = acc.get(b, 0) + w * wk
            old_ = Wo[v.index]
            Wo[v.index] = {b: old_.get(b, 0) * (1 - f) + acc.get(b, 0) * f for b in set(old_) | set(acc)}
            hit = True; nmod += 1
        if hit: write_w(o, Wo)
    bpy.data.objects.remove(ref, do_unlink=True)
    log('crotch relax: %d base verts x%d iterations, %d verts resampled' % (len(act), RELAX, nmod))

# ------------------------------------------------------------------------------------------------ join + skin
parts = {}
for o in src: parts.setdefault(GROUP[group_of(o)], []).append(o)
final = []
for name, objs in parts.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = o.data.name = name
    if name == 'SpiderWebs' and WEBRATIO < 1:  # raised web lines: ~340k source tris, far over a game budget
        n0 = len(o.data.polygons)
        md = o.modifiers.new('Decimate', 'DECIMATE'); md.ratio = WEBRATIO; md.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=md.name)
        log('  webs decimated %d -> %d faces' % (n0, len(o.data.polygons)))
    o.parent = rig
    md = o.modifiers.new('Armature', 'ARMATURE'); md.object = rig
    final.append(o)
    log('mesh %-10s verts %7d tris %7d mats %s' % (name, len(o.data.vertices), sum(len(p.vertices) - 2 for p in o.data.polygons), [m.name for m in o.data.materials]))

# lenses: gloss instead of the dropped glass shell
lens = bpy.data.materials.get('Lens')
if lens and lens.node_tree:
    bsdf = next((n for n in lens.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf:
        for l in list(bsdf.inputs['Roughness'].links): lens.node_tree.links.remove(l)
        bsdf.inputs['Roughness'].default_value = 0.22
        # its base-colour map is a near-flat tint that the glTF exporter fails to re-encode (left a texture with no
        # source -> GLTFLoader throws): bake it to its mean colour
        bc = bsdf.inputs['Base Color']
        img = next((n.image for n in lens.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.colorspace_settings.name == 'sRGB'), None)
        if img:
            import numpy as np
            px = np.empty(len(img.pixels), dtype=np.float32); img.pixels.foreach_get(px)
            mean = ((px.reshape(-1, 4)[:, :3] + 0.055) / 1.055) ** 2.4  # stored sRGB -> linear
            mean = mean.mean(axis=0)
            for l in list(bc.links): lens.node_tree.links.remove(l)
            bc.default_value = (*mean.tolist(), 1.0)
            log('  lens base colour baked to', tuple(round(float(x), 3) for x in mean))

# sanity: every joint sits inside the body (centroid of its dominant verts close to the bone)
body = next(o for o in final if o.name == 'SpiderMan')
bad = []
for b in ('hand.L', 'hand.R', 'foot.L', 'foot.R', 'head', 'shin.L', 'forearm.R'):
    gi = body.vertex_groups[b].index
    pts = [v.co for v in body.data.vertices if any(g.group == gi and g.weight > 0.8 for g in v.groups)]
    if pts:
        c = sum(pts, Vector()) / len(pts); d = (c - HEAD[b]).length
        log('  %-10s dominant verts %5d centroid-joint %.3f m' % (b, len(pts), d))
        if d > 0.35: bad.append(b)
assert not bad, 'skin/joint mismatch: %s' % bad

# ------------------------------------------------------------------------------------------------ textures
# game budget: <= 2048 px (the suit fabric patch adds the micro detail), WebP on export
MAXTEX = int(opt.get('maxtex', 2048))
# (r13b perf) only the big body panels (red, blue, raised webs) keep 2048; small parts (emblems, soles, pads, lens,
# frames) are 1024 — about half the texture memory, no visible change at gameplay distances
BIG = {'SpiderSuit', 'SpiderSuitBlue', 'SpiderSuitWebs'}
cap = {}
for mat in bpy.data.materials:
    if not mat.node_tree: continue
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            cap[n.image.name] = max(cap.get(n.image.name, 0), MAXTEX if mat.name in BIG else min(MAXTEX, int(opt.get('smalltex', 1024))))
for im in bpy.data.images:
    w, h = im.size
    lim = cap.get(im.name, MAXTEX)
    if max(w, h) > lim:
        k = lim / max(w, h); im.scale(max(1, int(w * k)), max(1, int(h * k)))
        log('  image %-10s %dx%d -> %dx%d' % (im.name, w, h, im.size[0], im.size[1]))

# clips are NOT exported here: finalize.mjs copies the SpiderRig glTF channels verbatim (absolute local rotations),
# which reproduces the old world pose of every bone on the re-seated rest frames.
# ------------------------------------------------------------------------------------------------ export
bpy.data.objects.remove(old, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in final: o.select_set(True)
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
kw = dict(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_skins=True,
          export_yup=True, export_apply=False, export_tangents=True, export_normals=True, export_texcoords=True,
          export_materials='EXPORT', export_image_format='WEBP', export_image_quality=88, export_influence_nb=4, export_all_influences=False,
          export_extras=False)
try:
    bpy.ops.export_scene.gltf(**kw, export_rest_position_armature=True)
except TypeError:
    bpy.ops.export_scene.gltf(**kw)
log('wrote', OUT, '%.1f MB' % (os.path.getsize(OUT) / 1e6))
