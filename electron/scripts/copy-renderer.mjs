import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src', 'renderer', 'index.html');
const destDir = join(root, 'dist', 'renderer');
const dest = join(destDir, 'index.html');
if (!existsSync(src)) {
  console.warn('copy-renderer: src/renderer/index.html not found yet (ok until Task 5)');
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('copied', dest);
