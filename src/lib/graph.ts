import { getCollection } from 'astro:content';
import { t, type Lang } from './i18n';

/**
 * The relation vocabulary of the genealogy — the heart of the project.
 * This is what separates a genealogy from an awesome-list.
 *
 * `stroke` is a CSS custom-property name (resolved at render time so both
 * themes share one definition); `dash`/`width` are the SVG stroke pattern.
 * The D3 timeline and the server-rendered "how to read" legend both draw
 * from here, so the two can never drift apart.
 */
export const EDGE_TYPES = {
  fixes: {
    label: 'fixes',
    description: 'Comes later and directly repairs a specific weakness of the earlier work',
    stroke: '--ink-2',
    dash: null,
    width: 2,
  },
  'builds-on': {
    label: 'builds on',
    description: 'Stands on the earlier work and extends it in a new direction',
    stroke: '--muted',
    dash: null,
    width: 1.4,
  },
  independent: {
    label: 'independent',
    description:
      'Converges on the same core idea at the same time, without depending on the other — the task, even the branch, may differ',
    stroke: '--muted',
    dash: '6 5',
    width: 1.6,
  },
  challenges: {
    label: 'challenges',
    description: 'Questions the assumptions, benchmarks, or conclusions of the earlier work',
    stroke: '--danger',
    dash: '2 4',
    width: 1.6,
  },
  revives: {
    label: 'revives',
    description: 'Reawakens a direction the mainstream had abandoned',
    stroke: '--muted',
    dash: '10 4 2 4',
    width: 1.6,
  },
} as const satisfies Record<
  string,
  { label: string; description: string; stroke: string; dash: string | null; width: number }
>;

export type EdgeType = keyof typeof EDGE_TYPES;

/**
 * What kind of work a node is. Most nodes are methods; the other two kinds
 * are drawn as different mark shapes so the genealogy's critiques and data
 * trunks stand out (shape, not color — color already means "branch").
 */
export const NODE_KINDS = {
  method: { shape: 'circle' },
  analysis: { shape: 'diamond' },
  dataset: { shape: 'square' },
} as const satisfies Record<string, { shape: 'circle' | 'diamond' | 'square' }>;

export type NodeKind = keyof typeof NODE_KINDS;

/**
 * Light-theme variants of the branch color slots (reference palette, light
 * column). Branch YAML stores the dark slot as canonical; the light twin is
 * derived here so the data files stay single-source.
 */
const LIGHT_VARIANT: Record<string, string> = {
  '#3987e5': '#2a78d6', // slot 1 blue
  '#199e70': '#1baf7a', // slot 2 aqua
  '#c98500': '#eda100', // slot 3 yellow
  '#008300': '#008300', // slot 4 green
  '#9085e9': '#4a3aa7', // slot 5 violet
};

/** Venue strings that count as "recognized" — rendered as a gold ring on both graphs.
 *  (CVPR has no "spotlight"; its "Highlight" tier, ~top 10%, is the equivalent.) */
const AWARD_RE = /best (?:student )?paper|honorable mention|oral|spotlight|highlight|award/i;

export interface GraphData {
  branches: {
    id: string;
    title: string;
    color: string;
    colorLight: string;
    order: number;
    status: string;
  }[];
  lanes: { id: string; branch: string; title: string }[];
  nodes: {
    id: string;
    short: string;
    title: string;
    authors?: string;
    year: number;
    venue?: string;
    branch: string;
    lane: string; // laneKey = "<branch>/<lane>"
    kind: NodeKind;
    status: string;
    hasPost: boolean;
    award: boolean;
    problem: string;
    links: Record<string, string>;
  }[];
  edges: { source: string; target: string; type: EdgeType; note: string }[];
  edgeTypes: Record<
    EdgeType,
    { label: string; description: string; stroke: string; dash: string | null; width: number }
  >;
  nodeKinds: Record<NodeKind, { label: string; shape: (typeof NODE_KINDS)[NodeKind]['shape'] }>;
  tours: {
    id: string;
    title: string;
    summary: string;
    steps: ({ from: string; to: string } | { work: string })[];
  }[];
}

const graphCache = new Map<Lang, Promise<GraphData>>();

/**
 * Collect all collections into a single graph payload (shared by the D3 and
 * 3D views), with all human-readable text resolved for `lang`. Memoized per
 * lang — every page of a build shares the same payload.
 */
export function buildGraph(lang: Lang = 'en'): Promise<GraphData> {
  let graph = graphCache.get(lang);
  if (!graph) {
    graph = buildGraphUncached(lang);
    graphCache.set(lang, graph);
  }
  return graph;
}

async function buildGraphUncached(lang: Lang): Promise<GraphData> {
  const branchEntries = (await getCollection('branches')).sort(
    (a, b) => a.data.order - b.data.order,
  );
  const nodeEntries = (await getCollection('nodes')).sort((a, b) => a.data.year - b.data.year);

  const branches = branchEntries.map((b) => ({
    id: b.id,
    title: b.data.title,
    color: b.data.color,
    colorLight: LIGHT_VARIANT[b.data.color.toLowerCase()] ?? b.data.color,
    order: b.data.order,
    status: b.data.status,
  }));

  // Lanes follow the order declared in the branch YAML; unknown lanes are appended to their branch
  const lanes: GraphData['lanes'] = [];
  for (const b of branchEntries) {
    for (const l of b.data.lanes) {
      lanes.push({ id: `${b.id}/${l.id}`, branch: b.id, title: l.title });
    }
    for (const n of nodeEntries) {
      if (n.data.branch.id !== b.id) continue;
      const key = `${b.id}/${n.data.lane}`;
      if (!lanes.some((l) => l.id === key)) lanes.push({ id: key, branch: b.id, title: n.data.lane });
    }
  }

  const nodes = nodeEntries.map((n) => ({
    id: n.id,
    short: n.data.short,
    title: n.data.title,
    authors: n.data.authors,
    year: n.data.year,
    venue: n.data.venue,
    branch: n.data.branch.id,
    lane: `${n.data.branch.id}/${n.data.lane}`,
    kind: n.data.kind,
    status: n.data.status,
    hasPost: Boolean(n.data.post),
    award: AWARD_RE.test(n.data.venue ?? ''),
    problem: n.data.problem,
    links: n.data.links,
  }));

  // Relations are declared on the NEWER node, pointing to the OLDER one
  // → edges are directed old → new (the direction of time)
  const edges = nodeEntries.flatMap((n) =>
    n.data.relations.map((r) => ({
      source: r.node.id,
      target: n.id,
      type: r.type,
      note: r.note ?? '',
    })),
  );

  // Style comes from EDGE_TYPES (canonical); words come from the i18n dict
  const edgeTypes = Object.fromEntries(
    (Object.keys(EDGE_TYPES) as EdgeType[]).map((k) => [
      k,
      { ...EDGE_TYPES[k], label: t(lang, `edge.${k}`), description: t(lang, `glossary.${k}`) },
    ]),
  ) as GraphData['edgeTypes'];

  const nodeKinds = Object.fromEntries(
    (Object.keys(NODE_KINDS) as NodeKind[]).map((k) => [
      k,
      { shape: NODE_KINDS[k].shape, label: t(lang, `kind.${k}`) },
    ]),
  ) as GraphData['nodeKinds'];

  // Guided tours walk relations that already exist — a step naming one that
  // isn't recorded fails the build instead of shipping a broken tour
  const tours = (await getCollection('tours'))
    .sort((a, b) => a.data.order - b.data.order)
    .map((tour) => ({
      id: tour.id,
      title: tour.data.title,
      summary: tour.data.summary,
      steps: tour.data.steps.map((step) => {
        if ('work' in step) return { work: step.work.id };
        const from = step.from.id;
        const to = step.to.id;
        if (!edges.some((e) => e.source === from && e.target === to)) {
          throw new Error(`tour "${tour.id}": no relation is recorded from ${from} to ${to}`);
        }
        return { from, to };
      }),
    }));

  return { branches, lanes, nodes, edges, edgeTypes, nodeKinds, tours };
}

/**
 * Independent edges folded into "waves": connected components of the
 * independent relation (union-find), each with its member works sorted by
 * year. Shared by the home page and the heresies page.
 */
export function independentWaves(graph: GraphData) {
  type Edge = GraphData['edges'][number];
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x);
    if (p === undefined || p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  const indep = graph.edges.filter((e) => e.type === 'independent');
  for (const e of indep) parent.set(find(e.source), find(e.target));
  const comps = new Map<string, { ids: Set<string>; edges: Edge[] }>();
  for (const e of indep) {
    const r = find(e.source);
    const c = comps.get(r) ?? { ids: new Set<string>(), edges: [] };
    c.ids.add(e.source);
    c.ids.add(e.target);
    c.edges.push(e);
    comps.set(r, c);
  }
  return [...comps.values()]
    .map((c) => {
      const members = [...c.ids]
        .map((id) => nodeById.get(id)!)
        .sort((a, b) => a.year - b.year || a.short.localeCompare(b.short));
      return { members, edges: c.edges, from: members[0].year, to: members[members.length - 1].year };
    })
    .sort((a, b) => a.from - b.from || a.to - b.to);
}
