"""Rebake a fitted prop GLB's colour map onto fresh UVs in Blender (headless). Meshy bakes onto its decimated mesh as a
confetti of hundreds of tiny UV islands with no padding, so neighbouring islands bleed into each other, mipmaps smear the
black gaps in, and whole triangles carry the wrong colour where the decimation moved the geometry under the old UVs.
This keeps the mesh exactly (positions, normals, the node's extras.prop, the material settings) and only swaps its UVs
and its colour map:

  1. without a source: each triangle's colour is sampled from the old map; a triangle that agrees with almost none of the
     triangles around it in 3D (a black shard in a cream rail) borrows the UVs of its most typical neighbour, so it takes
     that colour, and every old UV triangle is shrunk toward its middle by under a texel, so the bake never reads a
     neighbouring island
     with a source (the raw Meshy GLB the prop was fitted from): that full-detail model is laid over the prop (its box on
     the prop's box) and baked from instead, which has none of the decimation's colour errors
  2. a copy of the mesh gets Smart UV Project islands, repacked with a gap, and the colour is baked onto it (selected to
     active, diffuse colour, a small cage) with a 16 px padded margin; the gaps take the mean colour (no black in the
     small mipmaps)
  3. optionally a dark-speck cleanup on the baked map (a closing: dark cracks thinner than N px that sit inside lighter
     colour take the colour around them; edges between big areas stay put)

  blender -b --factory-startup --python tools/prop_rebake.py -- in.glb out.glb [tex] [angle] [close] [check] [source] [extras]

  tex     side of the new colour map (default 2048)
  angle   Smart UV Project angle limit in degrees (default 66)
  close   dark-speck cleanup width in px of the new map, 0 for none (default 0)
  check   path prefix for before/after check renders (-before-*.png, -after-*.png), or -
  source  the raw full-detail GLB to bake from, or - to bake from in.glb's own map
  extras  a GLB whose node extras.prop to write instead of in.glb's (a refit that must keep the shipped string), or -

A torn mesh (open seams, holes showing the felt and the dark inside) is not a texture problem: refit it with prop_fit.py
first, stretched to the shipped size, then rebake from the raw model and keep the shipped extras. The dice table
(2026-10-14; its first fit predated prop_fit.py's seam weld):
  blender ... prop_fit.py -- <raw>.glb .dev/props-rebake/diceTable-fit.glb 2.707,1.0,1.662 stretch 0 9000 1024 -
  blender ... prop_rebake.py -- .dev/props-rebake/diceTable-fit.glb assets/props/diceTable.glb 2048 66 0 - <raw>.glb \\
      .dev/props-orig/diceTable.glb
"""
import bpy, bmesh, sys, math, json, struct
import numpy as np
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
arg = lambda i, d=None: a[i] if len(a) > i and a[i] != '-' else d
src, dst = a[0], a[1]
TEX = int(arg(2, 2048))
ANGLE = float(arg(3, 66.0))
CLOSE = int(arg(4, 0))
CHECK = arg(5)
SOURCE = arg(6)
EXTRAS = arg(7)
MARGIN = 16

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
assert len(meshes) == 1, f'expected one mesh, got {len(meshes)}'
prop = meshes[0]
extras = prop.get('prop')
if EXTRAS:  # the node extras straight from the other GLB's JSON chunk, byte for byte
    b = open(EXTRAS, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]
    extras = next(nd['extras']['prop'] for nd in json.loads(b[20:20 + n])['nodes'] if 'prop' in nd.get('extras', {}))
assert extras, 'no extras.prop on the node'
mat = prop.data.materials[0]
tnode = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
old = tnode.image
W, H = old.size
px = np.empty(W * H * 4, np.float32); old.pixels.foreach_get(px); px = px.reshape(H, W, 4)  # row 0 is v = 0
me = prop.data
nf = len(me.polygons)
loops = [list(p.loop_indices) for p in me.polygons]
assert all(len(l) == 3 for l in loops), 'expected triangles'
vs = np.array([v.co[:] for v in me.vertices]); lo, hi = vs.min(0), vs.max(0)
size = float((hi - lo).max())

def check(obj, tag):
    """Workbench texture renders from the front, a three-quarter view above and straight down (as in prop_fit.py)."""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    sc.render.resolution_x = 1024; sc.render.resolution_y = 1024
    sc.render.film_transparent = True; sc.render.image_settings.color_mode = 'RGBA'
    cam = bpy.data.objects.get('cam')
    if not cam:
        cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = size * 1.1
    hide = [o for o in bpy.data.objects if o.type == 'MESH' and o is not obj]
    for o in hide:
        o.hide_render = True
    mid = Vector((lo + hi) / 2)
    for view, yaw, el in (('front', 0, 0.05), ('quarter', 35, 0.6), ('top', 0, 20)):
        d = Vector((math.sin(math.radians(yaw)), -math.cos(math.radians(yaw)), el)).normalized() * 10
        cam.location = mid + d
        cam.rotation_euler = (mid - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{CHECK}-{tag}-{view}.png'
        bpy.ops.render.render(write_still=True)
    for o in hide:
        o.hide_render = False

if CHECK:
    check(prop, 'before')

# 1. The colour each triangle carries in the old map (the median of a few points inside it, nearest texel).
uvl = me.uv_layers.active.data
UV = np.array([[uvl[i].uv[:] for i in l] for l in loops], np.float64)  # (nf, 3, 2)
BARY = np.array([[1/3, 1/3, 1/3], [.6, .2, .2], [.2, .6, .2], [.2, .2, .6], [.45, .45, .1], [.1, .45, .45], [.45, .1, .45]])
pts = np.einsum('kj,fjc->fkc', BARY, UV)
ix = np.clip((pts[..., 0] * W).astype(int), 0, W - 1); iy = np.clip((pts[..., 1] * H).astype(int), 0, H - 1)
col = np.median(px[iy, ix, :3], axis=1)  # (nf, 3)
area = np.array([p.area for p in me.polygons])
outliers = 0
if SOURCE:
    # The raw model, joined, its box laid on the prop's box (prop_fit.py only centred, scaled and seated it).
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SOURCE)
    new = [o for o in bpy.data.objects if o not in before]
    raw = [o for o in new if o.type == 'MESH']
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in raw:
        o.parent = None; o.select_set(True)
    bpy.context.view_layer.objects.active = raw[0]
    if len(raw) > 1:
        bpy.ops.object.join()
    high = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    rv = np.empty(len(high.data.vertices) * 3); high.data.vertices.foreach_get('co', rv); rv = rv.reshape(-1, 3)
    rlo, rhi = rv.min(0), rv.max(0)
    s = (hi - lo) / (rhi - rlo)
    high.data.vertices.foreach_set('co', ((rv - rlo) * s + lo).ravel()); high.data.update()
    print('REBAKE source laid on the prop: scale', np.round(s, 4))
else:
    # Outliers: a triangle that agrees with almost none of the triangles sharing a corner with it (welded across seams).
    key = {}
    vid = [key.setdefault(tuple(round(c, 5) for c in v.co), len(key)) for v in me.vertices]
    vfaces = [[] for _ in range(len(key))]
    fv = [[vid[me.loops[i].vertex_index] for i in l] for l in loops]
    for f, vv in enumerate(fv):
        for v in vv:
            vfaces[v].append(f)
    nbrs = [sorted({g for v in vv for g in vfaces[v]} - {f}) for f, vv in enumerate(fv)]
    T = 0.2
    src_of = np.arange(nf)  # whose UVs each face samples
    for _ in range(2):
        for f in range(nf):
            nb = nbrs[f]
            if len(nb) < 4 or (np.linalg.norm(col[nb] - col[f], axis=1) < T).sum() >= 2:
                continue
            med = np.median(col[nb], axis=0)
            if np.linalg.norm(col[f] - med) < T:
                continue
            g = nb[int(np.argmin(np.linalg.norm(col[nb] - med, axis=1)))]
            src_of[f] = src_of[g]; col[f] = col[g]
    outliers = int((src_of != np.arange(nf)).sum())
    print('REBAKE outlier triangles recoloured:', outliers)
    # Shrink every old UV triangle toward its middle by up to 0.75 texel (never more than a third of the way), then
    # point the outliers at their donor's triangle.
    c = UV.mean(axis=1, keepdims=True)
    r = np.linalg.norm((UV - c) * np.array([W, H], np.float64), axis=2, keepdims=True)
    UVs = (c + (UV - c) * np.clip(1 - 0.75 / np.maximum(r, 1e-6), 0.66, 1.0))[src_of]
    for f, l in enumerate(loops):
        for j, i in enumerate(l):
            uvl[i].uv = UVs[f, j]
    tnode.interpolation = 'Closest'
    high = prop

# 2. The copy with fresh UVs, its material a copy of the old one reading the new map.
low = prop.copy(); low.data = prop.data.copy(); bpy.context.collection.objects.link(low)
lme = low.data
for uv in list(lme.uv_layers):
    lme.uv_layers.remove(uv)
lme.uv_layers.new(name='UVMap')
# The glTF mesh is split along every old seam (hundreds of loose pieces), so unwrap a welded stand-in and copy its UVs
# back corner by corner; the exported mesh itself keeps its vertices and custom normals.
weld = bpy.data.meshes.new('weld'); weld.from_pydata([v.co[:] for v in me.vertices], [], [p.vertices[:] for p in me.polygons])
bm = bmesh.new(); bm.from_mesh(weld); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(weld); bm.free()
assert len(weld.polygons) == nf, 'welding dropped faces'
wob = bpy.data.objects.new('weld', weld); bpy.context.collection.objects.link(wob); weld.uv_layers.new(name='UVMap')
bpy.ops.object.select_all(action='DESELECT'); wob.select_set(True); bpy.context.view_layer.objects.active = wob
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(ANGLE), island_margin=1.5 * MARGIN / TEX)
# Smart UV's own packing leaves much of the square empty; repack tighter with a gap of 1.5 margins (the padding of two
# neighbours meets in the middle).
bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.pack_islands(rotate=True, shape_method='CONCAVE', margin_method='SCALED', margin=1.5 * MARGIN / TEX)
bpy.ops.object.mode_set(mode='OBJECT')
wco = np.array([weld.vertices[weld.loops[i].vertex_index].co[:] for i in range(len(weld.loops))])
lco = np.array([me.vertices[me.loops[i].vertex_index].co[:] for i in range(len(me.loops))])
assert len(wco) == len(lco) and np.abs(wco - lco).max() < 1e-4, 'welded corners do not line up'
uvs = np.empty(len(weld.loops) * 2); weld.uv_layers.active.data.foreach_get('uv', uvs)
lme.uv_layers.active.data.foreach_set('uv', uvs); uvs = uvs.reshape(-1, 2)
assert uvs.min() >= 0 and uvs.max() <= 1, f'new UVs out of the square: {uvs.min(0)} {uvs.max(0)}'
bpy.data.objects.remove(wob, do_unlink=True); bpy.data.meshes.remove(weld)
mean = np.average(col, axis=0, weights=area)
img = bpy.data.images.new(old.name or 'baked', TEX, TEX, alpha=True)
img.generated_color = (*mean, 0.0)
lmat = mat.copy(); lme.materials.clear(); lme.materials.append(lmat)
ln = next(n for n in lmat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
ln.image = img; ln.interpolation = 'Linear'; lmat.node_tree.nodes.active = ln
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
sc.render.bake.margin_type = 'EXTEND'; sc.render.bake.use_clear = False  # keep the mean colour in the gaps
bpy.ops.object.select_all(action='DESELECT'); high.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active = low
links = [(l.from_socket, l.to_socket) for l in lmat.node_tree.links if l.from_node == ln]
for l in [l for l in lmat.node_tree.links if l.from_node == ln]:
    lmat.node_tree.links.remove(l)  # the bake target can't also feed the copy's own shading (a circular bake comes out black)
# The same surface: a hair of cage. The raw model: the decimated surface strays from it by up to a centimetre or two.
cage, reach = (0.002, 0.01) if not SOURCE else (0.008, 0.03)
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True,
                    cage_extrusion=cage * size, max_ray_distance=reach * size, margin=MARGIN)
for fs, ts in links:
    lmat.node_tree.links.new(fs, ts)

# 3. The dark-speck cleanup (a closing per channel, blended in where it lifts the luminance a lot).
out = np.empty(TEX * TEX * 4, np.float32); img.pixels.foreach_get(out); out = out.reshape(TEX, TEX, 4)
cover = out[..., 3] > 0.5
print('REBAKE map coverage (with padding): %.2f' % cover.mean())
if CLOSE > 0:
    def shift_stack(x, n, op):
        y = x.copy()
        for dy in range(-n, n + 1):
            for dx in range(-n, n + 1):
                if dx * dx + dy * dy <= n * n:
                    y = op(y, np.roll(np.roll(x, dy, 0), dx, 1))
        return y
    n = max(1, CLOSE // 2)
    close = lambda x: shift_stack(shift_stack(x, n, np.maximum), n, np.minimum)
    lum = out[..., :3] @ np.array([0.3, 0.59, 0.11], np.float32)
    rgb_c = np.stack([close(out[..., i]) for i in range(3)], -1)  # each channel closed: the colour around the speck
    lift = (np.clip((rgb_c @ np.array([0.3, 0.59, 0.11], np.float32) - lum - 0.12) / 0.15, 0, 1) * cover)[..., None]
    out[..., :3] = out[..., :3] * (1 - lift) + rgb_c * lift
    print('REBAKE dark specks lifted on', int((lift[..., 0] > 0.5).sum()), 'px')
out[..., 3] = 1.0
img.pixels.foreach_set(out.ravel()); img.update(); img.pack()

# Keep only the copy, under the old names, with the old extras.
mname, oname, dname = mat.name, prop.name, prop.data.name
for o in ([prop] if high is prop else [prop, high]):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.data.materials.remove(mat)
lmat.name = mname; low.name = oname; low.data.name = dname
for im in list(bpy.data.images):
    if im is not img and im.users == 0:
        bpy.data.images.remove(im)
low['prop'] = extras
if CHECK:
    check(low, 'after')
bpy.ops.object.select_all(action='DESELECT'); low.select_set(True); bpy.context.view_layer.objects.active = low
kw = dict(filepath=dst, export_format='GLB', use_selection=True, export_yup=True, export_extras=True, export_image_format='WEBP')
try:
    bpy.ops.export_scene.gltf(**kw, export_image_quality=85)
except TypeError:
    bpy.ops.export_scene.gltf(**kw)
print('REBAKE', dst, nf, 'tris;', outliers, 'outliers;', TEX, 'px map; extras', extras)
