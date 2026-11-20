export interface GuardrailConfig {
  maxPrsPerRun: number;
  maxLockfileDiffLines: number;
  consecutiveRedCiLimit: number;
  allowlist: readonly string[];
}

export interface RunState {
  prsOpened: number;
  consecutiveRedCi: number;
}

export type Decision = { ok: true } | { ok: false; reason: string };

export const DEFAULT_GUARDRAILS: GuardrailConfig = {
  maxPrsPerRun: 1,
  maxLockfileDiffLines: 40,
  consecutiveRedCiLimit: 2,
  allowlist: ['api', 'worker'],
};

export function canOpenPullRequest(
  state: RunState,
  config: GuardrailConfig = DEFAULT_GUARDRAILS,
): Decision {
  if (state.consecutiveRedCi >= config.consecutiveRedCiLimit) {
    return {
      ok: false,
      reason: `CI has been red ${state.consecutiveRedCi} runs in a row; stopping instead of retrying`,
    };
  }

  if (state.prsOpened >= config.maxPrsPerRun) {
    return { ok: false, reason: `already opened ${state.prsOpened} PR(s) in this run` };
  }

  return { ok: true };
}

export function isServiceAllowed(
  service: string,
  config: GuardrailConfig = DEFAULT_GUARDRAILS,
): boolean {
  return config.allowlist.includes(service);
}

/** Counts added and removed lines, ignoring diff headers. */
export function countChangedLines(diff: string): number {
  return diff
    .split('\n')
    .filter((line) => {
      if (line.startsWith('+++') || line.startsWith('---')) return false;
      return line.startsWith('+') || line.startsWith('-');
    })
    .length;
}

export function lockfileDiffAllowed(
  diff: string,
  config: GuardrailConfig = DEFAULT_GUARDRAILS,
): Decision {
  const changed = countChangedLines(diff);
  if (changed > config.maxLockfileDiffLines) {
    return {
      ok: false,
      reason: `package-lock.json diff touches ${changed} lines (cap ${config.maxLockfileDiffLines})`,
    };
  }
  return { ok: true };
}