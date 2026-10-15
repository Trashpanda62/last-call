"""Death sounds, one per player's pick (Steve, 2026-10-14: "everyone should be able to pick their death sound when they
design their character at game start"). Sorceress sound effects (seed-audio, about 2 s, 1 credit a second), two takes
each; receipts go to runs/sorceress/v5-death/<id>-<take> (git-ignored). `export` takes the pick in PICKS (else take 1),
trims the lead-in, levels the peak and writes assets/audio/death/<id>.mp3, the "death" group of assets/audio/audio.json
and rows in assets/audio/provenance.json. A take that has a receipt is never paid twice. No words in any of them.

    python tools/v5_death.py make [id,id]
    python tools/v5_death.py export
"""
import json, subprocess, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / 'runs' / 'sorceress' / 'v5-death'
OUT = ROOT / 'assets' / 'audio'
HELPER = ['python', 'C:/dev/playground-td/.claude/skills/sorceress-game-assets/scripts/sorceress.py', '--env', 'C:/dev/mr-mak-workspace/.env']
TAKES = 2

DEATH = {  # id: prompt (the labels players see are in src/config.js DEATH_SOUNDS, same order)
    'scream': 'a short shrill cartoon scream of fright, high pitched, no words',
    'wail': 'a long falling cartoon wail fading away into the distance, like a character dropping off a cliff, no words',
    'gasp': 'a sharp shocked gasp and then a soft heavy thud of a body on carpet, no words',
    'squeak': "a plush toy's squeaker giving one long sad deflating squeak",
    'duck': 'a rubber duck squeak slowly wheezing out as the air leaves it',
    'trombone': 'a sad trombone playing wah wah wah waaah, comedic',
    'whistle': 'a slide whistle falling from high to low, then a soft bonk',
    'pop': 'a balloon popping, then soft fluffy stuffing pattering down',
    'ghost': 'a spooky cartoon ghost wooo rising up and fading away',
    'organ': 'a dramatic pipe organ chord, dun dun dunnn, short and ominous',
    'slots': 'a slot machine powering down with a sad descending electronic bleep and a final click',
    'glass': 'a cocktail glass dropping and shattering on a hard floor, ice cubes skittering away',
}
# More takes where the first two were too short or quiet: name: (prompt, seconds)
EXTRA = {
    'scream-3': ('a cartoon scream of terror, about one second long, high pitched, no words', 1.5),
    'scream-4': ('a cartoon scream of terror, about one second long, high pitched, no words', 1.5),
    'trombone-3': ('a sad trombone playing wah wah wah waaah, comedic, the last note long and wobbly', 3),
    'wail-3': ('a long falling cartoon wail fading away into the distance, like a character dropping off a cliff, no words', 3),
}
# The take each one ships: the one with the most sound in it and a clean peak (ffmpeg volumedetect and silencedetect);
# organ-1 was refused by the provider's audio filter (not charged). The rest take 1.
PICKS = {'duck': 2, 'glass': 2, 'organ': 2, 'pop': 2, 'slots': 2, 'scream': 3, 'trombone': 3, 'wail': 3}


def call(folder, body):
    out = RUNS / folder
    if (out / 'job.json').is_file():
        return 'have ' + folder
    RUNS.mkdir(parents=True, exist_ok=True)
    inp = RUNS / f'{folder}.json'; inp.write_text(json.dumps(body, ensure_ascii=False), encoding='utf-8')
    r = subprocess.run(HELPER + ['call', 'sfx_generate', '--input', str(inp), '--out', str(out), '--approved'], capture_output=True, text=True)
    return folder + (' ok' if r.returncode == 0 else ' FAILED ' + (r.stderr or r.stdout)[-300:])


def poll(folder, wait=600):
    r = subprocess.run(HELPER + ['poll', '--job', str(RUNS / folder / 'job.json'), '--wait', str(wait), '--retry-failed', '1', '--approved'], capture_output=True, text=True)
    return folder + (' succeeded' if '"succeeded"' in r.stdout else ' NOT DONE ' + (r.stdout or r.stderr)[-300:])


def make(ids):
    names = [f'{i}-{t}' for i in ids for t in range(1, TAKES + 1)] + [n for n in EXTRA if n.rsplit('-', 1)[0] in ids]
    for n in names:
        prompt, sec = EXTRA.get(n, (DEATH[n.rsplit('-', 1)[0]], 2))
        print(call(n, {'prompt': prompt, 'model': 'seed-audio', 'targetDuration': sec}), flush=True)
    for n in names:
        print(poll(n), flush=True)


def audio_of(folder):
    """The downloaded mp3 in a receipt folder, fetched from result.json if the helper didn't save one."""
    f = RUNS / folder
    have = sorted(f.rglob('*.mp3'))
    if have:
        return have[0]
    res = json.loads((f / 'result.json').read_text(encoding='utf-8'))
    a = res.get('audio') or (res.get('result') or {}).get('audio')
    url = a if isinstance(a, str) else (a or {}).get('url') if isinstance(a, dict) else (a[0] if isinstance(a, list) and a and isinstance(a[0], str) else (a[0] or {}).get('url') if isinstance(a, list) and a else None)
    if not url:
        raise SystemExit(f'no audio in {f / "result.json"}')
    dst = f / 'take.mp3'; urllib.request.urlretrieve(url, dst)
    return dst


def ff(args):
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error'] + args, capture_output=True, text=True)
    if r.returncode:
        print('ffmpeg', r.stderr[-200:])


def peak(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(path), '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    m = [l for l in r.stderr.splitlines() if 'max_volume' in l]
    return float(m[0].split('max_volume:')[1].split('dB')[0]) if m else -2.0


def export():
    (OUT / 'death').mkdir(parents=True, exist_ok=True)
    man = json.loads((OUT / 'audio.json').read_text(encoding='utf-8'))
    prov = json.loads((OUT / 'provenance.json').read_text(encoding='utf-8'))
    prov = [r for r in prov if not str(r.get('file', '')).startswith('assets/audio/death/')]
    man['death'] = {}
    for i, prompt in DEATH.items():
        folder = f'{i}-{PICKS.get(i, 1)}'
        src = audio_of(folder)
        dst = OUT / 'death' / f'{i}.mp3'
        gain = -3.5 - peak(src)  # mono, start on the sound, peaks near -3 dBFS like the other effects, at most 3 s
        ff(['-i', str(src), '-af', f'silenceremove=start_periods=1:start_threshold=-48dB,volume={gain:.1f}dB,areverse,afade=t=in:d=0.12,areverse',
            '-ac', '1', '-ar', '44100', '-b:a', '96k', str(dst)])  # (a short fade on the tail: some takes stop dead at the 2 s mark)
        man['death'][i] = f'death/{i}.mp3'
        job = json.loads((RUNS / folder / 'job.json').read_text(encoding='utf-8'))
        prov.append({'file': f'assets/audio/death/{i}.mp3', 'provider': 'sorceress', 'tool': 'sfx_generate', 'model': 'seed-audio',
                     'job_id': job.get('jobId') or job.get('id') or (job.get('jobs') or [{}])[0].get('jobId'), 'prompt': EXTRA.get(folder, (prompt,))[0],
                     'receipt': str((RUNS / folder).relative_to(ROOT)).replace('\\', '/'), 'rights': 'Sorceress output is ours (Steve, 2026-09-25)'})
    (OUT / 'audio.json').write_text(json.dumps(man, indent=1) + '\n', encoding='utf-8')
    (OUT / 'provenance.json').write_text(json.dumps(prov, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print('death sounds:', len(man['death']))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'make':
        make(sys.argv[2].split(',') if len(sys.argv) > 2 else list(DEATH))
    elif cmd == 'export':
        export()
    else:
        print(__doc__)
