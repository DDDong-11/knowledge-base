import { LIMITS, SNIPPET_KINDS, type ListOptions, type SearchOptions, type SnippetInput, type SnippetKind } from '../shared/kbApi';

/** 渲染层传入的参数不可信：主进程在转发给内核前做形状 / 上限校验 */
export class IpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IpcValidationError';
  }
}

const fail = (m: string): never => {
  throw new IpcValidationError(m);
};
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function intIn(v: unknown, name: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) {
    fail(`${name} must be an integer in [${min}, ${max}]`);
  }
  return v as number;
}

function strMax(v: unknown, name: string, max: number): string {
  if (typeof v !== 'string') fail(`${name} must be a string`);
  if ((v as string).length > max) fail(`${name} must be at most ${max} characters`);
  return v as string;
}

function optionsObject(v: unknown, name: string): Record<string, unknown> {
  if (v === undefined) return {};
  if (!isPlainObject(v)) fail(`${name} must be an object`);
  return v as Record<string, unknown>;
}

export function validateId(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) fail('id must be a positive integer');
  return v as number;
}

export function validateKind(v: unknown, optional = false): SnippetKind | undefined {
  if (v === undefined && optional) return undefined;
  if (typeof v !== 'string' || !(SNIPPET_KINDS as readonly string[]).includes(v)) {
    fail(`kind must be one of ${SNIPPET_KINDS.join(', ')}`);
  }
  return v as SnippetKind;
}

export function validateSearchArgs(q: unknown, opts: unknown): { q: string; opts: SearchOptions } {
  const trimmed = strMax(q, 'q', Number.MAX_SAFE_INTEGER).trim();
  if (!trimmed) fail('q must not be blank');
  if (trimmed.length > LIMITS.queryMax) fail(`q must be at most ${LIMITS.queryMax} characters`);
  const o = optionsObject(opts, 'options');
  const out: SearchOptions = {};
  const kind = validateKind(o.kind, true);
  if (kind) out.kind = kind;
  if (o.limit !== undefined) out.limit = intIn(o.limit, 'limit', 1, LIMITS.searchLimitMax);
  return { q: trimmed, opts: out };
}

export function validateListOptions(opts: unknown): ListOptions {
  const o = optionsObject(opts, 'options');
  const out: ListOptions = {};
  if (o.page !== undefined) out.page = intIn(o.page, 'page', 0, Number.MAX_SAFE_INTEGER);
  if (o.size !== undefined) out.size = intIn(o.size, 'size', 1, LIMITS.pageSizeMax);
  const kind = validateKind(o.kind, true);
  if (kind) out.kind = kind;
  return out;
}

/** 只保留白名单字段；source 等多余字段被丢弃（UI 不能伪造来源） */
export function validateSnippetInput(body: unknown): SnippetInput {
  if (!isPlainObject(body)) fail('body must be an object');
  const b = body as Record<string, unknown>;
  const out: SnippetInput = { title: strMax(b.title, 'title', LIMITS.titleMax) };
  if (b.content !== undefined) out.content = strMax(b.content, 'content', LIMITS.contentMax);
  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags)) fail('tags must be an array');
    const tags = b.tags as unknown[];
    if (tags.length > LIMITS.tagsMax) fail(`at most ${LIMITS.tagsMax} tags`);
    out.tags = tags.map((t) => strMax(t, 'tag', LIMITS.tagMax));
  }
  const kind = validateKind(b.kind, true);
  if (kind) out.kind = kind;
  return out;
}

export function validateCopyText(text: unknown): string {
  return strMax(text, 'text', LIMITS.contentMax);
}
