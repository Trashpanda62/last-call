"""ElevenLabs audio for v4 (plan-v4 section 5; Steve, 2026-10-12: no voice lines, no budget): effects, room ambience and
music. Raw takes go to runs/elevenlabs/v4/ (git-ignored); `export` trims, levels and compresses them into assets/audio/
and writes assets/audio/audio.json (the game's manifest) and provenance.json. A take that exists is never paid twice.

    python tools/v4_audio.py make [sfx|amb|music|name,name]
    python tools/v4_audio.py export
"""
import json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'runs' / 'elevenlabs' / 'v4'
OUT = ROOT / 'assets' / 'audio'
ELEVEN = ['python', 'C:/dev/playground-td/.claude/skills/elevenlabs-audio/scripts/eleven.py']

SFX = {  # name: (prompt, seconds, takes)
    'chip': ('two clay casino chips clacking together, close up, dry', 0.6, 3),
    'chips': ('a short stack of clay poker chips pushed across green felt, soft clatter', 1.0, 2),
    'card': ('a single playing card dealt and sliding across a felt table, quick swish', 0.5, 3),
    'flip': ('a playing card flipped face up onto felt with a crisp snap', 0.5, 2),
    'shuffle': ('a deck of playing cards riffle shuffled and bridged', 1.6, 1),
    'rouletteSpin': ('a wooden roulette wheel spinning with the ivory ball rattling fast around the rim, then slowing down', 6.0, 1),
    'ballDrop': ('a small ivory roulette ball bouncing and clattering across metal frets then dropping into a pocket and settling', 1.6, 2),
    'lever': ('a slot machine lever pulled down hard, heavy spring and ratchet clunk', 0.8, 2),
    'reels': ('mechanical slot machine reels spinning, whirring motor and fast clicking', 2.0, 1),
    'reelStop': ('a single slot machine reel thunking to a stop, short mechanical clunk', 0.5, 3),
    'jackpot': ('slot machine jackpot: alarm bells ringing and a flood of coins pouring into a metal tray', 4.0, 1),
    'smallWin': ('a short cheerful casino win jingle of bright chimes and a coin drop', 1.4, 2),
    'peg': ('a tiny plastic ball tapping a small peg, a single bright tick', 0.5, 3),
    'slotLand': ('a small ball dropping into a slot with a soft thud and a little bell', 0.8, 2),
    'diceShake': ('two dice rattled inside a cupped hand', 0.9, 1),
    'diceRoll': ('two dice thrown hard, bouncing off a padded wall and tumbling across felt', 1.2, 2),
    'coinFlip': ('a coin flicked up with a metallic ping, spinning in the air and slapped onto the back of a hand', 1.3, 2),
    'wheelSpin': ('a big carnival prize wheel spinning, its leather flapper clicking over the pegs and slowing to a stop', 6.0, 1),
    'rocket': ('a toy firework rocket launching with a rising whistle and whoosh', 2.0, 1),
    'boom': ('a cartoon explosion, a short pop and a puffy boom with light debris', 1.4, 2),
    'cashout': ('an old brass cash register cha-ching with the drawer sliding open', 1.0, 1),
    'gem': ('a sparkling crystal chime, a magical gem found, bright and short', 0.8, 2),
    'mine': ('a small muffled cartoon bomb going off under a felt cushion', 1.2, 1),
    'step': ('a light wooden plank creak with a bright marimba note', 0.6, 2),
    'gun': ('a starter pistol shot outdoors with a short echo', 0.8, 1),
    'splash': ('rubber ducks splashing playfully in a fountain', 1.0, 2),
    'squeak': ('a single rubber duck squeak', 0.5, 2),
    'pour': ('a cocktail being poured from a shaker over ice into a glass', 1.6, 2),
    'sip': ('a short polite sip from a glass with a little ice clink', 0.6, 2),
    'clink': ('two crystal cocktail glasses clinking together', 0.6, 2),
    'poison': ('a sinister effervescent fizz bubbling in a glass, with a low eerie undertone', 1.6, 1),
    'stab': ('a soft cartoon stab into a plush toy: a muffled thump and a short fabric rip', 0.8, 2),
    'die': ('a plush toy body flopping onto a carpeted floor, soft heavy thud and a puff of stuffing', 0.9, 2),
    'gasp': ('a dramatic orchestral stinger, a sudden low string and brass hit, shocking', 1.4, 2),
    'lights': ('a big electrical breaker clunk and the lights powering down with a falling hum', 1.6, 1),
    'lightsOn': ('fluorescent lights flickering back on with an electric buzz', 1.6, 1),
    'meeting': ('a brass hand bell rung urgently three times in a big room', 2.0, 1),
    'vote': ('a rubber stamp thumped onto a paper ballot on a wooden desk', 0.5, 2),
    'eject': ('a heavy back door flung open, a soft body tossed out into a rainy alley and landing in a puddle, door slams', 2.6, 1),
    'door': ('a heavy padded casino door swinging open with a soft leather creak', 1.0, 1),
    'haunt': ('a ghostly whoosh with faint eerie chimes and a cold wind', 1.6, 2),
    'cam': ('an old CRT security monitor switching channel with a burst of static', 0.6, 2),
    'radio': ('a walkie-talkie squelch and a short burst of static', 0.6, 1),
    'click': ('a soft plastic button click, tiny and dry', 0.5, 2),
    'coin': ('a single gold coin dropping onto a wooden counter and ringing', 0.6, 2),
    'chat': ('a soft bubbly pop like a speech bubble appearing', 0.5, 1),
    'start': ('a bright two-note casino chime, welcoming', 1.0, 1),
    'cheer': ('a small crowd applauding and whistling, no voices', 2.0, 1),
    'chandelier': ('a crystal chandelier creaking on its chain then crashing to the floor in a shower of glass', 2.6, 1),
    'fallCarpet': ('a single soft footstep on thick casino carpet', 0.5, 3),
    'fallWood': ('a single footstep with a dress shoe on a wooden floor', 0.5, 3),
    'fallTile': ('a single footstep with a dress shoe on a tiled bathroom floor, slight echo', 0.5, 3),
    'fallStreet': ('a single footstep on wet asphalt in an alley', 0.5, 3),
}
AMB = {  # room: prompt (30 s seamless loops)
    'floor': 'a lavish casino floor: distant slot machine chimes, chips clacking, a roulette ball rattling far away, soft murmur of a crowd with no words',
    'bar': 'a hotel cocktail bar: ice in a shaker, glasses clinking, bottles set down, a low murmur of a few people with no words',
    'rest': 'a quiet tiled restroom: fluorescent light hum, a dripping tap, a distant muffled party through the wall',
    'arcade': 'an arcade room: machines humming, soft electronic bleeps and coin-drop jingles, buttons tapping',
    'race': 'an indoor fountain pond: water trickling and splashing gently, a few rubber duck squeaks far away, soft room tone',
    'slots': 'a slot machine hall: many slot machines chiming and whirring, coins dropping, reels clicking, no voices',
    'alley': 'a back alley at night: light rain dripping from gutters, a buzzing neon sign, distant city traffic, muffled music through a door',
    'vip': 'a quiet VIP lounge: very soft murmur with no words, a champagne cork far away, crackling fireplace, warm room tone',
}
MUSIC = {  # name: (prompt, seconds, takes); loops end where they begin, stings end on a clear chord
    'menu': ('Smoky 1930s jazz lounge theme for a murder-mystery party game: muted trumpet, brushed drums, walking upright bass, piano, mysterious and playful, 92 bpm, instrumental, even pulse, loopable', 60, 2),
    'floor': ('Upbeat glamorous swing jazz for a casino floor: piano, upright bass, brushed drums, clarinet, light and playful, 118 bpm, instrumental, unobtrusive background, loopable', 90, 2),
    'bar': ('Relaxed solo stride piano in a hotel bar, warm and a little tipsy, 100 bpm, instrumental, loopable', 60, 2),
    'vip': ('Slow sultry jazz ballad for a champagne VIP lounge: tenor saxophone and piano, soft brushes, 70 bpm, instrumental, loopable', 60, 2),
    'arcade': ('Retro synthwave arcade groove, bright arpeggios and a punchy drum machine, 110 bpm, instrumental, loopable', 60, 2),
    'alley': ('Slow late-night blues in a rainy back alley: electric guitar, harmonica, brushed snare, 72 bpm, instrumental, loopable', 60, 2),
    'race': ('Fast silly ragtime for a rubber duck race: honky-tonk piano and banjo, 150 bpm, instrumental, loopable', 45, 2),
    'meeting': ('Tense detective suspense underscore for a heated argument: pizzicato strings, low piano notes, a ticking clock, quiet and sparse, 90 bpm, instrumental, loopable', 60, 2),
    'eject': ('A comedic dramatic orchestral sting: a falling brass glissando and a final low thud chord, 4 seconds', 5, 2),
    'win': ('A short triumphant jazz brass fanfare ending on a bright major chord', 4, 2),
    'lose': ('A short sad trombone and tuba descending wah-wah, comedic, ending on a low note', 4, 2),
    'gamblersWin': ('A celebratory big band jazz finale: brass hits, cymbal swell, ending on a bright major chord', 9, 2),
    'killersWin': ('A sinister film noir jazz ending: low brass, muted trumpet, a creeping bass, ending on an ominous minor chord', 9, 2),
}


def jobs(which):
    out = []
    groups = {'sfx': SFX, 'amb': AMB, 'music': MUSIC}
    names = None if which in groups or not which else set(which.split(','))
    for g, table in groups.items():
        if which in groups and which != g:
            continue
        for n, v in table.items():
            if names and n not in names:
                continue
            if g == 'amb':
                out.append((g, n, 1, ['sfx', v, '--seconds', '30', '--loop']))
            elif g == 'sfx':
                p, s, k = v
                for i in range(1, k + 1):
                    out.append((g, n, i, ['sfx', p, '--seconds', str(s)]))
            else:
                p, s, k = v
                for i in range(1, k + 1):
                    out.append((g, n, i, ['music', p, '--seconds', str(s)]))
    return out


def run(job):
    g, n, i, args = job
    raw = RAW / g / f'{n}-{i}.mp3'
    if raw.is_file():
        return f'have {raw.name}'
    raw.parent.mkdir(parents=True, exist_ok=True); (RAW / 'prov').mkdir(parents=True, exist_ok=True)
    r = subprocess.run(ELEVEN + args + ['--out', str(raw), '--max-credits', '3000', '--provenance', str(RAW / 'prov' / f'{g}-{n}-{i}.json')],
                       capture_output=True, text=True, cwd='C:/dev/playground-td')
    return f'{g}/{n}-{i} ' + ('ok' if r.returncode == 0 and raw.is_file() else 'FAILED ' + (r.stderr or r.stdout)[-200:])


def make(which):
    js = jobs(which)
    with ThreadPoolExecutor(1 if any(j[0] == 'music' for j in js) else 4) as ex:  # music refuses parallel calls; each take keeps its own provenance file
        for line in ex.map(run, js):
            print(line, flush=True)


def ff(args):
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error'] + args, capture_output=True, text=True)
    if r.returncode:
        print('ffmpeg', r.stderr[-200:])


def peak(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(path), '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    m = [l for l in r.stderr.splitlines() if 'max_volume' in l]
    return float(m[0].split('max_volume:')[1].split('dB')[0]) if m else -2.0


def export():
    man = {'sfx': {}, 'amb': {}, 'music': {}}
    for g in ('sfx', 'amb', 'music'):
        (OUT / g).mkdir(parents=True, exist_ok=True)
        for raw in sorted((RAW / g).glob('*.mp3')):
            dst = OUT / g / raw.name
            if g == 'sfx':  # mono, start on the sound, peaks near -3 dBFS (loudnorm can't measure clips this short)
                gain = -3.5 - peak(raw)
                ff(['-i', str(raw), '-af', f'silenceremove=start_periods=1:start_threshold=-48dB,volume={gain:.1f}dB',
                    '-ac', '1', '-ar', '44100', '-b:a', '96k', str(dst)])
            elif g == 'amb':  # quiet beds under everything
                ff(['-i', str(raw), '-af', 'loudnorm=I=-28:TP=-3:LRA=11', '-ac', '2', '-ar', '44100', '-b:a', '112k', str(dst)])
            else:
                ff(['-i', str(raw), '-af', 'loudnorm=I=-20:TP=-1.5:LRA=11', '-ac', '2', '-ar', '44100', '-b:a', '128k', str(dst)])
            name = raw.stem.rsplit('-', 1)[0]
            man[g].setdefault(name, []).append(f'{g}/{raw.name}')
    (OUT / 'audio.json').write_text(json.dumps(man, indent=1) + '\n', encoding='utf-8')
    rows = []
    for f in sorted((RAW / 'prov').glob('*.json')):
        d = json.loads(f.read_text(encoding='utf-8'))
        g = f.stem.split('-', 1)[0]
        for r in (d if isinstance(d, list) else [d]):  # point each row at the shipped file
            r['file'] = f"assets/audio/{g}/{Path(r.get('file', '')).name}"
            rows.append(r)
    (OUT / 'provenance.json').write_text(json.dumps(rows, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print({g: sum(len(v) for v in man[g].values()) for g in man})


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'make':
        make(sys.argv[2] if len(sys.argv) > 2 else '')
    elif cmd == 'export':
        export()
    else:
        print(__doc__)
