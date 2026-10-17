"""Read-only audit of the exported rig and seven real animation clips.
blender -b --factory-startup --python tools/hand-rig-check.py -- input.glb report.json
Edge measurements inform visual review; they are not a substitute for it.
"""
import bpy,json,sys,math
from pathlib import Path
src,out=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(src).resolve()))
o=next(o for o in bpy.context.scene.objects if o.type=='MESH');rig=o.find_armature();sc=bpy.context.scene
if rig.animation_data:rig.animation_data.action=None
sc.frame_set(1);dg=bpy.context.evaluated_depsgraph_get();base=o.evaluated_get(dg).to_mesh();rest=[v.co.copy() for v in base.vertices];edges=[e.vertices[:] for e in base.edges];o.evaluated_get(dg).to_mesh_clear();rows=[]
for act in bpy.data.actions:
 if 'CasinoHand' in act.name:continue
 rig.animation_data_create();rig.animation_data.action=act;sc.frame_set(15);bpy.context.view_layer.update();m=o.evaluated_get(dg).to_mesh();posed=[v.co.copy() for v in m.vertices];ratios=[];bad=[]
 for a,b in edges:
  d=(rest[a]-rest[b]).length
  if d>1e-5:
   moved=(posed[a]-posed[b]).length;ratios.append(moved/d)
   if moved-d>.003:bad.append({'rest':d,'pose':moved,'a':a,'b':b,'at':[list(rest[a]),list(rest[b])]})
 rows.append({'action':act.name,'max':max(ratios),'above2':sum(x>2 for x in ratios),'above3':sum(x>3 for x in ratios),'edges':len(ratios),'stretched3mm':len(bad),'worst':sorted(bad,key=lambda x:x['pose']-x['rest'],reverse=True)[:8]});o.evaluated_get(dg).to_mesh_clear()
weights=[sum(g.weight for g in v.groups)for v in o.data.vertices]
assert len(rig.data.bones)==17 and len(rows)==7
assert all(math.isfinite(v)for r in rows for v in [r['max']])
assert max(abs(w-1)for w in weights)<1e-5 and max(len(v.groups)for v in o.data.vertices)<=4
report={'source':src,'bones':17,'actions':len(rows),'vertices':len(weights),'weightMaxError':max(abs(w-1)for w in weights),'maxInfluences':max(len(v.groups)for v in o.data.vertices),'rows':rows,'note':'Edge stretch measurements guide visual review; view the actual first-person poses separately.'}
Path(out).write_text(json.dumps(report,indent=2)+'\n');print('PASS: exported 17-bone rig, seven evaluable clips and normalized weights; edge measurements saved for review.')
