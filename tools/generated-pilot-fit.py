"""Reduce the two approved static Sorceress pilots; preserve source UV/PBR.
blender -b --factory-startup --python tools/generated-pilot-fit.py -- source.glb output.glb cabinet|glove
Outputs are staging assets until visual, deformation and runtime checks pass.
"""
import bpy,bmesh,sys,math,json
from pathlib import Path
from mathutils import Vector,Matrix
src,dst,kind=sys.argv[sys.argv.index('--')+1:];dst=Path(dst);dst.parent.mkdir(parents=True,exist_ok=True)
assert kind in ('cabinet','glove')
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(Path(src).resolve()))
objs=[o for o in bpy.context.scene.objects if o.type=='MESH'];bpy.ops.object.select_all(action='DESELECT')
for o in objs:o.parent=None;o.select_set(True)
bpy.context.view_layer.objects.active=objs[0]
if len(objs)>1:bpy.ops.object.join()
o=bpy.context.view_layer.objects.active;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
if kind=='glove':
 # Straighten the wrist-to-middle-finger axis before local rig authoring.
 rot=Matrix.Rotation(math.radians(25),3,'Y')
 for v in o.data.vertices:v.co=rot@v.co
tri0=sum(len(p.vertices)-2 for p in o.data.polygons);budget=19000 if kind=='cabinet' else 5800
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-6);bm.to_mesh(o.data);bm.free()
mod=o.modifiers.new('Budget','DECIMATE');mod.ratio=budget/tri0;mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
verts=o.data.vertices;lo=Vector([min(v.co[i] for v in verts) for i in range(3)]);hi=Vector([max(v.co[i] for v in verts) for i in range(3)]);extent=hi-lo
scale=4.6/extent.y if kind=='cabinet' else .44/extent.z
shift=Vector(((lo.x+hi.x)*.5,(lo.y+hi.y)*.5,lo.z))
for v in verts:v.co=(v.co-shift)*scale
o.data.update();o.name='SkeeCabinet' if kind=='cabinet' else 'GloveSource';o.data.name=o.name+'Geometry'
for face in o.data.polygons:face.use_smooth=True
if kind=='cabinet':
 o.data.set_sharp_from_angle(angle=math.radians(35));mod=o.modifiers.new('FaceAreaNormals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
for mat in o.data.materials:
 mat.use_backface_culling=True
 bs=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
 if bs:
  if 'Specular IOR Level' in bs.inputs:bs.inputs['Specular IOR Level'].default_value=.4
  if 'Specular Tint' in bs.inputs:bs.inputs['Specular Tint'].default_value=(1,1,1,1)
 mat.name=kind.title()+'PBR'
for im in bpy.data.images:
 if im.size[0]:
  cap=1024 if ('normal' in im.name.lower() or 'roughness' in im.name.lower()) else 2048
  if max(im.size)>cap:
   k=cap/max(im.size);im.scale(round(im.size[0]*k),round(im.size[1]*k))
tris=sum(len(p.vertices)-2 for p in o.data.polygons);size=list(extent*scale)
report={'source':src,'sourceTriangles':tri0,'triangles':tris,'budget':budget,'materials':len(o.data.materials),'sizeBlender':size,'images':[{'name':im.name,'size':list(im.size)} for im in bpy.data.images if im.size[0]],'status':'staging - visual/rig review pending'}
assert tris<=budget+10
bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
o['pilot']=report
bpy.ops.export_scene.gltf(filepath=str(dst.resolve()),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_image_format='WEBP',export_image_quality=92)
report['bytes']=dst.stat().st_size;dst.with_suffix('.json').write_text(json.dumps(report,indent=2));print('PILOT',json.dumps(report))
