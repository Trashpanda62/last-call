/*
 * AMD FidelityFX Super Resolution 1.0 (FSR 1). The shaders below are a GLSL ES 3.00 port of the non-packed 32-bit
 * paths of ffx_fsr1.h (EASU, RCAS) and the approximations they use from ffx_a.h, which carry this notice:
 *
 * Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

// FSRPass: the last pass of an EffectComposer that renders at the render-scale size. EASU upscales readBuffer
// (the OutputPass result: tone mapped, sRGB encoded, 0..1) into an output-size RGBA8 target, then RCAS sharpens
// that onto the screen. The constants are set up here in JS, as AMD does on the CPU.
//   const fsr = new FSRPass({ sharpness: 0.2 }); composer.addPass(outputPass); composer.addPass(fsr);
//   on resize: composer.setSize(internal size); fsr.setOutputSize(drawing-buffer width, height in device pixels)

import { GLSL3, LinearFilter, NoBlending, RGBAFormat, RawShaderMaterial, UnsignedByteType, Vector2, Vector4, WebGLRenderTarget } from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// The full-screen triangle's positions are already clip space.
const VERT = /* glsl */`
precision highp float;
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const EASU = /* glsl */`
// FSR 1 EASU (FsrEasuF). Copyright (c) 2021 Advanced Micro Devices, Inc. MIT license, full notice at the top of fsr.js.
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D tDiffuse;
uniform vec4 con0; // FsrEasuCon con0: output pixel to input texel position, xy scale, zw offset
layout(location = 0) out highp vec4 fragColor;

// ffx_a.h low precision approximations, kept bit for bit (a zero argument gives a huge finite value, never inf)
float APrxLoRcpF1(float a) { return uintBitsToFloat(0x7ef07ebbu - floatBitsToUint(a)); }
float APrxLoRsqF1(float a) { return uintBitsToFloat(0x5f347d74u - (floatBitsToUint(a) >> 1u)); }

// Simplest multi-channel approximate luma possible (luma times 2, in 2 FMA/MAD).
float lumaX2(vec3 c) { return c.b * 0.5 + (c.r * 0.5 + c.g); }

// Filtering for a given tap for the scalar.
void FsrEasuTapF(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len, float lob, float clp, vec3 c) {
  // Rotate offset by direction.
  vec2 v = vec2(off.x * dir.x + off.y * dir.y, off.x * (-dir.y) + off.y * dir.x);
  // Anisotropy.
  v *= len;
  // Distance^2, limited to the window as at corner, 2 taps can easily be outside.
  float d2 = min(v.x * v.x + v.y * v.y, clp);
  // Approximation of lanczos2 without sin() or rcp(), or sqrt() to get x.
  //  (25/16 * (2/5 * x^2 - 1)^2 - (25/16 - 1)) * (lob * x^2 - 1)^2
  //  |_______________________________________|   |_______________|
  //                   base                             window
  float wB = 2.0 / 5.0 * d2 - 1.0;
  float wA = lob * d2 - 1.0;
  wB *= wB;
  wA *= wA;
  wB = 25.0 / 16.0 * wB - (25.0 / 16.0 - 1.0);
  float w = wB * wA;
  aC += c * w;
  aW += w;
}

// Accumulate direction and length from the '+' around c (a above, b left, d right, e below), w = bilinear weight.
// Length converts gradient reversal to 0, smoothly to non-reversal at 1, shaped, then adds horz and vert terms.
void FsrEasuSetF(inout vec2 dir, inout float len, float w, float lA, float lB, float lC, float lD, float lE) {
  float dc = lD - lC;
  float cb = lC - lB;
  float lenX = APrxLoRcpF1(max(abs(dc), abs(cb)));
  float dirX = lD - lB;
  dir.x += dirX * w;
  lenX = clamp(abs(dirX) * lenX, 0.0, 1.0);
  lenX *= lenX;
  len += lenX * w;
  float ec = lE - lC;
  float ca = lC - lA;
  float lenY = APrxLoRcpF1(max(abs(ec), abs(ca)));
  float dirY = lE - lA;
  dir.y += dirY * w;
  lenY = clamp(abs(dirY) * lenY, 0.0, 1.0);
  lenY *= lenY;
  len += lenY * w;
}

// texelFetch replaces AMD's gather4; clamping the texel index is the clamp-to-edge sampler.
vec4 tap(ivec2 p, ivec2 hi) { return texelFetch(tDiffuse, clamp(p, ivec2(0), hi), 0); }

void main() {
  // Position of 'f'.
  vec2 pp = floor(gl_FragCoord.xy) * con0.xy + con0.zw;
  vec2 fp = floor(pp);
  pp -= fp;
  ivec2 q = ivec2(fp);
  ivec2 hi = textureSize(tDiffuse, 0) - 1;
  // 12-tap kernel.
  //    b c
  //  e f g h
  //  i j k l
  //    n o
  // GL rows count bottom up, so this is AMD's layout mirrored vertically; every step below is symmetric under that flip.
  vec4 b = tap(q + ivec2(0, -1), hi), c = tap(q + ivec2(1, -1), hi);
  vec4 e = tap(q + ivec2(-1, 0), hi), f = tap(q, hi), g = tap(q + ivec2(1, 0), hi), h = tap(q + ivec2(2, 0), hi);
  vec4 i = tap(q + ivec2(-1, 1), hi), j = tap(q + ivec2(0, 1), hi), k = tap(q + ivec2(1, 1), hi), l = tap(q + ivec2(2, 1), hi);
  vec4 n = tap(q + ivec2(0, 2), hi), o = tap(q + ivec2(1, 2), hi);
  float bL = lumaX2(b.rgb), cL = lumaX2(c.rgb), eL = lumaX2(e.rgb), fL = lumaX2(f.rgb), gL = lumaX2(g.rgb), hL = lumaX2(h.rgb);
  float iL = lumaX2(i.rgb), jL = lumaX2(j.rgb), kL = lumaX2(k.rgb), lL = lumaX2(l.rgb), nL = lumaX2(n.rgb), oL = lumaX2(o.rgb);
  // Accumulate for bilinear interpolation.
  vec2 dir = vec2(0.0);
  float len = 0.0;
  FsrEasuSetF(dir, len, (1.0 - pp.x) * (1.0 - pp.y), bL, eL, fL, gL, jL);
  FsrEasuSetF(dir, len, pp.x * (1.0 - pp.y), cL, fL, gL, hL, kL);
  FsrEasuSetF(dir, len, (1.0 - pp.x) * pp.y, fL, iL, jL, kL, nL);
  FsrEasuSetF(dir, len, pp.x * pp.y, gL, jL, kL, lL, oL);
  // Normalize with approximation, and cleanup close to zero.
  vec2 dir2 = dir * dir;
  float dirR = dir2.x + dir2.y;
  bool zro = dirR < 1.0 / 32768.0;
  dirR = APrxLoRsqF1(dirR);
  dirR = zro ? 1.0 : dirR;
  dir.x = zro ? 1.0 : dir.x;
  dir *= dirR;
  // Transform from {0 to 2} to {0 to 1} range, and shape with square.
  len = len * 0.5;
  len *= len;
  // Stretch kernel {1.0 vert|horz, to sqrt(2.0) on diagonal}.
  float stretch = (dir.x * dir.x + dir.y * dir.y) * APrxLoRcpF1(max(abs(dir.x), abs(dir.y)));
  // Anisotropic length after rotation,
  //  x := 1.0 lerp to 'stretch' on edges
  //  y := 1.0 lerp to 2x on edges
  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  // Based on the amount of 'edge', the window shifts from +/-{sqrt(2.0) to slightly beyond 2.0}.
  float lob = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * len;
  // Set distance^2 clipping point to the end of the adjustable window.
  float clp = APrxLoRcpF1(lob);
  // Accumulation mixed with min/max of 4 nearest.
  vec3 min4 = min(min(f.rgb, g.rgb), min(j.rgb, k.rgb));
  vec3 max4 = max(max(f.rgb, g.rgb), max(j.rgb, k.rgb));
  vec3 aC = vec3(0.0);
  float aW = 0.0;
  FsrEasuTapF(aC, aW, vec2( 0.0, -1.0) - pp, dir, len2, lob, clp, b.rgb);
  FsrEasuTapF(aC, aW, vec2( 1.0, -1.0) - pp, dir, len2, lob, clp, c.rgb);
  FsrEasuTapF(aC, aW, vec2(-1.0,  1.0) - pp, dir, len2, lob, clp, i.rgb);
  FsrEasuTapF(aC, aW, vec2( 0.0,  1.0) - pp, dir, len2, lob, clp, j.rgb);
  FsrEasuTapF(aC, aW, vec2( 0.0,  0.0) - pp, dir, len2, lob, clp, f.rgb);
  FsrEasuTapF(aC, aW, vec2(-1.0,  0.0) - pp, dir, len2, lob, clp, e.rgb);
  FsrEasuTapF(aC, aW, vec2( 1.0,  1.0) - pp, dir, len2, lob, clp, k.rgb);
  FsrEasuTapF(aC, aW, vec2( 2.0,  1.0) - pp, dir, len2, lob, clp, l.rgb);
  FsrEasuTapF(aC, aW, vec2( 2.0,  0.0) - pp, dir, len2, lob, clp, h.rgb);
  FsrEasuTapF(aC, aW, vec2( 1.0,  0.0) - pp, dir, len2, lob, clp, g.rgb);
  FsrEasuTapF(aC, aW, vec2( 1.0,  2.0) - pp, dir, len2, lob, clp, o.rgb);
  FsrEasuTapF(aC, aW, vec2( 0.0,  2.0) - pp, dir, len2, lob, clp, n.rgb);
  // Normalize and dering. Alpha is not part of EASU: plain bilinear, RCAS passes it through.
  vec3 pix = min(max4, max(min4, aC * (1.0 / aW)));
  fragColor = vec4(pix, mix(mix(f.a, g.a, pp.x), mix(j.a, k.a, pp.x), pp.y));
}`;

const RCAS = /* glsl */`
// FSR 1 RCAS (FsrRcasF). Copyright (c) 2021 Advanced Micro Devices, Inc. MIT license, full notice at the top of fsr.js.
precision highp float;
precision highp int;
precision highp sampler2D;

// This is set at the limit of providing unnatural results for sharpening.
#define FSR_RCAS_LIMIT (0.25 - (1.0 / 16.0))

uniform sampler2D tDiffuse; // the EASU result, output size
uniform float con; // FsrRcasCon con.x: exp2(-sharpness in stops)
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;

float APrxMedRcpF1(float a) { float b = uintBitsToFloat(0x7ef19fffu - floatBitsToUint(a)); return b * (-b * a + 2.0); }

void main() {
  ivec2 hi = textureSize(tDiffuse, 0) - 1;
  // From vUv rather than gl_FragCoord, so a viewport offset or a writeBuffer of another size still lines up.
  ivec2 sp = clamp(ivec2(vUv * vec2(hi + 1)), ivec2(0), hi);
  // Algorithm uses minimal 3x3 pixel neighborhood.
  //    b
  //  d e f
  //    h
  vec3 b = texelFetch(tDiffuse, clamp(sp + ivec2(0, -1), ivec2(0), hi), 0).rgb;
  vec3 d = texelFetch(tDiffuse, clamp(sp + ivec2(-1, 0), ivec2(0), hi), 0).rgb;
  vec4 ee = texelFetch(tDiffuse, sp, 0);
  vec3 e = ee.rgb;
  vec3 f = texelFetch(tDiffuse, clamp(sp + ivec2(1, 0), ivec2(0), hi), 0).rgb;
  vec3 h = texelFetch(tDiffuse, clamp(sp + ivec2(0, 1), ivec2(0), hi), 0).rgb;
  // Min and max of ring.
  vec3 mn4 = min(min(b, d), min(f, h));
  vec3 mx4 = max(max(b, d), max(f, h));
  // Immediate constants for peak range.
  vec2 peakC = vec2(1.0, -1.0 * 4.0);
  // Limiters, these need to be high precision RCPs.
  vec3 hitMin = min(mn4, e) / (4.0 * mx4);
  vec3 hitMax = (peakC.x - max(mx4, e)) / (4.0 * mn4 + peakC.y);
  // An all-black (or all-white) ring gives 0/0 above. AMD's HLSL leans on max() dropping that NaN; GLSL makes no such
  // promise, so the limit that does not apply is selected away instead (1 and -1 sit outside the -0.25..0 lobe range).
  hitMin = mix(vec3(1.0), hitMin, greaterThan(mx4, vec3(0.0)));
  hitMax = mix(vec3(-1.0), hitMax, lessThan(mn4, vec3(1.0)));
  vec3 lobeRGB = max(-hitMin, hitMax);
  float lobe = max(-FSR_RCAS_LIMIT, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * con;
#ifdef FSR_RCAS_DENOISE
  // Noise detection: a highpass normalized against the local contrast, then shaped.
  float bL = b.b * 0.5 + (b.r * 0.5 + b.g);
  float dL = d.b * 0.5 + (d.r * 0.5 + d.g);
  float eL = e.b * 0.5 + (e.r * 0.5 + e.g);
  float fL = f.b * 0.5 + (f.r * 0.5 + f.g);
  float hL = h.b * 0.5 + (h.r * 0.5 + h.g);
  float nz = 0.25 * bL + 0.25 * dL + 0.25 * fL + 0.25 * hL - eL;
  nz = clamp(abs(nz) * APrxMedRcpF1(max(max(max(bL, dL), eL), max(fL, hL)) - min(min(min(bL, dL), eL), min(fL, hL))), 0.0, 1.0);
  nz = -0.5 * nz + 1.0;
  lobe *= nz;
#endif
  // Resolve, which needs the medium precision rcp approximation to avoid visible tonality changes.
  float rcpL = APrxMedRcpF1(4.0 * lobe + 1.0);
  fragColor = vec4((lobe * b + lobe * d + lobe * h + lobe * f + e) * rcpL, ee.a);
}`;

const _size = new Vector2();

export class FSRPass extends Pass {

  // sharpness: RCAS stops, 0 = sharpest, 2 = softest (AMD's convention). denoise: RCAS noise removal (FSR_RCAS_DENOISE).
  constructor({ sharpness = 0.2, denoise = false } = {}) {
    super();
    this.needsSwap = false; // the result goes to the screen (or writeBuffer); readBuffer stays the composer's current image
    this.inputSize = new Vector2(1, 1); // the composer's internal size, from setSize()
    this.outputSize = new Vector2(0, 0); // the drawing-buffer size, from setOutputSize()
    this._easuTarget = new WebGLRenderTarget(1, 1, {
      type: UnsignedByteType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter,
      generateMipmaps: false, depthBuffer: false, stencilBuffer: false,
    });
    this._easuTarget.texture.name = 'FSRPass.easu';
    const common = { glslVersion: GLSL3, vertexShader: VERT, depthTest: false, depthWrite: false, blending: NoBlending };
    this._easu = new RawShaderMaterial({
      ...common, name: 'FSR_EASU', fragmentShader: EASU,
      uniforms: { tDiffuse: { value: null }, con0: { value: new Vector4() } },
    });
    this._rcas = new RawShaderMaterial({
      ...common, name: 'FSR_RCAS', fragmentShader: RCAS, defines: denoise ? { FSR_RCAS_DENOISE: '' } : {},
      uniforms: { tDiffuse: { value: this._easuTarget.texture }, con: { value: 1 } },
    });
    this._quad = new FullScreenQuad(null);
    this.sharpness = sharpness;
  }

  get sharpness() { return this._sharpness; }

  set sharpness(stops) {
    this._sharpness = Math.max(0, Number(stops) || 0);
    this._rcas.uniforms.con.value = Math.pow(2, -this._sharpness); // FsrRcasCon
  }

  setSize(width, height) {
    this.inputSize.set(width, height);
  }

  setOutputSize(width, height) {
    this.outputSize.set(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
    this._easuTarget.setSize(this.outputSize.x, this.outputSize.y);
  }

  render(renderer, writeBuffer, readBuffer) {
    if (this.outputSize.x === 0) { // setOutputSize() not called yet
      renderer.getDrawingBufferSize(_size);
      this.setOutputSize(_size.x, _size.y);
    }
    // FsrEasuCon con0 with the input viewport = the whole readBuffer (WebGL truncates fractional target sizes).
    // con1..con3 only place AMD's gathers in normalized coordinates; texelFetch takes texel indices instead.
    const inW = Math.floor(readBuffer.width), inH = Math.floor(readBuffer.height);
    const outW = this.outputSize.x, outH = this.outputSize.y;
    this._easu.uniforms.con0.value.set(inW / outW, inH / outH, 0.5 * inW / outW - 0.5, 0.5 * inH / outH - 0.5);
    this._easu.uniforms.tDiffuse.value = readBuffer.texture;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false; // both draws cover every pixel
    renderer.setRenderTarget(this._easuTarget);
    this._quad.material = this._easu;
    this._quad.render(renderer);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this._quad.material = this._rcas;
    this._quad.render(renderer);
    renderer.autoClear = autoClear;
  }

  dispose() {
    this._easuTarget.dispose();
    this._easu.dispose();
    this._rcas.dispose();
    this._quad.dispose();
  }

}
