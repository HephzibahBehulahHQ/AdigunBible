import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const ref = process.argv[2] ?? 'codex/exodus-40-language-gate';
const reader = execFileSync('git', ['show', `${ref}:index.html`], {
  encoding: 'utf8',
  maxBuffer: 20_000_000,
});
const expected = [22, 25, 22, 31, 23, 30, 25, 32, 35, 29, 10, 51, 22, 31, 27, 36, 16, 27, 25, 26, 36, 31, 33, 18, 40, 37, 21, 43, 46, 38, 18, 35, 23, 35, 35, 38, 29, 31, 43, 38];
const vars = [...reader.matchAll(/const (exodus[A-Z][A-Za-z]+)=\[/gu)].map((match) => match[1]);
if (vars.length !== 40) throw new Error(`Expected 40 Exodus arrays, found ${vars.length}`);
function declaration(name, close) {
  const start = reader.indexOf(`const ${name}=`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const valueStart = start + `const ${name}=`.length;
  const end = reader.indexOf(close, valueStart);
  if (end < 0) throw new Error(`Unclosed ${name}`);
  return vm.runInNewContext(`(${reader.slice(valueStart, end + close.length - 1)})`, Object.create(null));
}
const core = ['pcm', 'yo', 'de', 'he'];
const chapterLanguages = ['fr', 'ig', 'ha', 'jam'];
const rotatingLanguages = ['es', 'ar', 'pt', 'sw', 'hi', 'zh', 'tl', 'ko', 'ja', 'it', 'nl'];
const palette = /^(?:❤️|🙏|✨|🔥|🫶|🌍|😭|👀|💯|🕊️)/u;
const wordPattern = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;
let countProblems = 0;
let quotaProblems = 0;
let emojiProblems = 0;
let chapterLanguageProblems = 0;
let navigationProblems = 0;
let glossaryProblems = 0;
const deficientChapters = new Set();
const samples = [];
const chapterShortfalls = [];
for (let chapter = 1; chapter <= 40; chapter += 1) {
  const name = vars[chapter - 1];
  const verses = declaration(name, '\n];');
  const glosses = declaration(chapter === 1 ? 'exodusVerseGlosses' : `${name}Glosses`, '\n};');
  const chapterGlosses = Array.isArray(glosses['1']) ? glosses : glosses[String(chapter)];
  if (verses.length !== expected[chapter - 1]) countProblems += 1;
  const totals = Object.create(null);
  const navigation = new RegExp(`${chapter}:\\{title:[^}]*verses:${name}(?:,inReview:(true|false))?\\}`);
  const navMatch = reader.slice(reader.indexOf('EXO:{'), reader.indexOf('glosses:{', reader.indexOf('EXO:{'))).match(navigation);
  if (!navMatch || navMatch[1] === 'true') { navigationProblems += 1; deficientChapters.add(chapter); }
  for (let index = 0; index < verses.length; index += 1) {
    const verse = verses[index];
    const rows = chapterGlosses?.[String(index + 1)];
    if (!Array.isArray(rows)) { glossaryProblems += 1; deficientChapters.add(chapter); continue; }
    for (const [phrase, , language] of rows) totals[language] = (totals[language] ?? 0) + phrase.trim().split(/\s+/u).length;
    for (const language of core) {
      const count = rows.filter((row) => row[2] === language)
        .reduce((sum, row) => sum + row[0].trim().split(/\s+/u).length, 0);
      if (count < 4) {
        quotaProblems += 1;
        deficientChapters.add(chapter);
        if (samples.length < 12) samples.push(`${chapter}:${index + 1} ${language}=${count}`);
      }
    }
    for (const token of verse.matchAll(wordPattern)) {
      if (!palette.test(verse.slice(token.index + token[0].length))) {
        emojiProblems += 1;
        deficientChapters.add(chapter);
      }
    }
  }
  for (const language of chapterLanguages) {
    if ((totals[language] ?? 0) < 4) {
      chapterLanguageProblems += 1;
      deficientChapters.add(chapter);
      chapterShortfalls.push(`${chapter} ${language}=${totals[language] ?? 0}`);
    }
  }
  if (rotatingLanguages.filter((language) => (totals[language] ?? 0) > 0).length < 2) {
    chapterLanguageProblems += 1;
    deficientChapters.add(chapter);
    chapterShortfalls.push(`${chapter} rotating=${rotatingLanguages.filter((language) => (totals[language] ?? 0) > 0).join(',')}`);
  }
}
console.log(JSON.stringify({ chapterArrays: vars.length, verseCountMismatches: countProblems,
  coreQuotaShortfalls: quotaProblems, unpairedWords: emojiProblems,
  chapterLanguageProblems, navigationProblems, glossaryProblems,
  deficientChapters: [...deficientChapters], chapterShortfalls, firstQuotaShortfalls: samples }, null, 2));
