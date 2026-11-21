import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const chapter = Number(process.argv[2]);
const repairs = {
  9: {
    base: 'codex/exodus-40-language-gate',
    variable: 'exodusNinth',
    verse: 23,
    phrase: 'el✨ granizo🌍 cayó🌍 sobre✨ Egipto🌍',
    meaning: 'hail fell over Egypt',
    language: 'es',
    edit: (verse, phrase) => `${verse} —${phrase}.`,
  },
  17: {
    base: 'codex/exodus-9-rotating-repair',
    variable: 'exodusSeventeenth',
    verse: 6,
    additions: [
      ['saldrá🌍 agua🌍 de✨ la✨ roca🌍', 'water will come from the rock', 'es'],
      ['maji🌍 yatatoka🌍 katika✨ mwamba🌍', 'water will come out of the rock', 'sw'],
    ],
    edit: (verse, phrases) => {
      if (!verse.includes('—kí✨')) throw new Error('Could not locate the speech insertion point');
      return verse.replace('—kí✨', `—${phrases.join(', ')}—kí✨`);
    },
  },
};
const repair = repairs[chapter];
if (!repair) throw new Error('Usage: node scripts/repair-exodus-rotating.mjs <9|17>');
let reader = execFileSync('git', ['show', `${repair.base}:index.html`], {
  encoding: 'utf8', maxBuffer: 20_000_000,
});
const arrayMarker = `const ${repair.variable}=[`;
const arrayStart = reader.indexOf(arrayMarker);
const arrayEnd = reader.indexOf('\n];', arrayStart);
if (arrayStart < 0 || arrayEnd < 0) throw new Error('Missing chapter array');
const lines = reader.slice(arrayStart, arrayEnd).split('\n');
const lineIndex = repair.verse;
const original = JSON.parse(lines[lineIndex].trim().replace(/,$/u, ''));
const additions = repair.additions ?? [[repair.phrase, repair.meaning, repair.language]];
const updated = repair.edit(original, additions.map(([phrase]) => phrase));
if (updated === original) throw new Error('Verse did not change');
lines[lineIndex] = `  ${JSON.stringify(updated)},`;
reader = reader.slice(0, arrayStart) + lines.join('\n') + reader.slice(arrayEnd);

const glossaryMarker = `const ${repair.variable}Glosses={`;
const glossaryStart = reader.indexOf(glossaryMarker);
const heading = `  "${repair.verse}": [`;
const verseStart = reader.indexOf(heading, glossaryStart);
const verseEnd = reader.indexOf('\n  ]', verseStart);
if (glossaryStart < 0 || verseStart < 0 || verseEnd < 0) throw new Error('Missing verse glossary');
const glossInsertion = additions.map(([phrase, meaning, language]) => {
  const plain = phrase.replace(/(?:❤️|🙏|✨|🔥|🫶|🌍|😭|👀|💯|🕊️)/gu, '');
  return `    ${JSON.stringify([plain, meaning, language])}`;
}).join(',\n');
reader = reader.slice(0, verseEnd) + `,\n${glossInsertion}` + reader.slice(verseEnd);
if (chapter === 9) {
  const before = 'unter✨ Pharaoh’s✨ avadim✨';
  if (reader.split(before).length !== 2) throw new Error('Expected one unglossed possessive in Exodus 9:20');
  reader = reader.replace(before, 'unter✨ the✨ avadim✨ of✨ Pharaoh🫶');
}
const output = `Exodus/.exo${chapter}-rotating-repair.html`;
writeFileSync(output, reader);
console.log(`Prepared ${output} from ${repair.base}`);
