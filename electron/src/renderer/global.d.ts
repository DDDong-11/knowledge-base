import type { KbApi } from '../shared/kbApi';

declare global {
  interface Window {
    kb: KbApi;
  }
}
export {};
