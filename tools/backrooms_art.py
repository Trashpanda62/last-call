"""Sorceress art for the backrooms casino (src/3d/backrooms.js): the yellow wallpaper, the damp carpet and the acoustic
ceiling tile from Material Forge (material_generate, gpt-image-2 1K, seamless), and the fluorescent panel from
image_generate. One receipt folder per job under runs/sorceress/backrooms/<name>; a folder that already has a job is
skipped, so reruns never pay twice. `export` writes assets/backrooms/*.webp (colour 1024 px, normal 512 px), builds the
drop ceiling (a 4 x 4 grid of tiles with one 2 x 4 panel, and its glow mask) and adds rows to assets/art2/provenance.json.

    python tools/backrooms_art.py make [name,name]     (name-r1: a second take in its own receipt)
    python tools/backrooms_art.py export
"""
import glob, io, json, subprocess, sys, zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / 'runs' / 'sorceress' / 'backrooms'
OUT = ROOT / 'assets' / 'backrooms'
PROV = ROOT / 'assets' / 'art2' / 'provenance.json'
HELPER = ['python', 'C:/dev/playground-td/.claude/skills/sorceress-game-assets/scripts/sorceress.py', '--env', 'C:/dev/mr-mak-workspace/.env']
CDT = timezone(timedelta(hours=-5))
FLAT = ('Seamless tileable texture, perfectly flat straight-on orthographic view, even shadowless lighting, the pattern repeats '
        'cleanly at the edges, no perspective, no objects, no text.')

JOBS = {  # name: (tool, prompt, roughness)
    'wallpaper': ('material_generate', 'Old yellowed office wallpaper from the Backrooms: one dull mono-yellow mustard colour, a faint '
                  'repeating pattern of thin vertical stripes with small darker yellow chevrons between them, slightly damp, faint '
                  'brownish water stains and patchy discoloration, aged and dingy, flat matte paper.', 0.9),
    'carpet': ('material_generate', 'Damp old commercial office carpet from the Backrooms: short low cut pile, one dull moist '
               'beige-yellow colour with no pattern, fine fibre texture, a few slightly darker damp patches and faint stains.', 0.95),
    # second takes (Steve, 2026-10-15: "EXACTLY like the backrooms"): closer to the Level 0 photo
    'wallpaper-r1': ('material_generate', 'The Backrooms Level 0 wallpaper: pale mono-yellow old wallpaper with faint evenly spaced vertical '
                     'stripes made of tiny repeating arrow and chevron motifs in a slightly darker yellow, dingy, faint brown water '
                     'marks, and one vertical paper seam that is slightly lifted and peeling with a darker edge.', 0.9),
    'carpet-r1': ('material_generate', 'Old damp commercial office carpet from the Backrooms Level 0: short worn matted pile, mottled '
                  'brownish mustard-yellow colour, uneven blotchy darker brown wet patches and water stains, worn areas, dingy and '
                  'moist, no pattern.', 0.95),
    'tile': ('material_generate', 'Old acoustic drop-ceiling tile surface: off-white mineral fibre board yellowed with age, small '
             'random pinholes and short fissures all over, a faint pale brown water stain, matte, filling the whole frame with no '
             'grid, no edges and no frame.', 0.95),
    'panel': ('image_generate', 'A rectangular 2 by 4 foot fluorescent ceiling light panel (an office troffer) seen straight from '
              'below, lit: a glowing pale white-yellow prismatic plastic diffuser lens with a fine grid of tiny pyramid prisms, a '
              'thin off-white painted metal frame around it, the panel fills the whole image edge to edge, flat orthographic view, '
              'nothing else in the picture.', None),
}


def body(n):
    tool, prompt, rough = JOBS[n]
    n = n.partition('-')[0]
    if tool == 'image_generate':
        return {'model': 'gpt-image-2', 'prompt': prompt, 'aspectRatio': '2:3', 'params': {'resolution': '1K'}}
    return {'prompt': f'{prompt} {FLAT}', 'model': 'gpt-image-2', 'params': {'resolution': '1K'}, 'seamless': True, 'name': 'backrooms-' + n,
            'mapSize': 1024, 'aspectRatio': '1:1', 'properties': {'roughness': rough}}


def folder_of(n):
    return next((RUNS / f'{n}{s}' for s in ('-r2', '-r1', '') if (RUNS / f'{n}{s}' / 'result.json').is_file()), None)


def make(names):
    started = []
    for n in names:
        base = n if n in JOBS else n.partition('-')[0]
        out = RUNS / n
        if (out / 'job.json').is_file():
            print('have', n); started.append(n); continue
        RUNS.mkdir(parents=True, exist_ok=True)
        inp = RUNS / f'{n}.json'; inp.write_text(json.dumps(body(n if n in JOBS else base)), encoding='utf-8')
        r = subprocess.run(HELPER + ['call', JOBS[n if n in JOBS else base][0], '--input', str(inp), '--out', str(out), '--approved'], capture_output=True, text=True)
        print(n, 'ok' if r.returncode == 0 else 'FAILED ' + (r.stderr or r.stdout)[-300:])
        if r.returncode == 0:
            started.append(n)
    for n in started:
        r = subprocess.run(HELPER + ['poll', '--job', str(RUNS / n / 'job.json'), '--wait', '900', '--retry-failed', '1', '--approved'], capture_output=True, text=True)
        print(n, 'succeeded' if '"succeeded"' in r.stdout else 'NOT DONE ' + r.stdout[-300:])


def maps(n, f=None):
    from PIL import Image
    f = f or folder_of(n)
    if JOBS[n][0] == 'image_generate':
        p = sorted(glob.glob(str(f / 'assets' / '*.png')) + glob.glob(str(f / 'assets' / '*.jpg')) + glob.glob(str(f / 'assets' / '*.webp')))
        return Image.open(p[0]).convert('RGB'), None, f
    z = glob.glob(str(f / 'assets' / '*.zip'))[0]
    with zipfile.ZipFile(z) as zf:
        col = Image.open(io.BytesIO(zf.read('textures/baseColor.png'))).convert('RGB')
        nrm = Image.open(io.BytesIO(zf.read('textures/normal.png'))).convert('RGB') if 'textures/normal.png' in zf.namelist() else None
    return col, nrm, f


def ceiling(tile, tnrm, panel):
    """The drop ceiling, 2.4 m square: 4 x 4 tiles of 0.6 m in a T-bar grid, with one 0.6 x 1.2 m panel. Returns colour,
    normal and the panel's glow mask (white where it lights)."""
    from PIL import Image, ImageDraw, ImageFilter
    S, n = 1024, 4
    c = S // n
    col = Image.new('RGB', (S, S)); nrm = Image.new('RGB', (S, S), (128, 128, 255)); glow = Image.new('L', (S, S), 0)
    t = tile.resize((c, c), Image.LANCZOS); tn = tnrm.resize((c, c), Image.LANCZOS) if tnrm else None
    for i in range(n):
        for j in range(n):  # each tile turned a different way so the stains don't line up
            k = (i * 3 + j * 5) % 4
            col.paste(t.rotate(90 * k), (i * c, j * c))
            if tn:
                nrm.paste(tn, (i * c, j * c))
    px, py = c, c  # the panel takes two tiles, one above the other
    col.paste(panel.resize((c, 2 * c), Image.LANCZOS), (px, py)); nrm.paste((128, 128, 255), (px, py, px + c, py + 2 * c))
    inset = int(c * 0.06)
    ImageDraw.Draw(glow).rectangle((px + inset, py + inset, px + c - inset, py + 2 * c - inset), fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(2))
    # T-bars: thin off-white metal strips on every tile edge, with a shadow line beside each
    d = ImageDraw.Draw(col); dn = ImageDraw.Draw(nrm); w = max(3, S // 200)
    for k in range(n + 1):
        x = k * c
        d.rectangle((x - w, 0, x + w, S), fill=(214, 206, 178)); d.rectangle((0, x - w, S, x + w), fill=(214, 206, 178))
        d.line((x + w + 1, 0, x + w + 1, S), fill=(150, 140, 110)); d.line((0, x + w + 1, S, x + w + 1), fill=(150, 140, 110))
        dn.rectangle((x - w, 0, x + w, S), fill=(128, 128, 255)); dn.rectangle((0, x - w, S, x + w), fill=(128, 128, 255))
    col.paste(panel.resize((c - 2 * w, 2 * c - 2 * w), Image.LANCZOS), (px + w, py + w))  # (no T-bar across the panel)
    return col, nrm, glow


def export():
    from PIL import Image
    OUT.mkdir(parents=True, exist_ok=True)
    have = {n: maps(n) for n in JOBS if '-' not in n and folder_of(n)}
    rows = []
    for n in ('wallpaper', 'carpet'):
        if n not in have:
            print('missing', n); continue
        col, nrm, f = have[n]
        if n == 'carpet' and f.name == 'carpet-r1' and (RUNS / 'carpet' / 'result.json').is_file():  # the second take's wet patches, softened
            col = Image.blend(maps('carpet', RUNS / 'carpet')[0].resize(col.size), col, 0.5)
        col.resize((1024, 1024), Image.LANCZOS).save(OUT / f'{n}-color.webp', 'WEBP', quality=86, method=6)
        files = [f'assets/backrooms/{n}-color.webp']
        if nrm:
            nrm.resize((512, 512), Image.LANCZOS).save(OUT / f'{n}-normal.webp', 'WEBP', quality=90, method=6); files.append(f'assets/backrooms/{n}-normal.webp')
        rows += [dict(row(x, f), note='colour blended half and half with the first take (runs/sorceress/backrooms/carpet)') if n == 'carpet' and f.name == 'carpet-r1' and x.endswith('color.webp') else row(x, f) for x in files]
    if 'tile' in have and 'panel' in have:
        col, nrm, glow = ceiling(have['tile'][0], have['tile'][1], have['panel'][0])
        col.save(OUT / 'ceiling-color.webp', 'WEBP', quality=86, method=6)
        nrm.resize((512, 512), Image.LANCZOS).save(OUT / 'ceiling-normal.webp', 'WEBP', quality=90, method=6)
        glow.resize((256, 256), Image.LANCZOS).convert('RGB').save(OUT / 'ceiling-glow.webp', 'WEBP', quality=90, method=6)
        for x in ('ceiling-color', 'ceiling-normal', 'ceiling-glow'):
            rows += [dict(row(f'assets/backrooms/{x}.webp', have[k][2]), note='built from the tile and the panel by tools/backrooms_art.py') for k in ('tile', 'panel')]
    else:
        print('missing tile or panel')
    for n in [n for n in JOBS if '-' not in n]:  # earlier takes, paid for and replaced
        for s in ('', '-r1'):
            f = RUNS / f'{n}{s}'
            if f != folder_of(n) and (f / 'result.json').is_file():
                rows.append(dict(row(None, f), note='superseded by ' + folder_of(n).name))
    prov = json.loads(PROV.read_text(encoding='utf-8')) if PROV.is_file() else []
    mine = {r['receipt'] for r in rows}
    prov = [p for p in prov if p.get('receipt') not in mine] + rows
    PROV.write_text(json.dumps(prov, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(len(rows), 'rows,', sum(r['credits'] or 0 for r in {r['receipt']: r for r in rows}.values()), 'credits')


def row(file, folder):
    job = json.loads((folder / 'job.json').read_text(encoding='utf-8'))
    res = json.loads((folder / 'result.json').read_text(encoding='utf-8'))
    inp = job['input']; t = datetime.fromisoformat(job['created_at']).astimezone(CDT)
    return {'file': file, 'provider': 'sorceress', 'tool': job['tool'], 'model': inp.get('model'), 'job_id': res.get('jobId'),
            'credits': res.get('creditsCharged'), 'date': t.date().isoformat(), 'time_ct': t.strftime('%H:%M'),
            'prompt': inp.get('prompt'), 'refImages': inp.get('refImages'),
            'receipt': str(folder.relative_to(ROOT)).replace('\\', '/'), 'rights': 'Sorceress output is ours (Steve, 2026-09-25)'}


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'make':
        make(sys.argv[2].split(',') if len(sys.argv) > 2 else list(JOBS))
    elif cmd == 'export':
        export()
    else:
        print(__doc__)
