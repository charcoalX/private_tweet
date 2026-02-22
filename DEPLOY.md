# private_tweet 部署文档

本文档记录 private_tweet 的生产环境部署流程，基于 Docker Compose + Nginx 单机部署方案。

---

## 目录

1. [项目结构说明](#1-项目结构说明)
2. [本地测试生产环境](#2-本地测试生产环境)
3. [部署到 DigitalOcean](#3-部署到-digitalocean)
4. [环境变量说明](#4-环境变量说明)
5. [日常运维命令](#5-日常运维命令)
6. [验证部署成功](#6-验证部署成功)
7. [常见问题](#7-常见问题)

---

## 1. 项目结构说明

```
private_tweet/
├── apps/
│   ├── api/            # Fastify 后端（端口 3001，仅内网）
│   │   └── Dockerfile
│   └── web/            # Next.js 前端（端口 3000，仅内网）
│       └── Dockerfile
├── nginx/
│   └── nginx.conf      # 反向代理配置（唯一对外暴露的服务，端口 80）
├── docker-compose.prod.yml   # 生产 Compose 配置（6 个服务）
├── deploy.sh           # 一键部署脚本
├── .env.production.example   # 环境变量模板（需复制并填写）
└── .env.production     # 实际密钥（不提交到 Git）
```

**服务依赖启动顺序**（由 `depends_on + condition: service_healthy` 保证）：

```
postgres ─┐
redis    ─┼─→ api ─→ web ─→ nginx（对外 :80）
minio    ─┘
```

---

## 2. 本地测试生产环境

在本地验证生产镜像是否能正常运行，使用独立的项目名 `pt_prod` 避免与开发环境冲突。

### 第一步：准备环境变量文件

```bash
cp .env.production.example .env.production
```

编辑 `.env.production`，填写测试用密码（本地测试可以简单一些，但不能留 `CHANGE_ME`）：

```env
POSTGRES_USER=tweet
POSTGRES_PASSWORD=local_test_pw_123
POSTGRES_DB=private_tweet_prod

REDIS_PASSWORD=local_redis_pw_123

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123456

JWT_SECRET=a8f3b2c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1

JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

WEB_URL=http://localhost
```

> `JWT_SECRET` 可用 `openssl rand -hex 32` 生成真实随机值。

### 第二步：构建镜像

首次构建需要几分钟（下载 node:20-alpine 基础镜像、安装依赖、编译 TypeScript）：

```bash
docker compose -p pt_prod -f docker-compose.prod.yml --env-file .env.production build
```

### 第三步：启动所有服务

```bash
docker compose -p pt_prod -f docker-compose.prod.yml --env-file .env.production up -d
```

等待约 30 秒让所有健康检查通过。

### 第四步：执行数据库迁移

**首次启动必须执行**，建表之后每次部署 `deploy.sh` 会自动处理：

```bash
docker compose -p pt_prod -f docker-compose.prod.yml --env-file .env.production run --rm \
  -e DATABASE_URL="postgresql://tweet:local_test_pw_123@postgres:5432/private_tweet_prod" \
  api \
  sh -c "node /app/apps/api/node_modules/.bin/prisma migrate deploy --schema /app/apps/api/prisma/schema.prisma"
```

### 第五步：验证

```bash
# 查看所有服务状态
docker compose -p pt_prod -f docker-compose.prod.yml --env-file .env.production ps

# 验证 API
curl http://localhost/api/health
# 期望返回：{"status":"ok"}

# 浏览器访问 http://localhost → 应被重定向到 /login
```

### 清理本地测试环境

```bash
# 仅停止，保留数据卷
docker compose -p pt_prod -f docker-compose.prod.yml --env-file .env.production down

# 停止并删除所有数据（彻底清空）
docker compose -p pt_prod -f docker-compose.prod.yml --env-file .env.production down -v
```

---

## 3. 部署到 DigitalOcean

### 3.1 购买服务器（Droplet）

1. 登录 [DigitalOcean](https://cloud.digitalocean.com)
2. 创建 Droplet：
   - **镜像**：Ubuntu 24.04 LTS x64
   - **配置**：最低 Basic / 2 vCPU / 4GB RAM（首次运行 Docker build 需要内存，之后 2GB 也够）
   - **区域**：选离你用户最近的机房（亚洲用户推荐 Singapore 或 San Francisco）
   - **SSH Key**：上传你本机的公钥（`~/.ssh/id_rsa.pub`），避免密码登录
3. 记下服务器的 **Public IP**，例如 `143.198.x.x`

### 3.2 SSH 连接服务器

```bash
ssh root@143.198.x.x
```

首次连接会提示 fingerprint 确认，输入 `yes`。

### 3.3 安装 Docker

```bash
# 更新包列表
apt update && apt upgrade -y

# 安装 Docker（官方脚本，自动识别 Ubuntu 版本）
curl -fsSL https://get.docker.com | sh

# 验证安装（确认版本 >= 24，且 compose 是 v2 plugin）
docker version
docker compose version
```

> **重要**：确认输出中有 `Docker Compose version v2.x.x`（不是旧的 `docker-compose` v1）。

### 3.4 克隆代码

服务器上需要先安装 Git（Ubuntu 通常已预装）：

```bash
git --version   # 确认已安装

# 克隆你的仓库（替换为实际 URL）
git clone https://github.com/你的用户名/private_tweet.git
cd private_tweet
```

如果仓库是私有的，需要先配置 SSH Key 或 GitHub Personal Access Token：

```bash
# 方法一：生成服务器 SSH Key 并添加到 GitHub Deploy Keys
ssh-keygen -t ed25519 -C "deploy@server" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub   # 复制输出，粘贴到 GitHub → 仓库 → Settings → Deploy Keys

# 方法二：使用 HTTPS + Token（临时方便）
git clone https://你的token@github.com/你的用户名/private_tweet.git
```

### 3.5 配置环境变量

在服务器上生成真实的密钥：

```bash
cd private_tweet
cp .env.production.example .env.production

# 生成 JWT_SECRET（复制输出）
openssl rand -hex 32
```

编辑环境变量文件：

```bash
nano .env.production
```

填写所有 `CHANGE_ME` 项（详细说明见[第 4 节](#4-环境变量说明)）：

```env
POSTGRES_USER=tweet
POSTGRES_PASSWORD=<强密码，建议 20 位以上随机字符>
POSTGRES_DB=private_tweet

REDIS_PASSWORD=<强密码>

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=<强密码>

JWT_SECRET=<openssl rand -hex 32 的输出>

JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

WEB_URL=http://143.198.x.x   # 替换为你的服务器 IP 或域名
```

按 `Ctrl+X` → `Y` → `Enter` 保存。

**验证没有遗漏**：

```bash
grep CHANGE_ME .env.production   # 应无任何输出
```

### 3.6 执行一键部署

```bash
chmod +x deploy.sh
./deploy.sh
```

脚本会依次完成：
1. 检查 Docker 和 Compose 是否安装
2. 验证 `.env.production` 中没有未填写的占位符
3. `git pull` 拉取最新代码
4. `docker compose build` 构建 api 和 web 镜像（**首次约 5~10 分钟**）
5. 启动 postgres、redis、minio 并等待健康检查通过
6. 在 api 容器内执行 `prisma migrate deploy`（建表 / 跑增量迁移）
7. 启动全部 6 个服务
8. 轮询 `http://localhost/api/health` 直到 nginx 就绪

完成后输出：

```
✅ Deployment complete!

   Application : http://143.198.x.x
   API health  : http://143.198.x.x/api/health
```

### 3.7 后续更新代码

每次推送新代码后，在服务器上执行：

```bash
cd private_tweet
./deploy.sh
```

脚本自动 `git pull`、重新 build 有变化的镜像、滚动重启，数据卷不受影响。

---

## 4. 环境变量说明

所有变量在 `.env.production` 中配置，由 `docker-compose.prod.yml` 通过 `--env-file` 注入。

| 变量名 | 示例值 | 说明 |
|--------|--------|------|
| `POSTGRES_USER` | `tweet` | PostgreSQL 数据库用户名，保持默认即可 |
| `POSTGRES_PASSWORD` | *(强密码)* | PostgreSQL 密码，**必须修改**，建议 24 位以上随机字符 |
| `POSTGRES_DB` | `private_tweet` | 数据库名，保持默认即可 |
| `REDIS_PASSWORD` | *(强密码)* | Redis 认证密码，**必须修改**，Nginx 限速和 feed 缓存都依赖此连接 |
| `MINIO_ROOT_USER` | `minioadmin` | MinIO 管理员账号，可保持默认 |
| `MINIO_ROOT_PASSWORD` | *(强密码)* | MinIO 管理员密码，**必须修改**（当前媒体上传功能未启用，但容器已启动） |
| `JWT_SECRET` | *(hex 64 chars)* | JWT 签名密钥，用 `openssl rand -hex 32` 生成，**泄露后所有登录 token 作废** |
| `JWT_ACCESS_EXPIRY` | `15m` | Access Token 有效期，默认 15 分钟，过短影响体验，过长降低安全性 |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh Token 有效期，默认 7 天，控制"多久需要重新登录" |
| `WEB_URL` | `http://1.2.3.4` | 服务器对外访问地址，**不含末尾斜杠**，用于 CORS 配置和 Cookie 作用域。有域名填域名，没有填 IP |

**注意**：
- `DATABASE_URL` 和 `REDIS_URL` **不需要**手动填写，`docker-compose.prod.yml` 会自动由上面的变量拼接
- `.env.production` **永远不要提交到 Git**（已在 `.gitignore` 中排除）

---

## 5. 日常运维命令

以下命令在服务器 `private_tweet/` 目录下执行。

```bash
# 简写别名，避免每次重复输入长命令
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
```

### 查看状态

```bash
# 查看所有服务健康状态（STATUS 列应全为 healthy）
$COMPOSE ps

# 查看实时日志（所有服务）
$COMPOSE logs -f

# 查看某个服务的日志（最近 100 行）
$COMPOSE logs --tail=100 api
$COMPOSE logs --tail=100 web
$COMPOSE logs --tail=100 nginx
$COMPOSE logs --tail=100 postgres
```

### 重启服务

```bash
# 重启单个服务（不重新 build，适合临时恢复）
$COMPOSE restart api
$COMPOSE restart web
$COMPOSE restart nginx

# 完整重新 build 并重启（代码更新后）
./deploy.sh
```

### 更新代码

```bash
# 方法一：直接运行 deploy.sh（推荐，自动 pull + build + migrate + 重启）
./deploy.sh

# 方法二：手动操作（调试用）
git pull --ff-only
$COMPOSE build api   # 只重建 API 镜像
$COMPOSE up -d api   # 滚动重启 API
```

### 备份数据库

```bash
# 导出完整数据库备份（文件名包含日期）
$COMPOSE exec postgres pg_dump \
  -U tweet \
  -d private_tweet \
  --no-password \
  -F c \
  -f /tmp/backup_$(date +%Y%m%d_%H%M%S).dump

# 将备份文件复制到宿主机
docker cp $(docker compose -p pt_prod ps -q postgres):/tmp/backup_*.dump ./backups/

# 或用 pg_dumpall 备份整个实例（含权限）
$COMPOSE exec postgres pg_dumpall -U tweet > backups/full_$(date +%Y%m%d).sql
```

### 恢复数据库

```bash
# 先确保服务已停止（保留数据卷）
$COMPOSE down

# 恢复（会覆盖现有数据）
$COMPOSE up -d postgres
$COMPOSE exec -T postgres pg_restore \
  -U tweet \
  -d private_tweet \
  --clean \
  < backups/backup_20260222_120000.dump
```

### 进入容器调试

```bash
# 进入 API 容器 shell
$COMPOSE exec api sh

# 在 API 容器内执行 Prisma Studio（开发调试用）
$COMPOSE exec api node /app/apps/api/node_modules/.bin/prisma studio \
  --schema /app/apps/api/prisma/schema.prisma

# 连接 PostgreSQL
$COMPOSE exec postgres psql -U tweet -d private_tweet
```

### 清理磁盘

```bash
# 删除未使用的镜像（不影响运行中的服务）
docker image prune -f

# 删除悬空的构建缓存
docker builder prune -f

# 查看 Docker 总占用空间
docker system df
```

---

## 6. 验证部署成功

### 检查容器状态

```bash
$COMPOSE ps
```

正常输出（所有 STATUS 均为 `healthy`）：

```
NAME          IMAGE              STATUS
api-1         private_tweet-api  Up 2 minutes (healthy)
web-1         private_tweet-web  Up 1 minute (healthy)
nginx-1       nginx:1.27-alpine  Up 30 seconds (healthy)
postgres-1    postgres:16-alpine Up 3 minutes (healthy)
redis-1       redis:7-alpine     Up 3 minutes (healthy)
minio-1       minio/minio:latest Up 3 minutes (healthy)
```

### 检查 API

```bash
curl http://你的服务器IP/api/health
# 期望：{"status":"ok"}
```

### 检查登录墙

浏览器访问 `http://你的服务器IP`，应自动跳转到 `/login` 页面，且地址栏变为：

```
http://你的服务器IP/login?from=%2Ffeed
```

### 检查 robots.txt

```bash
curl http://你的服务器IP/robots.txt
# 期望返回：
# User-agent: *
# Disallow: /
```

### 检查 noindex 响应头

```bash
curl -I http://你的服务器IP/api/health | grep -i robots
# 期望：x-robots-tag: noindex, nofollow
```

### 功能验证清单

- [ ] 访问首页自动跳转 `/login`
- [ ] 使用管理员账号登录（首次部署需先注册 + 手动在数据库提升权限，见下方常见问题）
- [ ] 发帖成功，时间线显示
- [ ] 关注另一用户，Feed 更新
- [ ] 点赞正常
- [ ] 通知页面有消息

---

## 7. 常见问题

### 首次部署后如何创建管理员账号？

`deploy.sh` 不会自动创建任何账号。流程如下：

1. 访问 `http://服务器IP/register`，使用任意邀请码注册第一个账号
   - **首次注册**：可以在数据库先插入一条邀请码，或临时修改后端注册逻辑跳过验证

   更简单的方式：直接在数据库插入邀请码：
   ```bash
   $COMPOSE exec postgres psql -U tweet -d private_tweet -c \
     "INSERT INTO invite_codes (code, created_by) VALUES ('FIRSTUSER', NULL);"
   ```

2. 注册成功后，将该账号提升为管理员：
   ```bash
   $COMPOSE exec postgres psql -U tweet -d private_tweet -c \
     "UPDATE users SET role = 'ADMIN' WHERE username = '你的用户名';"
   ```

3. 管理员登录后可在 `/admin` 页面生成邀请码，邀请其他用户注册。

---

### 服务启动后 `api` 容器一直 `unhealthy`

**排查步骤**：

```bash
# 查看 API 日志
$COMPOSE logs --tail=50 api
```

常见原因：

| 报错关键词 | 原因 | 解决 |
|-----------|------|------|
| `Cannot find package 'fastify'` | Runner 阶段缺少 `apps/api/node_modules` | 确认 Dockerfile 中有 `COPY --from=builder /app/apps/api/node_modules` |
| `PrismaClientInitializationError` | Prisma 引擎找不到 OpenSSL | 确认 runner 阶段有 `apk add --no-cache openssl`，schema.prisma 有 `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` |
| `ECONNREFUSED` 连接 postgres/redis | 数据库还未 healthy，API 启动太早 | 一般重启即可恢复：`$COMPOSE restart api` |
| `P1001` / 数据库连接超时 | `DATABASE_URL` 拼接错误 | 检查 `.env.production` 中的 `POSTGRES_*` 变量 |

---

### Docker build 构建失败

```bash
# 不带缓存重新构建（解决缓存导致的奇怪问题）
$COMPOSE build --no-cache api
$COMPOSE build --no-cache web
```

---

### `deploy.sh` 报错 `CHANGE_ME` 占位符

```
❌ JWT_SECRET in .env.production is empty or still has the placeholder value
```

打开 `.env.production`，找到对应变量，用真实值替换。`JWT_SECRET` 用以下命令生成：

```bash
openssl rand -hex 32
```

---

### Nginx 报 502 Bad Gateway

说明 nginx 能访问但 upstream 服务（api 或 web）挂掉了：

```bash
# 检查 api 和 web 状态
$COMPOSE ps

# 查看 nginx 错误日志
$COMPOSE exec nginx cat /var/log/nginx/error.log | tail -20

# 尝试重启 api/web
$COMPOSE restart api web
```

---

### 磁盘空间不足（构建失败或日志过大）

```bash
# 查看磁盘使用
df -h

# 清理旧镜像和 build 缓存
docker system prune -f

# 清理超过 7 天的日志
find /var/lib/docker/containers -name "*.log" -mtime +7 -exec truncate -s 0 {} \;
```

---

### 更新代码后页面没变化

Next.js 生产模式下静态资源有 1 年缓存（`immutable`）。浏览器强制刷新：`Ctrl+Shift+R`（Windows）或 `Cmd+Shift+R`（Mac）。

若 nginx 侧有缓存问题：

```bash
$COMPOSE restart nginx
```

---

### 如何彻底重置（慎用，删除所有数据）

```bash
# 停止所有服务并删除数据卷（不可恢复！）
$COMPOSE down -v

# 删除构建镜像
docker rmi $(docker images "private_tweet*" -q) 2>/dev/null || true
```
