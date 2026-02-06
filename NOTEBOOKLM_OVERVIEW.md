# RegPulse Lakehouse Demo — NotebookLM 导读文档

本文档用于在 NotebookLM 中理解该仓库的整体架构、数据流、功能边界与使用方式。内容以“产品说明 + 工程说明 + 治理说明”为主，覆盖前后端、数据层、本体治理与关键流程。

---

**1. Demo 的目标与价值**
该 Demo 展示一个“法规情报与合规治理”的端到端系统，核心目标：
1. 自动发现法规与监管信号
2. 结构化抽取为可治理的数据实体
3. 通过 Ontology 约束防止幻觉与错误入库
4. 证据链可追溯，条目可回放

价值：
1. 提前发现法规变化与早期信号
2. 形成可运营的法规数据资产（不是“摘要集合”）
3. 通过信任分层 + 审核降低模型风险
4. 可扩展到企业级“湖仓 + 本体治理”架构

---

**2. 系统架构（简述）**
- 前端 `apps/web`：展示、配置、运行监控、审查、血缘图谱
- 后端 `services/api`：连接器、任务队列、抽取与治理
- 本体 `packages/ontology` 与共享 `packages/shared`
- 数据库：PostgreSQL + pgvector
- 队列：Redis + BullMQ

核心理念：**所有进入主数据层的内容必须通过 Ontology 约束与证据链校验**。

---

**3. 关键流程**
1. **发现/扫描**：连接器 + web_search 获取候选
2. **下载原件**：GAR 专用抓取器下载原件到对象存储（本地）
3. **结构化抽取**：LLM + JSON Schema 输出 RegulationItem
4. **本体校验**：字段/枚举/证据链不合规则进入 Review Queue
5. **向量化**：多段切分写入 pgvector
6. **归并**：生成 Requirement / DataGap / 雷达表
7. **血缘图谱**：按 URL 去重，保持图谱稳定

---

**4. 前端主要页面**
- ScanPanel：配置扫描与触发采集
- RunMonitor：实时日志 + 文档卡片
- ItemBrowser：法规条目浏览（主表 + Review Queue）
- ReviewQueue：审查通过/拒绝
- MergePanel：归并与雷达表
- LineageGraph：血缘图谱
- OntologyBrowser：本体枚举

> ScanPanel 是“发起扫描”；RunMonitor 是“展示实时进度与文件卡片”。

---

**5. GlobalAutoRegs 专用抓取**
GAR 采用“索引 → 下钻 → 原件落库”的固定流程：
1. 索引页：
   - `https://globalautoregs.com/documents?show=week`
   - `https://globalautoregs.com/modifications?year=2024|2025|2026`
2. 详情页：解析结构化字段（Title/Reference/Meeting/Date/Relevant To）
3. 下载区：优先使用 GAR server 原件（若存在则跳过 UNECE）
4. 原件落库：计算 SHA-256 → 存入 `services/api/storage/objects`
5. 断点续跑索引：`services/api/storage/gar-download-index.json`

---

**6. 运行监控日志（Run Logs）**
`run_logs` 表驱动 Run Monitor 实时进度，典型阶段：
1. `search` 发现候选
2. `download` 下载原件
3. `ingest` 原件入库
4. `triage` 分诊/抽取
5. `extract` 抽取完成
6. `complete` 采集完成

---

**7. Ontology 与治理策略**
- Trust Tier：A/B/C/D 四层
- Monitoring Stage：Drafting → Official → Comitology → Interpreting → Use&Registration
- 治理规则：非白名单 / 低置信度 / 缺证据链 → Review Queue
- 配置入口：`services/api/config/trust-policy.json`

---

**8. 主要 API**
- `POST /api/runs/scan` 启动扫描
- `POST /api/runs/merge` 启动归并
- `GET /api/items` 主表条目
- `GET /api/review-queue` 审查队列
- `POST /api/review-queue/:id/approve` 通过审查
- `GET /api/runs/:id/logs` 运行日志
- `GET /api/runs/:id/documents` 文档卡片
- `GET /api/files/:id` 下载原件

---

**9. 关键数据库表**
- `source_documents` 原始文档元数据 + 原件
- `regulation_items` 结构化条目
- `review_queue` 审查队列
- `vector_chunks` 向量块
- `runs` / `run_logs` 运行记录与日志

---

**10. 本地运行（建议）**
```
# Windows
npm run dev:all

# macOS / Linux
bash scripts/dev-all.sh
```

---

**11. 常见问题**
1. EUR-Lex 404：使用 `/oj/direct-access.html`
2. UNECE 403：增加 `UNECE_USER_AGENT/COOKIE/REFERER`
3. GAR 下载失败：检查 `GAR_USER_AGENT` 和 `GAR_RETRY_COOLDOWN_MINUTES`

---

**12. 风险与免责声明**
- Demo 仅用于演示，不构成法律意见
- 外部网站可能有反爬或临时变更
- 所有模型输出必须人工复核

---

**NotebookLM 推荐提问方向**
1. “Ontology 的实体关系如何约束输出？”
2. “数据血缘如何建立？”
3. “GAR 抓取如何保证证据链？”
4. “Review Queue 的作用是什么？”

---

**结束**
你可以直接把本文件上传到 NotebookLM 作为知识库说明。
