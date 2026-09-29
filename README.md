# TopTouge

跑山路线分享 + 成绩记录微信小程序。

## 文档体系

| 文档 | 定义 | 什么时候看 |
|---|---|---|
| [需求规格说明书](./docs/需求规格说明书.md) | **做什么** | 想知道某功能该不该有、验收标准是什么 |
| [产品设计](./docs/产品设计/) | **长什么样、怎么用**（按模块拆分） | 改页面、改交互、改文案 |
| [架构与技术设计](./docs/架构与技术设计.md) | **怎么做** | 改代码、加接口、调算法 |
| [项目管理](./docs/项目管理.md) | **谁在做、做到哪了** | 领任务、同步进度、看关键路径 |
| [如何继续开发](./docs/如何继续开发.md) | **怎么上手**：worktree 用法、会话恢复、提交规范 | 新接手、换机器、找不到上下文 |

开发按**七步流程**推进（需求 → 产品设计 → 代码实现 → 单测自验 → 真机验证 → 部署验证 → 发布），每一步的任务表在项目管理文档里，可增删改、可多人并行。

## 架构图

- [应用架构图](./docs/diagrams/application-architecture.svg)
- [技术架构图](./docs/diagrams/technical-architecture.svg)
- [部署架构图](./docs/diagrams/deployment-architecture.svg)

## 当前进度

详见 [项目管理.md 的里程碑总览](./docs/项目管理.md#二里程碑总览)。摘要：

**阶段一：路线库**（已完成）

- 路线列表 / 详情 / 上传 / 录制轨迹生成路线
- 难度自动计算（弯道数、急弯占比、爬升、星级）
- 评论 + 路况提示
- 三维筛选（省市 / 难度 / 路型）+ 四种排序（热度 / 长度 / 距离 / 最新）

**阶段二：跑山与算分**（已完成）

- 实时轨迹采集、暂停 / 继续、到达终点自动结束
- 成绩按用时百分位算分，72 小时后自动清空原始轨迹（成绩保留）
- 榜单 / 我的成绩 / 结果页

**产品化功能**（已完成）

- 首页活动位（人工活动 + 算法位）、跑山活动页、收藏、用户资料（昵称头像）、
  版主工作台与路线审核
- 路线重合度：上传时查重、相似路线推荐
- 地点搜索历史：搜过/选过的地点存本地，下次点搜索框直接选

## 错误处理约定

**技术细节永远不给用户看。** 用户看到「无法连接服务器（errMsg: xxx）」
只会觉得产品不专业，而且他既看不懂也做不了什么。

| 谁看 | 看什么 | 在哪 |
|---|---|---|
| 用户 | 一句白话（「网络开小差了，请稍后再试」） | `wx.showToast` / 页面错误态 |
| 管理员 | 完整细节：URL、错误码、errMsg、页面、机型、版本 | `client_errors` 表 |

上报由 `miniprogram/utils/errorReporter.js` 负责：静默发送，失败进本地队列
下次补发，**绝不抛错也不阻塞主流程**。查错误直接看 `client_errors` 表：

```sql
SELECT created_at, code, message, page, url, model, system
  FROM client_errors ORDER BY id DESC LIMIT 50;
```

改代码时注意：`.catch(err => showToast(err.message))` 这种写法要改成
展示固定白话 + `reporter.report({ detail: err.detail })`。

**数据源**：微信云托管 + MySQL。也支持 `DATA_SOURCE=memory` 纯内存模式，
用于本地开发和跑测试。数据访问集中在 `server/src/repositories/` 一层，
两种模式在同一文件内双实现，`services` 和 `routes` 不感知数据从哪来。

## 后端地址怎么切

`miniprogram/utils/env.js` 按**运行版本**自动选择：

| 运行版本 | 后端 |
|---|---|
| 开发版（开发者工具 / 真机调试） | 本地直连 `localhost:3000` |
| 体验版 / 正式版 | 微信云托管 |

这样本地改代码立刻生效，不用每次重新部署云托管。

---

## 你需要准备

> 这几项的进度跟踪在 [项目管理.md 步骤⑦发布](./docs/项目管理.md#九步骤⑦-发布)（编号 L-02 ~ L-04）。

### 1. 微信小程序 AppID

填到 `miniprogram/project.config.json` 的 `appid` 字段。高德申请 key 要求真实 AppID。

### 2. 高德开放平台 Key

到 [console.amap.com](https://console.amap.com) → 应用管理 → 创建应用：
- 服务平台选 **微信小程序**
- 填写上面拿到的 AppID
- 拿到 Key 后写进 `miniprogram/utils/amap.js`

### 3. 高德 SDK 文件（需要手动下载）

到高德控制台「我的应用」→ 下载 **微信小程序 SDK**，把 `amap-wx.130.js` 放到：

```
miniprogram/libs/amap-wx.130.js
```

这个文件有版权限制，不代为下载。

---

## 本地启动

```bash
cd server
npm install
cp .env.example .env   # 按需填数据库连接；不填则用内存模式
npm run dev            # http://localhost:3000
```

跑测试：`npm test`。测试环境**强制走内存**，不会碰真实数据库。

验证后端：`curl http://localhost:3000/api/health`

小程序端：用微信开发者工具打开 `miniprogram/` 目录，详情 → 本地设置 →
勾选「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（`/api/health/ready` 会探一次数据库） |
| GET | `/api/routes` | 路线列表，支持省市/难度/路型筛选与排序 |
| GET | `/api/routes/:id` | 路线详情，含轨迹、最近 10 条评论/路况、收藏状态 |
| GET | `/api/routes/:id/ranking` | 成绩榜 |
| GET | `/api/routes/:id/similar` | 相似路线（按轨迹重合度） |
| POST | `/api/routes` | 上传路线，后端自动计算难度 |
| POST | `/api/routes/check-duplicate` | 上传前查重 |
| GET/POST | `/api/routes/:id/comments` | 评论 |
| GET/POST | `/api/routes/:id/road-conditions` | 路况提示 |
| GET | `/api/banners` | 首页活动位（人工活动 + 算法位） |
| GET | `/api/banners/activities` | 跑山活动（只要人工活动） |
| POST | `/api/client-errors` | 客户端错误上报 |
| POST | `/api/runs` | 提交跑山成绩 |
| GET | `/api/me/*` | 我的成绩 / 路线 / 收藏 / 资料 / 版主身份 |
| GET/POST | `/api/moderator/*` | 版主审核 / 置顶 / 下架 / 活动 |

身份：线上由云托管自动注入 `X-WX-OPENID`；本地开发用 `x-user-id` 请求头，
缺省回落到 `test-user-001`。

错误响应统一为 `{ error: { code, message } }`。

## 定时任务

| 任务 | 频率 | 作用 |
|---|---|---|
| 轨迹清理 | 每小时第 7 分钟 | 清空 72 小时前的原始轨迹，成绩保留 |
| 热度重算 | 每小时第 37 分钟 | 按最近 30 天的跑山/收藏/评论数重算热度 |

## 技术栈

微信小程序原生 ｜ Node.js + Express ｜ MySQL（微信云托管）
｜ 高德地图小程序 SDK ｜ 几何计算走应用层纯函数，不依赖 PostGIS

## 开发工具建议

- 微信开发者工具 — 小程序端
- 任意编辑器 — 后端是 Node.js，IDEA 装 Node 插件也能用；VS Code 更顺手

