"""Sorceress table art for v4 (plan-v4 section 4, phase 6): six chip faces, the card back, the three court cards and an
embroidered felt crest. One receipt folder per image under runs/sorceress/v4-art/<name>; a folder that already has a
job is skipped. `export` writes assets/art/<name>.webp and assets/art/provenance.json.

    python tools/v4_art.py make [name,name]
    python tools/v4_art.py export
"""
import glob, json, subprocess, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / 'runs' / 'sorceress' / 'v4-art'
OUT = ROOT / 'assets' / 'art'
HELPER = ['python', 'C:/dev/playground-td/.claude/skills/sorceress-game-assets/scripts/sorceress.py', '--env', 'C:/dev/mr-mak-workspace/.env']
CDT = timezone(timedelta(hours=-5))
BEAN_A = 'https://wizardgenie-media.s3.us-west-004.backblazeb2.com/generations/14b713ad-480d-44e5-a794-18be8c0a897d/3763125f-e33e-4057-bb44-697c89554aae/nano-banana-pro-1.png'

CHIP = ('A single casino clay poker chip seen exactly from straight above, a perfect circle filling the whole square frame edge to '
        'edge: a {col} chip with eight white rectangular edge inserts evenly spaced around the rim, a thin gold ring inside the rim, '
        'and a plain smooth {col} centre disc left completely empty for a number. Soft fabric-like clay texture, subtle wear, even '
        'soft lighting, no shadow, no text, no numbers, no letters, no logo.')
COURT = ('Playing card court art: a {who} as a plush-toy bean character sewn from soft {col} felt with black button eyes and a '
         'stitched face, the same plush style as the reference image, wearing {dress}, holding {holds}. Half-length portrait, '
         'centred, framed by a thin ornate gold Art Deco border on a cream card background, rich warm colours, crisp detail, '
         'portrait orientation, no text, no letters, no numbers, no suit symbols.')
ART = {  # name: (model, prompt, aspect, refs)
    'chip0': ('gpt-image-2', CHIP.format(col='cream white'), '1:1', None),
    'chip1': ('gpt-image-2', CHIP.format(col='bright red'), '1:1', None),
    'chip2': ('gpt-image-2', CHIP.format(col='glossy black'), '1:1', None),
    'chip3': ('gpt-image-2', CHIP.format(col='royal purple'), '1:1', None),
    'chip4': ('gpt-image-2', CHIP.format(col='golden orange'), '1:1', None),
    'chip5': ('gpt-image-2', CHIP.format(col='emerald green'), '1:1', None),
    'king': ('nano-banana-2', COURT.format(who='king', col='red', dress='a small gold crown and an ermine-trimmed velvet robe', holds='a golden sceptre'), '2:3', [BEAN_A]),
    'queen': ('nano-banana-2', COURT.format(who='queen', col='pink', dress='a small jewelled tiara and a ruffled velvet gown', holds='a single red rose'), '2:3', [BEAN_A]),
    'jack': ('nano-banana-2', COURT.format(who='jack, a young page', col='lemon yellow', dress='a feathered cap and a striped tabard', holds='a short halberd'), '2:3', [BEAN_A]),
    'cardBack': ('gpt-image-2', 'The back of a luxury playing card: deep burgundy with an intricate symmetrical gold Art Deco pattern of fans, '
                 'sunbursts and fine lines, a gold double border, a small cocktail glass emblem in the centre. Flat, straight-on, '
                 'the card fills the whole portrait frame, no text, no letters.', '2:3', None),
    'crest': ('gpt-image-2', 'A gold thread embroidery crest stitched onto plain dark green felt: an Art Deco fan with a cocktail glass and '
              'two dice in the middle, framed by laurel leaves, satin-stitch gold with tiny raised stitches. Flat, straight-on, centred '
              'on the plain felt, no text, no letters, no numbers.', '1:1', None),
}


def make(names):
    started = []
    for n in names:
        out = RUNS / n
        if (out / 'job.json').is_file():
            print('have', n); started.append(n); continue
        RUNS.mkdir(parents=True, exist_ok=True)
        model, prompt, ar, refs = ART[n]
        body = {'model': model, 'prompt': prompt, 'aspectRatio': ar, 'params': {'resolution': '1K'}}
        if refs:
            body['refImages'] = refs
        inp = RUNS / f'{n}.json'; inp.write_text(json.dumps(body, ensure_ascii=False), encoding='utf-8')
        r = subprocess.run(HELPER + ['call', 'image_generate', '--input', str(inp), '--out', str(out), '--approved'], capture_output=True, text=True)
        print(n, 'ok' if r.returncode == 0 else 'FAILED ' + (r.stderr or r.stdout)[-300:])
        if r.returncode == 0:
            started.append(n)
    for n in started:
        r = subprocess.run(HELPER + ['poll', '--job', str(RUNS / n / 'job.json'), '--wait', '600', '--retry-failed', '1', '--approved'], capture_output=True, text=True)
        print(n, 'succeeded' if '"succeeded"' in r.stdout else 'NOT DONE ' + r.stdout[-300:])


def export():
    from PIL import Image
    OUT.mkdir(parents=True, exist_ok=True)
    prov = []
    for n in ART:
        folder = next((RUNS / f'{n}{s}' for s in ('-r1', '') if glob.glob(str(RUNS / f'{n}{s}' / 'assets' / '*.png'))), None)
        if not folder:
            print('missing', n); continue
        im = Image.open(glob.glob(str(folder / 'assets' / '*.png'))[0]).convert('RGB')
        size = (256, 256) if n.startswith('chip') else (512, 512) if n == 'crest' else (256, 384)
        im.resize(size, Image.LANCZOS).save(OUT / f'{n}.webp', 'WEBP', quality=86, method=6)
        job = json.loads((folder / 'job.json').read_text(encoding='utf-8'))
        res = json.loads((folder / 'result.json').read_text(encoding='utf-8'))
        t = datetime.fromisoformat(job['created_at']).astimezone(CDT)
        prov.append({'file': f'assets/art/{n}.webp', 'provider': 'sorceress', 'tool': 'image_generate', 'model': job['input']['model'],
                     'job_id': res.get('jobId'), 'credits': res.get('creditsCharged'), 'date': t.date().isoformat(), 'time_ct': t.strftime('%H:%M'),
                     'prompt': job['input']['prompt'], 'refImages': job['input'].get('refImages'), 'receipt': str(folder.relative_to(ROOT)).replace('\\', '/'),
                     'rights': 'Sorceress output is ours (Steve, 2026-09-25)'})
    (OUT / 'provenance.json').write_text(json.dumps(prov, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(len(prov), 'images exported')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'make':
        make(sys.argv[2].split(',') if len(sys.argv) > 2 else list(ART))
    elif cmd == 'export':
        export()
    else:
        print(__doc__)
