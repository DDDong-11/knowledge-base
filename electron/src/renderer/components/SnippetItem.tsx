import type { Snippet } from '../../shared/kbApi';
import { KIND_LABELS } from './KindFilter';

type Props = { snippet: Snippet; selected: boolean; onCopy(s: Snippet): void; onEdit(s: Snippet): void; onHover(): void };

export function SnippetItem({ snippet, selected, onCopy, onEdit, onHover }: Props) {
  const preview = snippet.content.split('\n').find((l) => l.trim()) ?? '';
  return (
    <li className={selected ? 'item selected' : 'item'} aria-selected={selected} role="option" onMouseEnter={onHover}>
      <button type="button" className="item-main" aria-label={`编辑 ${snippet.title}`} onClick={() => onEdit(snippet)}>
        <span className="item-title">
          <span className={`kind kind-${snippet.kind.toLowerCase()}`}>{KIND_LABELS[snippet.kind]}</span>
          <span>{snippet.title}</span>
        </span>
        {preview && <span className="item-preview">{preview.slice(0, 120)}</span>}
        {snippet.tags.length > 0 && <span className="item-tags">{snippet.tags.map((t) => `#${t}`).join(' ')}</span>}
      </button>
      <button type="button" className="copy-button" aria-label={`复制 ${snippet.title}`} onClick={() => onCopy(snippet)}>
        复制
      </button>
    </li>
  );
}
