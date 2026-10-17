"""Download the included rig motions and build bounded runtime GLBs; no new paid calls."""
import json,subprocess,sys,urllib.request,concurrent.futures
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];RUN=ROOT/'runs/sorceress/arcade-finish';OUT=ROOT/'assets/backrooms/entities'
def one(kind):
 folder=RUN/(kind+'-rig' if kind in ('stalker','skinstealer') else kind)
 if kind=='skinstealer' and (RUN/'skinstealer-rig-v2/result.json').exists():folder=RUN/'skinstealer-rig-v2'
 clips=[]
 if '-rig' in folder.name:
  r=json.loads((folder/'result.json').read_text())
  for name,key in [('walk','walking'),('run','running')]:
   dest=folder/(name+'.glb')
   if not dest.exists():urllib.request.urlretrieve(r['rig']['basicAnimations'][key],dest)
   clips.append(str(dest))
 raw=next((folder/'assets').rglob('*.glb'))
 p=subprocess.run(['C:/Program Files/Blender Foundation/Blender 5.2/blender.exe','-b','--factory-startup','--python',str(ROOT/'tools/prepare-entity.py'),'--',str(raw),str(OUT/(kind+'.glb')),*clips],capture_output=True,text=True)
 (folder/'runtime-build.log').write_text(p.stdout+p.stderr)
 if p.returncode:raise RuntimeError((p.stdout+p.stderr)[-2500:])
 print(kind, (OUT/(kind+'.glb')).stat().st_size,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
 for f in concurrent.futures.as_completed([ex.submit(one,k) for k in (sys.argv[1:] or ('hound','smiler','skinstealer','stalker'))]):
  try:f.result()
  except Exception as e:print('FAILED',e,flush=True)
