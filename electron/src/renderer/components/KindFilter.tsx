import type { SnippetKind } from '../../shared/kbApi';

export const KIND_LABELS: Record<SnippetKind, string> = { CODE: '代码', NOTE: '笔记', CLIP: '摘录' };
const OPTIONS: { kind?: SnippetKind; label: string }[] = [
  { label: '全部' },
  { kind: 'CODE', label: KIND_LABELS.CODE },
  { kind: 'NOTE', label: KIND_LABELS.NOTE },
  { kind: 'CLIP', label: KIND_LABELS.CLIP },
];

export function KindFilter({ value, onChange }: { value?: SnippetKind; onChange(k?: SnippetKind): void }) {
  return (
    <div className="kind-filter" role="group" aria-label="类型筛选">
      {OPTIONS.map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={value === o.kind}
          className={value === o.kind ? 'chip active' : 'chip'}
          onClick={() => onChange(o.kind)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
