"""Author the approved glove's local 17-bone rig and pose library; no paid rigging.
blender -b --factory-startup --python tools/rig-casino-glove.py -- source.glb output.glb
"""
import bpy,bmesh,sys,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import convex_hull_2d
src,dst=sys.argv[sys.argv.index('--')+1:];dst=Path(dst);dst.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(Path(src).resolve()))
o=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
# Seal the cut forearm with the existing skin material/atlas. It must never
# reveal a hollow tube when the eating/reach pose rotates toward the camera.
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-7)
rim=[e for e in bm.edges if e.is_boundary and all(v.co.z<.075 for v in e.verts)]
uv=bm.loops.layers.uv.active;sample=next((loop[uv].uv.copy() for e in rim for loop in e.link_loops),None) if uv else None
caps=bmesh.ops.holes_fill(bm,edges=rim,sides=0)['faces'] if rim else []
if not caps:
 # The generator made a hollow closed cup rather than an open boundary. Add
 # an inset end cap under its lip, weighted to the forearm with the same atlas.
 low=[v for v in bm.verts if v.co.z<.055];assert len(low)>8
 uv=bm.loops.layers.uv.active
 sample=next((loop[uv].uv.copy() for v in low for loop in v.link_loops),None) if uv else None
 points=[Vector((v.co.x,v.co.y))for v in low];hull=convex_hull_2d(points)
 rimverts=[bm.verts.new((points[i].x,points[i].y,.045))for i in reversed(hull)]
 caps=[bm.faces.new(rimverts)]
assert caps,'The forearm end must be sealed'
for face in caps:
 face.material_index=0;face.smooth=False
 if sample is not None:
  for loop in face.loops:loop[uv].uv=sample
bm.to_mesh(o.data);bm.free();o.data.update()
# Landmarks measured on the normalized open-palm mesh; Blender +Z is fingers,
# palm faces -Y. Keep all five chains independent, including the opposing thumb.
chains={
 'little':[(-.087,0,.287),(-.11,0,.328),(-.126,0,.355),(-.132,0,.378)],
 'ring':[(-.05,0,.307),(-.063,0,.36),(-.07,0,.394),(-.072,0,.418)],
 'middle':[(-.009,0,.31),(-.013,0,.369),(-.015,0,.405),(-.016,0,.435)],
 'index':[(.033,0,.3),(.039,0,.356),(.046,0,.395),(.05,0,.427)],
 'thumb':[(.035,-.003,.231),(.079,-.007,.263),(.108,-.009,.29),(.132,-.01,.31)]}
# Fit each joint through the actual thickness of its digit, rather than the
# palm plane: the generated fingers curve toward Blender +Y by several cm.
for pts in chains.values():
 for i,(x,y,z) in enumerate(pts):
  sample=[v.co.y for v in o.data.vertices if abs(v.co.x-x)<.013 and abs(v.co.z-z)<.009]
  if len(sample)>=4:pts[i]=(x,(min(sample)+max(sample))*.5,z)
chains={n:[Vector(p) for p in pts]for n,pts in chains.items()}
arm=bpy.data.armatures.new('CasinoHand17');rig=bpy.data.objects.new('CasinoHandRig',arm);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
def bone(name,a,b,parent=None):
 e=arm.edit_bones.new(name);e.head=a;e.tail=b
 if parent:e.parent=arm.edit_bones[parent]
 return e
bone('wrist',(0,0,.14),(0,0,.28));bone('forearm',(0,0,.14),(0,0,0),'wrist')
for name,pts in chains.items():
 for i in range(3):bone(f'{name}_{i+1}',pts[i],pts[i+1],f'{name}_{i}' if i else 'wrist')
bpy.ops.object.mode_set(mode='OBJECT')
for b in rig.pose.bones:b.rotation_mode='XYZ'
groups={b.name:o.vertex_groups.new(name=b.name) for b in arm.bones}
def clamp(v):return min(1,max(0,v))
def nearest(p,pts):
 best=(1e9,0);offset=0
 for a,b in zip(pts,pts[1:]):
  d=b-a;t=clamp((p-a).dot(d)/d.length_squared);distance=(p-(a+t*d)).length
  if distance<best[0]:best=(distance,offset+t*d.length)
  offset+=d.length
 return best
for v in o.data.vertices:
 p=v.co
 if p.z<.16:
  w=clamp((p.z-.1)/.06);weights={'forearm':1-w,'wrist':w}
 else:
  name,(distance,along)=min(((n,nearest(p,pts))for n,pts in chains.items()),key=lambda t:t[1][0]);pts=chains[name]
  blend=clamp((p.z-pts[0].z+.015)/.04) if name!='thumb' else clamp((p.x-pts[0].x)/.045)
  weights={'wrist':1-blend};lengths=[(pts[i+1]-pts[i]).length for i in range(3)];centers=[lengths[0]/2,lengths[0]+lengths[1]/2,sum(lengths[:2])+lengths[2]/2]
  if along<=centers[0]:weights[name+'_1']=blend
  elif along>=centers[2]:weights[name+'_3']=blend
  else:
   i=0 if along<centers[1] else 1;t=clamp((along-centers[i])/(centers[i+1]-centers[i]));weights[f'{name}_{i+1}']=blend*(1-t);weights[f'{name}_{i+2}']=blend*t
 for n,w in weights.items():
  if w>1e-8:groups[n].add([v.index],w,'REPLACE')
# Smooth weights on the actual welded surface, especially the finger webs.
# Pure nearest-chain weights can jump across neighbouring vertices and stretch
# a 4 mm edge into a 6 cm spike in a fist. Keep four normalized influences.
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_smooth(group_select_mode='ALL',factor=.6,repeat=5)
bpy.ops.object.vertex_group_clean(group_select_mode='ALL',limit=.003,keep_single=True)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL',limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL',lock_active=False)
bpy.ops.object.mode_set(mode='OBJECT')
mod=o.modifiers.new('HandDeform','ARMATURE');mod.object=rig;o.parent=rig;o.name='CasinoGlove';rig.show_in_front=True
# Poses also exported as clips for DCC inspection; runtime can set the same
# bounded finger controls directly without allocating an AnimationMixer per hand.
poses={'relaxed':{'all':.22},'chip-pinch':{'all':.7,'index':.45,'thumb':.8},'card-reach':{'all':.68,'index':.12,'thumb':.32},'snack-grip':{'all':.7,'thumb':.6},'drink-grip':{'all':.72,'thumb':.65},'knife-fist':{'all':1,'thumb':.9},'ability-point':{'all':.9,'index':.03,'thumb':.3}}
sc=bpy.context.scene;sc.render.fps=30;sc.frame_end=30
for name,pose in poses.items():
 rig.animation_data_create();rig.animation_data.action=bpy.data.actions.new(name)
 for frame,strength in [(1,0),(15,1),(30,0)]:
  for b in rig.pose.bones:b.rotation_euler=(0,0,0)
  for digit in chains:
   c=pose.get(digit,pose['all'])*strength
   for i,angle in enumerate([1.0,1.35,.85]):rig.pose.bones[f'{digit}_{i+1}'].rotation_euler.x=c*angle
  for b in rig.pose.bones:b.keyframe_insert('rotation_euler',frame=frame)
 rig.animation_data.action.use_fake_user=True
rig.animation_data.action=None;sc.frame_set(1)
for b in rig.pose.bones:b.rotation_euler=(0,0,0)
rig['handRig']={'bones':17,'fingerChains':5,'source':'design/models/glove-static-v1.glb','palmPivotY':.23,'scale':.72,'poses':poses}
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(dst.resolve()),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_image_format='WEBP',export_image_quality=92,export_animations=True,export_animation_mode='ACTIONS',export_anim_single_armature=True,export_nla_strips_merged_animation_name='HandPose')
weights=[sum(g.weight for g in v.groups) for v in o.data.vertices];assert max(abs(w-1)for w in weights)<1e-5
report={'source':src,'file':str(dst),'bytes':dst.stat().st_size,'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'bones':len(arm.bones),'forearmCaps':len(caps),'fingerChains':len(chains),'weightedVertices':len(weights),'weightMaxError':max(abs(w-1)for w in weights),'poses':list(poses),'landmarks':{n:[list(p)for p in pts]for n,pts in chains.items()},'status':'rig authored; deformation and runtime inspection pending'}
dst.with_suffix('.json').write_text(json.dumps(report,indent=2));print('RIG',json.dumps(report))
bpy.ops.wm.save_as_mainfile(filepath=str(Path('runs/sorceress/glove-model/casino-glove-rig-v1.blend').resolve()))
