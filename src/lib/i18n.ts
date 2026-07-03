/**
 * UI-chrome translations. Academic node content (problem/solution/limitations)
 * intentionally stays in English for now — it can be localized per node later
 * without touching this file.
 */
export const LOCALES = ['en', 'vi', 'ja'] as const;
export type Lang = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Lang, string> = { en: 'EN', vi: 'VI', ja: '日本語' };

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
      'Arrows always follow time: from the older work to the newer one that references it. A filled node has a full write-up; a hollow one is a seed waiting to be written. A gold ring marks award / oral / spotlight / highlight recognition.',
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
    'graph.tipOpen': 'Click to open its page →',
    'graph.loading3d': 'Loading 3D view…',
    'graph.error3d': 'Could not load the 3D view.',
    'graph.play': 'Play the years',
    'graph.pause': 'Pause',
    'graph.standsOn': 'Stands on',
    'graph.followedBy': 'Followed by',
    'graph.openPage': 'Open page →',
    'node.problem': 'Problem',
    'node.coreIdea': 'Core idea',
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

  vi: {
    'meta.description':
      'Gia phả của ngành 3D computer vision — ai sửa lỗi cho ai, dòng chính bỏ sót điều gì, và những nhánh nào đã âm thầm đi song song.',
    'nav.about': 'Giới thiệu',
    'nav.genealogy': 'Gia phả',
    'nav.branches': 'Nhánh',
    'nav.heresies': 'Nghịch dòng',
    'nav.blog': 'Blog',
    'footer.tagline':
      'Cây gia phả lớn dần từng node một — mỗi node là một công trình, mỗi cạnh ghi rõ ai nợ ai điều gì. Dựng bằng Astro + D3.',
    'theme.toggle': 'Đổi giao diện sáng/tối',
    'home.title': 'Gia phả',
    'hero.title': 'Gia phả của ngành 3D computer vision',
    'howto.title': 'Cách đọc đồ thị',
    'howto.arrows':
      'Mũi tên luôn chảy xuôi theo thời gian: từ công trình trước đến công trình sau có nhắc đến nó. Node tô đặc là đã có bài phân tích; node rỗng là hạt giống còn chờ viết. Vòng vàng nghĩa là paper từng được award / oral / spotlight / highlight.',
    'glossary.fixes': 'Ra đời sau và sửa thẳng vào một điểm yếu cụ thể của công trình trước',
    'glossary.builds-on': 'Đứng trên nền công trình trước và mở ra một hướng mới',
    'glossary.independent':
      'Hai bên không hề hay biết về nhau mà cùng lúc chạm đến một ý tưởng — dù bài toán, thậm chí cả nhánh, mỗi bên một khác',
    'glossary.challenges': 'Xét lại giả định, benchmark hay chính kết luận của công trình trước',
    'glossary.revives': 'Đánh thức một hướng đi mà dòng chính đã bỏ quên từ lâu',
    'table.title': 'Xem dạng bảng — trọn bộ gia phả, không cần đồ thị',
    'table.year': 'Năm',
    'table.work': 'Công trình',
    'table.lane': 'Mạch',
    'table.relations': 'Quan hệ',
    'table.nodes': 'node',
    'posts.title': 'Bài viết mới',
    'posts.none': 'Chưa có bài viết nào — gia phả vẫn đang ươm mầm.',
    'posts.all': 'Tất cả bài viết →',
    'graph.hint2d':
      'Kéo để di chuyển · lăn chuột để zoom · bấm vào node để mở trang · rê chuột lên node để soi các quan hệ trực tiếp của nó. Quan hệ xuyên nhánh được làm mờ — rê chuột vào node là chúng hiện rõ.',
    'graph.filterHint': 'Bấm để bật/tắt nhánh này · Alt+bấm để xem riêng nó',
    'graph.hint3d':
      'Vẫn gia phả đó, nhưng trong không gian 3D — các node tụ thành cụm theo mạch nghiên cứu (mấy quả bong bóng mờ). Kéo để xoay · lăn chuột để zoom · bấm vào node để xem chi tiết. Hạt sáng đang chạy = fixes, màu đỏ = challenges.',
    'graph.noscript': 'Cần bật JavaScript để xem đồ thị — bảng đầy đủ nằm ở cuối trang.',
    'graph.hasArticle': 'đã có bài phân tích',
    'graph.seed': 'hạt giống — còn chờ viết',
    'graph.award': 'award / oral / spotlight / highlight',
    'graph.tipOpen': 'Bấm để mở trang →',
    'graph.loading3d': 'Đang tải view 3D…',
    'graph.error3d': 'Không tải được view 3D.',
    'graph.play': 'Tua qua từng năm',
    'graph.pause': 'Tạm dừng',
    'graph.standsOn': 'Đứng trên vai',
    'graph.followedBy': 'Mở đường cho',
    'graph.openPage': 'Mở trang →',
    'node.problem': 'Bài toán',
    'node.coreIdea': 'Ý tưởng cốt lõi',
    'node.limitations': 'Những giới hạn để lại',
    'node.place': 'Vị trí trong gia phả',
    'node.standsOn': 'Nó đứng trên vai ai',
    'node.standsOnIt': 'Ai đứng trên vai nó',
    'node.thisWork': 'công trình này',
    'node.root': 'Node gốc — chưa ghi nhận quan hệ nào.',
    'node.readAnalysis': 'Đọc bài phân tích đầy đủ:',
    'node.seedNotice': 'Node này mới chỉ là {status} — bài phân tích sâu sẽ có sau.',
    'node.back': '← Về lại gia phả',
    'branches.title': 'Các nhánh của gia phả',
    'branches.intro':
      'Ôm trọn cả ngành 3D vision ngay từ đầu là chuyện bất khả — nên gia phả này lớn lên từng nhánh một. Mỗi nhánh là một dòng chảy với câu chuyện của riêng nó, nhưng các nhánh gặp nhau thường xuyên hơn ta tưởng.',
    'branches.growing': 'đang lớn',
    'branches.planned': 'dự kiến',
    'branch.label': 'nhánh',
    'branch.timeline': 'Dòng thời gian',
    'branch.all': '← Tất cả các nhánh',
    'blog.title': 'Blog',
    'blog.intro':
      'Mỗi bài viết đào sâu một node, hoặc một khúc quanh của gia phả — vì sao nó ra đời, nó thật sự sửa được điều gì, và nó để lại món nợ gì cho thế hệ sau.',
    'blog.none': 'Chưa có bài viết nào.',
    'blog.related': 'Node liên quan:',
    'blog.all': '← Tất cả bài viết',
    'about.title': 'Vì sao là "gia phả" mà không phải "danh sách paper"?',
    'heresies.title': 'Nghịch dòng, song hành & hồi sinh',
    'heresies.meta':
      'Những cú nghịch dòng, những phát hiện song hành và những cuộc hồi sinh của 3D vision — ai dám cãi lại dòng chính, ý tưởng nào chín cùng lúc ở nhiều nơi, và điều gì đã sống dậy từ quên lãng.',
    'heresies.intro':
      'Chuyện fixes với builds on thì survey nào cũng kể rồi. Trang này dành cho ba loại quan hệ còn lại — những thứ mà lối kể chuyện một mạch thẳng nào cũng làm rơi dọc đường. Không dòng nào dưới đây được viết tay: tất cả sinh ra từ chính gia phả, và lớn lên cùng nó.',
    'heresies.challenges.title': 'Những kẻ nghịch dòng',
    'heresies.challenges.intro':
      'Có những paper vĩ đại không phải vì đóng góp thêm thứ gì, mà vì chúng chỉ ra cả một nhánh đang tự lừa mình — bằng cách xét lại giả định, benchmark, hay chính kết luận của nhánh đó.',
    'heresies.independent.title': 'Khi ý tưởng đã chín',
    'heresies.independent.intro':
      'Những nhóm chưa từng gặp nhau, cùng một lúc với tay đến cùng một ý tưởng. Ý tưởng khi đã chín thì tự rụng ở nhiều nơi cùng lúc — câu hỏi thú vị là: điều kiện nào đã làm nó chín?',
    'heresies.revives.title': 'Sống dậy từ quên lãng',
    'heresies.revives.intro':
      'Những hướng đi bị dòng chính bỏ rơi — có khi cả mấy chục năm — cho đến ngày có người nhớ ra. Nhánh mồ côi có cái tật quay về đúng lúc chẳng ai ngờ tới.',
    'heresies.gap': '{n} năm sau',
    'heresies.crossBranch': 'Xuyên nhánh',
    'heresies.teaser': 'Xem những kẻ nghịch dòng, những ý tưởng song hành & những cuộc hồi sinh',
  },

  ja: {
    'meta.description':
      '3Dコンピュータビジョンの系譜 — 誰が誰の弱点を直し、主流は何を見落とし、どの枝が知らぬ間に並走していたのか。',
    'nav.about': 'はじめに',
    'nav.genealogy': '系譜',
    'nav.branches': '系統',
    'nav.heresies': '異端',
    'nav.blog': 'ブログ',
    'footer.tagline':
      'ノードを一つずつ足しながら育っていく系譜。ノードはどれも一つの研究、エッジはどれも「誰が誰に何を負っているか」の記録です。Astro + D3 製。',
    'theme.toggle': 'ライト/ダークテーマ切り替え',
    'home.title': '系譜',
    'hero.title': '3Dコンピュータビジョンの系譜',
    'howto.title': 'グラフの読み方',
    'howto.arrows':
      '矢印はつねに時間の流れに沿って、古い研究からそれを踏まえた新しい研究へ向かいます。塗りつぶされたノードには解説記事があり、白抜きのノードは執筆待ちの種。金色のリングは受賞・Oral・Spotlight・Highlight の印です。',
    'glossary.fixes': '後から現れ、先行研究の特定の弱点をまっすぐ直す',
    'glossary.builds-on': '先行研究の土台の上に立ち、新しい方向へ広げる',
    'glossary.independent':
      '互いを知らないまま、同じ時期に同じ核心のアイデアへたどり着く — タスクも、枝さえも、違っていて構わない',
    'glossary.challenges': '先行研究の前提・ベンチマーク・結論そのものを疑う',
    'glossary.revives': '主流が置き去りにした方向を、もう一度呼び覚ます',
    'table.title': '表で一望 — グラフがなくても系譜のすべてを',
    'table.year': '年',
    'table.work': '研究',
    'table.lane': 'レーン',
    'table.relations': '関係',
    'table.nodes': 'ノード',
    'posts.title': '最新記事',
    'posts.none': 'まだ記事はありません — 系譜はようやく芽吹きはじめたところです。',
    'posts.all': 'すべての記事 →',
    'graph.hint2d':
      'ドラッグで移動 · スクロールでズーム · ノードをクリックで個別ページへ · ホバーすると直接の関係が浮かび上がります。枝をまたぐ関係は薄く描かれ、ノードにホバーするとはっきり現れます。',
    'graph.filterHint': 'クリックで枝の表示を切り替え · Alt+クリックでこの枝だけ表示',
    'graph.hint3d':
      '同じ系譜を3Dで。ノードはレーンごとに寄り集まります(淡い球)。ドラッグで回転 · スクロールでズーム · クリックで詳細へ。流れる粒子は fixes、赤は challenges。',
    'graph.noscript': 'グラフの表示には JavaScript が必要です — ページ下部に完全な表があります。',
    'graph.hasArticle': '記事あり',
    'graph.seed': '種 — 執筆待ち',
    'graph.award': '受賞 / Oral / Spotlight / Highlight',
    'graph.tipOpen': 'クリックでページを開く →',
    'graph.loading3d': '3Dビューを読み込み中…',
    'graph.error3d': '3Dビューを読み込めませんでした。',
    'graph.play': '年代を再生',
    'graph.pause': '一時停止',
    'graph.standsOn': '土台となる研究',
    'graph.followedBy': '後に続く研究',
    'graph.openPage': 'ページを開く →',
    'node.problem': '問題',
    'node.coreIdea': '中核のアイデア',
    'node.limitations': '残された限界',
    'node.place': '系譜の中の位置',
    'node.standsOn': '誰の肩の上に立っているか',
    'node.standsOnIt': '誰がこの肩の上に立ったか',
    'node.thisWork': 'この研究',
    'node.root': 'ルートノード — 記録された関係はまだありません。',
    'node.readAnalysis': '詳しい分析を読む:',
    'node.seedNotice': 'このノードはまだ {status} の段階 — 詳しい解説はこれから書かれます。',
    'node.back': '← 系譜へ戻る',
    'branches.title': '系譜の系統一覧',
    'branches.intro':
      '3Dビジョンの全体をいきなり網羅することはできません。だからこの系譜は、一枝ずつ育てています。どの枝にもそれぞれの物語がありますが、枝どうしは思いのほかよく交差します。',
    'branches.growing': '成長中',
    'branches.planned': '計画中',
    'branch.label': '系統',
    'branch.timeline': 'タイムライン',
    'branch.all': '← すべての系統',
    'blog.title': 'ブログ',
    'blog.intro':
      'それぞれの記事で、系譜のノード一つ、あるいは転換点一つを掘り下げます。なぜ生まれたのか、実際には何を直したのか、そして次の世代にどんな宿題を残したのか。',
    'blog.none': 'まだ記事はありません。',
    'blog.related': '関連ノード:',
    'blog.all': '← すべての記事',
    'about.title': 'なぜ「論文リスト」ではなく「系譜」なのか',
    'heresies.title': '異端・同時発見・復活',
    'heresies.meta':
      '3Dビジョンの異端と同時発見と復活 — 誰が主流に異を唱え、どのアイデアが各地で同時に実り、何が忘却から蘇ったのか。',
    'heresies.intro':
      'fixes と builds on の物語なら、どのサーベイも語ってくれます。このページに集めたのは残りの三種類のエッジ — 一本道の解説からこぼれ落ちてしまう部分です。以下は一行たりとも手書きではありません。すべて系譜そのものから生成され、系譜とともに育ちます。',
    'heresies.challenges.title': '異端者たち',
    'heresies.challenges.intro':
      '何かを積み上げたからではなく、ある枝がまるごと思い込みの上に立っていたと示したからこそ偉大な論文たち。前提を、ベンチマークを、結論そのものを疑った研究です。',
    'heresies.independent.title': 'アイデアが熟すとき',
    'heresies.independent.intro':
      '面識のないグループどうしが、同じ時期に同じアイデアへ手を伸ばす。熟したアイデアは、あちこちで同時に実を落とします。面白いのは「何がそれを熟させたのか」という問いのほうです。',
    'heresies.revives.title': '死からの帰還',
    'heresies.revives.intro':
      '主流に見捨てられた方向 — ときには何十年も — を、誰かがふと思い出す。孤児になった枝は、誰も予想していないときに帰ってくるものです。',
    'heresies.gap': '{n} 年後',
    'heresies.crossBranch': '系統を越えて',
    'heresies.teaser': '異端・同時発見・復活の物語を読む',
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
    'graph.standsOn',
    'graph.followedBy',
    'graph.openPage',
  ] as const;
  return Object.fromEntries(keys.map((k) => [k.replace('graph.', ''), t(lang, k)]));
}
