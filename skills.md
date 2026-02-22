# Skills.md — 类推特私密日志/消息平台

> 平台定位：可扩展用户数的小型消息发布平台，仅限受邀好友之间关注与分享，不对搜索引擎开放（类似私密 Twitter/Mastodon）。

---

## 一、产品与架构规划

### 1.1 核心功能边界
- 用户注册（仅限邀请码或管理员审批）
- 发布消息（文字 / 图片 / 链接，字符上限可配置）
- 关注 / 取关（单向关注，类 Twitter）
- 时间线（Following Feed）
- 点赞、评论、转发（可选，根据规模裁剪）
- 私信（可选）
- 通知系统

### 1.2 "有限制分享"的技术保障
| 目标 | 实现手段 |
|------|---------|
| 不被搜索引擎收录 | 全站需登录才可访问；HTTP 头 `X-Robots-Tag: noindex, nofollow`；`robots.txt` 禁止所有爬虫 |
| 内容不外泄 | 所有 API 需 JWT/Session 鉴权；无公开分享链接（或链接带签名且有效期短） |
| 注册管控 | 邀请码制 / 管理员审批制；关闭公开注册接口 |

---

## 二、技术栈选择

### 2.1 推荐技术栈（中小规模，<10万用户）

```
前端：Next.js (React) + Tailwind CSS
后端：Node.js (Fastify / Express) 或 Python (FastAPI)
数据库：PostgreSQL（关系数据） + Redis（缓存 / Feed / Session）
对象存储：MinIO（自托管）或 S3（云端）
消息队列：BullMQ (Redis) 或 RabbitMQ（通知、异步任务）
部署：Docker + Docker Compose → Kubernetes（按需扩展）
反向代理：Nginx / Caddy（自动 HTTPS）
```

### 2.2 可替代方案
- 全栈一体：**Remix** 或 **SvelteKit**（减少前后端分离复杂度）
- 后端优先：**Ruby on Rails** / **Laravel**（快速原型）
- 数据库：**PlanetScale**（MySQL 兼容，自动分片）

---

## 三、核心技术 Skills

### 3.1 后端开发

#### 用户系统
- JWT / OAuth2 鉴权（access token + refresh token）
- 密码哈希（bcrypt / argon2）
- 邀请码生成与校验逻辑
- 基于角色的权限控制（RBAC）：普通用户 / 管理员

#### 关注关系
- 有向图数据模型（`follows` 表：`follower_id`, `followee_id`）
- 关注数 / 粉丝数的计数缓存（Redis `INCR`）

#### Feed 系统（核心难点）
- **Push 模式（Fanout on Write）**：用户发帖时推送到所有粉丝的 Feed 列表（Redis List / Sorted Set），适合粉丝数少的场景
- **Pull 模式（Fanout on Read）**：读取时聚合关注者帖子，适合大 V 高粉丝场景
- **混合模式**：粉丝数超阈值（如 1000）切换为 Pull，其余用 Push
- 分页：基于游标（cursor-based pagination）而非 offset，避免深翻页性能问题

#### 消息存储
- `posts` 表核心字段：`id (UUID)`, `user_id`, `content`, `media_urls[]`, `reply_to_id`, `repost_of_id`, `created_at`
- 软删除（`deleted_at`）

#### 媒体处理
- 上传流程：客户端 → 后端签名 → 直传 S3/MinIO
- 图片压缩与缩略图生成（Sharp / ImageMagick）
- 视频转码（FFmpeg，可选）

### 3.2 前端开发

#### 核心页面
- 登录 / 注册（邀请码输入）
- 首页时间线（无限滚动 / 分页）
- 用户主页（帖子列表 + 关注关系）
- 发帖编辑器（字符计数、图片预览、@提及）
- 通知页
- 设置页（账户、隐私、邀请码管理）

#### 关键 UI 技术
- 乐观更新（Optimistic UI）：点赞 / 关注立即响应，后端确认后校正
- 实时通知：WebSocket 或 Server-Sent Events（SSE）
- 虚拟列表（react-virtual / tanstack-virtual）：长 Feed 性能优化

### 3.3 数据库设计 Skills

```sql
-- 核心表结构示意
users         (id, username, email, password_hash, bio, avatar_url, created_at)
posts         (id, user_id, content, media_urls, reply_to_id, repost_of_id, created_at, deleted_at)
follows       (follower_id, followee_id, created_at)
likes         (user_id, post_id, created_at)
notifications (id, user_id, type, actor_id, post_id, read, created_at)
invite_codes  (code, created_by, used_by, used_at, expires_at)
```

关键索引：
- `posts(user_id, created_at DESC)` — 用户主页
- `follows(follower_id)`, `follows(followee_id)` — 关注关系查询
- `notifications(user_id, read, created_at DESC)` — 通知列表

### 3.4 缓存策略

| 数据 | 缓存方式 | TTL |
|------|---------|-----|
| 用户 Session | Redis String | 7天（滑动） |
| Feed 列表 | Redis Sorted Set（score=timestamp） | 3天 |
| 关注数/粉丝数 | Redis Hash | 永久（写时更新） |
| 热门帖子内容 | Redis String | 1小时 |

### 3.5 扩展性设计

#### 水平扩展路径
```
阶段1（<1000用户）：单机 Docker Compose
阶段2（<5万用户） ：读写分离 PostgreSQL + Redis Cluster
阶段3（<50万用户）：数据库分片（按 user_id）+ CDN 静态资源 + Kubernetes
```

#### 关键扩展技术
- 数据库连接池（PgBouncer）
- 异步任务队列（邮件通知、Feed 推送不阻塞主流程）
- 限流（Rate Limiting）：基于用户 ID 的 API 调用频率限制（Redis + Token Bucket）

---

## 四、安全 Skills

- **HTTPS 强制**（HSTS）
- **CSRF 防护**（SameSite Cookie + CSRF Token）
- **SQL 注入防护**（参数化查询 / ORM）
- **XSS 防护**（内容转义，CSP 头）
- **上传文件校验**（MIME 类型、文件大小、病毒扫描）
- **私密路由保护**：所有页面 SSR 时服务端验证 Session，防止未登录直接访问
- **robots.txt**：

```
User-agent: *
Disallow: /
```

- **元标签**（每个 HTML 页面）：

```html
<meta name="robots" content="noindex, nofollow, noarchive">
```

---

## 五、运维与部署 Skills

- **容器化**：Docker + docker-compose（开发）/ Kubernetes（生产）
- **CI/CD**：GitHub Actions / GitLab CI
- **监控**：Prometheus + Grafana（指标）；Sentry（错误追踪）
- **日志**：ELK Stack 或 Loki + Grafana
- **备份**：PostgreSQL 定时 dump + 异地存储
- **自托管域名**：内网域名或私有 VPS，避免使用公共 SaaS 平台

---

## 六、可选高级功能（按需添加）

| 功能 | 所需技术 |
|------|---------|
| 全文搜索帖子 | PostgreSQL `tsvector` / Elasticsearch |
| 话题标签（Hashtag） | 正则解析 + `hashtags` 表 |
| @提及通知 | 发帖时解析 `@username`，写入通知表 |
| 私信 | WebSocket + 消息加密（可选 E2E） |
| 多语言 | i18n（next-intl / react-i18next） |
| 暗黑模式 | Tailwind `dark:` 前缀 |
| PWA 支持 | Service Worker + Web App Manifest |
| 移动端 App | React Native / Expo（复用业务逻辑） |

---

## 七、最小可行产品（MVP）Checklist

- [ ] 邀请码注册 + 登录
- [ ] 发帖（文字，240字限制）
- [ ] 关注 / 取关
- [ ] 时间线（Following Feed）
- [ ] 用户主页
- [ ] 点赞
- [ ] 全站登录墙（未登录不可见任何内容）
- [ ] robots.txt + noindex 头
- [ ] 基础管理后台（用户管理、邀请码生成）

---

*生成时间：2026-02-21*
