"""The blackout monster, take two (Steve, 2026-10-15: "the monster should be a mutated form of the potatoes", "they need
some type of leap ability to catch people, generate leap and stab animation"). A hulking mutated potato built on the
take-b potato design (runs/sorceress/v5-potato/concept-b), meshed with meshy-7, auto-rigged, and given the v5 monster's
idle, walk, run and roar motion (hy-motion SMPL joints are rig-independent, so those clips are reused, not rebought) plus
new leap and stab clips. Receipts go to runs/sorceress/v6-monster/<name>; a folder with a job.json is never paid twice.
The old felt monster is kept in assets/monster/old/.

    python tools/v6_monster.py concept           # nano-banana-pro design from the potato concept, A-pose, two takes
    python tools/v6_monster.py mesh <take>       # meshy-7 image-to-3D of the picked concept (records the pick)
    python tools/v6_monster.py rig [yaw]         # model_rig (24 Mixamo-named bones); 180: the take that faces the right way
    python tools/v6_monster.py anims [name,..]   # hy-motion leap and stab takes
    python tools/v6_monster.py prov              # assets/monster/provenance.json rows for the new monster.glb
    python tools/v6_monster.py spent             # credits charged by this run's receipts
Then: blender -b --factory-startup --python tools/v5_monster_rig.py -- assets/monster/monster.glb <check_dir>
with MONSTER_RUN=v6 (tools/v5_monster_rig.py reads this run's rig and clips).
"""
import json, subprocess, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / 'runs' / 'sorceress' / 'v6-monster'
V5 = ROOT / 'runs' / 'sorceress' / 'v5-monster'
POTATO = ROOT / 'runs' / 'sorceress' / 'v5-potato' / 'concept-b'
HELPER = ['python', 'C:/dev/playground-td/.claude/skills/sorceress-game-assets/scripts/sorceress.py', '--env', 'C:/dev/mr-mak-workspace/.env']
CDT = timezone(timedelta(hours=-5))
RIGHTS = 'Sorceress output is ours (Steve, 2026-09-25)'
PICK = RUNS / 'pick.txt'

POSE = ('Standing upright in a relaxed open A-pose, arms lowered about 40 degrees out from the shoulders with a clear gap '
        'under each armpit, legs straight and hips-width apart so the inner thighs do not touch, feet flat and parallel, '
        'head level and facing forward, symmetrical, full body head to toe, nothing in the hands, no base or pedestal. '
        'Plain light grey background, even studio lighting, centered, full body visible, no text.')
BASE = ('Full-body front-view character design of a giant mutated monster version of the creepy potato character in the reference '
        'picture: the same realistic russet potato skin with brown netting, dirt and dark blemishes, but grown huge, hulking and '
        'wrong, a towering lumpy potato body twice as tall as a man, bulging with tumorous extra potato lumps. ')
CONCEPT = {
    'a': (BASE + 'Far too many glossy too-human eyes of different sizes scattered over the upper potato, some bloodshot, all staring; '
          'a huge jagged knife-cut mouth split wide across the body, crammed with rows of crooked human teeth; long pale twisted sprouts '
          'writhing from the top and shoulders like tendrils. The small red waistcoat and black bow tie of the reference burst and '
          'shredded, hanging in rags on the swollen body. Long, thick, knotted root arms ending in big gnarled root hands with long '
          'sharp black root talons like knives; thick stumpy root legs, the burst black shoes. Hideous, grotesque, nightmare fuel, '
          'a stop-motion horror film creature, no blood. ' + POSE),
    'b': (BASE + 'Clusters of extra glossy human eyes bulging out of the potato eyes all over its head and chest, a cavernous lopsided '
          'mouth torn open from side to side with rows of yellowed uneven human teeth, thick pale sprouts coiling out of its back '
          'and head like horns. A tiny torn red waistcoat with brass buttons and a black bow tie still clinging to the swollen '
          'body. Very long, gangly, knobbly arms of pale potato flesh ending in huge root hands with long hooked black talons, '
          'short thick bowed legs and big lumpy root feet. Hideous, grotesque, terrifying, a stop-motion horror film creature, '
          'no blood. ' + POSE),
}
ANIMS = {  # name: (prompt, seconds); retargeted by tools/v5_monster_rig.py, anchored in place (the sim moves it)
    'leap': ('a huge monster crouches low, then pounces forward in a powerful leap with both arms raised and claws out, lands heavily '
             'in a crouch and slashes down at its prey in front, standing in place', 1.4),
    'leap2': ('a beast crouches and springs forward into a long flying pounce, arms reaching forward with the claws spread, lands hard '
              'on both feet in a low crouch, in place', 1.4),
    'stab': ('a huge monster grabs a person in front of it by the shoulder with its left hand and stabs them again and again in '
             'the chest with the long claws of its right hand, three fast stabs, then shoves them down to the floor, standing in place', 2.2),
    'stab2': ('a monster seizes a victim in front of it with one hand and repeatedly stabs downward into them with the other hand '
              'like a knife, savage overhead stabs, then lets them drop, feet planted in place', 2.2),
}


def run(args):
    return subprocess.run(HELPER + args, capture_output=True, text=True)


def call(tool, folder, body):
    out = RUNS / folder
    if (out / 'job.json').is_file():
        return 'have ' + folder
    RUNS.mkdir(parents=True, exist_ok=True)
    inp = RUNS / f'{folder}.json'
    with open(inp, 'w', encoding='utf-8', newline='') as f:
        f.write(json.dumps(body, ensure_ascii=False))
    r = run(['call', tool, '--input', str(inp), '--out', str(out), '--approved'])
    return folder + (' ok' if r.returncode == 0 else ' FAILED ' + (r.stderr or r.stdout)[-400:])


def poll(folder, wait=900):
    job = RUNS / folder / 'job.json'
    if not job.is_file():
        return folder + ' no job'
    if (RUNS / folder / 'result.json').is_file() and list((RUNS / folder / 'assets').glob('*')):
        return folder + ' succeeded'
    r = run(['poll', '--job', str(job), '--wait', str(wait), '--retry-failed', '1', '--approved'])
    return folder + (' succeeded' if '"succeeded"' in r.stdout else ' NOT DONE ' + (r.stdout or r.stderr)[-400:])


def result(folder, runs=RUNS):
    for s in ('-retry1', ''):
        p = runs / f'{folder}{s}' / 'result.json'
        if p.is_file():
            return json.loads(p.read_text(encoding='utf-8')), runs / f'{folder}{s}'
    raise SystemExit('no result for ' + folder)


def image_url(res):
    i = res['images'][0]
    return i['url'] if isinstance(i, dict) else i


def concept():
    ref = image_url(json.loads((POTATO / 'result.json').read_text(encoding='utf-8')))
    for k, p in CONCEPT.items():
        print(call('image_generate', f'concept-{k}', {'model': 'nano-banana-pro', 'prompt': p, 'aspectRatio': '1:1', 'params': {'resolution': '2K'}, 'refImages': [ref]}), flush=True)
    for k in CONCEPT:
        print(poll(f'concept-{k}', 600), flush=True)


def mesh(take):
    with open(PICK, 'w', encoding='utf-8', newline='') as f:
        f.write(take + '\n')
    res, _ = result(f'concept-{take}')
    print(call('model_generate', 'mesh', {'model': 'meshy-7', 'imageUrl': image_url(res), 'params': {
        'should_texture': True, 'texture_resolution': '2k', 'should_remesh': True, 'topology': 'triangle', 'target_polycount': 16000}}), flush=True)
    print(poll('mesh', 1500), flush=True)


def rig(yaw=0):  # the first rig (no yaw) came out with the skeleton facing away from the face: rig180 turns it round
    folder = f'rig{yaw}' if yaw else 'rig'
    res, _ = result('mesh')
    url = (res.get('result') or res).get('mesh', {}).get('url') or res['mesh']['url']
    body = {'modelUrl': url}
    if yaw:
        body['extraYawDeg'] = yaw
    print(call('model_rig', folder, body), flush=True)
    print(poll(folder, 900), flush=True)


def anims(names):
    for n in names:
        p, sec = ANIMS[n]
        print(call('model_animate', f'anim-{n}', {'prompt': p, 'model': 'hy-motion', 'durationSeconds': sec, 'intensity': 80}), flush=True)
    for n in names:
        print(poll(f'anim-{n}', 600), flush=True)


def prov():
    """assets/monster/provenance.json: the receipts behind the mutated potato monster.glb (the felt one's rows move to old/)."""
    pick = PICK.read_text(encoding='utf-8').strip()
    other = [k for k in CONCEPT if k != pick]
    ship = json.loads((RUNS / 'ship.json').read_text(encoding='utf-8'))  # {"leap": "anim-leap2", "stab": "anim-stab"} (picked takes)
    rows = []
    parts = [(RUNS, f'concept-{pick}', 'image_generate', f'concept (picked over concept-{",".join(other)})')]
    parts += [(RUNS, f'concept-{k}', 'image_generate', 'rejected concept') for k in other]
    parts += [(RUNS, 'mesh', 'model_generate', f'meshy-7 image-to-3D of concept-{pick}'),
              (RUNS, 'rig180', 'model_rig', 'auto-rig, 24 Mixamo-named bones, extraYawDeg 180'), (RUNS, 'rig', 'model_rig', 'rejected rig (its skeleton faced away from the face)')]
    parts += [(V5, f'anim-{n}', 'model_animate', f'clip {n} (the v5 monster motion, reused)') for n in ('idle', 'walk', 'run', 'roar')]
    for n, f in ship.items():
        parts.append((RUNS, f, 'model_animate', f'clip {n}'))
    for a in ANIMS:
        if f'anim-{a}' not in ship.values() and (RUNS / f'anim-{a}' / 'job.json').is_file():
            parts.append((RUNS, f'anim-{a}', 'model_animate', 'rejected take'))
    for runs, folder, tool, note in parts:
        res, f = result(folder, runs)
        job = json.loads((f / 'job.json').read_text(encoding='utf-8'))
        inp = job.get('input') or {}
        t = datetime.fromisoformat(job['created_at']).astimezone(CDT)
        rows.append({'file': 'assets/monster/monster.glb', 'part': note, 'provider': 'sorceress', 'tool': tool, 'model': inp.get('model', 'auto-rig'),
                     'job_id': res.get('jobId') or (job.get('response') or {}).get('jobId'), 'credits': res.get('creditsCharged') or (job.get('response') or {}).get('estimatedCredits'),
                     'date': t.date().isoformat(), 'time_ct': t.strftime('%H:%M'), 'prompt': inp.get('prompt') or inp.get('imageUrl') or inp.get('modelUrl'),
                     'receipt': f.relative_to(ROOT).as_posix(), 'rights': RIGHTS})
    rows.append({'file': 'assets/monster/monster.glb', 'part': 'retarget and bake', 'tool': 'tools/v5_monster_rig.py with MONSTER_RUN=v6 (Blender 5.2, headless)',
                 'note': 'hy-motion SMPL joints retargeted onto the rig, loops cut and closed, feet kept on the floor, scaled, texture 1024 px JPEG; then tools/glb_shrink.py'})
    out = ROOT / 'assets' / 'monster' / 'provenance.json'
    with open(out, 'w', encoding='utf-8', newline='') as fh:
        fh.write(json.dumps(rows, indent=1, ensure_ascii=False) + '\n')
    print(len(rows), 'rows')


def spent():
    tot = 0
    for p in sorted(RUNS.glob('*/result.json')):
        c = json.loads(p.read_text(encoding='utf-8')).get('creditsCharged') or 0
        print(p.parent.name, c); tot += c
    print('total', tot)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    arg = sys.argv[2] if len(sys.argv) > 2 else None
    if cmd == 'concept': concept()
    elif cmd == 'mesh': mesh(arg)
    elif cmd == 'rig': rig(int(arg) if arg else 0)
    elif cmd == 'anims': anims(arg.split(',') if arg else list(ANIMS))
    elif cmd == 'prov': prov()
    elif cmd == 'spent': spent()
    else: print(__doc__)
