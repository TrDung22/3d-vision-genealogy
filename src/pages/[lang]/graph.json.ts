import { buildGraph } from '../../lib/graph';
import { LOCALES, type Lang } from '../../lib/i18n';

export function getStaticPaths() {
  return LOCALES.map((lang) => ({ params: { lang } }));
}

/** The per-language graph payload shared by the D3 timeline and the 3D view — built statically at `astro build`. */
export async function GET({ params }: { params: { lang: Lang } }) {
  const graph = await buildGraph(params.lang);
  return new Response(JSON.stringify(graph), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
