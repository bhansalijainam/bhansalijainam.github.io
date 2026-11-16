// A loss landscape with an optimizer on it. The surface is a fixed function
// f(x, z); the descent path is real gradient descent with momentum on that
// function, computed once. Scroll position picks how far along the path the
// optimizer is.

import * as THREE from './vendor/three.module.min.js';

const SIZE = 46;          // world width of the surface
const HEIGHT = 1.55;      // vertical exaggeration
const MIN = { x: 7, z: 6 };
const START = { x: -15, z: -13.5 };
const BG = 0x110a22;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ---------- the loss function ---------- */

function f(x, z) {
  const dx = x - MIN.x;
  const dz = z - MIN.z;
  const d2 = dx * dx + dz * dz;
  let h = 4.6 * (1 - Math.exp(-d2 / 900));                 // broad basin
  h += 0.42 * Math.sin(0.5 * x + 1.3) * Math.cos(0.46 * z - 0.4);
  h += 0.16 * Math.sin(1.25 * x - 0.8 * z + 0.6);          // ripples
  h += 1.1 * Math.exp(-((x + 5) ** 2 + (z + 2) ** 2) / 14); // a hill in the way
  h += 0.8 * Math.exp(-((x - 12) ** 2 + (z + 9) ** 2) / 20);
  h -= 0.7 * Math.exp(-d2 / 7);                            // the minimum
  return h;
}

function grad(x, z) {
  const e = 0.01;
  return [(f(x + e, z) - f(x - e, z)) / (2 * e), (f(x, z + e) - f(x, z - e)) / (2 * e)];
}

/* ---------- gradient descent with momentum ---------- */

function descend() {
  const raw = [];
  let x = START.x, z = START.z, vx = 0, vz = 0;
  const fMin = f(MIN.x, MIN.z);
  for (let i = 0; i < 1400; i++) {
    raw.push([x, z]);
    const [gx, gz] = grad(x, z);
    vx = 0.9 * vx - 0.05 * gx;
    vz = 0.9 * vz - 0.05 * gz;
    x += vx;
    z += vz;
    if (i > 80 && Math.hypot(vx, vz) < 0.002) break;
  }
  // If momentum left it in a local dip, walk the rest of the way.
  const [lx, lz] = raw[raw.length - 1];
  if (f(lx, lz) - fMin > 0.05) {
    for (let i = 1; i <= 40; i++) raw.push([lerp(lx, MIN.x, i / 40), lerp(lz, MIN.z, i / 40)]);
  }

  // Resample evenly by distance so scroll speed maps to travel speed.
  const cum = [0];
  for (let i = 1; i < raw.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  const N = 520;
  const pts = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const d = (i / (N - 1)) * total;
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const t = clamp((d - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]));
    const px = lerp(raw[j][0], raw[j + 1][0], t);
    const pz = lerp(raw[j][1], raw[j + 1][1], t);
    pts.push({ x: px, z: pz, h: f(px, pz) });
  }
  return pts;
}

/* ---------- shaders ---------- */

const vertexShader = /* glsl */ `
  attribute float aH;
  uniform float uRise;
  uniform float uHeight;
  uniform float uHalf;
  varying float vH;
  varying vec3 vPos;

  void main() {
    // the surface rises out of a flat plane, centre first
    float d = length(position.xz) / uHalf;
    float rise = smoothstep(0.0, 1.0, clamp(uRise * 2.0 - d, 0.0, 1.0));
    vec3 p = vec3(position.x, position.y * rise, position.z);
    vH = aH;
    vPos = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uBg;
  uniform vec3 uBall;
  uniform float uPulse;
  uniform float uHalf;
  varying float vH;
  varying vec3 vPos;

  // viridis, polynomial fit
  vec3 viridis(float t) {
    const vec3 c0 = vec3(0.2777273272234177, 0.005407344544966578, 0.3340998053353061);
    const vec3 c1 = vec3(0.1050930431085774, 1.404613529898575, 1.384590162594685);
    const vec3 c2 = vec3(-0.3308618287255563, 0.214847559468213, 0.09509516302823659);
    const vec3 c3 = vec3(-4.634230498983486, -5.799100973351585, -19.33244095627987);
    const vec3 c4 = vec3(6.228269936347081, 14.17993336680509, 56.69055260068105);
    const vec3 c5 = vec3(4.776384997670288, -13.74514537774601, -65.35303263337234);
    const vec3 c6 = vec3(-5.435455855934631, 4.645852612178535, 26.3124352495832);
    return clamp(c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6))))), 0.0, 1.0);
  }

  float isoline(float v, float width) {
    float fw = max(fwidth(v), 1e-5);
    return 1.0 - smoothstep(width, width + 1.0, abs(fract(v - 0.5) - 0.5) / fw);
  }

  void main() {
    float low = 1.0 - vH;                 // low loss is the bright end
    vec3 col = viridis(low);

    float minor = isoline(vH * 30.0, 0.5);
    float major = isoline(vH * 6.0, 1.0);
    vec2 g = vPos.xz / 2.0;
    float grid = max(isoline(g.x, 0.3), isoline(g.y, 0.3));

    vec3 c = uBg + col * (0.05 + 0.2 * low * low);
    c += col * minor * 0.5;
    c += col * major * 0.55;
    c += col * grid * 0.1;

    // the optimizer lights the ground around it and pings outwards
    float d = distance(vPos.xz, uBall.xz);
    vec3 warm = vec3(0.99, 0.91, 0.15);
    c += warm * exp(-d * d * 0.9) * 0.22;
    c += warm * smoothstep(0.3, 0.0, abs(d - uPulse * 7.0)) * (1.0 - uPulse) * 0.4;

    float edge = 1.0 - smoothstep(0.55, 1.0, length(vPos.xz) / uHalf);
    gl_FragColor = vec4(mix(uBg, c, edge), 1.0);
  }
`;

/* ---------- scene ---------- */

export function start({ canvas, state, report, startLoss, reduceMotion }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const small = window.matchMedia('(max-width: 720px)');
  renderer.setClearColor(BG, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

  // surface
  const seg = small.matches ? 120 : 200;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const hs = new Float32Array(pos.count);
  let hMin = Infinity, hMax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const h = f(pos.getX(i), pos.getZ(i));
    hs[i] = h;
    if (h < hMin) hMin = h;
    if (h > hMax) hMax = h;
  }
  const norm = (h) => (h - hMin) / (hMax - hMin);
  const worldY = (h) => (h - hMin) * HEIGHT;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, worldY(hs[i]));
    hs[i] = norm(hs[i]);
  }
  geo.setAttribute('aH', new THREE.BufferAttribute(hs, 1));

  const uniforms = {
    uBg: { value: new THREE.Color(BG) },
    uBall: { value: new THREE.Vector3() },
    uPulse: { value: 0 },
    uRise: { value: 0 },
    uHeight: { value: HEIGHT },
    uHalf: { value: SIZE / 2 },
  };
  const surface = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, side: THREE.DoubleSide,
  }));
  scene.add(surface);

  // descent path
  const path = descend().map((p) => new THREE.Vector3(p.x, worldY(p.h), p.z));
  const lossAt = path.map((p) => p.y / HEIGHT);
  const lossStart = lossAt[0];
  const lossEnd = lossAt[lossAt.length - 1];
  const toLoss = (v) => clamp((v - lossEnd) / (lossStart - lossEnd), 0, 1.2) * startLoss;

  const lift = 0.07;
  const trailGeo = new THREE.BufferGeometry().setFromPoints(path.map((p) => new THREE.Vector3(p.x, p.y + lift, p.z)));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xfde725, transparent: true, opacity: 0.9 }));
  scene.add(trail);

  const STEP_EVERY = 13;
  const stepPts = path.filter((_, i) => i % STEP_EVERY === 0).map((p) => new THREE.Vector3(p.x, p.y + lift, p.z));
  const steps = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(stepPts),
    new THREE.PointsMaterial({ color: 0xfff6a0, size: 4.5, sizeAttenuation: false }),
  );
  scene.add(steps);

  // the minimum it is heading for
  const goal = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.56, 48),
    new THREE.MeshBasicMaterial({ color: 0xfde725, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  goal.rotation.x = -Math.PI / 2;
  goal.position.set(MIN.x, worldY(f(MIN.x, MIN.z)) + 0.05, MIN.z);
  scene.add(goal);

  // optimizer
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff9c4 }),
  );
  scene.add(ball);

  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 128;
  const g2 = glowCanvas.getContext('2d');
  const grd = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(253,231,37,0.9)');
  grd.addColorStop(0.25, 'rgba(253,231,37,0.35)');
  grd.addColorStop(1, 'rgba(253,231,37,0)');
  g2.fillStyle = grd;
  g2.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(glowCanvas), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  glow.scale.setScalar(2.6);
  scene.add(glow);

  /* ---------- sizing ---------- */

  let width = 1, height = 1;
  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small.matches ? 1.5 : 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    dirty = true;
  }

  /* ---------- frame ---------- */

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX / window.innerWidth - 0.5;
    pointer.ty = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  const center = new THREE.Vector3(0, 2.2, 0);
  const target = new THREE.Vector3();
  const ballPos = new THREE.Vector3();
  let p = state.progress;      // eased progress
  let rise = reduceMotion.matches ? 1 : 0;
  let dirty = true;
  let last = performance.now();
  let t0 = last;

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const still = reduceMotion.matches;
    const time = (now - t0) / 1000;

    // ease towards the scroll position
    const before = p;
    p = still ? state.progress : p + (state.progress - p) * (1 - Math.exp(-dt * 5));
    if (Math.abs(state.progress - p) < 0.0002) p = state.progress;

    if (!still && rise < 1) rise = Math.min(1, rise + dt / 2.4);
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;

    if (still && !dirty && before === p) return;
    dirty = false;

    // optimizer position along the path
    const fi = p * (path.length - 1);
    const i0 = Math.floor(fi);
    const i1 = Math.min(path.length - 1, i0 + 1);
    ballPos.lerpVectors(path[i0], path[i1], fi - i0);

    const riseEase = 1 - (1 - rise) ** 3;
    uniforms.uRise.value = riseEase;
    uniforms.uBall.value.copy(ballPos);
    uniforms.uPulse.value = still ? 1 : (time * 0.32) % 1;

    const shown = smooth(0.7, 1, rise);
    const bob = still ? 0 : Math.sin(time * 2.2) * 0.03;
    ball.position.set(ballPos.x, ballPos.y + 0.2 + bob, ballPos.z);
    ball.scale.setScalar(shown);
    glow.position.copy(ball.position);
    glow.scale.setScalar(2.6 * shown * (still ? 1 : 1 + Math.sin(time * 3) * 0.06));
    trail.geometry.setDrawRange(0, shown > 0 ? i1 + 1 : 0);
    steps.geometry.setDrawRange(0, shown > 0 ? Math.floor(i0 / STEP_EVERY) + 1 : 0);
    goal.material.opacity = 0.55 * shown;
    goal.scale.setScalar(still ? 1 : 1 + Math.sin(time * 1.6) * 0.12);

    // camera: wide view of the whole landscape, closing in on the optimizer
    const follow = smooth(0.02, 0.3, p);
    const e = p * p * (3 - 2 * p);
    target.lerpVectors(center, ballPos, follow);
    const sway = still ? 0 : Math.sin(time * 0.12) * 0.07;
    const theta = 1.15 + p * 2.6 + sway + pointer.x * 0.12;
    const r = lerp(34, 12.5, e);
    const hgt = lerp(15.5, 6.2, e) - pointer.y * 1.2;
    camera.position.set(target.x + Math.cos(theta) * r, target.y + hgt, target.z + Math.sin(theta) * r);
    camera.lookAt(target);

    // on wide screens, sit the landscape to the right of the hero text
    const wide = width > 900 ? 1 : 0;
    const shiftX = wide * 0.24 * (1 - smooth(0.05, 0.35, p));
    const shiftY = (1 - wide) * 0.3 * (1 - smooth(0.05, 0.3, p));
    if (shiftX || shiftY) camera.setViewOffset(width, height, -width * shiftX, -height * shiftY, width, height);
    else camera.clearViewOffset();

    renderer.render(scene, camera);
    report(p, toLoss(ballPos.y / HEIGHT));
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('scroll', () => { dirty = true; }, { passive: true });
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', () => { dirty = true; rise = 1; });

  canvas.classList.add('is-live');
  requestAnimationFrame(frame);
}
