import type {
  FieldError,
  IpcResult,
  KbApi,
  ListOptions,
  SearchOptions,
  SnippetInput,
} from '../../shared/kbApi';

/** 渲染层统一错误：由 IPC 信封 {ok:false,error} 还原 */
export class KbError extends Error {
  readonly status: number;
  readonly error: string;
  readonly fieldErrors?: FieldError[];

  constructor(status: number, error: string, message: string, fieldErrors?: FieldError[]) {
    super(message);
    this.name = 'KbError';
    this.status = status;
    this.error = error;
    this.fieldErrors = fieldErrors;
  }
}

function bridge(): KbApi {
  const api = (window as { kb?: KbApi }).kb;
  if (!api) throw new KbError(0, 'NO_BRIDGE', 'window.kb 不可用（未在 Electron 面板中运行？）');
  return api;
}

export async function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T> {
  const r = await p;
  if (r.ok) return r.data;
  throw new KbError(r.error.status, r.error.error, r.error.message, r.error.fieldErrors);
}

export const kb = {
  health: async () => unwrap(bridge().health()),
  meta: async () => unwrap(bridge().meta()),
  search: async (q: string, opts?: SearchOptions) => unwrap(bridge().search(q, opts)),
  listSnippets: async (opts?: ListOptions) => unwrap(bridge().listSnippets(opts)),
  getSnippet: async (id: number) => unwrap(bridge().getSnippet(id)),
  createSnippet: async (body: SnippetInput) => unwrap(bridge().createSnippet(body)),
  updateSnippet: async (id: number, body: SnippetInput) => unwrap(bridge().updateSnippet(id, body)),
  deleteSnippet: async (id: number) => unwrap(bridge().deleteSnippet(id)),
  copyText: async (text: string) => unwrap(bridge().copyText(text)),
  hidePanel: async () => unwrap(bridge().hidePanel()),
  onPanelShown: (cb: () => void): (() => void) => {
    const api = (window as { kb?: KbApi }).kb;
    return api ? api.onPanelShown(cb) : () => {};
  },
};

export const toKbError = (e: unknown): KbError =>
  e instanceof KbError ? e : new KbError(0, 'UNKNOWN', e instanceof Error ? e.message : String(e));
