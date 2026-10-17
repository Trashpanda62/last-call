// Procedural ambience is complete before readiness, with original sample bytes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const rows = [], errors = [];
  for (const rate of [44100, 48000]) for (const early of [false, true]) {
    const page = await browser.newPage({ ignoreHTTPSErrors: true }); page.on('pageerror', e => errors.push(e.message));
    await page.route('**/audio-buffer-check.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Audio buffer regression</title>' }));
    await page.route('**/src/audio.js', async route => {
      const response = await route.fetch(); let source = await response.text();
      assert.ok(source.includes('humFill.next()'));
      source = source.replace('humFill.next()', 'window.__humNext(humFill)');
      const yieldTask = 'await new Promise(ok => setTimeout(ok, 0));'; assert.ok(source.includes(yieldTask));
      source = source.replace(yieldTask, 'window.__humStats.batches.push(window.__humStats.cpu); window.__humStats.cpu = 0; ' + yieldTask);
      source += `\nwindow.__humStats = { steps: 0, batches: [], cpu: 0 };
window.__humNext = iterator => { const began = performance.now(), result = iterator.next(); __humStats.steps++; __humStats.cpu += performance.now() - began; return result; };`;
      await route.fulfill({ response, body: source });
    });
    await page.goto('https://10.42.0.37:3161/audio-buffer-check.html');
    rows.push(await page.evaluate(async ({ rate, early }) => {
      const Native = window.AudioContext;
      window.AudioContext = class extends Native { constructor(options) { super({ ...options, sampleRate: rate }); } };
      const original = Native.prototype.createBuffer, random = Math.random, buffers = [];
      Native.prototype.createBuffer = function(...a) { const b = original.apply(this, a); buffers.push(b); return b; };
      let seed = 42; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      try {
        const A = await import('/src/audio.js'), began = performance.now(), pending = A.preloadAudio();
        if (early) A.hum(.25);
        await pending; const preloadMs = performance.now() - began; A.setMood('over');
        const prepared = buffers.length, at = performance.now(); A.hum(.25); const firstUseMs = performance.now() - at;
        const next = performance.now(); A.hum(.25); const repeatUseMs = performance.now() - next; A.hum(0);
        const b = buffers.find(b => b.numberOfChannels === 1 && b.length === Math.round(rate * 4));
        if (!b) throw new Error('No four-second prepared ambience buffer');
        // Independent original synchronous generator, retaining its operation
        // order and a separate random sequence across both sample rates.
        const expected = new Float32Array(Math.round(rate * 4)), P = Math.PI * 2; let lp = 0, refSeed = 42;
        const rand = () => ((refSeed = (refSeed * 1664525 + 1013904223) >>> 0) / 4294967296);
        for (let i = 0; i < expected.length; i++) {
          const t = i / rate, beat = 1 + .18 * Math.sin(P * .5 * t) + .08 * Math.sin(P * 1.25 * t);
          const saw = ((t * 120) % 1) * 2 - 1; lp += (saw - lp) * .08;
          expected[i] = beat * (.34 * Math.sin(P * 120 * t) + .22 * Math.sin(P * 240 * t + .4) + .12 * Math.sin(P * 360 * t + 1.1) + .07 * Math.sin(P * 480 * t) + .16 * lp)
            + .025 * Math.sin(P * 7680 * t) * (1 + Math.sin(P * .75 * t)) + (rand() * 2 - 1) * .012;
        }
        const actual = b.getChannelData(0); let maxError = 0;
        for (let i = 0; i < actual.length; i++) maxError = Math.max(maxError, Math.abs(actual[i] - expected[i]));
        const hash = async data => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(v => v.toString(16).padStart(2, '0')).join('');
        return { rate: b.sampleRate, early, samples: actual.length, prepared, afterUse: buffers.length, maxError, actualHash: await hash(actual), expectedHash: await hash(expected), preloadMs, firstUseMs, repeatUseMs, chunks: __humStats.steps, batchesMs: [...__humStats.batches, __humStats.cpu] };
      } finally { Native.prototype.createBuffer = original; Math.random = random; window.AudioContext = Native; }
    }, { rate, early }));
    await page.close();
  }
  const out = process.argv.find(a => a.endsWith('.json')) || 'shots/audio-buffer.json';
  fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true }); fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), rows, errors }, null, 2));
  assert.deepEqual(errors, []);
  for (const r of rows) {
    assert.equal(r.prepared, 1, 'one buffer prepared, including overlapping early use'); assert.equal(r.afterUse, 1, 'no first/repeat-use allocation');
    assert.equal(r.maxError, 0); assert.equal(r.actualHash, r.expectedHash, 'original procedural waveform bytes'); assert.equal(r.samples, r.rate * 4);
    if (!r.early) assert.ok(r.chunks > 80, 'preparation fills bounded sample chunks');
  }
  console.log('PASS: complete procedural ambience before readiness; 44.1/48 kHz original waveform bytes, no first/repeat allocations, and early fallback shares the in-progress buffer.', JSON.stringify(rows.map(({ actualHash, expectedHash, ...r }) => r)));
} finally { await browser.close(); }
