# (user r14e) Peter Parker civilian model for the apartment (Sketchfab "Peter Parker" by Player 1 The SFM Animator,
# CC-BY-4.0, Mixamo rig) -> public/assets/peter.glb: textures down to <= 2048 px and WebP, the one-frame Mixamo
# "animation" dropped (the game drives the skeleton by retargeting Spider-Man's animation, see systems/apartment.js).
#   python tools/peter/prep_alpha.py <in.glb> <alpha dir>            (hair / brow alpha masks, needs scipy)
#   blender -b --factory-startup -P tools/peter/build_peter.py -- <in.glb> public/assets/peter.glb [<alpha dir>]
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
src, dst = argv[0], argv[1]
alpha_dir = argv[2] if len(argv) > 2 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for o in bpy.data.objects:
    if o.animation_data: o.animation_data_clear()
for im in bpy.data.images:
    if im.size[0] == 0: continue
    lim = 2048 if max(im.size) > 2048 else max(im.size)
    if max(im.size) > lim or True:
        w, h = im.size; k = min(1.0, lim / max(w, h))
        if k < 1: im.scale(max(1, int(w * k)), max(1, int(h * k)))
    print('[peter] image', im.name, tuple(im.size), flush=True)
# swap in the RGBA hair / brow textures (prep_alpha.py) and wire their alpha
for m in bpy.data.materials:
    png = alpha_dir and os.path.join(alpha_dir, m.name + '.png')
    if not png or not os.path.exists(png) or not m.use_nodes: continue
    nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tn = bsdf.inputs['Base Color'].links[0].from_node
    im = bpy.data.images.load(png); im.alpha_mode = 'STRAIGHT'; tn.image = im
    nt.links.new(tn.outputs['Alpha'], bsdf.inputs['Alpha'])
    print('[peter] alpha texture for', m.name, flush=True)
for m in bpy.data.materials: print('[peter] material', m.name, getattr(m, 'surface_render_method', ''), flush=True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='WEBP', export_image_quality=88,
                          export_animations=False, export_skins=True, export_yup=True, export_apply=False)
print('[peter] wrote', dst, flush=True)
