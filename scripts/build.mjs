import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const [template, css] = await Promise.all(['index.html', 'styles.css'].map(name => readFile(path.join(root, name), 'utf8')));
const modules = await Promise.all(['dictionary.js', 'core.js', 'example.js', 'app.js'].map(name => readFile(path.join(root, 'src', name), 'utf8')));
// The fixed module list has only named exports and one-line local imports.
// Inline it so the distribution also works offline when opened as file://.
const javascript = modules.map(source => source.replace(/^import .+;\r?\n/gm, '').replace(/^export /gm, '')).join('\n');
const html = template.replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="./src/app.js"></script>', () => `<script type="module">${javascript.replace(/<\/script/gi, '<\\/script')}</script>`);
await writeFile(path.join(dist, 'index.html'), html);
await cp(path.join(root, 'public'), dist, { recursive: true });
console.log('Built static application in dist/');
