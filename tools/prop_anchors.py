"""Find where a fitted prop's flat dark panels are (slot screens, the jackpot tower's screens, the Plinko board) from the
straight front and side check renders that tools/prop_fit.py writes (.dev/fit/<name>-front.png and -side.png, 512 px,
orthographic, transparent background). Prints each candidate in the model's own metres: centre x and height, width,
height, and the depth of the front surface there (+z toward the viewer), and writes an overlay to .dev/fit/<name>-anchors.png.

    python tools/prop_anchors.py slot [lum_max]
"""
import json, struct, sys
from collections import deque
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent


def size_of(name):
    b = (ROOT / 'assets' / 'props' / f'{name}.glb').read_bytes()
    n = struct.unpack_from('<I', b, 12)[0]
    gj = json.loads(b[20:20 + n])
    for node in gj.get('nodes', []):
        ex = node.get('extras', {})
        if 'prop' in ex:
            return json.loads(ex['prop'])['size']
    raise SystemExit('no prop extras in ' + name)


def main():
    name = sys.argv[1]
    lum_max = float(sys.argv[2]) if len(sys.argv) > 2 else 45
    w, h, d = size_of(name)
    S = max(w, h, d) * 1.25                       # prop_fit's ortho scale; the camera looks at (0, h/2)
    front = Image.open(ROOT / '.dev' / 'fit' / f'{name}-front.png').convert('RGBA')
    side = Image.open(ROOT / '.dev' / 'fit' / f'{name}-side.png').convert('RGBA')
    N = front.size[0]
    px = front.load()
    to_x = lambda i: (i / N - 0.5) * S
    to_y = lambda j: h / 2 + (0.5 - j / N) * S
    dark = [[False] * N for _ in range(N)]
    for j in range(N):
        for i in range(N):
            r, g, b, a = px[i, j]
            dark[j][i] = a > 128 and (0.3 * r + 0.59 * g + 0.11 * b) < lum_max
    seen = [[False] * N for _ in range(N)]
    comps = []
    for j in range(N):
        for i in range(N):
            if not dark[j][i] or seen[j][i]:
                continue
            q = deque([(i, j)]); seen[j][i] = True; pts = 0; x0 = x1 = i; y0 = y1 = j
            while q:
                a, b = q.popleft(); pts += 1
                x0, x1, y0, y1 = min(x0, a), max(x1, a), min(y0, b), max(y1, b)
                for na, nb in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                    if 0 <= na < N and 0 <= nb < N and dark[nb][na] and not seen[nb][na]:
                        seen[nb][na] = True; q.append((na, nb))
            if pts > N * N * 0.004:
                comps.append((pts, x0, y0, x1, y1))
    comps.sort(reverse=True)
    # depth: in the side view the front (+z) is on the left; the first model pixel from the left on that row
    sp = side.load()
    def front_z(j):
        for i in range(N):
            if sp[i, j][3] > 128:
                return -(i / N - 0.5) * S
        return None
    ov = front.copy(); dr = ImageDraw.Draw(ov)
    out = []
    for k, (pts, x0, y0, x1, y1) in enumerate(comps[:6]):
        fill = pts / ((x1 - x0 + 1) * (y1 - y0 + 1))
        cx, cy = to_x((x0 + x1) / 2), to_y((y0 + y1) / 2)
        row = {'k': k, 'x': round(cx, 3), 'y': round(cy, 3), 'w': round((x1 - x0) / N * S, 3), 'h': round((y1 - y0) / N * S, 3),
               'z': round(front_z((y0 + y1) // 2) or 0, 3), 'fill': round(fill, 2)}
        out.append(row); print(row)
        dr.rectangle([x0, y0, x1, y1], outline=(255, 0, 0, 255), width=2); dr.text((x0 + 3, y0 + 3), str(k), fill=(255, 255, 0, 255))
    bg = Image.new('RGBA', ov.size, (90, 90, 90, 255)); bg.alpha_composite(ov)
    bg.convert('RGB').save(ROOT / '.dev' / 'fit' / f'{name}-anchors.png')
    print('size', [w, h, d])


if __name__ == '__main__':
    main()
