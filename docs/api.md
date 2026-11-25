# PetCloud API

基础地址为 `/api`。请求和错误使用 JSON，错误格式为 `{ "error": "可显示的错误描述" }`。资源 ID 使用 UUID。网页通过 HttpOnly Cookie 鉴权，写请求需来自 `FRONTEND_ORIGINS` 中的来源。

注册、登录向所有访客开放。个人宠物、素材和记忆查询均限制为当前用户。访问别人的资源统一返回 404。素材文件通过鉴权接口读取。

微信小程序通过 `uni.login` 获取临时凭证，携带 `X-PetCloud-Client: miniprogram` 向 `/auth/wechat` 提交 JSON。服务端调用微信 `code2Session`，按 AppID 与 OpenID 匹配账号，签发有效期 7 天的宠云令牌。小程序读写私有资料或下载图片时使用 `Authorization: Bearer <token>`。`/h5/` 路径下的社区和业务接口同样向小程序提供 JSON。

| 方法 | 路径 | 用途 / 请求字段 |
|---|---|---|
| GET | /health | MySQL 连通性 |
| POST | /auth/register | username, password, displayName? |
| POST | /auth/login | username, password |
| POST | /auth/wechat | 小程序发送一次性 `code`，可同时提交 `displayName`、`avatarImage`。首次登录自动建号并返回 201，响应为 `{ user, token }` |
| GET | /auth/me | 当前账号，`publicId` 为固定的 6 位用户 ID |
| POST | /auth/logout | 撤销当前会话 |
| PATCH / PUT | /auth/profile | displayName |
| PUT | /auth/profile/avatar | avatarImage（JPG/PNG/WebP data URL，解码后不超过 8 MB），displayName?，返回更新后的账号 |
| GET | /auth/profile/avatar | 下载本人头像，响应为 WebP。未设置头像时返回 404 |
| POST | /auth/password | currentPassword, newPassword；撤销所有会话 |
| GET | /dashboard | 当前账号的档案、素材、记忆统计，`generationEnabled` 为 `false` |
| GET / POST | /pets | 列出本人档案 / 新建普通档案，必填 `name`、`species`，每个账号最多 3 份 |
| GET / POST | /pets/identity | 查询已配置的识别物种 / 上传 `nosePrintImage` 并创建档案和数字身份证 |
| POST | /pets/:id/identity | 上传 `nosePrintImage`，为已有档案登记鼻纹并签发身份证 |
| GET | /pets/:id/identity/codes/:kind | 下载已签发的本人宠物身份证号编码图片。`kind` 为 `barcode` 或 `qrcode`，响应为 PNG |
| PUT 或 PATCH / DELETE | /pets/:id | 编辑完整档案 / 删除档案及关联素材、任务、记忆 |
| GET | /assets?petId=&kind= | 本人资产列表，最多 500 个 |
| POST | /assets | petId, name, image（JPG/PNG/WebP data URL，解码后不超过 8MB） |
| GET | /assets/:id/file | 受保护图片；`?download=1` 下载 |
| GET | /assets/:id/video | 受保护原 MP4，支持 Range；`?download=1` 下载 |
| PATCH / DELETE | /assets/:id | name / 删除图片、原视频及引用 |
| GET | /motions/:petId | 读取当前宠物已有的姿势锚图和动作素材 |
| GET / POST | /memories | 最近 500 条 / 新建：petId, title, content, happenedOn, assetId? |
| DELETE | /memories/:id | 删除记忆 |

`/jobs`、`/motions/:petId/batch-plan`（含单图入口）、`PUT /motions/:petId/poses/:key` 和 `POST /motions/:petId/generate` 的路由已暂停挂载。登录用户直接请求这些路径时，API 服务返回 404。已有动作可通过 `GET /motions/:petId` 预览。

宠物字段：`name`、`species`（dog/cat/other）、`breed`、`birthday`（YYYY-MM-DD 或 null）、`gender`（unknown/male/female）、`notes`、`avatarAssetId`（同一宠物的 photo 素材 ID 或 null）。

动作资产包含 `frames`、`columns`、`rows`、`fps`、`duration`、`hasVideo`、`width`、`height`、`action` 和 `jobId`。`backgroundRemoved=1` 表示 PNG 动作帧已去背景。后端重新处理已有素材时沿用原 ID。新视频素材每帧 256 × 256，12 帧/秒，最多 8 列。播放器按从左到右、从上到下读取前 `frames` 个格子。默认 3 秒对应 36 帧、8 列、5 行和 2048 × 1280 PNG。`byteSize` 包含帧图与原视频大小。历史图片素材为 4 列、1 行，约 4.167 帧/秒，`hasVideo=false`。

`sleepLoop=1` 表示睡觉帧图已整理为呼吸循环，播放和下载使用这份帧图。`imageVersion` 在帧图替换时更新，客户端可以用它刷新素材缓存。

连续动作片段记录 `motionFromAssetId` 和 `motionToAssetId`，用这两个锚图 ID 匹配同一套流程。`motionJoinable=1` 表示片段通过接缝检查，可与同一背景格式的片段连播。需要进一步检查的片段仍可单独预览。

初始迁移建立 users、sessions、pets、assets、generation_jobs、memories、desktop_profiles 表，以及 schema_migrations 迁移记录。`002_video_actions.sql` 增加视频动作明细与帧图元数据，`003_video_background.sql` 增加去背景标记，均保留历史素材。scrypt 密码使用独立随机盐，数据库只保存随机会话令牌的 SHA-256 摘要，会话有效期 7 天。

<details>
<summary>历史生成接口与任务数据结构（已停用）</summary>

| 方法 | 历史路径 | 用途 / 请求字段 |
|---|---|---|
| GET | /jobs | 最近 50 个生成任务，整批生成只展示汇总任务 |
| POST | /jobs | petId, referenceAssetId, mode?（默认 video）, duration?（2/3/4，默认 3）；返回 202 和 job |
| GET | /motions/:petId/batch-plan | 按宠物资产列表顺序选取最多 5 张原始上传照片，返回 `references` 及 `poses`、`clips`、`local`、`jump`、`total` |
| GET | /motions/:petId/batch-plan/:photoId | 旧版入口，按指定单张照片预估 |
| PUT | /motions/:petId/poses/:key | 选择该宠物的照片作为锚图，`assetId=null` 取消选择 |
| POST | /motions/:petId/generate | `{kind:"batch", referenceAssetIds, approved:{poses,clips}}` 生成整批动作，旧客户端仍可传单数 `referenceAssetId`。`{kind:"pose", key, referenceAssetId}` 生成一张锚图，`{kind:"clip", key}` 按当前起止锚图生成一个片段 |

任务状态为 `queued → running → completed / partial / failed`。`completed` 和 `total` 记录已就绪与总项目数。`mode` 支持 `video`、`image`、`motion_batch` 和内部合成任务 `motion_render`。`phase` 显示当前动作及阶段。历史客户端通过 `GET /jobs` 轮询进度。

整批包含姿势锚图、视频动作和本地合成的片段，`total` 记录整批素材数，`poses`、`clips` 和 `local` 记录尚需处理的数量。猫档案的 `jump=true` 表示本批将用侧身站姿合成跳跃帧图。跳跃合成使用本地处理。

将预估接口 `references` 中的 ID 依序提交为 `referenceAssetIds`，将 `poses` 和 `clips` 提交为 `approved`。后端重新选取当前宠物最近上传的 1–5 张照片并锁定本次输入，参考组变化或所需调用次数增加时返回 409。原照用于外观建模，动作由生成的首尾姿势图控制。相同参考组可复用已有锚图和动作。旧版库首次扩展时会采用已启用的动作锚图，复用锚图一致的旧行走与过渡素材。切换参考图后会保留当前可用的动作库，直到新动作库就绪。

`steps` 逐段返回 `action`、`status`、`progress`、`retrying`、`error` 和 `assetId`。`progress=null` 表示上游暂无数字进度。有原片但接缝需检查的动作仍会提供 `assetId`，供工作台单段预览。

视频动作明细保存在 `generation_actions`，状态为 queued / submitting / generating / processing / completed / failed。保存供应商任务 ID 后，查询与下载可重试；重启后继续查询原 ID，不会重新生成。提交失败或结果未知不自动重试；不确定的收费任务需在供应商侧核查。原视频只对所属账号开放，不向客户端暴露供应商临时 URL。显式 `mode: image` 保留旧图片生成流程。

</details>

## 小程序定位、服务帖与推荐

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | /h5/catalog/district-boundaries | 按整度网格 `x`、`y` 获取区县边界，端上识别当前区县 |
| GET | /h5/catalog/service-categories | 获取后台维护的服务分类编号和名称 |
| GET | /h5/catalog/service-posts | 按 `region`（省市代码）、`category`、`q`、`page` 筛选服务帖，兼容旧版 `district` |
| POST | /h5/catalog/service-posts/search | 查询同一列表，按距离排序时在 JSON 里提交 `location`（`latitude` 和 `longitude`） |
| GET | /h5/catalog/service-posts/:id | 服务详情、门店电话及互动计数 |
| POST | /h5/catalog/service-posts | 已绑定门店的登录用户提交 `storeId`、`category`、`title`、`description` 与可选的 `priceCents`，发布服务帖 |
| PUT | /h5/catalog/service-posts/:id/like | 为当前账号设置点赞，提交 `{ active }` |
| GET / POST | /h5/catalog/service-posts/:id/comments | 读取评论，或登录后提交 `{ body }` |
| GET | /h5/catalog/stores/mine | 读取当前账号绑定的门店及其发布条件 |
| POST | /h5/catalog/stores/binding-code/check | 验证绑定码可用性 |
| POST | /h5/catalog/stores/location | 根据小程序地图选点识别区县和服务城市 |
| POST | /h5/catalog/stores/bind | 提交 `code`、`name`、`address`、`phone`、`location`，创建门店并绑定当前账号 |
| PUT | /h5/catalog/stores/mine/:id | 修改自己已绑定门店的资料和位置 |
| GET | /h5/posts | 交友使用 `sort=latest`，可组合 `petType`、`breed`、`q` 和 `page` |
| GET | /h5/posts/mine/counts | 当前账号的发布、点赞和收藏计数 |
| GET | /h5/posts/mine | 按 `tab=published`、`likes` 或 `favorites` 读取对应列表，支持 `page` |
| GET | /h5/posts/breeds | 获取公开帖子使用的品种，可按 `petType` 筛选 |
| GET | /h5/posts/recommendations | 混排服务帖与动态，支持区县 `district` 和访客随机种子 `seed` |

首页推荐会参考登录用户的宠物类型、品种和近 30 天的公开求助，并加入按用户区分的随机排序。周边服务通过小程序「我的门店」发布，预约入口为门店电话。

小程序的门店选点使用 GCJ-02 经纬度。服务端识别城市和区县后以 WGS84 保存坐标。边界数据无法识别城市时，绑定和修改接口允许提交手动选择的 `cityCode`。

`GET /admin/stores/bound` 分页读取已绑定门店，支持按门店名称、地址或电话搜索，并按营业状态筛选。

`GET /admin/stores/binding-codes` 返回当前的 10 个绑定码。`GET /admin/stores/binding-codes/:slot/qr` 返回相应绑定码的二维码。二维码包含 `petcloud:store:` 前缀及绑定码。创建门店、绑定账号、消费旧码和补发该位置的新码在同一事务完成。未使用的绑定码持续有效，一个账号可以通过多个绑定码登记多家门店。

发布记录包括动态、已发布的宠物故事和用户发出的门店服务帖。点赞列表包括三种内容，收藏列表包括动态和宠物故事。点赞和收藏只统计当前可打开的公开内容。

周边服务的 `sort` 默认是 `recommended`，根据用户宠物档案和近 30 天公开求助排序。还支持 `likes-desc`、`likes-asc`、`distance-asc` 和 `distance-desc`。距离使用设备取整后的 WGS84 坐标和门店坐标计算，响应中的 `distanceMeters` 是直线距离。无坐标的门店排在最后。未选择地区时查询全国。

管理员可以通过 `GET /admin/service-categories` 查看分类，`POST /admin/service-categories` 新建，或 `PUT /admin/service-categories/:id` 修改名称。新建和改名都提交 2～4 字的 `label`。门店编辑支持可选的 `cityCode` 和 `coordinates`，后者同时包含 WGS84 经纬度。

## H5 赛事与培训

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | /h5/events | 公开赛程、城市、参赛种类和报名状态 |
| GET | /h5/events/:id | 赛场、主办方、规则与报名时间 |
| GET | /h5/events/:id/registrations | 当前账号已提交的宠物报名 |
| POST | /h5/events/:id/registrations | 提交当前账号名下的 `petId`。同一场赛事同一只宠物重复提交返回原记录 |
| GET | /h5/training | 公开课程、学习方式、开课时间、考期、考点、报考条件和发证机构 |

发布赛事时填写 `h5_events` 的 `id`（UUID）、`title`、`organizer`、`city`、`venue`、`starts_at`、`registration_opens_at`、`registration_closes_at` 和 `rules`。如有种类要求填写 `species`。如有对应商圈，在 `area` 填写 `shared/h5-areas.mjs` 中的商圈 ID，赛事详情会展示该商圈的商城入口。

发布课程时填写 `h5_training_courses` 的 `id`（UUID）、`title`、`learning_format`、`exam_location`、`eligibility`、`credential`（证书名称）和 `issuer`。已确认的开课和考试时间写入 `starts_at` 和 `exam_at`。日期为空时页面显示「待公布」。两个表的 `published` 默认关闭，核对后设为 `TRUE`。

## 旧版客户端兼容

旧版本地客户端可通过 `X-PetCloud-Client: desktop` 登录，以 `Authorization: Bearer <token>` 鉴权。`/desktop` 保留历史配置读写，`/desktop/action` 和 `/desktop/action/:id` 保留旧版指令协议。
