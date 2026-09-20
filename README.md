# TopTouge

跑山路线分享 + 成绩记录微信小程序。

需求见 [TopTouge-init.md](./TopTouge-init.md)，架构设计见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

## 架构图

- [应用架构图](./docs/diagrams/application-architecture.svg)
- [技术架构图](./docs/diagrams/technical-architecture.svg)
- [部署架构图](./docs/diagrams/deployment-architecture.svg)

## 当前进度

**阶段一：路线库**（进行中）

- 路线列表 / 详情 / 上传
- 难度自动计算（弯道数、急弯占比、爬升、星级）
- 评论 + 路况提示

**数据源：内存 mock**。先跑通业务流程和 UI，之后再接 PostgreSQL + PostGIS。
数据访问集中在 `server/src/repositories/` 一层，换数据源不影响 `services` 和 `routes`。

未开始：阶段二（跑山与算分）、阶段三（空间索引 / 多车型 / 账号）。

---

## 你需要准备

### 1. 微信小程序 AppID

填到 `miniprogram/project.config.json` 的 `appid` 字段（当前是占位符）。

到 [mp.weixin.qq.com](https://mp.weixin.qq.com) 注册，个人主体即可。高德申请 key 要求真实 AppID。

### 2. 高德开放平台 Key

到 [console.amap.com](https://console.amap.com) → 应用管理 → 创建应用：
- 服务平台选 **微信小程序**
- 填写上面拿到的 AppID
- 拿到 Key 后给我，我写进 `miniprogram/utils/amap.js`

### 3. 高德 SDK 文件（需要你手动下载）

到高德控制台「我的应用」→ 下载 **微信小程序 SDK**，把 `amap-wx.130.js` 放到：

```
miniprogram/libs/amap-wx.130.js
```

这个文件有版权限制，我不代为下载。

**注意**：没有 AppID / Key / SDK 时，小程序页面逻辑仍可跑，但地图区域渲染不出来。

---

## 本地启动

```bash
cd server
npm install
npm run dev        # http://localhost:3000
```

不需要数据库。启动时自动在内存里准备 3 条 mock 路线。

跑测试：`npm test`（155 个用例，涵盖几何计算、难度评级、HTTP 接口、前端工具函数）

验证后端：`curl http://localhost:3000/api/health`

小程序端：用微信开发者工具打开 `miniprogram/` 目录，详情 → 本地设置 → 勾选「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/routes` | 路线列表（不含轨迹，体量小） |
| GET | `/api/routes/:id` | 路线详情，含轨迹与最近 10 条评论/路况 |
| POST | `/api/routes` | 上传路线，后端自动计算难度 |
| GET/POST | `/api/routes/:id/comments` | 评论（GET 默认最近 20 条） |
| GET/POST | `/api/routes/:id/road-conditions` | 路况提示（GET 默认最近 10 条） |

无鉴权，用户身份由请求头 `x-user-id` 传入，缺省用 `test-user-001`。

错误响应统一为 `{ error: { code, message } }`。

## 技术栈

微信小程序原生 ｜ Node.js + Express ｜ 高德地图小程序 SDK

（规划中：PostgreSQL + PostGIS，流程验证通过后接入。数据访问集中在 `server/src/repositories/`，换数据源不影响上层。）

## 开发工具建议

- 微信开发者工具 — 小程序端
- 任意编辑器 — 后端是 Node.js，IDEA 装 Node 插件也能用；VS Code 更顺手
