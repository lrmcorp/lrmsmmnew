import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const pattern = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}]/u;
let failures = 0;
async function scan(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name === '.git' || item.name === 'vendor') continue;
    const path = join(dir, item.name);
    if (item.isDirectory()) { await scan(path); continue; }
    if (!/\.(js|css|html)$/.test(item.name) || path === import.meta.filename) continue;
    const lines = (await readFile(path, 'utf8')).split('\n');
    lines.forEach((line, index) => { if (pattern.test(line)) { console.error(`${path}:${index + 1}`); failures++; } });
  }
}
await scan(root);
if (failures) process.exitCode = 1;
else console.log('No interface emoji or pictographs found.');
