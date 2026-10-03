# Contributing

The entire genealogy lives in `src/content/` as YAML/MDX. **No code changes are
needed** to add a paper, a relation, a guided tour or a whole new branch — the
atlas (flat and in 3D), the node pages, the branch pages, the index, the
search, the tours and the [heresies page](https://trdung22.github.io/3d-vision-genealogy/en/heresies/)
are all generated at build time.

```
src/content/
├── branches/           # one YAML file per major branch (single-image-3d, neural-rendering, ...)
├── nodes/              # one YAML file per work (filename = node id)
├── tours/              # one YAML file per guided tour (a path through recorded relations)
└── posts/              # MDX blog posts, optionally attached to nodes

src/lib/graph.ts        # folds content into the graph payload + the relation vocabulary
src/lib/i18n.ts         # UI-chrome strings
src/lib/atlas.js        # the atlas: layout, lineage, filters, time machine, inspector,
                        # the 2D/3D switch and the tours
src/lib/atlas3d.js      # the same atlas lifted into 3D (three.js, a separate chunk
                        # loaded the first time a reader asks for 3D)
src/components/         # Atlas, LineageGraph, SearchPalette, …
src/pages/              # home, works (index), nodes, branches, heresies, blog,
                        # graph.json + search.json (the client payloads)
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
kind: method                         # method (default) | analysis | dataset — drawn ● ◆ ■
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

`kind` marks what sort of work a node is. Leave it out for methods. Use
`analysis` for papers whose contribution is a finding about what the field's
methods or benchmarks actually show (Tatarchenko 2019, DyCheck), and `dataset`
for data or benchmark trunks other nodes stand on (ShapeNet, Objaverse). A
non-method node is admitted only if it connects to a node already in the graph.
Analysis pages read *Question → Finding* instead of *Problem → Core idea*.

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

A note on `fixes`: the weakness has to be on the record, not inferred by us.
Either the earlier work admits it, or the later work explicitly diagnoses it in
the earlier one — papers rarely see all of their own flaws, and the diagnosis
often comes from the paper that fixes it. When a `limitations` paragraph
reports a weakness the work never admitted, it says whose diagnosis it is.
When a later work both builds on an earlier one and repairs a weakness it
names there, `fixes` wins if that repair is its core contribution (D-NeRF,
Nerfies and NSFF each name NeRF's static-scene assumption and exist to lift
it); `builds-on` is for extensions whose diagnosis is incidental.

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
lanes:                  # the branch's lanes in the atlas, top to bottom
  - id: sfm
    title: "Structure from Motion"
  - id: mvs
    title: "Multi-view stereo"
```

Then add nodes with `branch: <id>` — the atlas grows the new branch on its own
(a new band flat, a new floor in 3D), including cross-branch edges (existing
example: DeepSDF → NeRF → Zero-1-to-3), which become bridges between floors.

### Branch color slots (validated CVD-safe on the dark surface, assigned in fixed order)

| slot | hex | currently used by |
|---|---|---|
| 1 | `#3987e5` | single-image-3d |
| 2 | `#199e70` | neural-rendering |
| 3 | `#c98500` | multi-view-geometry |
| 4 | `#008300` | dynamic-4d |
| 5 | `#9085e9` | |

Don't reorder the slots and don't invent new colors — the slot order itself is
the color-vision-safety mechanism. (Palette from a validated dataviz reference;
avoid `#e66767` for branches since red is reserved for *challenges* edges.)

## Adding a guided tour

A tour is a walk through relations that are **already recorded** — one stop
per relation (or a final stop on a single work). Create
`src/content/tours/<id>.yaml`:

```yaml
title: Five roads into NeRF
summary: The five works NeRF stands on in this genealogy, oldest first — then everything recorded as standing on NeRF.
order: 1                 # position in the Tours menu
steps:
  - { from: kajiya1984, to: nerf2020 }   # a relation: older work → newer work
  - { from: deepsdf2019, to: nerf2020 }
  - { work: nerf2020 }                   # a work: its whole lineage lights up
```

The rule that keeps tours honest: **a tour adds no claims of its own.** Every
word a reader sees on a stop comes from the works and the `note:` on the
relation — so the title and the one-line summary describe the *path*, not the
history. A step that names a relation nobody recorded fails the build. On each
relation stop the time machine rewinds to the newer work's year (what came
later is not there yet); the final work stop shows everything since.

## Writing a blog post

Create `src/content/posts/<slug>.mdx` with frontmatter `title`, `description`,
`date`, `nodes: [id1, id2]` (related nodes). Attach the post back onto a node
via its `post:` field so the node gains its "has article" dot in the atlas
and a link to the post on its page.

## Language & theme

The site is English-only, at `/en/` (root `/` redirects there), with a
light/dark theme toggle (persisted in `localStorage`, defaults to the system
preference).

- UI chrome strings live in `src/lib/i18n.ts`; all content prose lives in the
  YAML itself.
- The atlas (flat and in 3D) reads its colors from CSS custom properties, so
  it re-themes live (the flat chart just swaps its branch-color variables, the
  3D view swaps materials).
