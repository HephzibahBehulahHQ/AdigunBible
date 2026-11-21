import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/compile-local-chapter.mjs <working-draft.md>');

const palette = /(?:❤️|🙏|✨|🔥|🫶|🌍|😭|👀|💯|🕊️)/gu;
const markup = /\[\[([a-z]+)\|([^|\]]+)\|([^|\]]+)\]\]/gu;
const word = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;
const emoji = /^(?:❤️|🙏|✨|🔥|🫶|🌍|😭|👀|💯|🕊️)/u;
const core = ['pcm', 'yo', 'de', 'he'];
const lines = readFileSync(source, 'utf8').split(/\r?\n/u).filter((line) => /^\d+\|/u.test(line));
const verses = [];
const glosses = {};

for (const line of lines) {
  const separator = line.indexOf('|');
  const number = Number(line.slice(0, separator));
  if (number !== verses.length + 1) throw new Error(`Expected verse ${verses.length + 1}, found ${number}`);
  const rows = [];
  const text = line.slice(separator + 1).replace(markup, (_, language, decorated, meaning) => {
    const phrase = decorated.replace(palette, '').trim();
    if (!phrase || !meaning.trim()) throw new Error(`Empty gloss in verse ${number}`);
    rows.push([phrase, meaning.trim(), language]);
    return decorated;
  });
  if (text.includes('[[') || text.includes(']]')) throw new Error(`Malformed gloss in verse ${number}`);
  for (const match of text.matchAll(word)) {
    if (!emoji.test(text.slice(match.index + match[0].length))) {
      throw new Error(`Verse ${number}: ${match[0]} has no palette emoji`);
    }
  }
  for (const language of core) {
    const count = rows.filter((row) => row[2] === language)
      .reduce((total, row) => total + row[0].split(' ').length, 0);
    if (count < 4) throw new Error(`Verse ${number}: ${language} has ${count} switch words, needs four`);
  }
  const covered = new Set(rows.flatMap(([phrase]) => [...phrase.matchAll(word)].map(([token]) => token.toLowerCase())));
  for (const match of text.matchAll(word)) {
    if (/[^\u0000-\u007f]/u.test(match[0]) && !covered.has(match[0].toLowerCase())) {
      throw new Error(`Verse ${number}: ${match[0]} has no hover gloss`);
    }
  }
  verses.push(`${number} ${text}`);
  glosses[number] = rows;
}

const stem = basename(source).replace(/ - Working Draft\.md$/u, '');
if (stem === basename(source)) throw new Error('Input name must end in " - Working Draft.md"');
writeFileSync(join(dirname(source), `${stem} - AdigunBible local draft.txt`), `${verses.join('\n\n')}\n`);
writeFileSync(join(dirname(source), `${stem} - Hover Glosses.json`), `${JSON.stringify(glosses, null, 2)}\n`);
console.log(`Compiled ${verses.length} verses and ${Object.values(glosses).reduce((sum, rows) => sum + rows.length, 0)} hover glosses`);
