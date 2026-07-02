import { getCollection } from 'astro:content';

/**
 * The relation vocabulary of the genealogy — the heart of the project.
 * This is what separates a genealogy from an awesome-list.
 */
export const EDGE_TYPES = {
  fixes: {
    label: 'fixes',
    description: 'Comes later and directly repairs a specific weakness of the earlier work',
  },
  'builds-on': {
    label: 'builds on',
    description: 'Stands on the earlier work and extends it in a new direction',
  },
  independent: {
    label: 'independent',
    description: 'Tackles the same problem, developed without depending on the other',
  },
  challenges: {
    label: 'challenges',
    description: 'Questions the assumptions, benchmarks, or conclusions of the earlier work',
  },
  revives: {
    label: 'revives',
    description: 'Reawakens a direction the mainstream had abandoned',
  },
} as const;

export type EdgeType = keyof typeof EDGE_TYPES;

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
  edgeTypes: typeof EDGE_TYPES;
}

/** Collect all collections into a single graph payload (shared by the D3 and 3D views). */
export async function buildGraph(): Promise<GraphData> {
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
    year: n.data.year,
    venue: n.data.venue,
    branch: n.data.branch.id,
    lane: `${n.data.branch.id}/${n.data.lane}`,
    status: n.data.status,
    hasPost: Boolean(n.data.post),
    award: AWARD_RE.test(n.data.venue ?? ''),
    problem: n.data.problem,
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

  return { branches, lanes, nodes, edges, edgeTypes: EDGE_TYPES };
}
