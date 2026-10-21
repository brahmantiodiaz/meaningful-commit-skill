import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cmd = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const install = (dest, extra = []) => spawnSync(process.execPath, [path.join(sourceRoot, 'scripts/install.mjs'), '--target', dest, ...extra], { encoding: 'utf8' });

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
    const bad = spawnSync('git', ['commit', '-m', 'fix: fix'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(bad.status, 0, bad.stdout + bad.stderr);
    assert.match(bad.stderr, /too vague/);
    const good = spawnSync('git', ['commit', '-m', 'feat(demo): Add sample content'], { cwd: dir, encoding: 'utf8' });
    assert.equal(good.status, 0, good.stdout + good.stderr);
    assert.match(cmd(dir, 'log', '-1', '--pretty=%s'), /^feat\(demo\):/);
    r = install(dir, ['--ci']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal((readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').match(/managed guidance/g) || []).length, 1);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('refuses to replace an existing hooksPath', () => {
  const { tmp, dir } = fixture();
  try {
    cmd(dir, 'config', 'core.hooksPath', '.husky');
    const result = install(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /core\.hooksPath is already set/);
    assert.equal(cmd(dir, 'config', 'core.hooksPath'), '.husky');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
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
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
