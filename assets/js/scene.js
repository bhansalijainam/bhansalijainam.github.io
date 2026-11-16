// 27,000 dots, drawn with plain WebGL (no library).
//
// The same dots take three formations as the page scrolls:
//   A  a stippled portrait        (hero)
//   B  a stack of four plates     (process: a loose cloud is printed into order, one layer per step)
//   C  a dotted globe             (contact: land dots, with Jersey City marked)
// Between formations they disperse and fade, so the reading sections stay clean.
// Each formation is positioned by an empty "slot" element in the page, so layout
// stays in CSS.

const N = 27000;
const LAYERS = 4;
const PLATE = 82;           // 82 x 82 sites per plate
const FOV = (30 * Math.PI) / 180;
const CAM = 1 / Math.tan(FOV / 2);
const CITY = { lat: 40.72, lon: -74.04 };
const DEG = Math.PI / 180;

const VERT = `
precision highp float;
attribute vec3 aP;
attribute vec3 aS;
attribute vec3 aL;
attribute vec3 aG;
attribute vec4 aM;
uniform mat4 uProj;
uniform vec4 uA;
uniform vec2 uRA;
uniform vec2 uFace;
uniform vec4 uB;
uniform mat3 uRB;
uniform vec4 uC;
uniform mat3 uRC;
uniform vec3 uForm;
uniform vec2 uBuild;
uniform vec4 uEnv;
uniform vec3 uMouse;
uniform vec3 uSize;
varying float vA;
varying float vT;
varying float vPx;

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }

void main() {
  float t = uEnv.x;

  // loose dust: fills the view, drifts, and slides past at different depths on scroll
  vec3 dust = vec3((aS.x - 0.5) * 2.6 * uEnv.z, (aS.y - 0.5) * 2.6, (aS.z - 0.5) * 1.5);
  dust.y = mod(dust.y + uEnv.y * (0.25 + aS.z * 0.75) + 1.3, 2.6) - 1.3;
  dust.x += sin(t * 0.23 + aS.y * 31.0) * 0.035;
  dust.y += cos(t * 0.19 + aS.x * 27.0) * 0.035;

  // A: portrait. The face resolves first, then the rest; the lower body stays loose.
  float dFace = distance(aP.xy, uFace);
  float delayA = 0.40 * smoothstep(0.0, 0.8, dFace) + 0.14 * aS.x;
  float fA = smoothstep(delayA, delayA + 0.46, uForm.x);
  vec3 q = vec3(aP.xy, (aP.z - 0.6) * 0.2);
  float loose = smoothstep(-0.2, -0.5, aP.y);
  q += (aS - 0.5) * vec3(0.55, 0.3, 0.5) * loose * loose * (0.3 + aS.z) * uA.w;
  q.xy += 0.0006 * vec2(sin(t * 0.9 + aS.x * 60.0), cos(t * 0.8 + aS.y * 60.0)) * (1.0 + loose * 9.0);
  q = rotX(rotY(q, uRA.x), uRA.y);
  vec3 pA = vec3(uA.xy, 0.0) + q * uA.z;

  // B: stack. Unsorted dots hang in a cloud; each step prints one plate, left to right.
  float delayB = 0.5 * aS.y;
  float fB = smoothstep(delayB, delayB + 0.5, uForm.y);
  float layer = aL.y;
  float start = layer * 0.25 + (aL.x + 0.5) * 0.10;
  float tb = smoothstep(start, start + 0.12, uBuild.x);
  float gap = mix(0.30, 0.075, uBuild.y);
  vec3 site = vec3(aL.x, (layer - 1.5) * gap, aL.z);
  float gr1 = sqrt(-2.0 * log(max(aS.x, 0.0002)));
  float gr2 = sqrt(-2.0 * log(max(aS.z, 0.0002)));
  vec3 box = vec3(gr1 * cos(6.2832 * aS.y), gr2 * cos(6.2832 * fract(aS.x * 91.7 + aS.y * 37.3)), gr1 * sin(6.2832 * aS.y));
  box = box * vec3(0.3, 0.2, 0.3) + vec3(0.0, 0.2, 0.0);
  box.y += 0.04 * sin(t * 0.6 + aS.x * 20.0);
  vec3 lp = mix(box, site, tb);
  lp += (1.0 - uBuild.y) * (1.0 - tb * 0.8) * 0.012 * sin(vec3(t * 1.9, t * 1.6, t * 2.1) + aS * 43.0);
  vec3 lr = uRB * lp;
  vec3 pB = vec3(uB.xy, 0.0) + lr * uB.z;

  // C: globe
  float delayC = 0.5 * aS.z;
  float fC = smoothstep(delayC, delayC + 0.5, uForm.z);
  vec3 gp = uRC * aG;
  vec3 pC = vec3(uC.xy, 0.0) + gp * uC.z;

  vec3 pos = mix(dust, pA, fA);
  pos = mix(pos, pB, fB);
  pos = mix(pos, pC, fC);

  // dots arc into place rather than travelling in straight lines
  float mid = max(fA * (1.0 - fA), max(fB * (1.0 - fB), fC * (1.0 - fC))) * 4.0;
  float ang = aS.z * 6.2832 + t * 0.35;
  pos.xy += mid * 0.09 * vec2(cos(ang), sin(ang));

  // the pointer pushes dots aside
  vec2 dm = pos.xy - uMouse.xy;
  float push = uMouse.z * exp(-dot(dm, dm) * 26.0);
  pos.xy += normalize(dm + vec2(0.0001)) * push * 0.042;
  pos.z += push * 0.14;

  gl_Position = uProj * vec4(pos, 1.0);
  float persp = uSize.y / gl_Position.w;

  float sD = 0.0045 * (0.55 + aS.z);
  float sA = uA.z * 0.0036 * (0.78 + 0.5 * aM.x);
  float sB = uB.z * mix(0.0085, 0.0064, tb);
  float sC = uC.z * 0.0064 * aM.z * (1.0 + aM.w * 0.35 * sin(t * 2.4));
  float size = mix(sD, sA, fA);
  size = mix(size, sB, fB);
  size = mix(size, sC, fC);
  float px = size * uSize.x * persp * uSize.z;
  vPx = max(px, 1.0);
  gl_PointSize = vPx + 1.0;

  float aD = uEnv.w * step(0.93, fract(aS.x * 7.31 + aS.y * 3.17)) * (0.35 + 0.65 * aS.z);
  float aB = mix(0.32, 1.0, tb) * mix(0.45, 1.0, smoothstep(-0.7, 0.7, lr.z));
  float aC = mix(0.07, 1.0, smoothstep(-0.2, 0.25, gp.z)) * min(aM.z * 1.4, 1.0);
  float a = mix(aD, 1.0, fA);
  a = mix(a, aB, fB);
  a = mix(a, aC, fC);
  vA = a * min(px, 1.0);

  float tint = mix(0.0, aM.y, fA);
  tint = mix(tint, sin(tb * 3.14159), fB);
  tint = mix(tint, aM.w, fC);
  vT = tint;
}`;

const FRAG = `
precision mediump float;
uniform vec3 uInk;
uniform vec3 uAccent;
varying float vA;
varying float vT;
varying float vPx;
void main() {
  float r = length(gl_PointCoord - 0.5) * (vPx + 1.0);
  float a = clamp(vPx * 0.5 - r + 0.5, 0.0, 1.0) * vA;
  if (a < 0.004) discard;
  vec3 c = mix(uInk, uAccent, clamp(vT, 0.0, 1.0));
  gl_FragColor = vec4(c * a, a);
}`;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function buildPortrait(buf) {
  const HEAD = 16;
  const head = new DataView(buf, 0, HEAD);
  const n = head.getUint32(0, true);
  const aspect = head.getFloat32(4, true);
  const face = [head.getFloat32(8, true), head.getFloat32(12, true)];
  if (n !== N) throw new Error(`portrait data has ${n} points, expected ${N}`);
  const x = new Uint16Array(buf, HEAD, N);
  const y = new Uint16Array(buf, HEAD + 2 * N, N);
  const z = new Uint8Array(buf, HEAD + 4 * N, N);
  const s = new Uint8Array(buf, HEAD + 5 * N, N);
  const t = new Uint8Array(buf, HEAD + 6 * N, N);
  const pos = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const tint = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (x[i] / 65535 - 0.5) * aspect;
    pos[i * 3 + 1] = 0.5 - y[i] / 65535;
    pos[i * 3 + 2] = z[i] / 255;
    size[i] = s[i] / 255;
    tint[i] = t[i] / 255;
  }
  return { pos, size, tint, aspect, face };
}

function buildStack(rand) {
  // x, z: site on the plate (-0.5..0.5); y: which plate (0..3)
  const pos = new Float32Array(N * 3);
  const per = PLATE * PLATE;
  const d = PLATE - 1;
  for (let i = 0; i < N; i++) {
    const layer = Math.min(LAYERS - 1, Math.floor(i / per));
    const j = i < per * LAYERS ? i % per : Math.floor(rand() * per);   // a few spare dots double up
    pos[i * 3] = (j % PLATE) / d - 0.5;
    pos[i * 3 + 1] = layer;
    pos[i * 3 + 2] = Math.floor(j / PLATE) / d - 0.5;
  }
  return pos;
}

function buildGlobe(landBits, rand) {
  const pos = new Float32Array(N * 3);
  const weight = new Float32Array(N);
  const accent = new Float32Array(N);
  const isLand = (lat, lon) => {
    const r = Math.min(359, Math.floor((90 - lat) * 2));
    const c = Math.min(719, Math.floor((lon + 180) * 2));
    const k = r * 720 + c;
    return (landBits[k >> 3] >> (7 - (k & 7))) & 1;
  };
  const put = (i, lat, lon, w, acc) => {
    const cl = Math.cos(lat * DEG);
    pos[i * 3] = cl * Math.sin(lon * DEG);
    pos[i * 3 + 1] = Math.sin(lat * DEG);
    pos[i * 3 + 2] = cl * Math.cos(lon * DEG);
    weight[i] = w;
    accent[i] = acc;
  };

  // city marker: a centre dot and two rings
  const rings = [[1, 0, 3.4], [22, 2.3, 1.25], [40, 4.6, 0.85]];
  let n = 0;
  for (const [count, radius, w] of rings) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      put(n++, CITY.lat + Math.sin(a) * radius, CITY.lon + (Math.cos(a) * radius) / Math.cos(CITY.lat * DEG), w, 1);
    }
  }

  // land: an even (Fibonacci) spread over the sphere, kept where the mask says land
  const M = 96000;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const land = [];
  for (let k = 0; k < M; k++) {
    const y = 1 - (2 * (k + 0.5)) / M;
    const lat = Math.asin(y) / DEG;
    const lon = (((k * golden) / DEG) % 360) - 180;
    if (isLand(lat, lon)) land.push(lat, lon);
  }
  const landMax = N - n - 3400;
  let count = land.length / 2;
  const keep = count > landMax ? landMax / count : 1;
  for (let k = 0; k < count && n < N - 3400; k++) {
    if (keep < 1 && rand() > keep) continue;
    put(n++, land[k * 2], land[k * 2 + 1], 1, 0);
  }

  // the rest: a faint, even spread that gives the sphere its body
  const rest = N - n;
  for (let k = 0; k < rest; k++) {
    const y = 1 - (2 * (k + 0.5)) / rest;
    put(n++, Math.asin(y) / DEG, (((k * golden) / DEG) % 360) - 180, 0.42, 0);
  }
  return { pos, weight, accent };
}

function rotation(yaw, pitch) {
  // column-major mat3 for Rx(pitch) * Ry(yaw)
  const ca = Math.cos(yaw), sa = Math.sin(yaw), cb = Math.cos(pitch), sb = Math.sin(pitch);
  return [ca, sb * sa, -cb * sa, 0, cb, sb, sa, -sb * ca, cb * ca];
}

export async function createScene({ canvas, slots, reduceMotion }) {
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL unavailable');

  const [portraitBuf, landBuf] = await Promise.all([
    fetch(new URL('../data/portrait.bin', import.meta.url)).then((r) => { if (!r.ok) throw new Error('portrait data'); return r.arrayBuffer(); }),
    fetch(new URL('../data/land.bin', import.meta.url)).then((r) => { if (!r.ok) throw new Error('land data'); return r.arrayBuffer(); }),
  ]);

  const rand = mulberry32(20241);
  const portrait = buildPortrait(portraitBuf);
  const lattice = buildStack(rand);
  const globe = buildGlobe(new Uint8Array(landBuf), rand);
  const seeds = new Float32Array(N * 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rand();
  const misc = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    misc[i * 4] = portrait.size[i];
    misc[i * 4 + 1] = portrait.tint[i];
    misc[i * 4 + 2] = globe.weight[i];
    misc[i * 4 + 3] = globe.accent[i];
  }

  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  gl.useProgram(prog);

  const attr = (name, data, size) => {
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  attr('aP', portrait.pos, 3);
  attr('aS', seeds, 3);
  attr('aL', lattice, 3);
  attr('aG', globe.pos, 3);
  attr('aM', misc, 4);

  const U = {};
  for (const name of ['uProj', 'uA', 'uRA', 'uFace', 'uB', 'uRB', 'uC', 'uRC', 'uForm', 'uBuild', 'uEnv', 'uMouse', 'uSize', 'uInk', 'uAccent']) {
    U[name] = gl.getUniformLocation(prog, name);
  }

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.uniform2f(U.uFace, portrait.face[0], portrait.face[1]);

  // What the page asks for. main.js writes these; the scene eases towards them.
  const stage = {
    formA: 1, formB: 0, formC: 0, build: 0, lock: 0,
    dust: 0, scroll: 0, loose: 1,
    ink: [17, 19, 42], accent: [255, 84, 64],
  };
  const cur = { formA: 0, formB: 0, formC: 0, build: 0, lock: 0, dust: 0, ink: stage.ink.slice(), intro: reduceMotion.matches ? 1 : 0 };

  let width = 1, height = 1, aspect = 1, dpr = 1;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h) return;
    width = w; height = h; aspect = w / h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const near = 0.1, far = 30;
    const p10 = (far + near) / (near - far), p14 = (2 * far * near) / (near - far);
    gl.uniformMatrix4fv(U.uProj, false, [
      CAM / aspect, 0, 0, 0,
      0, CAM, 0, 0,
      0, 0, p10, -1,
      0, 0, -CAM * p10 + p14, CAM,
    ]);
  }
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);

  // slot rectangle -> world space (y spans -1..1 over the canvas height)
  const world = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: ((r.left + r.width / 2) / width * 2 - 1) * aspect,
      y: 1 - ((r.top + r.height / 2) / height) * 2,
      w: (r.width / height) * 2,
      h: (r.height / height) * 2,
    };
  };

  const pointer = { x: 0, y: 0, nx: 0, ny: 0, sx: 0, sy: 0, force: 0, last: -1e9 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / width * 2 - 1) * aspect;
    pointer.y = 1 - (e.clientY / height) * 2;
    pointer.nx = e.clientX / width - 0.5;
    pointer.ny = e.clientY / height - 0.5;
    pointer.last = performance.now();
  }, { passive: true });

  let running = true, raf = 0, last = performance.now(), t0 = last, started = false, blank = false;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const still = reduceMotion.matches;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = still ? 0 : (now - t0) / 1000;
    const k = still ? 1 : 1 - Math.exp(-dt * 5.5);

    if (!still && cur.intro < 1) cur.intro = Math.min(1, cur.intro + dt / 2.6);
    for (const key of ['formA', 'formB', 'formC', 'build', 'lock', 'dust']) cur[key] += (stage[key] - cur[key]) * k;
    for (let i = 0; i < 3; i++) cur.ink[i] += (stage.ink[i] - cur.ink[i]) * (still ? 1 : 1 - Math.exp(-dt * 4));

    pointer.sx += (pointer.nx - pointer.sx) * (still ? 1 : 0.06);
    pointer.sy += (pointer.ny - pointer.sy) * (still ? 1 : 0.06);
    const active = !still && now - pointer.last < 220 ? 1 : 0;
    pointer.force += (active - pointer.force) * (active ? 0.18 : 0.045);

    // nothing on screen: clear once, then idle until a formation comes back
    const ease = cur.intro * cur.intro * (3 - 2 * cur.intro);
    const visible = cur.formA * ease > 0.002 || cur.formB > 0.002 || cur.formC > 0.002 || cur.dust > 0.004;
    if (!visible) {
      if (!blank) { gl.clear(gl.COLOR_BUFFER_BIT); blank = true; }
      if (!started) { started = true; canvas.classList.add('is-live'); }
      return;
    }
    blank = false;
    gl.clear(gl.COLOR_BUFFER_BIT);

    // A: portrait, fitted inside its slot and standing on its bottom edge
    const a = world(slots.portrait);
    const sA = Math.min(a.h, a.w / portrait.aspect);
    gl.uniform4f(U.uA, a.x, a.y - a.h / 2 + sA / 2, sA, stage.loose);
    const sway = still ? 0 : Math.sin(time * 0.45) * 0.07;
    gl.uniform2f(U.uRA, pointer.sx * 0.5 + sway, pointer.sy * 0.28);

    // B: stack, turning slowly
    const b = world(slots.lattice);
    gl.uniform4f(U.uB, b.x, b.y, Math.min(b.w, b.h) * 0.62, 0);
    gl.uniformMatrix3fv(U.uRB, false, rotation(0.62 + time * 0.12 + cur.build * 0.9 + pointer.sx * 0.4, 0.5 + pointer.sy * 0.2));

    // C: globe, turned so the city faces the camera. The globe usually sits off to one
    // side, so "facing the camera" is not straight ahead: aim along the line to the lens,
    // otherwise perspective pushes the marker towards the edge of the screen.
    const c = world(slots.globe);
    gl.uniform4f(U.uC, c.x, c.y, Math.min(c.w, c.h) * 0.5, 0);
    const aimYaw = Math.atan2(-c.x, CAM);
    const aimPitch = Math.atan2(c.y, CAM);
    const spin = (1 - cur.formC) * 0.9 + (still ? 0 : Math.sin(time * 0.22) * 0.14) + pointer.sx * 0.3;
    gl.uniformMatrix3fv(U.uRC, false, rotation(-CITY.lon * DEG + aimYaw + spin, 0.5 + aimPitch + pointer.sy * 0.2));

    gl.uniform3f(U.uForm, cur.formA * ease, cur.formB, cur.formC);
    gl.uniform2f(U.uBuild, cur.build, cur.lock);
    gl.uniform4f(U.uEnv, time, stage.scroll, aspect, cur.dust);
    gl.uniform3f(U.uMouse, pointer.x, pointer.y, pointer.force);
    gl.uniform3f(U.uSize, (height * dpr) / 2, CAM, 1);
    gl.uniform3f(U.uInk, cur.ink[0] / 255, cur.ink[1] / 255, cur.ink[2] / 255);
    gl.uniform3f(U.uAccent, stage.accent[0] / 255, stage.accent[1] / 255, stage.accent[2] / 255);
    gl.drawArrays(gl.POINTS, 0, N);

    if (!started) { started = true; canvas.classList.add('is-live'); }
  }

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); running = false; });
  raf = requestAnimationFrame(frame);

  return { stage, count: N, get running() { return running; } };
}
