export function StatusBar({ ok, text, toast }: { ok: boolean; text: string; toast?: string }) {
  return (
    <footer className="status-bar">
      <span className={ok ? 'dot ok' : 'dot bad'} aria-hidden="true" />
      <span className="status-text">{text}</span>
      {toast && (
        <span className="toast" role="status">
          {toast}
        </span>
      )}
    </footer>
  );
}
