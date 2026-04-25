# image-chat

一个基于 **Next.js 16 + shadcn/ui** 的聊天生图网站，支持：

- 聊天式提交提示词生成图片
- 每个用户在前端填写自己的 `API Key / Base URL / Model`
- 前端加密、后端解密调用上游图片接口
- 本地会话历史与图片库
- 参考图续画
- 公共「焚决市场」：提交生成结果，浏览公开提示词与效果图，并带回聊天区再生成

> 这个项目默认**不在服务端保存用户的上游 API Key**。服务端只需要一把 RSA 私钥，用来解密前端临时加密后的调用配置。

---

## 本地开发

### 1. 安装依赖

```bash
pnpm install
```

### 2. 准备环境变量

复制环境变量模板：

```bash
cp .env.example .env.local
```

开发环境下如果你不配置 `IMAGE_CHAT_CONFIG_PRIVATE_KEY`，服务端会自动生成一把临时 RSA 密钥，所以本地开发可以直接跑。

如果你想自己指定固定私钥，也可以在 `.env.local` 中配置：

```env
IMAGE_CHAT_CONFIG_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
IMAGE_CHAT_PROVIDER_TIMEOUT_MS=180000
```

### 3. 启动开发服务器

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)

---

## Docker 快速部署

项目已经内置：

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`

并且已启用 Next.js `standalone` 输出，适合直接容器化部署。

当前 Docker 基础镜像使用：

- **Node.js 24 Alpine**

### 1. 生成生产环境 RSA 私钥

生产环境必须提供 `IMAGE_CHAT_CONFIG_PRIVATE_KEY`，否则服务端无法给前端下发加密公钥。

先生成私钥：

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out image-chat-private.pem
```

把 PEM 转成单行、带 `\n` 的字符串：

```bash
python3 - <<'PY'
from pathlib import Path
print(Path("image-chat-private.pem").read_text().replace("\n", "\\n"))
PY
```

### 2. 创建 `.env`

```bash
cp .env.example .env
```

然后把上一步输出的内容填进 `.env`：

```env
IMAGE_CHAT_CONFIG_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----"
IMAGE_CHAT_PROVIDER_TIMEOUT_MS=180000
```

> 注意：这里不需要配置 OpenAI API Key。  
> 真正调用上游时，用户会在页面里自己填写 `API Key / Base URL / Model`，前端加密后发给服务端。

### 3. 一键启动

```bash
docker compose up -d --build
```

启动后访问：

[http://localhost:3000](http://localhost:3000)

### 4. 查看日志

```bash
docker compose logs -f
```

### 5. 停止服务

```bash
docker compose down
```

---

## 只用 Docker 命令部署

### 构建镜像

```bash
docker build -t image-chat:latest .
```

### 启动容器

```bash
docker run -d \
  --name image-chat \
  -p 3000:3000 \
  --env-file .env \
  -v image-chat-data:/app/data \
  image-chat:latest
```

---

## 生产部署说明

### 必需环境变量

| 变量名 | 是否必需 | 说明 |
| --- | --- | --- |
| `IMAGE_CHAT_CONFIG_PRIVATE_KEY` | 是（生产） | 服务端 RSA 私钥，用于解密前端加密后的调用配置 |
| `IMAGE_CHAT_PROVIDER_TIMEOUT_MS` | 否 | 上游图片接口超时时间，默认 `180000` 毫秒 |
| `IMAGE_CHAT_MARKET_DATA_DIR` | 否 | 焚决市场 SQLite 与图片文件目录，Docker 默认 `/app/data/image-chat-market` |
| `IMAGE_CHAT_MARKET_MAX_IMAGE_BYTES` | 否 | 焚决市场单张图片大小上限，默认 `10485760` 字节 |
| `IMAGE_CHAT_MARKET_ADMIN_TOKEN` | 否 | 焚决市场管理员删除口令；设置后可在市场页软删除作品 |

### 焚决市场数据持久化

Docker Compose 默认把命名卷 `image-chat-data` 挂载到 `/app/data`，市场元数据和图片会保存在该卷中。  
如果你使用纯 Docker 命令部署，建议额外挂载数据目录：

```bash
docker run -d \
  --name image-chat \
  -p 3000:3000 \
  --env-file .env \
  -v image-chat-data:/app/data \
  image-chat:latest
```

### 端口

- 容器内部端口：`3000`
- `docker-compose.yml` 默认映射：`3000:3000`

如果你要改宿主机端口，可以直接修改 `docker-compose.yml` 里的 `ports`。

---

## 常用命令

```bash
pnpm test:run
pnpm lint
pnpm build
```

---

## 技术栈

- Next.js 16
- React 19
- shadcn/ui
- Tailwind CSS 4
- IndexedDB (`idb`)
- yet-another-react-lightbox
