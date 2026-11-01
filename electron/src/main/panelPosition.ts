export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

export const PANEL_SIZE: Size = { width: 360, height: 480 };
export const PANEL_MARGIN = 8;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * 计算面板左上角位置（纯函数，便于测试）。
 * - 水平：以托盘图标为中心，夹在工作区内并留 MARGIN。
 * - 垂直：图标在工作区上半部（macOS 菜单栏 / 顶部面板）→ 图标下方；否则（底部任务栏）→ 图标上方；再夹到工作区内。
 * - 托盘 bounds 全 0（Linux 常见）→ 工作区右上角。
 */
export function computePanelPosition(tray: Rect, panel: Size, workArea: Rect): { x: number; y: number } {
  const wa = workArea;
  if (tray.x === 0 && tray.y === 0 && tray.width === 0 && tray.height === 0) {
    return { x: wa.x + wa.width - panel.width - PANEL_MARGIN, y: wa.y + PANEL_MARGIN };
  }
  const x = clamp(
    Math.round(tray.x + tray.width / 2 - panel.width / 2),
    wa.x + PANEL_MARGIN,
    wa.x + wa.width - panel.width - PANEL_MARGIN,
  );
  const upperHalf = tray.y + tray.height / 2 <= wa.y + wa.height / 2;
  const rawY = upperHalf ? tray.y + tray.height : tray.y - panel.height;
  const y = clamp(Math.round(rawY), wa.y, wa.y + wa.height - panel.height);
  return { x, y };
}

/**
 * macOS：面板可见时点击菜单栏图标，会先触发面板 blur（→ 隐藏），随后才触发 tray click。
 * 若 click 只看 isVisible() 会把刚隐藏的面板又弹出来，导致「点图标收不起来」。
 * 在 blur 隐藏后的短窗口内，把 toggle 视为「收起」。
 */
export const BLUR_TOGGLE_GRACE_MS = 250;

export function shouldShowOnToggle(s: { visible: boolean; lastBlurHideAt: number; now: number }): boolean {
  if (s.visible) return false;
  return s.now - s.lastBlurHideAt >= BLUR_TOGGLE_GRACE_MS;
}
