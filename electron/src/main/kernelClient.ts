import type {
  FieldError,
  Health,
  ListOptions,
  SearchOptions,
  SearchResult,
  Snippet,
  SnippetInput,
  SnippetPage,
} from '../shared/kbApi';

export type KernelClientOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
};

export class KernelHttpError extends Error {
  readonly status: number;
  readonly error?: string;
  readonly path?: string;
  readonly fieldErrors?: FieldError[];

  constructor(status: number, message: string, error?: string, path?: string, fieldErrors?: FieldError[]) {
    super(message);
    this.name = 'KernelHttpError';
    this.status = status;
    this.error = error;
    this.path = path;
    this.fieldErrors = fieldErrors;
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

function query(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `?${s}` : '';
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
      const errBody = body as
        | { message?: string; error?: string; path?: string; fieldErrors?: FieldError[] }
        | undefined;
      throw new KernelHttpError(
        res.status,
        errBody?.message ?? `HTTP ${res.status}`,
        errBody?.error,
        errBody?.path,
        errBody?.fieldErrors ?? undefined,
      );
    }
    return (body === undefined ? null : body) as T;
  }

  return {
    health(): Promise<Health> {
      return request<Health>('/api/health');
    },
    listSnippets(o: ListOptions = {}): Promise<SnippetPage> {
      return request<SnippetPage>(`/api/snippets${query({ page: o.page, size: o.size, kind: o.kind })}`);
    },
    getSnippet(id: number): Promise<Snippet> {
      return request<Snippet>(`/api/snippets/${id}`);
    },
    createSnippet(body: SnippetInput): Promise<Snippet> {
      return request<Snippet>('/api/snippets', { method: 'POST', body: JSON.stringify(body) });
    },
    updateSnippet(id: number, body: SnippetInput): Promise<Snippet> {
      return request<Snippet>(`/api/snippets/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    },
    deleteSnippet(id: number): Promise<null> {
      return request<null>(`/api/snippets/${id}`, { method: 'DELETE' });
    },
    search(q: string, o: SearchOptions = {}): Promise<SearchResult> {
      return request<SearchResult>(`/api/snippets/search${query({ q, limit: o.limit ?? 50, kind: o.kind })}`);
    },
  };
}

export type KernelClient = ReturnType<typeof createKernelClient>;
