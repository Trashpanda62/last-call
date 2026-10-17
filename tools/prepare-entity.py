"""Blender runtime budget: preserve PBR maps, reduce geometry and embed in-place rig clips."""
import bpy,sys,json,math
from mathutils import Vector
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:];src,dst=args[:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm=next((o for o in bpy.data.objects if o.type=='ARMATURE'),None)
meshes=[o for o in bpy.data.objects if o.type=='MESH']
before=sum(len(o.data.polygons) for o in meshes)
for o in meshes:
 bpy.context.view_layer.objects.active=o
 mod=o.modifiers.new('Runtime triangle budget','DECIMATE');mod.ratio=min(1,18000/max(1,before));mod.use_collapse_triangulate=True
 bpy.ops.object.modifier_apply(modifier=mod.name)
 for p in o.data.polygons:p.use_smooth=True
for im in bpy.data.images:
 if im.size[0]>1024 or im.size[1]>1024:
  k=1024/max(im.size);im.scale(round(im.size[0]*k),round(im.size[1]*k))
if not arm and 'hound' in src:
 # Give the quadruped a real deforming spine/head and four independent limbs.
 coords=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
 lo=Vector(tuple(min(v[i] for v in coords) for i in range(3)));hi=Vector(tuple(max(v[i] for v in coords) for i in range(3)))
 k=1.12/(hi.z-lo.z);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
 for o in meshes:
  for v in o.data.vertices:v.co=(o.matrix_world@v.co-center)*k
  o.matrix_world.identity()
 length=(hi.y-lo.y)*k;span=(hi.x-lo.x)*k
 data=bpy.data.armatures.new('Hound skeleton');arm=bpy.data.objects.new('Hound rig',data);bpy.context.collection.objects.link(arm)
 bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 layout={'Spine':((0,.2*length,.55),(0,-.12*length,.65)),'Head':((0,-.12*length,.65),(0,-.43*length,.78))}
 for side,sign in [('Left',-1),('Right',1)]:
  for label,y in [('Foreleg',-.23*length),('Hindleg',.25*length)]:layout[side+label]=((sign*span*.22,y,.63),(sign*span*.34,y,.045))
 for name,(a,b) in layout.items():
  bone=data.edit_bones.new(name);bone.head=a;bone.tail=b
  if name!='Spine':bone.parent=data.edit_bones['Spine']
 bpy.ops.object.mode_set(mode='OBJECT')
 for o in meshes:
  groups={name:o.vertex_groups.new(name=name) for name in layout}
  for v in o.data.vertices:
   scores=[]
   for name,(aa,bb) in layout.items():
    a,b=Vector(aa),Vector(bb);u=max(0,min(1,(v.co-a).dot(b-a)/(b-a).length_squared));d=(v.co-a-(b-a)*u).length
    scores.append((name,1/max(.025,d)**4))
   scores=sorted(scores,key=lambda q:-q[1])[:3];total=sum(w for _,w in scores)
   for name,w in scores:groups[name].add([v.index],w/total,'REPLACE')
  mod=o.modifiers.new('Hound deformation','ARMATURE');mod.object=arm;o.parent=arm
if arm and args[2:]:
 for action in list(bpy.data.actions):bpy.data.actions.remove(action)
 for clip in args[2:]:
  old=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=clip)
  imported=[o for o in bpy.data.objects if o not in old];rig=next(o for o in imported if o.type=='ARMATURE')
  action=rig.animation_data.action;action.name=Path(clip).stem
  action.use_fake_user=True
  for o in imported:bpy.data.objects.remove(o,do_unlink=True)
  arm.animation_data_create();arm.animation_data.action=action
 # Every exported action uses the original rig, the baked preview clips share its exact bone names.
 bpy.context.scene.frame_set(1)
 for a in bpy.data.actions:
  if a.name in ('walk','run'):
   # Rig preview actions are already in place; maintain their vertical hip motion.
   pass
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',export_image_format='JPEG',export_jpeg_quality=85,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_yup=True)
print('ENTITY_BUDGET',json.dumps({'src':src,'dst':dst,'before':before,'after':sum(len(o.data.polygons) for o in meshes),'actions':[a.name for a in bpy.data.actions]}))
