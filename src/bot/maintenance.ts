import {
  canOpenPullRequest,
  isServiceAllowed,
  lockfileDiffAllowed,
  type Decision,
  type GuardrailConfig,
  type RunState,
  DEFAULT_GUARDRAILS,
} from '../guardrails.ts';

export type MaintenanceTrigger = 'ci' | 'sentry' | 'dependency';

export interface MaintenanceJob {
  service: string;
  trigger: MaintenanceTrigger;
  /** Present for dependency jobs: `git diff -- package-lock.json`. */
  lockfileDiff?: string;
}

export type PlannedAction =
  | { action: 'open-pr'; reason: string }
  | { action: 'stop'; reason: string }
  | { action: 'skip'; reason: string };

export function planNextAction(
  job: MaintenanceJob,
  state: RunState,
  config: GuardrailConfig = DEFAULT_GUARDRAILS,
): PlannedAction {
  if (!isServiceAllowed(job.service, config)) {
    return { action: 'skip', reason: `service "${job.service}" is not in the allowlist` };
  }

  const gate: Decision = canOpenPullRequest(state, config);
  if (!gate.ok) {
    return { action: 'stop', reason: gate.reason };
  }

  if (job.trigger === 'dependency' && job.lockfileDiff !== undefined) {
    const diffGate = lockfileDiffAllowed(job.lockfileDiff, config);
    if (!diffGate.ok) {
      return { action: 'stop', reason: diffGate.reason };
    }
  }

  return {
    action: 'open-pr',
    reason: `${job.trigger} failure on ${job.service}: branch, failing test first, then the fix`,
  };
}