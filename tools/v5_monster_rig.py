"""Blackout monster: retarget the Sorceress hy-motion clips (SMPL joint positions, runs/sorceress/v5-monster/anim-*) onto
the Sorceress auto-rig (runs/sorceress/v5-monster/rig) in Blender, headless, and export assets/monster/monster.glb with
the clips idle, walk, run, roar and kill baked in (+Y up, facing +Z, feet on y=0, HEIGHT metres tall).

Retarget: each bone turns so it points where its SMPL joint pair points (as src/3d/plush.js does for the beans); the hips
follow the pelvis frame. The clips carry no root translation, so the hips are lowered/raised every frame to keep the
lowest foot on the floor. Walk, run and idle are cut to their best loop and the seam residual spread over the loop.
Optionally renders a check sheet of every clip (front and side, with a bean-sized box 0.7 m in front).

  blender -b --factory-startup --python tools/v5_monster_rig.py -- [out.glb] [check_dir]

MONSTER_RUN=v6 builds the mutated potato monster instead (tools/v6_monster.py): its own rig and eyes, the v5 idle, walk,
run and roar motion, and its leap and stab takes (the shipped ones named in runs/sorceress/v6-monster/ship.json). A leap
keeps its airborne height (the SMPL feet leaving the floor) instead of being pinned to the floor.
"""
import bpy, sys, json, glob, math, os
from mathutils import Vector, Matrix, Quaternion

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V6 = os.environ.get('MONSTER_RUN') == 'v6'
V5RUNS = os.path.join(ROOT, 'runs', 'sorceress', 'v5-monster')
RUNS = os.path.join(ROOT, 'runs', 'sorceress', 'v6-monster' if V6 else 'v5-monster')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else os.path.join(ROOT, 'assets', 'monster', 'monster.glb')
CHECK = args[1] if len(args) > 1 else None
HEIGHT = 2.8
EYES = [('eyeBig', 0.061, 1.473, 0.04), ('eyeSmall', 0.237, 1.461, 0.03)]  # name, x, z, radius (rig scale)
if V6:  # the potato's biggest eyes, read off a front render of the rest pose (MONSTER_EYES: a JSON list overrides)
    HEIGHT = float(os.environ.get('MONSTER_HEIGHT', '2.6'))
    EYES = [tuple(e) for e in json.loads(os.environ.get('MONSTER_EYES', 'null'))] if os.environ.get('MONSTER_EYES') else [
        ('eyeBig', 0.103, 1.244, 0.038), ('eyeBig2', -0.141, 1.185, 0.035), ('eye3', 0.19, 1.182, 0.027), ('eye4', -0.089, 1.266, 0.027),
        ('eye5', -0.216, 1.231, 0.023), ('eye6', 0.276, 1.101, 0.021), ('eye7', 0.189, 1.274, 0.019), ('eye8', -0.233, 1.121, 0.018)]
TEX = 1024

# rig bone: (from joint, to joint, weight). SMPL joints: 0 pelvis, 1/2 hips L/R, 3/6/9 spine, 4/5 knees, 7/8 ankles,
# 10/11 toes, 12 neck, 13/14 collars, 15 head, 16/17 shoulders, 18/19 elbows, 20/21 wrists. Left +X, front +Z, up +Y.
# The spine weights are below 1 so the monster keeps some of its modelled hunch.
AIM = [('Spine02', 3, 6, 0.6), ('Spine01', 6, 9, 0.6), ('Spine', 9, 12, 0.6), ('neck', 12, 15, 0.5), ('Head', 12, 15, 0.5),
       ('LeftShoulder', 13, 16, 0.7), ('LeftArm', 16, 18, 1), ('LeftForeArm', 18, 20, 1),
       ('RightShoulder', 14, 17, 0.7), ('RightArm', 17, 19, 1), ('RightForeArm', 19, 21, 1),
       ('LeftUpLeg', 1, 4, 1), ('LeftLeg', 4, 7, 1), ('LeftFoot', 7, 10, 0.7),
       ('RightUpLeg', 2, 5, 1), ('RightLeg', 5, 8, 1), ('RightFoot', 8, 11, 0.7)]
CHILD = {'Spine02': 'Spine01', 'Spine01': 'Spine', 'Spine': 'neck', 'neck': 'Head', 'Head': 'head_end',
         'LeftShoulder': 'LeftArm', 'LeftArm': 'LeftForeArm', 'LeftForeArm': 'LeftHand',
         'RightShoulder': 'RightArm', 'RightArm': 'RightForeArm', 'RightForeArm': 'RightHand',
         'LeftUpLeg': 'LeftLeg', 'LeftLeg': 'LeftFoot', 'LeftFoot': 'LeftToeBase',
         'RightUpLeg': 'RightLeg', 'RightLeg': 'RightFoot', 'RightFoot': 'RightToeBase'}
# name: (loop, min loop seconds, face by: 'mean' heading or 'start')
CLIPS = {'idle': (True, 2.5, 'mean'), 'walk': (True, 0.9, 'mean'), 'run': (True, 0.5, 'mean'),
         'roar': (False, 0, 'start'), 'kill': (False, 0, 'start'), 'kill2': (False, 0, 'start'), 'kill3': (False, 0, 'start')}
KILL = {'kill2': 'kill', 'kill': 'slam'}  # takes that ship, as: kill2 lunges and mauls at bean height; the first take grabs low and slams (kept as 'slam'); kill3 falls over
if V6:
    CLIPS = {'idle': (True, 2.5, 'mean'), 'walk': (True, 0.9, 'mean'), 'run': (True, 0.5, 'mean'), 'roar': (False, 0, 'start'),
             'leap': (False, 0, 'start'), 'leap2': (False, 0, 'start'), 'stab': (False, 0, 'start'), 'stab2': (False, 0, 'start')}
    _ship = os.path.join(RUNS, 'ship.json')
    SHIP = {v.replace('anim-', ''): k for k, v in json.load(open(_ship, encoding='utf-8')).items()} if os.path.isfile(_ship) else {'leap': 'leap', 'stab': 'stab'}
    KILL = SHIP  # take: shipped name


def load(name):
    f = (glob.glob(os.path.join(RUNS, f'anim-{name}', 'assets', '*.json')) or glob.glob(os.path.join(V5RUNS, f'anim-{name}', 'assets', '*.json')))[0]
    a = json.load(open(f, encoding='utf-8'))
    return a['fps'], [[Vector(j) for j in fr] for fr in a['smpl_joints']]


# A leap's flight: the SMPL clips are pinned at the pelvis (no root motion), so when the feet leave the floor is read off
# the check renders by eye: (first frame up, last frame up, top height in metres at the monster's size), an arc between.
AIR = {'leap': (12, 25, 0.9), 'leap2': (6, 22, 0.8)}


def air_of(name, n):
    a, b, h = AIR[name]
    return [h * math.sin(math.pi * (f - a) / (b - a)) if a <= f <= b else 0 for f in range(n)]


def heading(fr):  # yaw from +Z of the pelvis's forward, cross(hip axis, up)
    x = fr[1] - fr[2]
    return math.atan2(-x.z, x.x)


def prep(name):
    fps, J = load(name)
    loop, minsec, face = CLIPS[name]
    hs = [heading(fr) for fr in J]
    h = math.atan2(sum(math.sin(v) for v in hs), sum(math.cos(v) for v in hs)) if face == 'mean' else hs[0]
    R = Matrix.Rotation(-h, 3, 'Y')
    J = [[R @ (j - fr[0]) for j in fr] for fr in J]  # pelvis-relative, facing +Z
    if loop:
        n = len(J); best = None; mn = max(2, int(minsec * fps))
        for a in range(0, n - mn):
            for b in range(a + mn, n):
                d = sum((J[a][k] - J[b][k]).length_squared for k in range(22))
                score = d - 0.002 * (b - a)  # a little in favour of longer loops
                if best is None or score < best[0]:
                    best = (score, a, b)
        _, a, b = best
        seg = J[a:b + 1]; L = len(seg) - 1
        res = [seg[L][k] - seg[0][k] for k in range(22)]
        J = [[seg[i][k] - res[k] * (i / L) for k in range(22)] for i in range(L)]  # frame L == frame 0, dropped
        print(f'{name}: loop frames {a}-{b} ({L / fps:.2f} s)')
    return fps, J


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glob.glob(os.path.join(RUNS, 'rig180' if V6 else 'rig', 'assets', '*.glb'))[0])  # (v6: the first rig faced away from the face)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    mesh = next(o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm)
    for o in list(bpy.data.objects):
        if o not in (arm, mesh):
            bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    mesh.name = 'monster'; arm.name = 'MonsterRig'
    # the button eyes (read off a front render of the rest pose, metres at rig scale): empties on the Head bone,
    # placed on the surface by a ray from the front, so the runtime can hang glowing pupils on them
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    for nm, x, z, r in EYES:
        hit, loc, *_ = bpy.context.scene.ray_cast(dg, Vector((x, -5, z)), Vector((0, 1, 0)))
        if not hit:
            print('eye ray missed', nm); continue
        e = bpy.data.objects.new(nm, None); bpy.context.scene.collection.objects.link(e)
        e.empty_display_size = r
        e.parent = arm; e.parent_type = 'BONE'; e.parent_bone = 'Head'
        e.matrix_world = Matrix.Translation(loc + Vector((0, -0.006, 0))) @ Matrix.Diagonal((r, r, r, 1))
        print('eye', nm, tuple(round(v, 3) for v in loc))
    # real-world size: the rig is 1.7 m to the head top; the monster stands HEIGHT
    bpy.context.view_layer.update()
    vs = [mesh.matrix_world @ v.co for v in mesh.data.vertices]
    h0 = max(v.z for v in vs) - min(v.z for v in vs)
    k = HEIGHT / h0
    arm.scale = arm.scale * k
    bpy.context.view_layer.update()
    print('mesh height', round(h0, 3), 'scale', round(k, 3))
    for im in bpy.data.images:
        if im.size[0] > TEX:
            im.scale(TEX, TEX)
    # eye anchors for the runtime: the two darkest texels on the head front (button eyes) found later in JS; here store bone data
    pb = arm.pose.bones
    for p in pb:
        p.rotation_mode = 'QUATERNION'
    rest_head = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}
    feet_rest = min(rest_head['LeftToeBase'].z, rest_head['RightToeBase'].z)
    ankle_toe = {s: rest_head[s + 'Foot'].z - rest_head[s + 'ToeBase'].z for s in ('Left', 'Right')}
    leg_m = rest_head['Hips'].z - (rest_head['LeftFoot'].z + rest_head['RightFoot'].z) / 2
    hipsW = (arm.matrix_world @ arm.data.bones['Hips'].matrix_local).to_quaternion()
    C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # SMPL (x left, y up, z front) -> Blender (x, -y front, z up)
    Ci = C.inverted()
    aw = arm.matrix_world; awi = aw.inverted()
    AWQ = aw.to_3x3().normalized().to_quaternion().normalized(); AWQi = AWQ.inverted()  # pure rotations (the armature is scaled)
    info = {}

    def world_head(n):
        return aw @ pb[n].head

    for name in CLIPS:
        fps, J = prep(name)
        act = bpy.data.actions.new(name); act.use_fake_user = True
        arm.animation_data_create(); arm.animation_data.action = act
        bpy.context.scene.render.fps = int(round(fps))
        drops = []; feet = []
        air = air_of(name, len(J)) if name in AIR and V6 else None
        for f, fr in enumerate(J):
            for p in pb:
                p.rotation_quaternion = Quaternion(); p.location = Vector(); p.scale = Vector((1, 1, 1))
            bpy.context.view_layer.update()
            # hips: pelvis frame (across the hips, up the spine) at 70 %
            x = (fr[1] - fr[2]).normalized(); c = fr[3] - fr[0]
            z = x.cross(c).normalized(); y = z.cross(x)
            qs = Matrix((x, y, z)).transposed().to_quaternion()
            qb = (C @ qs.to_matrix() @ Ci).to_quaternion()
            qb = Quaternion().slerp(qb, 0.7)
            target = (qb @ hipsW)
            m = pb['Hips'].matrix.copy(); loc = m.to_translation()
            pb['Hips'].matrix = Matrix.Translation(loc) @ (AWQi @ target).normalized().to_matrix().to_4x4()
            pb['Hips'].scale = Vector((1, 1, 1))
            bpy.context.view_layer.update()
            for n, j0, j1, w in AIM:
                h = world_head(n); cur = (world_head(CHILD[n]) - h).normalized()
                want = (C @ (fr[j1] - fr[j0])).normalized()
                want = cur.lerp(want, w).normalized()
                q = cur.rotation_difference(want)
                hl = pb[n].head.copy()
                rl = (AWQi @ q @ AWQ).normalized().to_matrix().to_4x4()
                pb[n].matrix = Matrix.Translation(hl) @ rl @ Matrix.Translation(-hl) @ pb[n].matrix
                pb[n].scale = Vector((1, 1, 1))
                bpy.context.view_layer.update()
            # feet on the floor: how far the lowest foot is above (or under) where the rest pose's feet were
            low = min(min(world_head(s + 'ToeBase').z, world_head(s + 'Foot').z - ankle_toe[s]) for s in ('Left', 'Right'))
            drops.append(low - feet_rest - (air[f] if air else 0))  # (a leap: up off the floor)
            feet.append([(world_head(s + 'ToeBase').z, world_head(s + 'ToeBase').y) for s in ('Left', 'Right')])
            for p in pb:
                p.keyframe_insert('rotation_quaternion', frame=f + 1)
        # second pass: the hips' vertical offset, smoothed a little, keyed as a location in world z
        sm = [sum(drops[max(0, i - 1):i + 2]) / len(drops[max(0, i - 1):i + 2]) for i in range(len(drops))]
        if CLIPS[name][0]:  # loops: keep the seam
            sm = [(drops[i - 1] + drops[i] + drops[(i + 1) % len(drops)]) / 3 for i in range(len(drops))]
        hb = arm.data.bones['Hips']
        tolocal = hb.matrix_local.to_3x3().inverted() @ awi.to_3x3()  # world offset -> the root bone's pose location
        for f, d in enumerate(sm):
            pb['Hips'].location = tolocal @ Vector((0, 0, -d))
            pb['Hips'].keyframe_insert('location', frame=f + 1)
        # natural ground speed: how fast the planted (lower) foot slides back under the body, metres a second
        vs = []
        for f in range(len(feet) - (0 if CLIPS[name][0] else 1)):
            g = (f + 1) % len(feet); i = 0 if feet[f][0][0] < feet[f][1][0] else 1
            vs.append((feet[g][i][1] - feet[f][i][1]) * fps)
        vs.sort(); speed = vs[len(vs) // 2] if vs else 0
        info[name] = {'speed': round(speed, 3), 'frames': len(J), 'fps': fps, 'len': round((len(J) if CLIPS[name][0] else len(J) - 1) / fps, 3), 'loop': CLIPS[name][0]}
        if air:  # when it leaves the floor and lands, seconds into the clip, and how high it goes
            info[name]['air'] = [round(AIR[name][0] / fps, 3), round(AIR[name][1] / fps, 3), AIR[name][2]]
        print(name, info[name])
    # loops: append frame N+1 = frame 1 so the clip ends where it starts
    for name in CLIPS:
        if not CLIPS[name][0]:
            continue
        act = bpy.data.actions[name]; arm.animation_data.action = act
        n = info[name]['frames']
        bpy.context.scene.frame_set(1)
        for p in pb:
            p.keyframe_insert('rotation_quaternion', frame=n + 1)
            if p.name == 'Hips':
                p.keyframe_insert('location', frame=n + 1)
    if not os.environ.get('MONSTER_ALL'):
        for n in (('leap', 'leap2', 'stab', 'stab2') if V6 else ('kill', 'kill2', 'kill3')):
            if n not in KILL:
                bpy.data.actions.remove(bpy.data.actions[n]); info.pop(n)
        got = {n: info.pop(n) for n in KILL}
        for n in KILL:
            bpy.data.actions[n].name = '_' + KILL[n]
        for n in KILL:
            bpy.data.actions['_' + KILL[n]].name = KILL[n]; info[KILL[n]] = got[n]
    arm.animation_data.action = bpy.data.actions['idle']
    bpy.context.scene.frame_set(1)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS',
                              export_image_format='JPEG', export_jpeg_quality=88, export_yup=True, export_apply=False,
                              export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=True)
    with open(os.path.join(RUNS, 'baked.json'), 'w', encoding='utf-8', newline='') as f:  # clip lengths and speeds (for monster.js)
        json.dump({'height': HEIGHT, 'scale': k, 'leg': leg_m, 'clips': info}, f, indent=1)
    print('wrote', OUT, os.path.getsize(OUT))
    if CHECK:
        render(arm, info)


def render(arm, info):
    os.makedirs(CHECK, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'TEXTURE'
    sc.view_settings.view_transform = 'Standard'
    sc.render.resolution_x = 360; sc.render.resolution_y = 420
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.7 - 0.0, 0.6)); box = bpy.context.object
    box.scale = (0.5, 0.4, 1.2); box.name = 'beanbox'
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 3.6
    views = {'front': ((0.6, -8, 1.5), (math.radians(90), 0, math.radians(4))), 'side': ((8, -0.5, 1.5), (math.radians(90), 0, math.radians(90)))}
    for name, ci in info.items():
        arm.animation_data.action = bpy.data.actions[name]
        n = ci['frames']; picks = [1 + round(i * (n - 1) / 7) for i in range(8)]
        for v, (loc, rot) in views.items():
            cam.location = loc; cam.rotation_euler = rot
            for i, f in enumerate(picks):
                sc.frame_set(f)
                sc.render.filepath = os.path.join(CHECK, f'{name}-{v}-{i}.png')
                bpy.ops.render.render(write_still=True)


main()
