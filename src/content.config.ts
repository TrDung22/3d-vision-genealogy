import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * A BRANCH = one major current of 3D vision (single-image 3D, neural
 * rendering, multi-view geometry, ...). Each branch is one YAML file in
 * src/content/branches/. Adding a branch = adding a file — the graph
 * updates itself.
 */
const branches = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/branches' }),
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    description: z.string(),
    // Categorical color (dark-mode slot) — see README "Adding a new branch"
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    order: z.number(),
    status: z.enum(['active', 'planned']).default('active'),
    // The horizontal lanes of the timeline graph, top to bottom
    lanes: z
      .array(z.object({ id: z.string(), title: z.string() }))
      .default([]),
    // Optional localized copies of the prose fields (UI chrome is translated
    // in src/lib/i18n.ts; per-branch prose lives here next to the original)
    i18n: z
      .record(
        z.object({ tagline: z.string().optional(), description: z.string().optional() }),
      )
      .optional(),
  }),
});

/**
 * A NODE = one work (paper/system) in the genealogy.
 * Each node is one YAML file in src/content/nodes/; the filename is its id.
 */
const nodes = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/nodes' }),
  schema: z.object({
    title: z.string(),
    short: z.string(), // display label on the graph, e.g. "Eigen et al. 2014"
    authors: z.string().optional(),
    venue: z.string().optional(),
    year: z.number(),
    branch: reference('branches'),
    lane: z.string(),
    links: z.record(z.string().url()).default({}),
    problem: z.string(), // the problem it went after
    solution: z.string(), // the core idea
    limitations: z.string().optional(), // what it left open — bait for later nodes
    // Relations to nodes that came BEFORE it (declared on the newer node)
    relations: z
      .array(
        z.object({
          node: reference('nodes'),
          type: z.enum(['builds-on', 'fixes', 'independent', 'challenges', 'revives']),
          note: z.string().optional(),
        }),
      )
      .default([]),
    status: z.enum(['seed', 'draft', 'written']).default('seed'),
    post: reference('posts').optional(), // the deep-dive blog post, if any
  }),
});

/** MDX blog posts in src/content/posts/ */
const posts = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    nodes: z.array(reference('nodes')).default([]),
  }),
});

export const collections = { branches, nodes, posts };
