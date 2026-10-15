"""Gesture clips for the plush beans (plan-v4 section 4, phase 1): Sorceress model_animate (hy-motion, 3 credits each),
one receipt folder per clip under runs/sorceress/v4-chars/anim-<name>. `export` writes assets/anim/<name>.json (SMPL
joint positions at 15 fps, 3 decimals) for src/3d/plush.js to retarget, plus a provenance row per clip.

    python tools/v4_anims.py buy [name,name]   # skips clips that already have a receipt
    python tools/v4_anims.py export
"""
import glob, json, subprocess, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / 'runs' / 'sorceress' / 'v4-chars'
OUT = ROOT / 'assets' / 'anim'
HELPER = ['python', 'C:/dev/playground-td/.claude/skills/sorceress-game-assets/scripts/sorceress.py', '--env', 'C:/dev/mr-mak-workspace/.env']
CDT = timezone(timedelta(hours=-5))

CLIPS = {  # name: (prompt, seconds)
    'cheer': ('cheering with both arms raised in celebration, small happy jumps', 3),
    'despair': ('puts both hands on top of the head in despair, then slumps the shoulders, standing in place', 2.5),
    'gasp': ('startled gasp, flinches back a step and raises both hands to the face in shock', 2),
    'point': ('points forward accusingly with the right arm fully extended, shaking the finger, standing in place', 2.5),
    'shrug': ('shrugs both shoulders with the palms turned up, unsure, standing in place', 2),
    'cry': ('crying, covers the face with both hands, shoulders shaking, standing in place', 3),
    'laugh': ('laughing heartily, leans back and holds the belly with both hands, standing in place', 2.5),
    'stab': ('one quick stabbing thrust forward with the right hand, a short lunge, then steps back', 1.5),
    'pour': ('holds a cup out in the right hand and tips it over to pour it onto the floor, standing in place', 2),
    'sip': ('raises the right hand to the mouth to drink from a cup, then lowers it, standing in place', 2),
    'wave': ('friendly wave with the right hand raised high, standing in place', 2),
    'dance': ('happy little dance, bouncing from side to side and swinging both arms', 4),
    'lever': ('reaches up with the right hand and pulls a lever down hard, standing in place', 1.5),
    'tap': ('taps the table in front twice with the right hand, then waves the hand flat over it, standing in place', 2),
    'clap': ('claps both hands together excitedly, standing in place', 2),
    'facepalm': ('slaps the forehead with the right palm and shakes the head, standing in place', 2),
    'nervous': ('nervous fidgeting, wringing both hands and glancing around, standing in place', 3),
    'lookaround': ('looks around suspiciously, turning the head and upper body left then right, standing in place', 3),
    'thinking': ('rests the chin on the right hand, thinking, standing in place', 2.5),
    'bow': ('a proud theatrical bow with one arm across the waist, then straightens up, standing in place', 2),
    # placing chips at the tables (Steve 2026-10-15)
    'chips': ('reaches forward and down with the right hand to set a small stack of chips on a table in front at waist height, then brings the hand back, standing in place', 2),
    'push': ('pushes a stack of chips forward across a table in front at waist height with the right hand flat, then pulls the hand back, standing in place', 2),
    # the blackout monster's victim (2026-10-15): played on the bean while the monster mauls it (src/3d/monster.js)
    'snatched': ('a person is seized by a monster: flinches back in terror with both hands raised, then flails both arms and kicks the legs wildly as if lifted off the ground, then goes limp and collapses to the floor', 2.2),
}


def buy(names):
    for n in names:
        out = RUNS / f'anim-{n}'
        if (out / 'job.json').is_file():
            print('have', n); continue
        prompt, secs = CLIPS[n]
        body = json.dumps({'prompt': prompt, 'model': 'hy-motion', 'durationSeconds': secs})
        r = subprocess.run(HELPER + ['call', 'model_animate', '--json', body, '--out', str(out), '--approved'], capture_output=True, text=True)
        print(n, 'ok' if r.returncode == 0 else 'FAILED ' + (r.stderr or r.stdout)[-300:])
    for n in names:
        r = subprocess.run(HELPER + ['poll', '--job', str(RUNS / f'anim-{n}' / 'job.json'), '--wait', '600', '--retry-failed', '1', '--approved'], capture_output=True, text=True)
        print(n, 'succeeded' if '"succeeded"' in r.stdout else 'NOT DONE ' + r.stdout[-300:])


def export():
    OUT.mkdir(parents=True, exist_ok=True)
    prov = []
    for n in CLIPS:
        folder = next((RUNS / f'anim-{n}{s}' for s in ('-retry1', '') if glob.glob(str(RUNS / f'anim-{n}{s}' / 'assets' / '*.json'))), None)
        if folder is None:
            print('missing', n); continue
        a = json.loads(Path(glob.glob(str(folder / 'assets' / '*.json'))[0]).read_text(encoding='utf-8'))
        step = max(1, round(a['fps'] / 15))
        frames = a['smpl_joints'][::step]
        flat = [round(v, 3) for fr in frames for j in fr for v in j]
        (OUT / f'{n}.json').write_text(json.dumps({'fps': a['fps'] / step, 'n': len(frames), 'j': flat}, separators=(',', ':')), encoding='utf-8')
        job = json.loads((folder / 'job.json').read_text(encoding='utf-8'))
        res = json.loads((folder / 'result.json').read_text(encoding='utf-8'))
        t = datetime.fromisoformat(job['created_at']).astimezone(CDT)
        prov.append({'file': f'assets/anim/{n}.json', 'provider': 'sorceress', 'tool': 'model_animate', 'model': 'hy-motion', 'job_id': res.get('jobId'),
                     'credits': res.get('creditsCharged'), 'date': t.date().isoformat(), 'time_ct': t.strftime('%H:%M'), 'prompt': a.get('prompt'),
                     'seed': a.get('seed'), 'receipt': str(folder.relative_to(ROOT)).replace('\\', '/'), 'rights': 'Sorceress output is ours (Steve, 2026-09-25)'})
    (OUT / 'provenance.json').write_text(json.dumps(prov, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(len(prov), 'clips exported')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'buy':
        buy(sys.argv[2].split(',') if len(sys.argv) > 2 else list(CLIPS))
    elif cmd == 'export':
        export()
    else:
        print(__doc__)
