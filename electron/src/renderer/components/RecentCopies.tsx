import { useState } from 'react';

/** 第 5 步占位：剪贴板历史留到后续步骤 */
export function RecentCopies() {
  const [open, setOpen] = useState(false);
  return (
    <section className="recent">
      <button type="button" className="recent-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} 最近复制
      </button>
      {open && <p className="muted">即将推出</p>}
    </section>
  );
}
