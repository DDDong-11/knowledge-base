# Electron Skeleton + Kernel HTTP Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship MVP steps 3–4: an Electron TypeScript shell that launches the Java kernel with a one-time startup token and auto-selected port, then talks to it over local HTTP through a minimal 联调 page (health / search / create).

**Architecture:** Electron main process generates `KB_TOKEN`, sets `KB_PORT=0` and `KB_PORT_FILE` to a temp path, spawns `kb-kernel-0.1.0-SNAPSHOT.jar`, waits until the port file is written and `GET /api/health` succeeds with header `X-KB-Token`, then opens a BrowserWindow. Renderer never calls Java directly (no CORS); it uses preload → IPC → main → `kernelClient`. Java adds `TokenAuthFilter` (optional when token blank for Java-only `./mvnw spring-boot:run`) and `PortReporter` (writes port file + prints `KB_READY port=<n>` on `ApplicationReadyEvent`).

**Tech Stack:** Spring Boot 3.5.16 / Java 17 (existing `java-kernel`), Electron ^33, TypeScript, Node built-in `fetch` + `node:test`, plain HTML renderer (no React/Vue).

## Global Constraints

- Boundary: Electron 不管数据、Java 不管 UI — all CRUD/search stay in Java; Electron only launches, authenticates, and displays.
- Do **not** push to GitHub; work only under `/workspace/dongzhiwei/knowledge-base`.
- Stay on branch `main` for implementation commits after this plan; do not modify `docs/initial-architecture` branch contents.
- Kernel jar path (from `electron/`): `../java-kernel/target/kb-kernel-0.1.0-SNAPSHOT.jar` — package with `./mvnw -DskipTests package` first (or `npm run package-kernel`).
- Listen address remains `127.0.0.1` only; do not enable CORS.
- Error JSON shape stays `ErrorResponse`: `{timestamp,status,error,message,path,fieldErrors?}`; new auth failure uses `error: "UNAUTHORIZED"`, status 401.
- When `KB_TOKEN` / `kb.token` is blank: filter allows all `/api/**` (existing MockMvc tests must keep passing with no header).
- When token is set: **every** `/api/**` request including `/api/health` must send matching `X-KB-Token`.
- Port discovery: env `KB_PORT_FILE`; Java overwrites that file with the decimal port as plain text; also print one stdout line `KB_READY port=<n>`.
- Renderer 联调 only: health, search, create one snippet — **not** full list/edit UI (MVP step 5).
- Match existing DTO JSON: `SnippetRequest` `{title, content?, tags?: string[]}`; `SearchResponse` `{query, total, hits:[{snippet, score, matchedFields}]}`; health `{status, app}`.
- Prefer TDD for Java filter/reporter and for pure Electron `kernelClient` / `token` modules.
- Chinese README updates; no invented APIs.

---

## File map

| Path | Responsibility |
| --- | --- |
| `java-kernel/src/main/resources/application.properties` | Add `kb.token=${KB_TOKEN:}` and `kb.port-file=${KB_PORT_FILE:}` |
| `java-kernel/.../config/TokenAuthFilter.java` | `OncePerRequestFilter` for `/api/**` token check; writes JSON 401 |
| `java-kernel/.../config/PortReporter.java` | On `ApplicationReadyEvent`, write port file + stdout `KB_READY` |
| `java-kernel/src/test/.../web/TokenAuthFilterTest.java` | MockMvc: blank token open; set token requires header; wrong → 401 |
| `java-kernel/src/test/.../config/PortReporterTest.java` | Unit test: writes port to temp file when property set |
| `electron/package.json` | `kb-electron`, private, scripts build/start/test/package-kernel |
| `electron/tsconfig.json` | CommonJS, strict, `src` → `dist` |
| `electron/scripts/copy-renderer.mjs` | Copy `index.html` into `dist/renderer/` |
| `electron/src/main/token.ts` | `generateToken(): string` via `randomBytes` |
| `electron/src/main/kernelClient.ts` | Pure HTTP helpers with `X-KB-Token` |
| `electron/src/main/kernelClient.test.ts` | `node:test` against mock `fetch` |
| `electron/src/main/kernelLauncher.ts` | Spawn jar, poll port file, health wait, kill on stop |
| `electron/src/main/main.ts` | App lifecycle, IPC, BrowserWindow |
| `electron/src/preload/preload.ts` | `contextBridge` expose `window.kb` |
| `electron/src/renderer/index.html` | Minimal 联调 UI |
| `electron/src/renderer/renderer.ts` | Wire buttons to `window.kb` |
| `README.md` | Electron run steps + token/port env docs |

---

### Task 1: Java startup token filter

**Files:**
- Modify: `java-kernel/src/main/resources/application.properties`
- Create: `java-kernel/src/main/java/com/dongzhiwei/kb/config/TokenAuthFilter.java`
- Test: `java-kernel/src/test/java/com/dongzhiwei/kb/web/TokenAuthFilterTest.java`

**Interfaces:**
- Consumes: existing `ErrorResponse`, `MetaController` `/api/health`, `SnippetController` POST `/api/snippets`
- Produces: servlet filter bean; property `kb.token`; header name `X-KB-Token`; 401 body `error=UNAUTHORIZED`

- [ ] **Step 1: Write the failing MockMvc tests**

Create `java-kernel/src/test/java/com/dongzhiwei/kb/web/TokenAuthFilterTest.java`:

```java
package com.dongzhiwei.kb.web;

import com.dongzhiwei.kb.repository.SnippetRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TokenAuthFilterTest {

    @Nested
    @SpringBootTest
    @AutoConfigureMockMvc
    @ActiveProfiles("test")
    class WhenTokenUnset {
        @Autowired MockMvc mvc;
        @Autowired SnippetRepository repository;

        @BeforeEach
        void clean() {
            repository.deleteAll();
        }

        @Test
        void healthAndCreateWorkWithoutHeader() throws Exception {
            mvc.perform(get("/api/health"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("UP"));

            mvc.perform(post("/api/snippets").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"title\":\"t\",\"content\":\"c\",\"tags\":[]}"))
                    .andExpect(status().isCreated());
        }
    }

    @Nested
    @SpringBootTest
    @AutoConfigureMockMvc
    @ActiveProfiles("test")
    @TestPropertySource(properties = "kb.token=test-secret-token")
    class WhenTokenConfigured {
        @Autowired MockMvc mvc;
        @Autowired SnippetRepository repository;

        @BeforeEach
        void clean() {
            repository.deleteAll();
        }

        @Test
        void missingTokenReturns401UnauthorizedShape() throws Exception {
            mvc.perform(get("/api/health"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                    .andExpect(jsonPath("$.status").value(401))
                    .andExpect(jsonPath("$.error").value("UNAUTHORIZED"))
                    .andExpect(jsonPath("$.message", containsString("token")))
                    .andExpect(jsonPath("$.path").value("/api/health"))
                    .andExpect(jsonPath("$.timestamp").exists());
        }

        @Test
        void wrongTokenReturns401() throws Exception {
            mvc.perform(get("/api/health").header("X-KB-Token", "nope"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error").value("UNAUTHORIZED"));
        }

        @Test
        void matchingTokenAllowsHealthAndCreate() throws Exception {
            mvc.perform(get("/api/health").header("X-KB-Token", "test-secret-token"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("UP"))
                    .andExpect(jsonPath("$.app").value("kb-kernel"));

            mvc.perform(post("/api/snippets").header("X-KB-Token", "test-secret-token")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"title\":\"secured\",\"content\":\"x\",\"tags\":[\"a\"]}"))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.title").value("secured"));
        }
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd /workspace/dongzhiwei/knowledge-base/java-kernel
./mvnw -q -Dtest=TokenAuthFilterTest test
```

Expected: FAIL — property `kb.token` unknown and/or no 401 behavior (health returns 200 even with `@TestPropertySource`).

- [ ] **Step 3: Add properties**

Append to `java-kernel/src/main/resources/application.properties`:

```properties

# Electron 启动令牌；空则不过滤（便于单独 ./mvnw spring-boot:run）
kb.token=${KB_TOKEN:}

# Electron 传入的端口回写文件路径；空则不写文件（仍打印 KB_READY）
kb.port-file=${KB_PORT_FILE:}
```

- [ ] **Step 4: Implement TokenAuthFilter**

Create `java-kernel/src/main/java/com/dongzhiwei/kb/config/TokenAuthFilter.java`:

```java
package com.dongzhiwei.kb.config;

import com.dongzhiwei.kb.dto.ErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Objects;

@Component
public class TokenAuthFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-KB-Token";

    private final String configuredToken;
    private final ObjectMapper objectMapper;

    public TokenAuthFilter(@Value("${kb.token:}") String configuredToken, ObjectMapper objectMapper) {
        this.configuredToken = configuredToken == null ? "" : configuredToken;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path == null || !path.startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (configuredToken.isBlank()) {
            filterChain.doFilter(request, response);
            return;
        }
        String provided = request.getHeader(HEADER);
        if (!Objects.equals(configuredToken, provided)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            ErrorResponse body = new ErrorResponse(
                    OffsetDateTime.now(),
                    401,
                    "UNAUTHORIZED",
                    "missing or invalid X-KB-Token",
                    request.getRequestURI(),
                    null);
            objectMapper.writeValue(response.getOutputStream(), body);
            return;
        }
        filterChain.doFilter(request, response);
    }
}
```

No separate `WebConfig` needed — Spring Boot registers `@Component` `Filter` beans automatically.

- [ ] **Step 5: Run TokenAuthFilterTest and full suite**

```bash
cd /workspace/dongzhiwei/knowledge-base/java-kernel
./mvnw -q -Dtest=TokenAuthFilterTest test
./mvnw -q test
```

Expected: all tests PASS (including existing 24). If any existing test fails due to accidental token in env, unset `KB_TOKEN` in the shell before re-running.

- [ ] **Step 6: Commit**

```bash
cd /workspace/dongzhiwei/knowledge-base
git add java-kernel/src/main/resources/application.properties \
  java-kernel/src/main/java/com/dongzhiwei/kb/config/TokenAuthFilter.java \
  java-kernel/src/test/java/com/dongzhiwei/kb/web/TokenAuthFilterTest.java
git commit -m "$(cat <<'EOF'
feat(java-kernel): optional X-KB-Token filter for /api/**

EOF
)"
```

---

### Task 2: Java port reporter (`KB_PORT_FILE` + `KB_READY`)

**Files:**
- Create: `java-kernel/src/main/java/com/dongzhiwei/kb/config/PortReporter.java`
- Test: `java-kernel/src/test/java/com/dongzhiwei/kb/config/PortReporterTest.java`
- Properties already added in Task 1 (`kb.port-file`)

**Interfaces:**
- Consumes: `WebServerApplicationContext#getWebServer().getPort()`, property `kb.port-file`
- Produces: file contents = decimal port digits only + newline optional; stdout exactly one debug line matching `KB_READY port=<n>`

- [ ] **Step 1: Write PortReporter unit test**

Create `java-kernel/src/test/java/com/dongzhiwei/kb/config/PortReporterTest.java`. Test the package-visible static helper `PortReporter.writePortFile` (keeps the suite free of Spring `ApplicationReadyEvent` constructor fragility); the `@EventListener` method in the implementation must call this helper.

```java
package com.dongzhiwei.kb.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class PortReporterTest {

    @TempDir Path temp;

    @Test
    void writePortFileOverwritesWithDigits() throws Exception {
        Path portFile = temp.resolve("nested/kb.port");
        PortReporter.writePortFile(portFile.toString(), 18080);
        PortReporter.writePortFile(portFile.toString(), 19090);
        assertThat(Files.readString(portFile, StandardCharsets.UTF_8).trim()).isEqualTo("19090");
    }

    @Test
    void writePortFileNoOpWhenPathBlank() throws Exception {
        PortReporter.writePortFile("  ", 1);
        PortReporter.writePortFile(null, 1);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /workspace/dongzhiwei/knowledge-base/java-kernel
./mvnw -q -Dtest=PortReporterTest test
```

Expected: FAIL — `PortReporter` missing.

- [ ] **Step 3: Implement PortReporter**

Create `java-kernel/src/main/java/com/dongzhiwei/kb/config/PortReporter.java`:

```java
package com.dongzhiwei.kb.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.context.WebServerApplicationContext;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

@Component
public class PortReporter {

    private static final Logger log = LoggerFactory.getLogger(PortReporter.class);

    private final String portFile;

    public PortReporter(@Value("${kb.port-file:}") String portFile) {
        this.portFile = portFile == null ? "" : portFile;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady(ApplicationReadyEvent event) {
        if (!(event.getApplicationContext() instanceof WebServerApplicationContext webCtx)) {
            return;
        }
        int port = webCtx.getWebServer().getPort();
        System.out.println("KB_READY port=" + port);
        try {
            writePortFile(portFile, port);
        } catch (IOException e) {
            log.error("failed to write KB_PORT_FILE={}", portFile, e);
            throw new IllegalStateException("failed to write KB_PORT_FILE=" + portFile, e);
        }
    }

    static void writePortFile(String path, int port) throws IOException {
        if (path == null || path.isBlank()) {
            return;
        }
        Path file = Path.of(path);
        Path parent = file.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Files.writeString(file, Integer.toString(port), StandardCharsets.UTF_8);
    }
}
```

- [ ] **Step 4: Run PortReporterTest + full suite**

```bash
cd /workspace/dongzhiwei/knowledge-base/java-kernel
./mvnw -q -Dtest=PortReporterTest test
./mvnw -q test
```

Expected: PASS.

- [ ] **Step 5: Manual smoke (optional but recommended)**

```bash
cd /workspace/dongzhiwei/knowledge-base/java-kernel
PORT_FILE=/tmp/kb-port-smoke.txt
rm -f "$PORT_FILE"
KB_PORT=0 KB_PORT_FILE="$PORT_FILE" KB_TOKEN=smoke \
  ./mvnw -q spring-boot:run &
PID=$!
for i in $(seq 1 60); do
  if [[ -s "$PORT_FILE" ]]; then break; fi
  sleep 0.5
done
PORT=$(tr -d '[:space:]' < "$PORT_FILE")
curl -s -H "X-KB-Token: smoke" "http://127.0.0.1:${PORT}/api/health"
echo
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:${PORT}/api/health"
kill $PID
wait $PID 2>/dev/null || true
```

Expected: first curl JSON contains `"status":"UP"`; second curl prints `401`.

- [ ] **Step 6: Commit**

```bash
cd /workspace/dongzhiwei/knowledge-base
git add java-kernel/src/main/java/com/dongzhiwei/kb/config/PortReporter.java \
  java-kernel/src/test/java/com/dongzhiwei/kb/config/PortReporterTest.java
git commit -m "$(cat <<'EOF'
feat(java-kernel): report bound port via KB_PORT_FILE and KB_READY

EOF
)"
```

---

### Task 3: Electron package scaffold + pure `token` / `kernelClient`

**Files:**
- Create: `electron/package.json`
- Create: `electron/tsconfig.json`
- Create: `electron/scripts/copy-renderer.mjs`
- Create: `electron/src/main/token.ts`
- Create: `electron/src/main/kernelClient.ts`
- Create: `electron/src/main/kernelClient.test.ts`
- Delete when replacing: `electron/src/main/.gitkeep` (and later preload/renderer gitkeeps in Tasks 4–5)

**Interfaces:**
- Consumes: Node 18+ `fetch`, `node:crypto`
- Produces:
  - `generateToken(): string` (64 hex chars from 32 bytes)
  - `KernelClient` / functions:
    - `createKernelClient(opts: { baseUrl: string; token: string; fetchImpl?: typeof fetch })`
    - `client.health(): Promise<{ status: string; app: string }>`
    - `client.createSnippet(body: { title: string; content?: string; tags?: string[] }): Promise<SnippetResponse>`
    - `client.search(q: string, limit?: number): Promise<SearchResponse>`
  - Every request sets header `X-KB-Token: <token>` and `Accept: application/json`

- [ ] **Step 1: Write package.json and tsconfig**

`electron/package.json`:

```json
{
  "name": "kb-electron",
  "version": "0.1.0",
  "private": true,
  "description": "个人开发知识库 - Electron 视图层",
  "main": "dist/main/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json && node scripts/copy-renderer.mjs",
    "test": "npm run build && node --test dist/main/kernelClient.test.js dist/main/token.test.js",
    "start": "npm run build && electron .",
    "package-kernel": "cd ../java-kernel && ./mvnw -DskipTests package"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "electron": "^33.2.0",
    "typescript": "^5.7.2"
  }
}
```

`electron/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

`electron/scripts/copy-renderer.mjs`:

```js
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src', 'renderer', 'index.html');
const destDir = join(root, 'dist', 'renderer');
const dest = join(destDir, 'index.html');
if (!existsSync(src)) {
  console.warn('copy-renderer: src/renderer/index.html not found yet (ok until Task 5)');
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('copied', dest);
```

- [ ] **Step 2: Write failing token + kernelClient tests**

`electron/src/main/token.ts` can be implemented with the test in the same task — first write:

`electron/src/main/token.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateToken } from './token';

test('generateToken returns 64 hex chars', () => {
  const a = generateToken();
  const b = generateToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.match(b, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});
```

`electron/src/main/kernelClient.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernelClient } from './kernelClient';

test('health sends X-KB-Token and parses body', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ status: 'UP', app: 'kb-kernel' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const client = createKernelClient({
    baseUrl: 'http://127.0.0.1:19090',
    token: 'secret',
    fetchImpl,
  });
  const body = await client.health();
  assert.deepEqual(body, { status: 'UP', app: 'kb-kernel' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:19090/api/health');
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get('X-KB-Token'), 'secret');
});

test('createSnippet POSTs JSON and returns snippet', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.equal(init?.method, 'POST');
    assert.equal(JSON.parse(String(init?.body)).title, 'Docker 清理');
    return new Response(
      JSON.stringify({
        id: 1,
        title: 'Docker 清理',
        content: 'docker system prune -af',
        tags: ['docker'],
        createTime: '2026-11-01T12:00:00',
        updateTime: '2026-11-01T12:00:00',
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
  };
  const client = createKernelClient({
    baseUrl: 'http://127.0.0.1:1',
    token: 't',
    fetchImpl,
  });
  const created = await client.createSnippet({
    title: 'Docker 清理',
    content: 'docker system prune -af',
    tags: ['docker', 'shell'],
  });
  assert.equal(created.id, 1);
  assert.deepEqual(created.tags, ['docker']);
});

test('search encodes q and limit', async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ query: 'docker', total: 0, hits: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const client = createKernelClient({ baseUrl: 'http://127.0.0.1:9', token: 't', fetchImpl });
  await client.search('docker prune', 10);
  assert.equal(urls[0], 'http://127.0.0.1:9/api/snippets/search?q=docker+prune&limit=10');
});

test('non-2xx throws with status and error code', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ status: 401, error: 'UNAUTHORIZED', message: 'nope', path: '/api/health' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  const client = createKernelClient({ baseUrl: 'http://127.0.0.1:1', token: 'bad', fetchImpl });
  await assert.rejects(() => client.health(), (err: Error & { status?: number; error?: string }) => {
    assert.equal(err.status, 401);
    assert.equal(err.error, 'UNAUTHORIZED');
    return true;
  });
});
```

- [ ] **Step 3: Implement token.ts and kernelClient.ts**

`electron/src/main/token.ts`:

```ts
import { randomBytes } from 'node:crypto';

/** 32-byte cryptographically random token, hex-encoded (64 chars). */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}
```

`electron/src/main/kernelClient.ts`:

```ts
export type SnippetRequest = {
  title: string;
  content?: string;
  tags?: string[];
};

export type SnippetResponse = {
  id: number;
  title: string;
  content: string;
  tags: string[];
  createTime: string;
  updateTime: string;
};

export type SearchHit = {
  snippet: SnippetResponse;
  score: number;
  matchedFields: string[];
};

export type SearchResponse = {
  query: string;
  total: number;
  hits: SearchHit[];
};

export type HealthResponse = {
  status: string;
  app: string;
};

export type KernelClientOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
};

export class KernelHttpError extends Error {
  readonly status: number;
  readonly error?: string;
  readonly path?: string;

  constructor(status: number, message: string, error?: string, path?: string) {
    super(message);
    this.name = 'KernelHttpError';
    this.status = status;
    this.error = error;
    this.path = path;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + path;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createKernelClient(opts: KernelClientOptions) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl;
  const token = opts.token;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('X-KB-Token', token);
    headers.set('Accept', 'application/json');
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetchImpl(joinUrl(baseUrl, path), { ...init, headers });
    const body = await parseJson(res);
    if (!res.ok) {
      const errBody = body as { message?: string; error?: string; path?: string } | undefined;
      throw new KernelHttpError(
        res.status,
        errBody?.message ?? `HTTP ${res.status}`,
        errBody?.error,
        errBody?.path,
      );
    }
    return body as T;
  }

  return {
    health(): Promise<HealthResponse> {
      return request<HealthResponse>('/api/health');
    },
    createSnippet(body: SnippetRequest): Promise<SnippetResponse> {
      return request<SnippetResponse>('/api/snippets', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    search(q: string, limit = 50): Promise<SearchResponse> {
      const qs = new URLSearchParams({ q, limit: String(limit) });
      return request<SearchResponse>(`/api/snippets/search?${qs.toString()}`);
    },
  };
}

export type KernelClient = ReturnType<typeof createKernelClient>;
```

- [ ] **Step 4: Install deps and run tests**

```bash
cd /workspace/dongzhiwei/knowledge-base/electron
# remove placeholder if present so tsc does not get confused (optional)
rm -f src/main/.gitkeep
npm install
npm test
```

Expected: `token` + `kernelClient` tests PASS. `copy-renderer` may warn that `index.html` is missing — that is OK until Task 5. If `npm test` fails because `copy-renderer` exits non-zero, keep the script exiting 0 when missing (as written).

If `tsc` fails because `main.ts` / preload are missing, add temporary stubs so the project compiles for tests only:

`electron/src/main/main.ts` (temporary until Task 4 replaces it):

```ts
// placeholder — replaced in Task 4
export {};
```

`electron/src/preload/preload.ts` (temporary):

```ts
// placeholder — replaced in Task 5
export {};
```

`electron/src/renderer/renderer.ts` (temporary):

```ts
// placeholder — replaced in Task 5
export {};
```

Then re-run `npm test`.

- [ ] **Step 5: Commit**

```bash
cd /workspace/dongzhiwei/knowledge-base
git add electron/package.json electron/package-lock.json electron/tsconfig.json \
  electron/scripts/copy-renderer.mjs \
  electron/src/main/token.ts electron/src/main/token.test.ts \
  electron/src/main/kernelClient.ts electron/src/main/kernelClient.test.ts \
  electron/src/main/main.ts electron/src/preload/preload.ts electron/src/renderer/renderer.ts
git add -u electron/src/main/.gitkeep electron/src/preload/.gitkeep electron/src/renderer/.gitkeep 2>/dev/null || true
git commit -m "$(cat <<'EOF'
feat(electron): scaffold TS package with token and kernel HTTP client

EOF
)"
```

Do not commit `node_modules/` or `dist/` (ensure `.gitignore` covers them — add under electron if missing):

If root `.gitignore` lacks electron build artifacts, append:

```gitignore
# Electron
electron/node_modules/
electron/dist/
```

Include that `.gitignore` update in the same commit if needed.

---

### Task 4: Kernel launcher + Electron main process

**Files:**
- Create: `electron/src/main/kernelLauncher.ts`
- Replace: `electron/src/main/main.ts`
- Modify: `electron/package.json` scripts only if needed (already has `package-kernel` / `start`)

**Interfaces:**
- Consumes: `generateToken`, `createKernelClient`, jar at `path.join(__dirname, '..', '..', '..', 'java-kernel', 'target', 'kb-kernel-0.1.0-SNAPSHOT.jar')` when running from `electron/dist/main` → resolve carefully (see code)
- Produces:
  - `startKernel(options): Promise<RunningKernel>`
  - `RunningKernel { port, token, client, stop(): Promise<void> }`
  - Env to child: `KB_PORT=0`, `KB_TOKEN`, `KB_PORT_FILE`, `KB_DATA_DIR` (under `app.getPath('userData')/kernel-data`)
  - On Electron `before-quit` / `will-quit`: `stop()` kills child process tree

- [ ] **Step 1: Implement kernelLauncher.ts**

```ts
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKernelClient, type KernelClient } from './kernelClient';
import { generateToken } from './token';

export type StartKernelOptions = {
  jarPath: string;
  javaPath?: string;
  dataDir: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  readyFetch?: typeof fetch;
};

export type RunningKernel = {
  port: number;
  token: string;
  client: KernelClient;
  stop: () => Promise<void>;
};

async function waitForPortFile(portFile: string, timeoutMs: number, pollIntervalMs: number): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const text = (await fs.readFile(portFile, 'utf8')).trim();
      if (text) {
        const port = Number(text);
        if (Number.isInteger(port) && port > 0) return port;
      }
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`timed out waiting for KB_PORT_FILE at ${portFile}`);
}

export async function startKernel(opts: StartKernelOptions): Promise<RunningKernel> {
  const token = generateToken();
  const portFile = path.join(os.tmpdir(), `kb-port-${process.pid}-${Date.now()}.txt`);
  await fs.rm(portFile, { force: true });
  await fs.mkdir(opts.dataDir, { recursive: true });

  const javaPath = opts.javaPath ?? 'java';
  const child: ChildProcessWithoutNullStreams = spawn(
    javaPath,
    ['-jar', opts.jarPath],
    {
      env: {
        ...process.env,
        KB_PORT: '0',
        KB_TOKEN: token,
        KB_PORT_FILE: portFile,
        KB_DATA_DIR: opts.dataDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let stderrBuf = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf8');
    if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000);
  });
  child.stdout.on('data', (chunk: Buffer) => {
    const line = chunk.toString('utf8');
    if (line.includes('KB_READY')) {
      process.stdout.write(line);
    }
  });

  const exitPromise = new Promise<never>((_resolve, reject) => {
    child.on('exit', (code, signal) => {
      reject(new Error(`kernel exited early code=${code} signal=${signal}: ${stderrBuf}`));
    });
    child.on('error', reject);
  });

  const pollIntervalMs = opts.pollIntervalMs ?? 200;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  let port: number;
  try {
    port = await Promise.race([
      waitForPortFile(portFile, timeoutMs, pollIntervalMs),
      exitPromise,
    ]);
  } catch (e) {
    child.kill('SIGTERM');
    throw e;
  }

  const client = createKernelClient({
    baseUrl: `http://127.0.0.1:${port}`,
    token,
    fetchImpl: opts.readyFetch,
  });

  const readyDeadline = Date.now() + timeoutMs;
  while (Date.now() < readyDeadline) {
    try {
      const health = await client.health();
      if (health.status === 'UP') break;
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  try {
    const health = await client.health();
    if (health.status !== 'UP') {
      throw new Error('kernel health not UP');
    }
  } catch (e) {
    child.kill('SIGTERM');
    throw new Error(`kernel did not become healthy: ${e instanceof Error ? e.message : e}`);
  }

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    child.removeAllListeners('exit');
    if (!child.killed) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    await fs.rm(portFile, { force: true });
  };

  return { port, token, client, stop };
}

/** Resolve jar relative to compiled main: electron/dist/main → repo/java-kernel/target/... */
export function defaultJarPath(): string {
  return path.resolve(__dirname, '..', '..', '..', 'java-kernel', 'target', 'kb-kernel-0.1.0-SNAPSHOT.jar');
}
```

- [ ] **Step 2: Implement main.ts**

Replace `electron/src/main/main.ts`:

```ts
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { defaultJarPath, startKernel, type RunningKernel } from './kernelLauncher';
import type { SnippetRequest } from './kernelClient';

let kernel: RunningKernel | null = null;
let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function registerIpc(): void {
  ipcMain.handle('kb:health', async () => {
    if (!kernel) throw new Error('kernel not started');
    return kernel.client.health();
  });
  ipcMain.handle('kb:createSnippet', async (_evt, body: SnippetRequest) => {
    if (!kernel) throw new Error('kernel not started');
    return kernel.client.createSnippet(body);
  });
  ipcMain.handle('kb:search', async (_evt, q: string, limit?: number) => {
    if (!kernel) throw new Error('kernel not started');
    return kernel.client.search(q, limit ?? 50);
  });
  ipcMain.handle('kb:meta', async () => {
    if (!kernel) throw new Error('kernel not started');
    return { port: kernel.port };
  });
}

async function boot(): Promise<void> {
  const jarPath = defaultJarPath();
  try {
    await fs.access(jarPath);
  } catch {
    throw new Error(
      `kernel jar not found at ${jarPath}. Run: cd java-kernel && ./mvnw -DskipTests package (or npm run package-kernel)`,
    );
  }
  const dataDir = path.join(app.getPath('userData'), 'kernel-data');
  kernel = await startKernel({ jarPath, dataDir });
  registerIpc();
  await createWindow();
}

const quitting = { done: false };

app.whenReady().then(boot).catch(async (err) => {
  console.error(err);
  if (kernel) await kernel.stop();
  app.exit(1);
});

app.on('before-quit', (e) => {
  if (quitting.done || !kernel) return;
  e.preventDefault();
  quitting.done = true;
  kernel.stop().finally(() => app.exit(0));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 3: Package kernel jar and typecheck**

```bash
cd /workspace/dongzhiwei/knowledge-base/electron
npm run package-kernel
npm run build
npm test
```

Expected: jar exists at `java-kernel/target/kb-kernel-0.1.0-SNAPSHOT.jar`; `tsc` succeeds; unit tests still PASS.

- [ ] **Step 4: Commit**

```bash
cd /workspace/dongzhiwei/knowledge-base
git add electron/src/main/kernelLauncher.ts electron/src/main/main.ts
git commit -m "$(cat <<'EOF'
feat(electron): launch Java kernel with token, port file, and IPC stubs

EOF
)"
```

---

### Task 5: Preload + minimal 联调 renderer

**Files:**
- Replace: `electron/src/preload/preload.ts`
- Create: `electron/src/renderer/index.html`
- Replace: `electron/src/renderer/renderer.ts`
- Delete: `electron/src/preload/.gitkeep`, `electron/src/renderer/.gitkeep` if still present

**Interfaces:**
- Consumes: IPC channels `kb:health`, `kb:createSnippet`, `kb:search`, `kb:meta`
- Produces: `window.kb` with those methods; UI shows health JSON, create form (title/content/tags CSV), search box + results

- [ ] **Step 1: Implement preload.ts**

```ts
import { contextBridge, ipcRenderer } from 'electron';

export type KbApi = {
  health: () => Promise<{ status: string; app: string }>;
  createSnippet: (body: { title: string; content?: string; tags?: string[] }) => Promise<unknown>;
  search: (q: string, limit?: number) => Promise<unknown>;
  meta: () => Promise<{ port: number }>;
};

const kb: KbApi = {
  health: () => ipcRenderer.invoke('kb:health'),
  createSnippet: (body) => ipcRenderer.invoke('kb:createSnippet', body),
  search: (q, limit) => ipcRenderer.invoke('kb:search', q, limit),
  meta: () => ipcRenderer.invoke('kb:meta'),
};

contextBridge.exposeInMainWorld('kb', kb);
```

- [ ] **Step 2: Implement index.html + renderer.ts**

`electron/src/renderer/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    />
    <title>知识库联调</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 16px; max-width: 880px; }
      section { border: 1px solid #ccc; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
      label { display: block; margin: 8px 0 4px; }
      input, textarea { width: 100%; box-sizing: border-box; }
      textarea { min-height: 80px; font-family: ui-monospace, monospace; }
      button { margin-right: 8px; margin-top: 8px; }
      pre { background: #f6f8fa; padding: 8px; overflow: auto; }
      .row { display: flex; gap: 8px; align-items: center; }
      .row input { flex: 1; }
    </style>
  </head>
  <body>
    <h1>个人开发知识库 · 联调页</h1>
    <p id="meta">端口：…</p>

    <section>
      <h2>Health</h2>
      <button id="btn-health" type="button">GET /api/health</button>
      <pre id="out-health"></pre>
    </section>

    <section>
      <h2>新建片段</h2>
      <label>title <input id="title" value="联调示例" /></label>
      <label>content <textarea id="content">console.log('kb')</textarea></label>
      <label>tags（逗号分隔） <input id="tags" value="demo,electron" /></label>
      <button id="btn-create" type="button">POST /api/snippets</button>
      <pre id="out-create"></pre>
    </section>

    <section>
      <h2>搜索</h2>
      <div class="row">
        <input id="q" value="联调" />
        <button id="btn-search" type="button">GET /api/snippets/search</button>
      </div>
      <pre id="out-search"></pre>
    </section>

    <script src="./renderer.js"></script>
  </body>
</html>
```

`electron/src/renderer/renderer.ts`:

```ts
type KbApi = {
  health: () => Promise<unknown>;
  createSnippet: (body: { title: string; content?: string; tags?: string[] }) => Promise<unknown>;
  search: (q: string, limit?: number) => Promise<unknown>;
  meta: () => Promise<{ port: number }>;
};

declare global {
  interface Window {
    kb: KbApi;
  }
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

function show(id: string, value: unknown): void {
  $(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function main(): Promise<void> {
  try {
    const meta = await window.kb.meta();
    $('meta').textContent = `内核端口：${meta.port}（经主进程 HTTP，带 X-KB-Token）`;
  } catch (e) {
    $('meta').textContent = `meta 失败：${e instanceof Error ? e.message : e}`;
  }

  $('btn-health').addEventListener('click', async () => {
    try {
      show('out-health', await window.kb.health());
    } catch (e) {
      show('out-health', e instanceof Error ? e.message : e);
    }
  });

  $('btn-create').addEventListener('click', async () => {
    const title = ($('title') as HTMLInputElement).value.trim();
    const content = ($('content') as HTMLTextAreaElement).value;
    const tagsRaw = ($('tags') as HTMLInputElement).value;
    const tags = tagsRaw
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      show('out-create', await window.kb.createSnippet({ title, content, tags }));
    } catch (e) {
      show('out-create', e instanceof Error ? e.message : e);
    }
  });

  $('btn-search').addEventListener('click', async () => {
    const q = ($('q') as HTMLInputElement).value.trim();
    try {
      show('out-search', await window.kb.search(q, 20));
    } catch (e) {
      show('out-search', e instanceof Error ? e.message : e);
    }
  });
}

void main();
```

- [ ] **Step 3: Build**

```bash
cd /workspace/dongzhiwei/knowledge-base/electron
rm -f src/preload/.gitkeep src/renderer/.gitkeep
npm run build
npm test
ls -la dist/main dist/preload dist/renderer
```

Expected: `dist/renderer/index.html` and `dist/renderer/renderer.js` exist; tests PASS.

- [ ] **Step 4: Manual Electron smoke (on the box if display/Xvfb available; otherwise skip and note in commit message)**

```bash
cd /workspace/dongzhiwei/knowledge-base/electron
npm run package-kernel
# If DISPLAY is set:
npm start
```

In the window: click Health → see `UP`; Create → see `id`; Search → see hit. Close window → Java child must exit (confirm with `pgrep -af kb-kernel` empty after quit).

If headless without Electron display, at least verify launcher via a small Node script is **not** required by this plan — document that GUI smoke is deferred. Do not block the commit on GUI.

- [ ] **Step 5: Commit**

```bash
cd /workspace/dongzhiwei/knowledge-base
git add electron/src/preload/preload.ts \
  electron/src/renderer/index.html \
  electron/src/renderer/renderer.ts
git add -u electron/src/preload/.gitkeep electron/src/renderer/.gitkeep 2>/dev/null || true
git commit -m "$(cat <<'EOF'
feat(electron): preload bridge and minimal health/search/create 联调 page

EOF
)"
```

---

### Task 6: README — Electron + token/port docs

**Files:**
- Modify: `README.md`

**Interfaces:**
- Documents real env/headers only: `KB_TOKEN`, `X-KB-Token`, `KB_PORT=0`, `KB_PORT_FILE`, `KB_DATA_DIR`
- Documents Electron scripts: `npm install`, `npm run package-kernel`, `npm start`, `npm test`

- [ ] **Step 1: Update README.md**

Replace/extend the root README so it keeps the existing Java section and adds Electron + auth. Full target content:

```markdown
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

### API

所有接口前缀 `http://127.0.0.1:<port>`，请求/响应均为 JSON。

当设置了 `KB_TOKEN` 时，**包括** `GET /api/health` 在内的所有 `/api/**` 请求都必须带请求头：

```http
X-KB-Token: <与 KB_TOKEN 相同的值>
```

否则返回 `401`，`error` 为 `UNAUTHORIZED`。

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

`error` 取值：`UNAUTHORIZED`、`NOT_FOUND`、`VALIDATION_FAILED`、`MALFORMED_REQUEST`、`BAD_REQUEST`、`METHOD_NOT_ALLOWED`、`UNSUPPORTED_MEDIA_TYPE`、`INTERNAL_ERROR`。

## Electron（electron）

TypeScript + Electron。主进程负责：生成一次性令牌、以 `KB_PORT=0` 拉起内核 jar、轮询 `KB_PORT_FILE`、带 `X-KB-Token` 调 HTTP、退出时结束子进程。当前窗口是 **联调页**（health / 新建一条 / 搜索），正式列表 UI 在后续步骤。

### 运行

需要本机已安装 Node.js 18+、JDK 17+，并能跑通上面的 Java 打包。

```bash
cd java-kernel && ./mvnw -DskipTests package   # 先打出 jar
cd ../electron
npm install
npm test          # token + kernelClient 单测
npm start         # 编译并启动 Electron（会自动拉起 jar）
```

也可在 `electron/` 下用 `npm run package-kernel` 触发一次 jar 打包。

联调页操作：点 Health → 应看到 `status: UP`；填写 title/content/tags → 新建；输入关键词 → 搜索。

数据目录默认在 Electron `userData/kernel-data`（由主进程设置 `KB_DATA_DIR`），与单独跑 Java 时的 `~/.knowledge-base/data` 分开，避免抢 H2 文件锁。
```

- [ ] **Step 2: Commit**

```bash
cd /workspace/dongzhiwei/knowledge-base
git add README.md
git commit -m "$(cat <<'EOF'
docs: Electron run steps and KB_TOKEN / KB_PORT_FILE contract

EOF
)"
```

---

## Self-review (author checklist)

| Spec item | Task |
| --- | --- |
| Electron TS main/preload/renderer | 3, 4, 5 |
| Launch kernel, wait health, open window | 4 |
| Startup token via `KB_TOKEN` + `X-KB-Token` | 1, 3, 4 |
| Blank token = open (Java-only dev) | 1 |
| Health requires token when configured | 1 |
| `KB_PORT=0` + `KB_PORT_FILE` + `KB_READY` | 2, 4 |
| Minimal 联调 page only | 5 |
| README env + Electron steps | 6 |
| No push / no docs branch edits | Global Constraints |
| TDD filter + client | 1, 2, 3 |

Placeholder scan: no TBD/TODO left in steps. Type names aligned: `createKernelClient`, `generateToken`, `startKernel`, `RunningKernel`, `X-KB-Token`, `UNAUTHORIZED`.

---

## Risks addressed by this plan

1. **Any local process could call the API** — Task 1 token filter; Electron always sets token (Task 4).
2. **Fixed port 17321 collisions + H2 single-writer** — `KB_PORT=0` + port file (Task 2); Electron uses `userData/kernel-data` as `KB_DATA_DIR` so GUI sessions do not lock the default `~/.knowledge-base/data` used by manual Java runs (Task 4 / README).
3. **Renderer cannot call Java (no CORS)** — IPC bridge only (Task 5); matches existing `SnippetControllerTest` CORS expectation.
4. **Existing MockMvc suite must stay green** — blank `kb.token` allows all; nested `@TestPropertySource` only in auth tests (Task 1).
5. **Jar missing at Electron start** — clear error pointing to `./mvnw -DskipTests package` / `npm run package-kernel` (Task 4).
6. **Out of scope (do not “fix” here):** `LocalDateTime` JVM-zone timestamps, Flyway, Lucene swap, full snippet list UI, plugin host — leave for later MVP steps / docs branch ADRs.

