# Contributing

The entire genealogy lives in `src/content/` as YAML/MDX. **No code changes are
needed** to add a paper, a relation, or a whole new branch — both graphs, the
node pages, the branch pages, the table view, and the [heresies page](https://trdung22.github.io/3d-vision-genealogy/en/heresies/)
are all generated at build time.

```
src/content/
├── branches/           # one YAML file per major branch (single-image-3d, neural-rendering, ...)
├── nodes/              # one YAML file per work (filename = node id)
└── posts/              # MDX blog posts, optionally attached to nodes

src/lib/graph.ts        # folds content into the graph payload + the relation vocabulary
src/lib/i18n.ts         # UI-chrome strings (en / ja)
src/lib/graph3d.js      # 3D force-graph view (loaded as a separate chunk)
src/components/         # GenealogyGraph (D3 timeline DAG + 3D view below it)
src/pages/              # home, nodes, branches, heresies, blog, graph.json
```

## Adding a work (node)

Create `src/content/nodes/<id>.yaml`:

```yaml
title: "Full paper title"
short: "Short label (Author Year)"   # shown on the graph
authors: "..."
venue: "CVPR 2025"                   # award/oral/spotlight in this string ⇒ gold ring
year: 2025
branch: single-image-3d              # branch id
lane: depth                          # lane id within that branch (see the branch YAML)
links:
  arxiv: "https://arxiv.org/abs/..."
  code: "https://github.com/..."
problem: >
  The problem it went after — specific, one paragraph.
solution: >
  The core idea — what is genuinely new.
limitations: >
  What it left open — this is the bait for the nodes that come after it.
relations:
  - node: midas2020                  # id of the OLDER node it relates to
    type: fixes
    note: "Which SPECIFIC weakness it repairs — no hand-waving."
status: seed                         # seed → draft → written
# post: some-blog-slug               # attach the deep-dive post once written
```

### The relation vocabulary (the heart of the project)

| type | meaning |
|---|---|
| `fixes` | comes later and directly repairs a specific weakness of the earlier work |
| `builds-on` | stands on the earlier work and extends it in a new direction |
| `independent` | converges on the same core idea at the same time, without depending on the other — the task, even the branch, may differ |
| `challenges` | questions the assumptions, benchmarks, or conclusions of the earlier work |
| `revives` | reawakens a direction the mainstream had abandoned |

Convention: relations are always declared on the **newer** node, pointing to the
**older** one. Arrows on the graph flow with time automatically, and every
`independent` / `challenges` / `revives` edge automatically appears on the
heresies page.

A note on `independent`, the one semantically *symmetric* edge (declaring it on
the newer node is just the file convention): it records siblings, not
parent-and-child. Read "same core idea" at the level of the shared discovery,
not the downstream task — the 2019 implicit wave converged on "3D as a
coordinate MLP" from two different problems in two different branches
(DeepSDF ↔ SRN), and that cross-branch simultaneity is exactly the signal
worth recording. Most node pairs share nothing and get no edge at all; an
`independent` edge asserts the works are close kin whose only missing link is
dependence.

Three editorial principles:

1. Every node answers three questions: *what problem — what idea — what limitations it left behind*.
2. Every edge names the *specific weakness* being repaired — no hand-waving.
3. Historical honesty over fame — and don't state award/oral/spotlight status
   without a verifiable source (official proceedings, OpenReview, the authors'
   own README).

## Adding a new branch

Create `src/content/branches/<id>.yaml`:

```yaml
title: "Multi-View Geometry"
tagline: "One-line summary of the branch"
description: >
  A longer introduction, shown on the branch page.
color: "#c98500"        # take the NEXT unused color slot (table below)
order: 3                # display order on the graph, top to bottom
status: active          # or planned
lanes:                  # the branch's horizontal lanes on the timeline
  - id: sfm
    title: "Structure from Motion"
  - id: mvs
    title: "Multi-view stereo"
```

Then add nodes with `branch: <id>` — both the 2D and 3D graphs grow the new
branch on their own, including cross-branch edges (existing example:
DeepSDF → NeRF → Zero-1-to-3).

### Branch color slots (validated CVD-safe on the dark surface, assigned in fixed order)

| slot | hex | currently used by |
|---|---|---|
| 1 | `#3987e5` | single-image-3d |
| 2 | `#199e70` | neural-rendering |
| 3 | `#c98500` | (next branch) |
| 4 | `#008300` | |
| 5 | `#9085e9` | |

Don't reorder the slots and don't invent new colors — the slot order itself is
the color-vision-safety mechanism. (Palette from a validated dataviz reference;
avoid `#e66767` for branches since red is reserved for *challenges* edges.)

## Writing a blog post

Create `src/content/posts/<slug>.mdx` with frontmatter `title`, `description`,
`date`, `nodes: [id1, id2]` (related nodes). Attach the post back onto a node
via its `post:` field so the node flips from hollow (seed) to filled (written)
on the graph.

## Languages & theme

The site is bilingual — English at `/en/` (root `/` redirects there) and
Japanese at `/ja/` — with a light/dark theme toggle (persisted in
`localStorage`, defaults to the system preference).

- UI chrome strings live in `src/lib/i18n.ts`; per-branch prose is localized via
  the optional `i18n:` block in each branch YAML.
- Node prose (`problem` / `solution` / `limitations` / relation notes) is
  localized via the optional `i18n: { ja: ... }` block in each node YAML; any
  missing field falls back to English.
- Both graphs read their colors from CSS custom properties at render time, so
  they re-theme live (the timeline re-renders, the 3D view swaps materials).
