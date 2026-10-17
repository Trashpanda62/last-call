"""Fit a Meshy prop GLB for the game in Blender (headless): join, turn, decimate, size and seat it, shrink its textures and
export a GLB (+Y up, the front facing +Z, centred on x/z, the bottom at y=0, sizes in metres). Optionally renders a check
image from the front and a three-quarter view.

  blender -b --factory-startup --python tools/prop_fit.py -- in.glb out.glb W,H,D [mode] [yaw] [tris] [tex] [check]

  W,H,D  target size in metres; 0 leaves an axis free (it takes the mean scale of the others)
  mode   uniform (default; the largest size that fits every given axis) or stretch (each given axis exactly)
  yaw    degrees to turn it about the vertical before fitting (when the model's front isn't the image's front)
  tris   triangle budget (default 6000)
  tex    largest texture side (default 1024)
  check  path prefix for the check renders and depth grid (or -)
  bake   'bake': decimate a copy and bake the full model's colour onto fresh UVs (for dense meshes whose UV islands
         tear when collapsed, like Hunyuan's); the result has one material, its colour map and a soft roughness
  upright 'upright': tip it about x and y so its widest flat rim sits at the bottom (a hat that came out on its side),
         or 'tilt=RX,RY' to tip it by those degrees
"""
import bpy, sys, math, json
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
src, dst = a[0], a[1]
W, H, D = (float(v) for v in a[2].split(','))
MODE = a[3] if len(a) > 3 else 'uniform'
YAW = float(a[4]) if len(a) > 4 else 0.0
TRIS = int(a[5]) if len(a) > 5 else 6000
TEX = int(a[6]) if len(a) > 6 else 1024
CHECK = a[7] if len(a) > 7 and a[7] != '-' else None
BAKE = len(a) > 8 and a[8] == 'bake'
UPRIGHT = len(a) > 9 and a[9] == 'upright'
TILT = [float(v) for v in a[9][5:].split(',')] if len(a) > 9 and a[9].startswith('tilt=') else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.parent = None; o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
mesh = bpy.context.view_layer.objects.active
mesh.rotation_euler[2] += math.radians(YAW)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if UPRIGHT:
    # Score a tilt by the area of the hull of the points in its bottom 4%: a rim lying flat makes the biggest one.
    from mathutils import geometry
    pts = [v.co.copy() for v in mesh.data.vertices][::max(1, len(mesh.data.vertices) // 20000)]
    def score(rx, ry):
        R = Matrix.Rotation(math.radians(ry), 3, 'Y') @ Matrix.Rotation(math.radians(rx), 3, 'X')
        q = [R @ p for p in pts]; z0 = min(p.z for p in q); h = max(p.z for p in q) - z0
        low = [(p.x, p.y) for p in q if p.z < z0 + 0.04 * h]
        if len(low) < 3:
            return 0
        hull = [low[i] for i in geometry.convex_hull_2d(low)]
        return abs(sum(hull[i][0] * hull[i - 1][1] - hull[i - 1][0] * hull[i][1] for i in range(len(hull)))) / 2
    best = max(((score(rx, ry), rx, ry) for rx in range(-90, 91, 10) for ry in range(-90, 91, 10)))
    best = max(((score(rx, ry), rx, ry) for rx in range(best[1] - 8, best[1] + 9, 2) for ry in range(best[2] - 8, best[2] + 9, 2)))
    print('UPRIGHT', best[1], best[2])
    TILT = best[1:]
if TILT:
    mesh.matrix_world = Matrix.Rotation(math.radians(TILT[1]), 4, 'Y') @ Matrix.Rotation(math.radians(TILT[0]), 4, 'X')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
high = None
if BAKE:  # the full-detail copy to bake from
    high = mesh.copy(); high.data = mesh.data.copy(); bpy.context.collection.objects.link(high)

# Decimate to the budget (collapse keeps the UVs); Meshy's unremeshed output is a few hundred thousand triangles.
me = mesh.data
tris0 = sum(len(p.vertices) - 2 for p in me.polygons)
if tris0 > TRIS:
    # Meshy splits vertices along UV seams; collapsed apart, those edges tear open (cracked rails). Weld them first.
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(me); bm.free()
    mod = mesh.modifiers.new('dec', 'DECIMATE'); mod.ratio = TRIS / tris0; mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
tris1 = sum(len(p.vertices) - 2 for p in mesh.data.polygons)

# Size and seat. Blender is Z up and the front faces -Y: W is x, D is y, H is z.
vs = [v.co for v in mesh.data.vertices]
lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
ext = hi - lo
want = (W, D, H)
given = [(want[i] / ext[i]) for i in range(3) if want[i] > 0]
if MODE == 'stretch':
    mean = sum(given) / len(given)
    s = [want[i] / ext[i] if want[i] > 0 else mean for i in range(3)]
else:
    k = min(given); s = [k, k, k]
c = (lo + hi) / 2
for v in mesh.data.vertices:
    v.co = Vector(((v.co.x - c.x) * s[0], (v.co.y - c.y) * s[1], (v.co.z - lo.z) * s[2]))
mesh.data.update()
if high:
    for v in high.data.vertices:
        v.co = Vector(((v.co.x - c.x) * s[0], (v.co.y - c.y) * s[1], (v.co.z - lo.z) * s[2]))
    high.data.update()
size = [round(ext[0] * s[0], 3), round(ext[2] * s[2], 3), round(ext[1] * s[1], 3)]

# Smooth by angle, flat parts weighted flat. The seam weld above also welds the hard edges Meshy split, and the
# decimation rounds each bevel into a sliver or two, so plain smooth shading averaged every corner of a flat panel with
# its edges (light streaks and gradients across the sink doors, slot screens, the bar front). Edges sharper than SHARP
# degrees stay hard (the glTF export splits them) and every other corner takes its faces' normals weighted by area, so
# a big flat panel keeps its own normal and the curved parts stay smooth. 2026-10-15: 35 was the widest angle that kept
# the sink doors clean; 45 and up let a diagonal streak back in, 30 only adds vertices.
SHARP = 35
for p in mesh.data.polygons:
    p.use_smooth = True
mesh.data.set_sharp_from_angle(angle=math.radians(SHARP))
bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True); bpy.context.view_layer.objects.active = mesh
wn = mesh.modifiers.new('wn', 'WEIGHTED_NORMAL'); wn.mode = 'FACE_AREA'; wn.keep_sharp = True
bpy.ops.object.modifier_apply(modifier='wn')
# The top surface at the middle (a table's felt): the first hit straight down through the centre.
bpy.context.view_layer.update()
# A few rays near the centre, the highest wins (a tufted seat can have a hole right at its button).
r = 0.06 * min(size[0], size[2]); hits = []
for dx, dy in ((0, 0), (r, 0), (-r, 0), (0, r), (0, -r)):
    hit, loc, *_ = mesh.ray_cast(Vector((dx, dy, size[1] + 1)), Vector((0, 0, -1)))
    if hit:
        hits.append(loc.z)
top = round(max(hits), 4) if hits else None

if high:
    me = mesh.data
    for p in high.data.polygons:
        p.use_smooth = True
    for uv in list(me.uv_layers):
        me.uv_layers.remove(uv)
    me.uv_layers.new(name='UVMap')
    bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True); bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01); bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('baked', TEX, TEX)
    mat = bpy.data.materials.new('baked'); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']; tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
    nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.85
    bsdf.inputs['Metallic'].default_value = 0.0; nt.nodes.active = tn
    me.materials.clear(); me.materials.append(mat)
    for p in me.polygons:
        p.material_index = 0
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 4
    high.select_set(True); mesh.select_set(True); bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True,
                        cage_extrusion=0.02 * max(size), max_ray_distance=0.1 * max(size), margin=8)
    img.pack()
    bpy.data.objects.remove(high, do_unlink=True)

for im in bpy.data.images:
    if im.size[0] > TEX:
        n = TEX // 2 if 'normal' in im.name.lower() else TEX
        im.scale(n, n)

if CHECK:
    # A front depth grid (128 x 128 over the front render's square): where a ray from the viewer first hits, +z toward
    # the viewer, null where it misses. tools/prop_anchors.py reads it to seat screens on recessed panels.
    S = max(size) * 1.25; G = 128; grid = []
    for j in range(G):
        row = []
        for i in range(G):
            x = ((i + 0.5) / G - 0.5) * S; z = size[1] / 2 + (0.5 - (j + 0.5) / G) * S
            hit, loc, *_ = mesh.ray_cast(Vector((x, -50, z)), Vector((0, 1, 0)))
            row.append(round(-loc.y, 4) if hit else None)
        grid.append(row)
    with open(f'{CHECK}-depth.json', 'w') as f:
        json.dump({'S': S, 'h': size[1], 'grid': grid}, f)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    sc.render.resolution_x = 512; sc.render.resolution_y = 512
    sc.render.film_transparent = True; sc.render.image_settings.color_mode = 'RGBA'  # alpha marks the model (anchor finding)
    cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
    cam_d.type = 'ORTHO'; cam_d.ortho_scale = max(size) * 1.25
    mid = Vector((0, 0, size[1] / 2))
    for view, yaw, el in (('front', 0, 0), ('quarter', 40, 0.35), ('side', 90, 0)):  # front and side are straight ortho (anchors)
        d = Vector((math.sin(math.radians(yaw)), -math.cos(math.radians(yaw)), el)).normalized() * 10
        cam.location = mid + d
        cam.rotation_euler = (mid - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{CHECK}-{view}.png'
        bpy.ops.render.render(write_still=True)

mesh['prop'] = json.dumps({'size': size, 'top': top})
bpy.ops.object.select_all(action='SELECT')
kw = dict(filepath=dst, export_format='GLB', use_selection=True, export_yup=True, export_extras=True, export_image_format='WEBP')
try:
    bpy.ops.export_scene.gltf(**kw, export_image_quality=80)
except TypeError:
    bpy.ops.export_scene.gltf(**kw)
print('FIT', dst, tris0, '->', tris1, 'tris; size', size, 'top', top)
