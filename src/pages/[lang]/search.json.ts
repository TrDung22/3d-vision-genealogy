import { getCollection } from 'astro:content';
import { buildGraph } from '../../lib/graph';
import { LOCALES, type Lang } from '../../lib/i18n';

export function getStaticPaths() {
  return LOCALES.map((lang) => ({ params: { lang } }));
}

/**
 * The search palette's index — a slim cut of the graph (no prose), fetched
 * the first time someone opens the palette on any page.
 */
export async function GET({ params }: { params: { lang: Lang } }) {
  const graph = await buildGraph(params.lang);
  const laneTitle = new Map(graph.lanes.map((l) => [l.id, l.title]));
  const branches = (await getCollection('branches')).sort((a, b) => a.data.order - b.data.order);
  const colorLight = new Map(graph.branches.map((b) => [b.id, b.colorLight]));
  const index = {
    works: graph.nodes.map((n) => ({
      id: n.id,
      short: n.short,
      title: n.title,
      authors: n.authors ?? '',
      venue: n.venue ?? '',
      year: n.year,
      branch: n.branch,
      lane: laneTitle.get(n.lane) ?? '',
      kind: n.kind,
      award: n.award,
    })),
    branches: branches.map((b) => ({
      id: b.id,
      title: b.data.title,
      tagline: b.data.tagline,
      color: b.data.color,
      colorLight: colorLight.get(b.id) ?? b.data.color,
    })),
  };
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
