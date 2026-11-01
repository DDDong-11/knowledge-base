import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** 仅 dev server 下放宽 CSP（React Fast Refresh 需要内联脚本与 HMR websocket）；build 产物 CSP 保持原样 */
function devCsp(): Plugin {
  return {
    name: 'kb-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        /content="default-src 'self'; script-src 'self';/,
        `content="default-src 'self'; connect-src 'self' ws://localhost:* ws://127.0.0.1:*; script-src 'self' 'unsafe-inline';`,
      );
    },
  };
}

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), devCsp()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
});
