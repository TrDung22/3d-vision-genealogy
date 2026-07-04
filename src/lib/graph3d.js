/**
 * 3D view of the genealogy — force-directed graph rendered with three.js.
 * Loaded lazily (dynamic import) so the three.js chunk never blocks the
 * timeline's first paint.
 *
 * Spatial encoding (the 3D answer to the timeline's rows and columns):
 * - a custom cluster force pulls each lane's nodes toward its own anchor,
 *   so lanes form visible constellations
 * - each cluster gets a faint bubble in its branch color plus a floating
 *   lane-name label — the 3D equivalent of the timeline's lane gutter
 *
 * Other encodings:
 * - node color = branch (theme-aware), bigger node = has a full article
 * - gold ring sprite = awarded / oral / spotlight work
 * - moving particles along an edge = "fixes", red edge = "challenges"
 * - hovering a node dims everything but its direct relations (focus mode)
 * - click a node → docked info panel; background click closes it
 */
import ForceGraph3D from '3d-force-graph';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

const tok = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const isLight = () => document.documentElement.dataset.theme === 'light';

/** ring texture for award nodes — drawn once, tinted per theme via material color */
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, 2 * Math.PI);
  ctx.stroke();
  return new THREE.CanvasTexture(c);
}

export function mount3D({ el, infoEl, data, root, strings }) {
  const branchById = new Map(data.branches.map((b) => [b.id, b]));
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const typeLabel = (t) => data.edgeTypes[t]?.label ?? t;
  const bColor = (branchId) => {
    const b = branchById.get(branchId);
    return b ? (isLight() ? b.colorLight : b.color) : tok('--muted');
  };

  // neighborhood map for hover focus-mode
  const nbr = new Map(data.nodes.map((n) => [n.id, new Set([n.id])]));
  for (const e of data.edges) {
    nbr.get(e.source)?.add(e.target);
    nbr.get(e.target)?.add(e.source);
  }
  let hoverId = null;
  const related = (id) => !hoverId || nbr.get(hoverId)?.has(id);
  const linkTouches = (l) => {
    const s = l.source?.id ?? l.source;
    const t = l.target?.id ?? l.target;
    return hoverId && (s === hoverId || t === hoverId);
  };

  const nodeVal = (n) => (n.hasPost || n.status === 'written' ? 7 : 3);
  const nodeRadius = (n) => 4 * Math.cbrt(nodeVal(n)); // force-graph default nodeRelSize = 4

  const awardTex = ringTexture();

  // master copies — setFilter() feeds SUBSETS of these same objects back to
  // the graph, so surviving nodes keep their simulation positions
  const allNodes = data.nodes.map((n) => ({ ...n }));
  const allLinks = data.edges.map((e) => ({ ...e }));

  const graph = ForceGraph3D()(el)
    .graphData({ nodes: allNodes, links: allLinks })
    .backgroundColor(tok('--page'))
    .nodeColor((n) => (related(n.id) ? bColor(n.branch) : tok('--baseline')))
    .nodeVal(nodeVal)
    .nodeOpacity(0.92)
    .nodeThreeObjectExtend(true)
    .nodeThreeObject((n) => {
      const group = new THREE.Group();
      // always-readable label: skips the depth buffer, drawn after geometry
      const label = new SpriteText(n.short);
      label.color = tok('--ink-2');
      label.textHeight = 3.2;
      label.position.y = -(nodeRadius(n) + 3.5);
      label.material.depthWrite = false;
      label.material.depthTest = false;
      label.renderOrder = 999;
      group.add(label);
      n.__label = label;
      if (n.award) {
        const ring = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: awardTex,
            color: tok('--award'),
            transparent: true,
            depthWrite: false,
          }),
        );
        const d = nodeRadius(n) * 2 + 3.5;
        ring.scale.set(d, d, 1);
        ring.renderOrder = 5;
        group.add(ring);
        n.__ring = ring;
      }
      return group;
    })
    .nodeLabel(
      (n) => `<div class="gg-3d-tip">
        <b>${esc(n.short)}</b>
        <span>${n.year}${n.venue ? ` · ${esc(n.venue)}` : ''}</span>
        <p>${esc(truncate(n.problem, 150))}</p>
      </div>`,
    )
    .linkColor((l) =>
      hoverId && !linkTouches(l)
        ? tok('--grid')
        : l.type === 'challenges'
          ? tok('--danger')
          : tok('--muted'),
    )
    .linkOpacity(0.45)
    .linkDirectionalArrowLength(3.5)
    .linkDirectionalArrowRelPos(1)
    .linkDirectionalParticles((l) => (l.type === 'fixes' ? 2 : 0))
    .linkDirectionalParticleWidth(1.6)
    .onNodeClick((n) => showInfo(n))
    .onBackgroundClick(() => hideInfo())
    .onNodeHover((n) => {
      hoverId = n ? n.id : null;
      refreshFocus();
    });

  // the CURRENTLY simulated nodes — changes with every setFilter() call
  const simNodes = () => graph.graphData().nodes;

  // ---- cluster force: pull each lane's nodes toward its own anchor so the
  // lanes form visible constellations (the 3D counterpart of timeline rows)
  // lane anchors ride an ellipse in the SCREEN plane (XY) — NOT the ground
  // plane (XZ). A ground-plane ring is seen almost edge-on by the default
  // camera and collapses into a thin horizontal band, wasting the whole
  // top/bottom of the frame. Facing the camera, the constellations spread
  // across the box. The ellipse is wider than tall to match the landscape
  // canvas; a little Z jitter keeps the depth cue.
  const RX = 215;
  const RY = 138;
  const anchors = new Map(
    data.lanes.map((l, i) => {
      const a = (2 * Math.PI * i) / data.lanes.length - Math.PI / 2; // lane 0 at top
      return [l.id, { x: Math.cos(a) * RX, y: Math.sin(a) * RY, z: ((i % 3) - 1) * 40 }];
    }),
  );
  let clusterNodes = [];
  function clusterForce(alpha) {
    const k = 0.11 * alpha; // firmer pull → distinct constellations, less overlap
    for (const node of clusterNodes) {
      const a = anchors.get(node.lane);
      if (!a) continue;
      node.vx += (a.x - node.x) * k;
      node.vy += (a.y - node.y) * k;
      node.vz += (a.z - node.z) * k;
    }
  }
  clusterForce.initialize = (ns) => {
    clusterNodes = ns;
  };
  graph.d3Force('cluster', clusterForce);
  graph.d3Force('charge')?.strength(-28);

  // ---- faint bubbles + floating lane names, tracking each cluster
  const scene = graph.scene();
  const bubbles = new Map();
  for (const l of data.lanes) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.08, depthWrite: false }),
    );
    mesh.renderOrder = -1;
    const title = new SpriteText(l.title);
    title.textHeight = 4;
    title.material.depthWrite = false;
    title.material.depthTest = false;
    title.renderOrder = 998;
    scene.add(mesh);
    scene.add(title);
    bubbles.set(l.id, { mesh, title, branch: l.branch });
  }
  paintBubbles();

  function paintBubbles() {
    for (const [, b] of bubbles) {
      b.mesh.material.color.set(bColor(b.branch));
      b.mesh.material.opacity = isLight() ? 0.1 : 0.08;
      b.title.color = tok('--muted');
    }
  }

  function updateBubbles() {
    const live = simNodes();
    for (const [laneId, b] of bubbles) {
      const pts = live.filter((n) => n.lane === laneId && Number.isFinite(n.x));
      if (!pts.length) continue;
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
      const r =
        Math.max(
          20,
          ...pts.map((p) => Math.hypot(p.x - cx, p.y - cy, p.z - cz)),
        ) + 14;
      b.mesh.position.set(cx, cy, cz);
      b.mesh.scale.setScalar(r);
      b.title.position.set(cx, cy + r + 7, cz);
    }
  }
  graph.onEngineTick(updateBubbles);

  // ---- hover focus-mode
  // (both walk allNodes, not just the visible ones, so nodes hidden by the
  // branch filter come back with the right label/ring state)
  function refreshFocus() {
    graph.nodeColor(graph.nodeColor());
    graph.linkColor(graph.linkColor());
    for (const n of allNodes) {
      if (n.__label) n.__label.material.opacity = related(n.id) ? 1 : 0.12;
      if (n.__ring) n.__ring.material.opacity = related(n.id) ? 1 : 0.12;
    }
  }

  // ---- theme switching without a rebuild
  function applyTheme() {
    graph.backgroundColor(tok('--page'));
    for (const n of allNodes) {
      if (n.__label) n.__label.color = tok('--ink-2');
      if (n.__ring) n.__ring.material.color.set(tok('--award'));
    }
    paintBubbles();
    refreshFocus(); // re-evaluates node/link color accessors with new tokens
  }

  // ---- docked info panel
  function relationRows(list) {
    return list
      .map(
        (r) => `<li>
          <span class="rel-type">${esc(typeLabel(r.type))}</span>
          <a href="${root}/nodes/${r.other.id}/">${esc(r.other.short)}</a>
          ${r.note ? `<p>${esc(r.note)}</p>` : ''}
        </li>`,
      )
      .join('');
  }

  let infoNode = null; // so the branch filter can close a panel it orphans

  function showInfo(n) {
    infoNode = n;
    const standsOn = data.edges
      .filter((e) => e.target === n.id && nodeById.has(e.source))
      .map((e) => ({ type: e.type, note: e.note, other: nodeById.get(e.source) }));
    const followedBy = data.edges
      .filter((e) => e.source === n.id && nodeById.has(e.target))
      .map((e) => ({ type: e.type, note: e.note, other: nodeById.get(e.target) }));
    const branch = branchById.get(n.branch);

    infoEl.innerHTML = `
      <button class="gg-3d-close" type="button" aria-label="${esc(strings.close)}">×</button>
      <span class="chip"><span class="dot" style="background:${bColor(n.branch)}"></span>${esc(branch?.title ?? n.branch)}</span>
      <h3>${esc(n.short)}</h3>
      <p class="gg-3d-full">${esc(n.title)}</p>
      <p class="gg-3d-meta">${n.year}${n.venue ? ` · ${esc(n.venue)}` : ''}</p>
      <p class="gg-3d-problem">${esc(n.problem)}</p>
      ${standsOn.length ? `<h4>${esc(strings.standsOn)}</h4><ul class="gg-3d-rels">${relationRows(standsOn)}</ul>` : ''}
      ${followedBy.length ? `<h4>${esc(strings.followedBy)}</h4><ul class="gg-3d-rels">${relationRows(followedBy)}</ul>` : ''}
      <a class="gg-3d-open" href="${root}/nodes/${n.id}/">${esc(strings.openPage)}</a>`;
    infoEl.hidden = false;
    infoEl.querySelector('.gg-3d-close').addEventListener('click', hideInfo);
    resize();
  }

  function hideInfo() {
    infoNode = null;
    infoEl.hidden = true;
    infoEl.innerHTML = '';
    resize();
  }

  // ---- branch filter (driven by the legend chips above the timeline)
  function setFilter(activeIds) {
    const visible = (end) => {
      const n = nodeById.get(end?.id ?? end); // link ends resolve to objects once the sim runs
      return n && activeIds.has(n.branch);
    };
    graph.graphData({
      nodes: allNodes.filter((n) => activeIds.has(n.branch)),
      links: allLinks.filter((l) => visible(l.source) && visible(l.target)),
    });
    for (const [, b] of bubbles) {
      b.mesh.visible = b.title.visible = activeIds.has(b.branch);
    }
    if (infoNode && !activeIds.has(infoNode.branch)) hideInfo();
    setTimeout(() => graph.zoomToFit(400, 46), 650); // re-frame once the sim resettles
  }

  // default view: frame the whole graph tightly. We fit instantly (ms = 0, no
  // camera tween) so the framing is deterministic — a tween can be left half
  // finished, stranding the camera too far out so the cloud looks tiny in a sea
  // of empty space. Fit on settle, with an unconditional fallback in case the
  // engine never emits onEngineStop.
  graph.cooldownTime(5000);
  let fitted = false;
  const frame = () => {
    if (fitted) return;
    fitted = true;
    updateBubbles();
    graph.zoomToFit(0, 46); // breathing room so labels aren't clipped at the edge
  };
  graph.onEngineStop(frame);
  setTimeout(frame, 5500);

  const resize = () => graph.width(el.clientWidth).height(el.clientHeight);
  resize();
  window.addEventListener('resize', resize);

  return { graph, resize, applyTheme, setFilter };
}
