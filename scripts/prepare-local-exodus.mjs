import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const chapter = Number(process.argv[2]);
const versesVar = process.argv[3];
const title = process.argv[4];
const reviewed = process.argv.includes('--nonvisual-reviewed');
if (!Number.isInteger(chapter) || chapter < 2 || chapter > 40 || !/^[A-Za-z_$][\w$]*$/u.test(versesVar ?? '') || !title) {
  throw new Error('Usage: node scripts/prepare-local-exodus.mjs <chapter> <versesVar> <title> [--nonvisual-reviewed]');
}

const previous = chapter - 1;
const base = execFileSync('git', ['show', `codex/exodus-${previous}-language-gate:index.html`], {
  encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
});
const priorEvidence = JSON.parse(readFileSync(`release-evidence/EXO-${previous}.json`, 'utf8'));
const source = readFileSync(`Exodus/Chapter ${chapter}.txt`, 'utf8');
const sourceNumbers = [...source.matchAll(new RegExp(`^Exodus ${chapter}:([0-9]+) -->`, 'gmu'))].map((match) => Number(match[1]));
const draft = readFileSync(`Exodus/Chapter ${chapter} - AdigunBible local draft.txt`, 'utf8');
const glosses = JSON.parse(readFileSync(`Exodus/Chapter ${chapter} - Hover Glosses.json`, 'utf8'));
const verses = [...draft.matchAll(/^([0-9]+) (.+)$/gmu)].map((match, index) => {
  if (Number(match[1]) !== index + 1) throw new Error(`Unexpected draft verse ${match[1]}`);
  return match[2];
});
if (!verses.length || verses.length !== sourceNumbers.length || Object.keys(glosses).length !== verses.length ||
    sourceNumbers.some((number, index) => number !== index + 1)) {
  throw new Error(`Exodus ${chapter} source, draft, and gloss verse counts differ`);
}

const glossesVar = `${versesVar}Glosses`;
const declaration = `const ${versesVar}=[\n${verses.map((verse) => `  ${JSON.stringify(verse)},`).join('\n')}\n];\nconst ${glossesVar}={\n${Object.entries(glosses).map(([number, rows]) => `  ${number}:${JSON.stringify(rows)},`).join('\n')}\n};\n`;
let candidate = base.replace('const books={', `${declaration}const books={`);
if (candidate === base) throw new Error('Could not insert chapter declarations');
const previousEntry = `${previous}:{title:`;
const chapterPattern = new RegExp(`(${previousEntry.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}"[^"]+",verses:${priorEvidence.versesVar},inReview:false\\})`, 'u');
if (!chapterPattern.test(candidate)) throw new Error(`Missing Exodus ${previous} reader entry`);
candidate = candidate.replace(chapterPattern, `$1,${chapter}:{title:${JSON.stringify(title)},verses:${versesVar},inReview:${!reviewed}}`);
const previousGlossEntry = `${previous}:${priorEvidence.glossesVar}}`;
if (!candidate.includes(previousGlossEntry)) throw new Error(`Missing Exodus ${previous} glossary entry`);
candidate = candidate.replace(previousGlossEntry, `${previous}:${priorEvidence.glossesVar},${chapter}:${glossesVar}}`);
writeFileSync(`Exodus/.exo${chapter}-candidate.html`, candidate);

const references = Object.fromEntries(Object.entries(priorEvidence.languageReferences).map(([language, url]) => [
  language,
  url.replaceAll(`EXO${previous}`, `EXO${chapter}`)
    .replaceAll(`EXO.${previous}`, `EXO.${chapter}`)
    .replaceAll(`2.Mose${previous}`, `2.Mose${chapter}`)
    .replaceAll(`Exodus.${previous}`, `Exodus.${chapter}`)
    .replaceAll(`exodus/${previous}`, `exodus/${chapter}`)
    .replaceAll(`exo${previous}`, `exo${chapter}`),
]));
references.ig = `https://www.bible.com/bible/77/EXO.${chapter}.IGBOB`;
const evidence = {
  ...priorEvidence,
  chapter,
  versesVar,
  glossesVar,
  expectedVerseCount: verses.length,
  sourceFile: `Exodus/Chapter ${chapter}.txt`,
  status: reviewed ? 'passed_with_visual_deferral' : 'in_progress',
  reviewer: reviewed ? 'Codex' : '',
  reviewedAt: reviewed ? new Date().toISOString() : null,
  languageReferences: references,
  checks: Object.fromEntries(Object.keys(priorEvidence.checks).map((key) => [
    key, key === 'readerRendering' ? 'deferred' : reviewed ? 'pass' : 'pending',
  ])),
  verseReviews: Object.fromEntries(Array.from({ length: verses.length }, (_, index) => [String(index + 1), {
    voice: reviewed ? 'pass' : 'pending',
    meaning: reviewed ? 'pass' : 'pending',
    languages: reviewed ? 'pass' : 'pending',
    rendering: 'deferred',
  }])),
};
writeFileSync(`release-evidence/EXO-${chapter}.json`, `${JSON.stringify(evidence, null, 2)}\n`);
const gate = readFileSync('scripts/release-gate.mjs', 'utf8');
const adaptedGate = gate
  .replace('const readerPath = path.join(root, "index.html");', `const readerPath = path.join(root, "Exodus/.exo${chapter}-candidate.html");`)
  .replace('const skipManualReview = auditOnly || event === "--pr-draft";', `const skipManualReview = ${!reviewed};`);
if (adaptedGate === gate) throw new Error('Could not adapt release gate to local candidate');
writeFileSync(`scripts/.exo${chapter}-gate.mjs`, adaptedGate);
console.log(`Prepared EXO ${chapter}: ${verses.length} source and draft verses, ${Object.values(glosses).flat().length} glosses`);
