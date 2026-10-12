"""Sorceress jobs for the v4 characters (plan-v4 section 4, phases 1, 3 and 9). Each job gets its own receipt folder
under runs/sorceress/v4-chars/<name>; a folder that already has a job is skipped, so reruns never pay twice.

    python tools/v4_chars.py images            # body shape 2 and the three staff designs
    python tools/v4_chars.py portraits Red     # one character's five meeting portraits (pilot)
    python tools/v4_chars.py portraits all
    python tools/v4_chars.py redo Ozzie-angry,Teal-angry[-r2]   # from that character's calm portrait
"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / 'runs' / 'sorceress' / 'v4-chars'
HELPER = ['python', 'C:/dev/playground-td/.claude/skills/sorceress-game-assets/scripts/sorceress.py', '--env', 'C:/dev/mr-mak-workspace/.env']
BEAN_A = 'https://wizardgenie-media.s3.us-west-004.backblazeb2.com/generations/14b713ad-480d-44e5-a794-18be8c0a897d/3763125f-e33e-4057-bb44-697c89554aae/nano-banana-pro-1.png'

POSE = ('Open A-pose: arms lowered about 40 degrees out from the body with a clear gap at each armpit, legs straight and hips-width '
        'apart, gloved hands open with the fingers together, nothing in the hands, no base or stand under the feet. Straight-on front view, '
        'plain light grey background, even diffuse studio lighting, no cast shadow, centered, full body head to toe visible, no text.')
LOOK = ('A plush-toy bean character sewn from soft felt with visible stitched seams, black button eyes and a stitched smile, matching the '
        'reference image exactly in material, eyes, gloves and proportions of the limbs: short felt arms ending in white four-finger cartoon '
        'gloves, short felt legs with black shoes.')

IMAGES = {
    'beanRound': f'{LOOK} Same character as the reference but a second body shape: shorter, rounder and wider, an egg-shaped body about as wide '
                 f'as it is tall, red felt, a small gold waistcoat and a black bow tie. {POSE}',
    'croupier': f'{LOOK} A casino croupier: cream felt body, a black waistcoat with gold buttons, a crisp white shirt collar, a red bow tie and '
                f'black sleeve garters on the arms, neat and formal. {POSE}',
    'bartender': f'{LOOK} A casino bartender: warm brown felt body, a stitched handlebar moustache under the eyes, a white shirt collar, a dark '
                 f'green waistcoat and a short black waist apron that ends above the legs. {POSE}',
    'guard': f'{LOOK} A casino security guard: dark navy felt body, a black uniform jacket with a gold star badge on the chest, a black peaked '
             f'security cap sewn on top of the body, a coiled earpiece wire, stern stitched eyebrows. {POSE}',
}

CAST = [  # name, felt colour, hat, persona (src/config.js CAST and src/talk.js PERSONAS)
    ('Red', 'red', 'a brown fedora', 'a film-noir detective'),
    ('Mint', 'mint green', 'a black top hat and a monocle', 'a smug know-it-all'),
    ('Biscuit', 'biscuit tan', 'a cowboy hat', 'a cowboy'),
    ('Lola', 'bubblegum pink', 'a red beret', 'a gossip'),
    ('Duke', 'royal blue', 'a black bowler hat', 'a pompous wannabe lawyer'),
    ('Pip', 'lemon yellow', 'a green poker visor', 'a slick high roller'),
    ('Coco', 'lavender purple', 'a small gold crown', 'a sweet grandma with round glasses'),
    ('Ozzie', 'orange', 'a knitted beanie', 'a hothead'),
    ('Teal', 'teal', 'a baseball cap', 'a nervous rookie'),
    ('Snow', 'snow white', 'a striped party hat', 'a tipsy party girl'),
    ('Moss', 'moss green', 'a pirate hat', 'a paranoid conspiracy nut'),
    ('Ruby', 'deep ruby red', 'a big felt flower', 'a sweetheart'),
    ('Sky', 'sky blue', 'a propeller beanie', 'a nervous wreck'),
    ('Peach', 'peach', 'a white chef hat', 'a passionate chef'),
    ('Ink', 'charcoal black', 'big headphones', 'a laid-back DJ'),
    ('Lime', 'lime green', 'a sombrero', 'a stand-up comedian'),
]
EMOTIONS = {
    'calm': 'a calm, neutral, slightly curious face',
    'nervous': 'a nervous face: worried stitched eyebrows tilted up, a wobbly zigzag stitched mouth, a felt sweat drop on the side',
    'angry': 'an angry face: sharp stitched eyebrows slanted down, a stitched frown, red felt cheeks, pointing at the viewer with one hand in a white four-finger cartoon glove',
    'smug': 'a smug face: one stitched eyebrow raised, half-closed eyelids sewn over the button eyes, a lopsided stitched smirk',
    'crying': 'a crying face: sad stitched eyebrows, a downturned stitched mouth, blue felt tear streams running down from the button eyes',
}


def portrait(name, colour, hat, persona, emo):
    return (f'Head-and-shoulders portrait of a plush-toy bean character sewn from soft {colour} felt with visible stitched seams and black '
            f'button eyes, the same plush style as the reference image, wearing {hat}, a small gold waistcoat and a black bow tie; '
            f'{persona}. The upper body fills the frame, facing the viewer, {EMOTIONS[emo]}. The expression is made of felt and '
            f'embroidery like a handmade puppet. Background: a softly blurred warm Art Deco casino with gold light. Stop-motion film '
            f'lighting, sharp focus on the face, square portrait, no text, no logos.')


def call(name, body):
    out = RUNS / name
    if (out / 'job.json').is_file():
        print('have', name); return
    RUNS.mkdir(parents=True, exist_ok=True)
    inp = RUNS / f'{name}.json'
    inp.write_text(json.dumps(body, ensure_ascii=False), encoding='utf-8')
    r = subprocess.run(HELPER + ['call', 'image_generate', '--input', str(inp), '--out', str(out), '--approved'], capture_output=True, text=True)
    print(name, 'ok' if r.returncode == 0 else 'FAILED ' + (r.stderr or r.stdout)[-400:])


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else ''
    if what == 'images':
        for k, p in IMAGES.items():
            call(k, {'model': 'nano-banana-pro', 'prompt': p, 'aspectRatio': '1:1', 'params': {'resolution': '2K'}, 'refImages': [BEAN_A]})
    elif what == 'portraits':
        who = sys.argv[2] if len(sys.argv) > 2 else 'Red'
        for name, colour, hat, persona in CAST:
            if who != 'all' and name != who:
                continue
            for emo in EMOTIONS:
                call(f'p-{name}-{emo}', {'model': 'gpt-image-2.5-flare', 'prompt': portrait(name, colour, hat, persona, emo), 'aspectRatio': '1:1',
                                         'params': {'resolution': '1K'}, 'refImages': [BEAN_A]})
    elif what == 'redo':  # redo drifted portraits from the character's own calm portrait: redo Ozzie-angry,Teal-angry
        for item in sys.argv[2].split(','):
            name, emo, *tag = item.split('-')
            calm = json.loads((RUNS / f'p-{name}-calm' / 'result.json').read_text(encoding='utf-8'))['images'][0]['url']
            _, colour, hat, persona = next(c for c in CAST if c[0] == name)
            prompt = (f'The same plush bean character as the reference image: the same {colour} felt, the same {hat}, the same gold '
                      f'waistcoat and black bow tie, the same framing, background and lighting. Change only the expression: '
                      f'{EMOTIONS[emo]}. Felt and embroidery like a handmade puppet, square portrait, no text, no logos.')
            call(f'p-{name}-{emo}-{tag[0] if tag else "r1"}', {'model': 'gpt-image-2.5-flare', 'prompt': prompt, 'aspectRatio': '1:1', 'params': {'resolution': '1K'}, 'refImages': [calm]})
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
