"""Sorceress jobs for the v4 hero props (plan-v4 section 4, phase 4): a design image per prop (nano-banana-2 1K, 9 credits,
scene A as the style reference), then a Meshy 7 textured mesh from it (50 credits; no paid remesh, tools/prop_fit.py
decimates in Blender). One receipt folder per job under runs/sorceress/v4-props/<name> and <name>Mesh; a folder that
already has a job is skipped, so reruns never pay twice.

    python tools/v4_props.py images slot,chair,palm     # design images
    python tools/v4_props.py redo slot                  # a second design (folder <name>-r1, then -r2)
    python tools/v4_props.py meshes slot,chair,palm     # meshes from the newest design of each
    python tools/v4_props.py fit slot,chair          # Blender: assets/props/<name>.glb and .dev/fit check renders
    python tools/v4_props.py provenance
    python tools/v4_props.py list
"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / 'runs' / 'sorceress' / 'v4-props'
HELPER = ['python', 'C:/dev/playground-td/.claude/skills/sorceress-game-assets/scripts/sorceress.py', '--env', 'C:/dev/mr-mak-workspace/.env']
SCHED = ['C:/Users/Steve/AppData/Local/Mr. Mak Workspace/runtime/node.exe', 'C:/Users/Steve/AppData/Local/Mr. Mak Workspace/runtime/service/resources.mjs', 'run', '--']
BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
SCENE_A = json.loads((ROOT / 'runs' / 'sorceress' / 'v4-previews' / 'sceneA' / 'result.json').read_text(encoding='utf-8'))['images'][0]['url']

VIEW = ('Isolated product shot: three-quarter front view from slightly above, the whole object visible and centred on a plain light '
        'grey studio background with nothing else in the picture (no room, no floor, no furniture, no scenery), even soft studio '
        'lighting, no cast shadow, no text, no logos, no letters or numbers.')
STYLE = ('Handcrafted miniature prop for a stop-motion film set, matching the materials and colours of the reference image: '
         'lacquered dark wood, polished brass and gold leaf, plush velvet and felt upholstery with visible stitched seams, chunky '
         'soft rounded proportions like a toy. Only the object: no characters, no people, no hands, no hats, nothing resting on it '
         'unless described. ' + VIEW)
# Back-alley and restroom things: no casino velvet and gold, and no scene reference.
PLAIN = ('Handcrafted miniature prop for a stop-motion film set with chunky soft rounded proportions like a toy, made of exactly the '
         'materials described and nothing else. Only the object: no characters, no hats, nothing resting on it. ' + VIEW)
GRITTY = {'dumpster', 'crates', 'streetLamp', 'toilet', 'sink'}

PROPS = {  # name: design prompt (the object only; STYLE is appended). Proportions follow the game's footprints.
    'bjTable': 'A casino blackjack table shaped like a capital letter D lying flat, so seen from above it is exactly half a circle: one long straight edge at the back for the dealer and one semicircular curved edge facing the viewer, about twice as wide as it is deep and waist high: a plain dark green felt top with no markings, a thick padded oxblood leather rail along the curved edge only, a solid dark wood apron with gold trim on a pedestal base.',
    'rouletteTable': 'A long rectangular casino table with no wheel, about two and a half times as long as it is deep and waist high: a flat top of plain dark green felt with no markings, a thick padded oxblood leather rail all around, a dark wood apron with gold inlay, six turned dark wood legs.',
    'diceTable': 'A casino craps table, about twice as long as it is wide and waist high: a deep rounded-rectangle tub with high padded oxblood leather walls and a polished wood drink rail around the top, the floor of the tub plain dark green felt with no markings or writing at all, a solid dark wood base with gold trim.',
    'slot': 'A tall upright casino slot machine standing on the floor, three times as tall as it is wide, in glossy cherry-red lacquer with chrome trim: a plinth base with a coin tray, a sloped button deck at waist height with three round candy buttons, above it at eye height a big flat empty black rectangular screen window, and an arched light-up topper on top. No pull lever.',
    'slotHigh': 'A tall upright luxury high-limit casino slot machine standing on the floor, three times as tall as it is wide, in glossy black lacquer with gold trim and gold filigree: a plinth base with a coin tray, a sloped button deck at waist height with three round buttons, above it at eye height a big flat empty black rectangular screen window, and a tall arched gold crown topper. No pull lever.',
    'jackpot': 'A tall square Art Deco jackpot tower, more than twice as tall as it is wide: a black lacquer column on a stepped gold base, a big flat empty black rectangular screen on each of its four sides near the top, a stepped gold crown with a ring of round marquee bulbs.',
    'plinko': 'An upright Plinko arcade cabinet in glossy royal blue lacquer with chrome trim, twice as tall as it is wide: a waist-high base, above it a tall flat back panel framed like a window that is a plain empty dark navy board with nothing on it, a sloped control shelf with one big round button. No pegs, no balls, no chips, no sign, no lettering.',
    'console': 'A sit-down arcade game console in glossy emerald green lacquer with chrome trim, as tall as a desk: a waist-high cabinet with a big flat empty black screen tilted back on top, a glowing strip along its front edge.',
    'prizeWheel': 'A carnival prize wheel stand, as wide as it is tall: a big vertical circular wheel with a plain gold face and no segments or writing, a thick purple velvet rim studded with round marquee bulbs, a gold pointer at the top, standing on a sturdy gold post with a round base.',
    'duck': 'A plain plush rubber duck made of soft white felt with a bright orange felt beak and black button eyes, a smooth round body with no clothes, no number and no accessories, seen from the side. It floats in the air by itself: no stand, no plinth, no base, no water.',
    'barCounter': 'One straight section of an Art Deco bar counter seen from the customer side, twice as wide as it is tall: a polished dark wood front with gold vertical inlay strips and a curved brass foot rail, a thick glossy wood top with a rounded edge. Straight and plain at both cut ends so sections can line up.',
    'backBar': 'One section of a bar back-bar, as wide as it is tall: a dark wood cabinet below, a tall mirror behind three warmly lit glass shelves full of colourful liquor bottles, gold trim and a carved crown on top. Straight at both ends so sections can line up.',
    'stool': 'A tall casino bar stool: a round tufted red velvet seat with a low curved backrest, a single polished brass column, a brass foot ring and a round brass base.',
    'chair': 'A casino table chair: a tufted red velvet seat and a curved tufted back with a gold top rail, four slim gold legs.',
    'booth': 'One bar booth bench, as wide as it is tall: a tufted oxblood velvet seat with a tall rounded channel-tufted back, gold buttons, a dark wood base. Straight at both ends.',
    'couch': 'A long three-seat Art Deco lounge sofa in plush purple velvet, four times as long as it is tall: rounded arms, a channel-tufted back, three seat cushions, short gold feet.',
    'armchair': 'A plush purple velvet Art Deco club armchair with rounded arms, a deep tufted back, a thick seat cushion and short gold feet.',
    'chandelier': 'A crystal chandelier, wider than it is tall: three tiers of gold rings hung with sparkling crystal drops, little candle bulbs around the rims, a short gold chain and canopy at the top. Seen from the side.',
    'piano': 'A black lacquer baby grand piano with the lid propped open, ivory and black keys, three turned legs with brass casters.',
    'poolTable': 'A pool table, twice as long as it is wide: a dark wood frame, plain green felt bed, six leather pockets, carved legs, the balls racked in a triangle and a cue lying on top.',
    'jukebox': 'A classic 1940s jukebox, twice as tall as it is wide: a rounded arch top with glowing pink and cyan tubes, a polished wood body, a chrome grille at the bottom, a lit record window in the middle.',
    'champagne': 'A champagne tower: a pyramid of four tiers of coupe glasses filled with golden champagne on a round marble pedestal table with a gold stem, a green champagne bottle on top, nothing else beside it.',
    'snackBowl': 'A big brass bowl heaped with golden pretzels on a slim brass pedestal stand with a round base, waist high.',
    'palm': 'A potted indoor palm in a glossy black Art Deco urn with a gold rim, a short trunk and a full crown of soft felt fronds.',
    'camera': 'A small casino security camera on a wall bracket: a white rounded camera housing with a dark glass lens and a tiny red light, an angled grey metal arm and a square wall plate.',
    'dumpster': 'A dark green painted steel dumpster with two black plastic lids, one lid slightly open with a black trash bag peeking out, small black wheels, dented and a bit grimy.',
    'pitBell': 'A brass service bell on a fluted white marble pedestal with a gold base and a gold capital, waist high.',
    'hightop': 'A round bar high-top table: a glossy dark wood top with a gold edge band, a single brass column, a round brass foot base, a little glowing table lamp in the middle.',
    'toilet': 'A glossy white porcelain toilet with the lid down and a white porcelain tank with a chrome flush lever, soft Art Deco curves; all white porcelain and chrome.',
    'sink': 'One restroom vanity unit, as wide as it is tall: a white marble counter top on a dark wood cabinet with plain wooden doors, one round white porcelain basin and a tall chrome faucet. Straight at both ends so units can line up.',
    'rocket': 'A cartoon rocket ship standing on three fins, three times as tall as it is wide: a round pointy nose cone, chunky red and cream striped felt body, a round porthole window, brass rivets.',
    'coinPodium': 'A round white marble pedestal with a stepped gold base and a gold top plate, waist high, Art Deco fluting.',
    'ottoman': 'A big round tufted red velvet ottoman with gold buttons and a gold base band, three times as wide as it is tall.',
    'crates': 'A small stack of three rough weathered pine shipping crates of different sizes with nailed slats, no writing.',
    'streetLamp': 'A black cast-iron Victorian street lamp post with a fluted black pole and a glowing glass lantern on top.',
}

# Blender fit: (nominal height in metres, triangle budget, largest texture side, yaw fix in degrees). The game re-fits each
# placement to its footprint (src/3d/props.js propScale); these only set real-world sizes for the check renders.
FIT = {
    'bjTable': (0.95, 9000, 1024, 0), 'rouletteTable': (0.95, 8000, 1024, 0), 'diceTable': (1.0, 9000, 1024, 0),
    'slot': (2.4, 9000, 1024, 0), 'slotHigh': (2.5, 9000, 1024, 0), 'jackpot': (3.1, 9000, 1024, 0), 'plinko': (2.8, 8000, 1024, 0),
    'console': (1.5, 6000, 1024, 0), 'prizeWheel': (3.6, 9000, 1024, 0), 'duck': (0.4, 2500, 512, 0),
    'barCounter': (1.1, 5000, 1024, 0), 'backBar': (2.6, 9000, 1024, 0), 'stool': (1.0, 3000, 512, 0), 'chair': (1.15, 3500, 512, 0),
    'booth': (1.1, 5000, 1024, 0), 'couch': (0.9, 7000, 1024, 0), 'armchair': (0.95, 5000, 1024, 0), 'chandelier': (1.2, 9000, 1024, 0),
    'piano': (1.5, 9000, 1024, 0), 'poolTable': (0.9, 8000, 1024, 0), 'jukebox': (1.6, 7000, 1024, 0), 'champagne': (1.6, 9000, 1024, 0),
    'snackBowl': (1.0, 4000, 512, 0), 'palm': (2.1, 7000, 1024, 0), 'camera': (0.35, 2500, 512, 0), 'dumpster': (1.2, 6000, 1024, 0),
    'pitBell': (1.3, 4000, 512, 0), 'hightop': (1.15, 3500, 512, 0), 'toilet': (0.8, 3500, 512, 0), 'sink': (0.95, 4000, 512, 0),
    'rocket': (2.5, 6000, 1024, 0), 'coinPodium': (1.05, 4000, 512, 0), 'ottoman': (0.5, 4000, 512, 0), 'crates': (1.1, 9000, 1024, 0),
    'streetLamp': (3.4, 4000, 512, 0),
}


def call(name, tool, body):
    out = RUNS / name
    if (out / 'job.json').is_file():
        print('have', name); return False
    RUNS.mkdir(parents=True, exist_ok=True)
    inp = RUNS / f'{name}.json'
    inp.write_text(json.dumps(body, ensure_ascii=False), encoding='utf-8')
    r = subprocess.run(HELPER + ['call', tool, '--input', str(inp), '--out', str(out), '--approved'], capture_output=True, text=True)
    print(name, 'ok' if r.returncode == 0 else 'FAILED ' + (r.stderr or r.stdout)[-400:])
    return r.returncode == 0


def poll(names, wait=600):
    for n in names:
        r = subprocess.run(HELPER + ['poll', '--job', str(RUNS / n / 'job.json'), '--wait', str(wait), '--retry-failed', '1', '--approved'], capture_output=True, text=True)
        print(n, 'succeeded' if '"succeeded"' in r.stdout else 'NOT DONE ' + r.stdout[-300:])


def newest(name):
    """The newest design folder of a prop that has a result: -r2, then -r1, then the first."""
    for s in ('-r2', '-r1', ''):
        f = RUNS / f'{name}{s}' / 'result.json'
        if f.is_file():
            return f'{name}{s}', json.loads(f.read_text(encoding='utf-8'))['images'][0]['url']
    return None, None


def mesh_of(name):
    """The GLB of the newest mesh of a prop (meshes are named after their design folder)."""
    for s in ('-r2', '-r1', ''):
        g = sorted((RUNS / f'{name}{s}Mesh' / 'assets').glob('*.glb'))
        if g:
            return g[0]
    return None


def provenance():
    """assets/props/provenance.json: the design image and the mesh behind every fitted prop."""
    from datetime import datetime, timedelta, timezone
    cdt = timezone(timedelta(hours=-5))  # no tzdata on this PC; October is daylight time
    rows = []
    for n in PROPS:
        if not (ROOT / 'assets' / 'props' / f'{n}.glb').is_file():
            continue
        m = mesh_of(n)
        for folder in (m.parent.parent, RUNS / m.parent.parent.name[:-4]):
            job = json.loads((folder / 'job.json').read_text(encoding='utf-8'))
            res = json.loads((folder / 'result.json').read_text(encoding='utf-8'))
            t = datetime.fromisoformat(job['created_at']).astimezone(cdt)
            inp = job['input']
            rows.append({'file': f'assets/props/{n}.glb', 'step': 'mesh' if folder.name.endswith('Mesh') else 'design', 'provider': 'sorceress',
                         'tool': job['tool'], 'model': inp.get('model'), 'job_id': res.get('jobId'), 'credits': res.get('creditsCharged'),
                         'date': t.date().isoformat(), 'time_ct': t.strftime('%H:%M'), 'prompt': inp.get('prompt') or f"image-to-3D from {inp.get('imageUrl')}",
                         'params': inp.get('params'), 'receipt': str(folder.relative_to(ROOT)).replace('\\', '/'),
                         'note': 'fitted by tools/prop_fit.py (decimated, sized, textures shrunk)' if folder.name.endswith('Mesh') else None,
                         'rights': 'Sorceress output is ours (Steve, 2026-09-25)'})
    (ROOT / 'assets' / 'props' / 'provenance.json').write_text(json.dumps(rows, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(len(rows), 'rows,', sum(r['credits'] or 0 for r in rows), 'credits')


def design(folder, name):
    plain = name in GRITTY
    body = {'model': 'nano-banana-2', 'prompt': f'{PROPS[name]} {PLAIN if plain else STYLE}', 'aspectRatio': '1:1', 'params': {'resolution': '1K'}}
    if not plain:
        body['refImages'] = [SCENE_A]
    return call(folder, 'image_generate', body)


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else ''
    names = sys.argv[2].split(',') if len(sys.argv) > 2 else list(PROPS)
    if what == 'images':
        done = [n for n in names if design(n, n) or (RUNS / n / 'job.json').is_file()]
        poll(done)
    elif what == 'redo':
        done = []
        for n in names:
            tag = '-r1' if not (RUNS / f'{n}-r1' / 'job.json').is_file() else '-r2'
            design(f'{n}{tag}', n); done.append(f'{n}{tag}')
        poll(done)
    elif what == 'meshes':
        done = []
        for n in names:
            folder, url = newest(n)
            if not url:
                print('no design', n); continue
            call(f'{folder}Mesh', 'model_generate', {'model': 'meshy-7', 'imageUrl': url, 'params': {'should_texture': True, 'should_remesh': False}})
            done.append(f'{folder}Mesh')
        poll(done, 900)
    elif what == 'fit':
        for n in names:
            m = mesh_of(n)
            if not m:
                print('no mesh', n); continue
            h, tris, tex, yaw = FIT.get(n, (1.0, 6000, 1024, 0))
            chk = str(ROOT / '.dev' / 'fit' / n)
            r = subprocess.run(SCHED + [BLENDER, '-b', '--factory-startup', '--python', str(ROOT / 'tools' / 'prop_fit.py'), '--', str(m),
                                        str(ROOT / 'assets' / 'props' / f'{n}.glb'), f'0,{h},0', 'uniform', str(yaw), str(tris), str(tex), chk],
                               capture_output=True, text=True)
            print(next((l for l in r.stdout.splitlines() if l.startswith('FIT')), 'FAILED ' + n + ' ' + (r.stderr or r.stdout)[-300:]))
    elif what == 'provenance':
        provenance()
    elif what == 'list':
        for n in PROPS:
            print(n, newest(n)[0], mesh_of(n))
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
