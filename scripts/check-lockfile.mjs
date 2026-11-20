#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

/**
 * Enforces the lockfile cap before a PR is opened.
 * A wide diff means the bump pulled a subtree — revert instead of chasing it.
 */

const MAX_LOCKFILE_DIFF_LINES = 40;

let diff = '';
try {
  diff = execFileSync('git', ['diff', '-U0', '--', 'package-lock.json'], { encoding: 'utf8' });
} catch (error) {
  console.error('git diff failed; refusing to open a PR');
  process.exit(1);
}

const changed = diff
  .split('\n')
  .filter((line) => {
    if (line.startsWith('+++') || line.startsWith('---')) return false;
    return line.startsWith('+') || line.startsWith('-');
  })
  .length;

if (changed > MAX_LOCKFILE_DIFF_LINES) {
  console.error(
    `package-lock.json diff touches ${changed} lines (cap ${MAX_LOCKFILE_DIFF_LINES}); revert instead of chasing the tree`,
  );
  process.exit(1);
}

console.log(`lockfile diff within cap (${changed}/${MAX_LOCKFILE_DIFF_LINES} lines)`);