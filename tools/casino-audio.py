import json, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
HELPER='C:/dev/playground-td/.claude/skills/elevenlabs-audio/scripts/eleven.py'
JOBS=[
 ('music','house-after-hours',60,'Instrumental haunted casino lounge underscore. Sparse felt piano, bowed upright bass, dusty muted trumpet fragments, soft brushed snare, slow 62 bpm in a dark minor key. Elegant, uneasy, restrained film noir suspense, distant tape warble and long room reverb. Quiet background music with a gentle even pulse, no vocals, no big crescendos, no sudden stingers. Loopable, soft opening and resolving tail.'),
 ('music','house-empty-chairs',60,'Instrumental eerie casino music, abandoned velvet lounge at 3 am. Detuned upright piano plays a sparse repeating minor motif over low bass clarinet and a soft sustained string drone. Slow 55 bpm, faint brushed percussion, unsettling and melancholic, subtle analog tape flutter, intimate and quiet. No vocals, no upbeat swing, no loud accents, suitable for continuous atmospheric background, loopable.'),
 ('music','house-last-wager',60,'Instrumental psychological horror film noir casino underscore. Subtle vibraphone, low tremolo strings, creeping double bass, occasional muted trumpet notes, soft brushed cymbal pulse at 65 bpm, dark chromatic harmony, dusty ballroom acoustics. Tense and sophisticated, restrained and unobtrusive, no vocals, no jump scares, no big orchestral hits, loopable background music.'),
 ('amb','floor-card-room',30,'Eerie late-night blackjack pit: close dry playing cards slide onto green felt, intermittent riffle shuffles, clay chips softly clack, padded chairs creak. Low indistinct distant crowd, a restrained distant cough and ventilation. Card tables close, slot machines barely audible in another room. No music, intelligible speech or electronic jingles. Seamless ambience loop.'),
 ('amb','floor-roulette-room',30,'A quiet atmospheric casino roulette pit late at night. An ivory ball rattles around a polished wooden roulette wheel, gradually slows, bounces across metal frets and settles into a pocket, then clay chips softly rake across green felt. Low indistinct crowd murmur and airy ventilation, sparse distant cough, muted room reverb, eerie calm. No music, no intelligible speech, no slot machine jingles. Seamless continuous ambience loop.'),
 ('amb','floor-mixed-tables',30,'Spacious eerie casino table floor after midnight: nearby cards shuffle and slide across felt, clay chips clatter gently, a roulette ball rolls and settles, dice tumble on felt. Sparse distant coughs, hushed indistinct crowd and ventilation. Slot machines faint and far away behind doors. No music, intelligible speech or loud jackpots. Seamless ambience loop.')]
plan=[{'kind':kind,'name':name,'seconds':seconds,'prompt':prompt,'file':f'assets/audio/{"music" if kind=="music" else "amb"}/{name}.mp3'} for kind,name,seconds,prompt in JOBS]
(ROOT/'.dev/casino-audio-plan.json').write_text(json.dumps(plan,indent=2))
for job in plan:
 args=[sys.executable,HELPER,job['kind'],job['prompt'],'--seconds',str(job['seconds']),'--out',str(ROOT/job['file']),'--max-credits','1000','--provenance',str(ROOT/'assets/audio/casino-provenance.json')]
 if job['kind']=='amb': args[2]='sfx'; args+=['--loop']
 if '--make' not in sys.argv: args+=['--dry-run']
 elif (ROOT/job['file']).exists(): print('EXISTS',job['file'],flush=True); continue
 print('JOB',job['name'],flush=True)
 subprocess.run(args,cwd=ROOT,check=True)
