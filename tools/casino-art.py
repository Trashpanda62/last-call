from pathlib import Path
import csv,json,subprocess,concurrent.futures,shutil,urllib.request
ROOT=Path(__file__).resolve().parents[1]
STYLE='Crisp stylized three-dimensional casino art with solid sculpted forms and clean silhouettes. Burgundy velvet and dark walnut environments contrast with warm russet potato characters, cream gloves and polished brass details; cyan and amber identify game actions. Precise painted surfaces, subtle material grain, sharp edges and warm cinematic light create an eerie but humorous late-night mood. No plush, felt toys, fur, fuzzy fibers or blurred detail. Consistent three-quarter perspective and readable proportions.'
JOBS=[
 ('portrait-gambler','image','A sharp Art Deco oil painting of a russet potato casino gambler wearing a tailored burgundy dinner jacket, cream gloves and a dark green visor, holding aces beside a roulette wheel; dark walnut background, ominous warm light. Portrait canvas fills entire image edge to edge, no physical frame, no text.'),
 ('portrait-queen','image','A sharp Art Deco oil painting of an aristocratic russet potato queen wearing a gold crown and black velvet evening gown, a sly smile, holding a champagne coupe; geometric burgundy and gold sunburst background. Portrait canvas fills image edge to edge, no physical frame, no text.'),
 ('portrait-bartender','image','A sharp Art Deco oil painting of a russet potato bartender in a cream dinner jacket with a black bow tie, polishing a cocktail glass under a crescent moon in a deserted luxury casino. Clean expressive potato face with glossy dark eyes. Canvas fills image edge to edge, no physical frame, no text.'),
 ('snackDonut','3d','A single appetizing glazed ring doughnut with dark chocolate frosting, scattered small rainbow sprinkles, golden baked dough and a clean open center hole. Solid realistic food geometry, glossy icing, no face, no plate, no background objects.'),
 ('snackPretzel','3d','A single golden brown baked soft pretzel, traditional twisted three-hole knot silhouette, glossy browned crust, coarse white salt crystals. Solid appetizing food geometry, no face, no plate, no other objects.'),
 ('snackHotdog','3d','A single hot dog: a grilled reddish brown sausage nestled inside a split golden toasted bun, one bright yellow zigzag mustard stripe. Solid appetizing food geometry, no face, no plate, no background objects.')]
(ROOT/'design').mkdir(exist_ok=True)
with (ROOT/'design/assets.csv').open('w',newline='',encoding='utf-8') as f:
 w=csv.writer(f);w.writerow(['id','role','type','description','size/ratio','style line ref','source'])
 for name,kind,prompt in JOBS:w.writerow([name,'wall painting' if kind=='image' else 'snack display and eating prop',kind,prompt,'2:3 / 1k' if kind=='image' else '3000 triangles / 0.24m',STYLE,'generate'])
run=ROOT/'runs/higgsfield/casino-refresh';run.mkdir(parents=True,exist_ok=True)
cli=shutil.which('higgsfield.cmd') or shutil.which('higgsfield')
def make(job):
 name,kind,prompt=job;out=run/(name+'.json')
 if out.exists(): print('EXISTS',name,flush=True);return
 args=[cli,'generate','create','nano_banana_flash' if kind=='image' else 'tripo_3d','--prompt',prompt+' '+STYLE]
 args+=['--resolution','1k','--aspect_ratio','2:3'] if kind=='image' else ['--face_limit','3000','--texture','true','--pbr','true','--geometry_quality','detailed']
 args+=['--wait','--wait-timeout','15m','--json']
 print('SUBMIT',name,flush=True);r=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace')
 if r.returncode: print('FAILED',name,r.stderr,r.stdout,flush=True);return
 out.write_text(r.stdout,encoding='utf-8');print('DONE',name,r.stdout[:300],flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(make,JOBS))
