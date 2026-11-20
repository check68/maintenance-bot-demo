#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/**
 * Picks exactly one outdated package for this run.
 * The bot never sweeps the dependency tree: one PR, one package.
 */

function readOutdated() {
  try {
    const output = execFileSync('npm', ['outdated', '--json'], { encoding: 'utf8' });
    return JSON.parse(output || '{}');
  } catch (error) {
    // npm exits non-zero when anything is outdated; the JSON is still valid.
    const stdout = typeof error === 'object' && error !== null ? error.stdout : null;
    try {
      return JSON.parse(stdout || '{}');
    } catch {
      return {};
    }
  }
}

function setOutput(key, value) {
  const target = process.env.GITHUB_OUTPUT;
  if (target) {
    appendFileSync(target, `${key}=${value}\n`);
  } else {
    console.log(`${key}=${value}`);
  }
}

const outdated = readOutdated();
const entries = Object.entries(outdated).filter(([, info]) => {
  if (typeof info !== 'object' || info === null) return false;
  return info.wanted && info.latest && info.wanted !== info.latest;
});

entries.sort((a, b) => {
  const aDev = a[1].type === 'devDependencies' ? 1 : 0;
  const bDev = b[1].type === 'devDependencies' ? 1 : 0;
  return aDev - bDev;
});

const pick = entries[0];

if (!pick) {
  setOutput('action', 'stop');
  setOutput('reason', 'nothing outdated');
  console.log('nothing outdated');
  process.exit(0);
}

const [name, info] = pick;
setOutput('action', 'open-pr');
setOutput('package', name);
setOutput('reason', `bump ${name} ${info.current} -> ${info.latest}`);
console.log(`selected ${name}: ${info.current} -> ${info.latest}`);