"""Blender: reduce the approved Hunyuan pilot before the existing local rigger.

blender -b --factory-startup --python tools/prepare-potato-realism.py -- raw.glb prepared.glb [triangles]
The high-resolution source and generated texture maps remain in the receipt folder.
"""
import bpy, sys, json, math
from pathlib import Path

args = sys.argv[sys.argv.index('--') + 1:]
src, dst = args[:2]
target = int(args[2]) if len(args) > 2 else 24000
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert len(meshes) == 1, 'Inspect multiple meshes/materials before using the single-atlas potato runtime'
mesh = meshes[0]
assert len(mesh.data.materials) == 1, 'The runtime expects one PBR atlas'
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# The generated mesh is split at thousands of UV boundaries. Weld coincident
# vertices before collapse, then bake fresh UVs from the untouched source.
source = mesh.copy(); source.data = mesh.data.copy(); source.name = 'Dense source'
bpy.context.collection.objects.link(source)
source.select_set(False) # Keep Blender's multi-object edit mode off the source UVs.
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.000001)
bpy.ops.object.mode_set(mode='OBJECT')
before = sum(len(p.vertices)-2 for p in mesh.data.polygons)
mod = mesh.modifiers.new('Crowd budget', 'DECIMATE')
mod.ratio = min(1, target / before)
mod.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=mod.name)
for p in mesh.data.polygons:
    p.use_smooth = True
after = sum(len(p.vertices)-2 for p in mesh.data.polygons)
mesh.data.materials.clear()
mat = bpy.data.materials.new('Potato baked PBR'); mat.use_nodes = True
mesh.data.materials.append(mat)
bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.003)
bpy.ops.object.mode_set(mode='OBJECT')
scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 1
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = .015; scene.render.bake.max_ray_distance = .03
scene.render.bake.margin = 12
nodes = mat.node_tree.nodes; links = mat.node_tree.links
shader = nodes.get('Principled BSDF')
source_shader = next(n for n in source.data.materials[0].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
roughness = source_shader.inputs['Roughness']
source_links = source.data.materials[0].node_tree.links
rough_source = roughness.links[0].from_socket if roughness.is_linked else None
maps = {}
for kind in ['albedo','normal','roughness']:
    im = bpy.data.images.new('potato-'+kind, width=2048, height=2048)
    if kind != 'albedo': im.colorspace_settings.name = 'Non-Color'
    tex = nodes.new('ShaderNodeTexImage'); tex.image = im; nodes.active = tex
    bpy.ops.object.select_all(action='DESELECT'); source.select_set(True); mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    if kind == 'albedo':
        scene.render.bake.use_pass_direct = False; scene.render.bake.use_pass_indirect = False; scene.render.bake.use_pass_color = True
        bpy.ops.object.bake(type='DIFFUSE')
    elif kind == 'normal':
        bpy.ops.object.bake(type='NORMAL')
    else:
        sn = source.data.materials[0].node_tree.nodes
        emission = sn.new('ShaderNodeEmission'); out = next(n for n in sn if n.type == 'OUTPUT_MATERIAL')
        if rough_source: source_links.new(rough_source, emission.inputs['Color'])
        else: emission.inputs['Color'].default_value = (roughness.default_value,)*3+(1,)
        source_links.new(emission.outputs[0],out.inputs['Surface'])
        bpy.ops.object.bake(type='EMIT')
    maps[kind] = tex
    im.pack()
links.new(maps['albedo'].outputs['Color'], shader.inputs['Base Color'])
links.new(maps['roughness'].outputs['Color'], shader.inputs['Roughness'])
normal = nodes.new('ShaderNodeNormalMap')
links.new(maps['normal'].outputs['Color'], normal.inputs['Color'])
links.new(normal.outputs['Normal'], shader.inputs['Normal'])
bpy.data.objects.remove(source, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True)
Path(dst).parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_animations=False, export_yup=True,
                          export_image_format='AUTO')
print('POTATO_PREP', json.dumps({'source':src, 'output':dst, 'trianglesBefore':before, 'trianglesAfter':after,
                              'vertices':len(mesh.data.vertices), 'textures':[{ 'name':im.name,'size':list(im.size)} for im in bpy.data.images]}))
