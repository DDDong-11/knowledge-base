import { contextBridge, ipcRenderer } from 'electron';

export type KbApi = {
  health: () => Promise<{ status: string; app: string }>;
  createSnippet: (body: { title: string; content?: string; tags?: string[] }) => Promise<unknown>;
  search: (q: string, limit?: number) => Promise<unknown>;
  meta: () => Promise<{ port: number }>;
};

const kb: KbApi = {
  health: () => ipcRenderer.invoke('kb:health'),
  createSnippet: (body) => ipcRenderer.invoke('kb:createSnippet', body),
  search: (q, limit) => ipcRenderer.invoke('kb:search', q, limit),
  meta: () => ipcRenderer.invoke('kb:meta'),
};

contextBridge.exposeInMainWorld('kb', kb);
