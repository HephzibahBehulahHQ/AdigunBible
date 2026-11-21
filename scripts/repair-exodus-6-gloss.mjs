import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

let reader = execFileSync('git', ['show', 'codex/exodus-17-rotating-repair:index.html'], {
  encoding: 'utf8', maxBuffer: 20_000_000,
});
const before = 'Ọkàn✨ wọn✨ don✨ break✨';
if (reader.split(before).length !== 2) throw new Error('Expected Exodus 6:9 phrase once');
reader = reader.replace(before, 'Ọkàn❤️ wọn🫶 don✨ break✨');
const start = reader.indexOf('const exodusSixthGlosses={');
const heading = '  "9": [';
const verseStart = reader.indexOf(heading, start);
const verseEnd = reader.indexOf('\n  ]', verseStart);
if (start < 0 || verseStart < 0 || verseEnd < 0) throw new Error('Missing Exodus 6:9 glossary');
reader = reader.slice(0, verseEnd) + ',\n    ["wọn","their","yo"]' + reader.slice(verseEnd);
writeFileSync('Exodus/.exo6-gloss-repair.html', reader);
console.log('Prepared Exodus/.exo6-gloss-repair.html');
