import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve, sep } from 'node:path';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../site/', import.meta.url));
const pages = (await readdir(root)).filter(file => file.endsWith('.html'));
let references = 0;
for (const page of pages) {
  const filename = join(root, page);
  const html = await readFile(filename, 'utf8');
  assert.match(html, /<html lang="en">/, `${page}: declare a language`);
  assert.match(html, /name="viewport"/, `${page}: needs responsive viewport`);
  assert.match(html, /<main\b/, `${page}: main landmark required`);
  assert.match(html, /<header\b/, `${page}: header landmark required`);
  assert.match(html, /<footer\b/, `${page}: footer landmark required`);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${page}: one h1`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${page}: duplicate IDs`);
  for (const image of html.matchAll(/<img\b[^>]*>/g)) assert.match(image[0], /\balt="[^"]*"/, `${page}: missing alt`);
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const value = match[1];
    assert(!value.startsWith('/'), `${page}: root-relative URL breaks repository subpaths: ${value}`);
    assert(!/^https?:/.test(value), `${page}: unexpected remote request: ${value}`);
    const [path, fragment] = value.split('#');
    const target = path ? resolve(dirname(filename), path) : filename;
    assert(target === resolve(root) || target.startsWith(resolve(root) + sep), `${page}: path outside site`);
    const actual = (await stat(target)).isDirectory() ? join(target, 'index.html') : target;
    assert((await stat(actual)).isFile(), `${page}: missing ${value}`);
    if (fragment) {
      const targetHtml = await readFile(actual, 'utf8');
      assert(targetHtml.includes(`id="${fragment}"`), `${page}: broken anchor ${value}`);
    }
    references++;
  }
}
new Script(await readFile(join(root, 'script.js'), 'utf8'));
const config = JSON.parse(await readFile(join(root, 'staticwebapp.config.json'), 'utf8'));
assert(config.globalHeaders['Content-Security-Policy'].includes("connect-src 'none'"));
const js = await readFile(join(root, 'script.js'), 'utf8');
assert(!/\b(fetch|XMLHttpRequest|localStorage|sessionStorage)\b|document\.cookie/.test(js), 'No remote calls or stored data expected');
console.log(`PASS: ${pages.length} HTML pages, ${references} local references/anchors, image alternatives, unique IDs, JavaScript syntax, and Azure configuration.`);
console.log('Browser QA is still needed for layout, keyboard behavior, and interactive controls.');
