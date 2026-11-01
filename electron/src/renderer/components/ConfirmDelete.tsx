import { useState } from 'react';

export function ConfirmDelete({ onConfirm, busy }: { onConfirm(): void; busy?: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="danger-link" onClick={() => setAsking(true)}>
        删除
      </button>
    );
  }
  return (
    <span className="confirm-delete">
      <button type="button" className="danger" disabled={busy} onClick={onConfirm}>
        确认删除
      </button>
      <button type="button" aria-label="取消删除" onClick={() => setAsking(false)}>
        取消
      </button>
    </span>
  );
}
