# 跑山路线小程序 —— MVP 实现任务

## 项目背景

面向车友的跑山路线分享+成绩记录微信小程序。本次实现范围覆盖以下模块：**路线库（含用户上传路线、难度评分）、开始跑山与算分（结算页只展示分数和排名，不展示时间/速度）、轻量社区（评论+路况提示）**。完整的多人可浏览排行榜列表页本次不做，"排名"只作为每次跑完结算页上的一个数字出现，不需要单独的榜单页面。

## 范围确认（已定）

- 车型：本次只支持**汽车**，代码里预留 `vehicleType` 字段方便后续扩展
- 平台：**微信小程序原生开发**（JS + WXML + WXSS）
- 路线初始数据：**手写 mock 路线**（含GPX坐标序列），同时要支持用户在小程序里上传新路线
- 不做登录系统，用固定测试 `userId`

## 技术栈

- 前端：微信小程序原生 + 高德地图微信小程序SDK（`@amap/amap-wx`）
- 后端：Node.js + Express
- 数据库：PostgreSQL + PostGIS（地理计算：区域判断、距离计算）
- 定时任务：node-cron（清理过期原始轨迹）

## 数据模型

### Route（路线）

```
id, name, vehicleType, distanceMeters,
startPoint { lat, lng, radiusMeters },
endPoint { lat, lng, radiusMeters },
waypoints [ { name, lat, lng } ],
referenceTrack [ { lat, lng, altitude } ],
uploadedBy (userId 或 "system" 表示mock数据),
curveCount, sharpCurveRatio, elevationGainMeters, roadWidth (enum: narrow/medium/wide, 上传时手动填),
difficultyStars (1-5, 自动计算),
createdAt
```

初始写 3 条 mock 路线（`uploadedBy: "system"`），坐标序列自己生成，落在中国境内某个合理地区、连续不跳点、长度5-15公里即可，不要求绝对真实。

### RunRecord（跑山记录）

```
id, userId(固定测试id), routeId, vehicleType,
rawTrackPoints (JSON数组: lat, lng, altitude, speed, timestamp),
status (recording/completed/invalid),
totalTimeSeconds (内部字段,不对外展示),
score (对外展示,0-1000),
rank (对外展示,该路线内的名次),
createdAt, expiresAt (createdAt + 72小时)
```

### Comment（路线评论）

```
id, routeId, userId, content, createdAt
```

### RoadCondition（路况提示）

```
id, routeId, userId, content, createdAt
```

## 功能实现要求

### 一、路线库

**1. 路线列表页**
- 展示所有路线（mock + 用户上传），每条显示：名称、距离、难度星级
- 点击进入详情页

**2. 路线详情页**
- 高德地图画出 `referenceTrack` 轨迹线，标注起点、终点、途经点
- 显示难度信息：弯道数、急弯占比、爬升高度、距离、路宽、综合星级
- 显示该路线下的评论列表和最近的路况提示（各显示最近10条，简单文字列表即可）
- 评论/路况提示各有一个输入框+提交按钮
- 一个"开始跑山"按钮

**3. 上传路线页**
- 用户在地图上依次点击生成一串坐标点作为 `referenceTrack`（用高德地图组件的点击事件采集坐标，不需要做拖拽编辑等复杂交互）
- 表单填写：路线名称、路宽（下拉选窄/中/宽）
- 提交后调用后端接口，后端根据坐标点自动计算 `distanceMeters`、`curveCount`、`sharpCurveRatio`、`elevationGainMeters`（若坐标没有海拔数据可默认为0）、`difficultyStars`
- 自动把 `referenceTrack` 的首尾两个点设为 `startPoint`/`endPoint`（半径默认给30米）
- 提交成功后直接跳转到路线详情页，不需要审核流程

**4. 难度计算逻辑（写成独立可测试函数）**
- 弯道数：遍历轨迹点，计算相邻三点构成的转向角，超过设定阈值（比如30度）记为一次转向，连续超过阈值的点合并为一个弯道区间，统计总弯道数；转向角超过更高阈值（比如60度）的算"急弯"，计算急弯占总弯道数的比例
- 爬升高度：轨迹点 `altitude` 字段的所有上升段累加（后一点比前一点高的部分累加，不是简单最大减最小）
- 距离：用 haversine 公式累加相邻点间距离
- 难度星级：简单规则映射即可，比如把"弯道数/公里"和"爬升/公里"各归一化到0-1，取平均值乘5四舍五入得到1-5星，不需要复杂模型，能跑通即可

### 二、开始跑山与算分

**1. 开始跑山前置弹窗**
- 单选，默认选中第一项：
  - "参与算分，原始轨迹数据72小时后自动清除"（默认）
  - "仅本机记录，不参与算分"

**2. 跑山中页面**
- `wx.onLocationChange` 持续采集定位点，采样间隔约2秒
- 实时显示已用时长、已采集点数
- 每次采集后判断是否进入终点区域（欧氏近似距离即可），进入则自动结束并提交轨迹；同时保留手动结束按钮
- 选"仅本机记录"模式的，结束后只在本机展示简单统计，不调用后端算分接口

**3. 后端算分接口 `POST /api/runs`**
- 入参：`routeId`, `vehicleType`, `trackPoints`, `dataMode`
- `dataMode` 为 `local_only`：不落库，直接返回，结束
- `dataMode` 为 `ranked`：
  1. 存储原始轨迹，设置 `expiresAt = now + 72小时`
  2. 轨迹匹配：找到轨迹中第一次进入 `startPoint` 区域的时间戳和之后第一次进入 `endPoint` 区域的时间戳，相减得到 `totalTimeSeconds`；若找不到完整匹配，返回错误"未检测到完整完成路线，本次不计入排名"
  3. 查询该路线所有历史有效记录的 `totalTimeSeconds`，计算这次成绩的百分位，`score = percentile * 1000`（四舍五入取整）
  4. 按 `totalTimeSeconds` 升序排列该路线所有记录，得到这条记录的名次 `rank`
  5. 保存并返回 `score` 和 `rank`

**4. 结果页**
- 只展示：**综合评分**（如"782分"）、**排名**（如"本路线第8名"）
- 不展示用时、速度、任何原始数值
- 一个"返回路线详情"按钮

**5. 定时任务**
每小时执行一次，把所有 `expiresAt < now` 的记录的 `rawTrackPoints` 字段清空（不删整条记录，`score`/`rank` 保留）

### 三、轻量社区

**1. `POST /api/routes/:id/comments`**：提交评论
**2. `GET /api/routes/:id/comments`**：获取该路线评论列表（最近20条，按时间倒序）
**3. `POST /api/routes/:id/road-conditions`**：提交路况提示
**4. `GET /api/routes/:id/road-conditions`**：获取该路线最近的路况提示（最近10条，按时间倒序）

评论和路况提示在路线详情页分两个区块展示，纯文字列表，不需要图片上传、点赞、回复等功能。

## 明确不做的部分

- 不做登录/账号系统
- 不做独立的多人可浏览排行榜/榜单页面（排名只在跑完结算页出现一次）
- 不做分段成绩、尾速计算
- 不做多维度综合评分（平稳度等），评分只按时间百分位计算
- 不做谷歌/百度地图接入，只用高德
- 不做摩托车/自行车逻辑
- 不做路线上传审核流程
- 不做评论/路况提示的点赞、回复、图片

## 验收标准

1. 能看到路线列表（3条mock + 后续上传的），进详情页能看到地图轨迹和难度信息
2. 能上传一条新路线（在地图上点几个点+填表单），提交后能在详情页看到自动算出的难度星级、弯道数等字段
3. 能在路线详情页发一条评论和一条路况提示，刷新后能看到
4. 点击开始跑山，选数据模式，模拟定位采集，到达终点或手动结束后，若选"参与算分"，结果页只显示分数和排名两个数字，界面上没有出现任何时间或速度数值
5. 后端记录里能确认 `expiresAt` 字段设置正确；手动把某条记录的 `expiresAt` 改到过去，跑一次定时任务，确认 `rawTrackPoints` 被清空但 `score`/`rank` 保留
