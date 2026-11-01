import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { LIMITS, SNIPPET_KINDS, type Snippet, type SnippetKind } from '../../shared/kbApi';
import { kb, toKbError } from '../api/kb';
import { ConfirmDelete } from './ConfirmDelete';
import { ErrorBanner } from './ErrorBanner';
import { KIND_LABELS } from './KindFilter';

type Props = { id?: number; onSaved(s: Snippet): void; onDeleted(): void; onCancel(): void };

export const parseTags = (raw: string): string[] =>
  raw
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);

export function SnippetEditor({ id, onSaved, onDeleted, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [kind, setKind] = useState<SnippetKind>('NOTE');
  const [loading, setLoading] = useState(id !== undefined);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === undefined) return;
    let alive = true;
    kb.getSnippet(id).then(
      (s) => {
        if (!alive) return;
        setTitle(s.title);
        setContent(s.content ?? '');
        setTags(s.tags.join(', '));
        setKind(s.kind);
        setLoading(false);
      },
      (e) => {
        if (!alive) return;
        setError(toKbError(e).message);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFieldErrors({});
    setError(null);
    const body = { title, content, tags: parseTags(tags), kind };
    try {
      const saved = id === undefined ? await kb.createSnippet(body) : await kb.updateSnippet(id, body);
      onSaved(saved);
    } catch (err) {
      const ke = toKbError(err);
      if (ke.fieldErrors?.length) {
        setFieldErrors(Object.fromEntries(ke.fieldErrors.map((f) => [f.field.replace(/\[\d+\]$/, ''), f.message])));
      } else {
        setError(ke.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (id === undefined) return;
    setBusy(true);
    try {
      await kb.deleteSnippet(id);
      onDeleted();
    } catch (err) {
      setError(toKbError(err).message);
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const fieldError = (name: string) =>
    fieldErrors[name] ? (
      <span className="field-error" id={`err-${name}`}>
        {fieldErrors[name]}
      </span>
    ) : null;

  return (
    <form className="editor" onSubmit={save} onKeyDown={onKeyDown} aria-busy={loading || busy}>
      <header className="editor-header">
        <h1>{id === undefined ? '新建条目' : '编辑条目'}</h1>
      </header>
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
      <label htmlFor="f-title">标题</label>
      <input id="f-title" autoFocus value={title} maxLength={LIMITS.titleMax} disabled={loading} onChange={(e) => setTitle(e.target.value)} />
      {fieldError('title')}
      <label htmlFor="f-content">正文</label>
      <textarea id="f-content" className="mono" value={content} disabled={loading} onChange={(e) => setContent(e.target.value)} />
      {fieldError('content')}
      <div className="row">
        <div className="col">
          <label htmlFor="f-tags">标签</label>
          <input id="f-tags" placeholder="逗号分隔" value={tags} disabled={loading} onChange={(e) => setTags(e.target.value)} />
          {fieldError('tags')}
        </div>
        <div>
          <label htmlFor="f-kind">类型</label>
          <select id="f-kind" value={kind} disabled={loading} onChange={(e) => setKind(e.target.value as SnippetKind)}>
            {SNIPPET_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
          {fieldError('kind')}
        </div>
      </div>
      <footer className="editor-actions">
        {id !== undefined && <ConfirmDelete onConfirm={remove} busy={busy} />}
        <span className="spacer" />
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="primary" disabled={loading || busy}>
          保存
        </button>
      </footer>
    </form>
  );
}
