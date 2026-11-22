import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';

const output = new URL('../dist-worker/', import.meta.url);
const repository = new URL('../', import.meta.url);
const books = ['Matthew', 'Mark', 'Luke', 'John'];

await rm(output, { recursive: true, force: true });
await mkdir(new URL('reader/', output), { recursive: true });
const reader = await readFile(new URL('index.html', repository), 'utf8');
const signOut = '<form method="post" action="/sign-out" style="padding:1rem"><button type="submit">Sign out of AdigunBible</button></form>';
await writeFile(new URL('reader/index.html', output), reader.replace('<body>', '<body>' + signOut));

for (const book of books) {
  await mkdir(new URL(`reader/${book}/`, output), { recursive: true });
  for (const file of await readdir(new URL(`${book}/`, repository))) {
    if (/^(?:chapter-\d+|render-verse)\.js$/.test(file)) {
      await cp(new URL(`${book}/${file}`, repository), new URL(`reader/${book}/${file}`, output));
    }
  }
}

