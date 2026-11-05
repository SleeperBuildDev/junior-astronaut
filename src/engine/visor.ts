import * as THREE from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';

// What you see through the helmet, in one full-screen pass (Medium and High):
//  - the visor: a faint dark rim with a little refraction at its edge, and a soft reflection band
//  - sun glare: a halo and a streak around the Sun, a veil over the view, lens-flare ghosts
//    and lit-up specks of dust on the visor (only when the Sun isn't hidden behind something:
//    the depth buffer at the Sun's spot says)
//  - visor fog: breath condensing on the inside when the suit's oxygen runs low
//  - camera motion blur while driving (each pixel reprojected with last frame's camera)
//  - radiation "light flashes" during a solar storm: real astronauts see them when a fast
//    particle passes through the eye

const frag = /* glsl */ `
uniform float uVisor;
uniform vec3 uSun;      // sun position (uv) and how much we face it
uniform float uSunAmt;
uniform float uFog;
uniform float uBreath;
uniform float uBlur;
uniform float uSpark;
uniform float uDay;
uniform mat4 uPrevViewProj;
uniform mat4 uInvViewProj;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float viewDist(float d) { return (cameraNear * cameraFar) / (cameraFar - (cameraFar - cameraNear) * d); }

vec3 ghost(vec2 uv, vec2 c, float r, vec3 col) {
  vec2 d = uv - c;
  d.x *= aspect;
  float l = length(d);
  return col * (smoothstep(r, r * 0.55, l) * 0.7 + smoothstep(r * 0.08, 0.0, abs(l - r * 0.92)) * 0.5);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  // Visor shape: a wide rounded rectangle; 0 in the middle, 1 at the very corners.
  vec2 q = (uv - 0.5) * vec2(2.0 / 1.04, 2.0 / 1.1);
  float r = pow(pow(abs(q.x), 4.0) + pow(abs(q.y), 3.0), 0.29);
  float edge = smoothstep(0.86, 1.12, r) * uVisor;
  vec2 suv = uv - (uv - 0.5) * edge * 0.03;
  vec3 col = edge > 0.001 ? texture2D(inputBuffer, suv).rgb : inputColor.rgb;

  // Motion blur (driving): where was this point on screen a frame ago?
  if (uBlur > 0.001) {
    vec4 w = uInvViewProj * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    w /= w.w;
    vec4 p = uPrevViewProj * w;
    vec2 vel = (uv - (p.xy / p.w * 0.5 + 0.5)) * uBlur;
    vel *= smoothstep(2.6, 5.5, viewDist(depth)); // not the rover you sit in
    float l = length(vel);
    if (l > 0.025) vel *= 0.025 / l;
    if (l > 0.0005) {
      vec3 acc = col;
      for (int i = 0; i < 6; i++) acc += texture2D(inputBuffer, suv + vel * (float(i) / 5.0 - 0.5)).rgb;
      col = acc / 7.0;
    }
  }

  // Fog: breath condensing from the bottom and the edges, mottled, blurring what is behind it.
  if (uFog > 0.001) {
    vec2 a = uv * vec2(aspect, 1.0);
    float n = vnoise(a * 6.0) * 0.6 + vnoise(a * 21.0) * 0.4;
    float mask = (1.0 - uv.y) * 0.95 + r * 0.55 - 0.45 + (1.0 - uFog) * -0.6;
    float f = smoothstep(0.05, 0.8, mask + n * 0.45) * uFog * (0.72 + 0.16 * uBreath);
    vec3 b = vec3(0.0);
    float rot = hash(floor(uv * resolution)) * 6.2832; // a random turn per pixel: soft, not ringed
    for (int i = 0; i < 8; i++) {
      float ang = float(i) * 0.785398 + rot;
      float rad = (i % 2 == 0) ? 0.006 : 0.016;
      b += texture2D(inputBuffer, suv + vec2(cos(ang) / aspect, sin(ang)) * rad).rgb;
    }
    b /= 8.0;
    vec3 fogCol = mix(b, vec3(lum(b)) + vec3(0.16, 0.18, 0.2) * (0.3 + uDay), 0.55);
    col = mix(col, fogCol, f);
  }

  // Sun glare and lens flare.
  if (uSunAmt > 0.001) {
    vec2 s = uSun.xy;
    // Hidden behind the ground or a building? Look at the depth around the Sun's spot.
    vec2 cs = clamp(s, vec2(0.002), vec2(0.998));
    float vis = 0.0;
    vis += step(0.99999, readDepth(cs));
    vis += step(0.99999, readDepth(cs + vec2(0.004, 0.0)));
    vis += step(0.99999, readDepth(cs - vec2(0.004, 0.0)));
    vis += step(0.99999, readDepth(cs + vec2(0.0, 0.006)));
    vis += step(0.99999, readDepth(cs - vec2(0.0, 0.006)));
    vis *= 0.2;
    vec2 d = uv - s;
    d.x *= aspect;
    float dist = length(d);
    vec3 sunCol = vec3(1.0, 0.95, 0.86);
    vec3 glare = sunCol * (exp(-dist * 9.0) * 0.7 + exp(-dist * 2.8) * 0.06 + uSun.z * 0.02);
    glare += sunCol * exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 2.2) * 0.45; // streak
    vec2 axis = vec2(0.5) - s;
    glare += ghost(uv, s + axis * 0.55, 0.035, vec3(0.25, 0.55, 1.0)) * 0.09;
    glare += ghost(uv, s + axis * 0.95, 0.07, vec3(1.0, 0.65, 0.25)) * 0.06;
    glare += ghost(uv, s + axis * 1.3, 0.025, vec3(0.6, 1.0, 0.5)) * 0.1;
    glare += ghost(uv, s + axis * 1.65, 0.12, vec3(0.75, 0.4, 1.0)) * 0.04;
    glare += ghost(uv, s + axis * 2.1, 0.05, vec3(0.3, 0.9, 1.0)) * 0.07;
    // A few fine scratches on the visor catch the light near the Sun.
    vec2 sc = uv * vec2(aspect, 1.0) * 38.0;
    vec2 cell = floor(sc);
    vec2 jit = vec2(hash(cell), hash(cell + 3.7));
    float dot1 = smoothstep(0.09, 0.0, length(fract(sc) - jit)) * step(0.82, hash(cell + 9.1));
    glare += sunCol * dot1 * exp(-dist * 4.0) * 0.5 * uVisor;
    col += glare * vis * uSunAmt;
  }

  // The visor rim: darker, a hint of gold, and a faint curved reflection on the inside.
  col *= 1.0 - edge * 0.6;
  col += vec3(0.9, 0.7, 0.4) * edge * edge * 0.015;
  float band = exp(-pow((length((uv - vec2(0.2, 1.35)) * vec2(aspect, 1.0)) - 1.05) * 26.0, 2.0));
  col += vec3(0.55, 0.65, 0.8) * band * 0.018 * uVisor * (0.35 + 0.65 * uDay);

  // Radiation flashes.
  if (uSpark > 0.001) {
    vec2 cell = floor(uv * vec2(aspect, 1.0) * 150.0);
    float h = hash(cell + floor(time * 20.0) * 7.13);
    col += vec3(1.8) * step(1.0 - 0.0016 * uSpark, h);
  }

  outputColor = vec4(col, inputColor.a);
}
`;

export class VisorEffect extends Effect {
  private prev = new THREE.Matrix4();
  private cur = new THREE.Matrix4();
  private first = true;

  constructor() {
    super('VisorEffect', frag, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['uVisor', new THREE.Uniform(0)],
        ['uSun', new THREE.Uniform(new THREE.Vector3())],
        ['uSunAmt', new THREE.Uniform(0)],
        ['uFog', new THREE.Uniform(0)],
        ['uBreath', new THREE.Uniform(0)],
        ['uBlur', new THREE.Uniform(0)],
        ['uSpark', new THREE.Uniform(0)],
        ['uDay', new THREE.Uniform(1)],
        ['uPrevViewProj', new THREE.Uniform(new THREE.Matrix4())],
        ['uInvViewProj', new THREE.Uniform(new THREE.Matrix4())],
      ]),
    });
  }

  set(name: 'uVisor' | 'uSunAmt' | 'uFog' | 'uBreath' | 'uBlur' | 'uSpark' | 'uDay', v: number) {
    this.uniforms.get(name)!.value = v;
  }

  setSun(x: number, y: number, facing: number) {
    (this.uniforms.get('uSun')!.value as THREE.Vector3).set(x, y, facing);
  }

  /** Call once per frame before rendering: this frame's and last frame's camera, for the blur. */
  track(cam: THREE.Camera) {
    cam.updateMatrixWorld();
    this.cur.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    if (this.first) this.prev.copy(this.cur);
    this.first = false;
    (this.uniforms.get('uPrevViewProj')!.value as THREE.Matrix4).copy(this.prev);
    (this.uniforms.get('uInvViewProj')!.value as THREE.Matrix4).copy(this.cur).invert();
    this.prev.copy(this.cur);
  }
}
