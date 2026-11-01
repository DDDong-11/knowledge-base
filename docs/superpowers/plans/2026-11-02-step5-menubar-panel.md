# MVP 第 5 步：菜单栏面板 + kind/source 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把知识库做成 macOS 菜单栏图标 + React 紧凑面板，并给条目加上 `kind` / `source` 两个字段，HTTP API 作为 Alma 后续接入的稳定契约。

**Architecture:** Java 内核新增枚举字段、幂等迁移和 `kind` 过滤；Electron 主进程把 IPC 拆到 `ipc.ts`（参数校验 + 发送方校验 + 统一错误信封），Tray + 无边框 BrowserWindow 承载 Vite 打包的 React 渲染层。渲染层只通过 `window.kb` → IPC → 主进程 → HTTP 访问数据。

**Tech Stack:** Spring Boot 3.5.16 / Java 17（JDK 21 构建）/ H2；Electron 33 / TypeScript 5 / node:test；React 19 + Vite 8 + @vitejs/plugin-react 6；vitest 5 + @testing-library/react 16 + jsdom。

Spec：`docs/superpowers/specs/2026-11-01-step5-menubar-panel-design.md`（commit d113686，已确认）。

## Global Constraints

- 边界：**Electron 不管数据、Java 不管 UI**。主进程不缓存业务数据；渲染层不直连内核、不知道令牌。
- `kind`：`VARCHAR(16) NOT NULL`，取值 `CODE` / `NOTE` / `CLIP`，默认 `NOTE`（旧数据与未指定类型的新条目都是 `NOTE`）。
- `source`：`VARCHAR(16) NOT NULL`，取值 `MANUAL` / `CLIPBOARD` / `ALMA`，默认 `MANUAL`，创建时确定，之后不可改。
- `PUT /api/snippets/{id}`：`kind` 缺省时保留原值；`source` 被忽略；`title/content/tags` 仍全量。
- 非法枚举值 → `400`，`error=BAD_REQUEST`，`message` 列出合法值。
- 迁移只用 `schema.sql` 的 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，保持 `ddl-auto=validate`，不引入 Flyway。
- `SearchService.search(query, limit, kind)`，`kind` 为 null 表示不过滤；打分规则不变。
- IPC 通道：`kb:health` `kb:meta` `kb:search` `kb:listSnippets` `kb:getSnippet` `kb:createSnippet` `kb:updateSnippet` `kb:deleteSnippet` `kb:copyText` `kb:hidePanel`；事件 `kb:panelShown`。`kb:search` 第二参数为 `{ kind?, limit? }`。
- 每个 IPC handler：id 为正整数、kind 在枚举内、字符串长度上限；非法参数直接拒绝，不打 HTTP；只接受来自面板 `webContents` 的调用。
- 面板窗口：`frame:false`、`resizable:false`、`show:false`、`skipTaskbar:true`、`fullscreenable:false`、`alwaysOnTop:true`；`contextIsolation:true`、`nodeIntegration:false`、`sandbox:true`；约 360×480。
- `blur` → 隐藏；`KB_PANEL_PIN=1` 关闭失焦隐藏。macOS `app.dock.hide()`。Tray 右键菜单「打开面板」「退出」。
- CSP：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`。
- 托盘图标：模板图 `trayTemplate.png`（16×16）+ `trayTemplate@2x.png`（32×32），单色黑 + 透明，由脚本生成。
- 渲染层：Vite，root `src/renderer`，产物 `dist/renderer`，`base: './'`；单独 `tsconfig.renderer.json`；不引入路由、状态库、UI 组件库。
- 搜索防抖 200ms；空查询列最近 20 条。
- 全部 Java 测试、`npm test`、`npm run typecheck`、`npm run build` 必须通过。
- 只在本地 `main` 提交，不推 GitHub；不碰 `docs/initial-architecture` 分支。

---

## File Structure

```
java-kernel/src/main/java/com/dongzhiwei/kb/
  domain/SnippetKind.java          新：枚举 CODE/NOTE/CLIP
  domain/SnippetSource.java        新：枚举 MANUAL/CLIPBOARD/ALMA
  domain/Snippet.java              改：kind、source 列
  dto/SnippetRequest.java          改：可选 kind、source；保留 3 参构造
  dto/SnippetResponse.java         改：响应含 kind、source
  service/SnippetService.java      改：默认值、PUT 保留 kind、list(page,size,kind)
  search/SearchService.java        改：search(query, limit, kind)
  search/LikeSearchService.java    改：kind 作为额外 AND
  web/SnippetController.java       改：kind 查询参数
  web/GlobalExceptionHandler.java  改：非法枚举 → 400 BAD_REQUEST + 合法值
java-kernel/src/main/resources/schema.sql  改：建表含新列 + 幂等 ALTER + 索引
java-kernel/src/test/java/.../SchemaMigrationTest.java  新

electron/
  assets/trayTemplate.png, trayTemplate@2x.png   新（脚本生成，入库）
  scripts/gen-tray-icon.mjs        新：纯 Node 生成 PNG
  scripts/copy-renderer.mjs        删
  src/shared/kbApi.ts              新：IPC 共享类型（KbApi、IpcResult、IpcError、实体类型）
  src/main/kernelClient.ts         改：get/list/update/delete、search 选项、fieldErrors
  src/main/ipcValidation.ts        新：纯函数校验
  src/main/ipc.ts                  新：注册 handler（依赖注入，可单测）
  src/main/panelPosition.ts        新：computePanelPosition 纯函数
  src/main/panel.ts                新：面板窗口
  src/main/tray.ts                 新：Tray + 右键菜单
  src/main/main.ts                 改：组装
  src/preload/preload.ts           改：完整 window.kb + onPanelShown
  src/renderer/                    重写为 React（见 Task 4）
  tsconfig.json                    改：只含 main/preload/shared
  tsconfig.renderer.json           新
  vite.config.ts / vitest.config.ts 新
README.md                          改：稳定 API 契约 + 运行步骤
```

---

### Task 1: Java — kind/source 字段、迁移、kind 过滤、非法枚举 400

**Files:**
- Create: `java-kernel/src/main/java/com/dongzhiwei/kb/domain/SnippetKind.java`, `SnippetSource.java`
- Modify: `domain/Snippet.java`, `dto/SnippetRequest.java`, `dto/SnippetResponse.java`, `service/SnippetService.java`, `search/SearchService.java`, `search/LikeSearchService.java`, `web/SnippetController.java`, `web/GlobalExceptionHandler.java`, `src/main/resources/schema.sql`
- Test: `SnippetServiceTest`, `SnippetControllerTest`, `LikeSearchServiceTest`（追加）, `config/SchemaMigrationTest.java`（新）

**Interfaces:**
- Produces（HTTP 契约，后续任务依赖）：
  - 所有 snippet 响应体：`{id,title,content,tags,kind,source,createTime,updateTime}`
  - `POST /api/snippets` body 可选 `kind`、`source`
  - `PUT /api/snippets/{id}` body 可选 `kind`（缺省保留），`source` 忽略
  - `GET /api/snippets?page&size&kind`、`GET /api/snippets/search?q&limit&kind`
  - 400 体：`{status:400,error:"BAD_REQUEST",message:"invalid value 'X' for kind; allowed: CODE, NOTE, CLIP",...}`
- Java：`SnippetService.list(int page, int size, SnippetKind kind)`；`SearchService.search(String q, int limit, SnippetKind kind)` + 默认方法 `search(q, limit)` = `search(q, limit, null)`；`SnippetRequest(String title, String content, List<String> tags, SnippetKind kind, SnippetSource source)` + 3 参便捷构造。

- [ ] **Step 1: 写失败测试**

`SnippetServiceTest` 追加：

```java
@Test
void defaultsKindNoteAndSourceManual() {
    SnippetResponse r = service.create(new SnippetRequest("t", "c", null));
    assertThat(r.kind()).isEqualTo(SnippetKind.NOTE);
    assertThat(r.source()).isEqualTo(SnippetSource.MANUAL);
}

@Test
void updateWithoutKindKeepsKindAndSourceIsImmutable() {
    SnippetResponse c = service.create(new SnippetRequest("t", "c", null, SnippetKind.CODE, SnippetSource.ALMA));
    SnippetResponse u = service.update(c.id(), new SnippetRequest("t2", "c2", null, null, SnippetSource.CLIPBOARD));
    assertThat(u.kind()).isEqualTo(SnippetKind.CODE);
    assertThat(u.source()).isEqualTo(SnippetSource.ALMA);
    SnippetResponse u2 = service.update(c.id(), new SnippetRequest("t3", "c3", null, SnippetKind.CLIP, null));
    assertThat(u2.kind()).isEqualTo(SnippetKind.CLIP);
}

@Test
void listFiltersByKind() {
    service.create(new SnippetRequest("a", "", null, SnippetKind.CODE, null));
    service.create(new SnippetRequest("b", "", null));
    assertThat(service.list(0, 20, SnippetKind.CODE).items()).extracting(SnippetResponse::title).containsExactly("a");
    assertThat(service.list(0, 20, null).items()).hasSize(2);
}
```

`SnippetControllerTest` 追加：

```java
@Test
void kindAndSourceRoundTripAndFilters() throws Exception {
    mvc.perform(post("/api/snippets").contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"docker prune\",\"content\":\"docker system prune\",\"kind\":\"CODE\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.kind").value("CODE"))
        .andExpect(jsonPath("$.source").value("MANUAL"));
    create("docker note", "remember", "[]");
    mvc.perform(get("/api/snippets").param("kind", "CODE"))
        .andExpect(jsonPath("$.items", hasSize(1)))
        .andExpect(jsonPath("$.items[0].kind").value("CODE"));
    mvc.perform(get("/api/snippets/search").param("q", "docker").param("kind", "NOTE"))
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.hits[0].snippet.kind").value("NOTE"));
}

@Test
void putWithoutKindKeepsKind() throws Exception { /* POST kind=CODE，PUT 不带 kind → $.kind == CODE */ }

@Test
void badEnumGives400BadRequestListingAllowedValues() throws Exception {
    mvc.perform(post("/api/snippets").contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"t\",\"kind\":\"BOGUS\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("BAD_REQUEST"))
        .andExpect(jsonPath("$.message", allOf(containsString("CODE"), containsString("NOTE"), containsString("CLIP"))));
    mvc.perform(get("/api/snippets").param("kind", "bogus"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("BAD_REQUEST"))
        .andExpect(jsonPath("$.message", containsString("CODE, NOTE, CLIP")));
    mvc.perform(get("/api/snippets/search").param("q", "x").param("kind", "nope"))
        .andExpect(status().isBadRequest());
    mvc.perform(post("/api/snippets").contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"t\",\"source\":\"WEB\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.message", containsString("MANUAL, CLIPBOARD, ALMA")));
}
```

`LikeSearchServiceTest` 追加：同一查询词命中 CODE 和 NOTE 各一条，`search(q, 10, CODE)` 只返回 CODE，且打分顺序与不带 kind 时的相对顺序一致。

`SchemaMigrationTest`（新）：`@DynamicPropertySource` 里用 `DriverManager` 在 `jdbc:h2:mem:kbmigr;DB_CLOSE_DELAY=-1` 建**旧表结构**（无 kind/source）并插一行，然后把 `spring.datasource.url` 指向它；上下文启动（`ddl-auto=validate` 通过即证明新列存在）后断言：旧行 `kind=NOTE`、`source=MANUAL`；`INFORMATION_SCHEMA.INDEXES` 有 `IDX_SNIPPET_KIND`；再次执行 `schema.sql`（`ScriptUtils.executeSqlScript`）不报错（幂等）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd java-kernel && JAVA_HOME=/opt/jdk21 ./mvnw -q test`
Expected: 编译失败（`SnippetKind` 未定义）。

- [ ] **Step 3: 实现**

```java
public enum SnippetKind { CODE, NOTE, CLIP }
public enum SnippetSource { MANUAL, CLIPBOARD, ALMA }
```

`Snippet`：

```java
@Enumerated(EnumType.STRING)
@Column(nullable = false, length = 16)
private SnippetKind kind = SnippetKind.NOTE;

@Enumerated(EnumType.STRING)
@Column(nullable = false, length = 16, updatable = false)
private SnippetSource source = SnippetSource.MANUAL;
```

`schema.sql`：

```sql
CREATE TABLE IF NOT EXISTS snippet (
    id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    title       VARCHAR(200)  NOT NULL,
    content     CHARACTER LARGE OBJECT,
    tags        VARCHAR(1000),
    kind        VARCHAR(16)   DEFAULT 'NOTE'   NOT NULL,
    source      VARCHAR(16)   DEFAULT 'MANUAL' NOT NULL,
    create_time TIMESTAMP(6)  NOT NULL,
    update_time TIMESTAMP(6)  NOT NULL
);
-- 第 5 步迁移：兼容第 1-4 步建出的旧库文件（幂等）
ALTER TABLE snippet ADD COLUMN IF NOT EXISTS kind   VARCHAR(16) DEFAULT 'NOTE'   NOT NULL;
ALTER TABLE snippet ADD COLUMN IF NOT EXISTS source VARCHAR(16) DEFAULT 'MANUAL' NOT NULL;
CREATE INDEX IF NOT EXISTS idx_snippet_update_time ON snippet (update_time);
CREATE INDEX IF NOT EXISTS idx_snippet_kind ON snippet (kind);
```

`SnippetService`：create 时 `kind = req.kind() ?? NOTE`、`source = req.source() ?? MANUAL`；update 时 `if (req.kind() != null) s.setKind(req.kind())`，不触碰 source；`list(page,size,kind)` 用 `Specification`：`kind == null ? null : cb.equal(root.get("kind"), kind)`。

`LikeSearchService.search(query, limit, kind)`：`matchAll(terms)` 之后 `if (kind != null) spec = spec.and(kindIs(kind))`。

`SnippetController`：`@RequestParam(required = false) SnippetKind kind` 加到 list 与 search。

`GlobalExceptionHandler`：
- `HttpMessageNotReadableException` 若 `getCause()` 是 `InvalidFormatException` 且 `getTargetType().isEnum()` → 400 `BAD_REQUEST`，message `invalid value 'X' for <field>; allowed: A, B, C`（字段名取 `getPath()` 最后一节）；否则维持 `MALFORMED_REQUEST`。
- `MethodArgumentTypeMismatchException` 若 `getRequiredType().isEnum()` → 同样格式（字段名 `getName()`）；否则原样。
- 公共 `static String enumMessage(String field, Object value, Class<?> enumType)`，合法值 `Arrays.stream(enumType.getEnumConstants()).map(Object::toString).collect(joining(", "))`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd java-kernel && JAVA_HOME=/opt/jdk21 ./mvnw -q test`
Expected: 全部 PASS（原 30 个 + 新增）。

- [ ] **Step 5: Commit**

```bash
git add java-kernel
git commit -m "feat(java-kernel): kind/source fields with idempotent migration and kind filter"
```

---

### Task 2: Electron — kernelClient 补全、共享类型、IPC 校验与注册、preload

**Files:**
- Create: `electron/src/shared/kbApi.ts`, `electron/src/main/ipcValidation.ts`, `electron/src/main/ipc.ts`, `electron/src/main/ipcValidation.test.ts`, `electron/src/main/ipc.test.ts`
- Modify: `electron/src/main/kernelClient.ts`, `electron/src/main/kernelClient.test.ts`, `electron/src/main/main.ts`（改为调用 `registerIpc`）, `electron/src/preload/preload.ts`, `electron/package.json`（test 脚本用 glob）, `electron/tsconfig.json`（include main/preload/shared）
- Delete: `electron/src/renderer/kb-api.d.ts`（类型改由 shared 提供；旧 `renderer.ts` 临时改用 `search(q,{limit})`，Task 4 整体替换）

**Interfaces:**
- Consumes: Task 1 HTTP 契约。
- Produces（`src/shared/kbApi.ts`，渲染层与 preload 都用）：

```ts
export const SNIPPET_KINDS = ['CODE', 'NOTE', 'CLIP'] as const;
export type SnippetKind = (typeof SNIPPET_KINDS)[number];
export type SnippetSource = 'MANUAL' | 'CLIPBOARD' | 'ALMA';
export type Snippet = { id: number; title: string; content: string; tags: string[]; kind: SnippetKind; source: SnippetSource; createTime: string; updateTime: string };
export type SnippetInput = { title: string; content?: string; tags?: string[]; kind?: SnippetKind };
export type SearchHit = { snippet: Snippet; score: number; matchedFields: string[] };
export type SearchResult = { query: string; total: number; hits: SearchHit[] };
export type SnippetPage = { items: Snippet[]; page: number; size: number; totalElements: number; totalPages: number };
export type Health = { status: string; app: string };
export type SearchOptions = { kind?: SnippetKind; limit?: number };
export type ListOptions = { page?: number; size?: number; kind?: SnippetKind };
export type IpcError = { status: number; error: string; message: string; fieldErrors?: { field: string; message: string }[] };
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };
export type KbApi = {
  health(): Promise<IpcResult<Health>>;
  meta(): Promise<IpcResult<{ port: number }>>;
  search(q: string, opts?: SearchOptions): Promise<IpcResult<SearchResult>>;
  listSnippets(opts?: ListOptions): Promise<IpcResult<SnippetPage>>;
  getSnippet(id: number): Promise<IpcResult<Snippet>>;
  createSnippet(body: SnippetInput): Promise<IpcResult<Snippet>>;
  updateSnippet(id: number, body: SnippetInput): Promise<IpcResult<Snippet>>;
  deleteSnippet(id: number): Promise<IpcResult<null>>;
  copyText(text: string): Promise<IpcResult<null>>;
  hidePanel(): Promise<IpcResult<null>>;
  onPanelShown(cb: () => void): () => void;
};
export const LIMITS = { titleMax: 200, contentMax: 1_000_000, tagsMax: 20, tagMax: 40, queryMax: 200, searchLimitMax: 200, pageSizeMax: 100 } as const;
```

- `kernelClient`：`getSnippet(id)`、`listSnippets(opts)`（`GET /api/snippets?page&size&kind`，只编码已给出的参数）、`updateSnippet(id, body)`（PUT）、`deleteSnippet(id)`（DELETE，204 → `null`）、`search(q, opts)`（`?q&limit&kind`，`limit` 缺省 50）；`KernelHttpError` 新增 `fieldErrors`。
- `ipcValidation.ts`：每个函数返回校验后的值或抛 `IpcValidationError(message)`：`validateId(v)`、`validateKind(v, optional)`、`validateSearchArgs(q, opts)`、`validateListOptions(opts)`、`validateSnippetInput(body)`、`validateCopyText(text)`。
- `ipc.ts`：

```ts
export type IpcDeps = {
  ipcMain: { handle(channel: string, fn: (event: { sender: unknown }, ...args: unknown[]) => unknown): void };
  getKernel(): { port: number; client: KernelClient } | null;
  isTrustedSender(sender: unknown): boolean;
  writeClipboard(text: string): void;
  hidePanel(): void;
};
export const IPC_CHANNELS: readonly string[];
export function toIpcError(err: unknown): IpcError;
export function registerIpc(deps: IpcDeps): void;
```

  - 每个 handler 返回 `IpcResult`，不 throw。错误映射：发送方不可信 → `{status:403,error:'FORBIDDEN'}`；校验失败 → `{status:400,error:'INVALID_ARGUMENT'}`；内核未启动 → `{status:503,error:'KERNEL_UNAVAILABLE'}`；`KernelHttpError` → 原样 `{status,error,message,fieldErrors}`；其它（如 fetch 连接失败）→ `{status:503,error:'KERNEL_UNREACHABLE'}`。

- [ ] **Step 1: 写失败测试**

`kernelClient.test.ts` 追加（fake fetch 记录 url/method/body）：
- `listSnippets({ size: 20, kind: 'CODE' })` → `GET .../api/snippets?size=20&kind=CODE`；`listSnippets()` → `.../api/snippets`
- `getSnippet(7)` → `GET .../api/snippets/7`
- `updateSnippet(7, { title: 'x', kind: 'NOTE' })` → `PUT`，body JSON 含 kind
- `deleteSnippet(7)` → `DELETE`，204 空体 → resolve `null`
- `search('docker prune', { kind: 'CLIP', limit: 10 })` → `?q=docker+prune&limit=10&kind=CLIP`；`search('x')` → `?q=x&limit=50`
- 400 带 `fieldErrors` → 抛出的 `KernelHttpError.fieldErrors` 保留

`ipcValidation.test.ts`：
- `validateId`：`1`、`42` 通过；`0`、`-1`、`1.5`、`'1'`、`NaN`、`Number.MAX_SAFE_INTEGER + 1` 拒绝
- `validateKind`：`'CODE'` 通过；`'code'`、`'X'`、`1` 拒绝；`optional=true` 时 `undefined` → `undefined`
- `validateSearchArgs`：空白 q 拒绝；201 字符 q 拒绝；`limit` 0 / 201 / 非整数拒绝；非对象 opts 拒绝；返回 `{ q: trimmed, opts }`
- `validateListOptions`：`page` -1 拒绝；`size` 0 / 101 拒绝；`undefined` → `{}`
- `validateSnippetInput`：非字符串 title 拒绝；201 字符 title 拒绝；content 超 1_000_000 拒绝；tags 非数组 / 21 个 / 单个 41 字符 / 非字符串拒绝；kind 非法拒绝；多余字段（如 `source`）被丢弃
- `validateCopyText`：非字符串、超 1_000_000 拒绝

`ipc.test.ts`（fake ipcMain 收集 handler，fake kernel client）：
- 注册了 `IPC_CHANNELS` 中全部 10 个通道
- 不可信 sender 调 `kb:search` → `{ok:false,error:{status:403,error:'FORBIDDEN'}}`，且 client 未被调用
- `kb:getSnippet` 传 `-1` → 400 `INVALID_ARGUMENT`，client 未被调用
- `kb:search` 正常 → client.search 收到 `('docker', { kind: 'CODE', limit: 5 })`，返回 `{ok:true,data}`
- 内核未启动 → 503 `KERNEL_UNAVAILABLE`
- client 抛 `KernelHttpError(400,'request validation failed','VALIDATION_FAILED',..., fieldErrors)` → 原样带回 fieldErrors
- client 抛 `TypeError('fetch failed')` → 503 `KERNEL_UNREACHABLE`
- `kb:copyText` 调 `writeClipboard`，`kb:hidePanel` 调 `hidePanel`
- `kb:createSnippet` 带 `source:'ALMA'` → 转发给 client 的 body 不含 `source`

- [ ] **Step 2: 跑测试确认失败**

Run: `cd electron && npm test`
Expected: tsc 编译失败（模块不存在）。

- [ ] **Step 3: 实现**

`ipcValidation.ts` 核心：

```ts
export class IpcValidationError extends Error { constructor(message: string) { super(message); this.name = 'IpcValidationError'; } }
const fail = (m: string): never => { throw new IpcValidationError(m); };
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export function validateId(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) fail('id must be a positive integer');
  return v as number;
}
export function validateKind(v: unknown, optional = false): SnippetKind | undefined {
  if (v === undefined && optional) return undefined;
  if (typeof v !== 'string' || !(SNIPPET_KINDS as readonly string[]).includes(v)) fail(`kind must be one of ${SNIPPET_KINDS.join(', ')}`);
  return v as SnippetKind;
}
// 其余函数同理：整数区间 intIn(v, name, min, max)，字符串上限 strMax(v, name, max)
```

`ipc.ts`：`handle(channel, fn)` 包装器：先 `isTrustedSender(event.sender)`，再 try { `{ok:true, data: (await fn(...args)) ?? null}` } catch → `{ok:false, error: toIpcError(e)}`。

`preload.ts`（沙箱：只 import `electron`，类型用 `import type`）：

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { KbApi } from '../shared/kbApi';
const kb: KbApi = {
  health: () => ipcRenderer.invoke('kb:health'),
  meta: () => ipcRenderer.invoke('kb:meta'),
  search: (q, opts) => ipcRenderer.invoke('kb:search', q, opts ?? {}),
  listSnippets: (opts) => ipcRenderer.invoke('kb:listSnippets', opts ?? {}),
  getSnippet: (id) => ipcRenderer.invoke('kb:getSnippet', id),
  createSnippet: (body) => ipcRenderer.invoke('kb:createSnippet', body),
  updateSnippet: (id, body) => ipcRenderer.invoke('kb:updateSnippet', id, body),
  deleteSnippet: (id) => ipcRenderer.invoke('kb:deleteSnippet', id),
  copyText: (text) => ipcRenderer.invoke('kb:copyText', text),
  hidePanel: () => ipcRenderer.invoke('kb:hidePanel'),
  onPanelShown: (cb) => { const l = () => cb(); ipcRenderer.on('kb:panelShown', l); return () => { ipcRenderer.removeListener('kb:panelShown', l); }; },
};
contextBridge.exposeInMainWorld('kb', kb);
```

`package.json` test：`"test": "npm run build && node --test \"dist/main/**/*.test.js\""`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd electron && npm test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add electron
git commit -m "feat(electron): full kernel client, validated IPC with error envelope, shared KbApi types"
```

---

### Task 3: Electron — Tray + 面板窗口 + 定位纯函数 + 模板图标

**Files:**
- Create: `electron/src/main/panelPosition.ts`, `electron/src/main/panelPosition.test.ts`, `electron/src/main/panel.ts`, `electron/src/main/tray.ts`, `electron/scripts/gen-tray-icon.mjs`, `electron/scripts/gen-tray-icon.test.mjs`（可选，见下）, `electron/assets/trayTemplate.png`, `electron/assets/trayTemplate@2x.png`
- Modify: `electron/src/main/main.ts`, `electron/package.json`（`gen-icon` 脚本）

**Interfaces:**
- Consumes: Task 2 `registerIpc(deps)`、`IpcDeps`。
- Produces:

```ts
// panelPosition.ts
export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export const PANEL_SIZE: Size = { width: 360, height: 480 };
export const PANEL_MARGIN = 8;
export function computePanelPosition(tray: Rect, panel: Size, workArea: Rect): { x: number; y: number };
// panel.ts
export type Panel = { window: BrowserWindow; show(trayBounds?: Rect): void; hide(): void; toggle(trayBounds?: Rect): void; isTrusted(sender: unknown): boolean; destroy(): void };
export function createPanel(opts: { preloadPath: string; rendererFile: string; rendererUrl?: string; pin: boolean }): Panel;
// tray.ts
export function createTray(opts: { iconPath: string; onToggle(bounds: Rect): void; onOpen(): void; onQuit(): void }): Tray;
```

规则（`computePanelPosition`）：
1. `x = round(tray.x + tray.width/2 - panel.width/2)`，夹到 `[wa.x + MARGIN, wa.x + wa.width - panel.width - MARGIN]`。
2. 图标在工作区上半部（`tray.y + tray.height/2 <= wa.y + wa.height/2`）→ `y = tray.y + tray.height`；否则（底部任务栏）`y = tray.y - panel.height`。再夹到 `[wa.y, wa.y + wa.height - panel.height]`。
3. 托盘 bounds 全 0（Linux 常见）→ 工作区右上角：`x = wa.x + wa.width - panel.width - MARGIN`，`y = wa.y + MARGIN`。

- [ ] **Step 1: 写失败测试** — `panelPosition.test.ts`：
  - 图标在屏幕中间（wa `{0,25,1440,875}`，tray `{700,0,22,24}`）→ `{x:531,y:24}`
  - 贴右边缘（tray `{1420,0,20,24}`）→ `x = 1440-360-8 = 1072`
  - 贴左边缘（tray `{2,0,20,24}`）→ `x = 8`
  - 多显示器偏移（wa `{1440,25,1920,1055}`，tray `{3000,0,22,24}`）→ `{x:2831,y:25}`（y 被夹到 wa.y）
  - 底部任务栏（wa `{0,0,1920,1040}`，tray `{1800,1040,24,40}`）→ `y = 1040-480 = 560`，`x = 1920-360-8 = 1552`
  - 全零 bounds → 右上角

- [ ] **Step 2: 跑测试确认失败**（`npm test`：模块不存在）

- [ ] **Step 3: 实现**

`gen-tray-icon.mjs`：纯 Node（`zlib.deflateSync` + 手写 CRC32）写 RGBA PNG。图形：一本书的轮廓（外框 + 中缝），黑色 `#000` + alpha，背景透明；以 16 单位网格绘制，`@2x` 按 2 倍缩放。输出 `assets/trayTemplate.png`（16×16）与 `assets/trayTemplate@2x.png`（32×32）。`npm run gen-icon` 生成，产物入库。

`panel.ts`：

```ts
const win = new BrowserWindow({
  width: PANEL_SIZE.width, height: PANEL_SIZE.height, show: false, frame: false, resizable: false,
  skipTaskbar: true, fullscreenable: false, alwaysOnTop: true, minimizable: false, maximizable: false,
  webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
});
win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
win.webContents.on('will-navigate', (e) => e.preventDefault());
if (!pin) win.on('blur', () => win.hide());
// show(bounds): const display = screen.getDisplayNearestPoint({x: bounds.x, y: bounds.y}); setPosition(computePanelPosition(...)); win.show(); win.focus(); win.webContents.send('kb:panelShown')
// bounds 缺省（右键菜单打开）→ 用 screen.getCursorScreenPoint() 所在显示器 + 全零 bounds 规则
// isTrusted(sender) => sender === win.webContents
```

`rendererUrl` 仅接受 `http://localhost:*` / `http://127.0.0.1:*`（`KB_RENDERER_URL`），否则 `loadFile(rendererFile)`。

`tray.ts`：`nativeImage.createFromPath(iconPath)`，`img.setTemplateImage(true)`；`tray.setToolTip('知识库')`；`tray.on('click', (_e, bounds) => onToggle(bounds))`；右键菜单 `Menu.buildFromTemplate([{label:'打开面板',click:onOpen},{type:'separator'},{label:'退出',click:onQuit}])`，用 `tray.on('right-click', () => tray.popUpContextMenu(menu))`；Linux 下 click 事件不一定触发，额外 `tray.setContextMenu(menu)`（仅非 darwin，否则 mac 左键会弹菜单）。

`main.ts`：
- `if (process.platform === 'darwin') app.dock?.hide()`
- boot：起内核 → `createPanel(...)` → `registerIpc({ ipcMain, getKernel, isTrustedSender: panel.isTrusted, writeClipboard: clipboard.writeText, hidePanel: panel.hide })` → `createTray(...)`
- 非 darwin：启动后自动 `panel.show()` 一次（Linux 托盘可能不可见）
- 面板 `close` 事件：未退出时 `preventDefault()` + 隐藏
- `window-all-closed`：不退出（菜单栏常驻）；退出只走 Tray「退出」→ `app.quit()` → 现有 `before-quit` → `kernel.stop()`

- [ ] **Step 4: 跑测试确认通过**（`npm test`、`npm run typecheck`）

- [ ] **Step 5: Commit**

```bash
git add electron
git commit -m "feat(electron): menu bar tray with frameless panel window and template icon"
```

---

### Task 4: React + Vite 渲染层（替换联调页）

**Files:**
- Create: `electron/vite.config.ts`, `electron/vitest.config.ts`, `electron/tsconfig.renderer.json`, `electron/src/renderer/{main.tsx, App.tsx, styles.css, test-setup.ts, vite-env.d.ts}`, `src/renderer/api/kb.ts`, `src/renderer/hooks/{useDebounced.ts, useSnippets.ts}`, `src/renderer/components/{SearchBar, KindFilter, SnippetList, SnippetItem, SnippetEditor, ConfirmDelete, RecentCopies, ErrorBanner, StatusBar}.tsx`, 测试 `src/renderer/__tests__/*.test.tsx`
- Modify: `electron/src/renderer/index.html`（React 根 + CSP）, `electron/package.json`
- Delete: `electron/src/renderer/renderer.ts`, `electron/scripts/copy-renderer.mjs`

**Interfaces:**
- Consumes: `window.kb: KbApi`（Task 2 `src/shared/kbApi.ts`）。
- Produces:
  - `api/kb.ts`：`export class KbError extends Error { status; error; fieldErrors? }`；`export const kb = { health, meta, search, listSnippets, getSnippet, createSnippet, updateSnippet, deleteSnippet, copyText, hidePanel, onPanelShown }`，每个方法 unwrap `IpcResult`，失败抛 `KbError`；`window.kb` 不存在时抛 `KbError(0,'NO_BRIDGE',...)`。
  - `useDebounced<T>(value: T, ms: number): T`
  - `useSnippets({ q, kind, refreshKey }): { items: Snippet[]; loading: boolean; error: KbError | null }` — `q.trim()` 为空 → `listSnippets({ size: 20, kind })`；否则 `search(q, { kind, limit: 50 })` → `hits.map(h => h.snippet)`；用递增请求序号丢弃过期响应。
  - `App` 视图状态 `{ mode: 'list' } | { mode: 'edit'; id?: number }`。

行为：
- 布局：搜索框 + 「＋」→ 类型筛选（全部/代码/笔记/摘录）→ 列表 → 折叠「最近复制」（显示“即将推出”）→ 底部状态栏（`内核正常 · 端口 N` / 错误）。
- SearchBar：自动聚焦；Esc：有内容 → 清空，无内容 → `hidePanel()`；↑↓ 改变选中项；Enter 复制选中项。
- 复制：`copyText(snippet.content)` → 提示「已复制」→ 600ms 后 `hidePanel()`。
- 编辑：新建（无 id）/ 编辑（有 id，先 `getSnippet`）；字段标题、正文（等宽 textarea）、标签（中英文逗号分隔）、类型 select（默认 NOTE）；保存成功回列表并刷新；`KbError.fieldErrors` 显示在对应字段下；删除用行内 `ConfirmDelete`（确认删除 / 取消）。
- `onPanelShown`：聚焦搜索框 + 刷新列表 + 刷新状态栏。
- 错误：列表 / 保存失败显示 `ErrorBanner`（可关闭）。
- `styles.css`：系统字体，`prefers-color-scheme: dark` 适配。

构建与脚本（`package.json`）：

```json
"scripts": {
  "build": "tsc -p tsconfig.json && vite build",
  "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.renderer.json --noEmit",
  "test": "npm run build && node --test \"dist/main/**/*.test.js\" && vitest run",
  "test:renderer": "vitest run",
  "start": "npm run build && electron .",
  "dev:renderer": "vite",
  "gen-icon": "node scripts/gen-tray-icon.mjs",
  "package-kernel": "cd ../java-kernel && ./mvnw -DskipTests package"
}
```

`vite.config.ts`：`root: 'src/renderer'`、`base: './'`、`build.outDir: '../../dist/renderer'`、`emptyOutDir: true`；`plugins: [react(), devCsp()]`，`devCsp` 只在 `serve` 时把 CSP 放宽（加 `'unsafe-inline'` 到 script-src 与 `ws://localhost:*` 到 connect-src），保证 `vite build` 产物 CSP 原样。

`vitest.config.ts`：`environment: 'jsdom'`、`include: ['src/renderer/**/*.test.tsx']`、`setupFiles: ['src/renderer/test-setup.ts']`（引入 `@testing-library/jest-dom/vitest`）。

- [ ] **Step 1: 写失败测试**（`src/renderer/__tests__/`，mock `window.kb` 为返回 `{ok:true,data}` 的 `vi.fn()`）
  - `App.test.tsx`：
    - 初次渲染调用 `listSnippets({ size: 20 })` 并显示条目标题；搜索框获得焦点
    - 输入 `docker` → 200ms 防抖后调用 `search('docker', { limit: 50 })` 一次（中间按键不触发）
    - 点「代码」筛选 → `listSnippets({ size: 20, kind: 'CODE' })`；有查询时 `search(q, { kind: 'CODE', limit: 50 })`
    - 点条目「复制」→ `copyText(content)`，显示「已复制」，随后 `hidePanel()`
    - ↓ + Enter → 复制第二条
    - Esc：有内容先清空、再按 → `hidePanel()`
    - `listSnippets` 返回 `{ok:false,error:{status:503,error:'KERNEL_UNREACHABLE',message:'down'}}` → 显示错误条
    - 触发 `onPanelShown` 回调 → 再次调用 `listSnippets`
  - `SnippetEditor.test.tsx`：
    - 新建：填标题/正文/标签 `a, b，c`/类型 CODE → `createSnippet({ title, content, tags:['a','b','c'], kind:'CODE' })`，然后 `onSaved`
    - 编辑：先 `getSnippet(5)` 填充表单；保存走 `updateSnippet(5, …)`
    - 保存返回 400 `fieldErrors:[{field:'title',message:'title is required'}]` → 标题下显示该消息
    - 删除：点「删除」出现行内确认，点「取消」不调用；点「确认删除」→ `deleteSnippet(5)` 后 `onDeleted`
  - `RecentCopies.test.tsx`：默认折叠，展开显示「即将推出」

- [ ] **Step 2: 跑测试确认失败**（`npx vitest run`：模块不存在）

- [ ] **Step 3: 实现**（组件按上面 Interfaces；`main.tsx` `createRoot(document.getElementById('root')!).render(<App />)`；`index.html` 保留 CSP meta，body 为 `<div id="root"></div><script type="module" src="./main.tsx"></script>`）

- [ ] **Step 4: 跑测试确认通过**：`npm test`、`npm run typecheck`、`npm run build`（`dist/renderer/index.html` 存在且 CSP 未被修改、引用 `./assets/*.js`）

- [ ] **Step 5: Commit**

```bash
git add electron
git commit -m "feat(electron): React + Vite menu bar panel replacing the 联调 page"
```

---

### Task 5: README 稳定契约 + 运行步骤 + 无头冒烟

**Files:**
- Modify: `README.md`

内容：
- 「HTTP API（`/api/**` 稳定契约）」：每个端点的方法、参数、请求体、响应体字段（含 `kind`/`source`）、错误体格式与错误码表（`VALIDATION_FAILED`、`BAD_REQUEST`、`MALFORMED_REQUEST`、`NOT_FOUND`、`UNAUTHORIZED`、`METHOD_NOT_ALLOWED`、`UNSUPPORTED_MEDIA_TYPE`、`INTERNAL_ERROR`）、枚举区分大小写、`PUT` 的 `kind` 缺省保留语义、`source` 不可改；声明**破坏性修改需升版本并更新 README**；curl 示例。
- 「Electron 菜单栏面板」：Node 版本要求（Vite 8：`^20.19.0 || >=22.12.0`）、`npm install`、`npm run package-kernel`、`npm start`；`KB_PANEL_PIN=1`、`KB_RENDERER_URL`；`npm test` / `npm run typecheck`；Mac 冒烟清单。
- IPC 契约（内部）表。

冒烟（不入库，记录到 `.superpowers/sdd/verification.md`）：`xvfb-run -a npx electron .` 在盒子上启动，确认内核 `KB_READY`、面板加载完成、无渲染进程报错，然后退出且 Java 子进程被结束。

- [ ] **Step 1:** 写 README
- [ ] **Step 2:** 跑全部验证（Java 测试、`npm test`、`npm run typecheck`、`npm run build`、xvfb 冒烟）
- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: stable /api contract with kind/source and menu bar panel run steps"
```
