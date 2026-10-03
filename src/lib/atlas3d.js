/**
 * The atlas in 3D — the same map, lifted (three.js, a separate chunk loaded
 * the first time a reader asks for 3D).
 *
 * Nothing here has a layout of its own. Every work sits exactly where the
 * atlas put it — its x is its year column, its depth is its row — so switching
 * is one continuous motion: the camera starts straight above the chart, at the
 * atlas's own scale, over the very part the reader was looking at; then the
 * capsules collapse into beads and each branch band rises onto its own glass
 * floor. Debts that cross between branches — the faint lines of the flat map —
 * turn into bridges between floors, coloured from one branch into the other
 * (challenges stay red). Going back is the same motion, reversed, ending on
 * the 2D chart pixel for pixel.
 *
 * The fourth dimension is the atlas's time machine: scrub or play the years
 * and the building grows — works pop up on their floors, relations draw
 * themselves from the older work to the newer one, a glass "now" sweeps
 * across, and while it plays the camera travels with it.
 *
 * Everything else — selection, the inspector, filters, search, tours — is the
 * atlas's own: this module draws what the atlas tells it to and reports what
 * is under the pointer (hooks).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const FOV = 34;
const TAN = Math.tan((FOV * Math.PI) / 360);
const SAMPLES = 28; // points per relation curve
const LIFT = 10; // a bead floats this far above its floor
const SPREAD = 0.12; // unfolded, floors keep this share of their map offset: terraces, not a stack
const ZUP = 0.5; // … and their rows close up to half the depth: long glass strips, as a building
const TOP = 0.0001; // looking straight down (phi), just off the pole

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const smooth = (a, b, t) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a)); // into (-π, π]
const shortWay = (from, to) => from + wrapAngle(to - from);
const isLight = () => document.documentElement.dataset.theme === 'light';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const tok = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// a CSS color token as a three.js color plus its alpha (tokens may be rgba)
function cssColor(name) {
  const v = tok(name);
  const m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/);
  if (m) return { color: new THREE.Color(`rgb(${m[1]}, ${m[2]}, ${m[3]})`), alpha: m[4] === undefined ? 1 : Number(m[4]) };
  return { color: new THREE.Color(v || '#888888'), alpha: 1 };
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.lineWidth = 9;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// the "now" sheet: light in the middle of its depth, fading to both edges
function sheetTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// The atlas capsule, drawn by a shader so that any width keeps its round
// ends, at any zoom: fill, outline, the kind mark, the award ring and the
// "has article" dot — the same marks the SVG draws, in the same units.
const CAP_VERT = /* glsl */ `
  attribute vec2 aSize;
  attribute vec3 aColor;
  attribute vec4 aInfo;   // shape (0 circle, 1 diamond, 2 square), award, article
  attribute vec2 aState;  // opacity, emphasis (0 plain, 1 lit, 2 selected)
  varying vec2 vP;
  varying vec2 vSize;
  varying vec3 vColor;
  varying vec4 vInfo;
  varying vec2 vState;
  void main() {
    vSize = aSize;
    vColor = aColor;
    vInfo = aInfo;
    vState = aState;
    vP = (uv - 0.5) * aSize;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const CAP_FRAG = /* glsl */ `
  uniform vec3 uFill;
  uniform vec4 uStroke;
  uniform vec3 uInk;
  uniform vec3 uAward;
  uniform float uMarkX;
  uniform float uPadR;
  varying vec2 vP;
  varying vec2 vSize;
  varying vec3 vColor;
  varying vec4 vInfo;
  varying vec2 vState;
  float sdBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  float sdShape(vec2 p, float shape, float r) {
    if (shape < 0.5) return length(p) - r;
    if (shape < 1.5) return (abs(p.x) + abs(p.y) - r * 1.2) * 0.7071;
    vec2 d = abs(p) - r * 0.86;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }
  void main() {
    float aa = max(fwidth(vP.x), 1e-4);
    vec2 hs = vSize * 0.5;
    float d = sdBox(vP, hs, hs.y);
    float inside = 1.0 - smoothstep(-aa, aa, d);
    if (inside <= 0.0 || vState.x <= 0.0) discard;
    float sw = vState.y > 1.5 ? 2.2 : (vState.y > 0.5 ? 1.6 : 1.0);
    float rim = 1.0 - smoothstep(sw - aa, sw + aa, -d);
    vec3 fill = mix(uFill, vColor, vState.y > 1.5 ? 0.22 : 0.0);
    vec3 stroke = vState.y > 0.5 ? mix(uFill, vColor, 0.8) : mix(uFill, uStroke.rgb, uStroke.a);
    vec3 col = mix(fill, stroke, rim);
    vec2 m = vP - vec2(-hs.x + uMarkX, 0.0);
    col = mix(col, vColor, 1.0 - smoothstep(-aa, aa, sdShape(m, vInfo.x, 4.4)));
    if (vInfo.y > 0.5) col = mix(col, uAward, 1.0 - smoothstep(0.75 - aa, 0.75 + aa, abs(sdShape(m, vInfo.x, 7.4))));
    if (vInfo.z > 0.5) col = mix(col, uInk, 1.0 - smoothstep(-aa, aa, length(vP - vec2(hs.x - uPadR + 1.0, 0.0)) - 2.6));
    gl_FragColor = vec4(col, inside * vState.x);
    #include <colorspace_fragment>
  }
`;

export function mountAtlas3d({ host, data, strings: STR, geom: G, labelOf, hooks }) {
  // ------------------------------------------------------------- the data
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const edges = data.edges; // sanitized and keyed by the atlas
  const branchById = new Map(data.branches.map((b) => [b.id, b]));
  const laneById = new Map(data.lanes.map((l) => [l.id, l]));
  const SHAPE = { circle: 0, diamond: 1, square: 2 };
  const shapeOf = (n) => SHAPE[data.nodeKinds?.[n.kind]?.shape ?? 'circle'] ?? 0;
  const bridgeEnds = new Set(edges.filter((e) => e.crossBranch).flatMap((e) => [e.source, e.target]));
  const direct = new Map(data.nodes.map((n) => [n.id, new Set()]));
  for (const e of edges) {
    direct.get(e.source).add(e.target);
    direct.get(e.target).add(e.source);
  }

  // ------------------------------------------------------------- the scene
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'a3-gl';
  host.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = 'a3-labels';
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 4, 60000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.zoomToCursor = true;
  controls.minDistance = 160;
  controls.maxDistance = 20000;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.enabled = false;
  // on touch: a vertical swipe scrolls the page, a sideways one turns
  renderer.domElement.style.touchAction = 'pan-y';

  const glowTex = glowTexture();
  const ringTex = ringTexture();
  const branchColor = (id) => {
    const b = branchById.get(id);
    return new THREE.Color(b ? (isLight() ? b.colorLight : b.color) : tok('--muted'));
  };

  // ------------------------------------------------------------- state
  let V = null; // the atlas's layout (its `view`)
  let F = 0; // floors
  let FY = 260; // floor to floor, unfolded
  let floors = []; // one per branch band of the layout
  let floorOfBranch = new Map();
  let T = 0; // 0 = the flat map, 1 = the floors
  let focus = { mode: 'none' };
  let kinds = null;
  let types = null;
  let bridgesOnly = false;
  let yearIdx = Infinity;
  let yearActive = false; // the time machine is set before today
  let quietYear = false; // the time machine is set, but its sheet stays out of the picture
  let playing = false;
  let active = false; // the atlas is in 3D
  let flatK = 1; // the flat chart's scale, while the map lies flat (its captions sit in pixels)
  let dirty = true;
  const invalidate = () => (dirty = true);

  // per-floor progress of the unfolding (floors rise one after another)
  const stagger = () => (F > 1 ? 0.08 : 0);
  const tFloor = (f) => easeInOut(clamp((T - f * stagger()) / (1 - (F - 1) * stagger()), 0, 1));
  // the capsule → bead change rides on its floor's rise
  const beadOf = (f) => smooth(0.12, 0.7, tFloor(f));

  // ------------------------------------------------------------- works
  const capGeo = new THREE.PlaneGeometry(1, 1);
  capGeo.rotateX(-Math.PI / 2);
  const N = data.nodes.length;
  const capAttr = {
    size: new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2),
    color: new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3),
    info: new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4),
    state: new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2),
  };
  capGeo.setAttribute('aSize', capAttr.size);
  capGeo.setAttribute('aColor', capAttr.color);
  capGeo.setAttribute('aInfo', capAttr.info);
  capGeo.setAttribute('aState', capAttr.state);
  const capMat = new THREE.ShaderMaterial({
    vertexShader: CAP_VERT,
    fragmentShader: CAP_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uFill: { value: new THREE.Color() },
      uStroke: { value: new THREE.Vector4() },
      uInk: { value: new THREE.Color() },
      uAward: { value: new THREE.Color() },
      uMarkX: { value: G.MARK_X },
      uPadR: { value: G.PAD_R },
    },
  });
  const caps = new THREE.InstancedMesh(capGeo, capMat, N);
  caps.frustumCulled = false;
  caps.renderOrder = 3;
  scene.add(caps);

  const works = data.nodes.map((n, i) => {
    const group = new THREE.Group();
    const kindGeo =
      n.kind === 'analysis'
        ? new THREE.OctahedronGeometry(10)
        : n.kind === 'dataset'
          ? new THREE.BoxGeometry(12.5, 12.5, 12.5)
          : new THREE.SphereGeometry(7.6, 22, 16);
    const core = new THREE.Mesh(kindGeo, new THREE.MeshBasicMaterial({ transparent: true }));
    core.renderOrder = 4;
    group.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }));
    glow.scale.set(66, 66, 1);
    group.add(glow);
    let ring = null;
    if (n.award) {
      ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false }));
      ring.scale.set(30, 30, 1);
      group.add(ring);
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(19, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.id = n.id;
    group.add(hit);
    // the name over a bead, when it is in focus
    const label = document.createElement('span');
    label.className = 'a3-label';
    label.textContent = labelOf(n);
    const labelObj = new CSS2DObject(label);
    labelObj.position.set(0, 16, 0);
    labelObj.center.set(0.5, 1);
    labelObj.visible = false;
    group.add(labelObj);
    scene.add(group);
    // the name inside the capsule, on the flat map
    const text = document.createElement('span');
    text.className = 'a3-cap-text';
    text.textContent = labelOf(n);
    const textObj = new CSS2DObject(text);
    textObj.center.set(0, 0.5);
    textObj.visible = false;
    scene.add(textObj);
    capAttr.info.setXYZW(i, shapeOf(n), n.award ? 1 : 0, n.hasPost ? 1 : 0, 0);
    return {
      n,
      i,
      group,
      core,
      glow,
      ring,
      hit,
      label,
      labelObj,
      text,
      textObj,
      shown: false, // in the layout (its branch is on)
      cx: 0, // where the atlas put it (content units)
      cy: 0,
      w: 0,
      f: 0,
      born: true, // not beyond the time machine
      a: 1, // appearance, 0..1
      aFrom: 1,
      aTo: 1,
      aT0: 0,
      aDur: 1,
      from: null, // world position before a re-layout
      alpha: 1,
      emph: 0,
    };
  });
  const workById = new Map(works.map((w) => [w.n.id, w]));

  // ------------------------------------------------------------- relations
  const relations = edges.map((e) => {
    const geo = new LineGeometry();
    // the segment buffer is allocated here, once (the distance buffer just
    // below); every move after this writes into both in place (writeLine)
    geo.setPositions(new Float32Array(SAMPLES * 3));
    const m = data.edgeTypes[e.type];
    const mat = new LineMaterial({
      linewidth: 1.4,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      dashed: Boolean(m.dash),
      dashSize: e.type === 'challenges' ? 2 : e.type === 'revives' ? 10 : 6,
      gapSize: e.type === 'challenges' ? 4 : e.type === 'revives' ? 6 : 5,
    });
    const line = new Line2(geo, mat);
    line.computeLineDistances();
    line.renderOrder = 1;
    line.frustumCulled = false;
    scene.add(line);
    const r = {
      e,
      line,
      geo,
      mat,
      bridge: e.crossBranch,
      alive: true, // both ends exist at the time machine's year
      d: 1, // how much of it is drawn
      dFrom: 1,
      dTo: 1,
      dT0: 0,
      dDur: 1,
      on: false, // shown under the filters, this frame
    };
    line.userData.rel = r;
    return r;
  });
  const relByKey = new Map(relations.map((r) => [r.e.key, r]));
  const posArr = new Float32Array(SAMPLES * 3);
  // a relation's curve (posArr), written into its own buffers: segments and
  // running distances (for its dashes and the flow), then its bounds (picking)
  function writeLine(r) {
    const seg = r.geo.attributes.instanceStart.data;
    const dist = r.geo.attributes.instanceDistanceStart.data;
    const a = seg.array;
    const d = dist.array;
    let run = 0;
    for (let i = 0; i < SAMPLES - 1; i++) {
      const p = i * 3;
      const o = i * 6;
      a[o] = posArr[p];
      a[o + 1] = posArr[p + 1];
      a[o + 2] = posArr[p + 2];
      a[o + 3] = posArr[p + 3];
      a[o + 4] = posArr[p + 4];
      a[o + 5] = posArr[p + 5];
      const dx = posArr[p + 3] - posArr[p];
      const dy = posArr[p + 4] - posArr[p + 1];
      const dz = posArr[p + 5] - posArr[p + 2];
      d[i * 2] = run;
      run += Math.sqrt(dx * dx + dy * dy + dz * dz);
      d[i * 2 + 1] = run;
    }
    seg.needsUpdate = true;
    dist.needsUpdate = true;
    r.geo.computeBoundingBox();
    r.geo.computeBoundingSphere();
  }

  // the debt in motion: bright dashes flowing inside the relation in focus,
  // from the older work to the newer one (it borrows that relation's own
  // geometry, so it always sits exactly on the line)
  const flowMat = new LineMaterial({
    color: 0xffffff,
    linewidth: 2.2,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    dashed: true,
    dashSize: 12,
    gapSize: 30,
  });
  const flow = new Line2(new LineGeometry(), flowMat);
  flow.visible = false;
  flow.renderOrder = 5;
  flow.frustumCulled = false;
  scene.add(flow);

  // ------------------------------------------------------------- now (4D)
  // a sheet of light standing across the floors at the time machine's year
  const sheetMat = new THREE.MeshBasicMaterial({
    map: sheetTexture(),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    opacity: 0,
  });
  const sheetGeo = new THREE.PlaneGeometry(1, 1);
  sheetGeo.rotateY(Math.PI / 2);
  const sheet = new THREE.Mesh(sheetGeo, sheetMat);
  sheet.renderOrder = 2;
  sheet.visible = false;
  scene.add(sheet);
  const rimGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -0.5, -0.5),
    new THREE.Vector3(0, 0.5, -0.5),
    new THREE.Vector3(0, 0.5, 0.5),
    new THREE.Vector3(0, -0.5, 0.5),
  ]);
  const sheetRim = new THREE.LineLoop(rimGeo, new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
  sheetRim.renderOrder = 2;
  sheetRim.visible = false;
  scene.add(sheetRim);
  // the time machine's year, large, over the stage while the years run
  const nowTag = document.createElement('div');
  nowTag.className = 'a3-now';
  nowTag.setAttribute('aria-hidden', 'true');
  host.appendChild(nowTag);
  let sheetX = 0;
  let sheetA = 0;

  // the year axis along the front edge of the lowest floor
  const axis = new THREE.Group();
  scene.add(axis);
  let yearTags = [];

  // ------------------------------------------------------------- floors
  function disposeFloors() {
    for (const fl of floors) {
      fl.group.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
        if (o.isCSS2DObject) o.element.remove();
      });
      scene.remove(fl.group);
    }
    floors = [];
  }

  function buildFloors() {
    const old = new Map(floors.map((fl) => [fl.branch, fl.group.position.clone()]));
    disposeFloors();
    F = V.bands.length;
    const maxDepth = Math.max(1, ...V.bands.map((b) => b.bottom - b.top));
    FY = clamp(maxDepth * ZUP * 0.9, 150, 260);
    floorOfBranch = new Map(V.bands.map((b, f) => [b.branch, f]));
    const counts = new Map();
    for (const n of V.nodes) counts.set(n.branch, (counts.get(n.branch) ?? 0) + 1);
    floors = V.bands.map((b, f) => {
      const group = new THREE.Group();
      const depth = b.bottom - b.top;
      const mid = (b.top + b.bottom) / 2;
      const shape = roundedRect(V.W, depth, 10);
      const glass = new THREE.Mesh(
        new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      );
      glass.renderOrder = 0;
      group.add(glass);
      const rim = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(shape.getPoints(6)).rotateX(-Math.PI / 2),
        new THREE.LineBasicMaterial({ transparent: true }),
      );
      group.add(rim);
      // the band's coloured edge, as in the atlas
      const bar = new THREE.Mesh(
        new THREE.PlaneGeometry(3, Math.max(2, depth - 24)).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      );
      bar.position.set(-V.W / 2 + 1.5, 0.3, 0);
      group.add(bar);
      // lane rules and year lines: the atlas grid, etched into the glass
      const rules = [];
      b.lanes.forEach((id, i) => {
        if (i === 0) return;
        const z = V.laneTop.get(id) - mid;
        rules.push(-V.W / 2 + 14, 0.2, z, V.W / 2 - 14, 0.2, z);
      });
      const ruleGeo = new THREE.BufferGeometry();
      ruleGeo.setAttribute('position', new THREE.Float32BufferAttribute(rules, 3));
      const laneRules = new THREE.LineSegments(ruleGeo, new THREE.LineDashedMaterial({ transparent: true, dashSize: 2, gapSize: 6 }));
      laneRules.computeLineDistances();
      group.add(laneRules);
      const grid = [];
      for (const yr of V.years) {
        const x = V.x.get(yr) + G.MARK_X - V.W / 2;
        grid.push(x, 0.1, -depth / 2 + 6, x, 0.1, depth / 2 - 6);
      }
      const gridGeo = new THREE.BufferGeometry();
      gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
      const gridLines = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ transparent: true }));
      group.add(gridLines);
      // the floor's name at its back-left corner (where the atlas writes it);
      // lane names along its left edge
      const br = branchById.get(b.branch);
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'a3-floor';
      tag.dataset.branch = b.branch;
      tag.innerHTML = `<span class="a3-floor-dot"></span><span class="a3-floor-name">${esc(br?.title ?? b.branch)}</span><span class="a3-floor-n">${counts.get(b.branch) ?? 0}</span>`;
      const tagObj = new CSS2DObject(tag);
      tagObj.position.set(-V.W / 2 + 12, 1, -depth / 2 + 25);
      tagObj.center.set(0, 0.5);
      group.add(tagObj);
      const laneObjs = [];
      const laneTags = b.lanes.map((id) => {
        const s = document.createElement('span');
        s.className = 'a3-lane';
        s.textContent = laneById.get(id)?.title ?? id;
        const o = new CSS2DObject(s);
        o.position.set(-V.W / 2 + 22, 1, V.laneTop.get(id) + 10.5 - mid);
        o.center.set(0, 0.5);
        group.add(o);
        laneObjs.push(o);
        return s;
      });
      tag.addEventListener('pointerenter', () => {
        hoverFloor = b.branch;
        paintFloors();
      });
      tag.addEventListener('pointerleave', () => {
        hoverFloor = null;
        paintFloors();
      });
      tag.addEventListener('click', () => frameIds(V.nodes.filter((n) => n.branch === b.branch).map((n) => n.id)));
      scene.add(group);
      const from = old.get(b.branch) ?? null;
      if (from) group.position.copy(from);
      return { branch: b.branch, f, band: b, depth, mid, group, glass, rim, bar, laneRules, gridLines, tag, tagObj, laneTags, laneObjs, from };
    });

    // the year axis
    for (const o of [...axis.children]) {
      o.element?.remove();
      axis.remove(o);
    }
    yearTags = V.years.map((yr) => {
      const s = document.createElement('span');
      s.className = 'a3-year';
      s.textContent = String(yr);
      const o = new CSS2DObject(s);
      o.position.set(V.x.get(yr) + G.MARK_X - V.W / 2, 0, 0);
      o.center.set(0.5, 0);
      axis.add(o);
      return { yr, el: s, o };
    });
    paint();
  }

  // ------------------------------------------------------------- placing
  const P = new THREE.Vector3();
  const Q = new THREE.Vector3();
  const C1 = new THREE.Vector3();
  const C2 = new THREE.Vector3();
  const A0 = new THREE.Vector3();
  const A1 = new THREE.Vector3();
  const B1 = new THREE.Vector3();
  const B2 = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const OFF = new THREE.Vector3(); // onFloor's own scratch: callers may pass tmp as `out`
  const bez = (p0, c1, c2, p1, t, out) => {
    const u = 1 - t;
    return out
      .copy(p0)
      .multiplyScalar(u * u * u)
      .addScaledVector(c1, 3 * u * u * t)
      .addScaledVector(c2, 3 * u * t * t)
      .addScaledVector(p1, t * t * t);
  };

  const floorY = (f) => ((F - 1) / 2 - f) * FY;
  const zScale = (f) => lerp(1, ZUP, tFloor(f));
  // where a floor sits now: flat in its band, or raised onto its level
  function floorPos(f, out) {
    const fl = floors[f];
    const t = tFloor(f);
    const z = fl.mid - V.H / 2;
    return out.set(0, t * floorY(f), lerp(z, z * SPREAD, t));
  }
  // a point of the atlas (content units) on its work's floor
  function onFloor(w, x, y, out) {
    floorPos(w.f, out);
    return out.add(OFF.set(x - V.W / 2, 0, (y - floors[w.f].mid) * zScale(w.f)));
  }
  function beadPos(w, out) {
    onFloor(w, w.cx + G.MARK_X, w.cy, out);
    out.y += LIFT * tFloor(w.f);
    return out;
  }

  // a re-layout glides: everything starts from where it was drawn
  let relayout = null; // { t0, dur }
  const relayoutK = () => (relayout ? easeInOut(clamp((performance.now() - relayout.t0) / relayout.dur, 0, 1)) : 1);

  const m4 = new THREE.Matrix4();
  const qIdentity = new THREE.Quaternion();
  const sc = new THREE.Vector3();

  function place(now = performance.now()) {
    if (!V) return;
    const k = relayoutK();
    for (const fl of floors) {
      floorPos(fl.f, tmp);
      if (fl.from && k < 1) fl.group.position.lerpVectors(fl.from, tmp, k);
      else fl.group.position.copy(tmp);
      fl.group.scale.z = zScale(fl.f);
      // flat, the names sit where the atlas writes its captions: a fixed
      // number of pixels in from the chart's left edge
      const u = smooth(0, 0.5, tFloor(fl.f));
      fl.tagObj.position.x = -V.W / 2 + lerp(14 / flatK, 12, u);
      for (const o of fl.laneObjs) o.position.x = -V.W / 2 + lerp(20 / flatK, 22, u);
    }
    // the axis follows the lowest floor's front edge
    if (F) {
      const low = floors[F - 1];
      const t = tFloor(F - 1);
      axis.position.set(0, low.group.position.y - 2, low.group.position.z + (low.depth / 2) * low.group.scale.z + 18);
      axis.visible = t > 0.35;
      for (const y of yearTags) y.el.style.opacity = String(smooth(0.35, 0.8, t));
    }
    // works: capsules on the flat map, beads on the floors
    let anyText = false;
    for (const w of works) {
      if (!w.shown) {
        w.group.visible = false;
        w.textObj.visible = false;
        capAttr.state.setX(w.i, 0);
        continue;
      }
      const c = beadOf(w.f);
      beadPos(w, tmp);
      if (w.from && k < 1) w.group.position.lerpVectors(w.from, tmp, k);
      else w.group.position.copy(tmp);
      const a = w.a;
      const s = c * (a < 1 ? easeOutBack(a) : 1);
      w.group.visible = s > 0.01;
      w.group.scale.setScalar(Math.max(0.001, s));
      // the capsule shrinks toward its mark as it fades into the bead
      const width = lerp(w.w, G.CAP_H, smooth(0, 0.6, c));
      onFloor(w, w.cx + width / 2, w.cy, P);
      if (w.from && k < 1) P.add(tmp.subVectors(w.group.position, beadPos(w, Q)));
      P.y += 0.5;
      m4.compose(P, qIdentity, sc.set(width, 1, G.CAP_H));
      caps.setMatrixAt(w.i, m4);
      capAttr.size.setXY(w.i, width, G.CAP_H);
      const capA = (1 - smooth(0.05, 0.5, c)) * a * w.alpha;
      capAttr.state.setXY(w.i, capA, w.emph);
      capAttr.info.setZ(w.i, w.n.hasPost && c < 0.02 ? 1 : 0);
      // the name inside the capsule fades first
      const textA = (1 - smooth(0, 0.28, c)) * a * w.alpha;
      w.textObj.visible = textA > 0.01;
      if (w.textObj.visible) {
        onFloor(w, w.cx + G.TEXT_X, w.cy, w.textObj.position);
        if (w.from && k < 1) w.textObj.position.add(tmp.subVectors(w.group.position, beadPos(w, Q)));
        w.text.style.opacity = String(textA);
        anyText = true;
      }
    }
    caps.instanceMatrix.needsUpdate = true;
    capAttr.size.needsUpdate = true;
    capAttr.state.needsUpdate = true;
    capAttr.info.needsUpdate = true;
    caps.visible = works.some((w) => w.shown && beadOf(w.f) < 0.5);
    if (anyText) labels.domElement.style.setProperty('--s', String(pxPerUnit()));

    // relations: the atlas's own curve on the flat map, arcs and bridges above
    for (const r of relations) {
      const s = workById.get(r.e.source);
      const t = workById.get(r.e.target);
      if (!s.shown || !t.shown) continue;
      const u = (beadOf(s.f) + beadOf(t.f)) / 2;
      // the flat curve, exactly as the atlas draws it
      const sameYear = s.n.year === t.n.year;
      if (sameYear) {
        const dir = t.cy > s.cy ? 1 : -1;
        const y0 = s.cy + (dir * G.CAP_H) / 2;
        const y1 = t.cy - dir * (G.CAP_H / 2 + 2);
        const bow = Math.min(46, 16 + Math.abs(t.cy - s.cy) * 0.2);
        onFloor(s, s.cx + G.MARK_X, y0, A0);
        onFloor(t, t.cx + G.MARK_X, y1, A1);
        B1.copy(A0).add(tmp.set(-bow, 0, dir * 10));
        B2.copy(A1).add(tmp.set(-bow, 0, -dir * 10));
      } else {
        const x0 = s.cx + s.w;
        const x1 = t.cx - 2;
        const dx = Math.max(14, (x1 - x0) * 0.5);
        onFloor(s, x0, s.cy, A0);
        onFloor(t, x1, t.cy, A1);
        B1.copy(A0).add(tmp.set(dx, 0, 0));
        B2.copy(A1).add(tmp.set(-dx, 0, 0));
      }
      // … and the same relation in the air
      P.copy(s.group.position);
      Q.copy(t.group.position);
      if (!r.bridge) {
        const dist = P.distanceTo(Q);
        const h = Math.min(70, 10 + dist * 0.12);
        C1.copy(P).lerp(Q, 0.25);
        C2.copy(P).lerp(Q, 0.75);
        C1.y = Math.max(C1.y, P.y) + h;
        C2.y = Math.max(C2.y, Q.y) + h;
      } else {
        const dy = Q.y - P.y;
        const bow = 44 * Math.min(1, Math.abs(dy) / FY);
        C1.set(P.x + (Q.x - P.x) * 0.2, P.y + dy * 0.55, P.z + bow);
        C2.set(Q.x - (Q.x - P.x) * 0.2, Q.y - dy * 0.55, Q.z + bow);
      }
      A0.lerp(P, u);
      A1.lerp(Q, u);
      B1.lerp(C1, u);
      B2.lerp(C2, u);
      for (let i = 0; i < SAMPLES; i++) {
        bez(A0, B1, B2, A1, i / (SAMPLES - 1), tmp);
        posArr[i * 3] = tmp.x;
        posArr[i * 3 + 1] = tmp.y;
        posArr[i * 3 + 2] = tmp.z;
      }
      writeLine(r);
      r.geo.instanceCount = Math.round(clamp(r.d, 0, 1) * (SAMPLES - 1));
    }

    // the "now" sheet spans the floors at the time machine's year
    if (F) {
      const top = floors[0].group.position.y;
      const low = floors[F - 1].group.position.y;
      const z0 = Math.min(...floors.map((fl) => fl.group.position.z - (fl.depth / 2) * fl.group.scale.z)) - 30;
      const z1 = Math.max(...floors.map((fl) => fl.group.position.z + (fl.depth / 2) * fl.group.scale.z)) + 30;
      const tl = tFloor(F - 1);
      const height = Math.max(1, top - low + 120 * tl);
      sheet.scale.set(1, height, z1 - z0);
      sheet.position.set(sheetX, (top + low) / 2 + 30 * tl, (z0 + z1) / 2);
      sheetRim.scale.copy(sheet.scale);
      sheetRim.position.copy(sheet.position);
    }
    invalidate();
  }

  // pixels per world unit at the camera's target — the atlas's zoom, when flat
  function pxPerUnit() {
    const d = camera.position.distanceTo(controls.target);
    return host.clientHeight / (2 * d * TAN);
  }

  // ------------------------------------------------------------- painting
  function paint() {
    const dark = !isLight();
    const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    const grid = cssColor('--grid');
    for (const fl of floors) {
      const c = branchColor(fl.branch);
      fl.glass.material.color.copy(c);
      fl.rim.material.color.copy(c);
      fl.bar.material.color.copy(c);
      fl.laneRules.material.color.copy(grid.color);
      fl.gridLines.material.color.copy(grid.color);
      fl.tag.style.setProperty('--bc', `#${c.getHexString(THREE.SRGBColorSpace)}`);
    }
    const surface = cssColor('--surface');
    const ring = cssColor('--ring-strong');
    capMat.uniforms.uFill.value.copy(surface.color);
    capMat.uniforms.uStroke.value.set(ring.color.r, ring.color.g, ring.color.b, ring.alpha);
    capMat.uniforms.uInk.value.copy(cssColor('--ink').color);
    capMat.uniforms.uAward.value.copy(cssColor('--award').color);
    for (const w of works) {
      const c = branchColor(w.n.branch);
      w.core.material.color.copy(c);
      w.glow.material.color.copy(c);
      w.glow.material.blending = blending;
      w.glow.material.needsUpdate = true;
      if (w.ring) w.ring.material.color.copy(cssColor('--award').color);
      capAttr.color.setXYZ(w.i, c.r, c.g, c.b);
    }
    capAttr.color.needsUpdate = true;
    // within a branch: the atlas's own ink for each kind of debt;
    // between branches: from one branch's colour into the other's
    const red = cssColor('--danger').color;
    const ink = { fixes: cssColor('--ink-2').color, other: cssColor('--muted').color };
    const cols = new Float32Array(SAMPLES * 3);
    const c = new THREE.Color();
    for (const r of relations) {
      const typeColor = r.e.type === 'challenges' ? red : r.e.type === 'fixes' ? ink.fixes : ink.other;
      const a = r.bridge && r.e.type !== 'challenges' ? branchColor(nodeById.get(r.e.source).branch) : typeColor;
      const b = r.bridge && r.e.type !== 'challenges' ? branchColor(nodeById.get(r.e.target).branch) : typeColor;
      for (let i = 0; i < SAMPLES; i++) {
        c.lerpColors(a, b, i / (SAMPLES - 1));
        cols[i * 3] = c.r;
        cols[i * 3 + 1] = c.g;
        cols[i * 3 + 2] = c.b;
      }
      r.geo.setColors(cols);
    }
    sheetMat.color.copy(dark ? cssColor('--ink').color : cssColor('--accent').color);
    sheetMat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    sheetMat.needsUpdate = true;
    sheetRim.material.color.copy(dark ? cssColor('--ink').color : cssColor('--accent').color);
    flowMat.color.copy(dark ? new THREE.Color(0xffffff) : cssColor('--ink').color);
    applyFocus();
  }

  // ------------------------------------------------------------- emphasis
  let hoverFloor = null;
  const kindOn = (n) => !kinds || kinds.has(n.kind);
  const typeOn = (e) => !types || types.has(e.type);

  // what to show and how strongly: the atlas's focus (hover, edge, lineage),
  // its kind and relation filters, "bridges only", and the time machine
  function applyFocus() {
    const f = focus;
    const id = f.mode === 'hover' || f.mode === 'lineage' ? f.id : null;
    const rel = f.mode === 'edge' ? relByKey.get(f.edge.key) : null;
    const named = new Set();
    if (rel) named.add(rel.e.source).add(rel.e.target);
    if (id) {
      named.add(id);
      for (const o of direct.get(id) ?? []) named.add(o);
      // a small lineage is named in full
      if (f.mode === 'lineage') {
        const lit = [...f.roles.entries()].filter(([, r]) => r !== 'dim');
        if (lit.length <= 14) for (const [o] of lit) named.add(o);
      }
    }
    for (const w of works) {
      if (!w.shown) continue;
      const role = f.roles?.get(w.n.id) ?? null;
      let alpha;
      let emph = 0;
      if (rel) alpha = named.has(w.n.id) ? 1 : 0.1;
      else if (role) {
        alpha = role === 'dim' ? 0.1 : role === 'peer' ? 0.75 : 1;
        emph = role === 'sel' ? 2 : role === 'dim' ? 0 : 1;
      } else alpha = kindOn(w.n) && (!bridgesOnly || bridgeEnds.has(w.n.id)) ? 1 : 0.16;
      w.alpha = alpha;
      w.emph = emph;
      const on = alpha >= 0.7;
      w.core.material.opacity = alpha;
      w.glow.material.opacity = (isLight() ? 0.42 : 0.55) * (on ? (rel && on ? 1.15 : 1) : 0.2);
      if (w.ring) w.ring.material.opacity = on ? 1 : 0.15;
      w.labelObj.visible = named.has(w.n.id) && w.born;
      w.label.classList.toggle('is-self', w.n.id === id);
    }
    for (const r of relations) {
      const { e } = r;
      const s = workById.get(e.source);
      const t = workById.get(e.target);
      const touches = id && (e.source === id || e.target === id);
      r.on = Boolean(
        s.shown &&
          t.shown &&
          (r === rel || (typeOn(e) && (!bridgesOnly || r.bridge || touches))) &&
          (r.alive || r.d > 0),
      );
      r.line.visible = r.on && r.d > 0;
      if (!r.on) continue;
      const role = f.edgeRoles?.get(e.key) ?? null;
      let opacity;
      let width;
      if (rel) {
        opacity = r === rel ? 1 : 0.05;
        width = r === rel ? 3.4 : 1;
      } else if (role) {
        opacity = role === 'direct' ? 1 : role === 'lit' ? 0.7 : 0.035;
        width = role === 'direct' ? 2.6 : role === 'lit' ? 1.8 : 1;
      } else {
        const off = kinds && !kindOn(s.n) && !kindOn(t.n);
        opacity = off ? 0.05 : r.bridge ? (bridgesOnly ? 0.9 : 0.72) : 0.3;
        width = r.bridge ? (bridgesOnly ? 2.4 : 1.9) : 1.25;
      }
      r.opacity3 = opacity;
      r.width3 = width;
      // the flat map's look, for the moments the map lies flat
      const m = data.edgeTypes[e.type];
      r.opacity2 = role === 'dim' || (rel && r !== rel) ? 0.04 : role === 'direct' || r === rel ? 1 : role === 'lit' ? 0.72 : r.bridge ? 0.08 : kinds && !kindOn(s.n) && !kindOn(t.n) ? 0.05 : 0.5;
      r.width2 = m.width * (role === 'direct' || r === rel ? 1.5 : 1);
    }
    flowRel = rel ?? null;
    paintFloors();
    styleLines();
    invalidate();
  }

  // line opacity and width blend between the flat look and the floors' look
  function styleLines() {
    const s = pxPerUnit();
    for (const r of relations) {
      if (!r.on) continue;
      const sw = workById.get(r.e.source);
      const tw = workById.get(r.e.target);
      const u = (beadOf(sw.f) + beadOf(tw.f)) / 2;
      const ends = Math.min(sw.a, tw.a);
      r.mat.opacity = lerp(r.opacity2 ?? 0.5, r.opacity3 ?? 0.3, u) * ends;
      r.mat.linewidth = lerp((r.width2 ?? 1.4) * s, r.width3 ?? 1.2, u);
    }
  }

  function paintFloors() {
    const dark = !isLight();
    const lit = new Set();
    if (focus.mode === 'lineage' || focus.mode === 'hover') lit.add(nodeById.get(focus.id)?.branch);
    if (focus.mode === 'edge') lit.add(nodeById.get(focus.edge.source).branch).add(nodeById.get(focus.edge.target).branch);
    for (const fl of floors) {
      const t = tFloor(fl.f);
      fl.glass.material.opacity = lerp(0.045, dark ? 0.075 : 0.09, t);
      fl.rim.material.opacity = lerp(0.13, dark ? 0.5 : 0.65, t);
      fl.bar.material.opacity = lerp(1, 0.85, t);
      fl.laneRules.material.opacity = lerp(1, 0.5, t);
      fl.gridLines.material.opacity = lerp(0.45, dark ? 0.2 : 0.3, t);
      const on = lit.has(fl.branch) || hoverFloor === fl.branch;
      fl.laneTags.forEach((tag) => tag.classList.toggle('is-on', on || t < 0.3));
      fl.tag.classList.toggle('is-dim', Boolean(hoverFloor && hoverFloor !== fl.branch));
    }
    labels.domElement.classList.toggle('is-flat', T < 0.3);
  }

  // ------------------------------------------------------------- the flow
  let flowRel = null;
  function placeFlow(now) {
    const r = flowRel;
    if (!r || !r.line.visible || reducedMotion() || T < 0.5) {
      flow.visible = false;
      return false;
    }
    if (flow.geometry !== r.geo) flow.geometry = r.geo;
    flowMat.dashOffset = -(now / 1000) * 110;
    flowMat.opacity = isLight() ? 0.9 : 0.85;
    flow.visible = true;
    return true;
  }

  // ------------------------------------------------------------- lens
  // The inspector (a drawer on a desk, a sheet on a phone) covers part of the
  // stage; the picture slides out from under it by shifting the lens — the
  // projection itself, so nothing is stretched and the canvas never resizes.
  const lens = { x: 0, y: 0, tx: 0, ty: 0 };
  function lensOn(cam, lx, ly) {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    cam.updateProjectionMatrix();
    const e = cam.projectionMatrix.elements;
    e[8] += (2 * lx) / w;
    e[9] -= (2 * ly) / h;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
  const applyLens = () => {
    lensOn(camera, lens.x, lens.y);
    invalidate();
  };
  // the part of the frame left visible, in normalized device coordinates
  function visibleNdc(lx = lens.tx, ly = lens.ty) {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    return { x0: -1, x1: 1 - (4 * lx) / w, y0: -1 + (4 * ly) / h, y1: 1 };
  }

  // ------------------------------------------------------------- camera
  const target = new THREE.Vector3();
  const spherical = new THREE.Spherical();
  const probe = new THREE.PerspectiveCamera();
  // the smallest distance at which every given point lands inside the visible
  // part of the frame — measured on a probe camera: fitting never moves the
  // real one. (Points, not a box: the floors are terraced, a box around them
  // is mostly air.)
  function fit(points, phi, theta, mx = 0.9, my = mx) {
    probe.fov = camera.fov;
    probe.aspect = camera.aspect;
    probe.near = camera.near;
    probe.far = camera.far;
    lensOn(probe, lens.tx, lens.ty);
    const v = visibleNdc();
    const cx = (v.x0 + v.x1) / 2;
    const cy = (v.y0 + v.y1) / 2;
    const hx = ((v.x1 - v.x0) / 2) * mx;
    const hy = ((v.y1 - v.y0) / 2) * my;
    const center = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
    const corners = points;
    const p = new THREE.Vector3();
    const s = new THREE.Spherical();
    const fits = (r) => {
      probe.position.setFromSpherical(s.set(r, phi, theta)).add(center);
      probe.lookAt(center);
      probe.updateMatrixWorld();
      return corners.every((c) => {
        p.copy(c).project(probe);
        return Math.abs(p.x - cx) <= hx && Math.abs(p.y - cy) <= hy && p.z < 1;
      });
    };
    let lo = 40;
    let hi = 60000;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return { r: hi, phi, theta, tx: center.x, ty: center.y, tz: center.z };
  }
  const narrow = () => camera.aspect < 1.05;
  // home: a three-quarter look at the floors from the recent end, where the
  // field is densest (a phone looks along the building, so it fills the height)
  const home = () => (narrow() ? { phi: 1.0, theta: 1.2 } : { phi: 0.98, theta: 0.3 });
  // what must be in frame once the floors are up (at T = 1, whatever T is
  // now): the given works with room for their names, or every floor's corners
  function upPoints(ids = null) {
    const pts = [];
    const keepT = T;
    T = 1;
    if (ids) {
      for (const id of ids) {
        const w = workById.get(id);
        if (!w?.shown) continue;
        beadPos(w, tmp);
        for (const [dx, dy, dz] of [[-40, -20, -30], [70, 40, 30]]) pts.push(new THREE.Vector3(tmp.x + dx, tmp.y + dy, tmp.z + dz));
      }
    } else {
      for (const fl of floors) {
        floorPos(fl.f, tmp);
        const d = (fl.depth / 2) * ZUP;
        for (const x of [-V.W / 2, V.W / 2])
          for (const [y, z] of [[tmp.y - 6, tmp.z - d], [tmp.y + 40, tmp.z - d], [tmp.y - 6, tmp.z + d + 34]]) pts.push(new THREE.Vector3(x, y, z));
      }
    }
    T = keepT;
    return pts;
  }
  const homeView = () => {
    const h = home();
    const [mx, my] = narrow() ? [0.96, 0.9] : [0.95, 0.88];
    return fit(upPoints(), h.phi, h.theta, mx, my);
  };
  // straight down over a point of the atlas, at the atlas's own scale
  function flatView({ cx, cy, k }) {
    const r = host.clientHeight / (2 * k * TAN);
    return { r, phi: TOP, theta: 0, tx: cx - V.W / 2, ty: 0, tz: cy - V.H / 2 };
  }
  function setCamera(v) {
    target.set(v.tx, v.ty, v.tz);
    spherical.set(v.r, v.phi, v.theta);
    camera.position.setFromSpherical(spherical).add(target);
    camera.lookAt(target);
    controls.target.copy(target);
  }
  // the camera as it is right now, as an orbit around the controls' target
  function orbitNow() {
    const s = new THREE.Spherical().setFromVector3(tmp.copy(camera.position).sub(controls.target));
    return { r: s.radius, phi: s.phi, theta: s.theta, tx: controls.target.x, ty: controls.target.y, tz: controls.target.z };
  }
  // drop whatever spin, pan or zoom the reader's last gesture still carries
  // (damping keeps it going for a while), so a scripted move starts clean
  function stillControls() {
    controls._sphericalDelta?.set(0, 0, 0);
    controls._panOffset?.set(0, 0, 0);
    if ('_scale' in controls) controls._scale = 1;
  }

  // ------------------------------------------------------------- motion
  let anim = null; // { from, to, t0, dur, Tfrom, Tto, cam, locked, done }
  let queued = null; // a move asked for while a locked one (lifting, laying down) runs
  let held = false; // the reader has taken hold of the camera
  function move(to, opts = {}) {
    const { Tto = T, dur = 1200, locked = false, done = null, instant = false } = opts;
    // nothing interrupts the lift or the lay-down: any other move waits its
    // turn (a framing passes its target as a function, worked out again then,
    // from the finished picture)
    if (anim?.locked && !locked) {
      queued = () => move(to, opts);
      return;
    }
    if (typeof to === 'function') to = to();
    const from = orbitNow();
    stopSway();
    stillControls();
    follow = false;
    const dest = { ...to, theta: shortWay(from.theta, to.theta) };
    if (instant || reducedMotion() || !active) {
      anim = null;
      T = Tto;
      setCamera(dest);
      place();
      applyFocus();
      done?.();
      return;
    }
    // a long way round takes a little longer, so no turn ever feels hurried
    const turn = Math.abs(wrapAngle(dest.theta - from.theta));
    anim = { from, to: dest, t0: performance.now(), dur: dur + 450 * (turn / Math.PI), Tfrom: T, Tto, cam: true, locked, done };
    controls.enabled = !locked;
  }
  function stepAnim(now) {
    const k = anim.hold ?? clamp((now - anim.t0) / anim.dur, 0, 1);
    if (anim.Tfrom !== anim.Tto) {
      T = lerp(anim.Tfrom, anim.Tto, k);
      needPlace = true;
      needFocus = true;
    }
    if (anim.cam) {
      const e = easeInOut(k);
      const { from, to } = anim;
      setCamera({
        r: Math.exp(lerp(Math.log(from.r), Math.log(to.r), e)),
        phi: lerp(from.phi, to.phi, e),
        theta: lerp(from.theta, to.theta, e),
        tx: lerp(from.tx, to.tx, e),
        ty: lerp(from.ty, to.ty, e),
        tz: lerp(from.tz, to.tz, e),
      });
      styleLines();
    }
    if (k >= 1) {
      const done = anim.done;
      anim = null;
      controls.enabled = active && T > 0.5;
      done?.();
      const next = queued;
      queued = null;
      if (next && active) next();
    }
  }

  // an idle building sways a little, until the reader takes hold of it
  let sway = null;
  function startSway() {
    if (reducedMotion() || held || !active) return;
    const o = orbitNow();
    sway = { t0: performance.now(), ...o };
  }
  function stopSway() {
    sway = null;
  }
  function stepSway(now) {
    const t = (now - sway.t0) / 1000;
    const s = new THREE.Spherical(sway.r, sway.phi, sway.theta + Math.sin(t * 0.3) * 0.16);
    camera.position.setFromSpherical(s).add(controls.target);
    camera.lookAt(controls.target);
  }

  // playing the years: the camera travels with the "now"
  let follow = false;
  let followHome = null;
  function stepFollow() {
    const o = orbitNow();
    const reach = V.W * 0.36; // never look past either end of the map
    const want = { r: followHome.r * 0.84, phi: clamp(o.phi, 0.82, 1.12), tx: clamp(sheetX, -reach, reach) };
    setCamera({
      r: lerp(o.r, want.r, 0.03),
      phi: lerp(o.phi, want.phi, 0.03),
      theta: o.theta,
      tx: lerp(o.tx, want.tx, 0.045),
      ty: lerp(o.ty, followHome.ty, 0.03),
      tz: lerp(o.tz, followHome.tz, 0.03),
    });
  }

  const takeHold = () => {
    held = true;
    stopSway();
    if (follow) follow = false;
  };
  renderer.domElement.addEventListener('pointerenter', stopSway);
  // grabbing the view in the middle of a glide takes the camera back at
  // once (captured on the way down, so the controls see the same press)
  const grab = () => {
    if (!controls.enabled) return;
    takeHold();
    hooks.hold?.();
    if (anim?.cam && !anim.locked) {
      anim.cam = false;
      stillControls();
    }
  };
  host.addEventListener('pointerdown', grab, { capture: true });
  // a plain wheel scrolls the page; ⌘/Ctrl-wheel (and trackpad pinch) zooms
  host.addEventListener(
    'wheel',
    (ev) => {
      if (!(ev.ctrlKey || ev.metaKey)) {
        ev.stopPropagation();
        return;
      }
      grab();
    },
    { capture: true, passive: true },
  );
  controls.addEventListener('change', () => {
    styleLines();
    invalidate();
  });

  // a click focuses the stage too; its focus ring is for keyboard arrivals
  host.addEventListener('pointerdown', () => (host.dataset.pointer = ''));
  host.addEventListener('blur', () => delete host.dataset.pointer);

  // the keyboard turns and tilts the building when the stage has focus
  host.addEventListener('keydown', (ev) => {
    if (!active || T < 0.5 || anim?.locked || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const o = orbitNow();
    const step = { ArrowLeft: [0.2, 0], ArrowRight: [-0.2, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[ev.key];
    let to = null;
    if (step) to = { ...o, theta: o.theta + step[0], phi: clamp(o.phi + step[1], 0.15, Math.PI * 0.49) };
    else if (ev.key === '+' || ev.key === '=') to = { ...o, r: o.r / 1.25 };
    else if (ev.key === '-' || ev.key === '_') to = { ...o, r: o.r * 1.25 };
    if (!to) return;
    ev.preventDefault();
    takeHold();
    move(to, { dur: 260 });
  });

  // ------------------------------------------------------------- picking
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line2 = { threshold: 9 }; // px of slack around a relation
  const pointer = new THREE.Vector2();
  // works first (they sit on top); then relations, as the filters show them
  function pick(ev) {
    if (T < 0.5) return null;
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = works.filter((w) => w.shown && w.group.visible && w.a > 0.5).map((w) => w.hit);
    // stacked works sit close: of every bead the ray grazes, take the one
    // whose centre passes nearest the pointer — not merely the first in line
    const near = raycaster
      .intersectObjects(hits, false)
      .map((h) => ({ id: h.object.userData.id, d: raycaster.ray.distanceSqToPoint(h.object.getWorldPosition(tmp)) }))
      .sort((a, b) => a.d - b.d)[0];
    if (near) return { id: near.id };
    const lines = relations.filter((x) => x.line.visible && x.d > 0.98).map((x) => x.line);
    const l = raycaster.intersectObjects(lines, false)[0];
    return l ? { edge: l.object.userData.rel.e } : null;
  }

  let pending = null;
  let hoverKey = null;
  const keyOf = (hit) => (hit?.id ? `n:${hit.id}` : hit?.edge ? `e:${hit.edge.key}` : null);
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'touch') return;
    pending = ev;
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    pending = null;
    if (hoverKey) {
      hoverKey = null;
      renderer.domElement.style.cursor = '';
      hooks.hover(null);
    }
  });
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (ev) => (down = { x: ev.clientX, y: ev.clientY }));
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5 || T < 0.5) return;
    down = null;
    hooks.click(pick(ev), ev);
  });

  // ------------------------------------------------------------- the loop
  let visible = false;
  let raf = 0;
  const overlaps = (a, b, pad = 6) =>
    a.width > 0 && b.width > 0 && a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + pad && b.top < a.bottom + pad;
  // Names give way to one another, in one pass — every measurement first,
  // then every change, so the page lays out once. Floor names stick to the
  // frame's left edge (as the atlas's captions do) and step up out of each
  // other's way; names over beads keep their places by priority (the work in
  // focus, the ends of the relation in focus, then the nearest); floor names
  // give way to those; lane names come last (one cut by the frame's edge
  // says nothing); the years give way to all of them, the time machine's
  // year keeping its own place.
  function cull() {
    for (const fl of floors) fl.tag.style.translate = '';
    // — measure
    const edge = host.getBoundingClientRect().left;
    const ends = focus.mode === 'edge' ? new Set([focus.edge.source, focus.edge.target]) : null;
    const tags = floors.map((fl) => ({ fl, r: fl.tag.getBoundingClientRect() }));
    const names = works
      .filter((w) => w.shown && w.group.visible && w.labelObj.visible)
      .map((w) => ({
        el: w.label,
        r: w.label.getBoundingClientRect(),
        pri: w.label.classList.contains('is-self') ? 0 : ends?.has(w.n.id) ? 1 : 2,
        d: camera.position.distanceToSquared(w.group.position),
      }));
    const lanes = floors.flatMap((fl) =>
      fl.laneTags.filter((el) => el.classList.contains('is-on')).map((el) => ({ el, r: el.getBoundingClientRect() })),
    );
    const years = axis.visible ? yearTags.map((y) => ({ y, r: y.el.getBoundingClientRect() })) : [];
    // — decide
    const boxes = tags
      .filter((t) => t.r.width > 0)
      .map((t) => {
        const dx = t.r.left < edge + 8 ? edge + 8 - t.r.left : 0;
        return { fl: t.fl, dx, dy: 0, left: t.r.left + dx, right: t.r.right + dx, top: t.r.top, bottom: t.r.bottom, width: t.r.width };
      })
      .sort((a, b) => b.bottom - a.bottom);
    const stacked = [];
    for (const b of boxes) {
      for (let guard = 0; guard < 8; guard++) {
        const hit = stacked.find((p) => b.left < p.right + 4 && p.left < b.right + 4 && b.top + b.dy < p.bottom + 3 && p.top < b.bottom + b.dy + 3);
        if (!hit) break;
        b.dy = hit.top - 3 - b.bottom;
      }
      stacked.push({ ...b, top: b.top + b.dy, bottom: b.bottom + b.dy });
    }
    names.sort((a, b) => a.pri - b.pri || a.d - b.d);
    const kept = [];
    for (const it of names) {
      it.ok = it.r.width > 0 && !kept.some((k) => overlaps(it.r, k, 2));
      if (it.ok) kept.push(it.r);
    }
    const taken = [...kept];
    for (const b of stacked) {
      b.ok = !kept.some((k) => overlaps(b, k, 2));
      if (b.ok) taken.push(b);
    }
    for (const it of lanes) {
      it.ok = it.r.width > 0 && it.r.left >= edge + 4 && !taken.some((k) => overlaps(it.r, k, 3));
      if (it.ok) taken.push(it.r);
    }
    const now = yearActive ? V.years[yearIdx] : null;
    years.sort((a, b) => (b.y.yr === now) - (a.y.yr === now) || a.r.left - b.r.left);
    const blockers = [...kept, ...stacked.filter((b) => b.ok)];
    const keptYears = [];
    for (const it of years) {
      it.ok = !blockers.some((b) => overlaps(it.r, b)) && !keptYears.some((k) => overlaps(it.r, k));
      if (it.ok) keptYears.push(it.r);
    }
    // — change
    for (const b of stacked) {
      b.fl.tag.style.translate = b.dx || b.dy ? `${Math.round(b.dx)}px ${Math.round(b.dy)}px` : '';
      b.fl.tag.style.visibility = b.ok ? '' : 'hidden';
    }
    for (const it of names) it.el.style.visibility = it.ok ? '' : 'hidden';
    for (const it of lanes) it.el.style.visibility = it.ok ? '' : 'hidden';
    for (const it of years) it.y.el.style.visibility = it.ok ? '' : 'hidden';
  }

  let lastStep = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!visible || !active || !V) return;
    if (pending) {
      const ev = pending;
      pending = null;
      const hit = pick(ev);
      const key = keyOf(hit);
      if (key !== hoverKey) {
        hoverKey = key;
        renderer.domElement.style.cursor = key ? 'pointer' : '';
        hooks.hover(hit, ev);
      } else if (key) hooks.move?.(ev);
    }
    // the time machine: appearing works and relations drawing themselves
    const growing = stepGrowth(now);
    const flowing = placeFlow(now);
    if (anim) stepAnim(now);
    else if (follow) stepFollow();
    else if (sway) stepSway(now);
    // the lens glides when the inspector opens or closes
    let lensing = false;
    if (Math.abs(lens.tx - lens.x) > 0.5 || Math.abs(lens.ty - lens.y) > 0.5) {
      lens.x += (lens.tx - lens.x) * 0.18;
      lens.y += (lens.ty - lens.y) * 0.18;
      lensing = true;
    } else if (lens.x !== lens.tx || lens.y !== lens.ty) {
      lens.x = lens.tx;
      lens.y = lens.ty;
      lensing = true;
    }
    if (lensing) applyLens();
    // the now sheet slides to its year and fades with the time machine
    // (a close-up — a tour stop — keeps it out of the picture)
    const wantA = yearActive && T > 0.5 && !quietYear ? 1 : 0;
    const sheetMoving = Math.abs(sheetA - wantA) > 0.01 || Math.abs(sheetX - sheetTarget) > 0.5;
    if (sheetMoving) {
      if (reducedMotion()) {
        sheetA = wantA;
        sheetX = sheetTarget;
      } else {
        sheetA += (wantA - sheetA) * 0.12;
        sheetX += (sheetTarget - sheetX) * 0.14;
        if (Math.abs(sheetA - wantA) <= 0.01) sheetA = wantA;
      }
      needPlace = true;
    }
    sheet.visible = sheetA > 0.01;
    sheetRim.visible = sheet.visible;
    sheetMat.opacity = sheetA * (isLight() ? 0.07 : 0.075);
    sheetRim.material.opacity = sheetA * (isLight() ? 0.45 : 0.3);
    nowTag.style.opacity = String(sheetA * (quietYear ? 0 : 1));
    nowTag.style.translate = `${-2 * lens.x}px 0`;
    if (relayout && now - relayout.t0 <= relayout.dur + 30) needPlace = true;
    else if (relayout) {
      relayout = null;
      for (const w of works) w.from = null;
      for (const fl of floors) fl.from = null;
      needPlace = true;
    }
    // everything above only asked: lay the scene out once for this frame
    if (needPlace) {
      needPlace = false;
      place(now);
    }
    if (needFocus) {
      needFocus = false;
      applyFocus();
    }
    // while a move, the sway or the follow drives the camera, the controls sit out
    const moved = anim?.cam || sway || follow ? false : controls.update();
    if (anim || sway || follow || moved || flowing || growing || lensing || sheetMoving || dirty) {
      renderer.render(scene, camera);
      labels.render(scene, camera);
      if (T > 0.3 && (cullSoon || now - lastStep > 60)) {
        cull();
        cullSoon = false;
        lastStep = now;
      }
      dirty = false;
    }
  }
  let needPlace = false;
  let needFocus = false;
  let cullSoon = false;

  // ------------------------------------------------------------- the years
  let sheetTarget = 0;
  function stepGrowth(now) {
    let busy = false;
    for (const w of works) {
      if (w.a === w.aTo) continue;
      const k = clamp((now - w.aT0) / w.aDur, 0, 1);
      w.a = k >= 1 ? w.aTo : lerp(w.aFrom, w.aTo, w.aTo > w.aFrom ? easeOut(k) : k);
      busy = true;
    }
    for (const r of relations) {
      if (r.d === r.dTo) continue;
      const k = clamp((now - r.dT0) / r.dDur, 0, 1);
      r.d = k >= 1 ? r.dTo : lerp(r.dFrom, r.dTo, easeInOut(k));
      busy = true;
    }
    if (busy) {
      needPlace = true;
      needFocus = true;
    }
    return busy;
  }

  function setYear(idx, { playing: isPlaying = false, instant = false, quiet = false } = {}) {
    if (!V) return;
    quietYear = quiet;
    const last = V.years.length - 1;
    yearIdx = clamp(idx, 0, last);
    const wasPlaying = playing;
    playing = isPlaying;
    yearActive = yearIdx < last || isPlaying;
    const yr = V.years[yearIdx];
    const now = performance.now();
    const quick = instant || reducedMotion() || !active || T < 0.5;
    const appearAt = new Map();
    // works of the newest year come in one after another, not all at once
    const newcomers = works
      .filter((w) => w.shown && w.n.year <= yr && !w.born)
      .sort((a, b) => a.n.year - b.n.year || a.cy - b.cy);
    for (const w of works) {
      const born = w.shown && w.n.year <= yr;
      if (born === w.born) continue;
      w.born = born;
      w.aFrom = w.a;
      w.aTo = born ? 1 : 0;
      if (quick) {
        w.a = w.aTo;
        continue;
      }
      const delay = born ? Math.min(900, newcomers.indexOf(w) * 55) : 0;
      w.aT0 = now + delay;
      w.aDur = born ? 650 : 260;
      appearAt.set(w.n.id, w.aT0);
    }
    for (const r of relations) {
      const s = workById.get(r.e.source);
      const t = workById.get(r.e.target);
      const alive = s.born && t.born;
      if (alive === r.alive) continue;
      r.alive = alive;
      r.dFrom = r.d;
      r.dTo = alive ? 1 : 0;
      if (quick) {
        r.d = r.dTo;
        continue;
      }
      // a relation draws itself once its newer end has arrived
      const after = Math.max(appearAt.get(r.e.source) ?? now, appearAt.get(r.e.target) ?? now);
      r.dT0 = alive ? after + 280 : now;
      r.dDur = alive ? 700 : 200;
    }
    sheetTarget = (V.x.get(yr) ?? 0) + G.MARK_X - V.W / 2;
    if (quick && !sheetA) sheetX = sheetTarget;
    nowTag.innerHTML = `<b>${yr}</b><span>${works.filter((w) => w.born).length} ${esc(STR.worksSoFar)}</span>`;
    nowTag.classList.toggle('is-playing', isPlaying);
    for (const y of yearTags) {
      y.el.classList.toggle('is-future', y.yr > yr && yearActive);
      y.el.classList.toggle('is-now', y.yr === yr && yearActive);
    }
    // playing: the camera comes along (a press of play is a fresh request,
    // whatever the reader did to the camera before); when it stops, home
    if (isPlaying && !wasPlaying) held = false;
    if (isPlaying && !wasPlaying && active && T > 0.5 && !reducedMotion()) {
      followHome = homeView();
      follow = true;
      stopSway();
    }
    if (isPlaying && !wasPlaying) queued = null;
    if (!isPlaying && wasPlaying && follow) {
      follow = false;
      if (yearIdx === last) move(() => homeView(), { dur: 1800 });
    }
    // (hidden in 2D: nothing to lay out until the stage comes back)
    if (!active) return;
    place();
    applyFocus();
  }

  // ------------------------------------------------------------- layout
  function setLayout(view, { animate = false } = {}) {
    // the time machine keeps its YEAR — the years themselves change with the
    // branches shown, so an index would point somewhere else
    const keepYear = V && yearIdx !== Infinity ? (yearIdx >= V.years.length - 1 ? Infinity : V.years[yearIdx]) : null;
    const glide = animate && active && T > 0.5 && !reducedMotion() && V;
    if (glide) for (const w of works) w.from = w.shown ? w.group.position.clone() : null;
    V = view;
    buildFloors();
    if (!glide) for (const fl of floors) fl.from = null;
    for (const w of works) {
      const p = V.pos.get(w.n.id);
      w.shown = Boolean(p);
      if (!p) continue;
      w.cx = p.x;
      w.cy = p.y;
      w.w = V.w.get(w.n.id);
      w.f = floorOfBranch.get(w.n.branch) ?? 0;
    }
    relayout = glide ? { t0: performance.now(), dur: 700 } : null;
    if (!glide) for (const w of works) w.from = null;
    // a work coming back with its branch fades in where it belongs
    for (const w of works) if (w.shown && glide && !w.from) w.from = beadPos(w, new THREE.Vector3()).clone();
    if (keepYear !== null) {
      const i = keepYear === Infinity ? V.years.length - 1 : V.years.findLastIndex((y) => y <= keepYear);
      setYear(i === -1 ? 0 : i, { playing, instant: true, quiet: quietYear });
    }
    if (!active) return;
    place();
    applyFocus();
  }

  // ------------------------------------------------------------- framing
  // bring a set of works into the visible part of the frame, keeping the
  // reader's bearing (and tilt, within reason)
  function frameIds(ids, { phi = null, dur = 1300 } = {}) {
    if (!active || !ids.length) return;
    if (!upPoints(ids).length) return;
    held = false;
    move(
      () => {
        const o = anim?.locked ? anim.to : orbitNow();
        const v = fit(upPoints(ids), phi ?? clamp(o.phi, 0.55, 1.15), o.theta, 0.8, 0.74);
        v.r = Math.max(v.r, 520);
        return v;
      },
      { dur },
    );
  }
  // keep a work in the visible part of the frame; `center` brings it to the middle
  function ensureVisible(id, center = false) {
    const w = workById.get(id);
    if (!active || !w?.shown) return;
    // still lifting: look again once the floors are up
    if (anim?.locked) {
      queued = () => ensureVisible(id, center);
      return;
    }
    if (T < 0.5) return;
    beadPos(w, P);
    const p = P.clone().project(camera);
    const v = visibleNdc();
    const m = 0.12;
    const inside = p.z < 1 && p.x > v.x0 + m && p.x < v.x1 - m && p.y > v.y0 + m && p.y < v.y1 - m;
    if (inside && !center) return;
    const o = orbitNow();
    move({ ...o, tx: P.x, ty: P.y, tz: P.z, r: center ? Math.min(o.r, Math.max(900, homeView().r * 0.55)) : o.r }, { dur: 900 });
  }

  // ------------------------------------------------------------- size
  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    labels.setSize(w, h);
    camera.aspect = w / h;
    applyLens();
  }
  new ResizeObserver(() => {
    const before = camera.aspect;
    resize();
    if (!active || anim || !V) return;
    // the building re-frames until the reader has moved it
    if (!held && Math.abs(before - camera.aspect) > 0.02 && T > 0.5) setCamera(homeView());
    invalidate();
  }).observe(host);

  new IntersectionObserver(
    (entries) => {
      for (const entry of entries) visible = entry.isIntersecting;
      invalidate();
    },
    { threshold: 0 },
  ).observe(host);

  resize();
  raf = requestAnimationFrame(loop);

  // ------------------------------------------------------------- the API
  return {
    setLayout,
    setYear,
    // (while the atlas is flat these only remember: entering lays it all out)
    setFocus(state) {
      focus = state ?? { mode: 'none' };
      if (!active) return;
      applyFocus();
      cullSoon = true;
    },
    setFilters({ kinds: k = null, types: t = null } = {}) {
      kinds = k ? new Set(k) : null;
      types = t ? new Set(t) : null;
      if (active) applyFocus();
    },
    toggleBridges() {
      bridgesOnly = !bridgesOnly;
      applyFocus();
      return bridgesOnly;
    },
    get bridgesOnly() {
      return bridgesOnly;
    },
    // lift the flat map off the page: start exactly over what the atlas
    // showed (content point at the visible center, at its scale), end home
    enter(from, { instant = false } = {}) {
      flatK = from.k;
      active = true;
      visible = true; // (the observer reports a stage that just appeared a frame late)
      held = false;
      resize();
      T = 0;
      setCamera(flatView(from));
      place();
      applyFocus();
      renderer.render(scene, camera);
      labels.render(scene, camera);
      const done = () => {
        controls.enabled = true;
        cullSoon = true;
        // the years are already playing: the camera comes along at once
        if (playing && !reducedMotion()) {
          followHome = homeView();
          follow = true;
        } else startSway();
        hooks.entered?.();
      };
      move(homeView(), { Tto: 1, dur: 2000, locked: true, done, instant });
      if (instant || reducedMotion()) controls.enabled = true;
    },
    // lay the floors back down onto the map, ending straight over the given
    // point of the atlas at its scale — so the 2D chart can take over unseen
    exit(to, { instant = false } = {}) {
      flatK = to.k;
      return new Promise((resolve) => {
        hooks.hover(null);
        hoverKey = null;
        // where that point lands on screen (the lens may hold it off-center)
        const done = () => {
          active = false;
          controls.enabled = false;
          stopSway();
          follow = false;
          const r = host.getBoundingClientRect();
          resolve({ x: r.left + r.width / 2 - lens.x, y: r.top + r.height / 2 - lens.y });
        };
        move(flatView(to), { Tto: 0, dur: 1500, locked: true, done, instant });
      });
    },
    get unfolded() {
      return active && T > 0.5;
    },
    get moving() {
      return Boolean(anim);
    },
    setInset({ right = 0, bottom = 0 } = {}) {
      lens.tx = right / 2;
      lens.ty = bottom / 2;
      if (reducedMotion() || !active) {
        lens.x = lens.tx;
        lens.y = lens.ty;
        applyLens();
      }
    },
    frameIds,
    frameEdge(edge) {
      frameIds([edge.source, edge.target]);
    },
    ensureVisible,
    zoom(f) {
      if (!active || T < 0.5 || anim?.locked) return;
      takeHold();
      const o = orbitNow();
      move({ ...o, r: clamp(o.r / f, controls.minDistance, controls.maxDistance) }, { dur: 380 });
    },
    // (also what ending a tour does: a framing it left waiting goes too)
    resetView() {
      queued = null;
      if (!active || T < 0.5 || anim?.locked) return;
      held = false;
      move(() => homeView(), { dur: 1100, done: startSway });
    },
    applyTheme: paint,
    // where a work's bead is on screen (for tests and the tooltip)
    screenOf(id) {
      const w = workById.get(id);
      if (!w?.shown) return null;
      beadPos(w, P);
      const p = P.project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height, behind: p.z > 1 };
    },
    // (tuning) the home framing from another angle
    viewAt(phi, theta) {
      setCamera(fit(upPoints(), phi, theta, 0.95, 0.88));
      invalidate();
    },
    // (tests) hold the running move at a given progress, or let it go on
    hold(p) {
      if (!anim) return false;
      if (p === null) anim.t0 = performance.now() - (anim.hold ?? 0) * anim.dur;
      anim.hold = p ?? undefined;
      if (p === null) delete anim.hold;
      return true;
    },
    debug() {
      return {
        T,
        camera: orbitNow(),
        lens: { ...lens },
        held,
        follow,
        queued: Boolean(queued),
        born: works.filter((w) => w.shown && w.born).length,
        shown: works.filter((w) => w.shown).length,
        drawn: relations.filter((r) => r.line.visible && r.d >= 1).length,
        sheet: { a: sheetA, x: sheetX },
        floors: floors.map((fl) => ({ branch: fl.branch, y: fl.group.position.y, z: fl.group.position.z })),
      };
    },
    destroy() {
      cancelAnimationFrame(raf);
      renderer.dispose();
    },
  };
}
