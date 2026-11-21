import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const chapter = Number(process.argv[2]);
if (![6, 9, 17].includes(chapter)) throw new Error('Usage: node scripts/commit-local-exodus-repair.mjs <6|9|17>');
const parentRef = chapter === 9 ? 'codex/exodus-40-language-gate'
  : chapter === 17 ? 'codex/exodus-9-rotating-repair' : 'codex/exodus-17-rotating-repair';
const kind = chapter === 6 ? 'gloss' : 'rotating';
const ref = `refs/heads/codex/exodus-${chapter}-${kind}-repair`;
const index = resolve(`Exodus/.exo${chapter}-repair-alternate-index`);
if (existsSync(index)) throw new Error('Alternate index already exists');
const parent = execFileSync('git', ['rev-parse', parentRef], { encoding: 'utf8' }).trim();
const env = { ...process.env, GIT_INDEX_FILE: index };
const git = (args, options = {}) => execFileSync('git', args, {
  encoding: 'utf8', maxBuffer: 20_000_000, env, ...options,
}).trim();
try {
  git(['read-tree', parent]);
  const candidate = readFileSync(`Exodus/.exo${chapter}-${kind}-repair.html`);
  const blob = git(['hash-object', '-w', '--stdin'], { input: candidate });
  git(['update-index', '--add', '--cacheinfo', `100644,${blob},index.html`]);
  git(['add', '--', `release-evidence/EXO-${chapter}.json`]);
  const tree = git(['write-tree']);
  const commitEnv = { ...env,
    GIT_AUTHOR_NAME: 'Codex', GIT_AUTHOR_EMAIL: 'codex@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'Codex', GIT_COMMITTER_EMAIL: 'codex@users.noreply.github.com',
  };
  const commit = git(['commit-tree', tree, '-p', parent, '-m', `Repair Exodus ${chapter} ${kind} coverage locally`], { env: commitEnv });
  git(['update-ref', ref, commit, '0000000000000000000000000000000000000000']);
  console.log(`${ref} ${commit}`);
} finally {
  if (existsSync(index)) unlinkSync(index);
}
