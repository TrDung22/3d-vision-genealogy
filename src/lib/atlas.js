/**
 * The atlas — the genealogy drawn as a timeline map, flat or lifted into 3D.
 *
 * Layout. Rows are research lanes grouped into branch bands; x is time. Each
 * work is a capsule (mark + name) whose left edge sits on its year. The year
 * axis is compressed AND adaptive: a year column starts only once every
 * capsule that points into it has ended, so every relation flows strictly
 * left → right and no name ever runs into the next one. Same-lane, same-year
 * works stack; stacks are ordered by where their parents sit, to cut
 * crossings. Relations between two works of the same year run vertically,
 * from one capsule's edge to the other's.
 *
 * Reading. The chart is sized to the page width (never smaller than a
 * readable scale), so the page's own scroll walks it top to bottom and the
 * wheel never gets hijacked; anything wider scrolls sideways natively.
 * ⌘/Ctrl + wheel, pinch, and the toolbar buttons zoom; zoomed far out the
 * names drop away and the map turns into an overview.
 *
 * 3D. The same map can lift off the page (src/lib/atlas3d.js, loaded on
 * first use): from straight above, at this very scale, the capsules collapse
 * into beads and each branch band rises onto its own glass floor, so debts
 * between branches become bridges. It is one atlas in two modes — selection,
 * the inspector, filters, search, the time machine (which, in 3D, grows the
 * building year by year) and the tours are shared.
 *
 * Interaction. Hover traces a work's direct relations; click (or Enter)
 * selects it — its whole lineage lights up (everything it stands on and
 * everything that descends from it, through fixes / builds-on / challenges /
 * revives; "independent" is kinship, not descent) and the inspector opens.
 * Click a relation to read its whole note. ⌘/Ctrl-click opens the work's page
 * like any link. Filters: branch chips re-layout, kind chips fade, relation
 * chips hide; the time bar replays the field year by year. Guided tours walk
 * recorded relations one at a time. Everything is shareable through the URL:
 * ?view= ?branches= ?kinds= ?edges= ?year= ?focus= ?tour= ?step=.
 *
 * Theme. Colors resolve through CSS custom properties (branch colors are
 * swapped on `themechange`), so a theme switch never re-renders.
 */
import { group, select } from 'd3';

// geometry in content units — the whole drawing is scaled by k on screen
const CAP_H = 21; // capsule height
const PITCH = 25; // vertical step between stacked capsules
const MARK_X = 10.5; // mark center, from the capsule's left edge
const TEXT_X = 19.5; // where the name starts
const PAD_R = 9; // name end → capsule end
const BAND_HEAD = 52; // room for a branch title
const LANE_HEAD = 25; // room for a lane caption
const LANE_FOOT = 8;
const LEFT = 30; // x of the first year
const RIGHT = 40;
const MIN_YEAR_GAP = 40;
const EDGE_GAP = 16; // capsule end → next capsule start, along a relation
const LANE_GAP = 11; // the same, between neighbours in one lane
const LABEL_FONT = '520 12px "Inter Variable", system-ui, sans-serif';

const K_MIN = 0.28;
const K_MAX = 1.8;
const K_READ = 0.66; // the scale a chart too wide for the page opens at
const K_FIT_MIN = 0.6; // … though fitting the page width wins down to here
// … and below this the names get too small to read, so they're dropped
const K_NAMES = 0.5;

const SHAPE_SCALE = { circle: 1, diamond: 1.2, square: 0.86 };
export function shapePath(shape, r) {
  const s = r * (SHAPE_SCALE[shape] ?? 1);
  if (shape === 'diamond') return `M0,${-s}L${s},0L0,${s}L${-s},0Z`;
  if (shape === 'square') return `M${-s},${-s}H${s}V${s}H${-s}Z`;
  return `M${s},0A${s},${s} 0 1,1 ${-s},0A${s},${s} 0 1,1 ${s},0Z`;
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);
// one label rule everywhere: drop the trailing "(Author Year)" / "Year" —
// the axis already says when
export const shortLabel = (s) =>
  String(s)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+(19|20)\d{2}$/, '');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isLight = () => document.documentElement.dataset.theme === 'light';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ''));

export function mountAtlas({ el, data, root, strings: STR }) {
  const $ = (sel) => el.querySelector(sel);
  const svgEl = $('.at-svg');
  const svg = select(svgEl);
  const scroller = $('.at-scroller');
  const stage = $('.at-stage');
  const stage3d = $('.at-3d');
  const captions = $('.at-captions');
  const axisSvg = select($('.at-axis svg'));
  const tooltip = $('.at-tooltip');
  const inspector = document.getElementById('inspector');
  const branchBar = $('.at-branches');
  const kindBar = $('.at-kinds');
  const typeBar = $('.at-types');
  const playBtn = $('.at-play');
  const range = $('.at-range');
  const histo = select($('.at-histo'));
  const readout = $('.at-readout');
  const modeBtns = [...el.querySelectorAll('.at-mode-btn')];
  const bridgesBtn = $('.at-bridges');
  const toursBtn = $('.at-tours-btn');
  const toursMenu = $('.at-tours-menu');
  const fitBtn = $('.at-zoom-fit');
  const status = $('.at-status');
  const announce = $('.at-announce');

  const branchById = new Map(data.branches.map((b) => [b.id, b]));
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const laneById = new Map(data.lanes.map((l) => [l.id, l]));
  const shapeOf = (n) => data.nodeKinds?.[n.kind]?.shape ?? 'circle';
  const typeLabel = (t) => data.edgeTypes[t]?.label ?? t;
  const tours = data.tours ?? [];

  // sanitize once on the full set
  const declared = data.edges.length;
  data.edges = data.edges.filter((e) => nodeById.has(e.source) && nodeById.has(e.target));
  if (data.edges.length < declared) {
    console.warn(`genealogy: skipped ${declared - data.edges.length} edge(s) pointing to missing nodes`);
  }
  data.edges.forEach((e, i) => {
    e.key = i;
    e.crossBranch = nodeById.get(e.source).branch !== nodeById.get(e.target).branch;
  });
  const edgeBetween = (from, to) => data.edges.find((e) => e.source === from && e.target === to) ?? null;

  // ---- branch colors as CSS variables (swapped per theme, never re-rendered);
  // set on the root so the inspector and tooltip — outside the atlas — see them
  const paintBranchVars = () => {
    for (const b of data.branches) {
      document.documentElement.style.setProperty(`--b-${b.id}`, isLight() ? b.colorLight : b.color);
    }
  };
  paintBranchVars();
  const bVar = (id) => `var(--b-${id}, var(--muted))`;

  // ---- lineage on the FULL graph (a filter hides members, it doesn't
  // rewrite history). "independent" is kinship, not descent.
  const parents = group(
    data.edges.filter((e) => e.type !== 'independent'),
    (e) => e.target,
  );
  const children = group(
    data.edges.filter((e) => e.type !== 'independent'),
    (e) => e.source,
  );
  function walk(start, next) {
    const seen = new Set();
    const stack = [start];
    while (stack.length) {
      const id = stack.pop();
      for (const e of next.get(id) ?? []) {
        const other = next === parents ? e.source : e.target;
        if (!seen.has(other)) {
          seen.add(other);
          stack.push(other);
        }
      }
    }
    seen.delete(start);
    return seen;
  }
  const lineageCache = new Map();
  function lineageOf(id) {
    if (!lineageCache.has(id)) {
      lineageCache.set(id, { anc: walk(id, parents), desc: walk(id, children) });
    }
    return lineageCache.get(id);
  }

  // ---- state (seeded from the URL)
  const params = new URLSearchParams(location.search);
  const listParam = (name, valid) => {
    const picked = (params.get(name) ?? '').split(',').filter((v) => valid.includes(v));
    return picked.length ? new Set(picked) : new Set(valid);
  };
  const branchIds = data.branches.filter((b) => data.nodes.some((n) => n.branch === b.id)).map((b) => b.id);
  const kindIds = Object.keys(data.nodeKinds ?? {}).filter((k) => data.nodes.some((n) => n.kind === k));
  const typeIds = Object.keys(data.edgeTypes).filter((t) => data.edges.some((e) => e.type === t));
  let activeBranches = listParam('branches', branchIds);
  let activeKinds = listParam('kinds', kindIds);
  let activeTypes = listParam('edges', typeIds);
  let selectedId = nodeById.has(params.get('focus')) ? params.get('focus') : null;
  let selectedEdge = null; // a relation pinned with a click
  let hoverId = null;
  let hoverEdge = null;
  let focusState = { mode: 'none' };
  let k = 1;
  let view = null;
  let currentIdx = 0;
  let firstRender = true;
  let insetRight = 0; // room to scroll out from under the inspector drawer
  let mode = '2d'; // '2d' | '3d'
  let tour = null; // { def, i } — i = -1 is the tour's cover
  // focus-driven highlights and focus hand-backs are for keyboard users;
  // a mouse click that happens to focus a work shouldn't leave it lit
  let lastInput = 'pointer';
  document.addEventListener('keydown', () => (lastInput = 'keyboard'), true);
  document.addEventListener('pointerdown', () => (lastInput = 'pointer'), true);

  // ---- text measurement (the capsule widths drive the whole x layout)
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = LABEL_FONT;
  const labelOf = (n) => shortLabel(n.short);
  const capW = (n) => Math.ceil(TEXT_X + ctx.measureText(labelOf(n)).width + 2 + PAD_R + (n.hasPost ? 9 : 0));

  // ---------------------------------------------------------------- layout
  function computeView() {
    const nodes = data.nodes.filter((n) => activeBranches.has(n.branch));
    const visible = new Set(nodes.map((n) => n.id));
    const lanes = data.lanes.filter((l) => activeBranches.has(l.branch) && nodes.some((n) => n.lane === l.id));
    const edges = data.edges.filter((e) => visible.has(e.source) && visible.has(e.target));
    const years = [...new Set(nodes.map((n) => n.year))].sort((a, b) => a - b);
    const yearIdx = new Map(years.map((y, i) => [y, i]));
    const w = new Map(nodes.map((n) => [n.id, capW(n)]));

    const stacks = group(nodes, (n) => `${n.lane}@${n.year}`);
    const rowsOf = new Map();
    for (const [key, members] of stacks) {
      const lane = key.slice(0, key.lastIndexOf('@'));
      rowsOf.set(lane, Math.max(rowsOf.get(lane) ?? 1, members.length));
    }

    // vertical: branch bands made of lanes
    const laneTop = new Map();
    const laneMid = new Map();
    const bands = [];
    let y = 10;
    let band = null;
    for (const l of lanes) {
      if (!band || band.branch !== l.branch) {
        if (band) {
          band.bottom = y;
          bands.push(band);
          y += 14;
        }
        band = { branch: l.branch, top: y, bottom: 0, lanes: [] };
        y += BAND_HEAD;
      }
      const rows = rowsOf.get(l.id) ?? 1;
      laneTop.set(l.id, y);
      laneMid.set(l.id, y + LANE_HEAD + (rows * PITCH) / 2);
      band.lanes.push(l.id);
      y += LANE_HEAD + rows * PITCH + LANE_FOOT;
    }
    if (band) {
      band.bottom = y;
      bands.push(band);
    }
    const H = y + 18;

    // horizontal: a year starts once everything pointing into it has ended
    const byYear = group(nodes, (n) => n.year);
    const inbound = group(edges, (e) => e.target);
    const x = new Map();
    const lastInLane = new Map();
    years.forEach((yr, i) => {
      let v = i === 0 ? LEFT : x.get(years[i - 1]) + MIN_YEAR_GAP;
      for (const n of byYear.get(yr)) {
        for (const e of inbound.get(n.id) ?? []) {
          const s = nodeById.get(e.source);
          if (s.year < yr) v = Math.max(v, x.get(s.year) + w.get(s.id) + EDGE_GAP);
        }
        const py = lastInLane.get(n.lane);
        if (py !== undefined) {
          const pw = Math.max(...stacks.get(`${n.lane}@${py}`).map((m) => w.get(m.id)));
          v = Math.max(v, x.get(py) + pw + LANE_GAP);
        }
      }
      x.set(yr, v);
      for (const n of byYear.get(yr)) lastInLane.set(n.lane, yr);
    });
    const lastYear = years.at(-1);
    const W = years.length
      ? x.get(lastYear) + Math.max(...byYear.get(lastYear).map((n) => w.get(n.id))) + RIGHT
      : 400;

    // stacks ordered by the mean height of their already-placed parents
    const pos = new Map();
    for (const yr of years) {
      for (const [lane, members] of group(byYear.get(yr), (n) => n.lane)) {
        const bary = (n) => {
          const ps = (inbound.get(n.id) ?? []).map((e) => pos.get(e.source)).filter(Boolean);
          return ps.length ? ps.reduce((s, p) => s + p.y, 0) / ps.length : Infinity;
        };
        const sorted = [...members].sort((a, b) => bary(a) - bary(b) || a.short.localeCompare(b.short));
        sorted.forEach((n, i) => {
          pos.set(n.id, { x: x.get(yr), y: laneMid.get(lane) + (i - (sorted.length - 1) / 2) * PITCH });
        });
      }
    }

    const nbr = new Map(nodes.map((n) => [n.id, new Set([n.id])]));
    for (const e of edges) {
      nbr.get(e.source).add(e.target);
      nbr.get(e.target).add(e.source);
    }
    return { nodes, lanes, edges, years, yearIdx, x, w, W, H, bands, laneTop, laneMid, pos, nbr };
  }

  // relation path: forward in time → from the source capsule's end to the
  // target capsule's start; same year → vertically, edge to edge, bowing left
  function edgePath(e, v = view) {
    const s = v.pos.get(e.source);
    const t = v.pos.get(e.target);
    if (nodeById.get(e.source).year === nodeById.get(e.target).year) {
      const dir = t.y > s.y ? 1 : -1;
      const x0 = s.x + MARK_X;
      const x1 = t.x + MARK_X;
      const y0 = s.y + (dir * CAP_H) / 2;
      const y1 = t.y - dir * (CAP_H / 2 + 2);
      const bow = Math.min(46, 16 + Math.abs(t.y - s.y) * 0.2);
      return `M${x0},${y0} C${x0 - bow},${y0 + dir * 10} ${x1 - bow},${y1 - dir * 10} ${x1},${y1}`;
    }
    const x0 = s.x + v.w.get(e.source);
    const x1 = t.x - 2;
    const dx = Math.max(14, (x1 - x0) * 0.5);
    return `M${x0},${s.y} C${x0 + dx},${s.y} ${x1 - dx},${t.y} ${x1},${t.y}`;
  }

  // ---------------------------------------------------------------- render
  let nodeSel = select(null);
  let edgeSel = select(null);
  let hitSel = select(null);
  let pulseG = null;
  let nowLine = null;

  function render() {
    view = computeView();
    const { nodes, edges, years, yearIdx, W, H, bands, lanes, laneTop, pos, w } = view;
    // a re-layout can shrink the years axis under the time machine's cursor
    currentIdx = clamp(currentIdx, 0, Math.max(0, years.length - 1));
    three?.setLayout(view, { animate: mode === '3d' });
    svg.selectAll('*').remove();
    const intro = firstRender && !reducedMotion() && !params.has('year') && !selectedId && !params.has('view') && !params.has('tour');
    svgEl.classList.toggle('at-intro', intro);

    const defs = svg.append('defs');
    for (const [type, m] of Object.entries(data.edgeTypes)) {
      defs
        .append('marker')
        .attr('id', `at-arrow-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 9)
        .attr('refY', 0)
        .attr('markerUnits', 'userSpaceOnUse')
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4.2L10,0L0,4.2Z')
        .attr('style', `fill: var(${m.stroke})`);
    }

    const zoomG = svg.append('g').attr('class', 'at-zoom');

    // branch bands + lane rules
    const bandG = zoomG.append('g').attr('class', 'at-bands');
    for (const b of bands) {
      bandG
        .append('rect')
        .attr('class', 'at-band')
        .attr('x', 0)
        .attr('y', b.top)
        .attr('width', W)
        .attr('height', b.bottom - b.top)
        .attr('rx', 10)
        .attr('style', `--bc: ${bVar(b.branch)}`);
      bandG
        .append('rect')
        .attr('class', 'at-band-edge')
        .attr('x', 0)
        .attr('y', b.top + 12)
        .attr('width', 3)
        .attr('height', b.bottom - b.top - 24)
        .attr('rx', 1.5)
        .attr('style', `fill: ${bVar(b.branch)}`);
    }
    lanes.forEach((l, i) => {
      if (i === 0 || lanes[i - 1].branch !== l.branch) return;
      bandG
        .append('line')
        .attr('class', 'at-lane-rule')
        .attr('x1', 14)
        .attr('x2', W - 14)
        .attr('y1', laneTop.get(l.id))
        .attr('y2', laneTop.get(l.id));
    });

    // year gridlines + the time-machine's "now" line
    const gridG = zoomG.append('g').attr('class', 'at-grid');
    for (const yr of years) {
      gridG
        .append('line')
        .attr('x1', view.x.get(yr) + MARK_X)
        .attr('x2', view.x.get(yr) + MARK_X)
        .attr('y1', 6)
        .attr('y2', H - 6);
    }
    nowLine = zoomG.append('line').attr('class', 'at-now').attr('y1', 0).attr('y2', H);

    // relations
    const edgeG = zoomG.append('g').attr('class', 'at-edges');
    edgeSel = edgeG
      .selectAll('path.at-edge')
      .data(edges, (e) => e.key)
      .join('path')
      .attr('class', (e) => `at-edge t-${e.type}${e.crossBranch ? ' x-branch' : ''}`)
      .attr('d', (e) => edgePath(e))
      .attr('style', (e) => {
        const m = data.edgeTypes[e.type];
        const d = intro ? `; --d: ${120 + yearIdx.get(nodeById.get(e.target).year) * 42}ms` : '';
        return `stroke: var(${m.stroke}); --sw: ${m.width}${m.dash ? `; stroke-dasharray: ${m.dash}` : ''}${d}`;
      })
      .attr('marker-end', (e) => `url(#at-arrow-${e.type})`);
    pulseG = zoomG.append('g').attr('class', 'at-pulses');
    hitSel = edgeG
      .selectAll('path.at-edge-hit')
      .data(edges, (e) => e.key)
      .join('path')
      .attr('class', 'at-edge-hit')
      .attr('d', (e) => edgePath(e))
      .on('pointerenter', (ev, e) => {
        if (ev.pointerType === 'touch') return;
        hoverEdge = e;
        paintFocus();
        showTip(ev, edgeTipHtml(e));
      })
      .on('pointermove', (ev, e) => hoverEdge === e && moveTip(ev))
      .on('pointerleave', () => {
        hoverEdge = null;
        paintFocus();
        hideTip();
      })
      .on('click', (_ev, e) => {
        if (dragMoved) return;
        selectEdge(selectedEdge === e ? null : e);
      });

    // works
    const nodeG = zoomG.append('g').attr('class', 'at-nodes');
    nodeSel = nodeG
      .selectAll('a.at-node')
      .data(nodes, (n) => n.id)
      .join((enter) => {
        const a = enter
          .append('a')
          .attr('class', 'at-node')
          .attr('href', (n) => `${root}/nodes/${n.id}/`)
          .attr('data-id', (n) => n.id)
          .attr('aria-label', (n) => `${n.short} — ${n.venue ?? n.year}`)
          .attr('transform', (n) => `translate(${pos.get(n.id).x},${pos.get(n.id).y})`)
          .attr('style', (n) => `--bc: ${bVar(n.branch)}${intro ? `; --d: ${yearIdx.get(n.year) * 42}ms` : ''}`);
        a.append('rect')
          .attr('class', 'at-cap')
          .attr('x', 0)
          .attr('y', -CAP_H / 2)
          .attr('width', (n) => w.get(n.id))
          .attr('height', CAP_H)
          .attr('rx', CAP_H / 2);
        a.filter((n) => n.award)
          .append('path')
          .attr('class', 'at-ring')
          .attr('transform', `translate(${MARK_X},0)`)
          .attr('d', (n) => shapePath(shapeOf(n), 7.4));
        a.append('path')
          .attr('class', 'at-mark')
          .attr('data-shape', (n) => shapeOf(n))
          .attr('transform', `translate(${MARK_X},0)`)
          .attr('d', (n) => shapePath(shapeOf(n), 4.4));
        a.append('text')
          .attr('class', 'at-label')
          .attr('x', TEXT_X)
          .attr('y', 4.2)
          .text((n) => labelOf(n));
        a.filter((n) => n.hasPost)
          .append('circle')
          .attr('class', 'at-article')
          .attr('cx', (n) => w.get(n.id) - PAD_R + 1)
          .attr('r', 2.6);
        return a;
      });

    nodeSel
      .on('click', (ev, n) => {
        // modified clicks keep the native link behaviour (new tab, etc.)
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
        ev.preventDefault();
        if (dragMoved) return;
        selectNode(selectedId === n.id ? null : n.id);
      })
      .on('pointerenter', (ev, n) => {
        if (ev.pointerType === 'touch') return;
        hoverId = n.id;
        paintFocus();
        showTip(ev, nodeTipHtml(n));
      })
      .on('pointermove', (ev, n) => hoverId === n.id && moveTip(ev))
      .on('pointerleave', () => {
        hoverId = null;
        paintFocus();
        hideTip();
      })
      .on('focus', (ev, n) => {
        if (lastInput !== 'keyboard') return;
        hoverId = n.id;
        paintFocus();
        ensureVisible(n.id, false, 'auto');
      })
      .on('blur', () => {
        hoverId = null;
        paintFocus();
      });

    renderCaptions();
    renderAxis();
    renderHistogram();
    renderChips();
    if (mode === '2d') applyZoom(k, null);
    applyYear();
    applyKinds();
    applyTypes();
    paintFocus();

    if (intro) {
      firstRender = false;
      setTimeout(() => svgEl.classList.remove('at-intro'), 2200);
    }
    firstRender = false;
  }

  // ---- branch titles and lane captions: HTML, in a zero-width column that
  // sticks to the left edge while the chart scrolls sideways
  function renderCaptions() {
    const { bands, laneTop } = view;
    const counts = group(view.nodes, (n) => n.branch);
    let html = '';
    for (const b of bands) {
      const br = branchById.get(b.branch);
      html += `<a class="at-cap-branch" data-top="${b.top}" href="${root}/branches/${esc(b.branch)}/" style="--bc: ${bVar(b.branch)}">
        <span class="at-cap-dot"></span><span class="at-cap-title">${esc(br?.title ?? b.branch)}</span>
        <span class="at-cap-count">${counts.get(b.branch)?.length ?? 0}</span></a>`;
      for (const id of b.lanes) {
        html += `<span class="at-cap-lane" data-top="${laneTop.get(id)}">${esc(laneById.get(id)?.title ?? id)}</span>`;
      }
    }
    captions.innerHTML = html;
  }

  function placeCaptions() {
    el.style.setProperty('--k', String(k));
    captions.style.height = `${view.H * k}px`;
    for (const c of captions.children) {
      const top = Number(c.dataset.top) * k;
      c.style.transform = `translateY(${c.classList.contains('at-cap-branch') ? top + 10 * k : top + 4 * k}px)`;
    }
    el.classList.toggle('at-overview', k < K_NAMES);
  }

  // ---- year axis (sticky head): positions follow zoom AND sideways scroll
  let yearLabels = select(null);
  function renderAxis() {
    axisSvg.selectAll('*').remove();
    yearLabels = axisSvg
      .selectAll('text')
      .data(view.years)
      .join('text')
      .attr('class', 'at-year')
      .attr('y', 19)
      .attr('text-anchor', 'middle')
      .text((y) => y);
  }

  function placeAxis() {
    if (mode === '3d') return;
    const sl = scroller.scrollLeft;
    const xs = view.years.map((y) => (view.x.get(y) + MARK_X) * k - sl);
    // keep labels apart: walk left → right, skip any that would collide;
    // the time machine's current year always wins its spot
    const inside = (x) => x >= 16 && x <= scroller.clientWidth - 16;
    const shown = new Set(inside(xs[currentIdx]) ? [currentIdx] : []);
    let last = -Infinity;
    xs.forEach((x, i) => {
      if (i === currentIdx || !inside(x)) return;
      const cx = xs[currentIdx];
      if (x - last >= 40 && Math.abs(x - cx) >= 40) {
        shown.add(i);
        last = x;
      }
    });
    yearLabels
      .attr('x', (_y, i) => xs[i])
      .attr('class', (_y, i) =>
        `at-year${shown.has(i) ? '' : ' is-hidden'}${i > currentIdx ? ' is-future' : ''}${i === currentIdx && currentIdx < view.years.length - 1 ? ' is-now' : ''}`,
      );
  }
  scroller.addEventListener('scroll', () => requestAnimationFrame(placeAxis), { passive: true });

  // ---------------------------------------------------------------- zoom
  const fitK = () => clamp((scroller.clientWidth - 4) / view.W, K_MIN, K_MAX);
  // fit the width while the names stay legible; past that, keep a readable
  // scale and let the chart scroll sideways
  function defaultK() {
    const f = fitK();
    if (f >= K_FIT_MIN) return Math.min(f, 1.15);
    return scroller.clientWidth < 700 ? 0.6 : K_READ;
  }

  // anchor = {clientX, clientY} to zoom around, or null to keep the left edge
  function applyZoom(next, anchor) {
    const prev = k;
    k = clamp(next, K_MIN, K_MAX);
    const r = scroller.getBoundingClientRect();
    let cx = 0;
    let cy = 0;
    if (anchor) {
      cx = (anchor.clientX - r.left + scroller.scrollLeft) / prev;
      cy = (anchor.clientY - r.top) / prev;
    }
    svg.attr('width', Math.ceil(view.W * k)).attr('height', Math.ceil(view.H * k));
    svg.select('.at-zoom').attr('transform', `scale(${k})`);
    stage.style.width = `${Math.ceil(view.W * k) + insetRight}px`;
    stage.style.height = `${Math.ceil(view.H * k)}px`;
    placeCaptions();
    if (anchor) {
      scroller.scrollLeft = cx * k - (anchor.clientX - r.left);
      window.scrollBy(0, cy * k - cy * prev);
    }
    placeAxis();
    placeNow();
    scroller.classList.toggle('can-pan', view.W * k + insetRight > scroller.clientWidth + 2);
  }

  // in 3D the same buttons move the camera: closer, further, home
  $('.at-zoom-in').addEventListener('click', () => (mode === '3d' ? three?.zoom(1.25) : applyZoom(k * 1.25, centerAnchor())));
  $('.at-zoom-out').addEventListener('click', () => (mode === '3d' ? three?.zoom(1 / 1.25) : applyZoom(k / 1.25, centerAnchor())));
  fitBtn.addEventListener('click', () => {
    if (mode === '3d') return three?.resetView();
    applyZoom(fitK(), null);
    scroller.scrollLeft = 0;
    el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });
  function centerAnchor() {
    const r = scroller.getBoundingClientRect();
    return { clientX: r.left + r.width / 2, clientY: clamp(innerHeight / 2, r.top, r.bottom) };
  }

  // ⌘/Ctrl + wheel and trackpad pinch (which arrives as ctrl+wheel) zoom;
  // a plain wheel is left alone so the page keeps scrolling
  scroller.addEventListener(
    'wheel',
    (ev) => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      applyZoom(k * Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0022)), ev);
    },
    { passive: false },
  );

  // mouse drag pans (sideways inside the chart, vertically through the page)
  let drag = null;
  let dragMoved = false;
  scroller.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
    drag = { x: ev.clientX, y: ev.clientY, sl: scroller.scrollLeft, sy: window.scrollY };
    dragMoved = false;
  });
  window.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (!dragMoved && Math.hypot(dx, dy) < 5) return;
    if (!dragMoved) {
      dragMoved = true;
      scroller.classList.add('is-dragging');
      hideTip();
    }
    scroller.scrollLeft = drag.sl - dx;
    window.scrollTo(window.scrollX, drag.sy - dy);
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    drag = null;
    scroller.classList.remove('is-dragging');
    // let the click that ends a drag see dragMoved, then reset
    setTimeout(() => (dragMoved = false), 0);
  });
  svgEl.addEventListener('click', (ev) => {
    if (dragMoved) return;
    if (!ev.target.closest('.at-node, .at-edge-hit') && (selectedId || selectedEdge)) selectNode(null);
  });

  // ---------------------------------------------------------------- focus
  // One answer to "what is in focus" for both modes: a role for every work
  // and every relation. Hover wins while it lasts; a relation (hovered, or
  // pinned with a click) is its own mode; otherwise the selected lineage.
  function focusRoles() {
    const roles = new Map();
    const edgeRoles = new Map();
    const rel = hoverId && hoverId !== selectedId ? null : (hoverEdge ?? (selectedId ? null : selectedEdge));
    if (rel) {
      for (const n of view.nodes) roles.set(n.id, n.id === rel.source || n.id === rel.target ? 'near' : 'dim');
      for (const e of view.edges) edgeRoles.set(e.key, e === rel ? 'direct' : 'dim');
      return { mode: 'edge', edge: rel, roles, edgeRoles };
    }
    if (hoverId && hoverId !== selectedId) {
      const near = view.nbr.get(hoverId) ?? new Set([hoverId]);
      for (const n of view.nodes) roles.set(n.id, n.id === hoverId ? 'hover' : near.has(n.id) ? 'near' : 'dim');
      for (const e of view.edges) edgeRoles.set(e.key, e.source === hoverId || e.target === hoverId ? 'direct' : 'dim');
      return { mode: 'hover', id: hoverId, roles, edgeRoles };
    }
    if (!selectedId) return { mode: 'none' };
    // lineage of the selected work
    const id = selectedId;
    const { anc, desc } = lineageOf(id);
    const peers = new Set(
      data.edges
        .filter((e) => e.type === 'independent' && (e.source === id || e.target === id))
        .map((e) => (e.source === id ? e.target : e.source)),
    );
    for (const n of view.nodes) {
      roles.set(n.id, n.id === id ? 'sel' : anc.has(n.id) ? 'anc' : desc.has(n.id) ? 'desc' : peers.has(n.id) ? 'peer' : 'dim');
    }
    const ancSide = (e) => anc.has(e.source) && (anc.has(e.target) || e.target === id);
    const descSide = (e) => (desc.has(e.source) || e.source === id) && desc.has(e.target);
    for (const e of view.edges) {
      if (e.source === id || e.target === id) edgeRoles.set(e.key, 'direct');
      else edgeRoles.set(e.key, e.type !== 'independent' && (ancSide(e) || descSide(e)) ? 'lit' : 'dim');
    }
    return { mode: 'lineage', id, roles, edgeRoles };
  }

  // one painter for hover, edge focus and selection, in both modes
  function paintFocus() {
    if (!view) return;
    const f = focusRoles();
    focusState = f;
    three?.setFocus(f);
    svgEl.classList.toggle('is-focusing', f.mode !== 'none');
    pulseG.selectAll('*').remove();
    nodeSel.attr('data-role', (n) => f.roles?.get(n.id) ?? null);
    edgeSel.attr('data-role', (e) => f.edgeRoles?.get(e.key) ?? null);
    // the relation filter hides a kind of debt — except the one in focus
    const typeOff = (e) => !activeTypes.has(e.type) && !(f.mode === 'edge' && e === f.edge);
    edgeSel.classed('is-type-off', typeOff);
    hitSel.classed('is-type-off', typeOff);
    if (reducedMotion() || mode === '3d') return;
    // light pulses travel along the relation in focus — the debt itself,
    // flowing from the older work into the newer one — or along the
    // selected work's own relations
    let pulses = [];
    let color = null;
    if (f.mode === 'edge') {
      pulses = [f.edge];
      color = (e) => (e.type === 'challenges' ? 'var(--danger)' : bVar(nodeById.get(e.target).branch));
    } else if (f.mode === 'lineage') {
      pulses = view.edges.filter((e) => (e.source === f.id || e.target === f.id) && activeTypes.has(e.type));
      color = () => bVar(nodeById.get(f.id).branch);
    }
    pulseG
      .selectAll('path')
      .data(pulses)
      .join('path')
      .attr('class', 'at-pulse')
      .attr('d', (e) => edgePath(e))
      .attr('style', (e) => `stroke: ${color(e)}`);
  }

  // ---------------------------------------------------------------- tooltip
  function showTip(ev, html) {
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    moveTip(ev);
  }
  function moveTip(ev) {
    const pad = 14;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let x = ev.clientX + pad;
    let y = ev.clientY + pad;
    if (x + tw > innerWidth - 8) x = ev.clientX - tw - pad;
    if (y + th > innerHeight - 8) y = ev.clientY - th - pad;
    tooltip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
  function hideTip() {
    tooltip.hidden = true;
  }
  const venueHtml = (n) =>
    `${n.venue ? esc(n.venue) : n.year}${n.award ? ' <span class="award-star" aria-hidden="true">★</span>' : ''}`;
  const nodeTipHtml = (n) => `
    <span class="tip-kicker" style="--bc: ${bVar(n.branch)}">${esc(branchById.get(n.branch)?.title ?? '')} · ${esc(laneById.get(n.lane)?.title ?? '')}</span>
    <strong class="tip-title">${esc(n.short)}</strong>
    <span class="tip-meta">${venueHtml(n)}${n.kind !== 'method' ? ` · ${esc(data.nodeKinds[n.kind]?.label ?? n.kind)}` : ''}</span>
    <p>${esc(truncate(n.problem, 150))}</p>
    <span class="tip-hint">${esc(selectedId === n.id ? STR.tipDeselect : STR.tipSelect)}</span>`;
  const branchTitle = (n) => branchById.get(n.branch)?.title ?? n.branch;
  // where a relation runs: within one branch, or a bridge from one to another
  const whereOf = (e) => {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    return e.crossBranch ? `${STR.bridge} · ${branchTitle(s)} → ${branchTitle(t)}` : `${STR.within} ${branchTitle(s)}`;
  };
  const relHead = (e) =>
    `<strong>${esc(labelOf(nodeById.get(e.target)))}</strong> <em class="t-${esc(e.type)}">${esc(typeLabel(e.type))}</em> <strong>${esc(labelOf(nodeById.get(e.source)))}</strong>`;
  const whenOf = (e) => {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    const gap = t.year - s.year;
    if (!gap) return `${t.year} · ${STR.sameYear}`;
    return `${s.year} → ${t.year} · ${gap === 1 ? STR.yearLater : fill(STR.yearsLater, { n: gap })}`;
  };
  const edgeTipHtml = (e) => `
    <span class="tip-kicker tip-kicker-rel">${esc(whereOf(e))}</span>
    <span class="tip-rel">${relHead(e)}</span>
    <span class="tip-meta">${esc(whenOf(e))}</span>
    ${e.note ? `<p>${esc(truncate(e.note, 220))}</p>` : ''}
    <span class="tip-hint">${esc(selectedEdge === e ? STR.tipRelDeselect : STR.tipRel)}</span>`;

  // ---------------------------------------------------------------- inspector
  const relGlyph = (type) => {
    const m = data.edgeTypes[type];
    return `<svg class="edge-glyph" width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" style="stroke: var(${m.stroke})" stroke-width="${m.width}"${m.dash ? ` stroke-dasharray="${m.dash}"` : ''} stroke-linecap="round"/></svg>`;
  };
  function relList(list) {
    return list
      .map(
        (r) => `<li>
          <button type="button" class="insp-rel" data-goto="${esc(r.other.id)}" style="--bc: ${bVar(r.other.branch)}">
            ${relGlyph(r.type)}<span class="insp-rel-type">${esc(typeLabel(r.type))}</span>
            <span class="insp-rel-name">${esc(r.other.short)}</span>
          </button>
          ${r.note ? `<p class="insp-note">${esc(r.note)}</p>` : ''}
        </li>`,
      )
      .join('');
  }
  const LINK_LABELS = { arxiv: 'arXiv', paper: STR.linkPaper, project: STR.linkProject, code: STR.linkCode };
  const closeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
  const dot = (n) => `<span class="dot" style="background:${bVar(n.branch)}"></span>`;

  function showInspector(html, branch) {
    inspector.innerHTML = `<div class="insp-scroll">${html}</div>`;
    inspector.hidden = false;
    inspector.style.setProperty('--bc', bVar(branch));
    inspector.classList.toggle('is-tour', Boolean(tour));
    requestAnimationFrame(() => inspector.classList.add('is-open'));
    inspector.querySelector('.insp-scroll').scrollTop = 0;
  }

  function openInspector(n) {
    const br = branchById.get(n.branch);
    const standsOn = data.edges
      .filter((e) => e.target === n.id)
      .map((e) => ({ type: e.type, note: e.note, other: nodeById.get(e.source) }))
      .sort((a, b) => b.other.year - a.other.year);
    const followedBy = data.edges
      .filter((e) => e.source === n.id)
      .map((e) => ({ type: e.type, note: e.note, other: nodeById.get(e.target) }))
      .sort((a, b) => a.other.year - b.other.year);
    const { anc, desc } = lineageOf(n.id);
    const authors = n.authors
      ? n.authors.split(/,\s*/).length > 4
        ? `${n.authors.split(/,\s*/).slice(0, 3).join(', ')} et al.`
        : n.authors
      : '';
    const links = Object.entries(n.links ?? {})
      .slice(0, 3)
      .map(([key, url]) => `<a class="btn btn-sm" href="${esc(url)}" target="_blank" rel="noopener">${esc(LINK_LABELS[key] ?? key)} ↗</a>`)
      .join('');
    showInspector(
      `<div class="insp-top">
          <span class="chip">${dot(n)}${esc(br?.title ?? '')} · ${esc(laneById.get(n.lane)?.title ?? '')}</span>
          <button type="button" class="icon-btn insp-close" aria-label="${esc(STR.close)}">${closeIcon}</button>
        </div>
        <h2 class="insp-title" tabindex="-1">${esc(n.short)}</h2>
        <p class="insp-full">${esc(n.title)}</p>
        <p class="insp-meta">${venueHtml(n)}${n.kind !== 'method' ? ` <span class="badge">${esc(data.nodeKinds[n.kind]?.label ?? n.kind)}</span>` : ''}</p>
        ${authors ? `<p class="insp-authors">${esc(authors)}</p>` : ''}
        <div class="insp-actions">
          <a class="btn btn-sm btn-primary" href="${root}/nodes/${esc(n.id)}/">${esc(STR.openPage)}</a>${links}
        </div>
        <div class="insp-lineage">
          <div><b>${standsOn.length}</b><span>${esc(STR.statParents)}</span></div>
          <div><b>${followedBy.length}</b><span>${esc(STR.statChildren)}</span></div>
          <div class="is-anc"><b>${anc.size}</b><span>${esc(STR.statAncestors)}</span></div>
          <div class="is-desc"><b>${desc.size}</b><span>${esc(STR.statDescendants)}</span></div>
        </div>
        <h3 class="insp-h">${esc(kindIsAnalysis(n) ? STR.question : STR.problem)}</h3>
        <p class="insp-problem">${esc(n.problem)}</p>
        ${standsOn.length ? `<h3 class="insp-h">${esc(STR.standsOn)}</h3><ul class="insp-rels">${relList(standsOn)}</ul>` : ''}
        ${followedBy.length ? `<h3 class="insp-h">${esc(STR.followedBy)}</h3><ul class="insp-rels">${relList(followedBy)}</ul>` : ''}
        ${!standsOn.length && !followedBy.length ? `<p class="muted">${esc(STR.root)}</p>` : ''}`,
      n.branch,
    );
  }
  const kindIsAnalysis = (n) => n.kind === 'analysis';

  // a relation: the debt itself, both works, the whole note
  const endButton = (n) =>
    `<li><button type="button" class="insp-rel insp-end" data-goto="${esc(n.id)}" style="--bc: ${bVar(n.branch)}">${dot(n)}<span class="insp-rel-name">${esc(n.short)}</span><span class="insp-end-meta">${n.year} · ${esc(branchTitle(n))}</span></button></li>`;
  function relationBody(e) {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    return `<span class="chip">${dot(s)}${e.crossBranch ? dot(t) : ''}${esc(whereOf(e))}</span>
      <h2 class="insp-title insp-rel-title" tabindex="-1">${relHead(e)}</h2>
      <p class="insp-meta">${esc(whenOf(e))}</p>
      ${e.note ? `<p class="insp-problem insp-relnote">${esc(e.note)}</p>` : ''}`;
  }
  function openRelation(e) {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    showInspector(
      `<div class="insp-top insp-top-end">
          <button type="button" class="icon-btn insp-close" aria-label="${esc(STR.close)}">${closeIcon}</button>
        </div>
        ${relationBody(e)}
        <h3 class="insp-h">${esc(STR.theTwo)}</h3>
        <ul class="insp-rels">${endButton(t)}${endButton(s)}</ul>
        <div class="insp-actions">
          <a class="btn btn-sm btn-primary" href="${root}/nodes/${esc(t.id)}/">${esc(fill(STR.openWork, { name: labelOf(t) }))}</a>
          <a class="btn btn-sm" href="${root}/nodes/${esc(s.id)}/">${esc(fill(STR.openWork, { name: labelOf(s) }))}</a>
        </div>`,
      t.branch,
    );
  }

  function closeInspector() {
    inspector.classList.remove('is-open', 'is-tour');
    inspector.hidden = true;
    inspector.innerHTML = '';
  }

  inspector.addEventListener('click', (ev) => {
    if (ev.target.closest('.insp-close')) {
      if (tour) return endTour();
      return selectNode(null, { returnFocus: true });
    }
    if (ev.target.closest('[data-tour-next]')) return tourStep(1);
    if (ev.target.closest('[data-tour-prev]')) return tourStep(-1);
    const go = ev.target.closest('[data-goto]');
    if (go) selectNode(go.dataset.goto, { scroll: true, focusInspector: true });
  });

  const nodeEl = (id) => svgEl.querySelector(`a.at-node[data-id="${CSS.escape(id)}"]`);

  // the inspector belongs to the atlas: out of view (or not yet scrolled
  // into), out of the way — and out of the tab order
  let atlasInView = true;
  let headLow = false;
  function updateAway() {
    const away = !atlasInView || headLow;
    inspector.classList.toggle('is-away', away);
    inspector.inert = away;
  }
  new IntersectionObserver(
    ([entry]) => {
      atlasInView = entry.isIntersecting;
      updateAway();
    },
    { rootMargin: '-120px 0px -120px 0px' },
  ).observe(el);

  // ---------------------------------------------------------------- selection
  // (a reader's own pick ends a running tour; the tour's own picks don't)
  function selectNode(id, { scroll = false, focusInspector = false, returnFocus = false, fromTour = false, inspect = true } = {}) {
    if (id && !nodeById.has(id)) return;
    if (tour && !fromTour) leaveTour({ reshow: false });
    const prev = selectedId;
    // focus that lives in the inspector would vanish with its content
    const focusInside = inspector.contains(document.activeElement) || document.activeElement === document.body;
    // selecting a work of a hidden branch brings that branch back
    if (id && !activeBranches.has(nodeById.get(id).branch)) {
      const keepYear = view.years[currentIdx] ?? Infinity;
      activeBranches.add(nodeById.get(id).branch);
      selectedId = id;
      render();
      const idx = view.years.findLastIndex((y) => y <= keepYear);
      setYearIdx(idx === -1 ? 0 : idx);
    }
    // … and a work beyond the time machine's cursor rewinds it forward
    if (id && view.yearIdx.get(nodeById.get(id).year) > currentIdx) {
      setYearIdx(view.years.length - 1);
    }
    selectedId = id;
    selectedEdge = null;
    hoverId = null;
    hideTip();
    paintFocus();
    if (id && inspect) openInspector(nodeById.get(id));
    else if (!tour) closeInspector();
    setInset();
    placeDrawer();
    syncUrl();
    // next frame: a smooth scroll started inside the click's own task can be
    // swallowed by the drawer's opening frame
    if (id && !fromTour) requestAnimationFrame(() => ensureVisible(id, scroll));
    if (lastInput === 'keyboard') {
      if (id && focusInspector) inspector.querySelector('.insp-title')?.focus({ preventScroll: true });
      // (in 3D the works are beads, not links: focus goes back to the stage)
      if (!id && prev && (returnFocus || focusInside)) (mode === '3d' ? stage3d : nodeEl(prev))?.focus({ preventScroll: true });
    }
  }

  function selectEdge(e, { fromTour = false } = {}) {
    if (tour && !fromTour) leaveTour({ reshow: false });
    selectedEdge = e;
    selectedId = null;
    hoverEdge = null;
    hideTip();
    paintFocus();
    if (e && !fromTour) openRelation(e);
    else if (!e && !tour) closeInspector();
    setInset();
    placeDrawer();
    syncUrl();
  }

  // The inspector covers part of the chart — a drawer on the right on a desk,
  // a sheet at the bottom on a phone. While it is open the chart gains room
  // to scroll out from under the drawer (in 3D, the picture slides out from
  // under it), and the selected work is kept in the part that stays visible.
  const drawer = () => innerWidth > 900;
  let insetTimer = null;
  function setInset() {
    if (three) three.setInset(inset3d());
    const next = !inspector.hidden && drawer() ? inspector.offsetWidth + 28 : 0;
    const apply = () => {
      insetRight = next;
      stage.style.width = `${Math.ceil(view.W * k) + insetRight}px`;
      scroller.classList.toggle('can-pan', view.W * k + insetRight > scroller.clientWidth + 2);
    };
    clearTimeout(insetTimer);
    // closing: glide back first, so the room doesn't vanish with a jump
    const max = Math.max(0, Math.ceil(view.W * k) + next - scroller.clientWidth);
    if (mode === '2d' && next < insetRight && scroller.scrollLeft > max + 1 && !reducedMotion()) {
      scroller.scrollTo({ left: max, behavior: 'smooth' });
      insetTimer = setTimeout(apply, 400);
    } else {
      apply();
    }
  }
  // how much of the 3D stage the inspector covers
  function inset3d() {
    if (inspector.hidden || mode !== '3d') return { right: 0, bottom: 0 };
    const s = stage3d.getBoundingClientRect();
    if (drawer()) return { right: Math.max(0, s.right - (innerWidth - 12 - inspector.offsetWidth) + 16), bottom: 0 };
    const top = innerHeight - inspector.offsetHeight;
    return { right: 0, bottom: clamp(s.bottom - top, 0, s.height * 0.62) };
  }

  const headerH = () =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 60;

  // The drawer sits between the atlas head and the time bar — wherever those
  // two sticky bars actually are — so it never covers a control.
  function placeDrawer() {
    const h = $('.at-head').getBoundingClientRect();
    // above the atlas (its head still low on screen) the inspector steps aside
    headLow = h.top > innerHeight * 0.45;
    updateAway();
    if (inspector.hidden || !drawer()) {
      inspector.style.top = inspector.style.bottom = '';
      return;
    }
    const b = $('.at-timebar').getBoundingClientRect();
    const top = `${Math.round(clamp(h.bottom + 10, headerH() + 10, innerHeight * 0.5))}px`;
    const bottom = `${Math.round(clamp(innerHeight - b.top + 10, 10, innerHeight * 0.5))}px`;
    // once both bars are pinned these stop changing: skip the no-op writes
    if (inspector.style.top !== top) inspector.style.top = top;
    if (inspector.style.bottom !== bottom) inspector.style.bottom = bottom;
  }
  window.addEventListener('scroll', () => requestAnimationFrame(placeDrawer), { passive: true });

  // the pulses rest while anything scrolls: cheaper frames, smoother scrolling
  let scrollRest = null;
  const markScrolling = () => {
    el.classList.add('is-scrolling');
    clearTimeout(scrollRest);
    scrollRest = setTimeout(() => el.classList.remove('is-scrolling'), 200);
  };
  window.addEventListener('scroll', markScrolling, { passive: true });
  scroller.addEventListener('scroll', markScrolling, { passive: true });
  window.addEventListener('resize', () =>
    requestAnimationFrame(() => {
      placeDrawer();
      if (mode === '3d') {
        sizeStage();
        setInset();
      }
    }),
  );

  // center = bring it to the middle of the visible part (search, deep links,
  // walking the inspector); otherwise scroll only as far as it takes. The
  // vertical target is solved for where the sticky head will END UP: it
  // only pins under the site header once the atlas top has scrolled past.
  function ensureVisible(id, center = false, behavior = reducedMotion() ? 'auto' : 'smooth') {
    if (mode === '3d') {
      // the stage first (it fills the screen once the head is pinned), then the camera
      const atlasTop = el.getBoundingClientRect().top + window.scrollY;
      const pinned = atlasTop - headerH();
      if (Math.abs(window.scrollY - pinned) > 2 && (center || !stageInView())) window.scrollTo({ top: pinned, behavior });
      three?.ensureVisible(id, center);
      return;
    }
    const p = view.pos.get(id);
    if (!p) return;
    const m = 28;
    // sideways, inside the chart
    const sr = scroller.getBoundingClientRect();
    const left = sr.left - scroller.scrollLeft + p.x * k;
    const right = left + view.w.get(id) * k;
    const vl = sr.left;
    const vr = sr.right - insetRight;
    let dx = 0;
    if (center) dx = (left + right) / 2 - (vl + vr) / 2;
    else if (right > vr - m) dx = right - (vr - m);
    else if (left < vl + m) dx = left - (vl + m);
    // keep the request inside the scrollable range, so the animation ends where it aims
    dx = clamp(dx, -scroller.scrollLeft, scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft);
    if (Math.abs(dx) > 1) scroller.scrollBy({ left: dx, behavior });

    // vertically, through the page (document coordinates)
    const sy = window.scrollY;
    const hh = headerH();
    const headH = $('.at-head').offsetHeight;
    const nodeH = CAP_H * k;
    const atlasTop = el.getBoundingClientRect().top + sy;
    const nodeTop = svgEl.getBoundingClientRect().top + sy + (p.y - CAP_H / 2) * k;
    const sheetTop = !drawer() && !inspector.hidden ? inspector.getBoundingClientRect().top : innerHeight;
    const visBottom = Math.min(sheetTop, innerHeight - $('.at-timebar').offsetHeight);
    const stuck = (y) => y >= atlasTop - hh;
    let target = sy;
    if (center) {
      target = nodeTop - ((hh + headH + visBottom) / 2 - nodeH / 2);
      // not pinned yet at that scroll: the head still sits on the atlas top
      if (!stuck(target)) target = Math.min(2 * nodeTop + nodeH - atlasTop - headH - visBottom, atlasTop - hh);
    } else {
      const visTop = Math.max(hh, atlasTop - sy) + headH;
      if (nodeTop + nodeH - sy > visBottom - m) target = nodeTop + nodeH - (visBottom - m);
      else if (nodeTop - sy < visTop + m) target = nodeTop - (hh + headH + m);
    }
    // with the inspector open, step all the way into the atlas: head pinned
    if ((selectedId || selectedEdge) && !inspector.hidden) target = Math.max(target, atlasTop - hh);
    if (Math.abs(target - sy) > 1) window.scrollTo({ top: Math.max(0, target), behavior });
  }
  const stageInView = () => {
    const r = stage3d.getBoundingClientRect();
    return r.top >= headerH() - 2 && r.bottom <= innerHeight + 2;
  };

  window.addEventListener('atlas:focus', (ev) => selectNode(ev.detail?.id, { scroll: true }));
  window.addEventListener('atlas:tour', (ev) => startTour(ev.detail?.id ?? tours[0]?.id));
  document.addEventListener('keydown', (ev) => {
    if (document.querySelector('dialog[open]')) return;
    if (ev.key === 'Escape') {
      if (toursMenu && !toursMenu.hidden) return closeToursMenu(true);
      if (tour) return endTour();
      if (selectedId || selectedEdge) selectNode(null);
      return;
    }
    // a tour turns its pages with the arrow keys — plain ones (Alt+← is the
    // browser's Back), while the atlas is on screen, unless something in it
    // wants them (the year slider, the 3D stage)
    if (!tour || (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft')) return;
    if (ev.altKey || ev.metaKey || ev.ctrlKey || ev.shiftKey || !atlasInView || headLow) return;
    const t = ev.target;
    const ours = t === document.body || inspector.contains(t) || (el.contains(t) && !t.closest('input, textarea, select, .at-3d'));
    if (!ours) return;
    ev.preventDefault();
    tourStep(ev.key === 'ArrowRight' ? 1 : -1);
  });

  // ---------------------------------------------------------------- time machine
  function setYearIdx(idx) {
    currentIdx = clamp(idx, 0, view.years.length - 1);
    range.value = String(currentIdx);
    applyYear();
  }

  function applyYear() {
    const { years, yearIdx, nodes } = view;
    const future = (id) => yearIdx.get(nodeById.get(id).year) > currentIdx;
    nodeSel.classed('is-future', (n) => yearIdx.get(n.year) > currentIdx);
    edgeSel.classed('is-future', (e) => future(e.source) || future(e.target));
    hitSel.classed('is-future', (e) => future(e.source) || future(e.target));
    const shown = nodes.filter((n) => yearIdx.get(n.year) <= currentIdx).length;
    readout.innerHTML = `<b>${years[currentIdx] ?? ''}</b><span>${shown}/${nodes.length}</span>`;
    range.setAttribute('aria-valuetext', `${years[currentIdx]} — ${shown} / ${nodes.length}`);
    histo.selectAll('.at-histo-col').classed('is-future', (_d, i) => i > currentIdx);
    histo.select('.at-histo-cursor').attr('transform', `translate(${histoX(currentIdx)},0)`);
    // (a tour stop is a close-up: the time machine moves, its sheet stays out of it)
    three?.setYear(currentIdx, { playing: isPlaying, quiet: Boolean(tour) });
    placeAxis();
    placeNow();
    syncUrl();
  }

  function placeNow() {
    if (!nowLine || !view.years.length) return;
    const at = view.years[currentIdx];
    const playingOrPast = currentIdx < view.years.length - 1;
    const x = view.x.get(at) + MARK_X;
    nowLine.attr('x1', x).attr('x2', x).classed('is-on', playingOrPast);
  }

  // Replaying the years. Flat, at a steady beat; in 3D, a busy year takes
  // longer — there is more to watch arrive.
  let playTimer = null;
  let isPlaying = false;
  const stepDelay = (idx) => {
    if (mode !== '3d') return 650;
    const n = view.nodes.filter((x) => x.year === view.years[idx]).length;
    return clamp(380 + n * 110, 560, 1800);
  };
  function stopPlay() {
    clearTimeout(playTimer);
    playTimer = null;
    if (!isPlaying) return;
    isPlaying = false;
    playBtn.classList.remove('is-playing');
    setPlayLabel();
    three?.setYear(currentIdx, { playing: false, quiet: Boolean(tour) });
  }
  function setPlayLabel() {
    const label = isPlaying ? STR.pause : mode === '3d' ? STR.play3d : STR.play;
    playBtn.setAttribute('aria-label', label);
    playBtn.title = label;
  }
  function startPlay() {
    if (tour) leaveTour();
    hideStatus();
    isPlaying = true;
    playBtn.classList.add('is-playing');
    setPlayLabel();
    if (currentIdx >= view.years.length - 1) setYearIdx(0);
    else applyYear();
    followYear();
    const tick = () => {
      playTimer = setTimeout(() => {
        if (currentIdx >= view.years.length - 1) return stopPlay();
        setYearIdx(currentIdx + 1);
        followYear();
        if (currentIdx >= view.years.length - 1) playTimer = setTimeout(stopPlay, 600);
        else tick();
      }, stepDelay(currentIdx + 1));
    };
    tick();
  }
  playBtn.addEventListener('click', () => (isPlaying ? stopPlay() : startPlay()));
  // while replaying, keep the current year in view if the chart overflows
  function followYear() {
    if (mode === '3d' || scroller.scrollWidth <= scroller.clientWidth) return;
    const x = (view.x.get(view.years[currentIdx]) + MARK_X) * k;
    if (x > scroller.scrollLeft + scroller.clientWidth * 0.7 || x < scroller.scrollLeft) {
      scroller.scrollTo({ left: x - scroller.clientWidth * 0.4, behavior: 'smooth' });
    }
  }
  range.addEventListener('input', () => {
    stopPlay();
    setYearIdx(Number(range.value));
    followYear();
  });

  // histogram of works per year, stacked by branch — it doubles as the track
  let histoW = 0;
  const histoX = (i) => (view.years.length ? ((i + 0.5) * histoW) / view.years.length : 0);
  function renderHistogram() {
    histoW = Math.max(120, $('.at-histo-wrap').clientWidth);
    const H = 34;
    histo.attr('width', histoW).attr('height', H).attr('viewBox', `0 0 ${histoW} ${H}`);
    histo.selectAll('*').remove();
    const { years } = view;
    range.max = String(Math.max(0, years.length - 1));
    const per = group(view.nodes, (n) => n.year);
    const max = Math.max(1, ...years.map((y) => per.get(y)?.length ?? 0));
    const colW = histoW / Math.max(1, years.length);
    const barW = Math.max(2, Math.min(18, colW - 3));
    years.forEach((yr, i) => {
      const col = histo.append('g').attr('class', 'at-histo-col');
      let y0 = H - 2;
      for (const b of data.branches) {
        const c = (per.get(yr) ?? []).filter((n) => n.branch === b.id).length;
        if (!c) continue;
        const h = Math.max(2, (c / max) * (H - 8));
        col
          .append('rect')
          .attr('x', histoX(i) - barW / 2)
          .attr('y', y0 - h)
          .attr('width', barW)
          .attr('height', h - 0.6)
          .attr('rx', 1.2)
          .attr('style', `fill: ${bVar(b.id)}`);
        y0 -= h;
      }
    });
    const cur = histo.append('g').attr('class', 'at-histo-cursor');
    cur.append('line').attr('y1', 0).attr('y2', H);
  }
  new ResizeObserver(() => {
    if (!view) return;
    renderHistogram();
    applyYear();
  }).observe($('.at-histo-wrap'));

  // ---------------------------------------------------------------- filters
  function chipButton({ attr, id, on, label, count, swatch, title }) {
    return `<button type="button" class="at-chip${on ? '' : ' is-off'}" ${attr}="${esc(id)}" aria-pressed="${on}" title="${esc(title)}">${swatch}<span>${esc(label)}</span>${count !== undefined ? `<span class="at-chip-n">${count}</span>` : ''}</button>`;
  }
  function renderChips() {
    const count = group(data.nodes, (n) => n.branch);
    branchBar.innerHTML = branchIds
      .map((id) =>
        chipButton({
          attr: 'data-branch',
          id,
          on: activeBranches.has(id),
          label: branchById.get(id).title,
          count: count.get(id)?.length ?? 0,
          swatch: `<span class="at-chip-dot" style="--bc: ${bVar(id)}"></span>`,
          title: STR.filterHint,
        }),
      )
      .join('');
    kindBar.innerHTML = kindIds
      .map((kd) =>
        chipButton({
          attr: 'data-kind',
          id: kd,
          on: activeKinds.has(kd),
          label: data.nodeKinds[kd].label,
          swatch: `<svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true"><path d="${shapePath(data.nodeKinds[kd].shape, 4.2)}"/></svg>`,
          title: STR.kindHint,
        }),
      )
      .join('');
    typeBar.innerHTML = typeIds
      .map((t) =>
        chipButton({
          attr: 'data-type',
          id: t,
          on: activeTypes.has(t),
          label: typeLabel(t),
          swatch: relGlyph(t),
          title: `${data.edgeTypes[t].description} — ${STR.typeHint}`,
        }),
      )
      .join('');
  }

  // click = toggle, alt-click = solo (alt-click again = everything back);
  // a filter is never allowed to empty itself
  function toggle(set, all, id, solo) {
    if (solo) return set.size === 1 && set.has(id) ? new Set(all) : new Set([id]);
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next.size ? next : new Set(all);
  }

  el.querySelector('.at-filters').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.at-chip');
    if (!chip) return;
    if (chip.dataset.branch) {
      activeBranches = toggle(activeBranches, branchIds, chip.dataset.branch, ev.altKey);
      if (selectedId && !activeBranches.has(nodeById.get(selectedId).branch)) {
        selectedId = null;
        if (!tour) closeInspector();
      }
      if (selectedEdge && !(activeBranches.has(nodeById.get(selectedEdge.source).branch) && activeBranches.has(nodeById.get(selectedEdge.target).branch))) {
        selectedEdge = null;
        if (!tour) closeInspector();
      }
      stopPlay();
      const keepYear = view.years[currentIdx] ?? Infinity;
      render();
      const idx = view.years.findLastIndex((y) => y <= keepYear);
      setYearIdx(idx === -1 ? 0 : idx);
      setInset();
    } else if (chip.dataset.kind) {
      activeKinds = toggle(activeKinds, kindIds, chip.dataset.kind, ev.altKey);
      renderChips();
      applyKinds();
    }
  });
  typeBar.addEventListener('click', (ev) => {
    const chip = ev.target.closest('.at-chip');
    if (!chip) return;
    activeTypes = toggle(activeTypes, typeIds, chip.dataset.type, ev.altKey);
    renderChips();
    applyTypes();
  });

  function applyKinds() {
    const on = (id) => activeKinds.has(nodeById.get(id).kind);
    nodeSel.classed('is-kind-off', (n) => !activeKinds.has(n.kind));
    edgeSel.classed('is-kind-off', (e) => !on(e.source) && !on(e.target));
    three?.setFilters(filters3d());
    syncUrl();
  }

  // (the classes themselves are set by paintFocus: the relation in focus is exempt)
  function applyTypes() {
    three?.setFilters(filters3d());
    paintFocus();
    syncUrl();
  }
  const filters3d = () => ({
    kinds: activeKinds.size === kindIds.length ? null : activeKinds,
    types: activeTypes.size === typeIds.length ? null : activeTypes,
  });

  function syncUrl() {
    if (!view) return;
    const p = new URLSearchParams(location.search);
    const setList = (name, set, all) => {
      if (set.size === all.length) p.delete(name);
      else p.set(name, all.filter((v) => set.has(v)).join(','));
    };
    setList('branches', activeBranches, branchIds);
    setList('kinds', activeKinds, kindIds);
    setList('edges', activeTypes, typeIds);
    if (currentIdx < view.years.length - 1) p.set('year', String(view.years[currentIdx]));
    else p.delete('year');
    if (selectedId && !tour) p.set('focus', selectedId);
    else p.delete('focus');
    if (mode === '3d') p.set('view', '3d');
    else p.delete('view');
    if (tour) {
      p.set('tour', tour.def.id);
      if (tour.i >= 0) p.set('step', String(tour.i + 1));
      else p.delete('step');
    } else {
      p.delete('tour');
      p.delete('step');
    }
    const qs = p.toString();
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  }

  // ---------------------------------------------------------------- 3D
  // three.js is its own chunk: fetched the first time it is asked for (or
  // as soon as a pointer heads for the 3D button), never for a 2D reader
  let three = null;
  let threeLoading = null;
  let switching = false;
  let back2d = null; // where the reader was on the flat map, to land there again
  function loadThree() {
    if (!threeLoading) {
      threeLoading = import('./atlas3d.js')
        .then(({ mountAtlas3d }) => {
          three = mountAtlas3d({
            host: stage3d,
            data,
            strings: STR,
            geom: { CAP_H, MARK_X, TEXT_X, PAD_R },
            labelOf,
            hooks: {
              hover(hit, ev) {
                hoverId = hit?.id ?? null;
                hoverEdge = hit?.edge ?? null;
                paintFocus();
                if (hit?.id) showTip(ev, nodeTipHtml(nodeById.get(hit.id)));
                else if (hit?.edge) showTip(ev, edgeTipHtml(hit.edge));
                else hideTip();
              },
              move: (ev) => moveTip(ev),
              click(hit, ev) {
                hideTip();
                if (hit?.id && (ev.metaKey || ev.ctrlKey)) {
                  window.open(`${root}/nodes/${hit.id}/`, '_blank', 'noopener');
                  return;
                }
                if (hit?.id) selectNode(selectedId === hit.id ? null : hit.id);
                else if (hit?.edge) selectEdge(selectedEdge === hit.edge ? null : hit.edge);
                else if (selectedId || selectedEdge) selectNode(null);
              },
            },
          });
          three.setLayout(view);
          three.setFilters(filters3d());
          three.setYear(currentIdx, { instant: true });
          three.setFocus(focusState);
          window.addEventListener('themechange', () => three.applyTheme());
          return three;
        })
        .catch((err) => {
          threeLoading = null;
          throw err;
        });
    }
    return threeLoading;
  }
  // (a pointer heading for the 3D button is a fair sign; a keyboard passing by is not)
  for (const btn of modeBtns) {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
    if (btn.dataset.mode === '3d') btn.addEventListener('pointerenter', () => loadThree().catch(() => {}), { once: true });
  }
  // a short, polite word under the toolbar (the 3D view failing to load)
  let statusTimer = null;
  function showStatus(text) {
    if (!status) return;
    status.textContent = text;
    status.hidden = false;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(hideStatus, 6000);
  }
  function hideStatus() {
    if (!status) return;
    clearTimeout(statusTimer);
    status.hidden = true;
    status.textContent = '';
  }

  // the stage fills the screen between the pinned head and the time bar
  let stageH = 0;
  function sizeStage() {
    const top = $('.at-head').offsetHeight + headerH();
    const marginTop = parseFloat(getComputedStyle(stage3d).marginTop) || 0;
    const time = $('.at-timebar');
    const timeH = time.offsetHeight + (parseFloat(getComputedStyle(time).marginTop) || 0);
    const h = Math.max(360, Math.round(innerHeight - top - marginTop - timeH));
    // a phone's URL bar coming and going is not a reason to re-frame
    if (Math.abs(h - stageH) < 2 || (stageH && Math.abs(h - stageH) < 90 && innerWidth === lastW)) return;
    stageH = h;
    lastW = innerWidth;
    stage3d.style.height = `${h}px`;
  }
  let lastW = 0;

  function setModeButtons(busy = false) {
    for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    el.classList.toggle('is-loading-3d', busy);
    $('.at-mode').setAttribute('aria-busy', String(busy));
    const three3d = mode === '3d';
    fitBtn.setAttribute('aria-label', three3d ? STR.resetView : STR.zoomFit);
    fitBtn.title = three3d ? STR.resetView : STR.zoomFit;
    setPlayLabel();
  }

  // The content point under the middle of what the flat chart shows now —
  // and the chart's screen origin, so 3D can start on the very same picture.
  function region2d() {
    const r = svgEl.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    const top = Math.max(s.top, $('.at-head').getBoundingClientRect().bottom);
    const bottom = Math.min(s.bottom, $('.at-timebar').getBoundingClientRect().top, innerHeight);
    const right = s.right - (inspector.hidden || !drawer() ? 0 : inspector.offsetWidth + 24);
    return {
      cx: clamp(((s.left + right) / 2 - r.left) / k, 0, view.W),
      cy: clamp(((top + Math.max(top, bottom)) / 2 - r.top) / k, 0, view.H),
      origin: { left: r.left, top: r.top },
    };
  }

  async function setMode(next, { instant = false, pin = true } = {}) {
    if (switching || next === mode) return;
    switching = true;
    hideTip();
    hoverId = null;
    hoverEdge = null;
    try {
      if (next === '3d') {
        setModeButtons(true);
        await loadThree();
        hideStatus();
        // measured after the chunk arrived: the reader may have scrolled meanwhile
        const before = region2d();
        const wasPinned = el.getBoundingClientRect().top <= headerH() + 1;
        const onScreen = el.getBoundingClientRect().top < innerHeight - 120;
        mode = '3d';
        el.classList.add('is-3d');
        stage3d.hidden = false;
        stageH = 0;
        sizeStage();
        // pin the head, so the stage fills the screen (only if the reader is here)
        if (pin && (wasPinned || onScreen)) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - headerH());
        three.setInset(inset3d());
        // start on the picture the flat chart was showing, pixel for pixel
        const s = stage3d.getBoundingClientRect();
        const lens = inset3d();
        const from = {
          cx: (s.left + s.width / 2 - lens.right / 2 - before.origin.left) / k,
          cy: (s.top + s.height / 2 - lens.bottom / 2 - before.origin.top) / k,
          k,
        };
        if (!wasPinned) Object.assign(from, { cx: before.cx, cy: before.cy });
        // coming back lands on this very point, under the very same pixel
        back2d = { cx: from.cx, cy: from.cy };
        three.setYear(currentIdx, { instant: true, playing: isPlaying, quiet: Boolean(tour) });
        three.enter(from, { instant: instant || !onScreen });
        // the room around the building fades in as it rises
        requestAnimationFrame(() => el.classList.add('is-3d-up'));
      } else {
        // land back where the reader was — or on the selected work
        const s = stage3d.getBoundingClientRect();
        const lens = inset3d();
        const X = s.left + s.width / 2 - lens.right / 2;
        const Y = s.top + s.height / 2 - lens.bottom / 2;
        const p = selectedId && view.pos.get(selectedId);
        let to = p ? { cx: p.x + MARK_X, cy: p.y } : (back2d ?? { cx: view.W / 2, cy: 0 });
        // keep the landing inside what the flat chart can scroll to
        const maxLeft = Math.max(0, view.W * k + insetRight - s.width);
        to = {
          cx: clamp(to.cx, (X - s.left) / k, (X - s.left + maxLeft) / k),
          cy: Math.max(to.cy, (Y - s.top) / k),
          k,
        };
        el.classList.remove('is-3d-up');
        const at = await three.exit(to, { instant });
        mode = '2d';
        el.classList.remove('is-3d');
        stage3d.hidden = true;
        applyZoom(k, null);
        const r = svgEl.getBoundingClientRect();
        scroller.scrollLeft += r.left + to.cx * k - at.x;
        window.scrollBy(0, r.top + to.cy * k - at.y);
        placeAxis();
        setInset();
        placeDrawer();
        paintFocus();
      }
      // a tour carries on in the other mode: frame its stop again there
      if (tour) frameTourStep();
    } catch (err) {
      console.error('atlas 3d:', err);
      mode = '2d';
      el.classList.remove('is-3d', 'is-3d-up');
      stage3d.hidden = true;
      showStatus(STR.error3d);
    } finally {
      switching = false;
      setModeButtons();
      setPlayLabel();
      syncUrl();
    }
  }

  bridgesBtn?.addEventListener('click', () => {
    const on = Boolean(three?.toggleBridges());
    bridgesBtn.setAttribute('aria-pressed', String(on));
    el.classList.toggle('is-bridges', on);
  });

  // ---------------------------------------------------------------- tours
  // A tour walks relations that are already recorded, one at a time; every
  // word it shows comes from the works and the notes on their relations.
  // Each stop sets the time machine to the newer work's year (what came
  // later is not there yet), frames the stop, and lights it.
  const fillCount = (s, n) => fill(s, { n });
  function renderToursMenu() {
    if (!toursMenu) return;
    toursMenu.innerHTML = tours
      .map((t) => {
        const stops = t.steps.length;
        return `<button type="button" class="at-tour-pick" data-tour="${esc(t.id)}">
          <span class="at-tour-pick-title">${esc(t.title)}</span>
          <span class="at-tour-pick-sum">${esc(t.summary)}</span>
          <span class="at-tour-pick-n">${esc(fillCount(STR.tourStops, stops))}</span>
        </button>`;
      })
      .join('');
  }
  function openToursMenu() {
    toursMenu.hidden = false;
    el.classList.add('is-menu-open');
    toursBtn.setAttribute('aria-expanded', 'true');
    toursMenu.querySelector('button')?.focus({ preventScroll: true });
  }
  function closeToursMenu(returnFocus = false) {
    toursMenu.hidden = true;
    el.classList.remove('is-menu-open');
    toursBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) toursBtn.focus({ preventScroll: true });
  }
  toursBtn?.addEventListener('click', () => (toursMenu.hidden ? openToursMenu() : closeToursMenu()));
  toursMenu?.addEventListener('click', (ev) => {
    const pick = ev.target.closest('[data-tour]');
    if (!pick) return;
    closeToursMenu();
    startTour(pick.dataset.tour);
  });
  document.addEventListener('pointerdown', (ev) => {
    if (toursMenu && !toursMenu.hidden && !ev.target.closest('.at-tours')) closeToursMenu();
  });

  async function startTour(id, at = -1) {
    const def = tours.find((t) => t.id === id);
    if (!def) return;
    stopPlay();
    tour = { def, i: clamp(at, -1, def.steps.length - 1) };
    // the tour shows every branch
    if (activeBranches.size !== branchIds.length) {
      activeBranches = new Set(branchIds);
      render();
    }
    el.scrollIntoView({ behavior: 'auto', block: 'start' });
    // the card at once; the stop is framed once the map has lifted
    if (mode !== '3d') {
      showTourStep({ frame: false });
      await setMode('3d');
      // (3D could not load, or a switch was already under way: frame it here)
      if (mode !== '3d') frameTourStep();
      return;
    }
    showTourStep();
  }
  function tourStep(d) {
    if (!tour) return;
    const i = tour.i + d;
    if (i >= tour.def.steps.length) return endTour();
    tour.i = clamp(i, -1, tour.def.steps.length - 1);
    showTourStep();
  }
  // stop touring (a reader's own action took over): the years the tour had
  // rewound come back; what the stop had in focus stays, in the inspector as
  // a reader's own pick (unless the reader is picking something else anyway)
  function leaveTour({ reshow = true } = {}) {
    if (!tour) return;
    tour = null;
    inspector.classList.remove('is-tour');
    if (currentIdx < view.years.length - 1) setYearIdx(view.years.length - 1);
    if (reshow) {
      if (selectedId) openInspector(nodeById.get(selectedId));
      else if (selectedEdge) openRelation(selectedEdge);
      else closeInspector();
      setInset();
      placeDrawer();
    }
    syncUrl();
  }
  // stop touring and put everything back (focus returns to the Tours button)
  function endTour() {
    if (!tour) return;
    const focusInside = inspector.contains(document.activeElement) || document.activeElement === document.body;
    tour = null;
    selectedId = null;
    selectedEdge = null;
    closeInspector();
    setYearIdx(view.years.length - 1);
    paintFocus();
    setInset();
    placeDrawer();
    syncUrl();
    three?.resetView();
    if (focusInside && lastInput === 'keyboard') toursBtn?.focus({ preventScroll: true });
  }
  // a stop's works must be on the map: a branch hidden mid-tour comes back
  function showBranchesOf(ids) {
    const hidden = [...new Set(ids.map((id) => nodeById.get(id).branch))].filter((b) => !activeBranches.has(b));
    if (!hidden.length) return;
    const keepYear = view.years[currentIdx] ?? Infinity;
    for (const b of hidden) activeBranches.add(b);
    render();
    const idx = view.years.findLastIndex((y) => y <= keepYear);
    setYearIdx(idx === -1 ? 0 : idx);
  }
  // bring the stop into view: the camera in 3D, the page in 2D
  function frameTourStep() {
    if (!tour) return;
    const { def, i } = tour;
    if (i < 0) {
      if (mode === '3d') three?.frameIds([...new Set(def.steps.flatMap((s) => (s.work ? [s.work] : [s.from, s.to])))]);
      return;
    }
    const step = def.steps[i];
    if (step.work) {
      const { anc, desc } = lineageOf(step.work);
      if (mode === '3d') three?.frameIds([step.work, ...desc, ...[...anc].filter((a) => edgeBetween(a, step.work))]);
      else ensureVisible(step.work, true);
    } else if (mode === '3d') three?.frameIds([step.from, step.to]);
    else ensureVisible(step.to, true);
  }

  function showTourStep({ frame = true } = {}) {
    if (!tour) return;
    const { def, i } = tour;
    const n = def.steps.length;
    const head = `<div class="insp-top">
        <span class="chip tour-chip"><span class="tour-dot"></span>${esc(STR.tour)} · ${i < 0 ? esc(fillCount(STR.tourStops, n)) : esc(fill(STR.tourStep, { i: i + 1, n }))}</span>
        <button type="button" class="icon-btn insp-close" aria-label="${esc(STR.tourEnd)}" title="${esc(STR.tourEnd)}">${closeIcon}</button>
      </div>
      <p class="tour-title">${esc(def.title)}</p>
      <div class="tour-progress" aria-hidden="true">${def.steps.map((_s, j) => `<span class="${j <= i ? 'is-done' : ''}"></span>`).join('')}</div>`;
    const nav = (prevLabel, nextLabel) => `<div class="tour-nav">
        ${prevLabel ? `<button type="button" class="btn btn-sm" data-tour-prev>← ${esc(prevLabel)}</button>` : '<span></span>'}
        <button type="button" class="btn btn-sm btn-primary" data-tour-next>${esc(nextLabel)} →</button>
      </div>`;
    const last = view.years.length - 1;
    // (screen readers hear each stop; keyboard focus stays on "Next")
    const say = (text) => {
      if (announce) announce.textContent = text;
    };
    if (i < 0) {
      // the cover: what this walk is, and its stops
      const names = def.steps.map((s) => (s.work ? labelOf(nodeById.get(s.work)) : `${labelOf(nodeById.get(s.to))} ← ${labelOf(nodeById.get(s.from))}`));
      say(`${def.title}. ${fillCount(STR.tourStops, n)}.`);
      selectedId = null;
      selectedEdge = null;
      setYearIdx(last);
      paintFocus();
      showInspector(
        `${head}<h2 class="insp-title" tabindex="-1">${esc(def.title)}</h2>
        <p class="insp-problem">${esc(def.summary)}</p>
        <ol class="tour-stops">${names.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
        ${nav(null, STR.tourBegin)}`,
        nodeById.get(def.steps.at(-1).work ?? def.steps.at(-1).to).branch,
      );
    } else {
      const step = def.steps[i];
      const prevLabel = STR.tourPrev;
      const nextLabel = i === n - 1 ? STR.tourFinish : STR.tourNext;
      if (step.work) {
        // a work: its whole lineage, with everything recorded after it
        const w = nodeById.get(step.work);
        showBranchesOf([w.id]);
        setYearIdx(view.years.length - 1);
        selectNode(w.id, { fromTour: true, inspect: false });
        // the later works that answer to it (descent, not kinship: no "independent")
        const kids = [...new Set(data.edges.filter((e) => e.source === w.id && e.type !== 'independent').map((e) => e.target))];
        const kidBranches = new Set(kids.map((id) => nodeById.get(id).branch));
        say(`${fill(STR.tourStep, { i: i + 1, n })}. ${w.short}.`);
        showInspector(
          `${head}<span class="chip">${dot(w)}${esc(branchTitle(w))}</span>
          <h2 class="insp-title" tabindex="-1">${esc(w.short)}</h2>
          <p class="insp-meta">${venueHtml(w)}</p>
          <p class="insp-problem">${esc(w.problem)}</p>
          ${kids.length ? `<p class="tour-fact">${esc(fill(kids.length === 1 ? STR.tourAnswerOne : kidBranches.size > 1 ? STR.tourAnswerAcross : STR.tourAnswerMany, { n: kids.length, b: kidBranches.size }))}</p>` : ''}
          <div class="insp-actions"><a class="btn btn-sm" href="${root}/nodes/${esc(w.id)}/">${esc(STR.openPage)}</a></div>
          ${nav(prevLabel, nextLabel)}`,
          w.branch,
        );
      } else {
        // a relation: the time machine stops at the newer work's year
        const e = edgeBetween(step.from, step.to);
        const t = nodeById.get(step.to);
        showBranchesOf([step.from, step.to]);
        const idx = view.years.findLastIndex((y) => y <= t.year);
        setYearIdx(idx === -1 ? view.years.length - 1 : idx);
        selectEdge(e, { fromTour: true });
        say(`${fill(STR.tourStep, { i: i + 1, n })}. ${labelOf(t)} ${typeLabel(e.type)} ${labelOf(nodeById.get(step.from))}.`);
        showInspector(
          `${head}${relationBody(e)}
          <div class="insp-actions">
            <a class="btn btn-sm" href="${root}/nodes/${esc(t.id)}/">${esc(fill(STR.openWork, { name: labelOf(t) }))}</a>
            <a class="btn btn-sm" href="${root}/nodes/${esc(step.from)}/">${esc(fill(STR.openWork, { name: labelOf(nodeById.get(step.from)) }))}</a>
          </div>
          ${nav(prevLabel, nextLabel)}`,
          t.branch,
        );
      }
    }
    setInset();
    placeDrawer();
    if (frame) frameTourStep();
    syncUrl();
    if (lastInput === 'keyboard') inspector.querySelector('[data-tour-next]')?.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- boot
  window.addEventListener('themechange', () => {
    paintBranchVars();
  });

  if (selectedId && !activeBranches.has(nodeById.get(selectedId).branch)) {
    activeBranches.add(nodeById.get(selectedId).branch);
  }
  view = computeView();
  k = defaultK();
  currentIdx = view.years.length - 1;
  const q = Number(params.get('year'));
  if (params.has('year') && Number.isFinite(q)) {
    const idx = view.years.findLastIndex((y) => y <= q);
    currentIdx = idx === -1 ? 0 : idx;
  }
  render();
  renderToursMenu();
  range.value = String(currentIdx);
  // a wide chart opens on the recent years (where most of the field lives)
  if (scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = scroller.scrollWidth;
  placeAxis();
  setModeButtons();
  if (selectedId) {
    openInspector(nodeById.get(selectedId));
    paintFocus();
    setInset();
    placeDrawer();
    // a shared link lands on its work directly — no scroll show on page load
    ensureVisible(selectedId, true, 'auto');
  }
  // a shared 3D link or tour opens lifted (without moving the page)
  const tourParam = tours.find((t) => t.id === params.get('tour'));
  if (tourParam) {
    const step = Number(params.get('step'));
    startTour(tourParam.id, Number.isFinite(step) && step > 0 ? step - 1 : -1);
  } else if (params.get('view') === '3d') {
    // (a shared work is brought into view, as in 2D: that pins the stage)
    setMode('3d', { instant: true, pin: false }).then(() => selectedId && ensureVisible(selectedId, true, 'auto'));
  }

  // refit when the page width changes (rotate, resize) — only if the reader
  // hasn't zoomed away from the default
  let lastDefault = k;
  new ResizeObserver(() => {
    // (hidden while in 3D: nothing to measure)
    if (!view || mode === '3d' || !scroller.clientWidth) return;
    const d = defaultK();
    if (Math.abs(k - lastDefault) < 0.001 && Math.abs(d - k) > 0.001) applyZoom(d, null);
    lastDefault = d;
    setInset();
  }).observe(scroller);

  return { selectNode, setMode, startTour, get mode() { return mode; }, get three() { return three; } };
}
