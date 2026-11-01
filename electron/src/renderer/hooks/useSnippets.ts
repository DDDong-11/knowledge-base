import { useEffect, useRef, useState } from 'react';
import type { Snippet, SnippetKind } from '../../shared/kbApi';
import { kb, KbError, toKbError } from '../api/kb';

export const RECENT_SIZE = 20;
export const SEARCH_LIMIT = 50;

/** 空查询 → 最近更新的 20 条；否则 → 全文搜索。递增序号丢弃过期响应。 */
export function useSnippets({ q, kind, refreshKey }: { q: string; kind?: SnippetKind; refreshKey: number }) {
  const [items, setItems] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<KbError | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    const query = q.trim();
    setLoading(true);
    const req = query
      ? kb.search(query, { ...(kind ? { kind } : {}), limit: SEARCH_LIMIT }).then((r) => r.hits.map((h) => h.snippet))
      : kb.listSnippets({ size: RECENT_SIZE, ...(kind ? { kind } : {}) }).then((p) => p.items);
    req.then(
      (list) => {
        if (my !== seq.current) return;
        setItems(list);
        setError(null);
        setLoading(false);
      },
      (e) => {
        if (my !== seq.current) return;
        setError(toKbError(e));
        setLoading(false);
      },
    );
  }, [q, kind, refreshKey]);

  return { items, loading, error };
}
