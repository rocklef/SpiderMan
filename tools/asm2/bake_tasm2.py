# Keep the TASM2 Mixamo mesh + weights. Bake SpiderRig clips onto Mixamo bones (visual retarget).
# Does NOT rebuild skin, does NOT rename materials to SpiderSuit (no fabric overlay).
#
# blender -b --factory-startup -P tools/asm2/bake_tasm2.py -- --asm2 <tasm2.glb> --rig <spiderrig.glb> --out <out.glb>
import bpy, sys, os, math, re, time
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {argv[i][2:]: argv[i + 1] for i in range(0, len(argv) - 1, 2) if argv[i].startswith('--')}
ASM2, RIG, OUT = opt['asm2'], opt['rig'], opt['out']
HEIGHT = float(opt.get('height', 1.79))
T0 = time.time()
log = lambda *a: print('[tasm2 %5.1fs]' % (time.time() - T0), *a, flush=True)

mixname = lambda n: re.sub(r'_\d+$', '', n.replace('mixamorig:', ''))

# Mixamo short name -> SpiderRig bone
MAP = {
    'Hips': 'hips', 'Spine': 'spine', 'Spine1': 'spine1', 'Spine2': 'spine2', 'Neck': 'neck', 'Head': 'head',
}
for side, S in (('Left', 'L'), ('Right', 'R')):
    MAP[side + 'Shoulder'] = 'shoulder.' + S
    MAP[side + 'Arm'] = 'upperArm.' + S
    MAP[side + 'ForeArm'] = 'forearm.' + S
    MAP[side + 'Hand'] = 'hand.' + S
    MAP[side + 'UpLeg'] = 'thigh.' + S
    MAP[side + 'Leg'] = 'shin.' + S
    MAP[side + 'Foot'] = 'foot.' + S
    MAP[side + 'ToeBase'] = 'toe.' + S
    for f, F in (('Thumb', 'thumb'), ('Index', 'index'), ('Middle', 'middle'), ('Ring', 'ring'), ('Pinky', 'pinky')):
        for i in (1, 2, 3):
            MAP[side + 'Hand' + f + str(i)] = '%s%d.%s' % (F, i, S)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30

bpy.ops.import_scene.gltf(filepath=RIG, bone_heuristic='BLENDER')
old = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
old.name = 'SpiderRig'
for o in [o for o in bpy.data.objects if o.type != 'ARMATURE']:
    bpy.data.objects.remove(o, do_unlink=True)
ACTS = [a for a in bpy.data.actions]
log('rig clips', len(ACTS), 'bones', len(old.data.bones))

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=ASM2, bone_heuristic='BLENDER')
new_objs = [o for o in bpy.data.objects if o not in before]
mix = next(o for o in new_objs if o.type == 'ARMATURE')
src = [o for o in new_objs if o.type == 'MESH']
mix.name = 'TASM2'
bpy.context.view_layer.update()

hips_b = next(b for b in mix.data.bones if mixname(b.name) == 'Hips')
hw = mix.matrix_world @ hips_b.head_local
if abs(hw.y) > abs(hw.z) + 0.2:
    R90 = Matrix.Rotation(math.radians(90), 4, 'X')
    mix.matrix_world = R90 @ mix.matrix_world
    for o in src:
        o.matrix_world = R90 @ o.matrix_world
    bpy.context.view_layer.update()
    log('Y-up -> Z-up')

# Drop the glass shell (z-fights the lenses) and empty helper meshes
keep = []
for o in src:
    mats = [((m.name if m else '')).lower() for m in o.data.materials]
    if any('glass' in n for n in mats):
        bpy.data.objects.remove(o, do_unlink=True)
        continue
    zs = [(o.matrix_world @ v.co).z for v in o.data.vertices] or [0]
    if max(zs) - min(zs) < 0.002 and len(o.data.vertices) < 8:
        bpy.data.objects.remove(o, do_unlink=True)
        continue
    keep.append(o)
src = keep

zs = []
for o in src:
    for v in o.data.vertices:
        w = o.matrix_world @ v.co
        if w.z > -0.2:
            zs.append(w.z)
zmin, zmax = min(zs), max(zs)
S = HEIGHT / max(0.5, zmax - zmin)
TM = Matrix.Translation(Vector((0, 0, -zmin * S))) @ Matrix.Scale(S, 4)
mix.matrix_world = TM @ mix.matrix_world
for o in src:
    o.matrix_world = TM @ o.matrix_world
bpy.context.view_layer.update()
log('scale', round(S, 4), 'height', round(zmax - zmin, 3), '->', HEIGHT)

# Apply object transforms so rest pose is clean
bpy.ops.object.select_all(action='DESELECT')
mix.select_set(True)
for o in src:
    o.select_set(True)
bpy.context.view_layer.objects.active = mix
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# World copy-rot from SpiderRig (keeps Mixamo skin; no weight paint)
bpy.context.view_layer.objects.active = mix
bpy.ops.object.mode_set(mode='POSE')
mapped, skipped = 0, []
for pb in mix.pose.bones:
    src_b = MAP.get(mixname(pb.name))
    if not src_b or src_b not in old.data.bones:
        skipped.append(pb.name)
        continue
    c = pb.constraints.new('COPY_ROTATION')
    c.name = 'retarget'
    c.target = old
    c.subtarget = src_b
    c.target_space = 'WORLD'
    c.owner_space = 'WORLD'
    c.mix_mode = 'REPLACE'
    if mixname(pb.name) == 'Hips':
        cl = pb.constraints.new('COPY_LOCATION')
        cl.name = 'retarget_loc'
        cl.target = old
        cl.subtarget = src_b
        cl.target_space = 'WORLD'
        cl.owner_space = 'WORLD'
        cl.use_offset = False
    mapped += 1
bpy.ops.object.mode_set(mode='OBJECT')
log('constrained', mapped, 'bones; skip', len(skipped))

mix.animation_data_create()
for i, act in enumerate(ACTS):
    old.animation_data_create()
    old.animation_data.action = act
    a0, a1 = int(act.frame_range[0]), int(act.frame_range[1])
    if a1 <= a0:
        a1 = a0 + 1
    bpy.ops.object.select_all(action='DESELECT')
    mix.select_set(True)
    bpy.context.view_layer.objects.active = mix
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.nla.bake(
        frame_start=a0, frame_end=a1, step=1,
        only_selected=True, visual_keying=True, clear_constraints=False,
        use_current_action=False, bake_types={'POSE'},
    )
    bpy.ops.object.mode_set(mode='OBJECT')
    baked = mix.animation_data.action
    if not baked:
        log('bake miss', act.name)
        continue
    baked.name = 'T_' + act.name
    track = mix.animation_data.nla_tracks.new()
    track.name = act.name
    track.strips.new(act.name, a0, baked)
    mix.animation_data.action = None
    if i % 10 == 0 or i == len(ACTS) - 1:
        log('baked', i + 1, '/', len(ACTS), act.name, 'frames', a0, a1)

# Remove retarget constraints so rest pose is Mixamo again
bpy.context.view_layer.objects.active = mix
bpy.ops.object.mode_set(mode='POSE')
for pb in mix.pose.bones:
    for c in list(pb.constraints):
        pb.constraints.remove(c)
bpy.ops.object.mode_set(mode='OBJECT')

bpy.data.objects.remove(old, do_unlink=True)
for a in list(bpy.data.actions):
    if a.name.startswith('T_'):
        continue
    # keep baked copies referenced by NLA; drop original SpiderRig actions
    if not any(strip.action == a for tr in mix.animation_data.nla_tracks for strip in tr.strips):
        bpy.data.actions.remove(a)

# Rename baked actions to clip names the game expects
for tr in mix.animation_data.nla_tracks:
    for strip in tr.strips:
        if strip.action:
            strip.action.name = tr.name

bpy.ops.object.select_all(action='DESELECT')
mix.select_set(True)
for o in src:
    if o.name in bpy.data.objects:
        o.select_set(True)
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
kw = dict(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_skins=True,
          export_yup=True, export_apply=False, export_tangents=True, export_normals=True, export_texcoords=True,
          export_materials='EXPORT', export_image_format='AUTO', export_extras=False)
try:
    bpy.ops.export_scene.gltf(**kw, export_animation_mode='NLA_TRACKS', export_rest_position_armature=True)
except TypeError:
    bpy.ops.export_scene.gltf(**kw)
log('wrote', OUT, '%.1f MB' % (os.path.getsize(OUT) / 1e6))
