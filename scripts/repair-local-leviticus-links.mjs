import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const chapters = [2, 3, 4];
const index = resolve('Leviticus/.lev-links-alternate-index');
if (existsSync(index)) throw new Error('Alternate index already exists');
const env = { ...process.env, GIT_INDEX_FILE: index };
const git = (args, options = {}) => execFileSync('git', args, {
  encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, env, ...options,
}).trim();
const old = new Map(chapters.map((chapter) => [chapter,
  git(['rev-parse', `refs/heads/codex/leviticus-${chapter}-language-gate`])]));
const chapter1 = git(['rev-parse', 'codex/leviticus-1-language-gate']);
for (const chapter of chapters) {
  const expected = chapter === 2 ? chapter1 : old.get(chapter - 1);
  if (git(['rev-parse', `${old.get(chapter)}^`]) !== expected) {
    throw new Error(`Leviticus ${chapter} branch parent changed`);
  }
}
const newCommits = new Map();
try {
  for (const chapter of chapters) {
    git(['read-tree', old.get(chapter)]);
    const evidenceFiles = chapter === 2
      ? ['release-evidence/LEV-2.json']
      : ['release-evidence/LEV-2.json', 'release-evidence/LEV-3.json'];
    git(['add', '--', ...evidenceFiles]);
    const tree = git(['write-tree']);
    const parent = chapter === 2 ? chapter1 : newCommits.get(chapter - 1);
    const commitEnv = {
      ...env,
      GIT_AUTHOR_NAME: 'Codex', GIT_AUTHOR_EMAIL: 'codex@users.noreply.github.com',
      GIT_COMMITTER_NAME: 'Codex', GIT_COMMITTER_EMAIL: 'codex@users.noreply.github.com',
    };
    const commit = git(['commit-tree', tree, '-p', parent,
      '-m', `Prepare Leviticus ${chapter} locally with hover glosses`], { env: commitEnv });
    newCommits.set(chapter, commit);
  }
  const updates = 'start\n' + chapters.map((chapter) =>
    `update refs/heads/codex/leviticus-${chapter}-language-gate ${newCommits.get(chapter)} ${old.get(chapter)}`
  ).join('\n') + '\nprepare\ncommit\n';
  git(['update-ref', '--stdin'], { input: updates });
  for (const chapter of chapters) console.log(`LEV ${chapter}: ${old.get(chapter)} -> ${newCommits.get(chapter)}`);
} finally {
  if (existsSync(index)) unlinkSync(index);
}
