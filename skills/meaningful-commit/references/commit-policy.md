# Commit Policy — Conventional Commits + Meaningful Messages

## Sources

- [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/#specification)
- [The Art of Writing Meaningful Git Commit Messages](https://medium.com/@iambonitheuri/the-art-of-writing-meaningful-git-commit-messages-a56887a4cb49)

This policy combines the formal format from Conventional Commits with
writing advice from the article. Where the spec allows alternatives,
prefer readability but do not misrepresent recommendations as spec mandates.

## Format

type(scope)!: Capitalized imperative description

What changed, and why it was necessary. Wrap prose at ~72 columns.
Explain trade-offs, behavior changes, or follow-up work if material.

BREAKING CHANGE: Explain compatibility impact and migration steps.
Refs: #123

The scope, !, body and footer are optional. A BREAKING CHANGE footer alone
or ! alone is sufficient for a breaking change under the official spec.

### Types

| Type | Meaning |
| --- | --- |
| feat | New capability |
| fix | Bug fix |
| docs | Documentation only |
| style | Formatting without behavioral changes |
| refactor | No feature or bug fix, structure changes |
| perf | Performance improvement |
| test | Add or correct tests |
| build | Build, dependencies, tooling |
| ci | CI pipeline |
| chore | Maintenance or housekeeping |
| ops | Infrastructure and operational changes |
| revert | Undo an earlier commit |

These are a team-selected allowlist, not a mandatory list from the formal spec.

### Scope examples

lead, opportunity, quote, agreement, order, billing, auth, api,
catalog, gis, ci. Keep scopes consistent inside each repository.

## Examples

Simple: fix(lead): Prevent duplicate lead submissions

Complex:

feat(quote): Add price snapshot on approval

Persist quoted amounts so later catalog edits cannot mutate an
already approved commercial decision.

Refs: #84

Breaking:

refactor(api)!: Replace legacy product order fields

Move product orders to the canonical request schema.

BREAKING CHANGE: Clients must send productOrderItem instead of items.

Not useful: fix: fix, chore: changes, feat: Added some new things

## What is and is not machine-enforceable

- Errors block commit: missing/invalid type + header shape; uninformative
  description; period at end; header longer than 72; no blank line before body.
- Warnings allow commit: summary over 50 chars; uncapitalized summary;
  detectable past-tense/gerund openings; body lines over 72 chars.
- Human/agent review: imperative quality, truthful relation to staged diff,
  atomicity, usefulness of the "why", and appropriate type/scope.

The article's 50/72 writing guidance is not a Conventional Commits MUST.
Warnings are intentional to avoid rejecting meaningful valid commits.

## Special generated messages

Git-created merge, revert, autosquash/fixup subjects are accepted for normal
Git workflows. This does not mean arbitrary custom subjects are exempt.
