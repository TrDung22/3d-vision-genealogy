import { buildGraph } from '../lib/graph';

/** The graph payload shared by the D3 timeline and the 3D view — built statically at `astro build`. */
export async function GET() {
  const graph = await buildGraph();
  return new Response(JSON.stringify(graph), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
