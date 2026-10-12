"""Sorceress PBR materials for the v4 rooms (plan-v4 section 4, phase 5): Material Forge (material_generate, nano-banana-2
2K, 12 credits; the normal, roughness and AO maps are derived free). One receipt folder per material under
runs/sorceress/v4-mats/<name>; a folder that already has a job is skipped. `export` writes assets/mats/<name>-color.jpg
(1024 px) and <name>-normal.jpg (512 px) plus a roughness value, and assets/mats/provenance.json.

    python tools/v4_mats.py make [name,name]
    python tools/v4_mats.py export
"""
import glob, io, json, os, subprocess, sys, zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / 'runs' / 'sorceress' / 'v4-mats'
OUT = ROOT / 'assets' / 'mats'
HELPER = ['python', 'C:/dev/playground-td/.claude/skills/sorceress-game-assets/scripts/sorceress.py', '--env', 'C:/dev/mr-mak-workspace/.env']
CDT = timezone(timedelta(hours=-5))
FLAT = ('Seamless tileable texture, perfectly flat top-down orthographic view, even shadowless lighting, the pattern repeats '
        'cleanly at the edges, no perspective, no objects, no text.')

MATS = {  # name: (prompt, roughness)
    'carpetFloor': ('Luxury casino carpet: deep crimson wool pile with an ornate gold and burgundy Art Deco pattern of swirls and fans.', 0.95),
    'carpetSlots': ('Luxury casino carpet: deep navy blue wool pile with a gold Art Deco pattern of fans and starbursts.', 0.95),
    'carpetVip': ('Luxury lounge carpet: plum purple wool pile with a fine gold diamond lattice and small gold rosettes.', 0.95),
    'carpetArcade': ('Retro arcade carpet: midnight blue pile with scattered neon pink, cyan, yellow and green triangles, squiggles and rings.', 0.95),
    'wallFloor': ('Art Deco wallpaper: deep crimson flocked damask with gold fan medallions and fine gold pinstripes.', 0.8),
    'wallBar': ('Warm wood wall paneling: dark walnut panels with thin gold inlay lines and Art Deco corner fans.', 0.55),
    'wallArcade': ('Retro arcade wallpaper: dark indigo with glowing neon pink and cyan geometric Art Deco zigzags.', 0.7),
    'wallRace': ('Seaside Art Deco wallpaper: deep teal with pale aqua wave scallops and thin gold lines.', 0.75),
    'wallSlots': ('Art Deco wallpaper: midnight navy silk with gold sunburst fans in a repeating grid.', 0.75),
    'wallVip': ('Luxury wallpaper: deep purple velvet flocked damask with a soft gold sheen.', 0.8),
    'ceiling': ('Coffered ceiling seen from below: square recessed panels of dark lacquered wood with gold leaf edges and a small gold rosette in each panel centre.', 0.6),
    'woodFloor': ('Polished oak herringbone parquet floor, warm honey and walnut tones, glossy varnish.', 0.35),
    'tileWall': ('Glossy pale mint green subway wall tiles with thin white grout lines.', 0.2),
    'tileFloor': ('Ceramic floor tiles in a teal and cream checkerboard with thin grout lines, slightly glossy.', 0.3),
    'marble': ('Polished white Carrara marble with soft grey and thin gold veins.', 0.2),
    'brick': ('Old red brick wall with dark mortar, a few chipped and sooty bricks, back-alley grime.', 0.85),
    'asphalt': ('Wet dark asphalt road surface with fine gravel, small puddles and a few cracks.', 0.5),
    'feltGreen': ('Billiard cloth: plain dark green woven wool baize fabric with a fine fibrous nap, one uniform colour.', 0.95),
    'feltBlue': ('Billiard cloth: plain deep royal blue woven wool baize fabric with a fine fibrous nap, one uniform colour.', 0.95),
    'feltRed': ('Billiard cloth: plain deep red woven wool baize fabric with a fine fibrous nap, one uniform colour.', 0.95),
    'velvet': ('Plush crimson velvet upholstery fabric with a soft crushed sheen.', 0.85),
    'leather': ('Padded oxblood leather upholstery with a soft grain and fine stitching.', 0.45),
    'goldLeaf': ('Hammered gold leaf metal surface with soft brushed highlights.', 0.3),
    'brass': ('Brushed antique brass metal with soft patina.', 0.35),
    'darkWood': ('Dark mahogany wood planks with a rich glossy grain.', 0.45),
}


def make(names):
    started = []
    for n in names:
        n, _, tag = n.partition('-')  # name-r1: a second try in its own receipt folder (the first was refused or failed)
        out = RUNS / (f'{n}-{tag}' if tag else n)
        if (out / 'job.json').is_file():
            print('have', out.name); started.append(out.name); continue
        RUNS.mkdir(parents=True, exist_ok=True)
        prompt, rough = MATS[n]
        body = {'prompt': f'{prompt} {FLAT}', 'model': os.environ.get('MAT_MODEL', 'nano-banana-2'), 'params': {'resolution': '2K'}, 'seamless': True, 'name': n,
                'mapSize': 1024, 'aspectRatio': '1:1', 'properties': {'roughness': rough}}
        inp = RUNS / f'{out.name}.json'; inp.write_text(json.dumps(body), encoding='utf-8')
        r = subprocess.run(HELPER + ['call', 'material_generate', '--input', str(inp), '--out', str(out), '--approved'], capture_output=True, text=True)
        print(out.name, 'ok' if r.returncode == 0 else 'FAILED ' + (r.stderr or r.stdout)[-300:])
        if r.returncode == 0:
            started.append(out.name)
    for n in started:
        r = subprocess.run(HELPER + ['poll', '--job', str(RUNS / n / 'job.json'), '--wait', '900', '--retry-failed', '1', '--approved'], capture_output=True, text=True)
        print(n, 'succeeded' if '"succeeded"' in r.stdout else 'NOT DONE ' + r.stdout[-300:])


def export():
    from PIL import Image
    OUT.mkdir(parents=True, exist_ok=True)
    prov, rough = [], {}
    for n, (prompt, r) in MATS.items():
        folder = next((RUNS / f'{n}{s}' for s in ('-r2', '-r1', '') if (RUNS / f'{n}{s}' / 'result.json').is_file()), None)
        if not folder:
            print('missing', n); continue
        z = next(iter(glob.glob(str(folder / 'assets' / '*.zip'))), None)
        if not z:
            print('no package', n); continue
        with zipfile.ZipFile(z) as zf:
            names = zf.namelist()
            col = Image.open(io.BytesIO(zf.read('textures/baseColor.png'))).convert('RGB')
            nrm = Image.open(io.BytesIO(zf.read('textures/normal.png'))).convert('RGB') if 'textures/normal.png' in names else None
        col.resize((1024, 1024), Image.LANCZOS).save(OUT / f'{n}-color.jpg', quality=86)
        if nrm:
            nrm.resize((512, 512), Image.LANCZOS).save(OUT / f'{n}-normal.jpg', quality=90)
        rough[n] = r
        job = json.loads((folder / 'job.json').read_text(encoding='utf-8'))
        res = json.loads((folder / 'result.json').read_text(encoding='utf-8'))
        t = datetime.fromisoformat(job['created_at']).astimezone(CDT)
        for f in [f'assets/mats/{n}-color.jpg'] + ([f'assets/mats/{n}-normal.jpg'] if nrm else []):
            prov.append({'file': f, 'provider': 'sorceress', 'tool': 'material_generate', 'model': job['input'].get('model'), 'job_id': res.get('jobId'),
                         'credits': res.get('creditsCharged'), 'date': t.date().isoformat(), 'time_ct': t.strftime('%H:%M'), 'prompt': job['input']['prompt'],
                         'receipt': str(folder.relative_to(ROOT)).replace('\\', '/'), 'rights': 'Sorceress output is ours (Steve, 2026-09-25)'})
    (OUT / 'provenance.json').write_text(json.dumps(prov, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    (OUT / 'mats.json').write_text(json.dumps({n: {'roughness': r, 'normal': (OUT / f'{n}-normal.jpg').is_file()} for n, r in rough.items()}, indent=1) + '\n', encoding='utf-8')
    print(len(rough), 'materials exported')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'make':
        make(sys.argv[2].split(',') if len(sys.argv) > 2 else list(MATS))
    elif cmd == 'export':
        export()
    else:
        print(__doc__)
