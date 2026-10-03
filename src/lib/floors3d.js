/**
 * The floors — the genealogy in 3D (three.js, a separate chunk loaded near
 * the viewport).
 *
 * It is the atlas, unfolded. Seen from above it IS the atlas — time left →
 * right, lanes top → bottom, branches in bands — and then each branch rises
 * onto its own glass floor. Every work keeps its address (year along x, lane
 * along z), so anything found in the atlas is found here in the same place.
 * What the flat map can only hint at becomes the subject: debts that cross
 * between branches turn into bridges between floors, coloured from one
 * branch into the other (challenges stay red). Same-year works in one lane
 * stack into small towers.
 *
 * Reading: hover a work to light its lineage across the floors, with names on
 * its direct relations; hover a relation to see the debt itself — light flows
 * along it from the older work to the newer, with a note — and click either
 * to pin its card. Unfolded, drag to turn, right/shift-drag to pan,
 * ⌘/Ctrl-scroll or pinch to zoom — a plain wheel keeps scrolling the page; on
 * touch a vertical swipe scrolls and a sideways one turns. Folded, the map
 * holds still, north up, like the atlas it is.
 * Rendering is on demand and stops while the section is off screen.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

// world units
const XS = 34; // one year rank along x
const ZS = 30; // one lane along z
const FY = 150; // floor to floor, unfolded
const STACK = 11; // same lane, same year: the next work sits this much higher
const PADX = 40;
const PADZ = 24;
const BAND_GAP = 40; // between bands on the folded map
const SAMPLES = 28; // points per relation curve

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const tok = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const isLight = () => document.documentElement.dataset.theme === 'light';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const nameOf = (s) =>
  String(s)
    .replace(/\s*\((19|20)\d{2}\)\s*$/, '')
    .replace(/\s+(19|20)\d{2}\)$/, ')')
    .replace(/\s+(19|20)\d{2}$/, '');

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

export function mountFloors({ el, overlay, infoEl, data, root, strings: STR }) {
  // ------------------------------------------------------------- the data
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const edges = data.edges.filter((e) => nodeById.has(e.source) && nodeById.has(e.target));
  const branches = data.branches.filter((b) => data.nodes.some((n) => n.branch === b.id));
  const F = branches.length;
  const floorOf = new Map(branches.map((b, i) => [b.id, i]));
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const laneById = new Map(data.lanes.map((l) => [l.id, l]));
  const years = [...new Set(data.nodes.map((n) => n.year))].sort((a, b) => a - b);
  const rankOf = new Map(years.map((y, i) => [y, i]));
  // a compressed time axis that, like the atlas's, gives busy years more room
  const perYear = new Map();
  for (const n of data.nodes) perYear.set(n.year, (perYear.get(n.year) ?? 0) + 1);
  const xs = [];
  let run = 0;
  years.forEach((y, i) => {
    xs.push(run);
    const busy = ((perYear.get(y) ?? 0) + (perYear.get(years[i + 1]) ?? 0)) / 2;
    run += XS * clamp(0.62 + 0.11 * busy, 0.62, 2.3);
  });
  const L = xs[xs.length - 1];
  const xOf = (year) => xs[rankOf.get(year)] - L / 2;

  const lanesOf = branches.map((b) => data.lanes.filter((l) => l.branch === b.id && data.nodes.some((n) => n.lane === l.id)));
  const laneIdx = new Map();
  lanesOf.forEach((ls) => ls.forEach((l, i) => laneIdx.set(l.id, i)));
  const depth = lanesOf.map((ls) => Math.max(0, ls.length - 1) * ZS);

  // folded: the bands lie side by side, as in the atlas; unfolded: floors stack
  const foldZ = [];
  let acc = 0;
  for (let f = 0; f < F; f++) {
    foldZ.push(acc);
    acc += depth[f] + 2 * PADZ + BAND_GAP;
  }
  const foldSpan = acc - BAND_GAP;
  for (let f = 0; f < F; f++) foldZ[f] -= foldSpan / 2 - PADZ;
  const floorY = branches.map((_, f) => ((F - 1) / 2 - f) * FY);

  const stackOf = new Map();
  {
    const groups = new Map();
    for (const n of data.nodes) {
      const k = `${n.lane}@${n.year}`;
      groups.set(k, [...(groups.get(k) ?? []), n]);
    }
    for (const members of groups.values()) {
      members
        .sort((a, b) => a.short.localeCompare(b.short))
        .forEach((n, i) => stackOf.set(n.id, { i, n: members.length }));
    }
  }

  // per-floor progress of the unfolding (floors rise one after another)
  let T = 0;
  const tFloor = (f) => easeInOut(clamp((T - f * 0.08) / (1 - (F - 1) * 0.08), 0, 1));

  function posOf(n, out = new THREE.Vector3()) {
    const f = floorOf.get(n.branch);
    const t = tFloor(f);
    const s = stackOf.get(n.id);
    const li = laneIdx.get(n.lane) ?? 0;
    const x = xOf(n.year) + (1 - t) * (s.i - (s.n - 1) / 2) * 8;
    const zFold = foldZ[f] + li * ZS;
    const zUp = li * ZS - depth[f] / 2;
    const y = t * (floorY[f] + 5 + s.i * STACK);
    return out.set(x, y, lerp(zFold, zUp, t));
  }

  // lineage, on the full graph ("independent" is kinship, not descent)
  const parents = new Map();
  const children = new Map();
  for (const e of edges) {
    if (e.type === 'independent') continue;
    parents.set(e.target, [...(parents.get(e.target) ?? []), e.source]);
    children.set(e.source, [...(children.get(e.source) ?? []), e.target]);
  }
  const walk = (start, next) => {
    const seen = new Set();
    const stack = [start];
    while (stack.length) for (const o of next.get(stack.pop()) ?? []) if (!seen.has(o)) seen.add(o), stack.push(o);
    return seen;
  };
  const lineageCache = new Map();
  const lineageOf = (id) => {
    if (!lineageCache.has(id)) lineageCache.set(id, { anc: walk(id, parents), desc: walk(id, children) });
    return lineageCache.get(id);
  };
  const isBridge = (e) => nodeById.get(e.source).branch !== nodeById.get(e.target).branch;
  // the works a bridge lands on — where the branches meet
  const bridgeEnds = new Set(edges.filter(isBridge).flatMap((e) => [e.source, e.target]));

  // ------------------------------------------------------------- the scene
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  el.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = 'f3-labels';
  el.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 1, 6000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.zoomToCursor = true;
  controls.minDistance = 160;
  controls.maxDistance = 2600;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.maxDistance = 5000; // never clamp a fitted view at the end of a move
  // on touch: a vertical swipe scrolls the page, a sideways one turns
  renderer.domElement.style.touchAction = 'pan-y';

  const glowTex = glowTexture();
  const ringTex = ringTexture();
  const colorOf = (branchId) => {
    const b = branchById.get(branchId);
    return new THREE.Color(b ? (isLight() ? b.colorLight : b.color) : tok('--muted'));
  };

  // floors
  const floors = branches.map((b, f) => {
    const group = new THREE.Group();
    const w = L + 2 * PADX;
    const d = depth[f] + 2 * PADZ;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    plane.rotation.x = -Math.PI / 2;
    group.add(plane);
    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)),
      new THREE.LineBasicMaterial({ transparent: true }),
    );
    rim.rotation.x = -Math.PI / 2;
    group.add(rim);
    // lane rules and year ticks: the atlas grid, etched into the glass
    const grid = [];
    lanesOf[f].forEach((_, i) => {
      const z = i * ZS - depth[f] / 2;
      grid.push(-L / 2 - 14, 0, z, L / 2 + 14, 0, z);
    });
    for (const y of years) grid.push(xOf(y), 0, d / 2 - 6, xOf(y), 0, d / 2);
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    const gridLines = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ transparent: true }));
    group.add(gridLines);
    // the floor's name, at its front-left corner; lane names along its left edge
    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'f3-floor';
    tag.dataset.branch = b.id;
    tag.innerHTML = `<span class="f3-floor-dot"></span><span class="f3-floor-name">${esc(b.title)}</span>`;
    const tagObj = new CSS2DObject(tag);
    tagObj.position.set(-L / 2 - PADX + 10, 0, d / 2 - 4);
    tagObj.center.set(0, 0.5);
    group.add(tagObj);
    const laneTags = lanesOf[f].map((l, i) => {
      const s = document.createElement('span');
      s.className = 'f3-lane';
      s.textContent = l.title;
      const o = new CSS2DObject(s);
      o.position.set(-L / 2 - PADX + 12, 0, i * ZS - depth[f] / 2);
      o.center.set(0, 0.5);
      group.add(o);
      return s;
    });
    scene.add(group);
    return { b, f, group, plane, rim, gridLines, tag, laneTags };
  });

  // time axis along the front edge of the lowest floor
  const axis = new THREE.Group();
  for (const [i, y] of years.entries()) {
    const s = document.createElement('span');
    s.className = 'f3-year';
    s.textContent = String(y);
    // every other year (and the last): the axis stays legible from any angle
    if (i % 2 && i !== years.length - 1) continue;
    const o = new CSS2DObject(s);
    o.position.set(xOf(y), 0, 0);
    o.center.set(0.5, 0);
    axis.add(o);
  }
  scene.add(axis);

  // works
  const works = data.nodes.map((n) => {
    const group = new THREE.Group();
    const kindGeo =
      n.kind === 'analysis'
        ? new THREE.OctahedronGeometry(4.2)
        : n.kind === 'dataset'
          ? new THREE.BoxGeometry(5.4, 5.4, 5.4)
          : new THREE.SphereGeometry(3.3, 18, 14);
    const core = new THREE.Mesh(kindGeo, new THREE.MeshBasicMaterial({ transparent: true }));
    group.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }));
    glow.scale.set(26, 26, 1);
    group.add(glow);
    let ring = null;
    if (n.award) {
      ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false }));
      ring.scale.set(13, 13, 1);
      group.add(ring);
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(8, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.id = n.id;
    group.add(hit);
    const label = document.createElement('span');
    label.className = 'f3-label';
    label.textContent = nameOf(n.short);
    const labelObj = new CSS2DObject(label);
    labelObj.position.set(0, 7, 0);
    labelObj.center.set(0.5, 1);
    labelObj.visible = false;
    group.add(labelObj);
    scene.add(group);
    return { n, group, core, glow, ring, hit, label, labelObj };
  });
  const workById = new Map(works.map((w) => [w.n.id, w]));
  const hits = works.map((w) => w.hit);

  // relations: one thick line each, coloured from branch to branch
  const relations = edges.map((e) => {
    const geo = new LineGeometry();
    const mat = new LineMaterial({
      linewidth: 1.4,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      dashed: e.type !== 'fixes' && e.type !== 'builds-on',
      dashSize: e.type === 'challenges' ? 3 : 7,
      gapSize: e.type === 'challenges' ? 4 : 5,
    });
    const line = new Line2(geo, mat);
    line.renderOrder = 1;
    scene.add(line);
    const r = { e, line, geo, mat, bridge: isBridge(e), pts: null, ca: new THREE.Color(), cb: new THREE.Color() };
    line.userData.rel = r;
    return r;
  });

  // the debt in motion: bright dashes flowing inside the relation in focus,
  // from the older work to the newer one (it borrows that relation's own
  // geometry, so it always sits exactly on the line)
  const flowMat = new LineMaterial({
    color: 0xffffff,
    linewidth: 2,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    dashed: true,
    dashSize: 8,
    gapSize: 20,
  });
  const flow = new Line2(new LineGeometry(), flowMat);
  flow.visible = false;
  flow.renderOrder = 3;
  scene.add(flow);

  // ------------------------------------------------------------- state
  let activeBranches = new Set(branches.map((b) => b.id));
  let activeKinds = null;
  let hoverId = null;
  let selectedId = null;
  let hoverRel = null; // a relation under the pointer
  let selectedRel = null; // a relation pinned with a click
  let flowRel = null; // the relation the flow runs along
  let bridgesOnly = false;
  let dirty = true;
  const invalidate = () => (dirty = true);

  // ------------------------------------------------------------- placing
  const P = new THREE.Vector3();
  const Q = new THREE.Vector3();
  const C1 = new THREE.Vector3();
  const C2 = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const bez = (p0, c1, c2, p1, t, out) => {
    const u = 1 - t;
    return out
      .copy(p0)
      .multiplyScalar(u * u * u)
      .addScaledVector(c1, 3 * u * u * t)
      .addScaledVector(c2, 3 * u * t * t)
      .addScaledVector(p1, t * t * t);
  };

  function layout() {
    for (const fl of floors) {
      const t = tFloor(fl.f);
      fl.group.position.set(0, t * floorY[fl.f], lerp(foldZ[fl.f] + depth[fl.f] / 2, 0, t));
    }
    const lowest = F - 1;
    const tl = tFloor(lowest);
    axis.position.set(0, tl * floorY[lowest] - 2, lerp(foldZ[lowest] + depth[lowest] + PADZ + 14, depth[lowest] / 2 + PADZ + 14, tl));
    for (const w of works) posOf(w.n, w.group.position);
    for (const r of relations) {
      posOf(nodeById.get(r.e.source), P);
      posOf(nodeById.get(r.e.target), Q);
      const dy = Q.y - P.y;
      const dist = P.distanceTo(Q);
      if (!r.bridge) {
        // same floor: a low arc over the glass
        const h = Math.min(34, 6 + dist * 0.14) * tFloor(floorOf.get(nodeById.get(r.e.source).branch));
        C1.copy(P).lerp(Q, 0.25).y += h;
        C2.copy(P).lerp(Q, 0.75).y += h;
        C1.y = Math.max(C1.y, P.y + h);
        C2.y = Math.max(C2.y, Q.y + h);
      } else {
        // between floors: leave and arrive vertically, bowed toward the viewer
        const bow = 26 * Math.min(1, Math.abs(dy) / FY);
        C1.set(P.x + (Q.x - P.x) * 0.2, P.y + dy * 0.55, P.z + bow);
        C2.set(Q.x - (Q.x - P.x) * 0.2, Q.y - dy * 0.55, Q.z + bow);
      }
      const pts = new Float32Array(SAMPLES * 3);
      for (let i = 0; i < SAMPLES; i++) {
        bez(P, C1, C2, Q, i / (SAMPLES - 1), tmp);
        pts[i * 3] = tmp.x;
        pts[i * 3 + 1] = tmp.y;
        pts[i * 3 + 2] = tmp.z;
      }
      r.pts = pts;
      r.geo.setPositions(pts);
      r.line.computeLineDistances();
    }
    invalidate();
  }

  // ------------------------------------------------------------- painting
  function paint() {
    const dark = !isLight();
    const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    for (const fl of floors) {
      const c = colorOf(fl.b.id);
      fl.plane.material.color.copy(c);
      fl.plane.material.opacity = dark ? 0.07 : 0.09;
      fl.rim.material.color.copy(c);
      fl.rim.material.opacity = dark ? 0.55 : 0.7;
      fl.gridLines.material.color.set(tok('--muted'));
      fl.gridLines.material.opacity = dark ? 0.16 : 0.24;
      fl.tag.style.setProperty('--bc', `#${c.getHexString()}`);
    }
    for (const w of works) {
      const c = colorOf(w.n.branch);
      w.core.material.color.copy(c);
      w.glow.material.color.copy(c);
      w.glow.material.blending = blending;
      w.glow.material.needsUpdate = true;
      if (w.ring) w.ring.material.color.set(tok('--award'));
    }
    const red = new THREE.Color(tok('--danger'));
    for (const r of relations) {
      const a = r.e.type === 'challenges' ? red : colorOf(nodeById.get(r.e.source).branch);
      const b = r.e.type === 'challenges' ? red : colorOf(nodeById.get(r.e.target).branch);
      const cols = new Float32Array(SAMPLES * 3);
      const c = new THREE.Color();
      for (let i = 0; i < SAMPLES; i++) {
        c.lerpColors(a, b, i / (SAMPLES - 1));
        cols[i * 3] = c.r;
        cols[i * 3 + 1] = c.g;
        cols[i * 3 + 2] = c.b;
      }
      r.geo.setColors(cols);
      r.ca.copy(a);
      r.cb.copy(b);
    }
    focus();
  }

  // a relation's visibility under the filters ("bridges only" lets a focused
  // work keep its own direct relations)
  const relShown = (r, id = null) =>
    Boolean(
      activeBranches.has(nodeById.get(r.e.source).branch) &&
        activeBranches.has(nodeById.get(r.e.target).branch) &&
        (!bridgesOnly || r.bridge || (id && (r.e.source === id || r.e.target === id))),
    );
  const kindOn = (n) => !activeKinds || activeKinds.has(n.kind);

  // one painter for every emphasis: filters, hover, selection. Hover wins
  // over a pinned selection; a relation in focus is its own mode
  function focus() {
    const rel = hoverId ? null : hoverRel ?? (selectedId ? null : selectedRel);
    flowRel = rel;
    if (rel) return focusRel(rel);
    const id = hoverId ?? selectedId;
    let lit = null;
    let direct = null;
    let anc = null;
    let desc = null;
    if (id) {
      ({ anc, desc } = lineageOf(id));
      direct = new Set([id]);
      for (const e of edges) {
        if (e.source === id) direct.add(e.target);
        if (e.target === id) direct.add(e.source);
      }
      lit = new Set([id, ...anc, ...desc, ...direct]);
    }
    for (const w of works) {
      const shown = activeBranches.has(w.n.branch);
      w.group.visible = shown;
      const on = lit ? lit.has(w.n.id) : kindOn(w.n) && (!bridgesOnly || bridgeEnds.has(w.n.id));
      const a = on ? 1 : lit ? 0.1 : 0.16;
      w.core.material.opacity = a;
      w.glow.material.opacity = (isLight() ? 0.42 : 0.55) * (on ? 1 : 0.2);
      if (w.ring) w.ring.material.opacity = on ? 1 : 0.15;
      const named = Boolean(direct?.has(w.n.id)) || (lit && lit.size <= 14 && lit.has(w.n.id));
      w.labelObj.visible = shown && Boolean(named);
      w.label.classList.toggle('is-self', w.n.id === id);
    }
    const side = (e) =>
      (anc?.has(e.source) && (anc.has(e.target) || e.target === id)) ||
      ((desc?.has(e.source) || e.source === id) && desc?.has(e.target));
    for (const r of relations) {
      const { e } = r;
      // (a real boolean: three.js hides an object only when visible === false)
      const shown = relShown(r, id);
      r.line.visible = shown;
      if (!shown) continue;
      let opacity;
      let width;
      if (id) {
        const isDirect = e.source === id || e.target === id;
        const onPath = isDirect || (e.type !== 'independent' && side(e));
        opacity = isDirect ? 1 : onPath ? 0.7 : 0.035;
        width = isDirect ? 2.6 : onPath ? 1.8 : 1;
      } else {
        const off = activeKinds && !kindOn(nodeById.get(e.source)) && !kindOn(nodeById.get(e.target));
        opacity = off ? 0.05 : r.bridge ? (bridgesOnly ? 0.9 : 0.72) : 0.26;
        width = r.bridge ? (bridgesOnly ? 2.3 : 1.9) : 1.2;
      }
      r.mat.opacity = opacity;
      r.mat.linewidth = width;
    }
    const focusFloors = new Set(id ? [nodeById.get(id).branch] : []);
    paintFloors(focusFloors);
    invalidate();
  }

  // a relation in focus: the two works it joins, named; everything else steps back
  function focusRel(rel) {
    const { e } = rel;
    for (const w of works) {
      const shown = activeBranches.has(w.n.branch);
      w.group.visible = shown;
      const end = w.n.id === e.source || w.n.id === e.target;
      w.core.material.opacity = end ? 1 : 0.1;
      w.glow.material.opacity = (isLight() ? 0.42 : 0.55) * (end ? 1.15 : 0.18);
      if (w.ring) w.ring.material.opacity = end ? 1 : 0.15;
      w.labelObj.visible = shown && end;
      w.label.classList.toggle('is-self', false);
    }
    for (const r of relations) {
      const shown = r === rel || relShown(r);
      r.line.visible = shown;
      if (!shown) continue;
      r.mat.opacity = r === rel ? 1 : 0.05;
      r.mat.linewidth = r === rel ? 3.4 : 1;
    }
    paintFloors(new Set([nodeById.get(e.source).branch, nodeById.get(e.target).branch]));
    invalidate();
  }

  function paintFloors(focusFloors) {
    for (const fl of floors) {
      fl.group.visible = activeBranches.has(fl.b.id);
      fl.laneTags.forEach((t) => t.classList.toggle('is-on', focusFloors.has(fl.b.id) || hoverFloor === fl.b.id));
      fl.tag.classList.toggle('is-dim', Boolean(hoverFloor && hoverFloor !== fl.b.id));
    }
  }

  // the flow: dashes running along the relation in focus, older → newer
  // (a falling dash offset moves the pattern forward along the line)
  function placeFlow(now) {
    const r = flowRel;
    if (!r || reducedMotion()) {
      flow.visible = false;
      return false;
    }
    if (flow.geometry !== r.geo) flow.geometry = r.geo;
    flowMat.dashOffset = -(now / 1000) * 70;
    flowMat.opacity = isLight() ? 1 : 0.9;
    flow.visible = true;
    return true;
  }

  // ------------------------------------------------------------- camera
  // The map, folded, is a fixed picture: straight down, north up, the whole of
  // it in frame — like the atlas it is. Unfolding goes back to the reader's
  // own 3D view (exactly), or home if they never moved; only the reset button
  // goes home on purpose. Every move starts exactly where the camera is, and
  // turns the short way round.
  const TOP = 0.0001; // looking straight down (phi), just off the pole
  const target = new THREE.Vector3();
  const spherical = new THREE.Spherical();
  const maxDepth = Math.max(...depth);
  const boxOf = (up) =>
    up
      ? new THREE.Box3(
          new THREE.Vector3(-L / 2 - PADX, floorY[F - 1] - 6, -maxDepth / 2 - PADZ),
          new THREE.Vector3(L / 2 + PADX, floorY[0] + 3 * STACK + 12, maxDepth / 2 + PADZ + 30),
        )
      : new THREE.Box3(new THREE.Vector3(-L / 2 - PADX, 0, -foldSpan / 2), new THREE.Vector3(L / 2 + PADX, 0, foldSpan / 2 + 40));
  // the smallest distance at which every corner lands inside the frame —
  // measured on a probe camera: fitting must never move the real one
  const probe = new THREE.PerspectiveCamera();
  function fit(box, phi, theta, mx = 0.9, my = mx) {
    probe.fov = camera.fov;
    probe.aspect = camera.aspect;
    probe.near = camera.near;
    probe.far = camera.far;
    probe.updateProjectionMatrix();
    const center = box.getCenter(new THREE.Vector3());
    const corners = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const v = new THREE.Vector3();
    const fits = (r) => {
      probe.position.setFromSpherical(new THREE.Spherical(r, phi, theta)).add(center);
      probe.lookAt(center);
      probe.updateMatrixWorld();
      return corners.every((c) => {
        v.copy(c).project(probe);
        return Math.abs(v.x) <= mx && Math.abs(v.y) <= my && v.z < 1;
      });
    };
    let lo = 50;
    let hi = 9000;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return { r: hi, phi, theta, tx: center.x, ty: center.y, tz: center.z };
  }
  const narrow = () => camera.aspect < 1.05;
  // home: a three-quarter look at the floors, from a little above and to the left
  const home = () => (narrow() ? { phi: 1.0, theta: -1.0 } : { phi: 0.94, theta: -0.32 });
  const viewFor = (up, phi, theta) => {
    const [mx, my] = up ? (narrow() ? [0.98, 0.92] : [0.97, 0.84]) : [0.94, 0.86];
    return fit(boxOf(up), phi, theta, mx, my);
  };
  const views = () => ({ fold: viewFor(false, TOP, 0), up: viewFor(true, home().phi, home().theta) });
  function setCamera(v) {
    target.set(v.tx ?? 0, v.ty, v.tz ?? 0);
    spherical.set(v.r, v.phi, v.theta);
    camera.position.setFromSpherical(spherical).add(target);
    camera.lookAt(target);
    controls.target.copy(target);
  }
  // the camera as it is right now, as an orbit around the controls' target
  function orbitNow() {
    const s = new THREE.Spherical().setFromVector3(new THREE.Vector3().copy(camera.position).sub(controls.target));
    return { r: s.radius, phi: s.phi, theta: s.theta, tx: controls.target.x, ty: controls.target.y, tz: controls.target.z };
  }
  // drop whatever spin, pan or zoom the reader's last gesture still carries
  // (damping keeps it going for a while), so a scripted move starts clean
  function stillControls() {
    controls._sphericalDelta?.set(0, 0, 0);
    controls._panOffset?.set(0, 0, 0);
    if ('_scale' in controls) controls._scale = 1;
  }
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a)); // into (-π, π]

  // ------------------------------------------------------------- motion
  let anim = null; // { from, to, t0, dur, Tfrom, Tto, cam }
  let unfolded = false;
  // the reader's own 3D view, kept when they fold it away
  let memoryUp = null;
  let userMoved = false; // have they moved the camera since the last unfold?
  controls.addEventListener('start', () => (userMoved = true));
  // folded, the map holds still: no turning, panning or zooming (hover works)
  function setFixed(on) {
    controls.enabled = !on;
    el.classList.toggle('is-fixed', on);
    renderer.domElement.style.touchAction = on ? 'auto' : 'pan-y';
  }
  const shortWay = (from, to) => from + wrapAngle(to - from);
  function morph(toUnfolded, { instant = false, toHome = false, dur = 1500 } = {}) {
    const from = orbitNow(); // before anything else touches the camera
    if (unfolded && !anim && userMoved) memoryUp = from;
    userMoved = false;
    if (toHome) memoryUp = null;
    let to;
    if (!toUnfolded) {
      to = viewFor(false, TOP, shortWay(from.theta, 0));
    } else if (memoryUp) {
      to = { ...memoryUp, theta: shortWay(from.theta, memoryUp.theta) };
    } else {
      const h = home();
      to = viewFor(true, h.phi, shortWay(from.theta, h.theta));
    }
    unfolded = toUnfolded;
    setFixed(!toUnfolded);
    stopSway();
    stillControls();
    overlay?.classList.toggle('is-folded', !toUnfolded);
    if (instant || reducedMotion()) {
      anim = null;
      T = toUnfolded ? 1 : 0;
      layout();
      setCamera(to);
      if (toUnfolded && !reducedMotion()) startSway();
      return invalidate();
    }
    // a long way round takes a little longer, so no turn ever feels hurried
    const turn = Math.abs(wrapAngle(to.theta - from.theta));
    dur += 500 * (turn / Math.PI);
    anim = { from, to, t0: performance.now(), dur, Tfrom: T, Tto: toUnfolded ? 1 : 0, cam: true };
  }
  function stepAnim(now) {
    const k = clamp((now - anim.t0) / anim.dur, 0, 1);
    // the floors ease and stagger on their own (tFloor); the camera eases
    // along with them, as one gesture
    T = lerp(anim.Tfrom, anim.Tto, k);
    layout();
    if (anim.cam) {
      const e = easeInOut(k);
      const { from, to } = anim;
      setCamera({
        r: lerp(from.r, to.r, e),
        phi: lerp(from.phi, to.phi, e),
        theta: lerp(from.theta, to.theta, e),
        tx: lerp(from.tx, to.tx, e),
        ty: lerp(from.ty, to.ty, e),
        tz: lerp(from.tz, to.tz, e),
      });
    }
    if (k >= 1) {
      anim = null;
      if (unfolded) startSway();
    }
  }

  // an idle building sways a little, until the reader takes hold of it
  let sway = null;
  function startSway() {
    if (reducedMotion() || touched) return;
    const o = orbitNow();
    sway = { t0: performance.now(), theta: o.theta, phi: o.phi, r: o.r };
  }
  function stopSway() {
    sway = null;
  }
  function stepSway(now) {
    const t = (now - sway.t0) / 1000;
    const s = new THREE.Spherical(sway.r, sway.phi, sway.theta + Math.sin(t * 0.32) * 0.2);
    camera.position.setFromSpherical(s).add(controls.target);
    camera.lookAt(controls.target);
  }
  let touched = false;
  const takeHold = () => {
    touched = true;
    stopSway();
  };
  // the sway stops the moment a pointer arrives — nobody should have to aim
  // at a moving target
  renderer.domElement.addEventListener('pointerenter', takeHold);
  // grabbing the view in the middle of a move takes the camera back at once
  // (captured on the way down, so the controls see the same press); the
  // floors finish their own motion underneath
  const grab = () => {
    takeHold();
    if (anim?.cam && controls.enabled) {
      anim.cam = false;
      stillControls();
    }
  };
  el.addEventListener('pointerdown', grab, { capture: true });

  // a plain wheel scrolls the page; ⌘/Ctrl-wheel (and trackpad pinch) zooms
  el.addEventListener(
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
  controls.addEventListener('change', invalidate);

  // ------------------------------------------------------------- picking
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line2 = { threshold: 8 }; // px of slack around a relation
  const pointer = new THREE.Vector2();
  let hoverFloor = null;
  // works first (they sit on top); then relations, as the filters show them
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const w = raycaster.intersectObjects(hits.filter((h) => h.parent.visible), false)[0];
    if (w) return { id: w.object.userData.id };
    const lines = relations.filter((x) => relShown(x)).map((x) => x.line);
    const l = raycaster.intersectObjects(lines, false)[0];
    return l ? { rel: l.object.userData.rel } : null;
  }

  // the relation tooltip follows the pointer
  const tip = document.createElement('div');
  tip.className = 'f3-tip';
  tip.hidden = true;
  el.appendChild(tip);
  const branchTitle = (n) => branchById.get(n.branch)?.title ?? n.branch;
  const relLabel = (r) => data.edgeTypes[r.e.type]?.label ?? r.e.type;
  function whereOf(r) {
    const s = nodeById.get(r.e.source);
    const t = nodeById.get(r.e.target);
    return r.bridge ? `${STR.bridge} · ${branchTitle(s)} → ${branchTitle(t)}` : `${STR.within} ${branchTitle(s)}`;
  }
  function showTip(ev, r) {
    const s = nodeById.get(r.e.source);
    const t = nodeById.get(r.e.target);
    const html = `<span class="f3-tip-kicker">${esc(whereOf(r))}</span>
      <span class="f3-tip-rel"><strong>${esc(nameOf(t.short))}</strong> <em class="t-${esc(r.e.type)}">${esc(relLabel(r))}</em> <strong>${esc(nameOf(s.short))}</strong></span>
      <span class="f3-tip-years">${s.year} → ${t.year}</span>
      ${r.e.note ? `<p>${esc(truncate(r.e.note, 190))}</p>` : ''}
      <span class="f3-tip-hint">${esc(STR.tipRel)}</span>`;
    if (tip.dataset.key !== String(r.e.key ?? `${r.e.source}>${r.e.target}`)) {
      tip.innerHTML = html;
      tip.dataset.key = String(r.e.key ?? `${r.e.source}>${r.e.target}`);
    }
    tip.hidden = false;
    const box = el.getBoundingClientRect();
    let x = ev.clientX - box.left + 16;
    let y = ev.clientY - box.top + 16;
    if (x + tip.offsetWidth > box.width - 8) x = ev.clientX - box.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > box.height - 8) y = ev.clientY - box.top - tip.offsetHeight - 12;
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
  function hideTip() {
    tip.hidden = true;
  }

  let pending = null;
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'touch') return;
    pending = ev;
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    pending = null;
    hideTip();
    if (hoverId || hoverRel) {
      hoverId = null;
      hoverRel = null;
      renderer.domElement.style.cursor = '';
      focus();
    }
  });
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (ev) => (down = { x: ev.clientX, y: ev.clientY }));
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
    const hit = pick(ev);
    hideTip();
    if (hit?.id) selectWork(hit.id === selectedId ? null : hit.id);
    else if (hit?.rel) selectRel(hit.rel === selectedRel ? null : hit.rel);
    else selectWork(null);
  });

  // floor names: hover isolates a floor, click flies the camera to it
  for (const fl of floors) {
    fl.tag.addEventListener('pointerenter', () => {
      hoverFloor = fl.b.id;
      focus();
    });
    fl.tag.addEventListener('pointerleave', () => {
      hoverFloor = null;
      focus();
    });
  }

  // ------------------------------------------------------------- the card
  // with the card open the picture slides left (a view offset — the canvas
  // keeps its size, so nothing jumps under the pointer)
  let shift = 0;
  let shiftTo = 0;
  function applyShift() {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    if (Math.abs(shift) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(w + 2 * Math.abs(shift), h, shift > 0 ? 2 * shift : 0, 0, w, h);
    invalidate();
  }
  function setShift(px) {
    shiftTo = reducedMotion() ? (shift = px) : px;
    applyShift();
  }

  function closeCard() {
    infoEl.hidden = true;
    infoEl.innerHTML = '';
    setShift(0);
  }
  const openCard = () => {
    infoEl.hidden = false;
    infoEl.scrollTop = 0;
    setShift(el.clientWidth > 760 ? Math.min(200, (infoEl.offsetWidth + 24) / 2) : 0);
  };

  // a relation's card: the debt, both works, the whole note
  function selectRel(r) {
    selectedId = null;
    selectedRel = r;
    hoverRel = null;
    focus();
    if (!r) return closeCard();
    const s = nodeById.get(r.e.source);
    const t = nodeById.get(r.e.target);
    const dot = (n) => `<span class="dot" style="background:${colorOf(n.branch).getStyle()}"></span>`;
    const gap = t.year - s.year;
    const when = gap > 0 ? `${s.year} → ${t.year} · ${gap} ${esc(STR.yearsLater)}` : `${t.year} · ${esc(STR.sameYear)}`;
    const end = (n) =>
      `<li><button type="button" data-goto="${esc(n.id)}">${dot(n)}<strong>${esc(nameOf(n.short))}</strong> <span class="f3-y">${n.year}</span> <em>${esc(branchTitle(n))}</em></button></li>`;
    infoEl.innerHTML = `
      <button type="button" class="icon-btn f3-close" aria-label="${esc(STR.close)}">×</button>
      <span class="chip">${dot(s)}${r.bridge ? dot(t) : ''}${esc(whereOf(r))}</span>
      <h3 class="f3-rel-h">${esc(nameOf(t.short))} <em class="t-${esc(r.e.type)}">${esc(relLabel(r))}</em> ${esc(nameOf(s.short))}</h3>
      <p class="f3-meta">${when}</p>
      ${r.e.note ? `<p class="f3-problem">${esc(r.e.note)}</p>` : ''}
      <h4>${esc(STR.theTwo)}</h4>
      <ul class="f3-bridge-list">${end(t)}${end(s)}</ul>
      <div class="f3-actions">
        <button type="button" class="btn btn-sm btn-primary" data-atlas="${esc(t.id)}">${esc(STR.showInAtlas)}</button>
        <a class="btn btn-sm" href="${root}/nodes/${esc(t.id)}/">${esc(STR.openPageShort)}</a>
      </div>`;
    openCard();
  }

  function selectWork(id) {
    selectedId = id;
    selectedRel = null;
    focus();
    if (!id) return closeCard();
    const n = nodeById.get(id);
    const b = branchById.get(n.branch);
    const standsOn = edges.filter((e) => e.target === id);
    const followedBy = edges.filter((e) => e.source === id);
    const bridges = edges
      .filter((e) => (e.source === id || e.target === id) && isBridge(e))
      .map((e) => ({ e, other: nodeById.get(e.source === id ? e.target : e.source) }))
      .sort((a, c) => a.other.year - c.other.year);
    const c = colorOf(n.branch).getStyle();
    infoEl.innerHTML = `
      <button type="button" class="icon-btn f3-close" aria-label="${esc(STR.close)}">×</button>
      <span class="chip"><span class="dot" style="background:${c}"></span>${esc(b?.title ?? '')} · ${esc(laneById.get(n.lane)?.title ?? '')}</span>
      <h3>${esc(nameOf(n.short))}</h3>
      <p class="f3-full">${esc(n.title)}</p>
      <p class="f3-meta">${n.year}${n.venue ? ` · ${esc(n.venue)}` : ''}${n.award ? ' <span class="award-star">★</span>' : ''}</p>
      <div class="f3-stats">
        <div><b>${standsOn.length}</b><span>${esc(STR.statParents)}</span></div>
        <div><b>${followedBy.length}</b><span>${esc(STR.statChildren)}</span></div>
        <div><b>${bridges.length}</b><span>${esc(STR.statBridges)}</span></div>
      </div>
      <p class="f3-problem">${esc(truncate(n.problem, 260))}</p>
      ${
        bridges.length
          ? `<h4>${esc(STR.bridgesTitle)}</h4><ul class="f3-bridge-list">${bridges
              .map(
                ({ e, other }) => {
                  const label = esc(data.edgeTypes[e.type]?.label ?? e.type);
                  const dot = `<span class="dot" style="background:${colorOf(other.branch).getStyle()}"></span>`;
                  const name = `<strong>${esc(nameOf(other.short))}</strong> <span class="f3-y">${other.year}</span>`;
                  // this work → an older one: "builds on X"; a newer one → this: "X fixes this work"
                  const phrase = e.target === id ? `<em>${label}</em> ${dot}${name}` : `${dot}${name} <em>${label} ${esc(STR.thisWork)}</em>`;
                  return `<li><button type="button" data-goto="${esc(other.id)}">${phrase}</button></li>`;
                },
              )
              .join('')}</ul>`
          : ''
      }
      <div class="f3-actions">
        <button type="button" class="btn btn-sm btn-primary" data-atlas="${esc(id)}">${esc(STR.showInAtlas)}</button>
        <a class="btn btn-sm" href="${root}/nodes/${esc(id)}/">${esc(STR.openPageShort)}</a>
      </div>`;
    openCard();
  }
  infoEl.addEventListener('click', (ev) => {
    if (ev.target.closest('.f3-close')) return selectWork(null);
    const go = ev.target.closest('[data-goto]');
    if (go) return selectWork(go.dataset.goto);
    const atlas = ev.target.closest('[data-atlas]');
    if (atlas) {
      window.dispatchEvent(new CustomEvent('atlas:focus', { detail: { id: atlas.dataset.atlas } }));
      document.getElementById('atlas')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && visible && !infoEl.hidden && !document.querySelector('dialog[open]')) selectWork(null);
  });

  // ------------------------------------------------------------- the loop
  let visible = false;
  let raf = 0;
  // year labels give way to one another and to the floor names, on screen —
  // whatever the angle or the size of the frame
  const yearTags = axis.children.map((o) => o.element);
  const overlaps = (a, b, pad = 6) =>
    a.width > 0 && b.width > 0 && a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + pad && b.top < a.bottom + pad;
  function separateFloorTags() {
    const boxes = floors
      .filter((fl) => fl.group.visible)
      .map((fl) => {
        fl.tag.style.translate = '';
        const r = fl.tag.getBoundingClientRect();
        return { tag: fl.tag, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      })
      .filter((b) => b.right > b.left)
      .sort((a, b) => b.bottom - a.bottom); // the lowest keeps its place …
    const placed = [];
    for (const b of boxes) {
      let dy = 0;
      for (let guard = 0; guard < 8; guard++) {
        const hit = placed.find((p) => b.left < p.right + 4 && p.left < b.right + 4 && b.top + dy < p.bottom + 3 && p.top < b.bottom + dy + 3);
        if (!hit) break;
        dy = hit.top - 3 - b.bottom; // … the others step up above it
      }
      if (dy) b.tag.style.translate = `0 ${Math.round(dy)}px`;
      placed.push({ ...b, top: b.top + dy, bottom: b.bottom + dy });
    }
  }

  function cullYears() {
    const blockers = floors.filter((fl) => fl.group.visible).map((fl) => fl.tag.getBoundingClientRect());
    const tags = yearTags.map((y) => ({ y, r: y.getBoundingClientRect() })).sort((a, b) => a.r.left - b.r.left);
    const kept = [];
    for (const { y, r } of tags) {
      const ok = !blockers.some((b) => overlaps(r, b)) && !kept.some((k) => overlaps(r, k));
      y.style.visibility = ok ? '' : 'hidden';
      if (ok) kept.push(r);
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!visible) return;
    if (pending) {
      const ev = pending;
      pending = null;
      const hit = pick(ev);
      const id = hit?.id ?? null;
      const rel = hit?.rel ?? null;
      if (id !== hoverId || rel !== hoverRel) {
        hoverId = id;
        hoverRel = rel;
        renderer.domElement.style.cursor = id || rel ? 'pointer' : '';
        focus();
      }
      if (rel) showTip(ev, rel);
      else hideTip();
    }
    const flowing = placeFlow(now);
    if (anim) stepAnim(now);
    else if (sway) stepSway(now);
    let shifting = false;
    if (Math.abs(shiftTo - shift) > 0.5) {
      shift += (shiftTo - shift) * 0.18;
      shifting = true;
    } else if (shift !== shiftTo) {
      shift = shiftTo;
      shifting = true;
    }
    if (shifting) applyShift();
    // while a move or the sway drives the camera, the controls sit out
    const moved = anim?.cam || sway ? false : controls.update();
    if (anim || sway || moved || flowing || dirty) {
      renderer.render(scene, camera);
      labels.render(scene, camera);
      separateFloorTags();
      cullYears();
      dirty = false;
    }
  }

  function resize() {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    applyShift();
    invalidate();
  }
  new ResizeObserver(() => {
    const before = camera.aspect;
    resize();
    if (anim) return;
    // the map is a fixed picture: it always re-frames; the building only
    // until the reader has moved it
    if (!unfolded) setCamera(views().fold);
    else if (!touched && Math.abs(before - camera.aspect) > 0.05) setCamera(views().up);
  }).observe(el);

  // start folded, looking straight down — the atlas — and unfold once the
  // section is well in view
  resize();
  layout();
  paint();
  setCamera(views().fold);
  setFixed(true);
  overlay?.classList.add('is-folded');
  let unfoldedOnce = false;
  new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        visible = entry.isIntersecting;
        if (visible && !unfoldedOnce && entry.intersectionRatio >= 0.45) {
          unfoldedOnce = true;
          // (unless the reader has already folded or unfolded it themselves)
          setTimeout(() => !unfolded && !anim && morph(true, { toHome: true, dur: 2400 }), 350);
        }
      }
      invalidate();
    },
    { threshold: [0, 0.45, 0.8] },
  ).observe(el);
  raf = requestAnimationFrame(loop);

  return {
    setFilter(ids) {
      activeBranches = new Set(ids);
      if (selectedId && !activeBranches.has(nodeById.get(selectedId).branch)) selectWork(null);
      if (selectedRel && !relShown(selectedRel)) selectRel(null);
      focus();
    },
    setKinds(kinds) {
      activeKinds = kinds ? new Set(kinds) : null;
      focus();
    },
    applyTheme: paint,
    toggleFold() {
      takeHold();
      morph(!unfolded);
      return unfolded;
    },
    toggleBridges() {
      bridgesOnly = !bridgesOnly;
      if (selectedRel && !relShown(selectedRel)) selectRel(null);
      focus();
      return bridgesOnly;
    },
    resetView() {
      if (!unfolded) return; // the map is already as it should be
      takeHold();
      morph(true, { toHome: true, dur: 1100 });
    },
    get bridgeCount() {
      return relations.filter((r) => r.bridge).length;
    },
    destroy() {
      cancelAnimationFrame(raf);
      renderer.dispose();
    },
  };
}
