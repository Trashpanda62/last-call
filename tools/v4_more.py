"""Sorceress art for v4 phases 7, 8, 10 and 2 (plan-v4 section 4): slot symbols, neon signs and game-screen backdrops;
paintings, posters, the alley skyline and key art; effect sprites; and the 16 hats (a design image, then a Hunyuan mesh).
One receipt folder per job under runs/sorceress/v4-more/<name> (a hat's mesh in <name>Mesh); a folder that already has
a job is skipped, so reruns never pay twice. `redo` makes <name>-r1, then -r2; export takes the newest.

    python tools/v4_more.py make [name,name|group]     # images (groups: sym, sign, screen, paint, poster, sky, key, fx, hat)
    python tools/v4_more.py redo name,name
    python tools/v4_more.py meshes [hat names]          # Hunyuan meshes from the newest hat designs
    python tools/v4_more.py sheet out.jpg [group]       # contact sheet of the newest images
    python tools/v4_more.py export                      # assets/art2/*.webp, hats via tools/prop_fit.py, provenance
"""
import glob, json, subprocess, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / 'runs' / 'sorceress' / 'v4-more'
OUT = ROOT / 'assets' / 'art2'
HELPER = ['python', 'C:/dev/playground-td/.claude/skills/sorceress-game-assets/scripts/sorceress.py', '--env', 'C:/dev/mr-mak-workspace/.env']
SCHED = ['C:/Users/Steve/AppData/Local/Mr. Mak Workspace/runtime/node.exe', 'C:/Users/Steve/AppData/Local/Mr. Mak Workspace/runtime/service/resources.mjs', 'run', '--']
BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
CDT = timezone(timedelta(hours=-5))
SCENE_A = json.loads((ROOT / 'runs' / 'sorceress' / 'v4-previews' / 'sceneA' / 'result.json').read_text(encoding='utf-8'))['images'][0]['url']
BEAN_A = 'https://wizardgenie-media.s3.us-west-004.backblazeb2.com/generations/14b713ad-480d-44e5-a794-18be8c0a897d/3763125f-e33e-4057-bb44-697c89554aae/nano-banana-pro-1.png'
G2, NB2, NBP = 'gpt-image-2', 'nano-banana-2', 'nano-banana-pro'
PLUSH = 'the plush stop-motion style of the reference image: soft felt and velvet with visible stitched seams, black button eyes, chunky toy proportions'

ART = {}  # name: (group, model, prompt, aspect, resolution, refs)
def art(group, name, model, prompt, ar='1:1', res='1K', refs=None):
    ART[name] = (group, model, prompt, ar, res, refs)

# --- Phase 7: slot symbols (keyed off the green), neon signs (on black, drawn additively), game-screen backdrops
SYM = ('A single slot machine reel symbol: {}. Made as a puffy plush felt appliqué with visible stitching and a soft satin sheen, '
       'bold and readable from far away, centred and filling about 80 percent of the frame, flat straight-on view, on a perfectly '
       'flat pure chroma green (#00FF00) background with no shadow, no gradient and nothing else in the picture.')
for n, what in [('diamond', 'a big sparkling cyan blue cut diamond'), ('seven', 'a big bold red number 7 with a gold outline'),
                ('bar', 'a black rectangular plaque with the word BAR in thick white capital letters and a gold border'),
                ('bell', 'a shiny golden bell with a red bow'), ('cherry', 'two glossy red cherries joined by green stems with one leaf'),
                ('lemon', 'a plump bright yellow lemon with a green leaf')]:
    art('sym', 'sym-' + n, G2, SYM.format(what))
NEON = ('A glowing neon sign that reads exactly "{}" and nothing else, in {} Art Deco neon tube lettering, {} neon tubes with a soft '
        'glow and a thin outline tube around it, straight-on view, the whole sign in frame with a margin, on a pure black background: no '
        'wall, no bricks, no mounting, no reflections, no other words.')
SIGNS = {  # name: (text, style, colour) - world.js draws each on its own plane, additively
    'lastcall': ('LAST CALL', 'elegant italic script', 'hot pink'), 'bar': ('BAR', 'tall elegant', 'warm amber'), 'vip': ('VIP', 'bold elegant', 'violet'),
    'restrooms': ('RESTROOMS', 'clean', 'aqua'), 'duckrace': ('DUCK RACE', 'playful rounded', 'sky blue and yellow'),
    'slots': ('SLOTS', 'bold', 'golden yellow'), 'highlimit': ('HIGH LIMIT', 'elegant', 'gold'), 'dice': ('DICE', 'bold', 'electric cyan'),
    'spintowin': ('SPIN TO WIN', 'bold circus', 'gold and red'), 'flip': ('FLIP', 'bold italic', 'hot pink'), 'crash': ('CRASH', 'bold italic', 'hot pink and orange'),
    'plinko': ('PLINKO', 'bold rounded', 'electric cyan'), 'mines': ('MINES', 'bold', 'acid green'), 'dragontower': ('DRAGON TOWER', 'bold fantasy', 'orange'),
}
for n, (txt, st, col) in SIGNS.items():
    art('sign', 'sign-' + n, G2, NEON.format(txt, st, col), '3:2')
SCREEN = ('Background art for a casino arcade game screen, no text, no letters, no numbers, no characters, no user interface, calm and '
          'slightly dark so bright game pieces read on top of it, in ' + PLUSH + ': {}')
for n, what in [('mines', 'a felt meadow at night seen from above, a soft quilted grid pattern of green patches with stitched seams'),
                ('tower', 'a tall felt castle tower wall at night with a sleeping plush dragon curled around the top, purple sky'),
                ('crash', 'a deep blue felt night sky with sewn button stars and a felt moon, a city skyline of felt buildings at the bottom'),
                ('plinko', 'a dark navy velvet board with a soft gold quilted diamond pattern'),
                ('wheel', 'a sunburst of gold and red velvet rays radiating from the centre, like a circus tent ceiling'),
                ('coin', 'a dark green felt card table top with a soft spotlight in the middle')]:
    art('screen', 'screen-' + n, G2, SCREEN.format(what), '16:9' if n in ('crash', 'mines') else '1:1')

# --- Phase 8: paintings (gilded frames on the walls), posters, the alley skyline and key art
PAINT = ('An old-master oil painting, full bleed: the painted scene fills the entire image edge to edge, with no frame, no border, no '
         'wall, no easel and no room around it, not a photo of a painting. Rich varnished oils with visible brush texture, but the '
         'subjects are plush toy characters in ' + PLUSH + ': {}. Portrait orientation.')
for i, what in enumerate([
    'a pompous plush bean aristocrat in a top hat and monocle, half-length portrait, dark green drapery behind',
    'a plush bean duchess in pearls and a feathered hat holding a lorgnette, half-length portrait, burgundy background',
    'a plush bean admiral in a bicorne hat and gold epaulettes, a stormy sea behind',
    'a still life of dice, a cocktail glass with a cherry, playing cards and a stack of casino chips on a velvet cloth',
    'a still life of a silver champagne bucket, a bottle and two coupes on a marble ledge, candlelight',
    'two plush beans in evening wear dancing a tango in a ballroom',
    'a plush bean gambler in a fedora blowing on a pair of dice for luck, dramatic chiaroscuro',
    'a moonlit Art Deco city skyline with a glowing casino tower, painted at night',
    'a plush bean jazz trio, piano, double bass and trumpet, in a smoky lounge',
    'a race of four rubber ducks in a fountain with plush bean spectators cheering, sunny park',
    'a plush bean poker player hiding an ace in a sleeve, a sly smile, candlelit',
    'a plush bean in a detective trench coat and hat holding a magnifying glass, foggy street, film noir']):
    art('paint', f'paint-{i:02d}', G2, PAINT.format(what), '2:3', '1K', [BEAN_A])  # cropped to the frame's 4:5 on export
POSTER = ('A vintage 1930s Art Deco casino advertising poster, flat lithograph print style with bold shapes and a limited palette, '
          'slightly worn paper edges, the characters are plush felt bean toys with button eyes. The poster reads exactly "{}" in bold Art '
          'Deco lettering and no other words: {}. Portrait orientation, the whole poster in frame, flat straight-on.')
for n, (txt, what) in {
    'derby': ('DUCK DERBY', 'four rubber ducks racing across rippled water, a plush bean waving a checkered flag'),
    'jackpot': ('JACKPOT', 'a slot machine bursting with gold coins, a plush bean leaping for joy'),
    'cocktails': ('TWO FOR ONE', 'two cocktail glasses clinking, a cherry flying out, sparkles'),
    'rocket': ('RIDE THE ROCKET', 'a toy rocket blasting up a graph line into the stars with a plush bean riding it'),
    'roulette': ('ROUGE OU NOIR', 'a roulette wheel seen at an angle with a white ball, a plush bean croupier pointing'),
    'missing': ('HAVE YOU SEEN THIS BEAN?', 'a missing-person flyer with a photo of a worried plush bean, a phone number torn tabs at the bottom'),
    'wash': ('WASH YOUR HANDS', 'a plush bean washing its white glove hands at a sink with soap bubbles'),
    'lounge': ('VIP LOUNGE', 'a plush bean in a tuxedo sipping champagne on a velvet couch, gold rays behind'),
}.items():
    art('poster', 'poster-' + n, G2, POSTER.format(txt, what), '2:3')
SKY = ('A wide night-time city skyline panorama seen from a back alley rooftop level: Art Deco towers, neon signs without readable words, '
       'water towers and fire escapes, warm lit windows, a deep indigo sky with a glow near the horizon, painted in a soft handmade '
       'miniature-set style like felt and cardboard. Only the skyline, no characters, no foreground walls, horizon at the bottom.')
art('sky', 'sky-north', G2, SKY + ' A big moon to the left.', '21:9', '2K')
art('sky', 'sky-south', G2, SKY + ' A distant bridge with lights to the right.', '21:9', '2K')
KEY = ('Key art for a party murder-mystery game set in a lavish Art Deco casino, in ' + PLUSH + ', cinematic lighting, gold and crimson, '
       'shallow depth of field, no text, no letters, no logos: {}')
art('key', 'key-menu', NBP, KEY.format('a crowd of colourful plush bean gamblers at a roulette table, one in the middle grinning and hiding a toy knife behind its back, the others unaware, chandeliers above'), '16:9', '2K', [BEAN_A, SCENE_A])
art('key', 'key-menuPhone', NBP, KEY.format('a plush bean in a fedora at the bar holding a cocktail, looking suspiciously over its shoulder at a shadowy bean behind it holding a toy knife, chandelier above'), '9:16', '2K', [BEAN_A, SCENE_A])
art('key', 'key-gamblersWin', NBP, KEY.format('plush bean gamblers cheering and throwing chips and confetti in the air around a jackpot slot machine, a security guard bean leading a sulking bean away'), '16:9', '2K', [BEAN_A, SCENE_A])
art('key', 'key-killersWin', NBP, KEY.format('the casino after hours in moody red light, two smug plush bean villains in fedoras clinking champagne glasses at an empty blackjack table, toppled bar stools'), '16:9', '2K', [BEAN_A, SCENE_A])
art('key', 'key-meeting', NBP, KEY.format('a circle of plush beans arguing around a velvet card table under a single hanging lamp, pointing at each other, one crying, one shrugging'), '16:9', '2K', [BEAN_A, SCENE_A])
art('key', 'key-ejected', NBP, KEY.format('a plush bean being tossed out of the casino back door into a rainy neon alley by a security guard bean, landing in a puddle'), '16:9', '2K', [BEAN_A, SCENE_A])

# --- Phase 10: effect sprites on black (drawn additively or with alpha from brightness)
FX = 'A single game visual-effect sprite on a pure black background, centred, nothing else in the picture, no text: {}'
for n, what in [('smoke', 'a soft round puff of pale grey smoke, wispy edges, lit from above'),
                ('sparks', 'a burst of bright golden sparks radiating from the centre, thin streaks and tiny glowing dots'),
                ('confetti', 'a scatter of colourful paper confetti pieces and curly streamers, red, gold, pink, cyan, green, seen flat'),
                ('fizz', 'a cluster of glowing acid green bubbles and fizz rising, like a poisoned drink'),
                ('boom', 'a cartoon explosion fireball, orange and yellow, with puffy smoke edges'),
                ('stars', 'a ring of small glowing gold stars and twinkles, like a jackpot sparkle'),
                ('ghost', 'a soft glowing pale blue wisp of spirit mist, ghostly, translucent')]:
    art('fx', 'fx-' + n, G2, FX.format(what))

# --- Phase 2: hats, one per cast member in their colour, for a Hunyuan mesh each
HAT = ('A single plush toy hat on its own, no head, no mannequin, no stand: {}. Sewn from soft felt with visible stitched seams like a '
       'handmade stop-motion puppet prop, matching the reference style. Three-quarter front view from slightly above, the whole hat '
       'visible and centred on a plain light grey background, even soft lighting, no cast shadow, no text.')
HATS = {  # cast name: (hat kind, description)
    'Red': ('fedora', 'a dark red felt fedora with a black band'), 'Mint': ('tophat', 'a tall dark mint green felt top hat with a black band'),
    'Biscuit': ('cowboy', 'a tan caramel felt cowboy hat with a dark band'), 'Lola': ('beret', 'a deep pink felt beret with a little stalk on top'),
    'Duke': ('bowler', 'a navy blue felt bowler hat with a black band'), 'Pip': ('visor', 'a translucent green dealer visor with a yellow felt headband'),
    'Coco': ('crown', 'a small gold crown with six points and purple felt jewels'), 'Ozzie': ('beanie', 'an orange knitted beanie with a cream cuff and a cream pompom'),
    'Teal': ('cap', 'a teal felt baseball cap with a curved bill facing forward'), 'Snow': ('party', 'a pink cone party hat with yellow stripes and a yellow pompom'),
    'Moss': ('pirate', 'a black felt pirate tricorn hat with a white skull patch'), 'Ruby': ('flower', 'a crimson felt cloche hat with a big felt flower on the side'),
    'Sky': ('propeller', 'a sky blue felt propeller beanie cap with a red and yellow propeller on top'), 'Peach': ('chef', 'a tall white puffy chef toque'),
    'Ink': ('headphones', 'a pair of chunky dark grey over-ear headphones with a curved headband, standing upright'),
    'Lime': ('sombrero', 'a lime green felt sombrero with a wide brim and red stitched trim'),
}
for who, (kind, what) in HATS.items():
    art('hat', 'hat-' + kind, NB2, HAT.format(what), '1:1', '1K', [BEAN_A])


def folder_of(name):
    for s in ('-r2', '-r1', ''):
        f = RUNS / f'{name}{s}'
        if (f / 'result.json').is_file():
            return f
    return None


def url_of(name):
    f = folder_of(name)
    return json.loads((f / 'result.json').read_text(encoding='utf-8'))['images'][0]['url'] if f else None


def call(folder, tool, body):
    out = RUNS / folder
    if (out / 'job.json').is_file():
        print('have', folder); return True
    RUNS.mkdir(parents=True, exist_ok=True)
    inp = RUNS / f'{folder}.json'; inp.write_text(json.dumps(body, ensure_ascii=False), encoding='utf-8')
    r = subprocess.run(HELPER + ['call', tool, '--input', str(inp), '--out', str(out), '--approved'], capture_output=True, text=True)
    print(folder, 'ok' if r.returncode == 0 else 'FAILED ' + (r.stderr or r.stdout)[-300:])
    return r.returncode == 0


def poll(folders, wait=900):
    for f in folders:
        r = subprocess.run(HELPER + ['poll', '--job', str(RUNS / f / 'job.json'), '--wait', str(wait), '--retry-failed', '1', '--approved'], capture_output=True, text=True)
        print(f, 'succeeded' if '"succeeded"' in r.stdout else 'NOT DONE ' + r.stdout[-300:])


def image_body(name):
    group, model, prompt, ar, res, refs = ART[name]
    body = {'model': model, 'prompt': prompt, 'aspectRatio': ar, 'params': {'resolution': res}}
    if refs:
        body['refImages'] = refs
    return body


def pick(arg):
    if not arg:
        return list(ART)
    out = []
    for a in arg.split(','):
        out += [n for n in ART if ART[n][0] == a] or [a]
    return out


def make(names, suffix=''):
    started = [n + suffix for n in names if call(n + suffix, 'image_generate', image_body(n))]
    poll(started)


def redo(names):
    for n in names:
        s = '-r1' if not (RUNS / f'{n}-r1' / 'job.json').is_file() else '-r2'
        make([n], s)


def meshes(names):
    for i in range(0, len(names), 4):  # a few at a time: the mesh queue refuses too many pending tasks
        done = []
        for n in names[i:i + 4]:
            u = url_of(n)
            if u and call(n + 'Mesh', 'model_generate', {'model': 'hunyuan3d-3.1', 'imageUrl': u}):
                done.append(n + 'Mesh')
        poll(done)


def newest_png(name):
    f = folder_of(name)
    p = sorted(glob.glob(str(f / 'assets' / '*.png')) + glob.glob(str(f / 'assets' / '*.jpg')) + glob.glob(str(f / 'assets' / '*.webp'))) if f else []
    return p[0] if p else None


def sheet(out, group=None):
    from PIL import Image, ImageDraw
    names = [n for n in ART if not group or ART[n][0] == group]
    cell, cols = 250, 6
    rows = (len(names) + cols - 1) // cols
    sh = Image.new('RGB', (cols * cell, rows * cell), (50, 50, 50)); d = ImageDraw.Draw(sh)
    for i, n in enumerate(names):
        p = newest_png(n)
        if not p:
            continue
        im = Image.open(p).convert('RGB'); im.thumbnail((cell - 8, cell - 24))
        x, y = (i % cols) * cell, (i // cols) * cell
        sh.paste(im, (x + 4, y + 20)); d.text((x + 6, y + 4), n, fill=(255, 220, 120))
    sh.save(out, quality=85); print('sheet', out)


def key_green(im):
    """Chroma green to alpha, with the green spill pulled out of the edges."""
    import numpy as np
    from PIL import Image
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    spill = np.clip(g - np.maximum(r, b), 0, 1)
    alpha = np.clip(1 - (spill - 0.12) * 3.2, 0, 1)
    g2 = np.minimum(g, np.maximum(r, b) + 0.02)
    out = np.dstack([r, g2, b, alpha])
    return Image.fromarray((out * 255).astype(np.uint8), 'RGBA')


def crop_dark(im, aspect, pad=0.06):
    """Crop a sign on black to its glow (padded with black to an aspect, when given)."""
    import numpy as np
    from PIL import Image
    a = np.asarray(im.convert('L'))
    ys, xs = np.where(a > 40)
    if not len(xs):
        return im
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    c = im.crop((x0, y0, x1 + 1, y1 + 1)); w, h = c.size
    W, H = (w * (1 + pad * 2), h * (1 + pad * 2))
    if aspect:
        W, H = (max(W, H * aspect), max(H, W / aspect))
    out = Image.new('RGB', (int(W), int(H)), (0, 0, 0)); out.paste(c, ((int(W) - w) // 2, (int(H) - h) // 2))
    return out


# The painted canvas inside three first-round paintings (fractions of the image) that showed it on an easel or a table;
# their full-bleed redos were refused for want of credits.
CANVAS = {'paint-09': (0.03, 0.025, 0.97, 0.975), 'paint-10': (0.15, 0.1, 0.88, 0.88), 'paint-11': (0.1, 0.12, 0.91, 0.9)}


def export():
    from PIL import Image
    OUT.mkdir(parents=True, exist_ok=True)
    prov = []
    for n, (group, model, prompt, ar, res, refs) in ART.items():
        p = newest_png(n)
        if not p:
            print('missing', n); continue
        im = Image.open(p)
        if group == 'sym':
            key_green(im).resize((256, 256), Image.LANCZOS).save(OUT / f'{n}.webp', 'WEBP', quality=90, method=6)
        elif group == 'sign':
            c = crop_dark(im, None);  # world.js fits the plane to the sign's own shape
            c.thumbnail((1024, 512), Image.LANCZOS); c.save(OUT / f'{n}.webp', 'WEBP', quality=88, method=6)
        elif group == 'hat':
            continue  # the design only feeds the mesh
        else:
            size = {'screen': 1024, 'paint': 512, 'poster': 512, 'sky': 2048, 'key': 1600, 'fx': 256}[group]
            im = im.convert('RGB')
            if group == 'paint' and folder_of(n).name in CANVAS:  # a first-round design that shows the canvas: keep its face
                x0, y0, x1, y1 = CANVAS[folder_of(n).name]; w, h = im.size
                im = im.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))
            if group == 'paint':  # to the frame's 4:5, from the middle
                w, h = im.size
                if h > w * 5 / 4:
                    h2 = int(w * 5 / 4); im = im.crop((0, (h - h2) // 2, w, (h - h2) // 2 + h2))
                else:
                    w2 = int(h * 4 / 5); im = im.crop(((w - w2) // 2, 0, (w - w2) // 2 + w2, h)); im.thumbnail((size, size), Image.LANCZOS)
            im.save(OUT / f'{n}.webp', 'WEBP', quality=84 if group in ('key', 'sky') else 86, method=6)
        prov.append(row(n, folder_of(n), f'assets/art2/{n}.webp'))
        for sfx in ('', '-r1'):  # earlier takes, paid for and replaced
            f = RUNS / f'{n}{sfx}'
            if f != folder_of(n) and (f / 'result.json').is_file():
                prov.append(dict(row(n, f, None), note='superseded by ' + folder_of(n).name))
    hats = ROOT / 'assets' / 'hats'; hats.mkdir(parents=True, exist_ok=True)
    for who, (kind, _) in HATS.items():
        n = 'hat-' + kind
        g = sorted((RUNS / f'{n}Mesh' / 'assets').glob('*.glb'))
        if not g:
            print('no mesh', n)
            if folder_of(n): prov.append(row(n, folder_of(n), None))  # the design was paid for
            continue
        chk = str(ROOT / '.dev' / 'fit' / n)
        size = '0.62,0,0' if kind in ('sombrero', 'cowboy') else '0.5,0,0' if kind in ('tophat', 'fedora', 'bowler', 'pirate', 'flower') else '0.46,0,0'
        r = subprocess.run(SCHED + [BLENDER, '-b', '--factory-startup', '--python', str(ROOT / 'tools' / 'prop_fit.py'), '--', str(g[0]),
                                    str(hats / f'{kind}.glb'), size, 'uniform', '0', '8000', '512', chk, 'bake'], capture_output=True, text=True)
        print(next((l for l in r.stdout.splitlines() if l.startswith('FIT')), 'FAILED ' + n + ' ' + (r.stderr or r.stdout)[-300:]))
        prov.append(row(n, folder_of(n), None)); prov.append(row(n + 'Mesh', RUNS / f'{n}Mesh', f'assets/hats/{kind}.glb'))
    (hats / 'hats.json').write_text(json.dumps(sorted(p.stem for p in hats.glob('*.glb'))) + '\n', encoding='utf-8')  # what plush.js loads
    (OUT / 'provenance.json').write_text(json.dumps(prov, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(len(prov), 'rows,', sum(r['credits'] or 0 for r in prov), 'credits')


def row(name, folder, file):
    job = json.loads((folder / 'job.json').read_text(encoding='utf-8'))
    res = json.loads((folder / 'result.json').read_text(encoding='utf-8'))
    inp = job['input']; t = datetime.fromisoformat(job['created_at']).astimezone(CDT)
    return {'file': file, 'provider': 'sorceress', 'tool': job['tool'], 'model': inp.get('model'), 'job_id': res.get('jobId'),
            'credits': res.get('creditsCharged'), 'date': t.date().isoformat(), 'time_ct': t.strftime('%H:%M'),
            'prompt': inp.get('prompt') or f"image-to-3D from {inp.get('imageUrl')}", 'refImages': inp.get('refImages'),
            'receipt': str(folder.relative_to(ROOT)).replace('\\', '/'), 'rights': 'Sorceress output is ours (Steve, 2026-09-25)'}


if __name__ == '__main__':
    cmd, arg = (sys.argv[1] if len(sys.argv) > 1 else ''), (sys.argv[2] if len(sys.argv) > 2 else '')
    if cmd == 'make':
        make(pick(arg))
    elif cmd == 'redo':
        redo(pick(arg))
    elif cmd == 'meshes':
        meshes(pick(arg or 'hat'))
    elif cmd == 'sheet':
        sheet(arg, sys.argv[3] if len(sys.argv) > 3 else None)
    elif cmd == 'export':
        export()
    else:
        print(__doc__)
