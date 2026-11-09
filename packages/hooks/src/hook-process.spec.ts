// The built hook as the CLIs run it: `node --conditions=elvaria-dist dist/elvaria-hook.js`, one process per
// call, stdin in, exit code out (implementation-plan §3.6). `pnpm test` builds first; the budget of 100 ms is
// measured here on the build, next to `node -e 0` on the same machine.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';
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
 * `node -e 0` (whole call 76 ms, §3.6 "(P1-08)"); CI machines load files several times slower, so the gate
 * leaves room for them and catches regressions of the size of loading the domain and zod by mistake
 * (200-350 ms). A macOS runner measured 101 ms on top of `node -e 0` (74 ms, hook 175 ms) with no regression,
 * so the gate is 150 ms, still under the smallest such regression (owner, after P1-09). The hard guard is the
 * load trace above it: no `.ts`, no domain, no zod.
 */
const OVERHEAD_BUDGET_MS = 150;

/** The test runner's env without its Node options (coverage, loaders) and without any session of ours. */
const baseEnv = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !/^(NODE_|ELVARIA_|VITEST)/.test(entry[0]) && entry[0] !== 'TZ',
    ),
  );

interface RunOptions {
  readonly policy?: string;
  readonly preload?: string[];
  /** agy's form: the event right after the script, as `.agents/elvaria-hook.mjs` leaves argv (§3.7). */
  readonly event?: string;
}

function runBuilt(stdin: unknown, env: HookEnv, options: RunOptions = {}) {
  const { command, args } = hookCommand(options.policy);
  const preload = (options.preload ?? []).flatMap((file) => ['--import', pathToFileURL(file).href]);
  const script = args.indexOf(HOOK_SCRIPT) + 1;
  const event = options.event === undefined ? [] : [options.event];
  const argv = [...args.slice(0, script), ...event, ...args.slice(script)];
  const started = performance.now();
  const result = spawnSync(command, [...preload, ...argv], {
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

/**
 * Touching `process.stdin` opens fd 0 as a libuv pipe, which makes it non-blocking on POSIX: what a parent that
 * leaves the pipe non-blocking does (macOS CI, PR #32 and PR #76). Windows pipes stay blocking.
 */
const NON_BLOCKING_STDIN = 'data:text/javascript,process.stdin';

/**
 * The built hook on a non-blocking stdin, its payload written in two halves with a pause between them: the first
 * read gets the first half, the next one EAGAIN (P1-36). `readFileSync(0)` dropped that first half.
 */
async function runSplit(stdin: unknown, env: HookEnv, policy: string) {
  const { command, args } = hookCommand(policy);
  const child = spawn(command, ['--import', NON_BLOCKING_STDIN, ...args, '--event', 'PreToolUse'], {
    env: { ...baseEnv(), ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  const closed = once(child, 'close') as Promise<[number | null]>;
  const text = JSON.stringify(stdin);
  child.stdin.write(text.slice(0, text.length / 2));
  await setTimeout(300);
  child.stdin.end(text.slice(text.length / 2));
  const [status] = await closed;
  return { status, stdout, stderr };
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

  it('reads a payload whole across EAGAIN on a non-blocking stdin, and judges the call itself (P1-36)', async () => {
    const policy = path.join(kingdom.runDir, 'policy.json');
    await writeFile(policy, JSON.stringify({ version: 1, laws: DC1_LAWS }), 'utf8');
    const push = payload('PreToolUse', {
      tool_name: 'Bash',
      tool_input: { command: 'git push origin HEAD' },
    });
    const { status, stdout, stderr } = await runSplit(push, kingdom.env(), policy);
    expect({ status, stderr }).toEqual({ status: 0, stderr: '' });
    // A cut payload would be denied too, but for the unreadable call: the law's reason shows it was read whole.
    const decision = JSON.parse(stdout) as { hookSpecificOutput: Record<string, string> };
    expect(decision.hookSpecificOutput.permissionDecisionReason).toMatch(/^Elvaria law of this territory: /);
    const { events } = await kingdom.log();
    expect(events.map(({ type, data }) => [type, data.tool])).toEqual([['agent.tool.blocked', 'bash']]);
  });

  it('denies a PreToolUse whose payload is empty, with the JSON decision and exit 0', () => {
    const { command, args } = hookCommand();
    const result = spawnSync(command, [...args, '--event', 'PreToolUse'], {
      input: '',
      env: { ...baseEnv(), ...kingdom.env() },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  });

  it("answers agy's PreToolUse with the event from argv: deny for a law, defer to the settings otherwise", async () => {
    const policy = path.join(kingdom.runDir, 'policy.json');
    await writeFile(policy, JSON.stringify({ version: 1, laws: DC1_LAWS }), 'utf8');
    const agyCall = (args: Record<string, unknown>) => ({
      conversationId: '32a0acb0-1790-48c1-b110-39fb5d66ed0f',
      lastUserInput: 'Do the quest.',
      workspacePaths: ['C:/Users/dev/dc1-se-team/.elvaria/worktrees/q'],
      toolCall: { name: 'run_command', args },
    });
    const pushed = runBuilt(agyCall({ CommandLine: 'git push origin HEAD' }), kingdom.env(), {
      policy,
      event: 'PreToolUse',
    });
    expect({ status: pushed.status, stderr: pushed.stderr }).toEqual({ status: 0, stderr: '' });
    expect(JSON.parse(pushed.stdout)).toMatchObject({ decision: 'deny' });
    const tested = runBuilt(agyCall({ CommandLine: 'pnpm test' }), kingdom.env(), {
      policy,
      event: 'PreToolUse',
    });
    expect(JSON.parse(tested.stdout)).toEqual({ decision: 'deny_unless_prior_grant' });
    expect((await kingdom.log()).events.map(({ type }) => type)).toEqual(['agent.tool.blocked']);
  });

  it('lets a knight regenerate a read-only page with the generator, never write it by hand (P1-24)', async () => {
    const plot = path.join(kingdom.root, 'plot with space');
    await mkdir(path.join(plot, 'docs'), { recursive: true });
    await writeFile(path.join(plot, 'glossary.json'), '{"seal":"dấu vua"}', 'utf8');
    // A stand-in for `pnpm docs:gen`: reads the source, writes the generated page.
    const generator =
      "const fs=require('fs');const g=JSON.parse(fs.readFileSync('glossary.json','utf8'));fs.writeFileSync('docs/glossary.md',Object.entries(g).map(([k,v])=>'- '+k+': '+v).join('\\n'))";
    await writeFile(path.join(plot, 'gen.cjs'), generator, 'utf8');
    const policy = path.join(kingdom.runDir, 'policy.json');
    const laws = { ...DC1_LAWS, read_only_paths: ['docs/glossary.md'] };
    await writeFile(policy, JSON.stringify({ version: 1, laws }), 'utf8');
    const pre = (tool_name: string, tool_input: Record<string, unknown>) =>
      runBuilt(payload('PreToolUse', { tool_name, tool_input, cwd: plot }), kingdom.env(), { policy });
    expect(pre('Bash', { command: 'node gen.cjs' }).stdout).toBe('');
    const ran = spawnSync(process.execPath, ['gen.cjs'], { cwd: plot, env: baseEnv(), encoding: 'utf8' });
    expect(ran.status).toBe(0);
    const page = path.join(plot, 'docs', 'glossary.md');
    expect(readFileSync(page, 'utf8')).toBe('- seal: dấu vua');
    expect(pre('Read', { file_path: page }).stdout).toBe('');
    const hand = JSON.parse(pre('Write', { file_path: page, content: 'x' }).stdout) as {
      hookSpecificOutput: Record<string, string>;
    };
    expect(hand.hookSpecificOutput.permissionDecisionReason).toMatch(/glossary\.md is read-only/);
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
