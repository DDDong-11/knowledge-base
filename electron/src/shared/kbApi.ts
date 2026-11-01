/**
 * 渲染层 ⇄ preload ⇄ 主进程共享的类型与常量（唯一来源）。
 * 渲染层只能通过 window.kb 访问这些接口；所有数据由 Java 内核负责，Electron 只转发。
 */
export const SNIPPET_KINDS = ['CODE', 'NOTE', 'CLIP'] as const;
export type SnippetKind = (typeof SNIPPET_KINDS)[number];
export type SnippetSource = 'MANUAL' | 'CLIPBOARD' | 'ALMA';

export type Snippet = {
  id: number;
  title: string;
  content: string;
  tags: string[];
  kind: SnippetKind;
  source: SnippetSource;
  createTime: string;
  updateTime: string;
};

/** 渲染层可提交的字段；source 不对 UI 开放（由主进程丢弃） */
export type SnippetInput = { title: string; content?: string; tags?: string[]; kind?: SnippetKind };
export type SearchHit = { snippet: Snippet; score: number; matchedFields: string[] };
export type SearchResult = { query: string; total: number; hits: SearchHit[] };
export type SnippetPage = { items: Snippet[]; page: number; size: number; totalElements: number; totalPages: number };
export type Health = { status: string; app: string };
export type SearchOptions = { kind?: SnippetKind; limit?: number };
export type ListOptions = { page?: number; size?: number; kind?: SnippetKind };
export type FieldError = { field: string; message: string };
export type IpcError = { status: number; error: string; message: string; fieldErrors?: FieldError[] };
/** IPC 返回信封：错误经 IPC/contextBridge 会丢失自定义属性，因此不 throw，统一包成结果 */
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
  /** 面板每次显示时回调；返回取消订阅函数 */
  onPanelShown(cb: () => void): () => void;
};

/** 与 Java 内核校验一致的上限（内核仍是最终裁决者） */
export const LIMITS = {
  titleMax: 200,
  contentMax: 1_000_000,
  tagsMax: 20,
  tagMax: 40,
  queryMax: 200,
  searchLimitMax: 200,
  pageSizeMax: 100,
} as const;
