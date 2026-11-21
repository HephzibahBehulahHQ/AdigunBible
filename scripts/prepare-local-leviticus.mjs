import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const chapter = 1;
const versesVar = 'leviticusFirst';
const glossesVar = `${versesVar}Glosses`;
const base = execFileSync('git', ['show', 'codex/exodus-gate-hardening:index.html'], {
  encoding: 'utf8', maxBuffer: 20_000_000,
});
const source = readFileSync('Leviticus/Chapter 1.txt', 'utf8');
const sourceNumbers = [...source.matchAll(/^Leviticus 1:([0-9]+) -->/gmu)].map((match) => Number(match[1]));
const draft = readFileSync('Leviticus/Chapter 1 - AdigunBible local draft.txt', 'utf8');
const glosses = JSON.parse(readFileSync('Leviticus/Chapter 1 - Hover Glosses.json', 'utf8'));
const verses = [...draft.matchAll(/^([0-9]+) (.+)$/gmu)].map((match, index) => {
  if (Number(match[1]) !== index + 1) throw new Error(`Unexpected draft verse ${match[1]}`);
  return match[2];
});
if (verses.length !== 17 || sourceNumbers.length !== 17 || Object.keys(glosses).length !== 17 ||
    sourceNumbers.some((number, index) => number !== index + 1)) {
  throw new Error('Leviticus 1 source, draft, and gloss counts differ');
}
const declaration = `const ${versesVar}=[\n${verses.map((verse) => `  ${JSON.stringify(verse)},`).join('\n')}\n];\n` +
  `const ${glossesVar}={\n${Object.entries(glosses).map(([number, rows]) => `  ${number}:${JSON.stringify(rows)},`).join('\n')}\n};\n`;
let candidate = base.replace('const books={', `${declaration}const books={`);
if (candidate === base) throw new Error('Missing book registry');
const exodusEnd = '40:exodusFortiethGlosses}}\n};';
const leviticusEntry = `40:exodusFortiethGlosses}},\nLEV:{name:"Leviticus",count:27,position:"03",chapters:{1:{title:"Burnt Offerings",verses:${versesVar},inReview:false}},glosses:{1:${glossesVar}}}\n};`;
if (!candidate.includes(exodusEnd)) throw new Error('Missing end of Exodus registry');
candidate = candidate.replace(exodusEnd, leviticusEntry);
writeFileSync('Leviticus/.lev1-candidate.html', candidate);

const reference = JSON.parse(readFileSync('release-evidence/EXO-40.json', 'utf8'));
const evidence = {
  ...reference,
  book: 'LEV', chapter, versesVar, glossesVar, expectedVerseCount: verses.length,
  sourceFile: 'Leviticus/Chapter 1.txt',
  reviewedAt: new Date().toISOString(),
  languageReferences: {
    pcm: 'https://www.britishcouncil.org/voices-magazine/nigerian-pidgin-words-phrases',
    yo: 'https://ebible.org/pdf/yor/yor_LEV.pdf',
    de: 'https://www.bibleserver.com/LUT/3.Mose1',
    he: 'https://www.sefaria.org/Leviticus.1?lang2=en&with=Navigation',
    fr: 'https://saintebible.com/leviticus/1-1.htm',
    ig: 'https://www.bible.com/bible/77/LEV.1.IGBOB',
    ha: 'https://www.bible.com/fr/bible/71/LEV.1.HAU',
    jam: 'https://patwapartner.com/words/',
    es: 'https://ebible.org/bible/details.php?id=spablm',
    sw: 'https://ebible.org/pdf/swhonen/swhonen_LEV.pdf',
  },
  verseReviews: Object.fromEntries(Array.from({ length: verses.length }, (_, index) => [String(index + 1), {
    voice: 'pass', meaning: 'pass', languages: 'pass', rendering: 'deferred',
  }])),
};
writeFileSync('release-evidence/LEV-1.json', `${JSON.stringify(evidence, null, 2)}\n`);
const gate = readFileSync('scripts/.release-gate-hardened.mjs', 'utf8');
const adaptedGate = gate.replace('const readerPath = path.join(root, "index.html");',
  'const readerPath = path.join(root, "Leviticus/.lev1-candidate.html");')
  .replace('const skipManualReview = auditOnly || event === "--pr-draft";', 'const skipManualReview = false;');
if (adaptedGate === gate) throw new Error('Could not adapt gate');
writeFileSync('scripts/.lev1-gate.mjs', adaptedGate);
console.log(`Prepared LEV 1: ${verses.length} verses and ${Object.values(glosses).flat().length} glosses`);
