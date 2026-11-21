import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const chapter = Number(process.argv[2]);
if (!Number.isInteger(chapter) || chapter < 2 || chapter > 40) {
  throw new Error('Usage: node scripts/commit-local-exodus.mjs <chapter>');
}
const ref = `refs/heads/codex/exodus-${chapter}-language-gate`;
const parentRef = `codex/exodus-${chapter - 1}-language-gate`;
const reparent = process.argv.includes('--reparent');
const index = resolve(`Exodus/.exo${chapter}-alternate-index`);
if (existsSync(index)) throw new Error('Alternate index already exists');
const branchHead = execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' }).trim();
const parent = execFileSync('git', ['rev-parse', parentRef], { encoding: 'utf8' }).trim();
if (branchHead !== parent) {
  const currentParent = execFileSync('git', ['rev-parse', `${ref}^`], { encoding: 'utf8' }).trim();
  if (currentParent !== parent && !reparent) throw new Error(`${ref} has moved beyond one chapter commit; use --reparent only after regenerating this chapter from the revised parent`);
}
const env = { ...process.env, GIT_INDEX_FILE: index };
const git = (args, options = {}) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env, ...options }).trim();
try {
  git(['read-tree', parent]);
  const blob = git(['hash-object', '-w', '--stdin'], { input: readFileSync(`Exodus/.exo${chapter}-candidate.html`) });
  git(['update-index', '--add', '--cacheinfo', `100644,${blob},index.html`]);
  git(['add', '--', `release-evidence/EXO-${chapter}.json`]);
  const tree = git(['write-tree']);
  const evidence = JSON.parse(readFileSync(`release-evidence/EXO-${chapter}.json`, 'utf8'));
  const reviewed = evidence.status === 'passed_with_visual_deferral';
  const commitEnv = {
    ...env,
    GIT_AUTHOR_NAME: 'Codex', GIT_AUTHOR_EMAIL: 'codex@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'Codex', GIT_COMMITTER_EMAIL: 'codex@users.noreply.github.com',
  };
  const commit = git(['commit-tree', tree, '-p', parent, '-m', `${reviewed ? 'Prepare' : 'Draft'} Exodus ${chapter} locally with hover glosses`], { env: commitEnv });
  git(['update-ref', ref, commit, branchHead]);
  console.log(`${ref} ${commit}`);
} finally {
  if (existsSync(index)) unlinkSync(index);
}
