# CLAUDE.md

本文档为 Claude Code（claude.ai/code）在本代码仓库中工作的指导说明。

## 常用开发命令

### 包管理
- 使用 `pnpm` 作为包管理器
- 安装依赖：`pnpm install --frozen-lockfile`

### 开发与构建命令
- 启动开发服务器：`pnpm dev`（包含运行时配置生成和 manifest 生成）
- 构建生产版本：`pnpm build`
- 启动生产服务器：`pnpm start`
- 构建用于 Cloudflare Pages 的版本：`pnpm pages:build`

### 代码质量与测试
- 代码检查：`pnpm lint`
- 修复代码问题：`pnpm lint:fix`
- 严格代码检查（无警告）：`pnpm lint:strict`
- 类型检查：`pnpm typecheck`
- 运行测试：`pnpm test`
- 测试监听模式：`pnpm test:watch`
- 格式化代码：`pnpm format`
- 检查格式化：`pnpm format:check`

### 配置生成
- 生成运行时配置：`pnpm gen:runtime`
- 生成 PWA manifest：`pnpm gen:manifest`

## 项目架构

### 核心技术栈
- **框架**：Next.js 14（使用 App Router）
- **样式**：Tailwind CSS 3（支持自定义动画与暗黑模式）
- **语言**：TypeScript 4
- **视频播放器**：ArtPlayer + HLS.js（用于流媒体视频播放）
- **PWA**：通过 next-pwa 实现渐进式 Web 应用功能

### 主要目录结构
- `src/app/` - Next.js App Router 页面与 API 路由
- `api/` - 搜索、认证、后台管理、数据管理等 API 接口
-  各页面组件（登录、搜索、播放、豆瓣、后台）
- `src/components/` - 可复用的 React 组件（UI 元素、布局组件）
- `src/lib/` - 核心业务逻辑、数据库接口与工具函数
- `src/styles/` - 全局 CSS 与主题定义
- `public/` - 静态资源（图标、图片、PWA manifest）
- `scripts/` - 构建时配置脚本

### 存储架构
应用支持多种存储后端：

1. **LocalStorage**（默认）：基于浏览器的用户本地存储
2. **Redis**：多用户支持，含用户认证与跨设备同步
3. **Cloudflare D1**：适用于部署到 Cloudflare Pages 的 SQL 数据库

存储接口通过 `src/lib/types.ts` 中的 `IStorage` 接口抽象，具体实现如下：
- `src/lib/redis.db.ts` - Redis 实现
- `src/lib/d1.db.ts` - Cloudflare D1 实现

### 配置系统
- **静态配置**：`config.json` 包含视频源 API 与缓存设置
- **运行时配置**：构建时通过 `scripts/convert-config.js` 生成
- **后台配置**：动态配置存储于数据库中（Redis/D1 部署）
- **环境变量**：控制部署行为与功能开关

### 视频源集成
- 支持标准 Apple CMS V10 API 格式
- 多个视频源 API 可在 `config.json` 中配置
- 支持后台启用/禁用视频源
- 自动故障转移与聚合搜索功能

### 用户认证与管理
- 基于密码的多用户认证机制
- 基于角色的权限控制（owner/admin/user）
- 可通过环境变量控制是否允许用户注册
- 搜索历史、播放记录与收藏记录均为用户私有

### 视频播放系统
- 使用 hls.js 支持 HLS 流媒体播放
- 集成 ArtPlayer 提供丰富的播放控制
- 支持播放进度追踪与断点续播
- 支持电视剧分集播放管理

## 关键配置文件

### 环境变量（依部署环境而定）
- `USERNAME`/`PASSWORD` - 多用户部署下的管理员账号
- `NEXT_PUBLIC_STORAGE_TYPE` - 存储后端类型（localstorage/redis/d1）
- `REDIS_URL` - Redis 连接地址
- `NEXT_PUBLIC_ENABLE_REGISTER` - 是否允许用户注册
- `SITE_NAME`/`ANNOUNCEMENT` - 站点名称与公告内容

### 构建配置
- `next.config.js` - Next.js 配置，包括 PWA、图片优化、SVG 支持等
- `tailwind.config.ts` - Tailwind CSS 自定义主题扩展配置
- `jest.config.js` - 与 Next.js 集成的 Jest 测试配置

### 数据库结构
- 如部署到 D1，请参考 `D1初始化.md` 获取完整数据结构说明
- 表结构：users, play_records, favorites, search_history, admin_config
- 已优化索引以提升查询性能

## 开发说明

### 代码组织模式
- API 路由遵循 RESTful 规范，位于 `src/app/api/`
- 所有组件为基于函数的 React + TypeScript 实现
- 数据库操作通过统一的存储接口封装
- 所有配置集中管理，并根据环境区分

### 样式设计方法
- 使用 Tailwind CSS，支持自定义配色与动画
- 支持暗黑模式（基于 next-themes 实现）
- 移动优先响应式设计
- 自定义动画用于加载状态与过渡效果

### 状态管理
- 使用 React Context 管理全局状态（主题、站点配置等）
- 使用本地组件状态处理 UI 交互
- 服务端获取视频源与用户数据

### 错误处理
- API 路由返回结构化的 JSON 响应
- 客户端通过 React 错误边界捕获异常
- 数据库操作失败时提供降级处理