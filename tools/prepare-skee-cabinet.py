"""Keep the approved generated cabinet body/cage; remove baked lane and target faces.
The actual clean rails, target openings, labels and moving balls are built in-engine.
blender -b --factory-startup --python tools/prepare-skee-cabinet.py
"""
import bpy,bmesh,json,hashlib
from pathlib import Path
bpy.ops.wm.read_factory_settings(use_empty=True)
src=Path('design/models/skee-cabinet-v1.glb');dst=Path('assets/props/skeeCabinet.glb');dst.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.import_scene.gltf(filepath=str(src.resolve()))
o=next(o for o in bpy.context.scene.objects if o.type=='MESH')
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bm=bmesh.new();bm.from_mesh(o.data)
remove=[]
for f in bm.faces:
 c=f.calc_center_median()
 lane=c.y<1.02 and c.z>.50
 target=c.y>1.02 and abs(c.x)<.49 and .68<c.z<1.83
 if lane or target:remove.append(f)
bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(o.data);bm.free();o.data.update()
o.name='SkeeCabinetBody';o['prop']={'size':[1.4,2.05,4.6]}
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
bpy.ops.export_scene.gltf(filepath=str(dst.resolve()),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_image_format='WEBP',export_image_quality=92)
report={'source':str(src),'runtime':str(dst),'bytes':dst.stat().st_size,'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'sha256':hashlib.sha256(dst.read_bytes()).hexdigest(),'removedFaces':len(remove),'status':'generated shell retained; authored gameplay surfaces and actual engine review required'}
Path('design/models/skee-cabinet-runtime.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print('CABINET',json.dumps(report))
