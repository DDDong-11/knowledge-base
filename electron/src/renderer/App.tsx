import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Snippet, SnippetKind } from '../shared/kbApi';
import { kb, toKbError } from './api/kb';
import { ErrorBanner } from './components/ErrorBanner';
import { KindFilter } from './components/KindFilter';
import { RecentCopies } from './components/RecentCopies';
import { SearchBar } from './components/SearchBar';
import { SnippetEditor } from './components/SnippetEditor';
import { SnippetList } from './components/SnippetList';
import { StatusBar } from './components/StatusBar';
import { useDebounced } from './hooks/useDebounced';
import { useSnippets } from './hooks/useSnippets';

type View = { mode: 'list' } | { mode: 'edit'; id?: number };

export const DEBOUNCE_MS = 200;
export const HIDE_AFTER_COPY_MS = 600;

export function App() {
  const [view, setView] = useState<View>({ mode: 'list' });
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<SnippetKind | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState(0);
  const [toast, setToast] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string }>({ ok: true, text: '连接内核…' });
  const searchRef = useRef<HTMLInputElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const debouncedQ = useDebounced(q, DEBOUNCE_MS);
  const { items, loading, error } = useSnippets({ q: debouncedQ, kind, refreshKey });

  useEffect(() => setBanner(error ? error.message : null), [error]);
  useEffect(() => setSelected(0), [items]);

  const refreshStatus = useCallback(async () => {
    try {
      await kb.health();
      const meta = await kb.meta();
      setStatus({ ok: true, text: `内核正常 · 端口 ${meta.port}` });
    } catch (e) {
      setStatus({ ok: false, text: `内核不可用：${toKbError(e).message}` });
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const off = kb.onPanelShown(() => {
      clearTimeout(hideTimer.current);
      setToast(undefined);
      setRefreshKey((k) => k + 1);
      void refreshStatus();
      searchRef.current?.focus();
      searchRef.current?.select();
    });
    return () => {
      off();
      clearTimeout(hideTimer.current);
    };
  }, [refreshStatus]);

  const copy = async (s: Snippet) => {
    try {
      await kb.copyText(s.content ?? '');
      setToast('已复制');
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setToast(undefined);
        void kb.hidePanel().catch(() => {});
      }, HIDE_AFTER_COPY_MS);
    } catch (e) {
      setBanner(toKbError(e).message);
    }
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (q) setQ('');
      else void kb.hidePanel().catch(() => {});
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = items[selected];
      if (s) void copy(s);
    }
  };

  const backToList = () => {
    setView({ mode: 'list' });
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="app">
      {view.mode === 'edit' ? (
        <SnippetEditor key={view.id ?? 'new'} id={view.id} onSaved={backToList} onDeleted={backToList} onCancel={() => setView({ mode: 'list' })} />
      ) : (
        <>
          <SearchBar ref={searchRef} value={q} onChange={setQ} onKeyDown={onSearchKey} onCreate={() => setView({ mode: 'edit' })} />
          <KindFilter value={kind} onChange={setKind} />
          {banner && <ErrorBanner message={banner} onClose={() => setBanner(null)} />}
          <SnippetList
            items={items}
            loading={loading}
            searching={debouncedQ.trim() !== ''}
            selected={selected}
            onSelect={setSelected}
            onCopy={copy}
            onEdit={(s) => setView({ mode: 'edit', id: s.id })}
          />
          <RecentCopies />
        </>
      )}
      <StatusBar ok={status.ok} text={status.text} toast={toast} />
    </div>
  );
}
