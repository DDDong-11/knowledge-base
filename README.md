# 个人开发知识库

本地离线代码片段管理器：Electron（视图层 + 插件宿主）+ Spring Boot（数据内核 + 检索），本地 HTTP 通信。

设计见 docs/mvp-design.md。

## Java 内核（java-kernel）

Spring Boot 3.5 + H2（嵌入式文件库）+ Spring Data JPA。只监听 `127.0.0.1`，不开 CORS，供 Electron 主进程通过本地 HTTP 调用。

### 运行

需要 JDK 17+（Maven 用自带的 wrapper 即可）。

```bash
cd java-kernel
./mvnw test                 # 跑测试（测试 profile 用内存 H2）
./mvnw spring-boot:run      # 开发运行
# 或打包后运行
./mvnw -DskipTests package
java -jar target/kb-kernel-0.1.0-SNAPSHOT.jar
```

配置项（环境变量或 `--key=value`）：

| 配置 | 环境变量 | 默认值 |
| --- | --- | --- |
| `server.port` | `KB_PORT` | `17321` |
| `kb.data-dir` | `KB_DATA_DIR` | `~/.knowledge-base/data`（库文件 `kb.mv.db`） |
| `server.address` | — | `127.0.0.1`（不要改成 0.0.0.0） |

表结构见 `src/main/resources/schema.sql`，Hibernate 只做 `validate`。

### API

所有接口前缀 `http://127.0.0.1:17321`，请求/响应均为 JSON。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 探活：`{"status":"UP","app":"kb-kernel"}` |
| POST | `/api/snippets` | 新增，返回 201 + `Location` |
| GET | `/api/snippets/{id}` | 查询单条，不存在 404 |
| PUT | `/api/snippets/{id}` | 全量更新（title/content/tags），刷新 `updateTime` |
| DELETE | `/api/snippets/{id}` | 删除，返回 204 |
| GET | `/api/snippets?page=0&size=20` | 分页列表（`size` 1–100），按 `updateTime` 倒序 |
| GET | `/api/snippets/search?q=关键词&limit=50` | 全文搜索（`limit` 1–200） |
| GET | `/api/tags` | 全部标签（去重、小写、排序） |

请求体：

```json
{ "title": "Docker 清理", "content": "docker system prune -af", "tags": ["docker", "shell"] }
```

- `title` 必填，≤200 字符；`content` ≤1,000,000 字符；`tags` ≤20 个、每个 ≤40 字符。
- 标签会规范化：拆分半角/全角逗号、trim、去空、大小写不敏感去重。库里以逗号分隔存储，接口里是数组。

搜索响应：

```json
{ "query": "docker", "total": 1,
  "hits": [ { "snippet": { "id": 1, "title": "...", "...": "..." },
              "score": 166.0, "matchedFields": ["title", "tags", "content"] } ] }
```

- 按空白拆词，所有词都要命中（AND），大小写不敏感，`%`/`_` 按字面匹配。
- 打分：标题命中 100（完全相等 +50，前缀 +20）> 标签命中 40（部分 20）> 正文 5+出现次数（最多 +5）；同分按更新时间倒序。
- 实现在 `search/LikeSearchService`，实现了 `SearchService` 接口，后续换成 Lucene 只需替换实现。

统一错误体：

```json
{ "timestamp": "...", "status": 400, "error": "VALIDATION_FAILED",
  "message": "request validation failed", "path": "/api/snippets",
  "fieldErrors": [ { "field": "title", "message": "title is required" } ] }
```

`error` 取值：`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`BAD_REQUEST`、`METHOD_NOT_ALLOWED`、`UNSUPPORTED_MEDIA_TYPE`、`INTERNAL_ERROR`。
