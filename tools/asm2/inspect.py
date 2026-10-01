# Dump Blender import axes / bone names for the original SpiderRig and the ASM2 Mixamo file.
import bpy, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {argv[i][2:]: argv[i + 1] for i in range(0, len(argv) - 1, 2) if argv[i].startswith('--')}
bpy.ops.wm.read_factory_settings(use_empty=True)

def dump(path, tag):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path, bone_heuristic='BLENDER')
    bpy.context.view_layer.update()
    new = [o for o in bpy.data.objects if o not in before]
    arms = [o for o in new if o.type == 'ARMATURE']
    meshes = [o for o in new if o.type == 'MESH']
    print('===', tag, os.path.basename(path), '===')
    print('armatures', [a.name for a in arms], 'meshes', len(meshes))
    zs, ys = [], []
    for o in meshes:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            zs.append(w.z); ys.append(w.y)
    if zs:
        print('mesh world Y %.3f..%.3f  Z %.3f..%.3f  (spanY %.3f spanZ %.3f)' % (
            min(ys), max(ys), min(zs), max(zs), max(ys) - min(ys), max(zs) - min(zs)))
    for a in arms:
        print(' bones', len(a.data.bones), 'actions', [x.name for x in (bpy.data.actions)])
        for b in list(a.data.bones)[:8]:
            h = a.matrix_world @ b.head_local
            print('  ', b.name, 'head', tuple(round(x, 3) for x in h), 'parent', b.parent.name if b.parent else None)
        print('  ...')
        names = [b.name for b in a.data.bones]
        print('  all:', names)

dump(opt['rig'], 'RIG')
# clear
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
dump(opt['asm2'], 'ASM2')
