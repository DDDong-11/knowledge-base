// 运行在 sandbox:true 的 preload 中：只能 import 'electron'，其余仅类型导入（编译后被擦除）。
import { contextBridge, ipcRenderer } from 'electron';
import type { KbApi } from '../shared/kbApi';

const kb: KbApi = {
  health: () => ipcRenderer.invoke('kb:health'),
  meta: () => ipcRenderer.invoke('kb:meta'),
  search: (q, opts) => ipcRenderer.invoke('kb:search', q, opts ?? {}),
  listSnippets: (opts) => ipcRenderer.invoke('kb:listSnippets', opts ?? {}),
  getSnippet: (id) => ipcRenderer.invoke('kb:getSnippet', id),
  createSnippet: (body) => ipcRenderer.invoke('kb:createSnippet', body),
  updateSnippet: (id, body) => ipcRenderer.invoke('kb:updateSnippet', id, body),
  deleteSnippet: (id) => ipcRenderer.invoke('kb:deleteSnippet', id),
  copyText: (text) => ipcRenderer.invoke('kb:copyText', text),
  hidePanel: () => ipcRenderer.invoke('kb:hidePanel'),
  onPanelShown: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('kb:panelShown', listener);
    return () => {
      ipcRenderer.removeListener('kb:panelShown', listener);
    };
  },
};

contextBridge.exposeInMainWorld('kb', kb);
