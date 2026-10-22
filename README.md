# Meaningful Commit Skill

**One shared Conventional Commits + meaningful writing policy for Claude Code,
Codex, and Git CLI.** Portable, dependency-free validator for Windows, macOS
and Linux.

Based on:
1. [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/#specification)
2. [The Art of Writing Meaningful Git Commit Messages](https://medium.com/@iambonitheuri/the-art-of-writing-meaningful-git-commit-messages-a56887a4cb49)

## How it works

| Layer | Purpose |
| --- | --- |
| Claude Code (`.claude/skills/`) | Reads staged diff and drafts truthful what/why commits |
| Codex (`.agents/skills/`) | Uses the same SKILL.md and policy |
| Git (`.githooks/commit-msg`) | Blocks invalid commit messages |
| GitHub Actions | Runs tests; validates PR commit messages |

The Git hook **does not run the AI model**; it validates the result.
Both agents are instructed to use the skill, but skill invocation is
non-deterministic. The hook is deterministic once activated.

## Requirements

- Git
- Node.js >= 18 (no npm dependencies)
- Git for Windows on Windows (provides a compatible hook shell)

## Install into your Git repository

Clone this repository, then run from the skill repository directory:

```powershell
node scripts/install.mjs --target "C:\Projects\my-app" --ci
```

Or on macOS/Linux:

```bash
node scripts/install.mjs --target ~/code/my-app --ci
```

The installer copies the shared skill to both **Claude Code** and **Codex**,
copies the validator and commit-msg hook, appends non-destructive guidance to
`CLAUDE.md` and `AGENTS.md`, and configures local Git:

```bash
git config --local core.hooksPath .githooks
```

With `--ci` it also installs a GitHub Actions PR commit-policy workflow.
Without `--ci`, only the local hook and skills are installed.

Install into this repository itself with:

```bash
node scripts/install.mjs --target .
```

**Important:** Git does not distribute `core.hooksPath` settings with
commits. Run the installer in each clone to enable the hook and restore
its executable permissions. The installed source files should be committed
into the target project so other developers can access them. When committing
the generated hook from Windows, record its executable Git mode:

```bash
git add --chmod=+x .githooks/commit-msg
```

This keeps the hook executable when teammates clone on macOS/Linux.

Existing target files are preserved unless `--force` is specified.
An existing `core.hooksPath` from any Git configuration scope is preserved;
the installer only accepts `.githooks`. Before switching from Git's default
hook directory, it refuses non-sample hook files so existing `pre-commit`,
`pre-push`, and other hooks keep running. A differing `commit-msg` hook is
never overwritten, even with `--force`; identical hooks may have their line
endings normalized to LF and executable permissions restored. Integrate the
validator with existing Husky, lefthook, or other hooks manually.

## Usage

In Claude Code or Codex:

> Use the meaningful-commit skill to inspect the staged diff, propose
> a Conventional Commit with a meaningful what/why body, then commit.

Examples:

```text
fix(lead): Prevent duplicate submissions
```

```text
feat(quote): Persist approved price snapshot

Freeze negotiated amounts on quote approval so later catalog changes
cannot alter existing commercial agreements.
```

These are rejected:

```text
fix: fix
chore: changes
```

## Team policy

- Subject format `type(scope)!: Description` (scope and `!` optional).
- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`,
  `perf`, `test`, `build`, `ci`, `chore`, `revert` and `ops`.
- Prefer imperative mood and capitalized summary, no ending period.
- Aim for <=50 characters; reject >72-character subjects.
- Add a blank line before the body, and explain **what and why**
  for nontrivial changes; body width ~72 is advisory.
- Mark breaking changes with `!` and/or a `BREAKING CHANGE:` footer.

The type allowlist, 50/72 guidance and style conventions are **team
policy**, not unconditional requirements of the official specification.
Warnings do not reject commits; errors do.

## Checks

```bash
npm test
node .commit-conventions/validate.mjs /path/to/message.txt
node .commit-conventions/check-history.mjs origin/main..HEAD
```

Tests include real Git commit integration tests, not only parsing
assertions, including preservation of existing hooks and configuration.
CI runs the suite on Windows, macOS, and Linux with Node.js 18, 22, and 24.
On PRs, CI can catch commits whose local hooks were bypassed.

## Limitations

- A hook checks structure and basic quality; it cannot prove the message
  accurately describes the staged code.
- Users can bypass a local hook with `git commit --no-verify`;
  require the CI status check in branch protection for stronger enforcement.
- Repositories with existing custom hooks must chain validators rather
  than replace their current hook configuration.
- Linked Git worktrees can share config. The installer refuses unsafe
  automatic hook setup from linked worktrees.

## License

MIT.
