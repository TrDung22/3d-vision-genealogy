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
 * Localized prose of a node entry — each field falls back to the English
 * original, so untranslated nodes degrade gracefully instead of breaking.
 */
export function nodeProse(
  data: {
    problem: string;
    solution: string;
    limitations?: string;
    i18n?: Record<string, { problem?: string; solution?: string; limitations?: string }>;
  },
  lang: Lang,
) {
  const loc = data.i18n?.[lang];
  return {
    problem: loc?.problem ?? data.problem,
    solution: loc?.solution ?? data.solution,
    limitations: loc?.limitations ?? data.limitations,
  };
}

/** Localized note of one relation — falls back to the English note. */
export function relNote(
  rel: { note?: string; i18n?: Record<string, { note?: string }> },
  lang: Lang,
): string {
  return rel.i18n?.[lang]?.note ?? rel.note ?? '';
}

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
const AWARD_RE = /best paper|honorable mention|oral|spotlight|highlight|award/i;

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
    year: number;
    venue?: string;
    branch: string;
    lane: string; // laneKey = "<branch>/<lane>"
    status: string;
    hasPost: boolean;
    award: boolean;
    problem: string;
  }[];
  edges: { source: string; target: string; type: EdgeType; note: string }[];
  edgeTypes: Record<
    EdgeType,
    { label: string; description: string; stroke: string; dash: string | null; width: number }
  >;
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
    title: b.data.i18n?.[lang]?.title ?? b.data.title,
    color: b.data.color,
    colorLight: LIGHT_VARIANT[b.data.color.toLowerCase()] ?? b.data.color,
    order: b.data.order,
    status: b.data.status,
  }));

  // Lanes follow the order declared in the branch YAML; unknown lanes are appended to their branch
  const lanes: GraphData['lanes'] = [];
  for (const b of branchEntries) {
    for (const l of b.data.lanes) {
      lanes.push({ id: `${b.id}/${l.id}`, branch: b.id, title: l.i18n?.[lang]?.title ?? l.title });
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
    year: n.data.year,
    venue: n.data.venue,
    branch: n.data.branch.id,
    lane: `${n.data.branch.id}/${n.data.lane}`,
    status: n.data.status,
    hasPost: Boolean(n.data.post),
    award: AWARD_RE.test(n.data.venue ?? ''),
    problem: nodeProse(n.data, lang).problem,
  }));

  // Relations are declared on the NEWER node, pointing to the OLDER one
  // → edges are directed old → new (the direction of time)
  const edges = nodeEntries.flatMap((n) =>
    n.data.relations.map((r) => ({
      source: r.node.id,
      target: n.id,
      type: r.type,
      note: relNote(r, lang),
    })),
  );

  // Style comes from EDGE_TYPES (canonical); words come from the i18n dict
  const edgeTypes = Object.fromEntries(
    (Object.keys(EDGE_TYPES) as EdgeType[]).map((k) => [
      k,
      { ...EDGE_TYPES[k], label: t(lang, `edge.${k}`), description: t(lang, `glossary.${k}`) },
    ]),
  ) as GraphData['edgeTypes'];

  return { branches, lanes, nodes, edges, edgeTypes };
}
