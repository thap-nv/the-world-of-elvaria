// The built hook as the CLIs run it: `node --conditions=elvaria-dist dist/elvaria-hook.js`, one process per
// call, stdin in, exit code out (implementation-plan §3.6). `pnpm test` builds first; the budget of 100 ms is
// measured here on the build, next to `node -e 0` on the same machine.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DC1_LAWS, EXPECTED_TYPES, PAYLOADS, payload } from './__fixtures__/claude-payloads.ts';
import { tempKingdom } from './__fixtures__/temp.ts';
import { HOOK_SCRIPT, hookCommand } from './index.ts';
import type { TempKingdom } from './__fixtures__/temp.ts';
import type { ClaudeEvent } from './__fixtures__/claude-payloads.ts';
import type { HookEnv } from './context.ts';

const LOAD_TRACE = fileURLToPath(new URL('__fixtures__/load-trace.mjs', import.meta.url));
/** Runs per median: enough to ride out a busy machine, few enough for a CI job. */
const RUNS = 15;
/**
 * What the hook may add to a bare Node start: a soft gate. The development machine measures ~32 ms on top of
 * `node -e 0` (whole call 76 ms, §3.6 "(P1-08)"); CI machines on Windows load files several times slower, so
 * the gate leaves room for them and catches regressions of the size of loading the domain and zod by mistake
 * (200-350 ms). The hard guard is the load trace above it: no `.ts`, no domain, no zod.
 */
const OVERHEAD_BUDGET_MS = 100;

/** The test runner's env without its Node options (coverage, loaders) and without any session of ours. */
const baseEnv = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !/^(NODE_|ELVARIA_|VITEST)/.test(entry[0]) && entry[0] !== 'TZ',
    ),
  );

function runBuilt(stdin: unknown, env: HookEnv, options: { policy?: string; preload?: string[] } = {}) {
  const { command, args } = hookCommand(options.policy);
  const preload = (options.preload ?? []).flatMap((file) => ['--import', pathToFileURL(file).href]);
  const started = performance.now();
  const result = spawnSync(command, [...preload, ...args], {
    input: JSON.stringify(stdin),
    env: { ...baseEnv(), ...env },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    ms: performance.now() - started,
  };
}

const median = (values: number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

beforeAll(() => {
  if (!existsSync(HOOK_SCRIPT))
    throw new Error(`${HOOK_SCRIPT} is missing: run pnpm --filter @elvaria/hooks build`);
});

let kingdom: TempKingdom;
beforeEach(async () => {
  kingdom = await tempKingdom();
});
afterEach(() => kingdom.remove());

describe('the built hook', () => {
  it('turns every Claude event on stdin into its lines', async () => {
    for (const event of Object.keys(PAYLOADS) as ClaudeEvent[]) {
      const { status, stdout, stderr } = runBuilt(PAYLOADS[event], kingdom.env());
      expect({ event, status, stdout, stderr }).toEqual({ event, status: 0, stdout: '', stderr: '' });
    }
    const { events, issues } = await kingdom.log();
    expect(issues).toEqual([]);
    expect(events.map(({ type }) => type).sort()).toEqual(Object.values(EXPECTED_TYPES).flat().sort());
  });

  it('denies a backslash path to .env with a JSON decision on stdout and exit 0', async () => {
    const policy = path.join(kingdom.runDir, 'policy.json');
    await writeFile(policy, JSON.stringify({ version: 1, laws: DC1_LAWS }), 'utf8');
    const write = payload('PreToolUse', {
      tool_name: 'Write',
      tool_input: { file_path: 'C:\\Users\\dev\\dc1-se-team\\.elvaria\\worktrees\\q\\.env', content: 'X=1' },
    });
    const { status, stdout, stderr } = runBuilt(write, kingdom.env(), { policy });
    expect({ status, stderr }).toEqual({ status: 0, stderr: '' });
    const decision = JSON.parse(stdout) as { hookSpecificOutput: Record<string, string> };
    expect(decision.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(decision.hookSpecificOutput.permissionDecisionReason).toMatch(
      /^Elvaria law of this territory: .*forbidden path \(\.env\)/,
    );
    expect((await kingdom.log()).events.map(({ type }) => type)).toEqual(['agent.tool.blocked']);
  });

  it("stamps in the kingdom's zone, whatever zone the machine is in", async () => {
    runBuilt(PAYLOADS.PostToolUse, {
      ...kingdom.env({ ELVARIA_TZ: 'Asia/Kolkata' }),
      TZ: 'America/New_York',
    });
    const [line] = (await kingdom.log()).events;
    expect(line?.ts).toMatch(/\+05:30$/);
  });

  it('loads no .ts file, no @elvaria/domain and no zod', () => {
    const trace = path.join(kingdom.root, 'trace.json');
    const { status } = runBuilt(
      PAYLOADS.PostToolUse,
      { ...kingdom.env(), ELVARIA_LOAD_TRACE: trace },
      {
        preload: [LOAD_TRACE],
      },
    );
    expect(status).toBe(0);
    const files = (JSON.parse(readFileSync(trace, 'utf8')) as string[]).filter((url) =>
      url.startsWith('file:'),
    );
    expect(files.some((url) => url.endsWith('/packages/hooks/dist/elvaria-hook.js'))).toBe(true);
    expect(files.some((url) => url.endsWith('/packages/eventlog/dist/index.js'))).toBe(true);
    expect(files.filter((url) => url.endsWith('.ts') || /\/packages\/domain\/|\/zod\//.test(url))).toEqual(
      [],
    );
  });

  it(`starts within ${OVERHEAD_BUDGET_MS} ms of a bare node -e 0`, async ({ annotate }) => {
    const bare: number[] = [];
    const hook: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const started = performance.now();
      spawnSync(process.execPath, ['-e', '0'], { env: baseEnv() });
      bare.push(performance.now() - started);
      hook.push(runBuilt(PAYLOADS.PostToolUse, kingdom.env()).ms);
    }
    const note = `median of ${RUNS}: node -e 0 ${median(bare).toFixed(0)} ms, hook ${median(hook).toFixed(0)} ms`;
    await annotate(note);
    expect(median(hook) - median(bare), note).toBeLessThan(OVERHEAD_BUDGET_MS);
  });
});
