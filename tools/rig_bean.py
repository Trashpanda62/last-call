"""Rig a Sorceress/Meshy bean GLB in Blender (headless): finds the arms and legs from the mesh, builds a Mixamo-named
skeleton (Hips, Spine, Spine1, Head, Left/RightArm, ForeArm, Hand, Left/RightUpLeg, Leg, Foot), skins it with smooth
region weights, and exports a skinned GLB (+Y up, facing +Z, feet on y=0, height in metres). Optionally renders a check
sheet with a few test poses.

  blender -b --factory-startup --python tools/rig_bean.py -- in.glb out.glb [height_m] [check.png]
"""
import bpy, sys, math, json
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
src, dst = args[0], args[1]
HEIGHT = float(args[2]) if len(args) > 2 else 1.2
CHECK = args[3] if len(args) > 3 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
for o in list(bpy.data.objects):
    if o is not mesh:
        bpy.data.objects.remove(o, do_unlink=True)
mesh.parent = None

# Normalise: bake transforms, feet on z=0, scaled to HEIGHT, centred in x/y. Blender is Z up; the front faces -Y.
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = mesh.data
vs = [v.co for v in me.vertices]
zmin = min(v.z for v in vs); zmax = max(v.z for v in vs)
s = HEIGHT / (zmax - zmin)
cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2
for v in me.vertices:
    v.co = Vector(((v.co.x - cx) * s, v.co.y * s, (v.co.z - zmin) * s))
vs = [v.co.copy() for v in me.vertices]
H = HEIGHT


def slices(pred, key, n, lo, hi):
    out = []
    for k in range(n):
        a = lo + (hi - lo) * k / n; b = a + (hi - lo) / n
        sl = [v for v in vs if pred(v) and a <= key(v) < b]
        if sl:
            out.append((a, b, sl))
    return out


# The body's half-width at each height: the narrowest slices above the legs and away from the arms give the trunk.
# Arms: everything far out in x. Find where they leave the body: the half-width jumps.
prof = []
for a, b, sl in slices(lambda v: True, lambda v: v.z, 40, 0, H):
    prof.append(((a + b) / 2, max(abs(v.x) for v in sl), min(v.y for v in sl), max(v.y for v in sl)))
trunk = sorted(w for z, w, *_ in prof if z > 0.6 * H)[len([1 for z, *_ in prof if z > 0.6 * H]) // 2]  # median half-width of the upper body
arm_z = [z for z, w, *_ in prof if w > trunk * 1.35]
arm_lo, arm_hi = min(arm_z), max(arm_z)
# legs: below the body, where the slice splits into two (a gap at x=0)
leg_top = None
for z, w, *_ in sorted(prof):
    sl = [v for v in vs if abs(v.z - z) < H / 80]
    if sl and not any(abs(v.x) < 0.02 * H for v in sl):
        leg_top = z
    elif leg_top is not None and z > leg_top:
        break
leg_top = leg_top or 0.25 * H
body_bot = leg_top
print('trunk', round(trunk, 3), 'arms', round(arm_lo, 3), round(arm_hi, 3), 'legs top', round(leg_top, 3))


def centreline(side):
    """Arm centre points from the shoulder out to the hand tip, for side +1 (character's left, +X) or -1."""
    pts = []
    for a, b, sl in slices(lambda v: v.x * side > trunk * 1.02 and v.z > body_bot, lambda v: v.x * side, 14, trunk * 1.02, max(v.x * side for v in vs) + 1e-4):
        c = sum((v for v in sl), Vector()) / len(sl)
        pts.append(c)
    return pts


def leg_line(side):
    pts = []
    for a, b, sl in slices(lambda v: v.x * side > 0 and v.z < leg_top + 0.02 * H, lambda v: v.z, 10, 0, leg_top + 0.02 * H):
        pts.append(sum((v for v in sl), Vector()) / len(sl))
    return pts


arm = {s: centreline(s) for s in (1, -1)}
leg = {s: leg_line(s) for s in (1, -1)}

# Skeleton
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
rig = bpy.context.object; rig.name = 'Bean'; arm_data = rig.data; arm_data.name = 'BeanRig'
eb = arm_data.edit_bones
eb.remove(eb[0])


def bone(name, head, tail, parent=None, roll=0):
    b = eb.new(name); b.head = head; b.tail = tail; b.roll = roll
    if parent:
        b.parent = eb[parent]; b.use_connect = False
    return b


top = H
hip_z = leg_top + 0.06 * H
bone('Hips', (0, 0, hip_z), (0, 0, hip_z + 0.12 * H))
bone('Spine', (0, 0, hip_z + 0.12 * H), (0, 0, arm_hi - 0.08 * H), 'Hips')
bone('Spine1', (0, 0, arm_hi - 0.08 * H), (0, 0, arm_hi + 0.06 * H), 'Spine')
bone('Head', (0, 0, arm_hi + 0.06 * H), (0, 0, top), 'Spine1')
for sd, side in ((1, 'Left'), (-1, 'Right')):
    p = arm[sd]
    tip = p[-1]
    root = Vector((sd * trunk * 0.75, p[0].y, p[0].z + 0.02 * H))
    n = len(p)
    elbow = p[int(n * 0.45)]
    wrist = p[int(n * 0.72)]
    tipx = Vector((sd * max(v.x * sd for v in vs), wrist.y, tip.z - (wrist.z - tip.z) * 0.3))
    bone(f'{side}Arm', root, elbow, 'Spine1')
    bone(f'{side}ForeArm', elbow, wrist, f'{side}Arm')
    bone(f'{side}Hand', wrist, tipx, f'{side}ForeArm')
    q = leg[sd]
    hip = Vector((q[-1].x, q[-1].y * 0.3, hip_z))
    knee = Vector((q[len(q) // 2].x, q[len(q) // 2].y * 0.3, q[len(q) // 2].z))
    ankle = Vector((q[1].x if len(q) > 1 else q[0].x, 0, 0.06 * H))
    feet = [v for v in vs if v.z < 0.08 * H and v.x * sd > 0]
    toe = Vector((ankle.x, min(v.y for v in feet), 0.02 * H))
    bone(f'{side}UpLeg', hip, knee, 'Hips')
    bone(f'{side}Leg', knee, ankle, f'{side}UpLeg')
    bone(f'{side}Foot', ankle, toe, f'{side}Leg')
bpy.ops.object.mode_set(mode='OBJECT')

# Weights: region by region with soft borders, normalised.
names = [b.name for b in arm_data.bones]
groups = {n: mesh.vertex_groups.new(name=n) for n in names}
B = {b.name: (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in arm_data.bones}


def seg_t(p, a, b):
    ab = b - a
    return max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))


def smooth(x, a, b):  # 0 below a, 1 above b
    if x <= a: return 0.0
    if x >= b: return 1.0
    t = (x - a) / (b - a); return t * t * (3 - 2 * t)


for v in me.vertices:
    p = v.co
    w = {}
    sd = 1 if p.x >= 0 else -1; side = 'Left' if sd > 0 else 'Right'
    # arm share: how far out of the trunk this vertex sits, only at arm height
    out = abs(p.x) - trunk
    armness = smooth(out, -0.02 * H, 0.05 * H) * (1 - smooth(arm_lo - p.z, 0.0, 0.05 * H)) * (1 - smooth(p.z - arm_hi, 0.0, 0.04 * H))
    legness = smooth(leg_top + 0.03 * H - p.z, 0.0, 0.06 * H)
    trunkw = max(0.0, 1 - armness - legness)
    if armness > 0:
        a0, a1 = B[f'{side}Arm']; f0, f1 = B[f'{side}ForeArm']; h0, h1 = B[f'{side}Hand']
        d_arm = (p - (a0 + (a1 - a0) * seg_t(p, a0, a1))).length
        d_fore = (p - (f0 + (f1 - f0) * seg_t(p, f0, f1))).length
        d_hand = (p - (h0 + (h1 - h0) * seg_t(p, h0, h1))).length
        inv = [1 / (d + 0.01 * H) ** 4 for d in (d_arm, d_fore, d_hand)]
        tot = sum(inv)
        for n, x in zip(('Arm', 'ForeArm', 'Hand'), inv):
            w[f'{side}{n}'] = w.get(f'{side}{n}', 0) + armness * x / tot
    if legness > 0:
        u0, u1 = B[f'{side}UpLeg']; l0, l1 = B[f'{side}Leg']; f0, f1 = B[f'{side}Foot']
        if p.z < 0.09 * H:
            parts = {'Foot': 0.75, 'Leg': 0.25} if p.z < 0.05 * H else {'Leg': 0.6, 'Foot': 0.4}
        else:
            k = smooth(p.z, l0.z - 0.04 * H, l0.z + 0.04 * H)  # above the knee: UpLeg
            parts = {'UpLeg': k, 'Leg': 1 - k}
        for n, x in parts.items():
            w[f'{side}{n}'] = w.get(f'{side}{n}', 0) + legness * x
    if trunkw > 0:
        z = p.z
        hz, sz, s1z, hdz = B['Hips'][0].z, B['Spine'][0].z, B['Spine1'][0].z, B['Head'][0].z
        bands = [('Hips', hz - 1, sz), ('Spine', sz, s1z), ('Spine1', s1z, hdz), ('Head', hdz, H + 1)]
        tw = {}
        for n, a, b in bands:
            # tent weights with 0.05 H soft edges
            tw[n] = smooth(z, a - 0.05 * H, a + 0.05 * H) * (1 - smooth(z, b - 0.05 * H, b + 0.05 * H))
        tot = sum(tw.values()) or 1
        for n, x in tw.items():
            if x > 0: w[n] = w.get(n, 0) + trunkw * x / tot
    tot = sum(w.values()) or 1
    for n, x in w.items():
        if x / tot > 0.002:
            groups[n].add([v.index], x / tot, 'REPLACE')

mesh.parent = rig
mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = rig

if CHECK:
    # Render a sheet: rest, arms up + step, sit, cheer. Workbench with textures, headless.
    import os
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    sc.render.resolution_x = 512; sc.render.resolution_y = 512
    cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
    cam_d.type = 'ORTHO'; cam_d.ortho_scale = H * 1.4
    poses = {
        'rest': {},
        'wave': {'LeftArm': (0, 0, 70), 'LeftForeArm': (0, 0, 50), 'RightUpLeg': (-35, 0, 0), 'RightLeg': (50, 0, 0)},
        'sit': {'LeftUpLeg': (-85, 0, 0), 'RightUpLeg': (-85, 0, 0), 'LeftLeg': (85, 0, 0), 'RightLeg': (85, 0, 0), 'Spine': (8, 0, 0)},
        'cheer': {'LeftArm': (0, 0, 100), 'RightArm': (0, 0, -100), 'Head': (0, 0, 15), 'Spine1': (-10, 0, 0)},
        'reach': {'LeftArm': (70, 0, 0), 'RightArm': (70, 0, 0), 'Spine1': (15, 0, 0)},
    }
    pb = rig.pose.bones
    for name, pose in poses.items():
        for b in pb:
            b.rotation_mode = 'XYZ'; b.rotation_euler = (0, 0, 0)
        for n, (x, y, z) in pose.items():
            pb[n].rotation_euler = (math.radians(x), math.radians(y), math.radians(z))
        for view, loc, rot in (('front', (0, -6, H / 2), (math.radians(90), 0, 0)), ('side', (6, 0, H / 2), (math.radians(90), 0, math.radians(90)))):
            cam.location = loc; cam.rotation_euler = rot
            sc.render.filepath = f'{CHECK}-{name}-{view}.png'
            bpy.ops.render.render(write_still=True)

for b in rig.pose.bones:
    b.rotation_euler = (0, 0, 0)
# Phones: a 1024 px base colour as JPEG. The hat sits on the crown: record its height and width for the game (glTF extras).
for im in bpy.data.images:
    if im.size[0] > 1024:
        im.scale(1024, 1024)
crown = [v for v in vs if v.z > H * 0.9]
rig['bean'] = json.dumps({'height': round(H, 4), 'crownR': round(max(math.hypot(v.x, v.y) for v in crown), 4),
                          'trunkR': round(trunk, 4), 'legTop': round(leg_top, 4)})
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_skins=True, export_animations=False, export_yup=True,
                          export_extras=True, export_image_format='JPEG', export_jpeg_quality=85)
print('RIGGED', dst, len(me.vertices), 'verts', len(names), 'bones')
