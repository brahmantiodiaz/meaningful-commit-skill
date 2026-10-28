#!/usr/bin/env node
/** Install the shared skill and Git hook into an existing git worktree. */
import { chmodSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync, existsSync, statSync } from 'node:fs';
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
const HOOK = path.join(TARGET, '.githooks', 'commit-msg');
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
    const hook = destination === HOOK;
    // Only newline normalization is safe for a differing existing hook.
    if (hook && previous.replace(/\r\n?/g, '\n') !== content) {
      throw new Error('Existing file differs: ' + destination + ' (integrate commit-msg manually; --force does not replace hooks)');
    }
    if (!hook && !force) throw new Error('Existing file differs: ' + destination + ' (use --force to replace)');
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
  // Compare canonical paths: temp dirs can be symlinked (macOS /var) or 8.3 short names (Windows).
  if (realpathSync.native(root) !== realpathSync.native(TARGET)) throw new Error('Target must be the worktree root: ' + root);
  const configured = (() => {
    try { return git('config', '--get', 'core.hooksPath'); }
    catch (error) {
      if (error.status === 1) return null;
      throw error;
    }
  })();
  if (configured !== null && configured !== '.githooks') {
    throw new Error('core.hooksPath is already set to "' + configured + '". To avoid disabling existing hooks, installer stops. Integrate commit-msg manually or restore existing path first.');
  }
  if (configured === null) {
    const hooksDir = git('rev-parse', '--git-path', 'hooks');
    const activePath = path.isAbsolute(hooksDir) ? hooksDir : path.join(TARGET, hooksDir);
    const existing = existsSync(activePath) && readdirSync(activePath, { withFileTypes: true })
      .find(entry => !entry.name.endsWith('.sample') && (entry.isFile() || entry.isSymbolicLink()));
    if (existing) {
      throw new Error('An existing Git hook is present at ' + path.join(activePath, existing.name) + '. Changing core.hooksPath would disable existing hooks; manually chain validators.');
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
    let content = readFileSync(path.join(ROOT, source), 'utf8');
    const dest = path.join(TARGET, destination);
    if (dest === HOOK) content = content.replace(/\r\n?/g, '\n');
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
    if (changed) {
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, content, 'utf8');
    }
    // A clone can lose the executable bit even when the content matches.
    if (dest === HOOK) chmodSync(dest, 0o755);
  }
  if (configured === null) git('config', '--local', 'core.hooksPath', '.githooks');
  console.log('Installed meaningful-commit into ' + TARGET);
  console.log('Git core.hooksPath = .githooks');
  console.log('Commit-msg validation applies to Claude, Codex and manual git commits.');
  console.log('Commit the generated skill/hook files if teammates need them.');
  console.log('Run the installer in each clone to enable hooks and restore executable permissions.');
  if (process.platform === 'win32') {
    console.log('When committing the hook from Windows, record its executable Git mode:');
    console.log('  git add --chmod=+x .githooks/commit-msg');
  }
} catch (error) {
  console.error('Install aborted: ' + error.message);
  process.exit(1);
}
