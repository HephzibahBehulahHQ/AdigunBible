import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const parent = execFileSync('git', ['rev-parse', 'codex/exodus-6-gloss-repair'], { encoding: 'utf8' }).trim();
const ref = 'refs/heads/codex/exodus-gate-hardening';
const index = resolve('Exodus/.gate-hardening-alternate-index');
if (existsSync(index)) throw new Error('Alternate index already exists');
const env = { ...process.env, GIT_INDEX_FILE: index };
const git = (args, options = {}) => execFileSync('git', args, {
  encoding: 'utf8', maxBuffer: 20_000_000, env, ...options,
}).trim();
try {
  git(['read-tree', parent]);
  const blob = git(['hash-object', '-w', '--stdin'], { input: readFileSync('scripts/.release-gate-hardened.mjs') });
  git(['update-index', '--add', '--cacheinfo', `100644,${blob},scripts/release-gate.mjs`]);
  const tree = git(['write-tree']);
  const commitEnv = { ...env,
    GIT_AUTHOR_NAME: 'Codex', GIT_AUTHOR_EMAIL: 'codex@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'Codex', GIT_COMMITTER_EMAIL: 'codex@users.noreply.github.com',
  };
  const commit = git(['commit-tree', tree, '-p', parent, '-m', 'Harden local Scripture release gate'], { env: commitEnv });
  git(['update-ref', ref, commit, '0000000000000000000000000000000000000000']);
  console.log(`${ref} ${commit}`);
} finally {
  if (existsSync(index)) unlinkSync(index);
}
