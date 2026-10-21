#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { validateMessage, formatReport } from './validate.mjs';

const range = process.argv[2];
if (!range) {
  console.error('Usage: node .commit-conventions/check-history.mjs <base..head>');
  process.exit(2);
}
try {
  const output = execFileSync('git', ['log', '--no-merges', '--format=%H%x00%B%x00', range], {
    encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
  });
  const parts = output.split('\0');
  let failures = 0;
  let commits = 0;
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const sha = parts[i].trim();
    if (!/^[a-f0-9]{40,64}$/.test(sha)) continue;
    const result = validateMessage(parts[i + 1]);
    commits++;
    if (!result.ok) failures++;
    console.log(formatReport(result, sha.slice(0, 12)));
  }
  console.log(`Checked ${commits} commits; ${failures} invalid.`);
  process.exit(failures ? 1 : 0);
} catch (error) {
  console.error(`Unable to check git log: ${error.message}`);
  process.exit(2);
}
