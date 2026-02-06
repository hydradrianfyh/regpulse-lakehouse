# RegPulse Lakehouse Demo (Ontology-First Regulatory Intelligence)

本仓库是一个**法规监测 + 本体治理 + 证据链追溯**的可运行 Demo，用于演示“以 Ontology 约束数据与模型输出，从源头减少幻觉”的合规智能工作流。它强调**数据血缘清晰、治理可审计、结构化可运营**，适合作为高层演示与工程落地的桥接样例。

---

**目录**
1. 目的与价值
2. 架构总览
3. 数据湖仓与本体治理
4. 本体与信源策略
5. 目录结构与核心文件说明
6. 前端功能总览
7. 安全与合规
8. 数据流图（ASCII）
9. 本地部署与运行
10. 免责声明

---

**1. 目的与价值**
- 目的：演示法规发现、结构化抽取、证据链追溯、向量检索与审查闭环。
- 价值：让法规情报从“噪声”变成可治理资产，形成可追溯、可审查、可运营的数据链路；把“LLM + 合规治理 + 可追溯数据资产”做成可运行的工程骨架。
- 意义：将 LLM 视为不稳定但高产的“候选生成器”；合规系统必须可回放、可审计、可追责；向量化让法规资产可检索/可RAG；**Ontology 强约束 + Review Queue**避免幻觉进入主数据层。
- 愿景：构建“合规情报湖仓”，让法律、工程、审计在同一语义层协作。

![Strategic Value](docs/images/Screenshot_2026-02-05_145139.png)

---

**2. 架构总览**
- 前端：`apps/web`（React + Vite）
- 后端：`services/api`（Fastify + TypeScript）
- 本体：`packages/ontology`
- 共享类型：`packages/shared`
- 数据层：PostgreSQL + pgvector
- 异步队列：Redis + BullMQ
- LLM：OpenAI API（结构化抽取、证据验证、web_search、向量化）
- 对象存储（本地）：`services/api/storage/objects`

---

**3. 数据湖仓与本体治理**
- 本 Demo 将主数据、向量、证据链统一落到 PostgreSQL + pgvector，形成轻量“湖仓”。
- Ontology（业务本体）作为**硬性约束层**：
  - 枚举强约束：状态/优先级/主题/影响域/来源类型必须落入本体。
  - Evidence 强约束：缺证据链不进主数据层。
  - Trust Tier 路由：Tier B/C/D 默认进入 Review Queue。
- 结果：**治理可审计、数据可追溯、流程可运营**。

---

**4. 本体与信源策略**
- Trust Tier：
  - `TIER_A_BINDING`：硬法根源，可直写主表
  - `TIER_B_OFFICIAL_SIGNAL`：官方信号，默认审查
  - `TIER_C_SOFT_REQ`：软性标准，仅软通道
  - `TIER_D_QUARANTINE`：情报源，强制隔离
- Monitoring Stages：
  - Drafting → Official → Comitology → Interpreting → Use&Registration
- 策略入口：
  - `services/api/config/trust-policy.json`

---

**5. 目录结构与核心文件说明**
- `apps/web/` 前端应用
- `services/api/` 后端 API 与作业
- `packages/ontology/` 本体定义与枚举
- `packages/shared/` 前后端共享 DTO 与类型

关键文件（只列核心）：
- `services/api/src/services/scan.ts` 扫描与结构化抽取入口（含 web_search 逻辑）
- `services/api/src/services/vectorize.ts` 向量化（多段切分：3000/overlap 300/max 30）
- `services/api/src/services/merge.ts` 合并与覆盖矩阵
- `services/api/src/ontology/validator.ts` 本体校验与证据链硬校验
- `services/api/src/ontology/policy.ts` 信源策略与路由
- `services/api/src/connectors/` 连接器（EU News / GlobalAutoRegs / Generic）
- `services/api/src/connectors/fetcher.ts` 抓取器（UNECE 头增强、GAR 速率控制）
- `services/api/src/storage/object-store.ts` 原件落库与下载
- `services/api/src/storage/gar-index.ts` GAR 下载断点续跑索引
- `services/api/src/lineage.ts` 血缘图谱构建（URL 优先去重）
- `services/api/src/repository.ts` 数据访问层
- `services/api/src/index.ts` API 路由
- `services/api/src/worker.ts` BullMQ worker 入口
- `apps/web/src/components/` 前端页面组件
- `scripts/dev-all.ps1` Windows 一键启动
- `scripts/dev-all.sh` macOS/Linux 一键启动

---

**6. 前端功能总览**
- 仪表盘：统计、分布、趋势
- 扫描与向量化：配置扫描窗口、触发采集
- 归并与雷达：覆盖矩阵与合并视图
- 运行监控：实时进度日志 + 文档卡片
- 法规条目浏览：主表 + Review Queue 切换
- Review Queue：审查通过/拒绝闭环
- Ontology Browser：本体枚举可视化
- Lineage Graph：血缘关系可视化（去重）
- Vector Store 管理：向量库统计与清理

---

**7. 安全与合规**
- OpenAI Key 仅在后端配置，前端不直连。
- 只允许白名单域名抓取，尊重 `robots.txt`。
- Evidence 缺失则拒绝入库。
- 低置信度或非本体字段进入 Review Queue。

---

**8. 数据流图（ASCII）**
```
Sources (whitelist)
   |
   v
Connectors / web_search
   |
   v
SourceDocument -----> Vectorize (chunking) -----> pgvector
   |
   v
LLM Extract (JSON Schema)
   |
   v
Ontology Validate
   |                     \
   |                      -> Review Queue (Tier B/C/D)
   v
Main Tables (RegulationItem)
   |
   v
Merge -> Requirement / DataGap
   |
   v
Lineage Graph
```

![System Dataflow](docs/images/deepseek_mermaid_20260205_91e63a.png)

---

**9. 本地部署与运行**
前置条件：
- Node.js 18+（推荐 20+）
- Docker Desktop（用于 PostgreSQL/Redis）

快速启动（推荐）：
```
# Windows
npm run dev:all

# macOS / Linux
bash scripts/dev-all.sh
```
脚本会：
- 检查 node/npm/docker 等依赖
- 自动安装缺失依赖（如允许）
- 检查 Docker daemon（需手动启动 Docker Desktop）
- 自动拉起 `regpulse-postgres` / `regpulse-redis`
- 启动 API + Worker + Web
- 日志输出到 `logs/`

手动启动数据库与缓存：
```
docker run --name regpulse-postgres -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=regpulse -p 5432:5432 -d pgvector/pgvector:pg16
docker run --name regpulse-redis -p 6379:6379 -d redis:7
```

环境变量：
```
services/api/.env
OPENAI_API_KEY=你的key
OPENAI_MODEL=gpt-5.2
DATABASE_URL=postgres://user:password@localhost:5432/regpulse
REDIS_URL=redis://localhost:6379

# 可选：GAR/UNECE 抓取增强
GAR_RATE_LIMIT_RPS=1
GAR_USER_AGENT=...
GAR_RETRY_COOLDOWN_MINUTES=0
UNECE_USER_AGENT=...
UNECE_COOKIE=...
UNECE_REFERER=...
```

分别启动（可选）：
```
npm run dev:api
npm run dev:worker
npm run dev
```

访问：
- Web: http://localhost:5173
- API: http://localhost:8080/api/config

---

**10. 免责声明**
本仓库仅用于演示与学习，不构成法律意见。  
模型输出可能存在误差，必须通过人工审查与证据验证。  
请确保遵守数据来源网站的条款与 `robots.txt` 规则。  
严禁将本 Demo 直接用于生产或合规决策场景。
