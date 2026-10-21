import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMessage } from '../.commit-conventions/validate.mjs';

const valid = [
  'feat: Add new checkout route',
  'fix(lead): Prevent duplicate submissions',
  'refactor(api)!: Replace legacy payload',
  'docs: Clarify installation steps',
  'ops(infra): Rotate deployment endpoints',
  'feat(quote): Save approved price snapshot\n\nPreserve accepted amounts when catalog prices change.\n\nRefs: #42',
  'feat!: Replace deprecated endpoint\n\nBREAKING CHANGE: Migrate clients to v2.',
  'Merge pull request #22 from org/branch',
  'Revert "feat(api): Add old endpoint"',
  'fixup! feat(api): Add endpoint',
  '# explain\nfix(auth): Prevent token replay\n',
];
for (const message of valid) {
  test('accepts ' + message.split('\n')[0], () => {
    assert.equal(validateMessage(message).ok, true, JSON.stringify(validateMessage(message)));
  });
}
const invalid = [
  ['', 'empty'],
  ['Changed files', 'format'],
  ['fix: fix', 'vague'],
  ['wrong(api): Add task', 'unknown'],
  ['feat(api): Add endpoint.', 'period'],
  ['feat(api): Add endpoint\nBody without blank line', 'blank line'],
  ['feat(api): ' + 'A'.repeat(90), 'subject max'],
  ['feat: Add api\n\nBREAKING CHANGE:', 'breaking footer'],
];
for (const [message, label] of invalid) {
  test('rejects ' + label, () => assert.equal(validateMessage(message).ok, false));
}
test('soft warnings do not reject valid style variants', () => {
  const result = validateMessage('feat: added token validation');
  assert.equal(result.ok, true);
  assert.ok(result.warnings.length >= 1);
});
