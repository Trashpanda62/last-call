"""Creepy potato characters (Steve, 2026-10-15: "still looks bad, let's generate new bodies for the characters, i want
creepy looking potatoes basically"). They replace the plush beans: same rig (tools/rig_bean.py), same clips, same hats.
Sorceress receipts go to runs/sorceress/v5-potato/<name>; a folder with a job.json is never paid twice. Steve picked take b
(2026-10-15); its receipts are named b-<name>. Take a (the first pick) kept the bare names and is not used.

    python tools/v5_potato.py concepts            # three nano-banana-pro design takes, A-pose, no reference
    python tools/v5_potato.py designs <take>      # round body (round-r2) and the three staff, from the picked concept; records the pick
    python tools/v5_potato.py retake round,guard r3   # designs again under new folders (b-round-r3, b-guard-r3)
    python tools/v5_potato.py round4              # b's character on a's round body (b-round-r4)
    python tools/v5_potato.py meshes [kind,..]    # meshy-7 image-to-3D of each design (bean, round, croupier, bartender, guard)
    python tools/v5_potato.py portraits [Name,..|all] [emo,..]   # meeting portraits from the picked concept
    python tools/v5_potato.py redo Name-emo[,..]  # a drifted portrait again, from that character's calm portrait
Then tools/v4_export.py writes assets/portraits and the provenance rows.
"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / 'runs' / 'sorceress' / 'v5-potato'
HELPER = ['python', 'C:/dev/playground-td/.claude/skills/sorceress-game-assets/scripts/sorceress.py', '--env', 'C:/dev/mr-mak-workspace/.env']
PICK = RUNS / 'pick.txt'  # the concept take the rest is built from

POSE = ('Open A-pose: arms lowered about 40 degrees out from the body with a clear gap at each armpit, legs straight and hips-width '
        'apart, hands open with the fingers together, nothing in the hands, no base or stand under the feet. Straight-on front view, '
        'plain light grey background, even diffuse studio lighting, no cast shadow, centered, full body head to toe visible, no text.')
SKIN = ('The whole head and body is one big lumpy, irregular potato about the size of a small child, with real potato skin: '
        'fine brown russet netting, patches of dry dirt, small dark blemishes, a few sunken potato eyes with short pale sprouts.')
TONE = 'Realistic and slightly wrong, unsettling but fun, like a stop-motion horror film puppet; no blood, no gore.'
CONCEPTS = {
    'a': (f'Full-body character design of a creepy potato creature for a party game. {SKIN} Its face is set into the potato flesh: '
          f'two glossy, wet, far too human eyes with pale irises sunk deep into the flesh, and a mouth that is a long thin cut sewn '
          f'shut with coarse black stitches. Thin, slightly too long, pale root-like arms and legs grow out of the potato, ending in '
          f'knobbly four-fingered root hands and stubby root feet. It wears a plain bright red fitted waistcoat with small brass '
          f'buttons over the potato belly. {TONE} {POSE}'),
    'b': (f'Full-body character design of a creepy potato creature for a party game. {SKIN} Its face is set into the potato flesh: '
          f'two glossy too-human eyes with heavy lids and a crooked knife-cut mouth, slightly open, showing small uneven human teeth. '
          f'Thin, slightly too long arms and legs of pale potato flesh, white four-finger cartoon gloves and black shoes. It wears a '
          f'plain bright red fitted waistcoat with small brass buttons and a black bow tie. {TONE} {POSE}'),
    'c': (f'Full-body character design of a creepy potato creature for a party game. {SKIN} Its face is set into the potato flesh: '
          f'mismatched glossy human eyes, one a little bigger than the other, and a wide thin grin cut into the flesh with rows of '
          f'tiny teeth; a few long pale sprouts curl from the top of the potato like thin hair. Gangly thin arms with long knobbly '
          f'root-like fingers, thin legs in black trousers and black shoes. It wears a plain bright red fitted waistcoat. {TONE} {POSE}'),
}


def look(take):  # the picked concept's own words, for the designs that follow it
    return {'a': 'thin pale root-like arms and legs, knobbly four-fingered root hands, stubby root feet, glossy too-human eyes and a thin cut mouth sewn shut with black stitches',
            'b': 'thin slightly too long arms and legs of pale potato flesh, white four-finger cartoon gloves, black shoes, glossy too-human eyes and a crooked knife-cut mouth with small uneven teeth',
            'c': 'gangly thin arms with long knobbly root fingers, thin legs in black trousers and black shoes, mismatched glossy human eyes and a thin grin cut into the flesh with tiny teeth'}[take]


def ROUND2(take):  # the first round take (a) came out as tall as the bean: the squat wording every take uses since
    return (f'The same creepy potato character as the reference image, with the same realistic russet potato skin, dirt, blemishes and sprouts, {look(take)}. '
            'A second, much rounder body shape: a squat, fat, almost spherical round potato, clearly wider than it is tall, like a big round new potato, '
            'with the same face, the same thin arms, short legs, and the same plain bright red fitted waistcoat stretched round its middle. '
            f'{TONE} {POSE}')


def SQUAT(take):  # take b's round-r2 came out as tall as the bean again: say the proportions outright
    return (f'Redraw the creepy potato character from the reference image with very different body proportions: the same face, the same '
            f'realistic russet potato skin, dirt, blemishes and sprouts, {look(take)}, but the potato body is squashed into a fat, squat ball, '
            f'about one and a half times as wide as it is tall, as round as a big round new potato; the whole character is only about '
            f'three quarters as tall as the reference, with short legs. The same plain bright red fitted waistcoat stretched round its fat middle. '
            f'One single character alone in the frame. {TONE} {POSE}')


def designs(take):
    L = look(take)
    same = f'The same creepy potato character as the reference image, with the same realistic russet potato skin, dirt, blemishes and sprouts, {L}.'
    return {
        'round': f'{same} A second body shape: a shorter, rounder, fatter potato, about as wide as it is tall, the same plain bright red fitted waistcoat. {TONE} {POSE}',
        'croupier': f'{same} A casino croupier: a pale yellow-gold potato, a black waistcoat with gold buttons, a crisp white shirt collar, a red bow tie and black sleeve garters on the arms, neat and formal. {TONE} {POSE}',
        'bartender': f'{same} A casino bartender: a dark brown russet potato with a big bushy black handlebar moustache under the eyes, a white shirt collar, a dark green waistcoat and a short black waist apron that ends above the legs. {TONE} {POSE}',
        'guard': f'One single character alone in the frame. {same} A casino security guard: a big lumpy purple-skinned potato, a black uniform jacket with a gold star badge on the chest, a black peaked security cap on top of the potato, a coiled earpiece wire, a heavy stern brow. {TONE} {POSE}',
    }


CAST = [  # name, character colour (the waistcoat), potato skin, hat, persona (src/config.js CAST, src/talk.js PERSONAS; as tools/v4_chars.py)
    ('Red', 'red', 'russet', 'a brown fedora', 'a film-noir detective'),
    ('Mint', 'mint green', 'golden', 'a black top hat and a monocle', 'a smug know-it-all'),
    ('Biscuit', 'biscuit tan', 'russet', 'a cowboy hat', 'a cowboy'),
    ('Lola', 'bubblegum pink', 'red-skinned', 'a red beret', 'a gossip'),
    ('Duke', 'royal blue', 'golden', 'a black bowler hat', 'a pompous wannabe lawyer'),
    ('Pip', 'lemon yellow', 'russet', 'a green poker visor', 'a slick high roller'),
    ('Coco', 'lavender purple', 'purple-skinned', 'a small gold crown', 'a sweet grandma with round glasses'),
    ('Ozzie', 'orange', 'red-skinned', 'a knitted beanie', 'a hothead'),
    ('Teal', 'teal', 'golden', 'a baseball cap', 'a nervous rookie'),
    ('Snow', 'snow white', 'pale golden', 'a striped party hat', 'a tipsy party girl'),
    ('Moss', 'moss green', 'russet', 'a pirate hat', 'a paranoid conspiracy nut'),
    ('Ruby', 'deep ruby red', 'red-skinned', 'a big felt flower', 'a sweetheart'),
    ('Sky', 'sky blue', 'golden', 'a propeller beanie', 'a nervous wreck'),
    ('Peach', 'peach', 'golden', 'a white chef hat', 'a passionate chef'),
    ('Ink', 'charcoal black', 'purple-skinned', 'big headphones', 'a laid-back DJ'),
    ('Lime', 'lime green', 'russet', 'a sombrero', 'a stand-up comedian'),
    ('Navy', 'navy blue', 'russet', "a white ship captain's peaked cap with a black peak and a gold anchor badge", 'a weathered old sea captain'),
    ('Fudge', 'chocolate brown', 'russet', 'a grey viking helmet with two big cream horns', 'a loud, boastful barbarian'),
    ('Plum', 'plum purple', 'purple-skinned', 'a tall pointed midnight blue wizard hat with gold stars', 'a mysterious fortune teller with gold hoop earrings'),
    ('Fern', 'forest green', 'golden', 'a black graduation mortarboard cap with a gold tassel', 'a nerdy card-counting math whiz with round glasses'),
    ('Diva', 'vivid hot magenta pink', 'red-skinned', 'a jester hat with three floppy yellow, teal and purple points ending in gold bells', 'a theatrical drama queen'),
    ('Goldie', 'dark mustard gold', 'golden', 'a giant hot pink satin hair bow', 'a spoiled rich heiress with a pearl necklace'),
    ('Scoop', 'slate blue-grey', 'russet', 'a brown checked tweed deerstalker cap', 'a true-crime podcaster with a small microphone clipped to the waistcoat'),
    ('Lilac', 'pale lilac', 'purple-skinned', 'a long floppy blue and white striped nightcap with a white pompom', 'a sleepy, droopy-eyed sleepyhead'),
    ('Dash', 'bright aqua cyan', 'golden', 'a wide purple cavalier hat with a big white feather plume', 'a suave, winking charmer'),
    ('Clover', 'buttery cream', 'russet', 'a headband with two tall brown felt bunny ears with pink insides', 'a superstitious gambler holding a four-leaf clover'),
    ('Rusty', 'rust orange', 'russet', 'a grey fur trapper hat with white fur trim and the ear flaps down', 'a rugged outdoorsman with rough stubble'),
    ('Brick', 'dark maroon', 'red-skinned', 'a bright yellow construction hard hat', 'a burly, plain-spoken builder'),
    ('Presto', 'bright kelly green', 'purple-skinned', 'a red fez with a black tassel', 'a showy stage magician holding a black wand with a white tip'),
    ('Drizzle', 'deep petrol blue-green', 'russet', 'a small open red umbrella hat on a headband', 'a gloomy pessimist'),
    ('Mittens', 'dusty mauve', 'golden', 'a black headband with pointed black cat ears', 'a cat-loving cat lady'),
    ('Sunny', 'silver grey', 'golden', 'a floppy bucket hat in a bright orange and pink tropical flower print', 'a cheerful tourist with a camera on a strap'),
]
EMOTIONS = {
    'calm': 'a calm, neutral, slightly curious stare',
    'nervous': 'a nervous face: worried brows pushed up in the flesh, darting glossy eyes, the mouth cut pulled into a wobbly line, a bead of starchy sweat on the side',
    'angry': 'an angry face: the flesh furrowed hard over the eyes, the mouth cut twisted into a snarl, pointing at the viewer with one hand',
    'smug': 'a smug face: one brow ridge raised, heavy half-closed lids over the glossy eyes, the mouth cut pulled into a lopsided smirk',
    'crying': 'a crying face: sagging brows, the mouth cut turned down, glistening tears running down the potato skin from the glossy eyes',
}


def portrait(take, colour, skin, hat, persona, emo):
    return (f'Head-and-shoulders portrait of the creepy potato character in the reference image: the same realistic lumpy potato '
            f'with {skin} potato skin, russet netting, dirt, blemishes and sprouts, {look(take)}, wearing {hat} and a plain {colour} '
            f'fitted waistcoat; {persona}. The upper body fills the frame, facing the viewer, {EMOTIONS[emo]}. Uncanny and a little '
            f'creepy but fun, no blood, no gore. Background: a softly blurred warm Art Deco casino with gold light. Cinematic '
            f'stop-motion film lighting, sharp focus on the face, square portrait, no text, no logos.')


def run(args):
    return subprocess.run(HELPER + args, capture_output=True, text=True)


def call(tool, folder, body):
    out = RUNS / folder
    if (out / 'job.json').is_file():
        if json.loads((out / 'job.json').read_text(encoding='utf-8')).get('status') != 'rejected':
            return 'have ' + folder
        n = 1  # refused at submission (an outage), never charged: keep the refusal and try again
        while (out / f'job-rejected-{n}.json').is_file():
            n += 1
        (out / 'job.json').rename(out / f'job-rejected-{n}.json')
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


def result(folder):
    for s in ('-retry1', ''):
        p = RUNS / f'{folder}{s}' / 'result.json'
        if p.is_file():
            return json.loads(p.read_text(encoding='utf-8')), RUNS / f'{folder}{s}'
    raise SystemExit('no result for ' + folder)


def image_url(folder):
    res, _ = result(folder)
    i = res['images'][0]
    return i['url'] if isinstance(i, dict) else i


def picked():
    if not PICK.is_file():
        raise SystemExit('no concept picked yet: write a, b or c to ' + str(PICK))
    return PICK.read_text(encoding='utf-8').strip()


def image(folder, prompt, refs, model='nano-banana-pro', res='2K'):
    return call('image_generate', folder, {'model': model, 'prompt': prompt, 'aspectRatio': '1:1', 'params': {'resolution': res}, 'refImages': refs or None})


def parallel(jobs, wait=900):
    # submit everything first, then poll each (polls of finished jobs return at once)
    for f, p, refs, model, res in jobs:
        print(image(f, p, refs, model, res), flush=True)
    for f, *_ in jobs:
        print(poll(f, wait), flush=True)


def T(name, take=None):  # a receipt folder of the picked take: take a (the first pick, since replaced) kept the bare names
    take = take or picked()
    return name if take == 'a' else f'{take}-{name}'


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else ''
    if what == 'concepts':
        parallel([(f'concept-{k}', p, None, 'nano-banana-pro', '2K') for k, p in CONCEPTS.items()])
    elif what == 'designs':
        take = sys.argv[2] if len(sys.argv) > 2 else picked()
        with open(PICK, 'w', encoding='utf-8', newline='') as f:
            f.write(take + '\n')
        ref = image_url(f'concept-{take}')
        parallel([(T(k, take), p, [ref], 'nano-banana-pro', '2K') for k, p in designs(take).items() if k != 'round'] +
                 [(T('round-r2', take), ROUND2(take), [ref], 'nano-banana-pro', '2K')])
    elif what == 'retake':  # retake round,guard r3: a design again under a new folder (take b's round stayed tall, its guard came out twice)
        take = picked(); ref = image_url(f'concept-{take}')
        P = dict(designs(take), round=SQUAT(take))
        jobs = [(T(f'{k}-{sys.argv[3]}'), P[k], [ref], 'nano-banana-pro', '2K') for k in sys.argv[2].split(',')]
        parallel(jobs)
    elif what == 'round4':  # the squat wording alone kept b tall: take b's character on take a's round body (round-r2) as a second reference
        take = picked()
        p = (f'The creepy potato character from the first reference image ({look(take)}, its plain bright red fitted waistcoat and black bow '
             f'tie, the same face and potato skin), given the fat, squat, almost spherical round potato body shape of the second reference '
             f'image: the body clearly wider than it is tall. One single character alone in the frame. {TONE} {POSE}')
        parallel([(T('round-r4'), p, [image_url(f'concept-{take}'), image_url('round-r2')], 'nano-banana-pro', '2K')])
    elif what == 'meshes':
        take = picked()
        # take b: round-r3 (squat wording; still tall, so rig_bean widens it) and guard-r3 (the first guard came out twice)
        src = {'bean': f'concept-{take}', 'round': T('round-r3'), 'croupier': T('croupier'), 'bartender': T('bartender'), 'guard': T('guard-r3')}
        kinds = sys.argv[2].split(',') if len(sys.argv) > 2 else list(src)
        for k in kinds:
            print(call('model_generate', T(f'{k}Mesh'), {'model': 'meshy-7', 'imageUrl': image_url(src[k]), 'params': {
                'should_texture': True, 'texture_resolution': '4k', 'should_remesh': True, 'topology': 'triangle', 'target_polycount': 16000,
                'enable_pbr': True}}), flush=True)
        for k in kinds:
            print(poll(T(f'{k}Mesh'), 1500), flush=True)
    elif what == 'portraits':
        take = picked(); ref = image_url(f'concept-{take}')
        who = sys.argv[2] if len(sys.argv) > 2 else 'Red'
        emos = sys.argv[3].split(',') if len(sys.argv) > 3 else list(EMOTIONS)
        jobs = [(T(f'p-{n}-{e}'), portrait(take, c, s, h, pe, e), [ref], 'gpt-image-2.5-flare', '1K')
                for n, c, s, h, pe in CAST if who == 'all' or n in who.split(',') for e in emos]
        for i in range(0, len(jobs), 20):  # in waves, so a stall never leaves many unpolled
            parallel(jobs[i:i + 20], 600)
    elif what == 'redo':
        for item in sys.argv[2].split(','):
            name, emo, *tag = item.split('-')
            calm = image_url(T(f'p-{name}-calm'))
            _, colour, skin, hat, persona = next(c for c in CAST if c[0] == name)
            prompt = (f'The same creepy potato character as the reference image: the same {skin} potato skin, the same {hat}, the same '
                      f'{colour} waistcoat, the same framing, background and lighting. Change only the expression: {EMOTIONS[emo]}. '
                      f'Square portrait, no text, no logos.')
            f = T(f'p-{name}-{emo}-{tag[0] if tag else "r1"}')
            print(image(f, prompt, [calm], 'gpt-image-2.5-flare', '1K'), flush=True); print(poll(f, 600), flush=True)
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
