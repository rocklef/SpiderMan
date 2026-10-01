# Hand-keyed ASM2 signature clips on the SpiderRig (user r13: "heavy touch of The Amazing Spider-Man 2").
#
#   blender -b --factory-startup -P tools/asm2/author_clips.py -- --rig tools/asm2/spiderrig.glb --out extra_clips.glb
#
# Every clip starts from a frame of an existing SpiderRig clip and re-poses limbs by world direction / 2-bone IK in
# armature space (Blender: +X = his left, -Y = forward, +Z = up), then keys every bone. The output holds only the
# armature + the new actions; finalize.mjs --extra copies their glTF channels onto spiderman.glb like the other clips
# (same rest frames). Helper bones (deltoid / glute / forearmTwist) are recomputed by the animator at runtime.
#   perchASM2 (6 s loop)  deep spider crouch on the ledge: left hand planted between the feet, right forearm draped over
#                         the right knee with the wrist hanging loose, head tilted / scanning the street, slow breaths
#   idleASM2  (6 s loop)  Garfield-style standing: weight sunk into the left hip, right knee loose, shoulders a bit
#                         rounded, curious head tilt, a web-shooter check (forearm up, wrist cocked, thwip fingers)
#   landHeroASM2 (1.8 s)  superhero landing from a big fall: left knee down, right foot planted ahead, right fist on the
#                         street, left arm flung back and up, head down -> head comes up -> starts to rise
#   tauntASM2 (4.5 s loop) combat idle variant: guard, a 'come on' beckon (palm up, fingers curl twice), a cocky shrug
#   zipPoseASM2 (1.6 s)   zip-point arrival hero shot from the perch: right arm thrown up/out with the web-shooter
#                         cocked (thwip fingers), head along the arm -> back into the perch crouch
import bpy, sys, math
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {argv[i][2:]: argv[i + 1] for i in range(0, len(argv) - 1, 2) if argv[i].startswith('--')}
FPS = 30
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FPS
bpy.ops.import_scene.gltf(filepath=opt['rig'], bone_heuristic='BLENDER')
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in [o for o in bpy.data.objects if o.type != 'ARMATURE']: bpy.data.objects.remove(o, do_unlink=True)
P = arm.pose.bones
upd = lambda: bpy.context.view_layer.update()
smooth = lambda t: (lambda x: x * x * (3 - 2 * x))(min(1.0, max(0.0, t)))


def use(action, frame):
    arm.animation_data.action = bpy.data.actions[action]
    try: arm.animation_data.action_slot = bpy.data.actions[action].slots[0]
    except Exception: pass
    bpy.context.scene.frame_set(int(frame)); upd()
    snap = {b.name: (b.location.copy(), b.rotation_quaternion.copy()) for b in P}
    arm.animation_data.action = None
    for b in P: b.location, b.rotation_quaternion = snap[b.name][0].copy(), snap[b.name][1].copy()
    upd()


def head(n): return P[n].matrix.translation.copy()
def end_of(n):  # position of the chain end the bone drives (its first child's head)
    ch = {'thigh.L': 'shin.L', 'thigh.R': 'shin.R', 'shin.L': 'foot.L', 'shin.R': 'foot.R', 'upperArm.L': 'forearm.L', 'upperArm.R': 'forearm.R',
          'forearm.L': 'hand.L', 'forearm.R': 'hand.R'}.get(n)
    return head(ch) if ch else P[n].matrix.translation + P[n].matrix.col[1].xyz * P[n].length


def aim(n, d, w=1.0):
    """turn bone n (about its head) so that the segment head -> chain end points along d"""
    pb = P[n]; m = pb.matrix.copy(); cur = (end_of(n) - m.translation).normalized()
    q = cur.rotation_difference(Vector(d).normalized())
    if w < 1: q = Quaternion().slerp(q, w)
    t = m.translation.copy(); m2 = q.to_matrix().to_4x4() @ m; m2.translation = t
    pb.matrix = m2; upd()


def rot(n, axis, ang):
    pb = P[n]; m = pb.matrix.copy(); t = m.translation.copy()
    m2 = Matrix.Rotation(ang, 4, Vector(axis).normalized()) @ m; m2.translation = t; pb.matrix = m2; upd()


def rot_local(n, axis_idx, ang):  # about the bone's own X / Y / Z axis
    rot(n, P[n].matrix.col[axis_idx].xyz, ang)


def ik(upper, lower, target, pole):
    A = head(upper); B = head(lower); C = end_of(lower)
    l1, l2 = (B - A).length, (C - B).length
    T = Vector(target); d = min((T - A).length, (l1 + l2) * 0.999); d = max(d, abs(l1 - l2) + 1e-3)
    dirv = (T - A).normalized()
    pv = Vector(pole) - A; pv -= dirv * pv.dot(dirv); pv.normalize()
    x = (l1 * l1 - l2 * l2 + d * d) / (2 * d); h = math.sqrt(max(0.0, l1 * l1 - x * x))
    mid = A + dirv * x + pv * h
    aim(upper, mid - A); aim(lower, A + dirv * d - head(lower))


def move_hips(dv):
    pb = P['hips']; m = pb.matrix.copy(); m.translation += Vector(dv); pb.matrix = m; upd()


def curl(side, fingers, amt):
    for f in fingers:
        for i, k in ((1, 1.0), (2, 1.15), (3, 0.9)):
            n = '%s%d.%s' % (f, i, side)
            if n in P: rot_local(n, 0, amt * k)


def keyframe(act, frame):
    for b in P:
        b.keyframe_insert('rotation_quaternion', frame=frame, group=b.name)
        if b.name == 'hips': b.keyframe_insert('location', frame=frame, group=b.name)


def make(name, keys, length_s):
    """keys: list of (time_s, poser()) — poser sets the pose from scratch; the last key should match the first (loop)"""
    act = bpy.data.actions.new(name); act.use_fake_user = True
    arm.animation_data.action = act
    try: arm.animation_data.action_slot = act.slots.new('OBJECT', arm.name) if hasattr(act, 'slots') and len(act.slots) == 0 else act.slots[0]
    except Exception: pass
    for t, poser in keys:
        arm.animation_data.action = None
        poser()
        arm.animation_data.action = act
        try: arm.animation_data.action_slot = act.slots[0]
        except Exception: pass
        keyframe(act, round(t * FPS))
    arm.animation_data.action = None
    print('[author] %s: %d keys, %.1f s' % (name, len(keys), length_s), flush=True)
    return act


# ============================================================================================ perchASM2
def perch(k_head, k_breath):
    use('perchIdle', 0)
    # deeper, more hunched: hips down / back a touch, spine curls forward
    move_hips((0, 0.02, -0.035))
    rot('spine1', (1, 0, 0), -0.08 - 0.03 * k_breath); rot('spine2', (1, 0, 0), -0.06 + 0.04 * k_breath)
    # feet stay planted where the clip has them
    for s_, x in (('L', 1), ('R', -1)):
        foot = head('foot.' + s_); knee = head('shin.' + s_)
        ik('thigh.' + s_, 'shin.' + s_, foot, knee + Vector((0.25 * x, -0.2, 0.1)))
    # left hand planted on the ledge between the feet, a little forward
    fl, fr = head('foot.L'), head('foot.R')
    tgt = (fl + fr) * 0.5 + Vector((0.06, -0.24, 0.02 + 0.01 * k_breath))
    ik('upperArm.L', 'forearm.L', tgt, head('upperArm.L') + Vector((0.4, 0.3, 0.0)))
    aim('hand.L', (0.05, -0.55, -0.83))
    # right forearm draped over the right knee, wrist hanging loose
    kn = head('shin.R')
    elbow = kn + Vector((0.02, -0.05, 0.1))
    aim('upperArm.R', elbow - head('upperArm.R'))
    aim('forearm.R', (0.18, -0.6, -0.45 - 0.04 * k_breath))
    aim('hand.R', (0.12, -0.25, -0.96))
    curl('R', ('index', 'middle', 'ring', 'pinky'), 0.35); curl('R', ('thumb',), 0.2)
    curl('L', ('index', 'middle', 'ring', 'pinky'), 0.12)
    # head: tilted, scanning the street below (k_head -1 .. 1 = look left .. right)
    rot('neck', (1, 0, 0), 0.12)
    rot('head', (0, 0, 1), -0.38 * k_head)          # turn
    rot('head', (0, -1, 0), 0.24 * k_head + 0.06)   # signature tilt (roll about the forward axis)
    rot('head', (1, 0, 0), 0.18)                    # look down a bit more


make('perchASM2', [(0.0, lambda: perch(-0.6, 0)), (1.6, lambda: perch(-0.7, 1)), (3.0, lambda: perch(0.5, 0.2)),
                   (4.4, lambda: perch(0.7, 1)), (6.0, lambda: perch(-0.6, 0))], 6.0)


# ============================================================================================ idleASM2
def idle(t):
    use('idle', int(t * FPS) % 120)
    shift = 0.6 + 0.4 * math.sin(t / 6.0 * math.tau)          # weight in the left hip (0.2 .. 1)
    check = smooth((t - 1.4) / 0.5) * (1 - smooth((t - 3.6) / 0.6))   # web-shooter check window
    flick = math.sin(max(0.0, t - 1.9) * math.tau * 1.6) * smooth((t - 1.9) / 0.15) * (1 - smooth((t - 3.0) / 0.3))
    fl, fr = head('foot.L'), head('foot.R')
    move_hips((0.045 * shift, 0.0, -0.025 * shift))
    rot('hips', (0, -1, 0), -0.07 * shift)                      # left hip up, right hip drops
    rot('spine', (0, -1, 0), 0.05 * shift); rot('spine2', (0, -1, 0), 0.03 * shift)
    rot('spine2', (1, 0, 0), -0.06)                             # shoulders a bit rounded (casual)
    # legs: left straight under the hip, right knee loose and out, foot turned out a touch
    ik('thigh.L', 'shin.L', fl, head('shin.L') + Vector((0.05, -0.4, 0)))
    ik('thigh.R', 'shin.R', fr + Vector((-0.02, -0.05, 0.02 * shift)), head('shin.R') + Vector((-0.15, -0.4, 0.05)))
    # head: the curious Garfield tilt, looks at the wrist during the check
    rot('head', (0, -1, 0), 0.16 * (1 - check) + 0.05)
    rot('head', (1, 0, 0), 0.25 * check)
    rot('head', (0, 0, 1), -0.25 * check)
    # left arm loose at the side, slight swing
    aim('upperArm.L', (0.18, 0.02 + 0.03 * math.sin(t * 1.3), -1))
    # right arm: forearm up in front of the chest, wrist cocked back, middle + ring curled (thwip)
    if check > 0.001:
        sh = head('upperArm.R')
        hand = sh + Vector((0.08, -0.32, -0.12))
        cur_h = head('hand.R')
        ik('upperArm.R', 'forearm.R', cur_h.lerp(hand, check), sh + Vector((-0.4, 0.2, -0.3)))
        aim('hand.R', Vector((0.25, -0.35, -0.4)).lerp(Vector((0.1, -0.5, 0.85)), check * (0.75 + 0.25 * flick)))
        curl('R', ('middle', 'ring'), 1.15 * check)
        curl('R', ('index', 'pinky'), -0.15 * check)
        curl('R', ('thumb',), -0.2 * check)


make('idleASM2', [(t, (lambda tt: lambda: idle(tt))(t)) for t in (0, 0.8, 1.4, 1.9, 2.2, 2.5, 2.8, 3.1, 3.6, 4.2, 5.0, 6.0)], 6.0)

# ============================================================================================ landHeroASM2
def land_hero(k_up, k_rise):
    use('perchIdle', 0)
    hip = head('hips')
    move_hips((0 - hip.x, 0.02 - hip.y, 0.42 + 0.22 * k_rise - hip.z))
    rot('spine1', (1, 0, 0), 0.06 * k_up); rot('spine2', (1, 0, 0), 0.1 * k_up)
    # legs: right foot planted ahead, left knee down with the foot behind on its toes
    ik('thigh.R', 'shin.R', (-0.17, -0.26, 0.08), head('thigh.R') + Vector((-0.2, -0.6, 0.1)))
    aim('foot.R', (0.0, -0.75, -0.65))
    ik('thigh.L', 'shin.L', (0.15, 0.40 - 0.08 * k_rise, 0.07 + 0.05 * k_rise), head('thigh.L') + Vector((0.1, -0.5, -0.9)))
    aim('foot.L', (0.0, 0.35, -0.94))
    # right fist on the street ahead, elbow bent out
    ik('upperArm.R', 'forearm.R', (-0.07, -0.46 + 0.05 * k_rise, 0.07 + 0.12 * k_rise), head('upperArm.R') + Vector((-0.45, 0.2, 0.1)))
    aim('hand.R', (0.0, -0.3, -0.95))
    curl('R', ('index', 'middle', 'ring', 'pinky'), 1.2); curl('R', ('thumb',), 0.6)
    # left arm flung back / out / up behind him, open hand
    aim('upperArm.L', Vector((0.75, 0.55, 0.35)).lerp(Vector((0.35, 0.15, -0.9)), k_rise))
    aim('forearm.L', Vector((0.6, 0.7, 0.45)).lerp(Vector((0.2, -0.1, -1.0)), k_rise))
    curl('L', ('index', 'middle', 'ring', 'pinky'), 0.15)
    # head down at impact, then up looking straight ahead
    rot('neck', (1, 0, 0), 0.35 * (1 - k_up) - 0.25 * k_up)
    rot('head', (1, 0, 0), 0.3 * (1 - k_up) - 0.35 * k_up)


make('landHeroASM2', [(0.0, lambda: land_hero(0, 0)), (0.45, lambda: land_hero(0.05, 0)), (0.95, lambda: land_hero(1, 0)),
                      (1.35, lambda: land_hero(1, 0.15)), (1.8, lambda: land_hero(1, 0.5))], 1.8)


# ============================================================================================ tauntASM2
def taunt(t):
    use('fightIdle', int(t * FPS) % max(1, int(bpy.data.actions['fightIdle'].frame_range[1])))
    beck = smooth((t - 0.5) / 0.35) * (1 - smooth((t - 2.0) / 0.35))
    shrug = smooth((t - 2.5) / 0.3) * (1 - smooth((t - 3.6) / 0.4))
    curlK = (0.5 + 0.5 * math.sin((t - 0.8) * math.tau * 1.4)) * beck
    if beck > 0.001:  # right forearm forward, palm up, fingers beckon
        sh = head('upperArm.R')
        ik('upperArm.R', 'forearm.R', head('hand.R').lerp(sh + Vector((0.02, -0.42, -0.2)), beck), sh + Vector((-0.4, 0.1, -0.4)))
        aim('hand.R', Vector((0.05, -0.95, 0.2)), beck)
        rot_local('hand.R', 1, 1.4 * beck)            # roll the palm up
        curl('R', ('index', 'middle', 'ring', 'pinky'), 1.25 * curlK)
    if shrug > 0.001:  # shoulders up, forearms out, palms up, head tilts
        for s_, x in (('L', 1), ('R', -1)):
            rot('shoulder.' + s_, (0, 1, 0), -x * 0.22 * shrug)
            aim('forearm.' + s_, Vector((0.55 * x, -0.65, 0.05)), shrug * 0.85)
            rot_local('hand.' + s_, 1, -x * 1.0 * shrug)
            curl(s_, ('index', 'middle', 'ring', 'pinky'), -0.1 * shrug)
    rot('head', (0, -1, 0), 0.22 * shrug + 0.08 * beck)
    rot('head', (1, 0, 0), -0.08 * shrug)


make('tauntASM2', [(t, (lambda tt: lambda: taunt(tt))(t)) for t in (0, 0.5, 0.85, 1.1, 1.35, 1.6, 2.0, 2.5, 2.85, 3.3, 3.7, 4.0, 4.5)], 4.5)


# ============================================================================================ zipPoseASM2
def zip_pose(k):
    use('perchIdle', 0)
    if k <= 0.001: return
    rot('spine2', (0, 0, 1), -0.25 * k); rot('spine2', (1, 0, 0), 0.12 * k)  # chest opens toward the arm, lifts
    aim('upperArm.R', Vector((-0.62, -0.55, 0.56)), k)                      # arm thrown up / out / forward
    aim('forearm.R', Vector((-0.62, -0.58, 0.53)), k)
    aim('hand.R', Vector((-0.35, -0.2, 0.92)), k)                           # wrist cocked back (web-shooter)
    curl('R', ('middle', 'ring'), 1.3 * k); curl('R', ('index', 'pinky'), -0.2 * k); curl('R', ('thumb',), -0.25 * k)
    rot('head', (0, 0, 1), -0.45 * k); rot('head', (1, 0, 0), -0.2 * k)    # looks along the arm


make('zipPoseASM2', [(0.0, lambda: zip_pose(0.3)), (0.25, lambda: zip_pose(1.0)), (0.95, lambda: zip_pose(1.0)), (1.6, lambda: zip_pose(0.0))], 1.6)

# ============================================================================================ export
KEEP = ('perchASM2', 'idleASM2', 'landHeroASM2', 'tauntASM2', 'zipPoseASM2')
for a in list(bpy.data.actions):
    if a.name not in KEEP: bpy.data.actions.remove(a)
arm.animation_data_create()
for tr in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(tr)
arm.animation_data.action = None
for a in bpy.data.actions:
    tr = arm.animation_data.nla_tracks.new(); tr.name = a.name
    st = tr.strips.new(a.name, int(a.frame_range[0]), a)
    try: st.action_slot = a.slots[0]   # Blender 5 layered actions: an NLA strip without a slot evaluates to nothing
    except Exception as e: print('[author] slot', e)
    nk = sum(len(fc.keyframe_points) for lay in getattr(a, 'layers', []) for strip in lay.strips for cb in strip.channelbags for fc in cb.fcurves) if hasattr(a, 'layers') else sum(len(fc.keyframe_points) for fc in a.fcurves)
    print('[author] action', a.name, 'keys', nk, 'range', tuple(a.frame_range), flush=True)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True)
bpy.ops.export_scene.gltf(filepath=opt['out'], export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_skins=False, export_materials='NONE', export_yup=True,
                          export_force_sampling=True, export_optimize_animation_size=False)
print('[author] wrote', opt['out'], flush=True)
