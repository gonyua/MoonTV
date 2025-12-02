问题原因：

1.  首页模块间距过大：section 的 mb-8 + ScrollableRow 的 pb-12/14 叠加
2.  列表页条目间距过大：grid 的 gap-y-14/12 和 sm:gap-y-20

修改内容（均缩小一半）：

1.  ScrollableRow.tsx: pb-12 sm:pb-14 → pb-6 sm:pb-7
2.  ContinueWatching.tsx: mb-8 → mb-4
3.  page.tsx 首页: 热门电影/剧集/综艺 section 的 mb-8 → mb-4
4.  page.tsx 列表: gap-y-14 sm:gap-y-20 → gap-y-7 sm:gap-y-10
5.  douban/page.tsx: gap-y-12 sm:gap-y-20 → gap-y-6 sm:gap-y-10

1..
