"""Fit a Meshy prop GLB for the game in Blender (headless): join, turn, decimate, size and seat it, shrink its textures and
export a GLB (+Y up, the front facing +Z, centred on x/z, the bottom at y=0, sizes in metres). Optionally renders a check
image from the front and a three-quarter view.

  blender -b --factory-startup --python tools/prop_fit.py -- in.glb out.glb W,H,D [mode] [yaw] [tris] [tex] [check]

  W,H,D  target size in metres; 0 leaves an axis free (it takes the mean scale of the others)
  mode   uniform (default; the largest size that fits every given axis) or stretch (each given axis exactly)
  yaw    degrees to turn it about the vertical before fitting (when the model's front isn't the image's front)
  tris   triangle budget (default 6000)
  tex    largest texture side (default 1024)
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
CHECK = a[7] if len(a) > 7 else None

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

# Decimate to the budget (collapse keeps the UVs); Meshy's unremeshed output is a few hundred thousand triangles.
me = mesh.data
tris0 = sum(len(p.vertices) - 2 for p in me.polygons)
if tris0 > TRIS:
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
size = [round(ext[0] * s[0], 3), round(ext[2] * s[2], 3), round(ext[1] * s[1], 3)]

# Smooth normals that keep the hard edges Meshy baked in.
for p in mesh.data.polygons:
    p.use_smooth = True
# The top surface at the middle (a table's felt): the first hit straight down through the centre.
bpy.context.view_layer.update()
# A few rays near the centre, the highest wins (a tufted seat can have a hole right at its button).
r = 0.06 * min(size[0], size[2]); hits = []
for dx, dy in ((0, 0), (r, 0), (-r, 0), (0, r), (0, -r)):
    hit, loc, *_ = mesh.ray_cast(Vector((dx, dy, size[1] + 1)), Vector((0, 0, -1)))
    if hit:
        hits.append(loc.z)
top = round(max(hits), 4) if hits else None

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
