/**
 * The atlas — the genealogy drawn as a timeline map.
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
 * Interaction. Hover traces a work's direct relations; click (or Enter)
 * selects it — its whole lineage lights up (everything it stands on and
 * everything that descends from it, through fixes / builds-on / challenges /
 * revives; "independent" is kinship, not descent) and the inspector opens.
 * ⌘/Ctrl-click opens the work's page like any link. Filters: branch chips
 * re-layout, kind chips fade, relation chips hide; the time bar replays the
 * field year by year. Everything is shareable through the URL:
 * ?branches= ?kinds= ?edges= ?year= ?focus=.
 *
 * Theme. Colors resolve through CSS custom properties (branch colors are
 * swapped on `themechange`), so a theme switch never re-renders.
 */
import { group, select } from 'd3';

const NS = 'http://www.w3.org/2000/svg';

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

export function mountAtlas({ el, data, root, strings: STR }) {
  const $ = (sel) => el.querySelector(sel);
  const svgEl = $('.at-svg');
  const svg = select(svgEl);
  const scroller = $('.at-scroller');
  const stage = $('.at-stage');
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

  const branchById = new Map(data.branches.map((b) => [b.id, b]));
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const laneById = new Map(data.lanes.map((l) => [l.id, l]));
  const shapeOf = (n) => data.nodeKinds?.[n.kind]?.shape ?? 'circle';
  const typeLabel = (t) => data.edgeTypes[t]?.label ?? t;

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
  let hoverId = null;
  let hoverEdge = null;
  let k = 1;
  let view = null;
  let currentIdx = 0;
  let firstRender = true;
  let insetRight = 0; // room to scroll out from under the inspector drawer
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
    svg.selectAll('*').remove();
    const intro = firstRender && !reducedMotion() && !params.has('year') && !selectedId;
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
    applyZoom(k, null);
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

  $('.at-zoom-in').addEventListener('click', () => applyZoom(k * 1.25, centerAnchor()));
  $('.at-zoom-out').addEventListener('click', () => applyZoom(k / 1.25, centerAnchor()));
  $('.at-zoom-fit').addEventListener('click', () => {
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
    if (!ev.target.closest('.at-node, .at-edge-hit') && selectedId) selectNode(null);
  });

  // ---------------------------------------------------------------- focus
  // one painter for hover, edge-hover and selection (hover wins while it lasts)
  function paintFocus() {
    if (!view) return;
    const focusing = Boolean(hoverId || hoverEdge || selectedId);
    svgEl.classList.toggle('is-focusing', focusing);
    pulseG.selectAll('*').remove();
    if (!focusing) {
      nodeSel.attr('data-role', null);
      edgeSel.attr('data-role', null);
      return;
    }
    if (hoverEdge) {
      const e = hoverEdge;
      nodeSel.attr('data-role', (n) => (n.id === e.source || n.id === e.target ? 'near' : 'dim'));
      edgeSel.attr('data-role', (x) => (x === e ? 'direct' : 'dim'));
      // the debt itself, flowing from the older work into the newer one
      if (!reducedMotion()) {
        pulseG
          .append('path')
          .attr('class', 'at-pulse')
          .attr('d', edgePath(e))
          .attr('style', `stroke: ${e.type === 'challenges' ? 'var(--danger)' : bVar(nodeById.get(e.target).branch)}`);
      }
      return;
    }
    if (hoverId && hoverId !== selectedId) {
      const near = view.nbr.get(hoverId) ?? new Set([hoverId]);
      nodeSel.attr('data-role', (n) => (n.id === hoverId ? 'hover' : near.has(n.id) ? 'near' : 'dim'));
      edgeSel.attr('data-role', (e) => (e.source === hoverId || e.target === hoverId ? 'direct' : 'dim'));
      return;
    }
    // lineage of the selected work
    const id = selectedId;
    const { anc, desc } = lineageOf(id);
    const peers = new Set(
      data.edges
        .filter((e) => e.type === 'independent' && (e.source === id || e.target === id))
        .map((e) => (e.source === id ? e.target : e.source)),
    );
    nodeSel.attr('data-role', (n) =>
      n.id === id ? 'sel' : anc.has(n.id) ? 'anc' : desc.has(n.id) ? 'desc' : peers.has(n.id) ? 'peer' : 'dim',
    );
    const ancSide = (e) => anc.has(e.source) && (anc.has(e.target) || e.target === id);
    const descSide = (e) => (desc.has(e.source) || e.source === id) && desc.has(e.target);
    edgeSel.attr('data-role', (e) => {
      if (e.source === id || e.target === id) return 'direct';
      if (e.type !== 'independent' && (ancSide(e) || descSide(e))) return 'lit';
      return 'dim';
    });
    // light pulses travel along the selected work's own relations
    if (!reducedMotion()) {
      pulseG
        .selectAll('path')
        .data(view.edges.filter((e) => (e.source === id || e.target === id) && activeTypes.has(e.type)))
        .join('path')
        .attr('class', 'at-pulse')
        .attr('d', (e) => edgePath(e))
        .attr('style', `stroke: ${bVar(nodeById.get(id).branch)}`);
    }
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
  const edgeTipHtml = (e) => {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    return `<span class="tip-rel"><strong>${esc(t.short)}</strong> <em>${esc(typeLabel(e.type))}</em> <strong>${esc(s.short)}</strong></span>
      ${e.note ? `<p>${esc(truncate(e.note, 260))}</p>` : ''}`;
  };

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
    inspector.innerHTML = `
      <div class="insp-scroll">
        <div class="insp-top">
          <span class="chip"><span class="dot" style="background:${bVar(n.branch)}"></span>${esc(br?.title ?? '')} · ${esc(laneById.get(n.lane)?.title ?? '')}</span>
          <button type="button" class="icon-btn insp-close" aria-label="${esc(STR.close)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
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
        ${!standsOn.length && !followedBy.length ? `<p class="muted">${esc(STR.root)}</p>` : ''}
      </div>`;
    inspector.hidden = false;
    inspector.style.setProperty('--bc', bVar(n.branch));
    requestAnimationFrame(() => inspector.classList.add('is-open'));
    inspector.querySelector('.insp-scroll').scrollTop = 0;
  }
  const kindIsAnalysis = (n) => n.kind === 'analysis';

  function closeInspector() {
    inspector.classList.remove('is-open');
    inspector.hidden = true;
    inspector.innerHTML = '';
  }

  inspector.addEventListener('click', (ev) => {
    if (ev.target.closest('.insp-close')) return selectNode(null, { returnFocus: true });
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
  function selectNode(id, { scroll = false, focusInspector = false, returnFocus = false } = {}) {
    if (id && !nodeById.has(id)) return;
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
      emitFilter();
    }
    // … and a work beyond the time machine's cursor rewinds it forward
    if (id && view.yearIdx.get(nodeById.get(id).year) > currentIdx) {
      setYearIdx(view.years.length - 1);
    }
    selectedId = id;
    hoverId = null;
    hideTip();
    paintFocus();
    if (id) openInspector(nodeById.get(id));
    else closeInspector();
    setInset();
    placeDrawer();
    syncUrl();
    // next frame: a smooth scroll started inside the click's own task can be
    // swallowed by the drawer's opening frame
    if (id) requestAnimationFrame(() => ensureVisible(id, scroll));
    if (lastInput === 'keyboard') {
      if (id && focusInspector) inspector.querySelector('.insp-title')?.focus({ preventScroll: true });
      if (!id && prev && (returnFocus || focusInside)) nodeEl(prev)?.focus({ preventScroll: true });
    }
  }

  // The inspector covers part of the chart — a drawer on the right on a desk,
  // a sheet at the bottom on a phone. While it is open the chart gains room
  // to scroll out from under the drawer, and the selected work is kept in
  // the part that stays visible.
  const drawer = () => innerWidth > 900;
  let insetTimer = null;
  function setInset() {
    const next = selectedId && drawer() && !inspector.hidden ? inspector.offsetWidth + 28 : 0;
    const apply = () => {
      insetRight = next;
      stage.style.width = `${Math.ceil(view.W * k) + insetRight}px`;
      scroller.classList.toggle('can-pan', view.W * k + insetRight > scroller.clientWidth + 2);
    };
    clearTimeout(insetTimer);
    // closing: glide back first, so the room doesn't vanish with a jump
    const max = Math.max(0, Math.ceil(view.W * k) + next - scroller.clientWidth);
    if (next < insetRight && scroller.scrollLeft > max + 1 && !reducedMotion()) {
      scroller.scrollTo({ left: max, behavior: 'smooth' });
      insetTimer = setTimeout(apply, 400);
    } else {
      apply();
    }
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
  window.addEventListener('resize', () => requestAnimationFrame(placeDrawer));

  // center = bring it to the middle of the visible part (search, deep links,
  // walking the inspector); otherwise scroll only as far as it takes. The
  // vertical target is solved for where the sticky head will END UP: it
  // only pins under the site header once the atlas top has scrolled past.
  function ensureVisible(id, center = false, behavior = reducedMotion() ? 'auto' : 'smooth') {
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
    if (selectedId && !inspector.hidden) target = Math.max(target, atlasTop - hh);
    if (Math.abs(target - sy) > 1) window.scrollTo({ top: Math.max(0, target), behavior });
  }

  window.addEventListener('atlas:focus', (ev) => selectNode(ev.detail?.id, { scroll: true }));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && selectedId && !document.querySelector('dialog[open]')) selectNode(null);
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

  let playTimer = null;
  function stopPlay() {
    clearInterval(playTimer);
    playTimer = null;
    playBtn.classList.remove('is-playing');
    playBtn.setAttribute('aria-label', STR.play);
  }
  playBtn.addEventListener('click', () => {
    if (playTimer) return stopPlay();
    if (currentIdx >= view.years.length - 1) setYearIdx(0);
    playBtn.classList.add('is-playing');
    playBtn.setAttribute('aria-label', STR.pause);
    followYear();
    playTimer = setInterval(() => {
      if (currentIdx >= view.years.length - 1) return stopPlay();
      setYearIdx(currentIdx + 1);
      followYear();
    }, 650);
  });
  // while replaying, keep the current year in view if the chart overflows
  function followYear() {
    if (scroller.scrollWidth <= scroller.clientWidth) return;
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

  el.querySelector('.at-toolbar').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.at-chip');
    if (!chip) return;
    if (chip.dataset.branch) {
      activeBranches = toggle(activeBranches, branchIds, chip.dataset.branch, ev.altKey);
      if (selectedId && !activeBranches.has(nodeById.get(selectedId).branch)) {
        selectedId = null;
        closeInspector();
      }
      stopPlay();
      const keepYear = view.years[currentIdx] ?? Infinity;
      render();
      const idx = view.years.findLastIndex((y) => y <= keepYear);
      setYearIdx(idx === -1 ? 0 : idx);
      emitFilter();
    } else if (chip.dataset.kind) {
      activeKinds = toggle(activeKinds, kindIds, chip.dataset.kind, ev.altKey);
      renderChips();
      applyKinds();
      emitFilter();
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
    syncUrl();
  }

  function applyTypes() {
    edgeSel.classed('is-type-off', (e) => !activeTypes.has(e.type));
    hitSel.classed('is-type-off', (e) => !activeTypes.has(e.type));
    paintFocus();
    syncUrl();
  }

  // the 3D floors mirror the atlas filters
  function emitFilter() {
    window.dispatchEvent(
      new CustomEvent('atlas:filter', { detail: { branches: new Set(activeBranches), kinds: new Set(activeKinds) } }),
    );
  }

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
    if (selectedId) p.set('focus', selectedId);
    else p.delete('focus');
    const qs = p.toString();
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
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
  range.value = String(currentIdx);
  emitFilter();
  // a wide chart opens on the recent years (where most of the field lives)
  if (scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = scroller.scrollWidth;
  placeAxis();
  if (selectedId) {
    openInspector(nodeById.get(selectedId));
    paintFocus();
    setInset();
    placeDrawer();
    // a shared link lands on its work directly — no scroll show on page load
    ensureVisible(selectedId, true, 'auto');
  }

  // refit when the page width changes (rotate, resize) — only if the reader
  // hasn't zoomed away from the default
  let lastDefault = k;
  new ResizeObserver(() => {
    if (!view) return;
    const d = defaultK();
    if (Math.abs(k - lastDefault) < 0.001 && Math.abs(d - k) > 0.001) applyZoom(d, null);
    lastDefault = d;
    setInset();
  }).observe(scroller);

  return { selectNode };
}
