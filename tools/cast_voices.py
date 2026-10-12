"""Voice casting for Last Call v4 (plan-v4 section 5): one ElevenLabs Voice Design call per role, three takes each,
saved as picks/v4-voices/<role>-<a|b|c>.mp3 with a provenance row and the generated voice ids (to make the picked
takes permanent voices later). Uses the elevenlabs-audio skill's key lookup; the key is never printed.

    python tools/cast_voices.py [--only red,mint] [--force]
"""
import argparse, base64, json, sys, time
from pathlib import Path

sys.path.insert(0, r'C:\dev\playground-td\.claude\skills\elevenlabs-audio\scripts')
import eleven  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / 'picks' / 'v4-voices'
MODEL = 'eleven_ttv_v3'

# role, who, the voice brief, and a sample line in character (100+ characters, as the API asks)
ROLES = [
    ('red', 'Red, the detective', 'Gravelly middle-aged man, a 1940s film-noir private eye. Low smoky voice, dry and world-weary, slow deliberate delivery, American.',
     "The way I see it, somebody in this room poisoned that drink. I saw Duke at the bar, right before. Case closed... unless one of you wants to talk."),
    ('mint', 'Mint, the know-it-all', 'Crisp, slightly nasal upper-class British woman in her thirties. Condescending and precise, fast and articulate, smug.',
     "Obviously it was Lola. Let me explain this slowly, since nobody else was paying attention. She said the bar. I saw her on the casino floor. Keep up."),
    ('biscuit', 'Biscuit, the cowboy', 'Warm drawling Texan man in his fifties. Deep and friendly, relaxed cowboy cadence, a little raspy.',
     "Now hold your horses, partner. I was over at the dice game the whole night. I ain't never killed nothin' but a steak, and that's a fact."),
    ('lola', 'Lola, the gossip', 'Bubbly young woman in her twenties with a valley-girl lilt. Fast, breathy and dramatic, loves gossip, American.',
     "Okay so, not to be dramatic, but I literally SAW Pip fiddle with the slot machine. Like, I screamed inside. Everyone knows it's Pip. Everyone."),
    ('duke', 'Duke, the wannabe lawyer', 'Pompous man in his forties with a theatrical courtroom voice. Over-enunciated, self-important, mid-Atlantic accent.',
     "Objection! Hearsay! Let the record show I was at the roulette table, and I have witnesses. Probably. The defense rests, your honor. I mean, everyone."),
    ('pip', 'Pip, the high roller', 'Smooth confident man in his thirties, a slick Las Vegas high roller. Charming, quick-talking, New York accent.',
     "Odds are, it's Ozzie. I'd bet the whole house on it. Me? I was on a hot streak at blackjack, making this crew money. Check the bank, sweetheart."),
    ('coco', 'Coco, the grandma', 'Sweet elderly woman in her eighties, warm and a little shaky. A Southern American grandmother, kind but sharp.',
     "Oh, dearie. I may be old, but I saw Mint shove that poor boy into the duck pond. Shame on you, Mint. Lord have mercy. Now somebody eat something."),
    ('ozzie', 'Ozzie, the hothead', 'Loud hot-tempered man in his thirties with a gruff Boston accent. Shouty, impatient, quick to explode.',
     "Are you KIDDING me?! ME?! I was at the slots the whole damn time! Say that again, I dare you! You're all gonna regret this, I swear!"),
    ('teal', 'Teal, the rookie', 'Young nervous person in their early twenties, light and uncertain voice, lots of upspeak, polite and a bit lost.',
     "Uh, sorry, first time here? I think I saw Snow near the snack bowl? Like, I definitely did. I think. Is that how this works? Should I vote?"),
    ('snow', 'Snow, the drunk', 'Tipsy cheerful woman in her forties, slurring slightly, giggly, husky voice with sloppy timing.',
     "Okay, okay, okay. Lissen. I saw Red do the thing. With the... the knife. There was only one Red. I counted. Who's buying the next round?"),
    ('moss', 'Moss, the conspiracy nut', 'Paranoid man in his fifties. An intense raspy voice that drops to a whisper, then bursts into fast jittery rants.',
     "Wake up, people. The pretzels, the chandelier, the cameras. It's all connected. The house is in on it. Voting is exactly what they want us to do."),
    ('ruby', 'Ruby, the sweetheart', 'Gentle warm woman in her thirties, soft-spoken and caring, sincere, with a slight Irish lilt.',
     "Oh, sweetie. I hate saying this, I really do, but I saw Biscuit near the bar right before. I'm so sorry, Biscuit. Please tell us where you were."),
    ('sky', 'Sky, the nervous wreck', 'Anxious young man with a high trembling voice, stammering and breathless, always on the edge of panic.',
     "I-I s-saw it! Coco messed with the chandelier chain, and then it just... it FELL! I'm not crazy! Oh no, oh no. Can we please go home now?"),
    ('peach', 'Peach, the chef', 'Passionate Italian chef, a man in his forties with a big expressive voice, a strong Italian accent and theatrical gestures.',
     "Mamma mia. Something smells off, and it is not my kitchen. Your alibi is half-baked, Ink. Raw in the middle. I vote you. Chef's kiss."),
    ('ink', 'Ink, the DJ', 'Laid-back young man with a mellow low voice and a slow, chill Californian surfer cadence.',
     "Bro. Real talk. I had my headphones on the whole time, vibing at the bar. Wasn't me. But Lime? The energy's off. Not the vibe, man."),
    ('lime', 'Lime, the comedian', 'Quick-witted woman in her thirties, a stand-up comedian with a sardonic raspy New York voice and punchy timing.',
     "Tough crowd. So a killer walks into a casino... and nobody notices, apparently. Look, I was at Plinko, losing money. Which is the real crime here."),
    ('croupier', 'The croupier', 'Elegant French croupier, a man in his fifties. Refined, calm and measured, formal, with a French accent.',
     "Place your bets, ladies and gentlemen. Place your bets. No more bets. Seventeen, black, odd. Congratulations to the gentleman in the fedora."),
    ('dealer', 'The blackjack dealer', 'Professional casino dealer, a woman in her thirties with a clear friendly voice. Efficient and upbeat, American.',
     "Cards are out. Dealer shows a six. Fifteen for you, sir. Hit or stand? Twenty-one! Blackjack pays three to two. Nice hand, nice hand."),
    ('announcer', 'The duck race announcer', 'Excited old-time horse-race announcer, a man with fast rapid-fire commentary, high energy, a classic radio sound.',
     "And they're off! Quackers takes the early lead, Sir Waddles on the outside, here comes Duckie Brown down the stretch, it's neck and neck, it's QUACKERS by a beak!"),
    ('pa', 'The PA announcer', 'Smooth casino PA announcer with a deep velvety male voice. Warm, unhurried, a lounge host.',
     "Good evening, and welcome to Last Call. The tables are open, the drinks are on the house, and the house always wins. Please, enjoy your stay."),
    ('bartender', 'The bartender', 'Friendly gruff bartender, a woman in her forties with a husky voice. Wry, unflappable, Brooklyn accent.',
     "What'll it be, hon? Martini, beer, whiskey? Somebody already sent you one, on the house. No, I didn't see who. I don't see nothin'. Drink up."),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    only = set(filter(None, a.only.split(',')))
    OUT.mkdir(parents=True, exist_ok=True)
    ids_path = OUT / 'ids.json'
    ids = json.loads(ids_path.read_text(encoding='utf-8')) if ids_path.is_file() else {}
    for i, (role, who, brief, line) in enumerate(ROLES):
        if only and role not in only:
            continue
        if role in ids and not a.force:
            print('have', role); continue
        seed = 7100 + i
        body = {'voice_description': brief, 'model_id': MODEL, 'text': line, 'seed': seed, 'guidance_scale': 5}
        started = time.time()
        raw, headers = eleven.request('POST', '/v1/text-to-voice/design?output_format=mp3_44100_192', body, timeout=600)
        res = json.loads(raw)
        takes = []
        for k, p in zip('abc', res.get('previews', [])):
            f = OUT / f'{role}-{k}.mp3'
            f.write_bytes(base64.b64decode(p['audio_base_64']))
            takes.append({'take': k, 'file': f.name, 'generated_voice_id': p.get('generated_voice_id'), 'seconds': p.get('duration_secs')})
        stamp = eleven.now_ct()
        job = headers.get('request-id') or headers.get('x-request-id')
        credits = int(headers['character-cost']) if headers.get('character-cost', '').isdigit() else None
        ids[role] = {'who': who, 'brief': brief, 'line': line, 'seed': seed, 'model': MODEL, 'takes': takes, 'jobId': job, 'credits': credits,
                     'date': stamp.date().isoformat(), 'time_ct': stamp.strftime('%H:%M')}
        ids_path.write_text(json.dumps(ids, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
        eleven.log({'time': stamp.isoformat(timespec='seconds'), 'tool': 'voice-design', 'endpoint': '/v1/text-to-voice/design', 'body': body,
                    'out': [t['file'] for t in takes], 'credits': credits, 'headers': headers, 'elapsed': round(time.time() - started, 1)})
        for t in takes:
            eleven.add_provenance(OUT / 'provenance.json', {'file': t['file'], 'provider': 'ElevenLabs', 'tool': 'text-to-voice/design', 'model': MODEL,
                                                             'params': {'seed': seed, 'guidance_scale': 5}, 'jobId': job, 'credits': credits,
                                                             'date': stamp.date().isoformat(), 'time_ct': stamp.strftime('%H:%M'),
                                                             'prompt': brief + ' | line: ' + line, 'rights': "ElevenLabs terms; Steve's account"})
        print(role, len(takes), 'takes', credits, 'credits')


if __name__ == '__main__':
    main()
