"""Shrink the character GLBs without visible loss (Steve 2026-10-15: "shrink assets now as long as quality doesn't degrade").

Meshy exports the metallic-roughness map as a quality-100 JPEG (every quantisation step 1), about 1.8 MB of a 3.8 MB
file. Re-encoding it at quality 92, 4:4:4, changes no pixel by a visible amount. Each re-encoded image must stay above
MIN_PSNR dB against the original or it is left alone. The base colour and normal maps are already at quality ~75 and
are never touched (a second lossy pass would cost detail). Mesh data is copied byte for byte.

    python tools/glb_shrink.py assets/chars/*.glb          # rewrites in place, prints sizes and PSNR
    python tools/glb_shrink.py --dry assets/chars/bean.glb
"""
import io, json, math, struct, sys
from PIL import Image, ImageChops, ImageStat

MIN_PSNR = 45.0
QUALITY = 92


def psnr(a, b):
    diff = ImageChops.difference(a, b)
    mse = sum(v * v for v in ImageStat.Stat(diff).rms) / len(a.getbands())
    return 99.0 if mse == 0 else 20 * math.log10(255 / math.sqrt(mse))


def lossless_q(img):
    q = getattr(img, 'quantization', None)
    return bool(q) and max(max(t) for t in q.values()) <= 2  # quality ~98-100


def shrink(path, dry):
    raw = open(path, 'rb').read()
    magic, ver, total = struct.unpack('<III', raw[:12])
    assert magic == 0x46546C67 and ver == 2
    jlen, jtype = struct.unpack('<II', raw[12:20]); assert jtype == 0x4E4F534A
    gltf = json.loads(raw[20:20 + jlen])
    blen, btype = struct.unpack('<II', raw[20 + jlen:28 + jlen]); assert btype == 0x004E4942
    binc = raw[28 + jlen:28 + jlen + blen]
    assert len(gltf['buffers']) == 1
    views = gltf['bufferViews']
    data = [binc[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in views]
    notes = []
    for i, im in enumerate(gltf.get('images', [])):
        if im.get('mimeType') != 'image/jpeg' or 'bufferView' not in im: continue
        src = Image.open(io.BytesIO(data[im['bufferView']]))
        if not lossless_q(src): continue
        orig = src.convert(src.mode if src.mode in ('RGB', 'L') else 'RGB')
        buf = io.BytesIO(); orig.save(buf, 'JPEG', quality=QUALITY, subsampling=0, optimize=True)
        new = buf.getvalue(); p = psnr(orig, Image.open(io.BytesIO(new)).convert(orig.mode))
        if p < MIN_PSNR or len(new) >= len(data[im['bufferView']]):
            notes.append(f'image {i}: kept ({p:.1f} dB)'); continue
        notes.append(f'image {i}: {len(data[im["bufferView"]]) // 1024} -> {len(new) // 1024} KB, {p:.1f} dB')
        data[im['bufferView']] = new
    # repack the binary chunk, every view 4-byte aligned (accessor alignment)
    out = bytearray()
    for v, d in zip(views, data):
        out += b'\0' * (-len(out) % 4)
        v['byteOffset'] = len(out); v['byteLength'] = len(d); out += d
    out += b'\0' * (-len(out) % 4)
    gltf['buffers'][0]['byteLength'] = len(out)
    js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
    print(f'{path}: {len(raw) // 1024} -> {len(glb) // 1024} KB; ' + '; '.join(notes))
    if not dry and len(glb) < len(raw): open(path, 'wb').write(glb)


if __name__ == '__main__':
    args = sys.argv[1:]; dry = '--dry' in args
    for a in args:
        if a != '--dry': shrink(a, dry)
