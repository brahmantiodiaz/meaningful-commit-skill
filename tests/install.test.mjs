import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureEnv = cwd => ({
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: path.join(path.dirname(cwd), 'global.gitconfig'),
});
const cmd = (cwd, ...args) => execFileSync('git', args, { cwd, env: fixtureEnv(cwd), encoding: 'utf8' }).trim();
const runGit = (cwd, ...args) => spawnSync('git', args, { cwd, env: fixtureEnv(cwd), encoding: 'utf8' });
const install = (dest, extra = []) => spawnSync(process.execPath, [path.join(sourceRoot, 'scripts/install.mjs'), '--target', dest, ...extra], { env: fixtureEnv(dest), encoding: 'utf8' });

function removeFixture(tmp) {
  const resolved = path.resolve(tmp);
  assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
  assert.match(path.basename(resolved), /^meaningful-commit-/);
  rmSync(resolved, { recursive: true, force: true });
}

function fixture() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'meaningful-commit-'));
  const dir = path.join(tmp, 'repo');
  mkdirSync(dir);
  cmd(dir, 'init', '-q');
  cmd(dir, 'config', 'user.email', 'tester@example.invalid');
  cmd(dir, 'config', 'user.name', 'Hook Test');
  return { tmp, dir };
}

test('installer places shared skills and enforces Git commits', () => {
  const { tmp, dir } = fixture();
  try {
    let r = install(dir, ['--ci']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(cmd(dir, 'config', 'core.hooksPath'), '.githooks');
    const claude = readFileSync(path.join(dir, '.claude/skills/meaningful-commit/SKILL.md'), 'utf8');
    const codex = readFileSync(path.join(dir, '.agents/skills/meaningful-commit/SKILL.md'), 'utf8');
    assert.equal(claude, codex);
    assert.ok(existsSync(path.join(dir, '.github/workflows/commit-policy.yml')));
    assert.ok(readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').includes('managed guidance'));
    writeFileSync(path.join(dir, 'demo.txt'), 'hello\n');
    cmd(dir, 'add', 'demo.txt');
    const bad = runGit(dir, 'commit', '-m', 'fix: fix');
    assert.notEqual(bad.status, 0, bad.stdout + bad.stderr);
    assert.match(bad.stderr, /too vague/);
    const good = runGit(dir, 'commit', '-m', 'feat(demo): Add sample content');
    assert.equal(good.status, 0, good.stdout + good.stderr);
    assert.match(cmd(dir, 'log', '-1', '--pretty=%s'), /^feat\(demo\):/);
    r = install(dir, ['--ci']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal((readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').match(/managed guidance/g) || []).length, 1);
  } finally { removeFixture(tmp); }
});

test('refuses to replace an existing hooksPath', () => {
  const { tmp, dir } = fixture();
  try {
    cmd(dir, 'config', 'core.hooksPath', '.husky');
    const result = install(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /core\.hooksPath is already set/);
    assert.equal(cmd(dir, 'config', 'core.hooksPath'), '.husky');
  } finally { removeFixture(tmp); }
});

test('refuses an existing file without --force and does not configure hooks', () => {
  const { tmp, dir } = fixture();
  try {
    mkdirSync(path.join(dir, '.githooks'));
    writeFileSync(path.join(dir, '.githooks/commit-msg'), '#!/bin/sh\necho keep-me\n');
    const result = install(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Existing file differs/);
    assert.match(readFileSync(path.join(dir, '.githooks/commit-msg'), 'utf8'), /keep-me/);
  } finally { removeFixture(tmp); }
});

test('preserves an existing pre-commit guard even with --force', () => {
  const { tmp, dir } = fixture();
  try {
    const hook = path.join(dir, '.git/hooks/pre-commit');
    const content = '#!/bin/sh\necho existing-guard >&2\nexit 1\n';
    writeFileSync(hook, content, { mode: 0o755 });
    const before = runGit(dir, 'commit', '--allow-empty', '-m', 'test: Exercise existing guard');
    assert.notEqual(before.status, 0);
    assert.match(before.stderr, /existing-guard/);

    const result = install(dir, ['--force']);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(readFileSync(hook, 'utf8'), content);
    assert.equal(runGit(dir, 'config', '--local', '--get', 'core.hooksPath').status, 1);
    assert.equal(existsSync(path.join(dir, '.commit-conventions')), false);
    const after = runGit(dir, 'commit', '--allow-empty', '-m', 'test: Exercise existing guard');
    assert.notEqual(after.status, 0);
    assert.match(after.stderr, /existing-guard/);
  } finally { removeFixture(tmp); }
});

test('does not disable a pre-push hook when no commit-msg hook exists', () => {
  const { tmp, dir } = fixture();
  try {
    const hook = path.join(dir, '.git/hooks/pre-push');
    const content = '#!/bin/sh\nexit 1\n';
    writeFileSync(hook, content, { mode: 0o755 });
    const result = install(dir);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(readFileSync(hook, 'utf8'), content);
    assert.equal(runGit(dir, 'config', '--local', '--get', 'core.hooksPath').status, 1);
    assert.equal(existsSync(path.join(dir, '.githooks')), false);
  } finally { removeFixture(tmp); }
});

for (const scope of ['global', 'worktree']) {
  test(`preserves an inherited ${scope} hooksPath even with --force`, () => {
    const { tmp, dir } = fixture();
    try {
      if (scope === 'worktree') cmd(dir, 'config', 'extensions.worktreeConfig', 'true');
      cmd(dir, 'config', `--${scope}`, 'core.hooksPath', '.custom-hooks');
      const result = install(dir, ['--force']);
      assert.notEqual(result.status, 0, result.stdout + result.stderr);
      assert.equal(cmd(dir, 'config', '--get', 'core.hooksPath'), '.custom-hooks');
      assert.equal(runGit(dir, 'config', '--local', '--get', 'core.hooksPath').status, 1);
      assert.equal(existsSync(path.join(dir, '.commit-conventions')), false);
    } finally { removeFixture(tmp); }
  });
}

test('does not replace an active custom commit-msg hook with --force', () => {
  const { tmp, dir } = fixture();
  try {
    mkdirSync(path.join(dir, '.githooks'));
    const hook = path.join(dir, '.githooks/commit-msg');
    const content = '#!/bin/sh\necho custom-message-guard >&2\nexit 1\n';
    writeFileSync(hook, content, { mode: 0o755 });
    cmd(dir, 'config', 'core.hooksPath', '.githooks');
    const result = install(dir, ['--force']);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(readFileSync(hook, 'utf8'), content);
    assert.equal(existsSync(path.join(dir, '.commit-conventions')), false);
    const commit = runGit(dir, 'commit', '--allow-empty', '-m', 'test: Exercise custom message guard');
    assert.notEqual(commit.status, 0);
    assert.match(commit.stderr, /custom-message-guard/);
  } finally { removeFixture(tmp); }
});

test('--force still updates validator files without replacing the hook', () => {
  const { tmp, dir } = fixture();
  try {
    const first = install(dir);
    assert.equal(first.status, 0, first.stderr);
    const hook = readFileSync(path.join(dir, '.githooks/commit-msg'), 'utf8');
    const validator = path.join(dir, '.commit-conventions/validate.mjs');
    writeFileSync(validator, '// Older validator\n');
    const result = install(dir, ['--force']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(validator, 'utf8'), readFileSync(path.join(sourceRoot, '.commit-conventions/validate.mjs'), 'utf8'));
    assert.equal(readFileSync(path.join(dir, '.githooks/commit-msg'), 'utf8'), hook);
    const commit = runGit(dir, 'commit', '--allow-empty', '-m', 'fix: fix');
    assert.notEqual(commit.status, 0);
    assert.match(commit.stderr, /too vague/);
  } finally { removeFixture(tmp); }
});

test('normalizes a shared CRLF hook so it can run on POSIX systems', () => {
  const { tmp, dir } = fixture();
  try {
    mkdirSync(path.join(dir, '.githooks'));
    const hook = path.join(dir, '.githooks/commit-msg');
    const content = readFileSync(path.join(sourceRoot, '.githooks/commit-msg'), 'utf8');
    writeFileSync(hook, content.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n'));
    cmd(dir, 'config', 'core.hooksPath', '.githooks');
    const result = install(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(hook, 'utf8').includes('\r'), false);
    const commit = runGit(dir, 'commit', '--allow-empty', '-m', 'fix: fix');
    assert.notEqual(commit.status, 0);
    assert.match(commit.stderr, /too vague/);
  } finally { removeFixture(tmp); }
});

test('reinstall restores executable permissions and enforces validation', { skip: process.platform === 'win32' }, () => {
  const { tmp, dir } = fixture();
  try {
    const first = install(dir);
    assert.equal(first.status, 0, first.stderr);
    const hook = path.join(dir, '.githooks/commit-msg');
    chmodSync(hook, 0o644);
    const result = install(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.notEqual(statSync(hook).mode & 0o111, 0);
    const commit = runGit(dir, 'commit', '--allow-empty', '-m', 'fix: fix');
    assert.notEqual(commit.status, 0);
    assert.match(commit.stderr, /too vague/);
  } finally { removeFixture(tmp); }
});
