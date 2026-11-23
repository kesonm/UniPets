# 宠物数字永生•云上空间

主前端使用 uni-app、Vue 3 和 TypeScript，编译为微信小程序原生页面。服务端使用 Express 和 MySQL 8。旧版网页工作台使用 Vue 3、Element Plus 和 Vite。

## 项目结构

```text
miniapp/              微信小程序页面、微信登录、宠物档案和社区
src/                  管理后台、旧版 Vue 网页工作台和 H5 客户端
server/src/           账号、宠物、资产、生成任务和成长记忆接口
server/migrations/    MySQL 表结构与迁移记录
server/test/          真实 MySQL + 本地模型模拟服务的接口集成测试
shared/               动作定义、精灵帧布局和跳跃帧合成逻辑
scripts/              开发启动和独立本地 MySQL 初始化
docs/                 API 说明、部署配置
```

## 功能

- 小程序访客可浏览社区和服务。点击「微信一键登录」后，服务端用微信临时凭证取得 OpenID，首次登录自动建号，再次登录恢复同一账号的宠物档案。每个账号最多可建 3 份，鼻纹登记可选。
- 所有访客均可在网页工作台和手机 H5 注册、登录，用自己的账号新建宠物档案。账号支持恢复会话、退出、修改昵称与密码。密码使用 scrypt 哈希，网页使用 HttpOnly 会话 Cookie。
- 宠物档案新增、编辑、删除：名字、物种、品种、生日、性别、备注、封面。
- 按账号、宠物隔离的资产管理：JPG/PNG/WebP 上传、有效图片解码校验、重命名、预览、下载、封面设置、删除；默认每个账号最多 500 张 / 512 MB。
- 猫咪动作素材按正面坐姿、侧面坐姿和互动动作展示，已有素材可以预览和下载。AI 生图、图生视频和动作生成队列暂时停用。
- 成长记忆：文字、日期、关联照片、删除。

## 本地启动

账号与档案服务需要 Node.js 22+、pnpm 11+ 和 MySQL 8.4。运行历史视频处理工具和对应测试时还需 FFmpeg 与 FFprobe。

```bash
pnpm install
```

选择下面一种 MySQL 方式：

**A. 已安装 Homebrew MySQL（本机已用此方式配置）**

```bash
pnpm db:local
```

脚本只管理项目内 `.local/mysql-data`，监听 `127.0.0.1:3307`，创建 `petcloud` 库、专用应用账号及随机密码。连接信息写入 `.env.local`，原有 `UNIWORK_KEY` 保留。它不注册系统启动服务；重启电脑后再次运行此命令。停止：`node scripts/mysql-local.mjs stop`。非 Homebrew 安装可设置 `MYSQLD_BIN`、`MYSQL_BIN`。

**B. 连接已有数据库**

复制 `.env.example` 为 `.env.local`，设置 `DB_*`，提前创建数据库和只对该库有权限的账号。不要运行 `db:local`，因为该脚本会切换为它管理的开发库。

**C. Docker MySQL**

复制并修改 `.env.example` 为 `.env.local`，填写两个不同的数据库密码，确保 3307 空闲：

```bash
docker compose --env-file .env.local up -d mysql
```

数据库就绪后：

```bash
pnpm db:migrate
pnpm dev
```

在 `server/.env` 中填写 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`，重启 API 后生效。小程序使用的 AppID 为 `wx0d7d45eb04511857`。密钥仅由服务端读取。

`pnpm dev` 同时启动 API 和小程序编译监听。在微信开发者工具中导入 `miniapp/dist/dev/mp-weixin/`。如果 API 已经运行，只需执行 `pnpm dev:mp-weixin`。

本地模拟器默认访问 `http://127.0.0.1:3008`，在开发者工具的「详情 → 本地设置」中勾选「不校验合法域名」。进入「宠物档案」即可微信登录和建档。开发者工具需登录具有此 AppID 开发权限的微信账号。

`pnpm build` 生成的微信小程序默认访问 `https://canyin.uniwork.top/petcloud/api/`。在微信公众平台将 `https://canyin.uniwork.top` 配置为 `request` 和 `downloadFile` 合法域名，再将 `miniapp/dist/build/mp-weixin/` 导入微信开发者工具。需要连接其他服务时，在 `miniapp/.env.production.local` 设置 `VITE_PETCLOUD_API_ORIGIN` 和 `VITE_PETCLOUD_API_PREFIX` 后重新构建。直接通过 `/api/` 提供服务时，将路径前缀设为空。

旧版网页与 API 可通过 `pnpm dev:legacy` 同时启动。网页默认端口为 4173，API 为 3008。

## 管理后台

后台入口为 `/admin`。侧栏包含用户、门店、商品、宠物、服务、动态和创作管理。商品与服务沿用小程序业务目录，可关联门店。门店停用后，已上架的关联项目暂停公开展示；恢复营业后会按原上架状态显示。动态和已发布的宠物故事支持隐藏和恢复。

本地运行 `pnpm db:migrate` 和 `pnpm dev:legacy`，通过网页首页注册一个专用账号。使用下列命令授予该账号管理员权限，然后在 `http://localhost:4173/admin` 登录。撤销权限时将 `grant` 改为 `revoke`。

```bash
pnpm --dir server admin:account grant <网页用户名>
```

Docker 部署将管理入口绑定在服务器本机的 `13000` 端口。使用 SSH 转发，例如 `ssh -N -L 13000:127.0.0.1:13000 fixagent`，在浏览器访问 `http://localhost:13000/admin`。保留原有 `FRONTEND_ORIGINS` 并加入 `http://localhost:13000`。容器内的授权命令为 `docker compose -f deploy/compose.yaml exec api node server/dist/admin-account.js grant <网页用户名>`。

## 手机 H5

`/h5` 和 `/?view=h5` 打开移动工作台，手机访问首页时默认显示 H5。宽屏工作台可通过 `/?view=workbench` 打开。

局域网预览用运行项目的电脑的 Wi-Fi 或有线 IP。以 `192.168.1.10` 为例，在 `.env.local` 中配置来源后启动或重启后端。

```dotenv
FRONTEND_ORIGINS=http://localhost:4173,http://127.0.0.1:4173,http://192.168.1.10:4173
```

```bash
pnpm build:web
pnpm preview --host 192.168.1.10
```

同网设备访问 `http://192.168.1.10:4173/h5`。页面和 API 请求共用这个入口。

- `H5_DEMO_OWNER_ID` 指向用于公开展示的账号 ID。访客可查看该账号的共享档案和封面缩略图。
- `H5_DEMO_MOTION_PET_ID` 指向共享账号下用于展示已有动作的宠物 ID。
- 宠物动态、出行攻略和救助信息支持公开图文、评论、点赞和收藏。商圈由发帖者选择，定位用于浏览器内匹配商圈。部署前运行 `pnpm db:migrate`。
- `H5_OPERATOR_USER_IDS` 配置可进入「我的 → 业务管理」的已有账号 UUID，可填写多个，用逗号分隔。该入口支持发布项目、商品和社群，确认和核销预约，并处理订单及售后。普通账号可浏览已发布项目，并在「我的」查看各自的预约、课程和订单。
- 购物车、商品收藏和商家访问记录按本机浏览器中的登录账号保存。平台商品可一次提交合并订单，库存随订单预留或取消而更新。当前流程登记待确认订单和售后诉求，收款与退款由后续支付接入处理。没有已发布的商品时使用 `src/h5/catalog.ts` 的示例商品。
- 数字凭证页展示平台档案归属。在带钱包的浏览器中可以查看所连接的钱包地址。链上凭证状态等待链上服务接入。

首页轮播中的「宠物赛事」与「宠物培训与考证」读取已发布的业务记录。在 `h5_events` 维护赛程与规则，在 `h5_training_courses` 维护课程与考期。录入确认后的内容并将 `published` 设为 `TRUE` 即可展示。数据库日期使用 UTC，页面以北京时间展示。可用字段见 [H5 赛事与培训接口](docs/api.md#h5-赛事与培训)。

## 历史动作素材

「动作素材」可以预览已保存的动作，主人可下载帧图。原视频和帧图保存在私有素材目录中，MySQL 记录所属账号和宠物。

AI 生图、图生视频、动作生成接口和后台队列处理已暂停。旧版环境变量 `PETCLOUD_GENERATION_ENABLED` 已失效。生成路由的挂载和 Worker 启动已在源码中注释，旧实现保存在 `server/src/generation-routes.ts` 和 `server/src/jobs.ts`。

已有原视频可以按任务重新处理。先完成数据库迁移，再运行 `pnpm --dir server video:cutout <视频任务 ID>`。成功后使用原素材 ID 提供更新的透明帧图和原视频。

## 构建与检查

```bash
pnpm check
pnpm build
pnpm build:web
pnpm --dir server build
pnpm test:wechat
pnpm test:sprites
pnpm test:video
pnpm test:api
pnpm test:admin
pnpm test:h5
pnpm test:video-jobs
```

`test:video` 用 FFmpeg 生成本地测试视频，验证 2–4 秒抽帧、接口响应解析与下载地址检查，不调用收费接口。`test:api` 和 `test:video-jobs` 使用配置的 MySQL：请先停止 API 进程，确保没有活动任务，再顺序运行；测试创建随机账号，结束后清理账号和文件。前者验证账号与原图片流程，后者验证视频任务恢复、不重复提交、部分成功、原视频权限隔离和文件清理。两个集成测试都使用模拟供应商。

## 部署

1. 迁移数据库：`pnpm db:migrate`。
2. 构建前端和后端，静态 Web 与 API 独立部署。部署 API 时一并保留项目根目录下的 `shared/`。
3. 后端配置 `NODE_ENV=production`、`FRONTEND_ORIGINS`、`DB_*` 与 `STORAGE_DIR`。生产会话默认使用 Secure Cookie。指定 HTTP 部署须显式设置 `PETCLOUD_ALLOW_HTTP_AUTH=1`，并将实际 HTTP 来源加入白名单。
4. 建议同域 `/api` 反向代理到独立 API 服务，示例见 `docs/nginx.conf.example`。如果跨域部署，在构建时设置 `VITE_API_BASE_URL` 并同步后端来源白名单。不同站点的浏览器 Cookie 策略可能阻止登录，优先同域代理。
5. 用独立应用账号连接 MySQL，持久挂载并同时备份数据库和素材目录。数据库不保存图片二进制，单独备份数据库不能恢复图片。
6. 服务默认按直接连接 IP 限流。只有 API 位于一层受控代理后且 API 端口未公开时，才设置 `TRUST_PROXY=1`。

旧版网页在阿里云配置中与 API 共用一个入口。运行 `VITE_API_BASE_URL='' pnpm build:web` 和 `pnpm --dir server build` 后，将 `dist/`、`server/dist/`、`server/migrations/`、`server/noseprint/`、`shared/`、`deploy/` 以及工作区的包清单和锁文件同步到服务器。小程序服务端从 `.runtime.env` 读取 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`。[Docker Compose 配置](deploy/compose.yaml)

- 根目录的 `.env` 设置 `DB_PASSWORD`、`MYSQL_ROOT_PASSWORD`、`FRONTEND_ORIGINS`。模型和共享宠物设置放在 `.runtime.env`。两份文件仅供部署账户读取。
- 将 FFmpeg 压缩包保存为 `deploy/ffmpeg-linux-amd64.tar.xz`。镜像构建时会校验文件的 SHA-256。[下载 FFmpeg Linux x86-64 构建](https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/autobuild-2026-11-16-15-29/ffmpeg-n8.1.3-35-gf1acb0a266-linux64-gpl-8.1.tar.xz)
- 将鼻部定位权重放在服务器项目根目录的 `noseprint-models/`。Compose 会将该目录以只读方式挂载到 API，镜像会安装 Python 推理依赖。 [鼻纹模型配置](docs/pet-identity.md)
- 在项目根目录运行 `docker compose --env-file .env -f deploy/compose.yaml up -d --build`。MySQL 使用 Docker 卷，应用将媒体写到由容器内 `node` 用户（UID 1000）管理的 `storage/`。
- 设定 `PETCLOUD_PUBLIC_BIND=0.0.0.0:3000` 与 `PETCLOUD_ALLOW_HTTP_AUTH=1` 可通过公网 IP 使用账号注册、登录和个人宠物档案。Caddy 公网入口只代理已开放的接口，业务管理入口绑定在服务器本机的 13000 端口。

接口列表与鉴权规则见 `docs/api.md`。
