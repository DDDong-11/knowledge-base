import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { defaultJarPath, startKernel, type RunningKernel } from './kernelLauncher';
import type { SnippetRequest } from './kernelClient';

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

function registerIpc(): void {
  ipcMain.handle('kb:health', async () => {
    if (!kernel) throw new Error('kernel not started');
    return kernel.client.health();
  });
  ipcMain.handle('kb:createSnippet', async (_evt, body: SnippetRequest) => {
    if (!kernel) throw new Error('kernel not started');
    return kernel.client.createSnippet(body);
  });
  ipcMain.handle('kb:search', async (_evt, q: string, limit?: number) => {
    if (!kernel) throw new Error('kernel not started');
    return kernel.client.search(q, limit ?? 50);
  });
  ipcMain.handle('kb:meta', async () => {
    if (!kernel) throw new Error('kernel not started');
    return { port: kernel.port };
  });
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
  kernel = await startKernel({ jarPath, dataDir });
  registerIpc();
  await createWindow();
}

const quitting = { done: false };

app.whenReady().then(boot).catch(async (err) => {
  console.error(err);
  if (kernel) await kernel.stop();
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
