#!/usr/bin/env node
/** Install the shared skill and Git hook into an existing git worktree. */
import { chmodSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valueOf = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

if (args.includes('--help') || !valueOf('--target')) {
  console.log('Usage: node scripts/install.mjs --target <existing-git-repo> [--force] [--ci] [--no-agent-guidance]\n\n' +
    '  --force             Replace files previously installed by this tool\n' +
    '  --ci                Also install GitHub Actions PR commit validation\n' +
    "  --no-agent-guidance Don't append policy guidance to AGENTS.md / CLAUDE.md");
  process.exit(args.includes('--help') ? 0 : 2);
}

const TARGET = path.resolve(valueOf('--target'));
const force = args.includes('--force');
const ci = args.includes('--ci');
const guidance = !args.includes('--no-agent-guidance');

function git(...gitArgs) {
  return execFileSync('git', ['-C', TARGET, ...gitArgs], { encoding: 'utf8' }).trim();
}
function writeIfSafe(destination, content) {
  if (existsSync(destination)) {
    const previous = readFileSync(destination, 'utf8');
    if (previous === content) return false;
    if (!force) throw new Error('Existing file differs: ' + destination + ' (use --force to replace)');
  }
  return true;
}
function annotate(file, skillLocation) {
  const marker = '<!-- meaningful-commit managed guidance -->';
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (text.includes(marker)) return null;
  return (text && !text.endsWith('\n') ? '\n' : '') +
    '\n' + marker + '\n' +
    'Before creating commits, use the ' + String.fromCharCode(96) +
    'meaningful-commit' + String.fromCharCode(96) + ' skill at ' +
    String.fromCharCode(96) + skillLocation + String.fromCharCode(96) + '\n' +
    'when available. Inspect staged diffs, draft truthful Conventional Commits\n' +
    'with a useful what/why explanation, and never bypass the commit-msg hook.\n' +
    'Commit only when explicitly requested. Never auto-stage unrelated files.\n';
}

try {
  if (!existsSync(TARGET) || !statSync(TARGET).isDirectory()) throw new Error('Target is not a directory.');
  const root = path.resolve(git('rev-parse', '--show-toplevel'));
  if (root !== TARGET) throw new Error('Target must be the worktree root: ' + root);
  const configured = (() => {
    try { return git('config', '--local', '--get', 'core.hooksPath'); }
    catch { return ''; }
  })();
  if (configured && configured !== '.githooks') {
    throw new Error('core.hooksPath is already set to "' + configured + '". To avoid disabling existing hooks, installer stops. Integrate commit-msg manually or restore existing path first.');
  }
  if (!configured) {
    const activeHook = git('rev-parse', '--git-path', 'hooks/commit-msg');
    const activePath = path.isAbsolute(activeHook) ? activeHook : path.join(TARGET, activeHook);
    if (existsSync(activePath)) {
      throw new Error('An existing Git commit-msg hook is present at ' + activePath + '. Installer will not silently replace it; manually chain validators.');
    }
    const commonDir = git('rev-parse', '--git-common-dir');
    const gitDir = git('rev-parse', '--git-dir');
    if (path.resolve(TARGET, commonDir) !== path.resolve(TARGET, gitDir)) {
      throw new Error('Linked worktree detected. Install on the primary worktree first or configure per-worktree hooks carefully.');
    }
  }

  const sources = [
    ['.commit-conventions/validate.mjs', '.commit-conventions/validate.mjs'],
    ['.commit-conventions/check-history.mjs', '.commit-conventions/check-history.mjs'],
    ['.githooks/commit-msg', '.githooks/commit-msg'],
    ['skills/meaningful-commit/SKILL.md', '.claude/skills/meaningful-commit/SKILL.md'],
    ['skills/meaningful-commit/references/commit-policy.md', '.claude/skills/meaningful-commit/references/commit-policy.md'],
    ['skills/meaningful-commit/SKILL.md', '.agents/skills/meaningful-commit/SKILL.md'],
    ['skills/meaningful-commit/references/commit-policy.md', '.agents/skills/meaningful-commit/references/commit-policy.md'],
    ...(ci ? [['examples/workflows/commit-policy.yml', '.github/workflows/commit-policy.yml']] : []),
  ];
  const changes = sources.map(([source, destination]) => {
    const content = readFileSync(path.join(ROOT, source), 'utf8');
    const dest = path.join(TARGET, destination);
    return { dest, content, changed: writeIfSafe(dest, content) };
  });
  if (guidance) {
    for (const [file, loc] of [
      ['CLAUDE.md', '.claude/skills/meaningful-commit/SKILL.md'],
      ['AGENTS.md', '.agents/skills/meaningful-commit/SKILL.md'],
    ]) {
      const dest = path.join(TARGET, file);
      const add = annotate(dest, loc);
      if (add !== null) changes.push({ dest, content: (existsSync(dest) ? readFileSync(dest, 'utf8') : '') + add, changed: true });
    }
  }
  for (const { dest, content, changed } of changes) {
    if (!changed) continue;
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, content, 'utf8');
    if (path.basename(dest) === 'commit-msg' && path.dirname(dest) === path.join(TARGET, '.githooks')) {
      chmodSync(dest, 0o755);
    }
  }
  if (!configured) git('config', '--local', 'core.hooksPath', '.githooks');
  console.log('Installed meaningful-commit into ' + TARGET);
  console.log('Git core.hooksPath = .githooks');
  console.log('Commit-msg validation applies to Claude, Codex and manual git commits.');
  console.log('Commit the generated skill/hook files if teammates need them.');
  console.log('Each clone still needs: git config core.hooksPath .githooks');
} catch (error) {
  console.error('Install aborted: ' + error.message);
  process.exit(1);
}
