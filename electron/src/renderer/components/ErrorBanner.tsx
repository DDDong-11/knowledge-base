export function ErrorBanner({ message, onClose }: { message: string; onClose(): void }) {
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      <button type="button" className="icon-button" aria-label="关闭错误" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
