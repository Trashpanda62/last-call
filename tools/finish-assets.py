"""Receipt-backed monster and arcade sound generation for the arcade completion pass."""
import concurrent.futures, json, subprocess, sys, shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs/sorceress/arcade-finish'
HELPER=[sys.executable,'C:/dev/playground-td/.claude/skills/sorceress-game-assets/scripts/sorceress.py','--env','C:/dev/mr-mak-workspace/.env']
POSE='Full body isolated game character, feet on floor, facing forward +Z, no base. Open A pose, arms 40 degrees away from torso, legs apart. Realistic horror film practical creature, detailed PBR skin, no cartoon, no primitive shapes.'
PROMPTS={
 'stalker':'Backrooms bacteria creature, extremely tall emaciated asymmetrical black fungal humanoid, long cable-like sinewy limbs, tangled branching organic growths from head and shoulders, sunken featureless face, tar-black wet skin with filthy ochre scars. '+POSE,
 'skinstealer':'Backrooms skinstealer, terrifying thin humanoid wearing an ill-fitting human skin, waxy pallid mottled skin with deep creases, hollow black eye sockets, slack gaping mouth with worn uneven teeth, ragged stained grey office shirt, elongated fingers and unnatural stretched arms. '+POSE,
 'hound':'Backrooms hound, realistic hairless humanoid creature crouched on all fours, sinewy emaciated pale grey torso, knotted shoulder blades and vertebrae, long bony forelegs, bent rear legs, head obscured by long matted black hair, snarling jaw of crooked teeth, muddy cracked skin. Four separated limbs, crouching quadruped, whole creature isolated, no base, detailed PBR horror creature.',
 'smiler':'Backrooms Smiler, disembodied frightening face emerging from a pitch black amorphous shadow, narrow glowing ivory human eyes and a wide curved sinister smile with two rows of individually detailed uneven human teeth, realistic enamel, dark gums, no lips, no humanoid body, no skull, no cartoon, floating isolated face sculpture with empty black space around it.'
}
def call(tool,name,body):
 out=RUN/name; RUN.mkdir(parents=True,exist_ok=True)
 inp=RUN/(name+'.json');inp.write_text(json.dumps(body))
 if not (out/'job.json').exists():
  subprocess.run(HELPER+['call',tool,'--input',str(inp),'--out',str(out),'--approved'],check=True,stdout=subprocess.DEVNULL)
 if not (out/'result.json').exists():
  subprocess.run(HELPER+['poll','--job',str(out/'job.json'),'--wait','1500'],check=True,stdout=subprocess.DEVNULL)
 return json.loads((out/'result.json').read_text()),out
def mesh(kind):
 r,out=call('model_generate',kind,{'model':'meshy-7','prompt':PROMPTS[kind],'params':{'should_texture':True,'texture_resolution':'2k','should_remesh':False}})
 rig=None
 if kind in ('stalker','skinstealer'):
  url=(r.get('result') or r)['mesh']['url']
  rig,out=call('model_rig',kind+'-rig',{'modelUrl':url})
 files=list((out/'assets').rglob('*.glb')); assert files,(kind,r)
 dest=ROOT/'assets/backrooms/entities';dest.mkdir(parents=True,exist_ok=True)
 shutil.copy2(files[0],dest/(kind+'.glb'))
 (dest/(kind+'-provenance.json')).write_text(json.dumps({'provider':'Sorceress','prompt':PROMPTS[kind],'modelResult':r,'rigResult':rig},indent=2))
 print('INSTALLED',kind,flush=True)
def sounds():
 jobs={'pin-flipper':('Single tight mechanical pinball flipper solenoid snap, short dry metal clack, no music',.5),'pin-bumper':('Single bright vintage pinball bumper bell ding with a sharp rubber ball contact, no music',1),'pin-launch':('Pinball spring plunger releases, metallic twang then steel ball rolls up a wooden rail, no music',1.5),'pin-drain':('Pinball steel ball drops into a metal collection trough, two hollow clunks, no music',1),'pop-up':('Single soft pneumatic arcade whack a mole pop up, spring boing and short air puff, no voice',.5),'pop-hit':('One satisfying soft padded mallet thump on rubber arcade toy, tiny squeak, no music',.5),'entity-hound':('Terrifying close throaty animal snarl, ragged guttural inhalation, wet teeth, no music or speech',3),'entity-stalker':('Alien organic creaking screech with a rasping low breath, unsettling creature vocalization, no music',4)}
 def one(item):
  name,(prompt,sec)=item;dest=ROOT/'assets/audio/sfx'/f'{name}.mp3'
  if not dest.exists():subprocess.run([sys.executable,'C:/dev/playground-td/.claude/skills/elevenlabs-audio/scripts/eleven.py','sfx',prompt,'--seconds',str(sec),'--out',str(dest),'--max-credits','60','--provenance',str(ROOT/'assets/audio/arcade-finish-provenance.json')],check=True,stdout=subprocess.DEVNULL)
  print('SOUND',name,flush=True)
 for row in jobs.items():one(row)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
 futures=[ex.submit(mesh,k) for k in PROMPTS]+[ex.submit(sounds)]
 for f in concurrent.futures.as_completed(futures):
  try:f.result()
  except Exception as e:print('FAILED',str(e),flush=True)
