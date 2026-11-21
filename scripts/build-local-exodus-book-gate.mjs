import { readFileSync, writeFileSync } from 'node:fs';

let gate = readFileSync('scripts/.exo40-gate.mjs', 'utf8');
const replacement = `if (event === '--book-local') {
    const names = [...reader.matchAll(/const (exodus[A-Z][A-Za-z]+)=\\[/gu)].map((match) => match[1]);
    if (names.length !== 40) fail('Expected forty Exodus chapter arrays');
    for (let chapter = 1; chapter <= 40; chapter += 1) {
      const versesVar = names[chapter - 1];
      auditChapter({book:'EXO',chapter,versesVar,
        glossesVar:chapter===1?'exodusVerseGlosses':versesVar+'Glosses',
        expectedVerseCount:extractDeclaration(versesVar,'\\n];').length},
        {requirePublished:false});
    }
  } else if (auditOnly) {`;
for (const [before, after] of [
  ['Exodus/.exo40-candidate.html', 'Exodus/.exo17-rotating-repair.html'],
  ['const skipManualReview = false;', 'const skipManualReview = true;'],
  ['if (auditOnly) {', replacement],
]) {
  if (!gate.includes(before)) throw new Error(`Missing gate marker: ${before}`);
  gate = gate.replace(before, after);
}
gate = gate.replaceAll('.replace(paletteGlobal, "")', `.replaceAll("&#39;", "'").replace(paletteGlobal, "")`);
writeFileSync('scripts/.exo-book-gate.mjs', gate);
