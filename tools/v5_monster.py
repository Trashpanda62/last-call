"""The blackout monster (Steve, 2026-10-15: "when the power goes out i want the killer to turn into a giant hideous
terrifying monster that can kill anyone he finds", "generate with sorceress, it needs good animations for killing").
Sorceress receipts go to runs/sorceress/v5-monster/<name> (git-ignored); a folder with a job.json is never paid twice.

    python tools/v5_monster.py concept          # nano-banana-pro design, A-pose, two takes
    python tools/v5_monster.py mesh <take>      # meshy-7 image-to-3D of the picked concept
    python tools/v5_monster.py rig              # model_rig (24 Mixamo-named bones)
    python tools/v5_monster.py anims [name,..]  # hy-motion clips (SMPL joints), retargeted in Blender by tools/v5_monster_rig.py
    python tools/v5_monster.py sfx [id,..]      # seed-audio sound effects, two takes each
    python tools/v5_monster.py export           # assets/audio/monster/*.mp3, the audio.json "monster" group, provenance rows
"""
import json, subprocess, sys, urllib.request, glob
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / 'runs' / 'sorceress' / 'v5-monster'
AUD = ROOT / 'assets' / 'audio'
HELPER = ['python', 'C:/dev/playground-td/.claude/skills/sorceress-game-assets/scripts/sorceress.py', '--env', 'C:/dev/mr-mak-workspace/.env']
CDT = timezone(timedelta(hours=-5))
RIGHTS = 'Sorceress output is ours (Steve, 2026-09-25)'
BEAN_REF = 'https://wizardgenie-media.s3.us-west-004.backblazeb2.com/generations/14b713ad-480d-44e5-a794-18be8c0a897d/3763125f-e33e-4057-bb44-697c89554aae/nano-banana-pro-1.png'

POSE = ('Standing upright in a relaxed open A-pose, arms lowered about 40 degrees out from the shoulders with a clear gap '
        'under each armpit, legs straight and hips-width apart so the inner thighs do not touch, feet flat and parallel, '
        'head level and facing forward, symmetrical, full body head to toe, nothing in the hands, no base or pedestal. '
        'Plain light grey background, even studio lighting, centered, full body visible, no text.')
CONCEPT = {
    'a': ('Full-body front-view character design sheet of a giant nightmare plush toy monster, the evil twin of the felt bean '
          'toy in the reference picture grown huge and wrong: a tall hulking body sewn from torn charcoal black and dirty '
          'blood-red felt patches with crude thick black cross stitches, burst seams with white stuffing bulging out, two '
          'mismatched button eyes (one big cracked white button, one small red button) and a third stitched-shut eye, an '
          'enormous ripped seam mouth across the whole upper body full of long jagged sewing-needle teeth, a frayed black bow '
          'tie and a shredded gold felt waistcoat hanging in rags. Very long thick arms ending in big felt hands with long '
          'curved steel needle claws, thick legs with big black felt feet. Hideous and terrifying, horror movie creature made '
          'of felt. ' + POSE),
    'b': ('Full-body front-view character design sheet of a monstrous horror creature made from a giant stuffed plush toy '
          'that has been torn apart and sewn back together wrong, in the felt style of the reference picture: tall and '
          'gaunt with broad hunched shoulders, rough dark crimson and black patchwork felt with ragged holes and loose '
          'threads, safety-pin and staple repairs, mismatched glossy button eyes of different sizes, a gaping zig-zag '
          'stitched mouth torn open wide from cheek to cheek and packed with rows of needle-sharp white teeth, stuffing '
          'spilling from the seams, a tattered gold waistcoat. Very long arms ending in large hands with five long hooked '
          'black claws, strong legs, big padded feet. Creepy, hideous, nightmare fuel, a stop-motion horror film puppet. ' + POSE),
}
ANIMS = {  # name: (prompt, seconds); retargeted onto the rig, walk/run made to stay in place, kill anchored
    'idle': ('a huge hunched monster standing in place, breathing heavily with the shoulders rising and falling, swaying slowly from side to side, long arms hanging forward, head tilting menacingly', 4),
    'walk': ('a huge hunched monster stalking forward slowly with heavy deliberate steps, shoulders rolling, long arms hanging low and swinging', 2.4),
    'run': ('a huge hunched monster charging forward at a lunging run, leaning far forward, arms reaching out ahead to grab', 1.6),
    'roar': ('a monster rears up to its full height, throws its arms wide open and roars at the sky with the head thrown back, then hunches forward and roars at the victim in front, standing in place', 2),
    'kill': ('a huge monster lunges forward and grabs a small person in front of it with both hands at waist height, lifts them up high to its face, shakes them violently and bites down, then throws them down to the floor in front, standing in place', 2.2),
    # second and third kill takes: the first one grabs at floor height (the monster's long arms) and lifts the victim over its head
    'kill2': ('a huge monster lunges forward and grabs a person standing right in front of it with both hands at chest height, pulls them up to its open mouth, bites down and shakes its head violently like a dog, then drops them to the floor in front of it, standing in place', 2.2),
    'kill3': ('a giant beast reaches forward and seizes a victim in front of it with both claws at chest height, lifts them up to its face, savagely bites and mauls them while shaking them, then flings them down to the ground in front, feet planted in place', 2.0),
}
SFX = {  # id: (prompt, seconds)
    'roar': ('a monstrous deep guttural roar of a huge beast, terrifying, echoing in a dark empty room, rising then trailing off into a wet snarl', 3),
    'growl': ('a continuous low rumbling growl and heavy wet breathing of a huge monster lurking in the dark, steady, menacing, no roar', 4),
    'step': ('one single heavy monstrous footstep thud on a carpeted floor, deep low impact, the floor shudders', 1),
    'maul': ('a monster snarling and savagely mauling, ripping fabric, tearing felt and stuffing, a wet crunch, short and brutal', 2),
    'breaker': ('a big old electrical breaker lever being thrown, a heavy metal clunk and a sharp electric snap', 1),
    'powerup': ('the power coming back on in a big room, a deep electrical hum rising and fluorescent lights buzzing and flickering on', 3),
}
TAKES = 2
# the sound take each one ships, from ffmpeg volumedetect/silencedetect (mean loudness, peak, gaps); defaults to 1.
# growl-2 and step-2 came out 10 dB quieter and step-2 is a third silence; maul-2 and breaker-2 carry more body.
PICKS = {'maul': 2, 'breaker': 2}


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
    r = run(['poll', '--job', str(job), '--wait', str(wait), '--retry-failed', '1', '--approved'])
    return folder + (' succeeded' if '"succeeded"' in r.stdout else ' NOT DONE ' + (r.stdout or r.stderr)[-400:])


def result(folder):
    for s in ('-retry1', ''):
        p = RUNS / f'{folder}{s}' / 'result.json'
        if p.is_file():
            return json.loads(p.read_text(encoding='utf-8')), RUNS / f'{folder}{s}'
    raise SystemExit('no result for ' + folder)


def concept():
    names = []
    for k, p in CONCEPT.items():
        n = f'concept-{k}'; names.append(n)
        print(call('image_generate', n, {'model': 'nano-banana-pro', 'prompt': p, 'aspectRatio': '1:1', 'params': {'resolution': '2K'}, 'refImages': [BEAN_REF]}), flush=True)
    for n in names:
        print(poll(n, 600), flush=True)


def mesh(take):
    res, _ = result(f'concept-{take}')
    url = res['images'][0]['url'] if isinstance(res['images'][0], dict) else res['images'][0]
    print(call('model_generate', 'mesh', {'model': 'meshy-7', 'imageUrl': url, 'params': {'should_texture': True, 'texture_resolution': '2k', 'should_remesh': True, 'topology': 'triangle', 'target_polycount': 14000}}), flush=True)
    print(poll('mesh', 1200), flush=True)


def rig(folder='rig', yaw=0):
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
        print(call('model_animate', f'anim-{n}', {'prompt': p, 'model': 'hy-motion', 'durationSeconds': sec}), flush=True)
    for n in names:
        print(poll(f'anim-{n}', 600), flush=True)


def sfx(ids):
    names = [f'sfx-{i}-{t}' for i in ids for t in range(1, TAKES + 1)]
    for n in names:
        p, sec = SFX[n.split('-')[1]]
        print(call('sfx_generate', n, {'prompt': p, 'model': 'seed-audio', 'targetDuration': sec}), flush=True)
    for n in names:
        print(poll(n, 600), flush=True)


def audio_of(folder):
    f = RUNS / folder
    have = sorted(f.rglob('*.mp3'))
    if have:
        return have[0]
    res = json.loads((f / 'result.json').read_text(encoding='utf-8'))
    a = res.get('audio') or (res.get('result') or {}).get('audio')
    url = a if isinstance(a, str) else (a or {}).get('url')
    dst = f / 'take.mp3'; urllib.request.urlretrieve(url, dst)
    return dst


def ff(args):
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error'] + args, capture_output=True, text=True)
    if r.returncode:
        print('ffmpeg', r.stderr[-300:])


def stats(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(path), '-af', 'volumedetect,silencedetect=n=-40dB:d=0.25', '-f', 'null', '-'], capture_output=True, text=True)
    e = r.stderr
    g = lambda k: float(e.split(k)[1].split('dB')[0]) if k in e else -99.0
    dur = [l for l in e.splitlines() if 'Duration:' in l]
    d = dur[0].split('Duration:')[1].split(',')[0].strip() if dur else '?'
    sil = sum(float(l.split('silence_duration:')[1]) for l in e.splitlines() if 'silence_duration:' in l)
    return {'dur': d, 'mean': g('mean_volume:'), 'max': g('max_volume:'), 'silence': round(sil, 2)}


def listen():
    for i in SFX:
        for t in range(1, TAKES + 1):
            f = f'sfx-{i}-{t}'
            if (RUNS / f / 'result.json').is_file():
                print(f, stats(audio_of(f)))


def export():
    (AUD / 'monster').mkdir(parents=True, exist_ok=True)
    man = json.loads((AUD / 'audio.json').read_text(encoding='utf-8'))
    prov = json.loads((AUD / 'provenance.json').read_text(encoding='utf-8'))
    prov = [r for r in prov if not str(r.get('file', '')).startswith('assets/audio/monster/')]
    man['monster'] = {}
    for i, (prompt, sec) in SFX.items():
        folder = f'sfx-{i}-{PICKS.get(i, 1)}'
        src = audio_of(folder)
        dst = AUD / 'monster' / f'{i}.mp3'
        st = stats(src)
        gain = -3.0 - st['max']
        if i == 'growl':  # a bed under everything else: quieter, a short fade at each end so the loop seam is soft
            af = f'volume={gain - 4:.1f}dB,afade=t=in:d=0.08,areverse,afade=t=in:d=0.08,areverse'
        else:
            af = f'silenceremove=start_periods=1:start_threshold=-50dB,volume={gain:.1f}dB,areverse,afade=t=in:d=0.1,areverse'
        tmp = RUNS / f'_{i}.wav'
        ff(['-i', str(src), '-af', af, '-ac', '1', '-ar', '44100', str(tmp)])
        fix = (-3.0 - (4 if i == 'growl' else 0)) - stats(tmp)['max']  # the downmix and resample move the peak; trim it
        ff(['-i', str(tmp), '-af', f'volume={fix:.1f}dB', '-b:a', '96k', str(dst)]); tmp.unlink()
        man['monster'][i] = f'monster/{i}.mp3'
        job = json.loads((RUNS / folder / 'job.json').read_text(encoding='utf-8'))
        res = json.loads((RUNS / folder / 'result.json').read_text(encoding='utf-8'))
        prov.append({'file': f'assets/audio/monster/{i}.mp3', 'provider': 'sorceress', 'tool': 'sfx_generate', 'model': 'seed-audio',
                     'job_id': job.get('jobId') or res.get('jobId'), 'credits': res.get('creditsCharged'), 'prompt': prompt,
                     'receipt': str((RUNS / folder).relative_to(ROOT)).replace('\\', '/'), 'rights': RIGHTS})
    for name, data, kw in (('audio.json', man, {}), ('provenance.json', prov, {'ensure_ascii': False})):
        nl = '\r\n' if b'\r\n' in (AUD / name).read_bytes() else '\n'  # keep the file's own line endings
        with open(AUD / name, 'w', encoding='utf-8', newline='') as f:
            f.write((json.dumps(data, indent=1, **kw) + '\n').replace('\n', nl))
    print('monster sounds:', len(man['monster']))


def prov():
    """assets/monster/provenance.json: the concept, mesh, rig and motion receipts behind monster.glb."""
    rows = []
    for folder, tool, note in [('concept-b', 'image_generate', 'concept (picked over concept-a, a flat cartoon drawing)'), ('concept-a', 'image_generate', 'rejected concept'),
                               ('mesh', 'model_generate', 'meshy-7 image-to-3D of concept-b'), ('rig', 'model_rig', 'auto-rig, 24 Mixamo-named bones'),
                               ('anim-idle', 'model_animate', 'clip idle'), ('anim-walk', 'model_animate', 'clip walk'), ('anim-run', 'model_animate', 'clip run'),
                               ('anim-roar', 'model_animate', 'clip roar'), ('anim-kill2', 'model_animate', 'clip kill'), ('anim-kill', 'model_animate', 'clip slam'),
                               ('anim-kill3', 'model_animate', 'rejected kill take (falls over)')]:
        res, f = result(folder)
        job = json.loads((f / 'job.json').read_text(encoding='utf-8'))
        inp = job.get('input') or {}
        t = datetime.fromisoformat(job['created_at']).astimezone(CDT)
        rows.append({'file': 'assets/monster/old/monster.glb', 'part': note, 'provider': 'sorceress', 'tool': tool, 'model': inp.get('model', 'auto-rig'),
                     'job_id': res.get('jobId') or (job.get('response') or {}).get('jobId'), 'credits': res.get('creditsCharged') or (job.get('response') or {}).get('estimatedCredits'),
                     'date': t.date().isoformat(), 'time_ct': t.strftime('%H:%M'), 'prompt': inp.get('prompt') or inp.get('imageUrl') or inp.get('modelUrl'),
                     'receipt': f.relative_to(ROOT).as_posix(), 'rights': RIGHTS})
    rows.append({'file': 'assets/monster/old/monster.glb', 'part': 'retarget and bake', 'tool': 'tools/v5_monster_rig.py (Blender 5.2, headless)',
                 'note': 'hy-motion SMPL joints retargeted onto the rig, loops cut and closed, feet kept on the floor, scaled to 2.8 m, texture 1024 px JPEG'})
    out = ROOT / 'assets' / 'monster' / 'old' / 'provenance.json'  # (the felt monster, since replaced: tools/v6_monster.py)
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
    elif cmd == 'rig': rig(*(['rig' + arg, int(arg)] if arg else []))
    elif cmd == 'anims': anims(arg.split(',') if arg else list(ANIMS))
    elif cmd == 'sfx': sfx(arg.split(',') if arg else list(SFX))
    elif cmd == 'listen': listen()
    elif cmd == 'export': export()
    elif cmd == 'prov': prov()
    elif cmd == 'spent': spent()
    else: print(__doc__)
