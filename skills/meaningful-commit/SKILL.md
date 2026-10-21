---
name: meaningful-commit
description: Draft, review, validate and create meaningful Conventional Commits. Use when asked to commit, write a commit message, inspect staged changes before a commit, or fix a rejected commit message.
---

# Meaningful Commit (shared Claude Code + Codex workflow)

Use the rules in references/commit-policy.md (alongside this SKILL.md).
The installed project has the same rules for Claude Code and Codex.

## When a user requests a commit

1. Confirm the repository and current branch using git status --short --branch.
2. Read git diff --cached --stat and git diff --cached; use git diff only
   to understand unstaged work. The message must describe only staged code.
3. If nothing is staged, explain the choices. Stage specific intended paths only
   with user authorization; never run git add -A as a default.
4. If staged changes are unrelated, suggest separate atomic commits rather than
   writing a generic message.
5. Select the correct type: feat adds functionality, fix repairs behavior;
   refactor changes structure without behavior changes. Choose a meaningful
   domain scope if the repo has modules.
6. Write an imperative, capitalized summary. Aim for a 50-character header;
   keep it <= 72. Never end the summary with a period. Avoid empty phrases
   like "Update code" or "Fix bug".
7. For non-trivial changes, add a blank line and a wrapped (~72-column) body
   explaining what changed and why, and important migration behavior.
   Never invent tests or claim unverified outcomes.
8. For breaking changes, use type(scope)!: ... and/or the
   BREAKING CHANGE: ... footer. Make the migration explicit.
9. Validate with node .commit-conventions/validate.mjs <message-file> if
   available. The repository commit-msg Git hook is the final gate.
10. Commit only when the user has authorized committing. Prefer
    git commit -F <message-file> for multiline messages. Do not push unless
    separately authorized. Do not bypass hooks using --no-verify.
11. After committing, report hash, subject, relevant files, and which tests
    actually ran. Do not attribute authorship to an agent unless requested.

## Safety and limitations

- A SKILL.md informs the model but cannot guarantee invocation before a
  tool call. The Git commit-msg hook enforces checkable syntax across agents.
- This hook validates commit text, not staged diff truthfulness. Inspect the
  staged diff manually to ensure accuracy and atomic scope.
- Don't run git reset --hard, amend published commits, or force-push for the
  purpose of satisfying this skill.
