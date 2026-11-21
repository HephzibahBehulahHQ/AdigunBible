import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

let gate = execFileSync('git', ['show', 'codex/exodus-6-gloss-repair:scripts/release-gate.mjs'], {
  encoding: 'utf8', maxBuffer: 2_000_000,
});
function once(before, after) {
  if (gate.split(before).length !== 2) throw new Error(`Expected one gate marker: ${before.slice(0, 80)}`);
  gate = gate.replace(before, after);
}
const helpers = `function decodeHtmlText(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}
function normalizeGlossPhrase(value) {
  return [...decodeHtmlText(value).replace(paletteGlobal, "").matchAll(/[\\p{L}\\p{M}]+(?:['’\\-][\\p{L}\\p{M}]+)*/gu)]
    .map(([word]) => word).join(" ");
}
`;
once('const coreLanguages = ["pcm", "yo", "de", "he"];',
  helpers + 'const coreLanguages = ["pcm", "yo", "de", "he"];');
once('const chapterLanguages = ["fr", "ig", "ha", "jam"];',
  'const chapterLanguages = ["fr", "ig", "ha", "jam"];\nconst rotatingLanguages = ["es", "ar", "pt", "sw", "hi", "zh", "tl", "ko", "ja", "it", "nl"];');
const renderedPhrase = 'span[3].replace(paletteGlobal, "")';
if (gate.split(renderedPhrase).length !== 3) throw new Error('Expected two rendered phrase readers');
gate = gate.replaceAll(renderedPhrase, 'decodeHtmlText(span[3]).replace(paletteGlobal, "")');
once('decodeHtmlText(span[3]).replace(paletteGlobal, "").trim() === visiblePhrase',
  'normalizeGlossPhrase(span[3]) === normalizeGlossPhrase(visiblePhrase)');
once('span[1] === meaning', 'span[1] === escapeHtml(meaning)');
once('if (/[^\\u0000-\\u007f]/u.test(token[0])',
  `if (/[^\\u0000-\\u007f]/u.test(token[0].replaceAll('’', "'"))`);
once('  if (!skipManualReview) {',
  `  const rotatingUsed = rotatingLanguages.filter((language) => (languageTotals[language] ?? 0) > 0);
  if (rotatingUsed.length < 2) fail(\`\${book} \${chapter} needs two rotating languages; found \${rotatingUsed.length}\`);

  if (!skipManualReview) {`);
const sequenceCheck = `    const expected = canonicalSequence[lastReleased + 1];
    if (\`\${evidence.book}-\${evidence.chapter}\` !== expected) {
      fail(\`Next chapter release must be \${expected}; found \${evidence.book}-\${evidence.chapter}\`);
    }`;
const revisedSequenceCheck = `    const expected = canonicalSequence[lastReleased + 1];
    const chapterId = \`\${evidence.book}-\${evidence.chapter}\`;
    const sequenceIndex = canonicalSequence.indexOf(chapterId);
    const isRevision = released.has(chapterId) || sequenceIndex <= releaseBaseline;
    if (!isRevision && chapterId !== expected) {
      fail(\`Next chapter release must be \${expected}; found \${chapterId}\`);
    }`;
once(sequenceCheck, revisedSequenceCheck);
once('    if (JSON.stringify(beforeVerses) === JSON.stringify(afterVerses)',
  '    if (isRevision && (!beforeVerses || !beforeGlosses)) fail(`${evidence.book} ${evidence.chapter}: revision needs existing reader content`);\n    if (JSON.stringify(beforeVerses) === JSON.stringify(afterVerses)');
writeFileSync('scripts/.release-gate-hardened.mjs', gate);
console.log('Prepared scripts/.release-gate-hardened.mjs');
