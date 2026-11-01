import { app, clipboard, ipcMain, type Tray } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { defaultJarPath, startKernel, type RunningKernel } from './kernelLauncher';
import { registerIpc } from './ipc';
import { createPanel, type Panel } from './panel';
import { createTray } from './tray';

// 边界：Electron 只做视图与转发，数据全部由 Java 内核负责。
let kernel: RunningKernel | null = null;
let panel: Panel | null = null;
let tray: Tray | null = null; // 保持引用，防止被 GC 后图标消失

const quitting = { done: false };

if (process.platform === 'darwin') app.dock?.hide(); // 菜单栏常驻应用，不显示 Dock 图标

async function boot(): Promise<void> {
  const jarPath = defaultJarPath();
  try {
    await fs.access(jarPath);
  } catch {
    throw new Error(
      `kernel jar not found at ${jarPath}. Run: cd java-kernel && ./mvnw -DskipTests package (or npm run package-kernel)`,
    );
  }
  const dataDir = path.join(app.getPath('userData'), 'kernel-data');
  kernel = await startKernel({
    jarPath,
    dataDir,
    onExit: ({ code, signal }) => {
      console.error(`kernel exited unexpectedly code=${code} signal=${signal}`);
      // Orderly quit; before-quit will call stop() (idempotent).
      app.quit();
    },
  });

  const p = createPanel({
    preloadPath: path.join(__dirname, '..', 'preload', 'preload.js'),
    rendererFile: path.join(__dirname, '..', 'renderer', 'index.html'),
    rendererUrl: process.env.KB_RENDERER_URL,
    pin: process.env.KB_PANEL_PIN === '1',
  });
  panel = p;
  p.window.on('close', (e) => {
    // 关闭 = 隐藏；真正退出只走托盘菜单「退出」
    if (!quitting.done) {
      e.preventDefault();
      p.hide();
    }
  });

  registerIpc({
    ipcMain,
    getKernel: () => kernel,
    isTrustedSender: (sender) => p.isTrusted(sender),
    writeClipboard: (text) => clipboard.writeText(text),
    hidePanel: () => p.hide(),
  });

  tray = createTray({
    iconPath: path.join(__dirname, '..', '..', 'assets', 'trayTemplate.png'),
    onToggle: (bounds) => p.toggle(bounds),
    onOpen: () => p.show(tray?.getBounds()),
    onQuit: () => app.quit(),
  });

  // Linux/Windows 托盘可能不可见（或 bounds 为 0），启动时先显示一次面板
  if (process.platform !== 'darwin') {
    p.window.once('ready-to-show', () => p.show(tray?.getBounds()));
  }
}

app.whenReady().then(boot).catch(async (err) => {
  console.error(err);
  if (kernel) await kernel.stop();
  // Mark quitting so before-quit does not preventDefault and force exit(0).
  quitting.done = true;
  app.exit(1);
});

app.on('before-quit', (e) => {
  if (quitting.done || !kernel) {
    quitting.done = true;
    return;
  }
  e.preventDefault();
  quitting.done = true;
  kernel.stop().finally(() => {
    panel?.destroy();
    tray?.destroy();
    app.exit(0);
  });
});

// 菜单栏常驻：所有窗口关闭也不退出
app.on('window-all-closed', () => {
  /* keep running */
});
