"""Replace the rejected half-body Skin-Stealer using a verified full-body reference."""
import json,subprocess,sys,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];RUN=ROOT/'runs/sorceress/arcade-finish'
HELPER=[sys.executable,'C:/dev/playground-td/.claude/skills/sorceress-game-assets/scripts/sorceress.py','--env','C:/dev/mr-mak-workspace/.env']
PROMPT='Full-length front view of a terrifying Backrooms skin-stealer creature. Entire body from crown to both soles in the picture, with visible long skinny bare lower legs, bony knees, ankles, toes and both bare feet planted on the floor. Standing upright with separated legs and arms spread outward in a relaxed open A pose for 3D rigging. Emaciated adult humanoid wearing a loose torn dirty grey office shirt and short ragged trousers ending above the knees. Pale waxy wrinkled skin, sunken eyes, a strained uncanny toothy human smile, elongated claw-like human hands. Realistic horror movie practical creature, not cartoon. Both long bare shins and feet fully visible. Isolated on a plain neutral grey studio background, even lighting. One character, no text, no base, no cropped limbs.'
def job(tool,name,body):
 folder=RUN/name;inp=RUN/(name+'.json');inp.write_text(json.dumps(body))
 if not(folder/'job.json').exists():subprocess.run(HELPER+['call',tool,'--input',str(inp),'--out',str(folder),'--approved'],check=True,stdout=subprocess.DEVNULL)
 if not(folder/'result.json').exists():subprocess.run(HELPER+['poll','--job',str(folder/'job.json'),'--wait','1500'],check=True,stdout=subprocess.DEVNULL)
 print('READY',name,flush=True);return json.loads((folder/'result.json').read_text()),folder
concept,folder=job('image_generate','skinstealer-concept-v2',{'model':'gpt-image-2','prompt':PROMPT,'aspectRatio':'2:3','params':{'resolution':'1K'}})
if '--concept-only' in sys.argv:sys.exit(0)
im=concept['images'][0];url=im['url'] if isinstance(im,dict) else im
mesh,_=job('model_generate','skinstealer-v2',{'model':'meshy-7','imageUrl':url,'params':{'should_texture':True,'texture_resolution':'2k','should_remesh':False}})
rig,folder=job('model_rig','skinstealer-rig-v2',{'modelUrl':mesh['mesh']['url']})
dest=ROOT/'assets/backrooms/entities/skinstealer-provenance.json';dest.write_text(json.dumps({'provider':'Sorceress','prompt':PROMPT,'conceptResult':concept,'modelResult':mesh,'rigResult':rig,'rejected':'v1 text-only result omitted lower legs; retained in runs/sorceress/arcade-finish/skinstealer'},indent=2))
