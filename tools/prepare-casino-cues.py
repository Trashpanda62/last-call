"""Measure generated cues; --apply balances existing files without provider calls."""
import argparse
import array
import json
import math
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()

def measure(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', '24000', 'pipe:1'], capture_output=True, check=True).stdout
    samples = array.array('f'); samples.frombytes(raw)
    peak = max(map(abs, samples))
    db = lambda x: round(20 * math.log10(max(1e-9, x)), 2)
    rms = lambda a: math.sqrt(sum(x*x for x in a) / len(a))
    first = next((i for i, x in enumerate(samples) if abs(x) > peak * .1), 0)
    return dict(seconds=round(len(samples)/24000, 3), peakDb=db(peak), rmsDb=db(rms(samples)),
                overFullScale=sum(abs(x) >= 1 for x in samples), tailRmsDb=db(rms(samples[-2400:])), onset=round(first/24000, 3))

plan = json.loads((ROOT / 'design/casino-cues-v1.json').read_text())
backup = ROOT / '.dev/cue-originals'
rows = []
for cue in plan['files']:
    path = ROOT / 'assets/audio/cues' / (cue['id'] + '.mp3')
    original = backup / path.name
    if args.apply and not original.exists():
        backup.mkdir(parents=True, exist_ok=True); shutil.copy2(path, original)
    before = measure(original if original.exists() else path)
    target = -14 if 'Step' in cue['group'] else -8 if cue['group'] == 'distantDeath' else -13 if cue['group'] in ('whisperBehind', 'ventKnock') else -10
    gain = round(target - before['peakDb'], 2)
    if args.apply:
        fade = max(0, cue['seconds'] - .3)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(original), '-af', f'volume={gain}dB,afade=t=in:d=0.008,afade=t=out:st={fade}:d=0.3', '-c:a', 'libmp3lame', '-b:a', '192k', str(path)], check=True)
    rows.append(dict(file=path.name, gainDb=gain, before=before, after=measure(path)))
result = dict(files=len(rows), prepared=args.apply, providerCalls=0, estimatedCredits=624, receiptCredits=628, rows=rows)
(ROOT / 'docs/performance/2026-10-16-cue-file-check.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
if args.apply:
    assert all(r['after']['peakDb'] < -5 and r['after']['overFullScale'] == 0 and r['after']['tailRmsDb'] < -45 for r in rows)
