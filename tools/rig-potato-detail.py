"""Preserve every source triangle and transfer the playable pilot's exact rig.

blender -b --factory-startup --python tools/rig-potato-detail.py -- dense.glb low-rig.glb high-rig.glb
"""
import bpy, sys, json
from mathutils import Vector, kdtree
args=sys.argv[sys.argv.index('--')+1:]
src, low_path, dst=args[:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=low_path)
low=next(o for o in bpy.data.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for b in rig.data.bones:b.use_deform=True
info=json.loads(rig['bean'])
tree=kdtree.KDTree(len(low.data.vertices))
weights=[]
names={g.index:g.name for g in low.vertex_groups}
for v in low.data.vertices:
    tree.insert(v.co,v.index)
    weights.append([(names[g.group],g.weight) for g in v.groups])
tree.balance()
assert any(weights), 'Imported playable mesh must contain skin weights'
existing=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=src)
high=next(o for o in bpy.data.objects if o not in existing and o.type=='MESH')
bpy.ops.object.select_all(action='DESELECT');high.select_set(True)
bpy.context.view_layer.objects.active=high
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
vs=high.data.vertices
zmin=min(v.co.z for v in vs); zmax=max(v.co.z for v in vs)
cx=(min(v.co.x for v in vs)+max(v.co.x for v in vs))/2
s=info['height']/(zmax-zmin)
groups={b.name:high.vertex_groups.new(name=b.name) for b in rig.data.bones}
for v in vs:
    v.co=Vector(((v.co.x-cx)*s,v.co.y*s,(v.co.z-zmin)*s))
    near=tree.find_n(v.co,3); combined={}
    for _,index,d in near:
        f=1/max(d,.00001)**2
        for name,w in weights[index]:combined[name]=combined.get(name,0)+w*f
    best=sorted(combined.items(),key=lambda x:-x[1])[:4]
    total=sum(w for _,w in best)
    for name,w in best:groups[name].add([v.index],w/total,'REPLACE')
high.parent=rig; high.matrix_parent_inverse=low.matrix_parent_inverse.copy()
high.parent_type='OBJECT'
mod=high.modifiers.new('Shared pilot skeleton','ARMATURE');mod.object=rig
bpy.data.objects.remove(low,do_unlink=True)
for im in bpy.data.images:
    if im.size[0]>4096:im.scale(4096,4096)
bpy.ops.object.select_all(action='DESELECT');high.select_set(True);rig.select_set(True)
bpy.context.view_layer.objects.active=high
high.data.update();bpy.context.view_layer.update()
assert any(v.groups for v in high.data.vertices), 'Dense vertex groups must survive transfer'
print('DETAIL_RIG',[(b.name,b.use_deform) for b in rig.data.bones],[(m.type,m.object.name if m.type=='ARMATURE' else '') for m in high.modifiers],flush=True)
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',use_selection=True,export_skins=True,export_animations=False,
                          export_yup=True,export_extras=True,export_image_format='JPEG',export_jpeg_quality=92)
print('DENSE_POTATO',json.dumps({'triangles':sum(len(p.vertices)-2 for p in high.data.polygons),
                               'vertices':len(vs),'bones':len(rig.data.bones),'info':info}))
