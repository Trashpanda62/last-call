"""Export the v4 character assets from their Sorceress receipts (runs/sorceress/v4-chars) and write provenance.

- assets/portraits/<Name>-<emotion>.webp: 192 px meeting portraits. A redo (-r2, then -r1) wins over the first take.
- assets/portraits/provenance.json and assets/chars/provenance.json: one row per file (provider, model, job id, credits,
  date, CT time, prompt, rights). The rigged GLBs in assets/chars are built by tools/rig_bean.py from the meshes listed.

    python tools/v4_export.py
"""
import glob, json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / 'runs' / 'sorceress' / 'v4-chars'
NAMES = ['Red', 'Mint', 'Biscuit', 'Lola', 'Duke', 'Pip', 'Coco', 'Ozzie', 'Teal', 'Snow', 'Moss', 'Ruby', 'Sky', 'Peach', 'Ink', 'Lime']
EMOS = ['calm', 'nervous', 'angry', 'smug', 'crying']
CDT = timezone(timedelta(hours=-5))  # no tzdata on this PC; these jobs ran in October (daylight time)
RIGHTS = 'Sorceress output is ours (Steve, 2026-09-25)'
MESHES = {'bean': ('beanMesh', 'beanA (picks/v4/bean-a.jpg)'), 'round': ('beanRoundMesh', 'beanRound'), 'croupier': ('croupierMesh', 'croupier'),
          'bartender': ('bartenderMesh', 'bartender'), 'guard': ('guardMesh', 'guard')}


def row(folder, file):
    job = json.loads((folder / 'job.json').read_text(encoding='utf-8'))
    res = json.loads((folder / 'result.json').read_text(encoding='utf-8'))
    t = datetime.fromisoformat(job['created_at']).astimezone(CDT)
    inp = job['input']
    return {'file': file, 'provider': 'sorceress', 'tool': job['tool'], 'model': inp.get('model'), 'job_id': res.get('jobId'),
            'credits': res.get('creditsCharged'), 'date': t.date().isoformat(), 'time_ct': t.strftime('%H:%M'),
            'prompt': inp.get('prompt') or f"image-to-3D from {inp.get('imageUrl')}", 'params': inp.get('params'),
            'refImages': inp.get('refImages'), 'receipt': str(folder.relative_to(ROOT)).replace('\\', '/'), 'rights': RIGHTS}


def main():
    out = ROOT / 'assets' / 'portraits'; out.mkdir(parents=True, exist_ok=True)
    prov = []
    for n in NAMES:
        for e in EMOS:
            folder = next((RUNS / f'p-{n}-{e}{s}' for s in ('-r2', '-r1', '') if glob.glob(str(RUNS / f'p-{n}-{e}{s}' / 'assets' / '*.png'))), None)
            if folder is None:
                print('missing', n, e); continue
            src = glob.glob(str(folder / 'assets' / '*.png'))[0]
            f = out / f'{n}-{e}.webp'
            Image.open(src).convert('RGB').resize((192, 192), Image.LANCZOS).save(f, 'WEBP', quality=82, method=6)
            prov.append(row(folder, f'assets/portraits/{f.name}'))
    (out / 'provenance.json').write_text(json.dumps(prov, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    chars = []
    for k, (mesh, design) in MESHES.items():
        r = row(RUNS / mesh, f'assets/chars/{k}.glb'); r['note'] = f'Meshy 7 mesh of the {design} design, rigged and retextured to 1024 px by tools/rig_bean.py'
        chars.append(r)
        if design != 'beanA (picks/v4/bean-a.jpg)':
            chars.append(row(RUNS / design, f'runs/sorceress/v4-chars/{design} (design image)'))
    (ROOT / 'assets' / 'chars' / 'provenance.json').write_text(json.dumps(chars, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(len(prov), 'portraits,', len(chars), 'character rows')


if __name__ == '__main__':
    main()
