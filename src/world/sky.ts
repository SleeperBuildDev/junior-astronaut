import * as THREE from 'three';
import { mulberry32 } from './heightfield';

// Sun about 7 degrees above the horizon: at the lunar south pole the Sun always skims
// the horizon, which is what gives the long, dramatic shadows.
export const SUN_DIR = new THREE.Vector3(1, 0.125, 0.32).normalize();
// Earth hangs low over the horizon. Seen from the Moon it is about 2 degrees wide.
export const EARTH_DIR = new THREE.Vector3(-0.36, 0.19, -1).normalize();

const SKY_RADIUS = 6000;

function starField(count: number) {
  const rand = mulberry32(42);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const tint = [new THREE.Color('#9bb0ff'), new THREE.Color('#f8f7ff'), new THREE.Color('#fff4e8'), new THREE.Color('#ffd2a1')];
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const t = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos.set([s * Math.cos(t) * SKY_RADIUS, u * SKY_RADIUS, s * Math.sin(t) * SKY_RADIUS], i * 3);
    const mag = Math.pow(rand(), 6); // most stars are faint
    const c = tint[Math.floor(rand() * tint.length)];
    const b = 0.35 + mag * 2.2;
    col.set([c.r * b, c.g * b, c.b * b], i * 3);
    size[i] = 1.2 + mag * 3.2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor * a, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function sunDisc() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.09, 'rgba(255,253,245,1)');
  grad.addColorStop(0.12, 'rgba(255,240,210,0.35)');
  grad.addColorStop(0.4, 'rgba(255,230,190,0.05)');
  grad.addColorStop(1, 'rgba(255,230,190,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(6, 5.8, 5.4), depthWrite: false, toneMapped: true, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(SUN_DIR).multiplyScalar(SKY_RADIUS * 0.9);
  // No atmosphere means no wide halo: a small hard disc with a faint glow.
  sprite.scale.setScalar(SKY_RADIUS * 0.9 * 0.08);
  return sprite;
}

function earth(day: THREE.Texture, clouds: THREE.Texture) {
  const dist = SKY_RADIUS * 0.8;
  const radius = dist * Math.tan(THREE.MathUtils.degToRad(1.0));
  const mat = new THREE.ShaderMaterial({
    uniforms: { dayMap: { value: day }, cloudMap: { value: clouds }, sunDir: { value: SUN_DIR.clone() } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewW;
      void main() {
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vViewW = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D dayMap;
      uniform sampler2D cloudMap;
      uniform vec3 sunDir;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewW;
      void main() {
        float light = dot(normalize(vNormalW), sunDir);
        float dayAmt = smoothstep(-0.08, 0.25, light);
        vec3 day = texture2D(dayMap, vUv).rgb;
        float cloud = texture2D(cloudMap, vUv).r;
        vec3 col = mix(day, vec3(1.0), cloud * 0.85) * dayAmt * 2.2;
        float rim = pow(1.0 - max(dot(normalize(vNormalW), vViewW), 0.0), 3.0);
        col += vec3(0.25, 0.5, 1.0) * rim * dayAmt * 1.4;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
  mesh.position.copy(EARTH_DIR).multiplyScalar(dist);
  // Turn Africa and Europe toward the Moon and tilt the axis a little.
  mesh.rotation.set(0.25, -1.9, 0.41);
  return mesh;
}

/** A camera-centred sky group. Call update() each frame so the sky never gets closer. */
export function buildSky(dayMap: THREE.Texture, cloudMap: THREE.Texture) {
  const group = new THREE.Group();
  group.name = 'sky';
  group.renderOrder = -1;
  group.add(starField(7000));
  group.add(sunDisc());
  group.add(earth(dayMap, cloudMap));
  return {
    group,
    update(camera: THREE.Camera) {
      group.position.copy(camera.position);
    },
  };
}
