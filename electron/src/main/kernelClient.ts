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
