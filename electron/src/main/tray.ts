import { Menu, nativeImage, Tray } from 'electron';
import type { Rect } from './panelPosition';

export type TrayOptions = {
  iconPath: string;
  onToggle(bounds: Rect): void;
  onOpen(): void;
  onQuit(): void;
};

export function createTray(opts: TrayOptions): Tray {
  const img = nativeImage.createFromPath(opts.iconPath);
  img.setTemplateImage(true); // macOS 按菜单栏明暗自动反色
  const tray = new Tray(img);
  tray.setToolTip('知识库');

  const menu = Menu.buildFromTemplate([
    { label: '打开面板', click: () => opts.onOpen() },
    { type: 'separator' },
    { label: '退出', click: () => opts.onQuit() },
  ]);

  tray.on('click', (_e, bounds) => opts.onToggle(bounds));
  tray.on('right-click', () => tray.popUpContextMenu(menu));
  // Linux 下 click 事件不一定触发，挂上菜单作为兜底；macOS 不能挂（否则左键也弹菜单）
  if (process.platform !== 'darwin') tray.setContextMenu(menu);
  return tray;
}
