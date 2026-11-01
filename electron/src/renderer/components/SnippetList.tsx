import type { Snippet } from '../../shared/kbApi';
import { SnippetItem } from './SnippetItem';

type Props = {
  items: Snippet[];
  loading: boolean;
  searching: boolean;
  selected: number;
  onSelect(i: number): void;
  onCopy(s: Snippet): void;
  onEdit(s: Snippet): void;
};

export function SnippetList({ items, loading, searching, selected, onSelect, onCopy, onEdit }: Props) {
  if (items.length === 0) {
    return <p className="empty">{loading ? '加载中…' : searching ? '没有匹配的条目' : '还没有条目，点 ＋ 新建'}</p>;
  }
  return (
    <ul className="list" role="listbox" aria-label="条目">
      {items.map((s, i) => (
        <SnippetItem key={s.id} snippet={s} selected={i === selected} onCopy={onCopy} onEdit={onEdit} onHover={() => onSelect(i)} />
      ))}
    </ul>
  );
}
