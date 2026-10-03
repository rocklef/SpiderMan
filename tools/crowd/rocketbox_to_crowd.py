# (user r14d) Microsoft Rocketbox avatars (MIT, github.com/microsoft/Microsoft-Rocketbox) -> the crowd's GPU-skinned
# format (public/assets/city/npc/people.json skeleton + baked clips), written as a SEPARATE pack:
#   public/assets/city/npc/rb_people.{json,bin} + rb_atlas.webp (built by rb_atlas.py)
#
#   blender -b --factory-startup -P tools/crowd/rocketbox_to_crowd.py -- --src <dir with Female_Adult_01/...> \
#       --people public/assets/city/npc/people.json --out public/assets/city/npc/rb_people --tile 1024 --grid 4
#
# Per avatar: the Bip01 skeleton's vertex groups fold onto the crowd's 18 bones (face / finger / toe / twist bones into
# their nearest mapped ancestor, clavicles into the chest); the mesh is re-posed into the crowd bind pose by linear-blend
# skinning with per-bone frame transforms Target * ScaleAlongBone * Orig^-1 (joints land exactly on the crowd joints,
# segment lengths match, the A-pose arms come down), 4 strongest weights, three LODs (full / ~1800 / ~450 tris by
# collapse decimation), UVs remapped into the avatar's atlas tile: body (top 11/16), head (bottom-left), opacity cards
# (bottom-right, alpha-tested). Blender (x, y, z) -> three (x, z, -y).
import bpy, bmesh, sys, os, json, struct, math, re, glob
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {argv[i][2:]: argv[i + 1] for i in range(0, len(argv) - 1, 2) if argv[i].startswith('--')}
SRC, PEOPLE, OUT = opt['src'], opt['people'], opt['out']
GRID = int(opt.get('grid', 4))
LOD_TRIS = [None, 1800, 450]

meta = json.load(open(PEOPLE))
CB = meta['bones']; NB = len(CB)
IDX = {b['name']: i for i, b in enumerate(CB)}
# crowd joints, three -> Blender
J = [Vector((b['head'][0], -b['head'][2], b['head'][1])) for b in CB]

KEY = {  # Bip01 bone -> crowd bone
    'Bip01 Pelvis': 'hips', 'Bip01 Spine': 'spine', 'Bip01 Spine1': 'chest', 'Bip01 Spine2': 'chest', 'Bip01 Neck': 'neck', 'Bip01 Head': 'head',
    'Bip01 L Clavicle': 'chest', 'Bip01 R Clavicle': 'chest',
    'Bip01 L UpperArm': 'upperArmL', 'Bip01 L Forearm': 'forearmL', 'Bip01 L Hand': 'handL',
    'Bip01 R UpperArm': 'upperArmR', 'Bip01 R Forearm': 'forearmR', 'Bip01 R Hand': 'handR',
    'Bip01 L Thigh': 'thighL', 'Bip01 L Calf': 'shinL', 'Bip01 L Foot': 'footL', 'Bip01 L Toe0': 'footL',
    'Bip01 R Thigh': 'thighR', 'Bip01 R Calf': 'shinR', 'Bip01 R Foot': 'footR', 'Bip01 R Toe0': 'footR',
}
# frame definition per crowd bone: (source bone, source segment end bone or None, crowd child index or direction)
SEG = {
    'hips': ('Bip01 Pelvis', 'Bip01 Spine', 'spine'), 'spine': ('Bip01 Spine', 'Bip01 Spine1', 'chest'),
    'chest': ('Bip01 Spine1', 'Bip01 Neck', 'neck'), 'neck': ('Bip01 Neck', 'Bip01 Head', 'head'), 'head': ('Bip01 Head', None, None),
    'upperArmL': ('Bip01 L UpperArm', 'Bip01 L Forearm', 'forearmL'), 'forearmL': ('Bip01 L Forearm', 'Bip01 L Hand', 'handL'), 'handL': ('Bip01 L Hand', 'cont', None),
    'upperArmR': ('Bip01 R UpperArm', 'Bip01 R Forearm', 'forearmR'), 'forearmR': ('Bip01 R Forearm', 'Bip01 R Hand', 'handR'), 'handR': ('Bip01 R Hand', 'cont', None),
    'thighL': ('Bip01 L Thigh', 'Bip01 L Calf', 'shinL'), 'shinL': ('Bip01 L Calf', 'Bip01 L Foot', 'footL'), 'footL': ('Bip01 L Foot', 'Bip01 L Toe0', 'toe'),
    'thighR': ('Bip01 R Thigh', 'Bip01 R Calf', 'shinR'), 'shinR': ('Bip01 R Calf', 'Bip01 R Foot', 'footR'), 'footR': ('Bip01 R Foot', 'Bip01 R Toe0', 'toe'),
}
PARENT_OF = {'handL': 'forearmL', 'handR': 'forearmR'}


def frame_from(origin, y, ref_x):
    y = y.normalized(); x = (ref_x - y * ref_x.dot(y)); x = x.normalized() if x.length > 1e-6 else Vector((1, 0, 0)); z = x.cross(y).normalized(); x = y.cross(z)
    M = Matrix((x, y, z)).transposed().to_4x4(); M.translation = origin; return M


def build_transforms(arm):
    W = arm.matrix_world
    H = {b.name: W @ b.head_local for b in arm.data.bones}
    T = [Matrix.Identity(4) for _ in range(NB)]
    for name, (sb, eb, ch) in SEG.items():
        i = IDX[name]
        if sb not in H: continue
        o0 = H[sb]
        if eb == 'cont':  # hand: continue the forearm direction
            fb = 'Bip01 L Forearm' if name.endswith('L') else 'Bip01 R Forearm'
            d0 = (H[sb] - H[fb]).normalized(); d1 = (J[i] - J[IDX[PARENT_OF[name]]]).normalized(); l0 = l1 = 0.08
        elif eb is None:  # head: straight up
            d0 = d1 = Vector((0, 0, 1)); l0 = l1 = 0.2
        else:
            d0v = H[eb] - o0; l0 = d0v.length; d0 = d0v / max(l0, 1e-6)
            if ch == 'toe': d1, l1 = d0, l0                     # the foot keeps its own shape / angle
            else: d1v = J[IDX[ch]] - J[i]; l1 = d1v.length; d1 = d1v / l1
            if l0 < 0.03: d0 = d1 = Vector((0, 0, 1)); l0 = l1 = 1.0   # degenerate source segment (pelvis ~ spine)
        ref = Vector((1, 0, 0))
        O = frame_from(o0, d0, ref)
        R = d0.rotation_difference(d1)
        Tg = frame_from(J[i], d1, R @ ref)
        S = Matrix.Diagonal((1.0, l1 / max(l0, 1e-4), 1.0, 1.0))
        T[i] = Tg @ S @ O.inverted()
    return T


def bone_to_crowd(arm):
    out = {}
    for b in arm.data.bones:
        p, k = b, None
        while p is not None:
            if p.name in KEY: k = KEY[p.name]; break
            p = p.parent
        out[b.name] = IDX[k] if k else IDX['hips']
    return out


def tile_rects(slot):
    tx, ty = slot % GRID, slot // GRID
    u0, v0, s = tx / GRID, 1.0 - (ty + 1) / GRID, 1.0 / GRID   # tile rect in UV space (v up)
    # body: top 11/16 of the tile; head: bottom-left; opacity: bottom-right (pixel padding 6/1024)
    p = 6 / 1024 * s
    body = (u0 + p, v0 + s * 5 / 16 + p, s - 2 * p, s * 11 / 16 - 2 * p)
    head = (u0 + p, v0 + p, s / 2 - 2 * p, s * 5 / 16 - 2 * p)
    opac = (u0 + s / 2 + p, v0 + p, s / 2 - 2 * p, s * 5 / 16 - 2 * p)
    return {'body': body, 'head': head, 'opacity': opac}


def process(path, slot):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images, bpy.data.actions):
        for d in list(coll): coll.remove(d)
    bpy.ops.import_scene.fbx(filepath=path)
    bpy.context.view_layer.update()
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and len(o.data.vertices) > 100]
    me_obj = max(meshes, key=lambda o: len(o.data.vertices))
    T = build_transforms(arm)
    b2c = bone_to_crowd(arm)
    me = me_obj.data
    Wm = me_obj.matrix_world
    gname = {g.index: g.name for g in me_obj.vertex_groups}
    # per vertex crowd weights (top 4)
    VW = []
    for v in me.vertices:
        acc = {}
        for g in v.groups:
            if g.weight <= 1e-5: continue
            ci = b2c.get(gname[g.group], IDX['hips']); acc[ci] = acc.get(ci, 0) + g.weight
        top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]; t = sum(w for _, w in top) or 1
        VW.append([(i, w / t) for i, w in top])
    # re-pose into the crowd bind (LBS with the frame transforms)
    new_co = []
    for v, ws in zip(me.vertices, VW):
        p = Wm @ v.co; q = Vector((0, 0, 0))
        for i, w in ws: q += (T[i] @ p) * w
        new_co.append(q)
    # soles on the ground: lift the foot-weighted vertices by the sole's depth below y = 0
    fw = [sum(w for i, w in ws if i in (IDX['footL'], IDX['footR'])) for ws in VW]
    sole = min(c.z for c, f in zip(new_co, fw) if f > 0.5) if any(f > 0.5 for f in fw) else 0.0
    if sole < 0: new_co = [c + Vector((0, 0, -sole * min(1.0, f + max(0.0, 0.25 - c.z) * 4))) for c, f in zip(new_co, fw)]
    for v, c in zip(me.vertices, new_co): v.co = Wm.inverted() @ c
    me.update()
    # material -> region / atlas rect
    rects = tile_rects(slot)
    kind_of = lambda m: 'opacity' if 'opacity' in m.name.lower() else 'head' if 'head' in m.name.lower() else 'body'
    mat_kind = [kind_of(m) for m in me.materials]
    # stash weights as vertex groups named by crowd index (survive decimation as interpolated weights)
    for g in list(me_obj.vertex_groups): me_obj.vertex_groups.remove(g)
    groups = [me_obj.vertex_groups.new(name='c%02d' % i) for i in range(NB)]
    for vi, ws in enumerate(VW):
        for i, w in ws: groups[i].add([vi], w, 'REPLACE')
    for m in list(me_obj.modifiers): me_obj.modifiers.remove(m)
    me_obj.parent = None; me_obj.matrix_world = Wm
    bpy.ops.object.select_all(action='DESELECT'); me_obj.select_set(True); bpy.context.view_layer.objects.active = me_obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    lods = []
    base_tris = sum(len(p.vertices) - 2 for p in me_obj.data.polygons)
    for li, target in enumerate(LOD_TRIS):
        o = me_obj.copy(); o.data = me_obj.data.copy(); bpy.context.scene.collection.objects.link(o)
        if target and base_tris > target:
            md = o.modifiers.new('dec', 'DECIMATE'); md.ratio = target / base_tris; md.use_collapse_triangulate = True
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=md.name)
        lods.append(extract(o, mat_kind, rects))
        bpy.data.objects.remove(o, do_unlink=True)
    h = max(v.co.z for v in me_obj.data.vertices)
    return lods, h


def extract(o, mat_kind, rects):
    me = o.data
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    me.calc_loop_triangles() if hasattr(me, 'calc_loop_triangles') else None
    uvl = me.uv_layers.active.data if me.uv_layers.active else None
    gidx = {g.index: int(g.name[1:]) for g in o.vertex_groups}
    # split vertices by (vertex, uv) so UV seams survive
    verts, key = [], {}
    idx = []
    for poly in me.polygons:
        kind = mat_kind[poly.material_index] if poly.material_index < len(mat_kind) else 'body'
        r = rects[kind]
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            uv = uvl[li].uv if uvl else (0, 0)
            u = min(max(uv[0] - math.floor(uv[0]) if uv[0] > 1.0001 or uv[0] < -0.0001 else uv[0], 0), 1)
            vv = min(max(uv[1] - math.floor(uv[1]) if uv[1] > 1.0001 or uv[1] < -0.0001 else uv[1], 0), 1)
            au, av = r[0] + u * r[2], r[1] + vv * r[3]
            k = (vi, round(au, 5), round(av, 5))
            if k not in key:
                v = me.vertices[vi]
                ws = sorted([(gidx[g.group], g.weight) for g in v.groups if g.weight > 1e-4], key=lambda t: -t[1])[:4]
                t = sum(w for _, w in ws) or 1
                key[k] = len(verts)
                verts.append((v.co.copy(), v.normal.copy(), [(i, w / t) for i, w in ws], au, av, 21 if kind == 'opacity' else 20))
            idx.append(key[k])
    return verts, idx


# ---------------------------------------------------------------- run
avatars = sorted(d for d in os.listdir(SRC) if os.path.isdir(os.path.join(SRC, d)) and glob.glob(os.path.join(SRC, d, '*.fbx')))
blob = bytearray(); variants = []
def put(arr_bytes):
    global blob
    while len(blob) % 4: blob.append(0)
    off = len(blob); blob += arr_bytes; return off
for slot, name in enumerate(avatars):
    fbx = glob.glob(os.path.join(SRC, name, '*.fbx'))[0]
    lods, h = process(fbx, slot)
    out_lods = []
    for verts, idx in lods:
        nv = len(verts); assert nv < 65535, nv
        pos = struct.pack('<%df' % (nv * 3), *[c for v in verts for c in (v[0].x, v[0].z, -v[0].y)])
        nrm = struct.pack('<%df' % (nv * 3), *[c for v in verts for c in (v[1].x, v[1].z, -v[1].y)])
        reg = bytes(v[5] for v in verts); ao = bytes(255 for _ in verts)
        si, sw = bytearray(), bytearray()
        for v in verts:
            ws = v[2] + [(0, 0.0)] * (4 - len(v[2]))
            q = [int(round(w * 255)) for _, w in ws]; q[0] += 255 - sum(q)
            si += bytes(i for i, _ in ws); sw += bytes(max(0, min(255, x)) for x in q)
        uv = struct.pack('<%dH' % (nv * 2), *[c for v in verts for c in (int(round(v[3] * 65535)), int(round(v[4] * 65535)))])
        opt = bytes(nv)
        ib = struct.pack('<%dH' % len(idx), *idx)
        L = {'nv': nv, 'nt': len(idx) // 3, 'pos': put(pos), 'nrm': put(nrm), 'reg': put(reg), 'ao': put(ao), 'si': put(bytes(si)), 'sw': put(bytes(sw)), 'uv': put(uv), 'opt': put(opt), 'idx': put(ib)}
        out_lods.append(L)
    female = name.lower().startswith('female')
    variants.append({'name': 'rb_' + name, 'female': female, 'rb': True, 'slot': slot, 'height': round(h, 3), 'lods': out_lods,
                     'walk': 'walk', 'hair': 'short', 'hairs': ['short'], 'outer': None, 'legs': 'pants'})
    print('[rb] %-16s slot %2d lods %s height %.2f' % (name, slot, [l['nt'] for l in out_lods], h), flush=True)
open(OUT + '.bin', 'wb').write(blob)
json.dump({'variants': variants, 'grid': GRID, 'atlas': os.path.basename(OUT) + '_atlas', 'avatars': avatars}, open(OUT + '.json', 'w'), indent=1)
print('[rb] wrote', OUT + '.json/.bin', len(blob) / 1e6, 'MB', flush=True)
