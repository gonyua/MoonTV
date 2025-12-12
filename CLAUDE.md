# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

MoonTV 是一个基于 Next.js 14 (App Router) 的影视聚合播放器应用，支持多资源搜索、在线播放、收藏同步、播放记录等功能。项目使用 TypeScript + Tailwind CSS 构建，支持 Docker、Vercel 和 Cloudflare Pages 部署。

## 常用命令

### 开发与构建

```bash
# 开发环境 (会自动运行 gen:runtime 和 gen:manifest)
pnpm dev

# 生产构建 (会自动运行 gen:runtime 和 gen:manifest)
pnpm build

# 启动生产服务器
pnpm start

# Cloudflare Pages 构建
pnpm pages:build
```

### 代码质量

```bash
# Lint 检查
pnpm lint

# Lint 并自动修复
pnpm lint:fix

# 严格 Lint (不允许任何警告)
pnpm lint:strict

# 类型检查
pnpm typecheck

# 格式化代码
pnpm format

# 检查格式
pnpm format:check
```

### 测试

```bash
# 运行测试
pnpm test

# 监听模式运行测试
pnpm test:watch
```

### 配置生成脚本

```bash
# 将 config.json 转换为 TypeScript runtime.ts
pnpm gen:runtime

# 生成 PWA manifest
pnpm gen:manifest

# 生成版本信息
pnpm gen:version
```

## 核心架构

### 1. 配置系统

项目使用双层配置机制：

- **静态配置** (`config.json`): 定义视频资源站点 API、缓存时间、自定义分类
- **动态配置** (数据库): 管理员可在运行时通过 `/admin` 页面修改站点配置、用户权限、源启用/禁用等
- **构建时转换**: `scripts/convert-config.js` 将 `config.json` 转换为 `src/lib/runtime.ts`，供编译时使用

配置加载优先级：

1. Docker 环境：运行时读取 `config.json`
2. 数据库存储模式 (redis/d1/upstash): 从数据库读取并与文件配置合并
3. localStorage 模式: 仅使用编译时生成的配置

关键文件：

- `config.json`: 源配置文件
- `src/lib/config.ts`: 配置加载逻辑 (合并文件配置与数据库配置)
- `src/lib/runtime.ts`: 自动生成，不要手动修改

### 2. 存储抽象层

项目支持 4 种存储方式，通过 `IStorage` 接口统一抽象：

- **localstorage**: 浏览器本地存储 (单用户)
- **redis**: 原生 Redis (Docker 部署)
- **d1**: Cloudflare D1 数据库
- **upstash**: Upstash Redis (无服务器)

实现文件：

- `src/lib/db.ts`: 存储工厂，根据 `NEXT_PUBLIC_STORAGE_TYPE` 环境变量返回对应实现
- `src/lib/redis.db.ts`: Redis 实现
- `src/lib/d1.db.ts`: Cloudflare D1 实现
- `src/lib/upstash.db.ts`: Upstash Redis 实现
- `src/lib/db.client.ts`: 客户端数据访问层，实现混合缓存策略

### 3. 混合缓存策略 (HybridCacheManager)

位于 `src/lib/db.client.ts`，用于数据库存储模式下优化用户体验：

- **读取**: 优先返回缓存数据 (即时响应)，后台异步同步最新数据
- **写入**: 乐观更新 (立即更新缓存 + 触发事件)，后台异步同步到数据库
- **缓存过期**: 1 小时自动过期，支持手动刷新
- **用户隔离**: 每个用户的缓存数据独立存储

支持的数据类型：

- 播放记录 (playRecords)
- 收藏 (favorites)
- 搜索历史 (searchHistory)
- 跳过片头片尾配置 (skipConfigs)

### 4. API 路由架构

使用 Next.js App Router 的 Route Handlers (边缘运行时):

```
src/app/api/
├── search/          # 搜索聚合多个资源站
├── detail/          # 获取视频详情
├── playrecords/     # 播放记录 CRUD
├── favorites/       # 收藏 CRUD
├── searchhistory/   # 搜索历史管理
├── skipconfigs/     # 跳过片头片尾配置
├── douban/          # 豆瓣数据代理
├── image-proxy/     # 图片代理
├── login/           # 用户登录
├── register/        # 用户注册
├── logout/          # 用户登出
├── change-password/ # 修改密码
├── admin/           # 管理员配置 CRUD
├── server-config/   # 服务器配置 (公开)
└── cron/            # 定时任务 (Vercel Cron)
```

关键特性：

- 所有 API 使用 `export const runtime = 'edge'` 启用边缘运行时
- 搜索使用 `src/lib/downstream.ts` 并行请求多个资源站点
- 支持缓存控制 (Cache-Control, CDN-Cache-Control)
- 自动 401 重定向到登录页面 (在 `db.client.ts` 的 `fetchWithAuth` 中实现)

### 5. 认证系统

- **基于 Cookie**: 使用 `moontv_auth` cookie 存储用户认证信息
- **密码哈希**: 使用 Node.js 原生 `crypto.pbkdf2` 加密存储
- **权限角色**: owner (站长) > admin (管理员) > user (普通用户)
- **中间件保护**: 通过 `src/lib/auth.ts` 提供认证辅助函数

关键函数：

- `getAuthInfoFromRequest(req)`: 服务端从请求解析认证信息
- `getAuthInfoFromBrowserCookie()`: 客户端从 Cookie 解析认证信息
- `hashPassword(password, salt)`: 密码哈希
- `checkAuth()`: 检查用户是否已登录

### 6. 视频播放器集成

- **ArtPlayer**: 主要播放器 (支持自定义插件)
- **HLS.js**: HLS 流媒体支持
- **跳过片头片尾**: 基于用户配置自动跳过指定时间段
- **播放记录保存**: 自动保存播放进度、集数

播放页面：`src/app/play/page.tsx`
集数选择器：`src/components/EpisodeSelector.tsx`

### 7. 豆瓣数据聚合

- **分类导航**: 通过豆瓣 API 获取电影/电视剧分类 (热门、经典、华语等)
- **自定义分类**: 支持在 `config.json` 中配置 `custom_category`
- **客户端实现**: `src/lib/douban.client.ts`
- **API 代理**: `src/app/api/douban/route.ts`

分类页面：

- 电影分类: `/douban?type=movie`
- 电视剧分类: `/douban?type=tv`

### 8. 黄色内容过滤

- **关键词过滤**: `src/lib/yellow.ts` 定义敏感词列表
- **类型名称检查**: 在搜索结果中过滤包含敏感词的内容
- **可配置**: 通过环境变量 `NEXT_PUBLIC_DISABLE_YELLOW_FILTER=a,b,c` 配置可查看黄色内容的用户名（逗号分隔）

### 9. PWA 支持

- **next-pwa**: 自动生成 Service Worker 和 manifest
- **离线缓存**: 支持离线访问和安装到桌面/主屏
- **manifest 生成**: `scripts/generate-manifest.js` 从环境变量生成

### 10. 响应式布局

- **桌面端**: 侧边栏导航 (`src/components/Sidebar.tsx`)
- **移动端**: 底部导航栏 (`src/components/MobileBottomNav.tsx`) + 顶部标题栏 (`src/components/MobileHeader.tsx`)
- **统一布局**: `src/components/PageLayout.tsx`

## 环境变量

关键环境变量 (详见 README.md)：

```bash
# 必需
PASSWORD=管理员密码
USERNAME=管理员用户名 (非 localstorage 模式)

# 存储配置
NEXT_PUBLIC_STORAGE_TYPE=localstorage|redis|d1|upstash
REDIS_URL=redis://host:port
UPSTASH_URL=https://...
UPSTASH_TOKEN=...

# 站点配置
SITE_NAME=MoonTV
ANNOUNCEMENT=站点公告
NEXT_PUBLIC_ENABLE_REGISTER=false
NEXT_PUBLIC_SEARCH_MAX_PAGE=5
NEXT_PUBLIC_IMAGE_PROXY=图片代理前缀
NEXT_PUBLIC_DOUBAN_PROXY=豆瓣代理前缀
NEXT_PUBLIC_DISABLE_YELLOW_FILTER=用户名1,用户名2

# 部署配置
DOCKER_ENV=true (Docker 环境标识)
```

## 重要约定

### 添加新的视频资源站

1. 编辑 `config.json`，在 `api_site` 中添加新站点
2. 确保 API 遵循苹果 CMS V10 标准格式
3. 如果站点需要特殊的详情页爬取，添加 `detail` 字段

### 添加新的自定义分类

编辑 `config.json`，在 `custom_category` 数组中添加：

```json
{
  "name": "显示名称",
  "type": "movie", // 或 "tv"
  "query": "豆瓣搜索关键词"
}
```

### 数据库表结构

当使用 redis/d1/upstash 存储时：

**Redis Key 格式**:

- 用户: `user:{username}`
- 播放记录: `play_record:{username}:{source+id}`
- 收藏: `favorite:{username}:{source+id}`
- 搜索历史: `search_history:{username}`
- 跳过配置: `skip_config:{username}:{source+id}`
- 管理员配置: `admin_config`

**D1 表结构** (见 `D1初始化.md`):

- `users`: 用户表
- `play_records`: 播放记录表
- `favorites`: 收藏表
- `search_history`: 搜索历史表
- `skip_configs`: 跳过配置表
- `admin_config`: 管理员配置表

### 事件系统

客户端使用 `CustomEvent` 进行数据更新通知：

```typescript
// 监听数据更新
window.addEventListener('playRecordsUpdated', (e) => {
  console.log(e.detail); // 新数据
});

// 支持的事件
('playRecordsUpdated');
('favoritesUpdated');
('searchHistoryUpdated');
('skipConfigsUpdated');
('globalError'); // 全局错误提示
```

使用 `subscribeToDataUpdates()` 辅助函数可简化监听逻辑。

### 全局错误处理

在 `src/lib/db.client.ts` 中实现：

- 所有数据库操作失败自动触发 `globalError` 事件
- `src/components/GlobalErrorIndicator.tsx` 显示错误提示

### 类型安全

- 所有数据结构定义在 `src/lib/types.ts`
- API 响应使用泛型 `fetchFromApi<T>(path)` 确保类型安全
- 运行 `pnpm typecheck` 检查类型错误

## 部署注意事项

### Docker 部署

- 设置 `DOCKER_ENV=true` 启用运行时配置加载
- 挂载 `config.json` 可动态修改配置无需重新构建

### Vercel 部署

- 支持 Upstash Redis 存储
- 使用 `pnpm build` 构建

### Cloudflare Pages 部署

- 使用 `pnpm pages:build` 构建
- 支持 D1 数据库绑定 (变量名: `DB`)
- 设置兼容性标志: `nodejs_compat`
- 环境变量使用密钥而非文本

## 故障排查

### 常见问题

1. **"Module not found: Can't resolve 'fs'"**

   - 确保不在客户端组件中导入 Node.js 内置模块
   - 使用 `'use client'` 指令的文件不能导入 `fs`, `path` 等

2. **配置修改未生效**

   - 非 Docker 环境: 修改 `config.json` 后需要运行 `pnpm gen:runtime && pnpm build`
   - Docker 环境: 直接修改 `config.json` 重启容器即可

3. **数据库连接失败**

   - 检查环境变量配置 (`REDIS_URL`, `UPSTASH_URL` 等)
   - 查看控制台错误日志

4. **401 自动跳转循环**
   - 检查 Cookie 是否正确设置
   - 清除浏览器 Cookie 重新登录

## 相关文档

- Next.js 14 App Router: https://nextjs.org/docs/app
- ArtPlayer 播放器: https://artplayer.org/
- 苹果 CMS V10 API: https://help.maccms.pro/
