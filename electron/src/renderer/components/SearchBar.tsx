import { forwardRef, type KeyboardEvent } from 'react';

type Props = {
  value: string;
  onChange(v: string): void;
  onKeyDown(e: KeyboardEvent<HTMLInputElement>): void;
  onCreate(): void;
};

export const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar({ value, onChange, onKeyDown, onCreate }, ref) {
  return (
    <div className="search-bar">
      <input
        ref={ref}
        type="search"
        aria-label="搜索"
        placeholder="搜索标题、标签、内容…"
        autoFocus
        value={value}
        maxLength={200}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="button" className="icon-button" aria-label="新建" title="新建" onClick={onCreate}>
        ＋
      </button>
    </div>
  );
});
