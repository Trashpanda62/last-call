"""Inspect generated GLBs without changing their source; render six real views.
blender -b --factory-startup --python tools/generated-model-review.py -- source.glb output-folder
"""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
src,out=sys.argv[sys.argv.index('--')+1:];out=Path(out);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(src).resolve()))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
pts=[o.matrix_world@Vector(p) for o in meshes for p in o.bound_box]
lo=Vector([min(p[i] for p in pts) for i in range(3)]);hi=Vector([max(p[i] for p in pts) for i in range(3)]);mid=(lo+hi)*.5;size=hi-lo;extent=max(size)
report={'source':src,'bytes':Path(src).stat().st_size,'dimensionsBlender':list(size),'bounds':[list(lo),list(hi)],'meshes':[],'images':[]}
for o in meshes:
 report['meshes'].append({'name':o.name,'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'materials':len(o.data.materials)})
for im in bpy.data.images:
 if im.size[0]:report['images'].append({'name':im.name,'size':list(im.size)})
(out/'metrics.json').write_text(json.dumps(report,indent=2))
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=12;sc.cycles.use_denoising=True
sc.render.resolution_x=640;sc.render.resolution_y=640;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG'
sc.world=bpy.data.worlds.new('Review world');sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.17,.2,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.55
sc.view_settings.view_transform='AgX'
for name,vec,power,sz in [('Key',(-2,-3,4),80,3),('Fill',(3,-1,2),50,2),('Rim',(0,3,3),90,2)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power*extent*extent;d.shape='DISK';d.size=sz*extent;o=bpy.data.objects.new(name,d);sc.collection.objects.link(o);o.location=mid+Vector(vec)*extent;o.rotation_euler=(mid-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',d);sc.collection.objects.link(cam);sc.camera=cam;d.type='ORTHO';d.ortho_scale=extent*1.18
for name,direction in [('front',(0,-1,.22)),('quarter',(1,-1,.55)),('side',(1,0,.15)),('back',(0,1,.2)),('top',(0,-.05,1)),('opposite',(-1,-1,.4))]:
 cam.location=mid+Vector(direction).normalized()*extent*3;cam.rotation_euler=(mid-cam.location).to_track_quat('-Z','Y').to_euler();sc.render.filepath=str((out/(name+'.png')).resolve());bpy.ops.render.render(write_still=True)
print('REVIEW',json.dumps(report))
