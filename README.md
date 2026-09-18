# 校园集市 · 微信小程序

> 一个基于 **微信原生小程序 + 微信云开发（CloudBase）** 的校园二手交易 / 学习资料流转平台。
> 零服务器运维，全部能力托管在微信云上：云函数、云数据库、云存储。

<p align="center">
  <em>原生小程序 · 云开发 · 无服务器 · 完整业务闭环</em>
</p>

---

## ✨ 项目亮点

- **无服务器架构**：23 个云函数 + 云数据库 + 云存储，无需自建后端，个人开发者可独立完成从 0 到上线
- **完整交易闭环**：浏览 → 搜索/分类筛选 → 收藏 → 站内私聊 → 线下成交
- **校园信任体系**：学号规则自动校验的**校内实名认证**，认证用户展示专属标识，敏感字段前端永不展示
- **UGC 合规**：接入微信官方**内容安全 API**（文本 `msgSecCheck` + 图片 `mediaCheckAsync`），满足社交/笔记类目审核强制要求
- **社区治理**：多用户举报达阈值自动隐藏、黑名单、管理员后台（删帖/下架/统计/认证审核/举报处理）
- **实时私聊**：基于云数据库 `watch` 的实时消息推送，未读红点、会话列表、历史分页
- **多维度体验**：多维度排序（最新/最热/低价/高价）、价格快捷档、明暗主题、分享海报生成

---

## 🧱 技术栈

| 层 | 技术 |
|---|---|
| 前端 | 微信原生小程序（WXML / WXSS / JS），自定义 tabBar，组件化页面 |
| 后端 | 微信云开发云函数（Node.js），`wx-server-sdk` |
| 数据库 | 云开发数据库（NoSQL 文档型，集合：`goods` / `users` / `favorites` / `conversations` / `messages` / `reports` / `auths` …） |
| 存储 | 云存储（商品图片） |
| 安全 | 微信内容安全 API、openid 维度的数据隔离、云函数内鉴权 |

---

## 📐 架构概览

```
┌───────────────────────────┐
│      小程序前端 (WXML/JS)   │
│  首页/详情/发布/求购/私聊/我的 │
└──────────────┬────────────┘
               │  wx.cloud.callFunction
┌──────────────▼────────────┐
│      云函数层（23 个）       │
│  login / publish / getList  │
│  getDetail / favorite / chat│
│  report / admin / auth ...  │
└──────┬───────────────┬─────┘
       │               │
┌──────▼──────┐  ┌─────▼──────┐
│  云数据库     │  │  云存储     │
│  goods/users │  │  商品图片    │
│  messages... │  │            │
└─────────────┘  └────────────┘
       │
┌──────▼───────────────────────┐
│  微信官方内容安全 API          │
│  msgSecCheck / mediaCheck    │
└──────────────────────────────┘
```

---

## 📁 目录结构

```
campus-market-wechat/
├─ miniprogram/                 # 小程序前端
│  ├─ app.js                    # 入口：云开发初始化 + 全局配置
│  ├─ app.json                  # 页面注册 + 自定义 tabBar
│  ├─ custom-tab-bar/           # 自定义底部导航（含未读红点）
│  └─ pages/
│     ├─ index/                 # 首页：列表 + 搜索 + 多级分类 + 排序
│     ├─ detail/                # 商品详情（收藏/私聊/举报）
│     ├─ publish/ edit/         # 发布 / 编辑（图片上传）
│     ├─ want/ want-publish/ want-detail/  # 求购板块
│     ├─ chat-list/ chat/       # 站内私聊（实时）
│     ├─ my-posts/ my-favorites/ history/ blacklist/
│     ├─ seller/                # 卖家主页
│     ├─ auth/                  # 校内认证
│     ├─ report/                # 举报
│     ├─ admin/                 # 管理后台
│     ├─ poster/                # 分享海报
│     └─ mine/ agreement/       # 个人中心 / 协议
└─ cloudfunctions/              # 云函数（23 个）
   ├─ login/ auth/ admin/       # 认证与权限
   ├─ publish/ updatePost/ updateStatus/
   ├─ getList/ getDetail/ search/ getSeller/ getQrcode/
   ├─ favorite/ getFavorites/ want/ getMyPosts/ getMyFlowers/
   ├─ chat/ chatEntry/ report/ blacklist/ sendFlower/ getContact/
   └─ */sec.js                  # 内容安全公共模块（文本 + 图片检测）
```

---

## 🚀 本地运行

### 1. 前置
- 注册微信小程序账号，安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
- 用**你自己的 AppID** 创建项目（测试号不支持云开发）

### 2. 开通云开发
开发者工具顶部「云开发」→ 开通 → 创建环境 → 记下**环境 ID**。

### 3. 改 3 处配置
| 文件 | 改什么 |
|---|---|
| `project.config.json` | `"appid"` → 你的 AppID |
| `miniprogram/app.js` | `wx.cloud.init({ env: 'your-cloud-env-id' })` → 你的环境 ID |
| `cloudfunctions/admin/index.js` | `ADMIN_OPENIDS` 数组 → 你的 openid |

### 4. 建数据库集合
云开发控制台 → 数据库，新建：`goods`、`users`、`favorites`、`conversations`、`messages`、`reports`、`auths`
（权限：所有用户可读，仅创建者可写；云函数拥有 admin 权限不受限）

### 5. 部署云函数
对 `cloudfunctions/` 下每个目录右键 →「上传并部署：云端安装依赖」。

### 6. 编译预览
工具栏「编译」即可在模拟器运行；「预览」真机扫码体验完整流程。

---

## 🔐 安全设计说明

- **openid 隔离**：所有数据按调用者 `openid` 校验，聊天/联系方式仅双方可见
- **敏感字段保护**：学号等隐私字段仅管理员可读，前端永不返回
- **内容合规**：文本违禁直接拦截发布，图片异步检测（30 分钟内推送结果，违规由后台下架）
- **举报兜底**：同一内容被 N 个不同用户举报自动隐藏，保留现场待管理员复核

> ⚠️ 本仓库为**示例/演示版本**，所有 AppID、云环境 ID、管理员 openid 均已替换为占位符（`wxYOUR_APPID_HERE` / `your-cloud-env-id` / `your-admin-openid`）。使用前请替换为你自己的配置。

---

## 🔮 后续规划

- 站内担保交易 + 微信支付（需企业/个体户主体）
- 卖家信用评价体系
- 分类维度细分、图片数量上限配置

---

## 📄 许可

本项目基于 [MIT License](./LICENSE) 开源，欢迎学习交流与参考。
