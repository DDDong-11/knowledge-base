import { vi } from 'vitest';
import type { KbApi, Snippet } from '../../shared/kbApi';

export const snip = (id: number, title: string, content = `content ${id}`, extra: Partial<Snippet> = {}): Snippet => ({
  id,
  title,
  content,
  tags: [],
  kind: 'NOTE',
  source: 'MANUAL',
  createTime: '2026-11-02T10:00:00',
  updateTime: '2026-11-02T10:00:00',
  ...extra,
});

export const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });

export function installKb(items: Snippet[] = [snip(1, 'Docker 清理', 'docker system prune -af'), snip(2, 'Git 回滚', 'git reset --hard HEAD~1')]) {
  let shown: (() => void) | null = null;
  const kb = {
    health: vi.fn(() => ok({ status: 'UP', app: 'kb-kernel' })),
    meta: vi.fn(() => ok({ port: 17321 })),
    search: vi.fn((q: string) => ok({ query: q, total: items.length, hits: items.map((s) => ({ snippet: s, score: 1, matchedFields: ['title'] })) })),
    listSnippets: vi.fn(() => ok({ items, page: 0, size: 20, totalElements: items.length, totalPages: 1 })),
    getSnippet: vi.fn((id: number) => ok(items.find((s) => s.id === id) ?? snip(id, 'x'))),
    createSnippet: vi.fn((body: { title: string }) => ok(snip(99, body.title))),
    updateSnippet: vi.fn((id: number, body: { title: string }) => ok(snip(id, body.title))),
    deleteSnippet: vi.fn(() => ok(null)),
    copyText: vi.fn(() => ok(null)),
    hidePanel: vi.fn(() => ok(null)),
    onPanelShown: vi.fn((cb: () => void) => {
      shown = cb;
      return () => {
        shown = null;
      };
    }),
  };
  (window as unknown as { kb: KbApi }).kb = kb as unknown as KbApi;
  return { kb, firePanelShown: () => shown?.() };
}
