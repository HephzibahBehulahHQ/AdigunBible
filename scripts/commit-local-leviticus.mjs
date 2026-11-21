import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const chapter = Number(process.argv[2]);
if (![1, 2, 3, 4, 5, 6].includes(chapter)) throw new Error('Usage: node scripts/commit-local-leviticus.mjs <1|2|3|4|5|6>');
const ref = `refs/heads/codex/leviticus-${chapter}-language-gate`;
const parentRef = chapter === 1 ? 'codex/exodus-gate-hardening' : `codex/leviticus-${chapter - 1}-language-gate`;
const index = resolve(`Leviticus/.lev${chapter}-alternate-index`);
if (existsSync(index)) throw new Error('Alternate index already exists');
const parent = execFileSync('git', ['rev-parse', parentRef], { encoding: 'utf8' }).trim();
let branchHead = '0000000000000000000000000000000000000000';
try {
  branchHead = execFileSync('git', ['rev-parse', '--verify', ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch { /* The new chapter branch does not exist yet. */ }
if (branchHead !== parent && branchHead !== '0000000000000000000000000000000000000000') {
  throw new Error('Branch no longer points to the expected parent');
}
const env = { ...process.env, GIT_INDEX_FILE: index };
const git = (args, options = {}) => execFileSync('git', args, {
  encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, env, ...options,
}).trim();
try {
  git(['read-tree', parent]);
  const blob = git(['hash-object', '-w', '--stdin'], {
    input: readFileSync(`Leviticus/.lev${chapter}-candidate.html`),
  });
  git(['update-index', '--add', '--cacheinfo', `100644,${blob},index.html`]);
  git(['add', '--',
    `Leviticus/Chapter ${chapter}.txt`,
    `Leviticus/Chapter ${chapter} - Working Draft.md`,
    `Leviticus/Chapter ${chapter} - AdigunBible local draft.txt`,
    `Leviticus/Chapter ${chapter} - Hover Glosses.json`,
    `release-evidence/LEV-${chapter}.json`,
  ]);
  const tree = git(['write-tree']);
  const commitEnv = {
    ...env,
    GIT_AUTHOR_NAME: 'Codex', GIT_AUTHOR_EMAIL: 'codex@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'Codex', GIT_COMMITTER_EMAIL: 'codex@users.noreply.github.com',
  };
  const commit = git(['commit-tree', tree, '-p', parent,
    '-m', `Prepare Leviticus ${chapter} locally with hover glosses`], { env: commitEnv });
  git(['update-ref', ref, commit, branchHead]);
  console.log(`${ref} ${commit}`);
} finally {
  if (existsSync(index)) unlinkSync(index);
}
