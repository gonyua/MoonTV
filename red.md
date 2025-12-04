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
⛬ lib 目录文件作用

文件 │ 作用  
 ---------------------------------------------+--------------------------------------
`db.client.ts` │ **客户端**数据操作（localStorage/混合缓存）
`db.ts` │ **服务端**数据库工厂（根据配置返回 redis/d1/upstash）
`redis.db.ts` / `d1.db.ts` / `upstash.db.ts` │ 三种数据库的具体实现
`auth.ts` │ 认证相关（解析 cookie、密码哈希）
`config.ts` │ 配置加载逻辑
`runtime.ts` │ 构建时从 config.json 生成的静态配置
`douban.client.ts` │ 豆瓣 API 客户端调用
`downstream.ts` │ 搜索时并行请求多个视频源站点
`types.ts` │ TypeScript 类型定义
`utils.ts` │ 通用工具函数
`yellow.ts` │ 黄色内容过滤关键词

──────────────────────────────────────────

1. lib 目录是干嘛的？

可以简单理解成“业务工具层”，把和 UI 无关的逻辑都放在这里，方便前后端复用、解耦页面：

- 存储 & 数据访问
  - db.ts：统一的数据库管理入口（根据 NEXT_PUBLIC_STORAGE_TYPE 选择 D1 / Redis / Upstash / local）。
  - d1.db.ts / redis.db.ts / upstash.db.ts：不同存储后端的具体实现。
  - db.client.ts：浏览器侧的数据访问封装（调 /api/\*\* + 做缓存、本地 fallback）。
  - types.ts / admin.types.ts / navs.types.ts / notes.types.ts：各种类型定义。
- 豆瓣相关
  - douban.client.ts：豆瓣列表、分类接口封装（带代理、超时等）。
  - douban-auth.ts / douban-mine.ts：豆瓣登录 Cookie、个人数据的处理。
- 笔记 / 导航 / 配置等业务工具
  - notes.client.ts / notes.server.ts / notes.utils.ts：笔记功能的前后端逻辑。
  - navs.client.ts：导航配置的前端逻辑。
  - config.ts / runtime.ts / version.ts / yellow.ts / downstream.ts / utils.ts：运行时配置、版本号、通用工具函数等。
  - parseBookmarks.ts / fetchVideoDetail.ts：解析书签、拉取视频详情的辅助函数。
- 这些文件里有的只给服务器用（只被 /api/\*\* 或 server component 引用），有的是浏览器和服务器都用，但它们本身不直接渲染 UI。
