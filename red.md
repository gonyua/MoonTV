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
`yellow.ts` │ 成人内容过滤关键词

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

  和首页热门数据的区别：

  模块 │ 请求方式  
   -----------+-----------------------------
  热门电影/剧集/综艺 │ 根据代理配置，可能直接请求豆瓣或走服务端
  想看/在看/看过 │ 固定走服务端 API `/api/douban/mine`

  为什么"想看/在看/看过"必须走服务端？

  因为这些数据需要携带用户的豆瓣 Cookie 进行身份验证，直接在浏览器请求豆瓣会暴露 Cookie 且有跨域问题，所以必须通过服
  务端中转。

  模式 1：有代理

  用户浏览器 ──→ 代理服务器 ──→ 豆瓣 API

  浏览器通过代理直接访问豆瓣，服务端不参与。

  模式 2：无代理

  用户浏览器 ──→ 你的服务端(/api/douban/categories) ──→ 豆瓣 API

  浏览器先请求你自己的服务端 API，然后你的服务端再去请求豆瓣。

  为什么要这样设计？

  因为豆瓣 API 有跨域限制，浏览器直接请求会被拒绝。所以：
  • 有代理：代理帮你绕过跨域
  • 无代理：让服务端帮你请求（服务端没有跨域限制）

  两种方式第一步都是浏览器发起的，只是"谁去请求豆瓣"不同。

  • 拿 douban-mine.ts 这个例子来说，它现在的“使用方”确实只有 /app/api/douban/mine/route.ts，但它本身的“性质”并不是一个纯 server
  依赖的模块，这就是它没被丢进 lib/server 的原因。

  可以从几层来看：

  - 看依赖，而不是看调用方
    - src/lib/douban-mine.ts 里面就是字符串处理、正则、简单的 HTML 文本解析，没有：
      - NextRequest / NextResponse
      - process.env / 数据库 / D1 绑定
      - Node 内置模块（fs、path 等）
      - fetch、window、document 等环境特定 API
    - 换句话说，它是一个纯函数库，只要有 JS 运行时就能跑，既可以在 server 跑，也可以在 client 跑。
    - 而 src/lib/server 目录里的东西（例如 db.ts、redis.db.ts、notes.server.ts）是“只要你 import 了就默认只能在 server 环境
      用”的模块，它们会用到 DB、环境变量甚至 Node/Edge 特性。
  - lib/server 是“标记 server-only”的约定目录
    - 项目里约定：
      - “必然只在服务端用、而且依赖服务端能力”的模块 → 放 lib/server。
      - 纯工具/领域逻辑，不依赖特定环境 → 放 lib 根目录。
    - 如果把 douban-mine.ts 放进 lib/server，其实是在给后来的人一个错误暗示：
      - “这里面可以随便用 DB / process.env / Node API”；
      - “这是 server-only，不要在 client 用”。
    - 但它恰恰是 完全可以在 client 复用 的解析逻辑（比如未来做“用户上传豆瓣导出的 HTML，本地解析预览”这种功能），所以放根目
      录更符合它的角色。
  - 当前只在 API 用，是实现细节，不是分层依据
    - 现在是：API route 负责：
      - 拿 Cookie、拼 URL、fetch 豆瓣；
      - 然后把 HTML 丢给 parseDoubanMineHtml 做解析。
    - 从分层上看：
      - API route = “接口/边界层”（和 HTTP、凭证、超时处理耦合）；
      - douban-mine.ts = “领域逻辑层”（只关心“给我一坨豆瓣 HTML，我帮你拆成结构化数据”）。
    - 分层的原则是：领域逻辑尽量和入口层解耦，因此这类纯解析函数更适合放 lib 根目录，而不是和 API 一起被打上 server-only 的
      标签。
  - Next/Edge 的实际行为也支持这种放法
    - Next App Router/Edge 并不会因为放在 lib/server 就自动变成“只能在服务端 import”，目录名只是团队约定。
    - 真正决定是 server/client 的，是：
      - 是否写了 'use client' / 'use server'；
      - 模块里是否直接使用 Node/浏览器特有 API；
      - 被谁 import（client component / server component / API route）。
    - 对像 douban-mine.ts 这种“无环境依赖”的模块，放 lib 根目录可以在任何一端安全复用，不会平白增加约束。

  总结一下你这个具体问题的答案：

  - douban-mine.ts 虽然现在 只被 API 使用，但它本质是一个 纯解析工具，不依赖 server 能力，也有潜在在浏览器复用的价值。
  - 团队约定是：只有“必然 server-only、且依赖服务端能力”的模块才放 lib/server；纯工具/领域逻辑统一放在 lib 根。
  - 所以它留在 src/lib 根目录，是为了表达“这里是可以前后端共享的业务工具”，而不是单纯按“目前谁在用”来分类。
