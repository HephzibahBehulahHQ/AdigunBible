import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const chapter = Number(process.argv[2] ?? 2);
if (![2, 3, 4, 5, 6].includes(chapter)) throw new Error('Usage: node scripts/prepare-local-leviticus-2.mjs <2|3|4|5|6>');
const versesVar = { 2: 'leviticusSecond', 3: 'leviticusThird', 4: 'leviticusFourth', 5: 'leviticusFifth', 6: 'leviticusSixth' }[chapter];
const glossesVar = `${versesVar}Glosses`;
const base = execFileSync('git', ['show', `codex/leviticus-${chapter - 1}-language-gate:index.html`], {
  encoding: 'utf8', maxBuffer: 20_000_000,
});
const source = readFileSync(`Leviticus/Chapter ${chapter}.txt`, 'utf8');
const sourceNumbers = [...source.matchAll(new RegExp(`^Leviticus ${chapter}:([0-9]+) -->`, 'gmu'))].map((match) => Number(match[1]));
const draft = readFileSync(`Leviticus/Chapter ${chapter} - AdigunBible local draft.txt`, 'utf8');
const glosses = JSON.parse(readFileSync(`Leviticus/Chapter ${chapter} - Hover Glosses.json`, 'utf8'));
const verses = [...draft.matchAll(/^([0-9]+) (.+)$/gmu)].map((match, index) => {
  if (Number(match[1]) !== index + 1) throw new Error(`Unexpected draft verse ${match[1]}`);
  return match[2];
});
const expectedCount = { 2: 16, 3: 17, 4: 35, 5: 19, 6: 30 }[chapter];
if (verses.length !== expectedCount || sourceNumbers.length !== expectedCount || Object.keys(glosses).length !== expectedCount ||
    sourceNumbers.some((number, index) => number !== index + 1)) {
  throw new Error(`Leviticus ${chapter} source, draft, and gloss counts differ`);
}
const declaration = `const ${versesVar}=[\n${verses.map((verse) => `  ${JSON.stringify(verse)},`).join('\n')}\n];\n` +
  `const ${glossesVar}={\n${Object.entries(glosses).map(([number, rows]) => `  ${number}:${JSON.stringify(rows)},`).join('\n')}\n};\n`;
let candidate = base.replace('const books={', `${declaration}const books={`);
if (candidate === base) throw new Error('Missing book registry');
const previousEntry = candidate.match(/LEV:\{name:"Leviticus",count:27,position:"03",chapters:\{[^\n]+\},glosses:\{[^\n]+\}\}/u)?.[0];
if (!previousEntry) throw new Error('Missing previous Leviticus registry');
const title = { 2: 'Grain Offerings', 3: 'Peace Offerings', 4: 'Sin Offerings', 5: 'Sin and Guilt Offerings', 6: 'Restitution and Offering Rules' }[chapter];
const nextEntry = previousEntry
  .replace('}},glosses:{', `},${chapter}:{title:"${title}",verses:${versesVar},inReview:false}},glosses:{`)
  .replace(/\}\}$/u, `,${chapter}:${glossesVar}}}`);
if (nextEntry === previousEntry) throw new Error('Could not extend Leviticus registry');
candidate = candidate.replace(previousEntry, nextEntry);
writeFileSync(`Leviticus/.lev${chapter}-candidate.html`, candidate);

const reference = JSON.parse(readFileSync(`release-evidence/LEV-${chapter - 1}.json`, 'utf8'));
const evidence = {
  ...reference,
  chapter, versesVar, glossesVar, expectedVerseCount: verses.length,
  sourceFile: `Leviticus/Chapter ${chapter}.txt`,
  reviewedAt: new Date().toISOString(),
  languageReferences: {
    ...reference.languageReferences,
    de: `https://www.bibleserver.com/LUT/3.Mose${chapter}`,
    he: `https://www.sefaria.org/Leviticus.${chapter}?lang2=en&with=all`,
    fr: `https://saintebible.com/leviticus/${chapter}-1.htm`,
    ig: `https://www.bible.com/bible/77/LEV.${chapter}.IGBOB`,
    ha: `https://www.bible.com/fr/bible/71/LEV.${chapter}.HAU`,
    sw: `https://ebible.org/swhonen/LEV${String(chapter).padStart(2, '0')}.htm`,
  },
  verseReviews: Object.fromEntries(Array.from({ length: verses.length }, (_, index) => [String(index + 1), {
    voice: 'pass', meaning: 'pass', languages: 'pass', rendering: 'deferred',
  }])),
};
writeFileSync(`release-evidence/LEV-${chapter}.json`, `${JSON.stringify(evidence, null, 2)}\n`);
const gate = readFileSync('scripts/.release-gate-hardened.mjs', 'utf8');
const adaptedGate = gate.replace('const readerPath = path.join(root, "index.html");',
  `const readerPath = path.join(root, "Leviticus/.lev${chapter}-candidate.html");`)
  .replace('const skipManualReview = auditOnly || event === "--pr-draft";', 'const skipManualReview = false;');
if (adaptedGate === gate) throw new Error('Could not adapt gate');
writeFileSync(`scripts/.lev${chapter}-gate.mjs`, adaptedGate);
console.log(`Prepared LEV ${chapter}: ${verses.length} verses and ${Object.values(glosses).flat().length} glosses`);
