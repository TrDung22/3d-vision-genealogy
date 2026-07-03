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
    'graph.hint2d': 'Drag to pan · scroll to zoom · click a node to open its page · hover to trace its direct relations.',
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
      'Gia phả của 3D computer vision — ai khắc phục ai, dòng chính bỏ quên gì, và những nhánh nào chạy song song.',
    'nav.about': 'Giới thiệu',
    'nav.genealogy': 'Gia phả',
    'nav.branches': 'Nhánh',
    'nav.heresies': 'Nghịch dòng',
    'nav.blog': 'Blog',
    'footer.tagline':
      'Một gia phả lớn dần theo từng node — mỗi node là một công trình, mỗi cạnh là một món nợ trí tuệ có tên. Dựng bằng Astro + D3.',
    'theme.toggle': 'Đổi giao diện sáng/tối',
    'home.title': 'Gia phả',
    'hero.title': 'Gia phả của 3D computer vision',
    'howto.title': 'Cách đọc đồ thị',
    'howto.arrows':
      'Mũi tên luôn theo chiều thời gian: từ công trình cũ đến công trình mới nhắc về nó. Node đặc đã có bài phân tích; node rỗng là hạt giống chờ viết. Vòng vàng đánh dấu paper được award / oral / spotlight / highlight.',
    'glossary.fixes': 'Ra sau và sửa trực tiếp một điểm yếu cụ thể của công trình trước',
    'glossary.builds-on': 'Đứng trên nền công trình trước và mở rộng sang hướng mới',
    'glossary.independent':
      'Cùng chạm đến một ý tưởng cốt lõi vào cùng thời điểm mà không phụ thuộc nhau — bài toán, thậm chí cả nhánh, có thể khác',
    'glossary.challenges': 'Chất vấn giả định, benchmark hoặc kết luận của công trình trước',
    'glossary.revives': 'Đánh thức một hướng đi mà dòng chính đã bỏ quên',
    'table.title': 'Dạng bảng — toàn bộ gia phả, không cần đồ thị',
    'table.year': 'Năm',
    'table.work': 'Công trình',
    'table.lane': 'Làn',
    'table.relations': 'Quan hệ',
    'table.nodes': 'node',
    'posts.title': 'Bài viết mới',
    'posts.none': 'Chưa có bài viết nào — gia phả vẫn đang ươm hạt.',
    'posts.all': 'Tất cả bài viết →',
    'graph.hint2d': 'Kéo để di chuyển · lăn chuột để zoom · bấm node để mở trang · rê chuột để soi quan hệ trực tiếp.',
    'graph.hint3d':
      'Cùng gia phả đó trong 3D — node tụ thành cụm theo làn (bong bóng mờ). Kéo để xoay · lăn chuột để zoom · bấm node xem chi tiết. Hạt sáng chạy = fixes, đỏ = challenges.',
    'graph.noscript': 'Cần JavaScript để xem đồ thị — bảng đầy đủ nằm ở cuối trang.',
    'graph.hasArticle': 'đã có bài viết',
    'graph.seed': 'hạt giống — chờ viết',
    'graph.award': 'award / oral / spotlight / highlight',
    'graph.tipOpen': 'Bấm để mở trang →',
    'graph.loading3d': 'Đang tải view 3D…',
    'graph.error3d': 'Không tải được view 3D.',
    'graph.play': 'Chạy dòng thời gian',
    'graph.pause': 'Tạm dừng',
    'graph.standsOn': 'Đứng trên vai',
    'graph.followedBy': 'Được nối tiếp bởi',
    'graph.openPage': 'Mở trang →',
    'node.problem': 'Bài toán',
    'node.coreIdea': 'Ý tưởng cốt lõi',
    'node.limitations': 'Giới hạn để lại',
    'node.place': 'Vị trí trong gia phả',
    'node.standsOn': 'Nó đứng trên vai ai',
    'node.standsOnIt': 'Ai đứng trên vai nó',
    'node.thisWork': 'công trình này',
    'node.root': 'Node gốc — chưa có quan hệ nào được ghi nhận.',
    'node.readAnalysis': 'Đọc bài phân tích đầy đủ:',
    'node.seedNotice': 'Node này đang ở mức {status} — bài phân tích sâu sẽ đến sau.',
    'node.back': '← Quay lại gia phả',
    'branches.title': 'Các nhánh của gia phả',
    'branches.intro':
      'Phủ hết 3D vision ngay từ đầu là bất khả thi — nên gia phả này lớn dần theo từng nhánh. Mỗi nhánh là một dòng chảy có câu chuyện riêng, nhưng chúng giao nhau nhiều hơn ta tưởng.',
    'branches.growing': 'đang phát triển',
    'branches.planned': 'dự kiến',
    'branch.label': 'nhánh',
    'branch.timeline': 'Dòng thời gian',
    'branch.all': '← Tất cả các nhánh',
    'blog.title': 'Blog',
    'blog.intro':
      'Mỗi bài viết đào sâu một node hoặc một khúc quanh của gia phả — vì sao nó ra đời, nó thực sự sửa được gì, và nó để lại món nợ nào cho thế hệ sau.',
    'blog.none': 'Chưa có bài viết nào.',
    'blog.related': 'Node liên quan:',
    'blog.all': '← Tất cả bài viết',
    'about.title': 'Vì sao là "gia phả", không phải "danh sách paper"?',
    'heresies.title': 'Nghịch dòng, song song & hồi sinh',
    'heresies.meta':
      'Những nghịch dòng, song song và hồi sinh của 3D vision — ai chất vấn dòng chính, ý tưởng nào rơi xuống nhiều nơi cùng lúc, và điều gì đã sống lại từ cõi quên.',
    'heresies.intro':
      'Chuyện fixes và builds on thì survey nào cũng kể. Trang này gom ba loại quan hệ còn lại — thứ mà các tài liệu tuyến tính đánh rơi. Không có gì dưới đây được viết tay: tất cả sinh ra từ chính gia phả, và lớn dần cùng gia phả.',
    'heresies.challenges.title': 'Những lời chất vấn',
    'heresies.challenges.intro':
      'Những paper vĩ đại không phải vì cộng thêm điều gì, mà vì chứng minh cả một nhánh đang tự lừa mình — chất vấn giả định, benchmark hoặc kết luận của nó.',
    'heresies.independent.title': 'Khi một ý tưởng chín',
    'heresies.independent.intro':
      'Những nhóm chưa từng gặp nhau cùng chạm một ý tưởng tại cùng một thời điểm. Khi một ý tưởng chín, nó tự rụng ở nhiều nơi một lúc — câu hỏi thú vị là điều kiện gì làm nó chín.',
    'heresies.revives.title': 'Sống lại từ cõi quên',
    'heresies.revives.intro':
      'Những hướng đi bị dòng chính bỏ rơi — có khi hàng thập kỷ — cho đến khi ai đó nhớ ra. Những nhánh mồ côi có thói quen quay lại khi không ai ngờ tới.',
    'heresies.gap': '{n} năm sau',
    'heresies.crossBranch': 'Xuyên nhánh',
    'heresies.teaser': 'Gặp những lời chất vấn, những phát hiện song song & những cuộc hồi sinh',
  },

  ja: {
    'meta.description':
      '3Dコンピュータビジョンの系譜 — 誰が誰を直し、主流が何を見落とし、どの枝が並行して走ったのか。',
    'nav.about': 'はじめに',
    'nav.genealogy': '系譜',
    'nav.branches': '系統',
    'nav.heresies': '異端',
    'nav.blog': 'ブログ',
    'footer.tagline':
      'ノードを一つずつ増やしながら育つ系譜 — すべてのノードは研究であり、すべてのエッジは名前を持つ知的負債です。Astro + D3 で構築。',
    'theme.toggle': 'ライト/ダークテーマ切り替え',
    'home.title': '系譜',
    'hero.title': '3Dコンピュータビジョンの系譜',
    'howto.title': 'グラフの読み方',
    'howto.arrows':
      '矢印は常に時間の向きに従います: 古い研究から、それを参照する新しい研究へ。塗りつぶしノードには解説記事があり、白抜きノードは執筆待ちの種です。金色のリングは受賞・Oral・Spotlight・Highlight の目印です。',
    'glossary.fixes': '後から現れ、先行研究の特定の弱点を直接修復する',
    'glossary.builds-on': '先行研究の上に立ち、新しい方向へ拡張する',
    'glossary.independent':
      '同じ核心のアイデアに同時期に、互いに依存せず到達した — タスクや枝が異なっていてもよい',
    'glossary.challenges': '先行研究の前提・ベンチマーク・結論に疑問を投げかける',
    'glossary.revives': '主流が見捨てた方向性を呼び覚ます',
    'table.title': '表で見る — グラフなしで系譜全体を',
    'table.year': '年',
    'table.work': '研究',
    'table.lane': 'レーン',
    'table.relations': '関係',
    'table.nodes': 'ノード',
    'posts.title': '最新記事',
    'posts.none': 'まだ記事はありません — 系譜はまだ発芽中です。',
    'posts.all': 'すべての記事 →',
    'graph.hint2d':
      'ドラッグで移動 · スクロールでズーム · ノードをクリックで詳細ページへ · ホバーで直接の関係をハイライト。',
    'graph.hint3d':
      '同じ系譜を3Dで — ノードはレーンごとに集まります(薄い球)。ドラッグで回転 · スクロールでズーム · クリックで詳細。流れる粒子 = fixes、赤 = challenges。',
    'graph.noscript': 'グラフの表示にはJavaScriptが必要です — ページ下部に完全な表があります。',
    'graph.hasArticle': '記事あり',
    'graph.seed': '種 — 執筆待ち',
    'graph.award': '受賞 / Oral / Spotlight / Highlight',
    'graph.tipOpen': 'クリックでページを開く →',
    'graph.loading3d': '3Dビューを読み込み中…',
    'graph.error3d': '3Dビューを読み込めませんでした。',
    'graph.play': '年代を再生',
    'graph.pause': '一時停止',
    'graph.standsOn': '土台となる研究',
    'graph.followedBy': '後続の研究',
    'graph.openPage': 'ページを開く →',
    'node.problem': '問題',
    'node.coreIdea': '中核となるアイデア',
    'node.limitations': '残された限界',
    'node.place': '系譜の中の位置',
    'node.standsOn': '何の肩の上に立つか',
    'node.standsOnIt': '何がその肩の上に立つか',
    'node.thisWork': 'この研究',
    'node.root': 'ルートノード — まだ関係が記録されていません。',
    'node.readAnalysis': '詳細な分析を読む:',
    'node.seedNotice': 'このノードはまだ {status} の段階です — 詳しい解説はこれからです。',
    'node.back': '← 系譜に戻る',
    'branches.title': '系譜の系統一覧',
    'branches.intro':
      '初日から3Dビジョン全体をカバーするのは不可能です — この系譜は一つの枝ずつ育ちます。それぞれの枝には固有の物語がありますが、思った以上に頻繁に交差します。',
    'branches.growing': '成長中',
    'branches.planned': '計画中',
    'branch.label': '系統',
    'branch.timeline': 'タイムライン',
    'branch.all': '← すべての系統',
    'blog.title': 'ブログ',
    'blog.intro':
      '各記事は系譜の一つのノード、あるいは一つの転換点を掘り下げます — なぜ生まれ、実際に何を直し、次の世代にどんな負債を残したのか。',
    'blog.none': 'まだ記事はありません。',
    'blog.related': '関連ノード:',
    'blog.all': '← すべての記事',
    'about.title': 'なぜ「論文リスト」ではなく「系譜」なのか?',
    'heresies.title': '異端・並行・復活',
    'heresies.meta':
      '3Dビジョンの異端・並行・復活 — 誰が主流に異を唱え、どのアイデアが同時多発し、何が死から蘇ったのか。',
    'heresies.intro':
      'fixes と builds on の物語はどのサーベイも語ります。このページは残りの三種類のエッジを集めたもの — 線形な解説が取りこぼす部分です。以下に手書きの内容は一つもありません: すべて系譜そのものから生成され、系譜とともに育ちます。',
    'heresies.challenges.title': '異端者たち',
    'heresies.challenges.intro':
      '何かを積み上げたからではなく、ある枝全体が自分を騙していたことを証明したからこそ偉大な論文たち — 前提・ベンチマーク・結論への問いかけ。',
    'heresies.independent.title': 'アイデアが熟すとき',
    'heresies.independent.intro':
      '出会ったこともないグループが、同じ瞬間に同じアイデアに触れる。アイデアが熟せば、あちこちで同時に落ちる — 面白い問いは、どんな条件がそれを熟させたのか。',
    'heresies.revives.title': '死からの帰還',
    'heresies.revives.intro':
      '主流が見捨てた方向性 — ときには何十年も — 誰かが思い出すまで。孤児になった枝は、誰も予想しないときに帰ってくるものです。',
    'heresies.gap': '{n} 年後',
    'heresies.crossBranch': '系統を越えて',
    'heresies.teaser': '異端・並行発見・復活の物語はこちら',
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
    'graph.standsOn',
    'graph.followedBy',
    'graph.openPage',
  ] as const;
  return Object.fromEntries(keys.map((k) => [k.replace('graph.', ''), t(lang, k)]));
}
