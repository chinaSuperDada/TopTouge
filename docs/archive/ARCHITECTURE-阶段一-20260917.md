# TopTouge 架构设计

> 跑山路线微信小程序。本文档描述目录结构、技术选型与三张架构图。
> 任务书见 `TopTouge-init.md`。分阶段交付。

---

## 零、已定技术决策

| 项 | 决策 | 备注 |
|---|---|---|
| 后端 | Node.js + Express（CommonJS） | 按任务书；非 Java |
| 数据源 | **内存 mock（当前）→ PostgreSQL + PostGIS（后续）** | 见下方「数据源分期」 |
| 空间数据 | 距离/区域判断走应用层数学 | PostGIS 暂不引入 |
| 前端 | 微信小程序原生（JS + WXML + WXSS） | 非 TypeScript、非 uni-app |
| 地图 | 高德微信小程序 SDK `@amap/amap-wx.130.js` | 本地引入 SDK 文件，不用 npm |
| 认证 | 无。固定测试 `userId`，由请求头 `x-user-id` 传入 | 阶段一不做登录 |
| 车型 | 只支持 `car`，字段预留 | |

### 数据源分期（2026-09-17 调整）

原计划用 Docker Compose 起 PostGIS 容器。用户决定**先去掉数据库，数据全部走内存 mock**，优先验证业务流程和 UI；流程跑通后再补数据库。

- **当前**：`DATA_SOURCE=memory`（`server/src/config.js` 开关），`repositories/` 层是内存实现
- **后续**：加 `DATA_SOURCE=postgres` 分支，写 `pg` 实现 + `001_init.sql` + 迁移脚本

**为什么现在不做会返工**：分层里 SQL 只在 `repositories/` 一层，`services` 与 `routes` 不知道数据从哪来。补数据库时只需新增一套 repo 实现，上层零改动。这是当初坚持「repositories 是唯一写 SQL 的地方」的回报。

**PostGIS 的定位不变**：任务书要求用它做区域判断和距离计算，但阶段一这两件事应用层数学十几行就够，且单元测试比 SQL 好写。等真要「附近路线」这类空间索引查询时再引入。

---

## 一、目录结构

```
TopTouge/
├── TopTouge-init.md              # 任务书（原始需求）
├── README.md                     # 启动说明
├── .gitignore
├── .env.example                  # 后端环境变量样例（含 DATA_SOURCE 开关）
├── docs/
│   ├── ARCHITECTURE.md           # 本文档
│   └── diagrams/
│       ├── application-architecture.svg
│       ├── technical-architecture.svg
│       └── deployment-architecture.svg
│
├── server/                       # ===== 后端 =====
│   ├── package.json
│   ├── src/
│   │   ├── index.js              # 进程入口：读 env、建 repo、监听端口
│   │   ├── app.js                # 组装 Express 中间件与路由（不监听端口，方便测试）
│   │   ├── config.js             # 集中读环境变量，带默认值
│   │   ├── store/
│   │   │   ├── memoryStore.js    # 内存数据源（当前使用）
│   │   │   └── mockRoutes.js     # 3 条 mock 路线的生成与初始化
│   │   ├── routes/               # 只做 HTTP 层：解析入参、调 service、拼响应
│   │   │   ├── routes.router.js  # /api/routes
│   │   │   ├── runs.router.js    # /api/runs        （阶段二）
│   │   │   ├── comments.router.js
│   │   │   └── roadConditions.router.js
│   │   ├── services/             # 业务逻辑，不碰 req/res
│   │   │   ├── routeService.js
│   │   │   ├── statsService.js        # 从坐标序列算 距离/弯道/急弯/爬升
│   │   │   ├── difficultyService.js   # 难度计算，纯函数
│   │   │   ├── runService.js          # （阶段二）
│   │   │   ├── scoringService.js      # （阶段二）
│   │   │   ├── commentService.js
│   │   │   └── roadConditionService.js
│   │   ├── geo/
│   │   │   ├── haversine.js      # 两点球面距离（米）
│   │   │   ├── bearing.js        # 方位角
│   │   │   ├── turnAngle.js      # 相邻三点转向角（度，带方向）
│   │   │   └── radius.js         # 欧氏近似半径判断（跑山终点检测用）
│   │   ├── repositories/         # 数据访问层，service 只调这一层
│   │   │   ├── routeRepo.js
│   │   │   ├── runRepo.js
│   │   │   ├── commentRepo.js
│   │   │   └── roadConditionRepo.js
│   │   ├── middleware/
│   │   │   ├── userId.js         # 从 x-user-id 取固定用户，缺省回落测试 id
│   │   │   └── errorHandler.js   # 统一错误响应 { error: { code, message } }
│   │   ├── validators/
│   │   │   └── routeValidator.js # 上传路线入参校验
│   │   └── constants.js          # vehicleType / roadWidth / 难度阈值
│   └── tests/
│       ├── geo.test.js
│       └── difficulty.test.js    # 难度计算重点测试
│
└── miniprogram/                  # ===== 微信小程序 =====
    ├── project.config.json       # appid / 编译设置
    ├── app.js                    # 全局：baseUrl、全局 userId
    ├── app.json                  # 页面注册、tabBar、权限声明
    ├── app.wxss                  # 全局样式变量
    ├── sitemap.json
    ├── utils/
    │   ├── request.js            # wx.request 封装：baseUrl、错误提示、Promise
    │   ├── format.js             # 距离/星级展示格式化
    │   └── amap.js               # 高德 SDK 初始化与 key 注入
    ├── components/
    │   ├── route-card/           # 列表项：名称/距离/星级
    │   ├── difficulty-panel/     # 难度信息面板
    │   ├── comment-list/         # 评论区块（输入框 + 列表）
    │   └── road-condition-list/  # 路况提示区块
    ├── pages/
    │   ├── route-list/           # 路线列表页
    │   ├── route-detail/         # 路线详情页（地图 + 难度 + 社区 + 开始跑山）
    │   ├── route-upload/         # 上传路线页（地图点选 + 表单）
    │   ├── run/                  # （阶段二）
    │   └── run-result/           # （阶段二）
    └── libs/
        └── amap-wx.130.js        # 高德 SDK 本地文件，需你手动放入
```

**分层规则**（阶段一就守住，避免阶段二返工）：
- `routes/` 只做 HTTP，不含业务分支
- `services/` 不含 `req`/`res`，可被测试与定时任务直接调用
- `repositories/` 是唯一接触数据源的地方（当前是内存 store，将来换成 SQL）
- `geo/` 与 `statsService`/`difficultyService` 是纯函数，无 IO，重点单测

---

## 二、阶段划分

### 阶段一：路线库（本次实现）

**后端**
- `POST /api/routes` 上传路线：入参坐标点数组 + 名称 + 路宽
  - 后端算 `distanceMeters` / `curveCount` / `sharpCurveRatio` / `elevationGainMeters` / `difficultyStars`
  - 首尾点自动作为 `startPoint` / `endPoint`，半径默认 30m
  - 返回完整路线对象
- `GET /api/routes` 路线列表
- `GET /api/routes/:id` 路线详情（含评论和路况各最近 10 条）
- `POST/GET /api/routes/:id/comments`
- `POST/GET /api/routes/:id/road-conditions`
- `GET /api/health`
- 启动时在内存里生成 3 条 mock 路线
- 难度计算单测

**小程序**
- 路线列表页 / 详情页 / 上传页
- 高德地图组件画轨迹线 + 起终点/途经点标记
- 详情页评论、路况两个区块（各带输入框）
- 「开始跑山」按钮先占位（阶段二接）

**阶段一验收**：任务书验收标准 1、2、3 全部通过。

### 阶段一补充：接入数据库

流程与 UI 验证通过后，把内存 store 换成 PostgreSQL + PostGIS：
- 加 `pg` 依赖、`docker-compose.yml`（postgis 镜像）
- `src/db/pool.js`、`001_init.sql`（routes / comments / road_conditions 建表）、迁移脚本
- `repositories/` 新增 SQL 实现，`config.js` 加 `DATA_SOURCE=postgres` 分支
- 上层 `services` / `routes` 零改动

### 阶段二：跑山与算分
`POST /api/runs`、跑山中页（`wx.onLocationChange`）、结果页、node-cron 清理任务、`expiresAt` 逻辑。
验收标准 4、5。

### 阶段三（任务书外，可选）
- 空间索引：加 `geometry` 列 + `GiST` 索引，支持「附近路线」
- 摩托车/自行车：放开 `vehicleType`
- 账号体系

---

## 三、关键技术细节

### 3.1 难度计算（`statsService` + `difficultyService`）

```
1. 距离      Σ haversine(p[i], p[i+1])
2. 转向角    对每三个连续点算 bearing 差，归一化到 (-180, 180]
3. 弯道数    转向角 > 30°，连续超阈值的点合并为同一个弯道区间，区间数即弯道数
4. 急弯占比  弯道区间内峰值角 > 60° 的记为急弯，急弯数 / 弯道数
5. 爬升      Σ max(0, alt[i+1] - alt[i])，altitude 缺失按 0 处理
6. 星级      normCurvesPerKm 与 normGainPerKm 各归一化到 [0,1]，均值 × 5 四舍五入，夹到 1-5
```

阈值集中在 `constants.js`（`TURN_THRESHOLD_DEG=30`、`SHARP_TURN_DEG=60`、半径默认 30m），便于调参。

**匹配需求注意点**：任务书的数据模型里 `referenceTrack` 是 `{lat,lng,altitude}`，上传页是「地图点选」——高德点选事件**没有海拔**。因此 `altitude` 全程允许缺省为 `0`，爬升为 0 时星级只由弯道维度决定。这是任务书第 81 行明确允许的行为。

### 3.2 坐标系
高德 SDK 返回的是 **GCJ-02**。数据库统一存 GCJ-02，不做 WGS-84 转换（阶段一没有跨源数据）。在 `constants.js` 里写明这个约定，避免后续接入 GPS 原始轨迹（WGS-84）时混坐标系——**这是阶段二会踩的坑，提前标记**。

### 3.3 数据存储形态（当前：内存）

**当前**：`DATA_SOURCE=memory`，`server/src/store/memoryStore.js` 用 Map 存 routes / comments / roadConditions，进程重启即重置。启动时由 `mockRoutes.js` 灌入 3 条 mock 路线。够跑通流程和 UI。

**后续接数据库时**：`reference_track`、`waypoints` 存 `JSONB`（数组）；`start_point` / `end_point` 存 `JSONB` 对象 `{lat, lng, radiusMeters}`；`raw_track_points`（阶段二）存 `JSONB`——单条记录几十 KB，`JSONB` 足够；清空时直接置 `NULL`。字段名与当前内存对象一一对应，迁移时不需要改上层。

### 3.4 ID 与时间

内存实现用自增计数器给 `id`，时间用 `new Date().toISOString()`（ISO 8601 字符串）。接数据库后换成 `BIGSERIAL` 与 `timestamptz`，API 返回的 JSON 结构保持不变——小程序端不需要改。

### 3.5 小程序环境
- `app.js` 里 `baseUrl` 分 dev/prod 两个常量，dev 指向 `http://localhost:3000`，真机调试需换局域网 IP
- 开发阶段在微信开发者工具里勾选「不校验合法域名」
- 高德 key 放在 `utils/amap.js` 顶部常量；`libs/amap-wx.130.js` 是本地 SDK 文件

---

## 四、三张架构图

图片见 `docs/diagrams/`：

| 文件 | 内容 |
|---|---|
| `application-architecture.svg` | 应用架构：页面 → 组件 → API → 服务 → 数据 |
| `technical-architecture.svg` | 技术架构：技术栈分层与依赖关系 |
| `deployment-architecture.svg` | 部署架构：开发期（本机）与生产期（云）对照 |

---

## 五、需要你配合的事项

见根目录 `README.md` 的「你需要准备」一节，摘要：

1. **微信小程序 AppID** — 填进 `miniprogram/project.config.json`。测试号即可，但高德 SDK 需要真实 appid 才能申请 key。
2. **高德开放平台 Key** — 到 console.amap.com 建「微信小程序」类型应用，需要填 AppID 和包名。key 给我后我写进 `utils/amap.js`。
3. **高德 SDK 文件** — 从高德控制台下载 `amap-wx.130.js` 放到 `miniprogram/libs/`。这个文件有版权限制，我不替你下载。
4. **Docker Desktop 启动** — 我起 `docker compose up -d` 时需要它运行；首次拉 `postgis/postgis` 镜像约 1GB。
5. **端口占用确认** — 后端 3000、Adminer 8080、Postgres 5432。有冲突告诉我，改 `docker-compose.yml`。
