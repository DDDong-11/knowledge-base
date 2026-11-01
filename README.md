# 个人开发知识库

本地离线代码片段管理器：Electron（视图层 + 插件宿主）+ Spring Boot（数据内核 + 检索），本地 HTTP 通信。

设计见 docs/mvp-design.md。

边界：**Electron 不管数据、Java 不管 UI**。渲染进程不直连内核（无 CORS）；一律经 preload → 主进程 → HTTP。

## Java 内核（java-kernel）

Spring Boot 3.5 + H2（嵌入式文件库）+ Spring Data JPA。只监听 `127.0.0.1`，不开 CORS，供 Electron 主进程通过本地 HTTP 调用。

### 运行

需要 JDK 17+（Maven 用自带的 wrapper 即可）。

```bash
cd java-kernel
./mvnw test                 # 跑测试（测试 profile 用内存 H2）
./mvnw spring-boot:run      # 开发运行（不设 KB_TOKEN 时不过滤）
# 或打包后运行
./mvnw -DskipTests package
java -jar target/kb-kernel-0.1.0-SNAPSHOT.jar
```

配置项（环境变量或 `--key=value`）：

| 配置 | 环境变量 | 默认值 |
| --- | --- | --- |
| `server.port` | `KB_PORT` | `17321`；Electron 启动时传 `0` 表示由内核选空闲端口 |
| `kb.data-dir` | `KB_DATA_DIR` | `~/.knowledge-base/data`（库文件 `kb.mv.db`） |
| `kb.token` | `KB_TOKEN` | 空：不校验；非空：`/api/**` 必须带匹配的 `X-KB-Token` |
| `kb.port-file` | `KB_PORT_FILE` | 空：不写文件；非空：就绪后把实际端口写入该路径（纯文本） |
| `server.address` | — | `127.0.0.1`（不要改成 0.0.0.0） |

就绪时标准输出会打印一行：`KB_READY port=<n>`（便于排查）。

表结构见 `src/main/resources/schema.sql`，Hibernate 只做 `validate`。

### HTTP API（`/api/**` 稳定契约）

> **契约约定**：`/api/**` 是内核对外的稳定契约（Electron、后续 Alma 等插件都依赖它）。
> 只允许**向后兼容**的修改（新增可选参数、新增响应字段）。任何**破坏性修改**（删/改字段名、改类型、改语义、改错误码）
> 必须升 API 版本（如新增 `/api/v2/**`）并同步更新本 README。客户端应忽略不认识的响应字段。

所有接口前缀 `http://127.0.0.1:<port>`，请求/响应均为 JSON（UTF-8）。

当设置了 `KB_TOKEN` 时，**包括** `GET /api/health` 在内的所有 `/api/**` 请求都必须带请求头：

```http
X-KB-Token: <与 KB_TOKEN 相同的值>
```

否则返回 `401`，`error` 为 `UNAUTHORIZED`。

| 方法 | 路径 | 参数 | 成功响应 |
| --- | --- | --- | --- |
| GET | `/api/health` | — | 200 `{"status":"UP","app":"kb-kernel"}` |
| POST | `/api/snippets` | 请求体见下 | 201 + `Location` + Snippet |
| GET | `/api/snippets/{id}` | — | 200 Snippet；不存在 404 |
| PUT | `/api/snippets/{id}` | 请求体见下 | 200 Snippet，刷新 `updateTime`；不存在 404 |
| DELETE | `/api/snippets/{id}` | — | 204；不存在 404 |
| GET | `/api/snippets` | `page`（≥0，默认 0）、`size`（1–100，默认 20）、`kind`（可选） | 200 分页，按 `updateTime` 倒序 |
| GET | `/api/snippets/search` | `q`（必填，非空，≤200）、`limit`（1–200，默认 50）、`kind`（可选） | 200 搜索结果 |
| GET | `/api/tags` | — | 200 `["docker","git",...]`（去重、小写、排序） |

#### 枚举

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `kind` | `CODE` / `NOTE` / `CLIP` | 代码 / 笔记 / 摘录。新建缺省 `NOTE` |
| `source` | `MANUAL` / `CLIPBOARD` / `ALMA` | 条目来源。新建缺省 `MANUAL`；**创建后不可修改** |

枚举**区分大小写**（`code` 非法）。非法值一律 400 `BAD_REQUEST`，`message` 形如
`invalid value 'code' for kind; allowed: CODE, NOTE, CLIP`（查询参数与请求体都一样）。

#### 请求体（POST / PUT）

```json
{ "title": "Docker 清理", "content": "docker system prune -af", "tags": ["docker", "shell"], "kind": "CODE", "source": "MANUAL" }
```

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `title` | string | 必填（非空白），≤200 字符 |
| `content` | string | 可选，≤1,000,000 字符 |
| `tags` | string[] | 可选，≤20 个、每个 ≤40 字符；会拆分半角/全角逗号、trim、去空、大小写不敏感去重 |
| `kind` | enum | 可选。POST 缺省 `NOTE`；**PUT 缺省表示保留原值**（老客户端不会把类型冲掉） |
| `source` | enum | 可选，仅 POST 生效；PUT 中忽略。Electron 主进程会丢弃 UI 传来的 `source`，面板新建的条目恒为 `MANUAL` |

PUT 对 `title`/`content`/`tags` 是全量覆盖。

#### Snippet（响应）

```json
{ "id": 1, "title": "Docker 清理", "content": "docker system prune -af", "tags": ["docker", "shell"],
  "kind": "CODE", "source": "MANUAL",
  "createTime": "2026-11-02T10:00:00", "updateTime": "2026-11-02T10:00:00" }
```

分页响应：`{ "items": [Snippet...], "page": 0, "size": 20, "totalElements": 1, "totalPages": 1 }`

搜索响应：

```json
{ "query": "docker", "total": 1,
  "hits": [ { "snippet": { "id": 1, "title": "...", "...": "..." },
              "score": 166.0, "matchedFields": ["title", "tags", "content"] } ] }
```

- 按空白拆词，所有词都要命中（AND），大小写不敏感，`%`/`_` 按字面匹配；`kind` 与关键词是 AND 关系。
- 打分：标题命中 100（完全相等 +50，前缀 +20）> 标签命中 40（部分 20）> 正文 5+出现次数（最多 +5）；同分按更新时间倒序。
- 实现在 `search/LikeSearchService`，实现了 `SearchService` 接口，后续换成 Lucene 只需替换实现。

#### 错误

统一错误体：

```json
{ "timestamp": "...", "status": 400, "error": "VALIDATION_FAILED",
  "message": "request validation failed", "path": "/api/snippets",
  "fieldErrors": [ { "field": "title", "message": "title is required" } ] }
```

| `error` | HTTP | 场景 |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | 请求体字段校验失败，带 `fieldErrors` |
| `BAD_REQUEST` | 400 | 查询参数越界/缺失、非法枚举值等 |
| `MALFORMED_REQUEST` | 400 | JSON 无法解析 |
| `UNAUTHORIZED` | 401 | 设置了 `KB_TOKEN` 但缺少或不匹配 `X-KB-Token` |
| `NOT_FOUND` | 404 | id 不存在或路径不存在 |
| `METHOD_NOT_ALLOWED` | 405 | 方法不支持 |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | 请求体不是 `application/json` |
| `INTERNAL_ERROR` | 500 | 未预期异常（不泄露堆栈） |

#### 数据库迁移

`schema.sql` 每次启动执行且幂等：老库（第 4 步前创建、无 `kind`/`source` 列）会被 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 补列，
旧数据回填为 `NOTE` / `MANUAL`。Hibernate 只做 `validate`。

#### curl 示例

```bash
P=17321   # 单独跑 Java 时的默认端口；设置了 KB_TOKEN 时每条都加 -H "X-KB-Token: $KB_TOKEN"
curl -s localhost:$P/api/health
curl -s -X POST localhost:$P/api/snippets -H 'Content-Type: application/json' \
  -d '{"title":"Docker 清理","content":"docker system prune -af","tags":["docker"],"kind":"CODE"}'
curl -s "localhost:$P/api/snippets?size=20&kind=CODE"
curl -s "localhost:$P/api/snippets/search?q=docker&kind=CODE&limit=50"
curl -s -X PUT localhost:$P/api/snippets/1 -H 'Content-Type: application/json' \
  -d '{"title":"Docker 清理","content":"docker system prune -af","tags":["docker","ops"]}'   # 不带 kind → 保持 CODE
curl -s -X DELETE -o /dev/null -w '%{http_code}\n' localhost:$P/api/snippets/1           # 204
curl -s "localhost:$P/api/snippets?kind=code"                                            # 400 BAD_REQUEST
```

## Electron 菜单栏面板（electron）

TypeScript + Electron 33 + React 19 + Vite 8。macOS 上是**菜单栏常驻应用**（不显示 Dock 图标）：左键点击菜单栏书本图标弹出/收起 360×480 无边框面板（失焦自动隐藏），右键弹出菜单（打开面板 / 退出）。
主进程负责：生成一次性令牌、以 `KB_PORT=0` 拉起内核 jar、轮询 `KB_PORT_FILE`、带 `X-KB-Token` 调 HTTP、校验 IPC 参数、退出时结束 Java 子进程。
渲染层（`src/renderer`）只做 UI，所有数据经 `window.kb` → 主进程 → 内核。

面板功能：搜索（200ms 防抖，空查询显示最近更新 20 条）、类型筛选（全部/代码/笔记/摘录）、一键复制（复制后显示「已复制」并自动收起）、
新建/编辑/删除（二次确认）、字段级错误提示、底部内核状态与端口；「最近复制」为占位（即将推出）。

键盘：`↑`/`↓` 选择，`Enter` 复制选中项，`Esc` 先清空搜索、再按一次收起面板；编辑页 `Esc` 返回列表。

### 运行

需要 **Node.js ≥ 22.12**（Vite 8 要求 `^20.19 || >=22.12`，本项目取 22.12+）、JDK 17+。

```bash
cd java-kernel && ./mvnw -DskipTests package   # 先打出 jar（或在 electron/ 下 npm run package-kernel）
cd ../electron
npm install
npm test            # 编译 + 主进程单测（node:test）+ 渲染层组件测试（vitest）
npm run typecheck   # 主进程 / 渲染层两套 tsconfig
npm start           # 构建并启动：菜单栏出现图标，点击弹出面板
```

若 `npm install` 后启动报 `Electron failed to install correctly`（npm 新版本可能跳过 electron 的 postinstall），执行一次：

```bash
node node_modules/electron/install.js
```

环境变量：

| 变量 | 作用 |
| --- | --- |
| `KB_PANEL_PIN=1` | 面板失焦不隐藏，便于调试（可配合 DevTools） |
| `KB_RENDERER_URL=http://127.0.0.1:5173` | 从 Vite dev server 加载渲染层（另开终端 `npm run dev:renderer`）；只接受 `http://localhost` / `http://127.0.0.1` |

非 macOS（Linux/Windows）上启动时会直接显示面板（托盘行为因桌面环境而异）。

数据目录默认在 Electron `userData/kernel-data`（由主进程设置 `KB_DATA_DIR`），与单独跑 Java 时的 `~/.knowledge-base/data` 分开，避免抢 H2 文件锁。

`npm run gen-icon` 可重新生成菜单栏模板图标 `assets/trayTemplate.png`（16px）/ `trayTemplate@2x.png`（32px）。

### IPC 契约（内部，`window.kb`）

渲染进程开启 `sandbox` + `contextIsolation`，只能用 preload 暴露的 `window.kb`。每个方法返回信封
`{ ok: true, data } | { ok: false, error: { status, error, message, fieldErrors? } }`（不抛异常，因为错误对象跨 IPC 会丢失自定义属性）。
类型唯一来源：`src/shared/kbApi.ts`。

| 方法 | 通道 | 说明 |
| --- | --- | --- |
| `health()` | `kb:health` | 内核探活 |
| `meta()` | `kb:meta` | `{ port }` |
| `search(q, { kind?, limit? })` | `kb:search` | `q` 非空 ≤200；`limit` 默认 50 |
| `listSnippets({ page?, size?, kind? })` | `kb:listSnippets` | |
| `getSnippet(id)` | `kb:getSnippet` | `id` 正整数 |
| `createSnippet(body)` | `kb:createSnippet` | 主进程丢弃 `source` |
| `updateSnippet(id, body)` | `kb:updateSnippet` | 同上 |
| `deleteSnippet(id)` | `kb:deleteSnippet` | `data` 为 `null` |
| `copyText(text)` | `kb:copyText` | 写系统剪贴板 |
| `hidePanel()` | `kb:hidePanel` | 收起面板 |
| `onPanelShown(cb)` | `kb:panelShown`（主→渲染） | 面板每次显示时回调，返回取消订阅函数 |

主进程错误映射：

| 情况 | `status` | `error` |
| --- | --- | --- |
| 非面板页面发来的调用 | 403 | `FORBIDDEN` |
| 参数校验失败 | 400 | `INVALID_ARGUMENT` |
| 内核尚未就绪 | 503 | `KERNEL_UNAVAILABLE` |
| 内核返回非 2xx | 透传 | 透传内核的 `error` / `fieldErrors` |
| 连接失败等其他异常 | 503 | `KERNEL_UNREACHABLE` |

### Mac 手动冒烟清单

1. `npm start` 后 Dock 中**没有**图标，菜单栏出现书本图标（深色/浅色菜单栏下都清晰）。
2. 点击图标 → 面板出现在图标正下方，搜索框已聚焦；底部显示「内核正常 · 端口 N」。
3. 点 ＋ 新建一条（标签用中文逗号分隔、类型选「代码」）→ 保存后回到列表并出现该条。
4. 标题留空保存 → 标题下方出现 `title is required`。
5. 输入关键词 → 结果实时过滤；点「代码」只剩代码条目。
6. `↓` + `Enter` → 显示「已复制」，面板收起；在别处 `⌘V` 粘贴内容正确。
7. 再点图标 → 面板重新出现，列表已刷新；按 `Esc` 清空搜索，再按 `Esc` 收起。
8. 点击面板外任意处 → 面板收起；`KB_PANEL_PIN=1 npm start` 时则不收起。
9. 编辑一条、删除一条（需「确认删除」）→ 列表正确更新。
10. 右键图标 → 菜单选「退出」→ `ps aux | grep kb-kernel` 无残留 Java 进程。
