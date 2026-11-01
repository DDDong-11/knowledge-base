import { BrowserWindow, screen } from 'electron';
import { computePanelPosition, PANEL_SIZE, shouldShowOnToggle, type Rect } from './panelPosition';

export type Panel = {
  window: BrowserWindow;
  show(trayBounds?: Rect): void;
  hide(): void;
  toggle(trayBounds?: Rect): void;
  isTrusted(sender: unknown): boolean;
  destroy(): void;
};

export type PanelOptions = {
  preloadPath: string;
  rendererFile: string;
  /** 开发时的 Vite dev server（KB_RENDERER_URL），仅接受本机 http 地址 */
  rendererUrl?: string;
  /** KB_PANEL_PIN=1：失焦不隐藏，便于调试 */
  pin: boolean;
};

const ZERO: Rect = { x: 0, y: 0, width: 0, height: 0 };

export function isAllowedDevUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

export function createPanel(opts: PanelOptions): Panel {
  const win = new BrowserWindow({
    width: PANEL_SIZE.width,
    height: PANEL_SIZE.height,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 菜单栏面板应在当前 Space / 全屏应用之上弹出，而不是把用户拽回原来的桌面
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  let lastBlurHideAt = 0;
  if (!opts.pin) {
    win.on('blur', () => {
      if (!win.isVisible()) return;
      lastBlurHideAt = Date.now();
      win.hide();
    });
  }

  if (opts.rendererUrl !== undefined && !isAllowedDevUrl(opts.rendererUrl)) {
    console.warn(`ignoring KB_RENDERER_URL=${opts.rendererUrl}: only http://localhost or http://127.0.0.1 allowed`);
  }
  const load = isAllowedDevUrl(opts.rendererUrl) ? win.loadURL(opts.rendererUrl) : win.loadFile(opts.rendererFile);
  load.catch((err) => console.error('panel failed to load renderer', err));

  const show = (trayBounds?: Rect) => {
    const bounds = trayBounds ?? ZERO;
    const anchor = trayBounds ? { x: bounds.x, y: bounds.y } : screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(anchor);
    const { x, y } = computePanelPosition(bounds, PANEL_SIZE, display.workArea);
    win.setPosition(x, y, false);
    win.show();
    win.focus();
    win.webContents.send('kb:panelShown');
  };
  const hide = () => {
    if (!win.isDestroyed()) win.hide();
  };

  return {
    window: win,
    show,
    hide,
    toggle: (trayBounds) => {
      if (win.isVisible()) hide();
      else if (shouldShowOnToggle({ visible: false, lastBlurHideAt, now: Date.now() })) show(trayBounds);
    },
    isTrusted: (sender) => !win.isDestroyed() && sender === win.webContents,
    destroy: () => {
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
