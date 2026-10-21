#!/usr/bin/env node
/**
 * Dependency-free Conventional Commits validator. Node.js >= 18.
 * Interface: node .commit-conventions/validate.mjs <path-to-message>
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ALLOWED_TYPES = new Set([
  'feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test',
  'build', 'ci', 'chore', 'revert', 'ops',
]);

const VAGUE_DESCRIPTIONS = /^(?:update|updates|changes?|fix(?:es)?|bug\s*fix|misc|stuff|wip|work in progress|cleanup|tweak(?:s)?|improvements?)$/i;
const PAST_OR_GERUND = /^(?:added|adding|fixed|fixing|updated|updating|implemented|implementing|changed|changing|removed|removing|refactored|refactoring)\b/i;
const SUBJECT_PATTERN = /^([a-z][a-z0-9-]*)(?:\(([a-z0-9][a-z0-9._/-]*)\))?(!)?: (.+)$/;

export function validateMessage(input) {
  const errors = [];
  const warnings = [];
  const lines = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    .split('\n').filter(line => !/^#(?:\s|$)/.test(line));
  while (lines.length && lines.at(-1).trim() === '') lines.pop();
  const subject = (lines[0] ?? '').trim();

  if (!subject) {
    errors.push('Commit subject cannot be empty.');
    return { ok: false, errors, warnings };
  }
  if (/^(?:Merge (?:branch|remote-tracking branch|pull request)|Revert "|fixup! |squash! |amend! )/.test(subject)) {
    return { ok: true, errors, warnings, skipped: 'Git-generated commit' };
  }
  const match = SUBJECT_PATTERN.exec(subject);
  if (!match) {
    errors.push('Use: <type>(optional-scope)!: Description (scope and ! optional).');
  } else {
    const [, type, , breaking, description] = match;
    if (!ALLOWED_TYPES.has(type)) {
      errors.push(`Unknown type "${type}". Allowed: ${[...ALLOWED_TYPES].join(', ')}.`);
    }
    if (VAGUE_DESCRIPTIONS.test(description.trim())) {
      errors.push('Description is too vague. State the specific change.');
    }
    if (/[.]$/.test(description)) {
      errors.push('Do not end the subject with a period.');
    }
    if (PAST_OR_GERUND.test(description)) {
      warnings.push('Use imperative mood: "Add", "Fix", "Refactor", etc.');
    }
    if (/^[a-z]/.test(description)) {
      warnings.push('Capitalize the first word of the description (team style).');
    }
    if (breaking && !/^feat$|^fix$/.test(type)) {
      // Allowed by the spec; this is informational only, not an error.
    }
  }
  if (subject.length > 72) errors.push(`Subject is ${subject.length} chars; max 72.`);
  else if (subject.length > 50) warnings.push(`Subject is ${subject.length} chars; aim for <= 50 when practical.`);
  if (lines.length > 1 && lines[1].trim() !== '') {
    errors.push('Separate subject and body with a blank line.');
  }
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 72) warnings.push(`Line ${i + 1} is ${line.length} chars; wrap body at ~72.`);
  }
  if (/BREAKING CHANGE:\s*$/m.test(lines.join('\n'))) {
    errors.push('BREAKING CHANGE footer must describe the incompatible change.');
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function formatReport(result, prefix = 'commit') {
  const out = [];
  for (const issue of result.errors) out.push(`ERROR ${prefix}: ${issue}`);
  for (const warning of result.warnings) out.push(`WARN  ${prefix}: ${warning}`);
  if (result.ok && !result.warnings.length) out.push(`PASS  ${prefix}: commit message valid.`);
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filename = process.argv[2];
  if (!filename) {
    console.error('Usage: node .commit-conventions/validate.mjs <message-file>');
    process.exit(2);
  }
  try {
    const result = validateMessage(readFileSync(filename, 'utf8'));
    console.error(formatReport(result));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(`Cannot validate commit message: ${error.message}`);
    process.exit(2);
  }
}
