export {};

type KbApi = {
  health: () => Promise<unknown>;
  createSnippet: (body: { title: string; content?: string; tags?: string[] }) => Promise<unknown>;
  search: (q: string, limit?: number) => Promise<unknown>;
  meta: () => Promise<{ port: number }>;
};

declare global {
  interface Window {
    kb: KbApi;
  }
}
