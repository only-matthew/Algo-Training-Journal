import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve('katex'));
const target = fileURLToPath(new URL('../vendor/katex/', import.meta.url));
fs.mkdirSync(path.join(target, 'fonts'), { recursive: true });
for (const name of ['katex.min.js', 'katex.min.css']) fs.copyFileSync(path.join(dist, name), path.join(target, name));
fs.copyFileSync(path.join(dist, 'contrib/auto-render.min.js'), path.join(target, 'auto-render.min.js'));
fs.copyFileSync(path.join(dist, '../LICENSE'), path.join(target, 'LICENSE'));
for (const name of fs.readdirSync(path.join(dist, 'fonts'))) {
  fs.copyFileSync(path.join(dist, 'fonts', name), path.join(target, 'fonts', name));
}
console.log(`Synced KaTeX ${require('katex').version} from the locked npm package.`);
