# Repository Guidelines

## 项目结构与模块组织

- 前端基于 Next.js 14 App Router，页面入口位于 `src/app`（如 `page.tsx`、`admin`、`login`、`play`、`search`、`douban` 等）并由 `layout.tsx` 与 `src/app/globals.css` 挂载全局样式。
- 通用组件存放在 `src/components`，业务工具与数据处理在 `src/lib`，样式扩展在 `src/styles`。公共静态资源位于 `public`（logo、截图、manifest），部署/转换脚本在 `scripts`，可调参数在仓库根目录的 `config.json`。

## 构建、测试与开发命令

- `pnpm dev` 本地开发，自动运行配置转换脚本并监听 0.0.0.0。
- `pnpm build` 生成生产包（含 `gen:runtime`、`gen:manifest`），`pnpm start` 运行已构建产物。
- `pnpm pages:build` Cloudflare Pages 专用构建；Docker 场景可直接使用 `Dockerfile` 或 README 中的镜像命令。
- 质量工具：`pnpm lint` / `lint:strict`（ESLint + Next 规则）、`pnpm typecheck`（tsc）、`pnpm format` 与 `format:check`（Prettier）。
- 测试：`pnpm test` / `test:watch`（Jest + @testing-library），必要时结合 `jest.setup.js` 里的全局配置。

## 代码风格与命名规范

- 使用 TypeScript + 函数组件，props、API 响应需显式类型；避免 any。导入按 eslint-plugin-simple-import-sort 排序，未用导入会被 eslint-plugin-unused-imports 移除。
- Prettier 为唯一格式来源（默认 2 空格缩进、单引号、尾随逗号）；Tailwind 类名按语义组合，定制样式放入 `src/styles`。
- 组件与 Hook 采用 PascalCase/`useXxx`，工具函数与变量用 camelCase，Next 路由目录保持小写。

## 测试指南

- 覆盖核心交互（搜索、播放、登录/鉴权、收藏/进度同步）与 `src/lib` 里的数据处理，新增组件建议附带 `*.test.tsx` 或在同级 `__tests__` 目录。
- UI 交互使用 @testing-library 的屏幕查询方式，避免依赖实现细节；网络/存储访问需通过模拟或测试桩，减少对真实 Redis/D1 的耦合。
- 在提交前至少运行 `pnpm test` 与 `pnpm lint:strict`，若新增接口或存储类型请补充断言和错误分支。

## 提交与 Pull Request

- 本仓库启用 commitlint，遵循 Conventional Commits，例如 `feat: 新增播放倍速`, `fix(search): 处理空关键词崩溃`, `chore: bump deps`。保持主题句祈使语气，必要时添加 scope。
- PR 需包含变更摘要、测试执行情况（命令与结果简述），UI 变动请附对比截图或录屏；若修复 Issue 请在描述中关联编号。确保与 README/`config.json` 的使用说明同步更新。

## 安全与配置提示

- 环境变量放入 `.env.local`（例如 `PASSWORD`、`USERNAME`、`NEXT_PUBLIC_STORAGE_TYPE`、`REDIS_URL`、`UPSTASH_TOKEN`、Cloudflare D1 绑定名等），严禁提交敏感值。
- 修改 `config.json` 后可执行 `pnpm gen:runtime` 以同步生产配置；部署到 Vercel/Cloudflare 时仅暴露必要的 NEXT_PUBLIC 前缀变量。
- 若使用 Docker/Compose，确保监听端口与存储卷权限正确；公共部署应更换默认口令并开启 HTTPS/反向代理限流。\*\*\*

## Cloudflare Pages 部署注意事项

- Edge Runtime 必须显式声明：非静态 App 路由需导出 `export const runtime = 'edge';`。笔记页（`src/app/notes/page.tsx`、`src/app/notes/new/page.tsx`、`src/app/notes/[id]/page.tsx`）依赖 Edge，遗漏会导致 next-on-pages 报 “route not configured for edge” 并中止构建。
- ESM 组件用动态导入：Node16/CJS 语义下静态导入 ESM 包（如 `react-markdown`、`remark-gfm`）会触发 “CJS import ESM” 报错。前端 Markdown 已改用 `import()`。新增类似包时保持客户端组件 + 动态导入。
- D1 配置必需：绑定名 `DB`，部署时设置 `NEXT_PUBLIC_STORAGE_TYPE=d1`（或 runtime config 同值）才能写入 D1；未绑定会回退 localStorage 或报 DB 缺失。
- 本地调试 D1：用 `wrangler pages dev . --d1=DB=<数据库名>` 注入绑定，否则默认 localStorage。
