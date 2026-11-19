import { createHash } from 'node:crypto';

import { workerToolFingerprint, type NoProgressCheckpoint } from './worker-checkpoint';

import { NATIVE_VERIFICATION_RESEARCH_QUERY } from '@/task/goal-verification';

type Result = { toolName: string; input?: unknown; output: unknown };
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const readTools = new Set(['power---file_read', 'power---glob', 'power---grep']);

const observedResult = ({ toolName, output }: Result): unknown => {
  if (readTools.has(toolName)) {
    return output;
  }
  if (toolName === 'power---file_edit' && typeof output === 'string' && output.startsWith('No edit applied:')) {
    return output;
  }
  if (
    toolName === 'power---bash' &&
    output &&
    typeof output === 'object' &&
    NATIVE_VERIFICATION_RESEARCH_QUERY in output &&
    typeof output[NATIVE_VERIFICATION_RESEARCH_QUERY] === 'string'
  ) {
    const result = output as { exitCode?: unknown; stdout?: unknown; stderr?: unknown };
    if (typeof result.exitCode === 'number' && result.exitCode !== 0 && result.exitCode !== 130) {
      return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
    }
  }
  if (toolName === 'get_goal' && output && typeof output === 'object' && 'goal' in output && 'availableVerification' in output) {
    const goal = output.goal as { id?: unknown; objective?: unknown; verifier?: unknown; status?: unknown } | null;
    if (typeof goal?.id === 'string' && typeof goal.objective === 'string') {
      // Token/time counters are usage, not evidence of progress on the work.
      return { id: goal.id, objective: goal.objective, verifier: goal.verifier, status: goal.status, verification: output.availableVerification };
    }
  }
  // Polling, writes, arbitrary commands and extension/MCP actions may have
  // effects outside the observed source tree. They cannot prove stagnation.
  return undefined;
};

export class AgentNoProgress extends Error {}

export class AgentProgress {
  private history: { fingerprint: string; tools: string[] }[] = [];
  private revision?: string;

  reset(): void {
    this.history = [];
    this.revision = undefined;
  }

  async observe(
    results: Result[],
    readRevision: () => Promise<string | undefined>,
  ): Promise<{ action: 'warn' | 'stop'; checkpoint: NoProgressCheckpoint } | undefined> {
    const values = results.map(observedResult);
    if (!results.length || values.some((value) => value === undefined)) {
      this.reset();
      return;
    }
    const step = {
      fingerprint: digest(
        results.map((result, index) => [workerToolFingerprint(result.toolName, result.input as Record<string, unknown> | undefined), values[index]]),
      ),
      tools: results.map(({ toolName }) => toolName),
    };
    if (!this.history.length) {
      this.revision = await readRevision();
      if (!this.revision) {
        return;
      }
    }
    this.history = [...this.history, step].slice(-32);
    for (let period = 1; period <= 8; period++) {
      const pattern = this.history.slice(-period);
      const repeats = (count: number) =>
        this.history.length >= period * count &&
        this.history.slice(-period * count).every((item, index) => item.fingerprint === pattern[index % period].fingerprint);
      if (!repeats(3)) {
        continue;
      }
      const current = await readRevision();
      if (!current || current !== this.revision) {
        this.reset();
        return;
      }
      return {
        action: repeats(4) ? 'stop' : 'warn',
        checkpoint: {
          revision: current,
          fingerprints: pattern.map(({ fingerprint }) => fingerprint),
          tools: [...new Set(pattern.flatMap(({ tools }) => tools))],
        },
      };
    }
    return undefined;
  }
}

export const canResumeNoProgress = (checkpoint: NoProgressCheckpoint, revision: string | undefined, goalBinding?: string, explicit = false): boolean =>
  explicit || Boolean(goalBinding && checkpoint.goalBinding && goalBinding !== checkpoint.goalBinding) || Boolean(revision && revision !== checkpoint.revision);
