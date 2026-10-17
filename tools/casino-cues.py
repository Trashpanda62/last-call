"""Generate the reviewed casino cue pack; no paid calls without --approved."""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HELPER = Path('C:/dev/playground-td/.claude/skills/elevenlabs-audio/scripts/eleven.py')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--approved', action='store_true')
args = parser.parse_args()
plan = json.loads((ROOT / 'design/casino-cues-v1.json').read_text(encoding='utf-8'))
total = sum(row['seconds'] * plan['rateCreditsPerSecond'] for row in plan['files'])
print(json.dumps({'files': len(plan['files']), 'seconds': total / 12, 'estimatedCredits': total, 'paid': args.approved}), flush=True)
for row in plan['files']:
    output = ROOT / 'assets/audio/cues' / (row['id'] + '.mp3')
    if args.approved and output.exists():
        print('Reuse existing: ' + row['id'], flush=True)
        continue
    cmd = [sys.executable, str(HELPER), 'sfx', row['prompt'], '--seconds', str(row['seconds']), '--out', str(output), '--max-credits', '72', '--provenance', str(ROOT / 'assets/audio/cues-provenance.json')]
    if not args.approved:
        cmd.append('--dry-run')
    subprocess.run(cmd, cwd=ROOT, check=True)
