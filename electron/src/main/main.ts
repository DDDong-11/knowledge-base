import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { defaultJarPath, startKernel, type RunningKernel } from './kernelLauncher';
import { registerIpc } from './ipc';

let kernel: RunningKernel | null = null;
let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

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
  registerIpc({
    ipcMain,
    getKernel: () => kernel,
    isTrustedSender: (sender) => mainWindow !== null && sender === mainWindow.webContents,
    writeClipboard: (text) => clipboard.writeText(text),
    hidePanel: () => mainWindow?.hide(),
  });
  await createWindow();
}

const quitting = { done: false };

app.whenReady().then(boot).catch(async (err) => {
  console.error(err);
  if (kernel) await kernel.stop();
  // Mark quitting so before-quit does not preventDefault and force exit(0).
  quitting.done = true;
  app.exit(1);
});

app.on('before-quit', (e) => {
  if (quitting.done || !kernel) return;
  e.preventDefault();
  quitting.done = true;
  kernel.stop().finally(() => app.exit(0));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
