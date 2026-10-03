/**
 * UI-chrome strings. The site is English-only; routes keep their /en/ prefix
 * (LOCALES) so existing links stay valid.
 */
export const LOCALES = ['en'] as const;
export type Lang = (typeof LOCALES)[number];

const dict: Record<Lang, Record<string, string>> = {
  en: {
    'meta.description':
      'A genealogy of 3D computer vision — who fixed whom, what the mainstream overlooked, and which branches ran in parallel.',
    'nav.about': 'About',
    'nav.genealogy': 'Genealogy',
    'nav.branches': 'Branches',
    'nav.heresies': 'Heresies',
    'nav.blog': 'Blog',
    'footer.tagline':
      'A genealogy growing one node at a time — every node a work, every edge a named intellectual debt. Built with Astro + D3.',
    'theme.toggle': 'Toggle light/dark theme',
    'home.title': 'Genealogy',
    'hero.title': 'A genealogy of 3D computer vision',
    'howto.title': 'How to read the graph',
    'howto.arrows':
      'Arrows always follow time: from the older work to the newer one that references it. A filled node has a full write-up; a hollow one is a seed waiting to be written. A gold ring marks award / oral / spotlight / highlight recognition. The mark\'s shape tells the kind of work: ● method, ◆ analysis, ■ dataset.',
    'edge.fixes': 'fixes',
    'edge.builds-on': 'builds on',
    'edge.independent': 'independent',
    'edge.challenges': 'challenges',
    'edge.revives': 'revives',
    'glossary.fixes': 'Comes later and directly repairs a specific weakness of the earlier work',
    'glossary.builds-on': 'Stands on the earlier work and extends it in a new direction',
    'glossary.independent':
      'Converges on the same core idea at the same time, without depending on the other — the task, even the branch, may differ',
    'glossary.challenges': 'Questions the assumptions, benchmarks, or conclusions of the earlier work',
    'glossary.revives': 'Reawakens a direction the mainstream had abandoned',
    'table.title': 'Table view — the whole genealogy, no graph required',
    'table.year': 'Year',
    'table.work': 'Work',
    'table.lane': 'Lane',
    'table.relations': 'Relations',
    'table.nodes': 'nodes',
    'posts.title': 'Latest posts',
    'posts.none': 'No posts yet — the genealogy is still germinating.',
    'posts.all': 'All posts →',
    'graph.hint2d':
      'Drag to pan · scroll to zoom · click a node to open its page · hover to trace its direct relations. Cross-branch links stay faint until you hover a node they touch.',
    'graph.filterHint': 'Click to toggle this branch · Alt-click to view it alone',
    'graph.hint3d':
      'Same genealogy in 3D — nodes cluster by lane (faint bubbles). Drag to rotate · scroll to zoom · click a node for details. Moving particles = fixes, red = challenges.',
    'graph.noscript': 'JavaScript is required for the graphs — the full table lives further down the page.',
    'graph.hasArticle': 'has article',
    'graph.seed': 'seed — to be written',
    'graph.award': 'award / oral / spotlight / highlight',
    'graph.kindHint': 'Click to fade or restore this kind of work · Alt-click to highlight it alone',
    'kind.method': 'method',
    'kind.analysis': 'analysis',
    'kind.dataset': 'dataset',
    'graph.tipOpen': 'Click to open its page →',
    'graph.loading3d': 'Loading 3D view…',
    'graph.error3d': 'Could not load the 3D view.',
    'graph.play': 'Play the years',
    'graph.pause': 'Pause',
    'graph.standsOn': 'Stands on',
    'graph.followedBy': 'Followed by',
    'graph.openPage': 'Open page →',
    'graph.close': 'Close',
    'graph.ariaTimeline': 'Genealogy of 3D vision works over time',
    'status.seed': 'seed',
    'status.draft': 'draft',
    'status.written': 'written',
    'node.linkPaper': 'Paper',
    'node.linkProject': 'Project page',
    'node.linkCode': 'Code',
    'node.linkJournal': 'Journal version',
    'node.problem': 'Problem',
    'node.coreIdea': 'Core idea',
    'node.question': 'Question',
    'node.finding': 'Finding',
    'node.limitations': 'Limitations it left behind',
    'node.place': 'Place in the genealogy',
    'node.standsOn': 'What it stands on',
    'node.standsOnIt': 'What stands on it',
    'node.thisWork': 'this work',
    'node.root': 'A root node — no relations recorded yet.',
    'node.readAnalysis': 'Read the full analysis:',
    'node.seedNotice': 'This node is still a {status} — a full write-up will come later.',
    'node.back': '← Back to the genealogy',
    'branches.title': 'Branches of the genealogy',
    'branches.intro':
      "Covering all of 3D vision from day one would be impossible — so this genealogy grows one branch at a time. Each branch is a current with its own story, but they intersect more often than you'd expect.",
    'branches.growing': 'growing',
    'branches.planned': 'planned',
    'branch.label': 'branch',
    'branch.timeline': 'Timeline',
    'branch.all': '← All branches',
    'blog.title': 'Blog',
    'blog.intro':
      'Each post digs into one node or one turning point of the genealogy — why it came to be, what it actually fixed, and what debt it left for the next generation.',
    'blog.none': 'No posts yet.',
    'blog.related': 'Related nodes:',
    'blog.all': '← All posts',
    'about.title': 'Why a "genealogy", not a "list of papers"?',
    'heresies.title': 'Heresies, rivalries & revivals',
    'heresies.meta':
      'The heresies, rivalries and revivals of 3D vision — who challenged the mainstream, which ideas fell everywhere at once, and what came back from the dead.',
    'heresies.intro':
      'Every survey tells the fixes and builds-on story. This page collects the other three kinds of edges — the ones linear write-ups drop on the floor. Nothing below is written by hand: it is generated from the genealogy itself, and grows as the genealogy grows.',
    'heresies.challenges.title': 'The heresies',
    'heresies.challenges.intro':
      'Papers that are great not because they added something, but because they proved an entire branch was fooling itself — questioning its assumptions, its benchmarks, or its conclusions.',
    'heresies.independent.title': 'When an idea is ripe',
    'heresies.independent.intro':
      'Groups that never met, touching the same idea at the same moment. When an idea is ripe, it falls everywhere at once — the interesting question is what conditions made it ripe.',
    'heresies.revives.title': 'Back from the dead',
    'heresies.revives.intro':
      'Directions the mainstream abandoned — sometimes for decades — until someone remembered. Orphaned branches have a habit of returning when nobody expects them.',
    'heresies.gap': '{n} years later',
    'heresies.crossBranch': 'Across branches',
    'heresies.teaser': 'Meet the heresies, the parallel discoveries & the revivals',
  },

};

export function t(lang: Lang, key: string): string {
  return dict[lang]?.[key] ?? dict.en[key] ?? key;
}

/** Strings the graph component's client scripts need, serialized into a data attribute. */
export function graphStrings(lang: Lang) {
  const keys = [
    'graph.hint2d',
    'graph.hint3d',
    'graph.hasArticle',
    'graph.seed',
    'graph.award',
    'graph.tipOpen',
    'graph.loading3d',
    'graph.error3d',
    'graph.play',
    'graph.pause',
    'graph.filterHint',
    'graph.kindHint',
    'graph.standsOn',
    'graph.followedBy',
    'graph.openPage',
    'graph.close',
  ] as const;
  return Object.fromEntries(keys.map((k) => [k.replace('graph.', ''), t(lang, k)]));
}
