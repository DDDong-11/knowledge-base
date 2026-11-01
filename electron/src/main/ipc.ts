import type { IpcError, IpcResult } from '../shared/kbApi';
import { KernelHttpError, type KernelClient } from './kernelClient';
import {
  IpcValidationError,
  validateCopyText,
  validateId,
  validateListOptions,
  validateSearchArgs,
  validateSnippetInput,
} from './ipcValidation';

export type IpcDeps = {
  ipcMain: { handle(channel: string, fn: (event: { sender: unknown }, ...args: unknown[]) => unknown): void };
  getKernel(): { port: number; client: KernelClient } | null;
  isTrustedSender(sender: unknown): boolean;
  writeClipboard(text: string): void;
  hidePanel(): void;
};

export const IPC_CHANNELS = [
  'kb:health',
  'kb:meta',
  'kb:search',
  'kb:listSnippets',
  'kb:getSnippet',
  'kb:createSnippet',
  'kb:updateSnippet',
  'kb:deleteSnippet',
  'kb:copyText',
  'kb:hidePanel',
] as const;

class KernelUnavailableError extends Error {}
class ForbiddenError extends Error {}

export function toIpcError(err: unknown): IpcError {
  if (err instanceof ForbiddenError) return { status: 403, error: 'FORBIDDEN', message: err.message };
  if (err instanceof IpcValidationError) return { status: 400, error: 'INVALID_ARGUMENT', message: err.message };
  if (err instanceof KernelUnavailableError) return { status: 503, error: 'KERNEL_UNAVAILABLE', message: err.message };
  if (err instanceof KernelHttpError) {
    const e: IpcError = { status: err.status, error: err.error ?? `HTTP_${err.status}`, message: err.message };
    if (err.fieldErrors) e.fieldErrors = err.fieldErrors;
    return e;
  }
  const message = err instanceof Error ? err.message : String(err);
  return { status: 503, error: 'KERNEL_UNREACHABLE', message: `kernel unreachable: ${message}` };
}

export function registerIpc(deps: IpcDeps): void {
  const kernel = () => {
    const k = deps.getKernel();
    if (!k) throw new KernelUnavailableError('kernel not started');
    return k;
  };

  type Channel = (typeof IPC_CHANNELS)[number];
  const handle = (channel: Channel, fn: (...args: unknown[]) => unknown) => {
    deps.ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<unknown>> => {
      try {
        if (!deps.isTrustedSender(event.sender)) throw new ForbiddenError('untrusted sender');
        const data = await fn(...args);
        return { ok: true, data: data ?? null };
      } catch (e) {
        return { ok: false, error: toIpcError(e) };
      }
    });
  };

  handle('kb:health', () => kernel().client.health());
  handle('kb:meta', () => ({ port: kernel().port }));
  handle('kb:search', (q, opts) => {
    const v = validateSearchArgs(q, opts);
    return kernel().client.search(v.q, v.opts);
  });
  handle('kb:listSnippets', (opts) => kernel().client.listSnippets(validateListOptions(opts)));
  handle('kb:getSnippet', (id) => kernel().client.getSnippet(validateId(id)));
  handle('kb:createSnippet', (body) => kernel().client.createSnippet(validateSnippetInput(body)));
  handle('kb:updateSnippet', (id, body) => {
    const vid = validateId(id);
    return kernel().client.updateSnippet(vid, validateSnippetInput(body));
  });
  handle('kb:deleteSnippet', (id) => kernel().client.deleteSnippet(validateId(id)));
  handle('kb:copyText', (text) => {
    deps.writeClipboard(validateCopyText(text));
    return null;
  });
  handle('kb:hidePanel', () => {
    deps.hidePanel();
    return null;
  });
}
