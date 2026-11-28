// The write fence of a read-only quest (P2-01d): a write tool reaches its report and the quest's letter only, a shell
// line writes no file; the same answer through each of the four dialects. Every written line reads back.
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FLINT_DIALECT } from './__fixtures__/flint-dialect.ts';
import { tempKingdom } from './__fixtures__/temp.ts';
import { compilePaths } from './laws.ts';
import { runHook } from './run-hook.ts';
import { writeFenceViolation } from './write-fence.ts';
import type { TempKingdom } from './__fixtures__/temp.ts';
import type { ToolCall } from './claude/tools.ts';

const PLOT = path.resolve('/work/dc1 repo/.elvaria/worktrees/q_20261128_r34d0n');
const KINGDOM = path.resolve('/work/kingdom');
const QUEST = 'q_20261128_r34d0n';
const LETTER = path.join(KINGDOM, 'quests', QUEST, 'handover.md');
const CTX = { kingdom: KINGDOM, quest: QUEST, writable: compilePaths(['elvaria-report.md']) };

const call = (kind: ToolCall['kind'], guarded: readonly string[], command?: string): ToolCall => ({
  kind,
  paths: guarded,
  guarded,
  command,
  url: undefined,
  subagent: undefined,
  model: undefined,
});
const fence = (target: ToolCall, ctx: Parameters<typeof writeFenceViolation>[2] = CTX) =>
  writeFenceViolation(target, PLOT, ctx);

describe('writeFenceViolation', () => {
  it('lets a write reach the report, by any spelling inside the plot, and the letter', () => {
    expect(fence(call('write', ['elvaria-report.md']))).toBeUndefined();
    expect(fence(call('write', [path.join(PLOT, 'ELVARIA-REPORT.md')]))).toBeUndefined();
    expect(fence(call('write', ['./notes/../elvaria-report.md']))).toBeUndefined();
    expect(fence(call('write', [LETTER]))).toBeUndefined();
  });

  it('refuses every other write, and says where the findings go', () => {
    expect(fence(call('write', ['src/app.ts']))).toContain('src/app.ts is not yours to write');
    expect(fence(call('write', ['elvaria-report.md', 'README.md']))).toContain('README.md');
    expect(fence(call('write', ['docs/elvaria-report.md']))).toContain('docs/elvaria-report.md');
    expect(fence(call('write', ['../elvaria-report.md']))).toContain('../elvaria-report.md');
    expect(fence(call('write', [path.join(KINGDOM, 'quests', QUEST, 'journal.jsonl')]))).toContain(
      'write your findings to elvaria-report.md at the root of your plot, and your handover letter',
    );
    expect(fence(call('write', []))).toContain('a write that names no file');
    expect(fence(call('write', [LETTER]), { ...CTX, quest: undefined })).toContain('handover.md');
  });

  it('refuses a shell line that writes a file itself, and leaves reads and plain lines alone', () => {
    expect(fence(call('bash', [], 'git grep -n token > found.txt'))).toContain('found.txt');
    expect(fence(call('bash', [], 'git grep -n token 2>&1'))).toBeUndefined();
    expect(fence(call('read', ['src/app.ts']))).toBeUndefined();
  });

  it('refuses nothing without writable paths: any quest but a read-only one', () => {
    expect(fence(call('write', ['src/app.ts']), { ...CTX, writable: undefined })).toBeUndefined();
  });
});

interface Answer {
  readonly decision?: string;
  readonly reason?: string;
  readonly verdict?: string;
  readonly why?: string;
  readonly hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason: string };
}

const refusalOf = (stdout: string): string | undefined => {
  if (stdout.trim() === '') return undefined;
  const answer = JSON.parse(stdout) as Answer;
  const decision = answer.decision ?? answer.verdict ?? answer.hookSpecificOutput?.permissionDecision;
  if (decision !== 'deny' && decision !== 'refuse') return undefined;
  return answer.reason ?? answer.why ?? answer.hookSpecificOutput?.permissionDecisionReason;
};

/** A write of `file` (relative to the plot) as each CLI's PreToolUse payload says it, with its argv. */
function writeOf(cli: string, file: string): { payload: unknown; argv: string[] } {
  const absolute = path.resolve(PLOT, file);
  if (cli === 'antigravity') {
    const toolCall = { name: 'write_to_file', args: { TargetFile: absolute, CodeContent: 'x' } };
    return { payload: { conversationId: 's', workspacePaths: [PLOT], toolCall }, argv: ['PreToolUse'] };
  }
  if (cli === 'neutral') {
    const action = { name: 'save', params: { file } };
    return { payload: { kind: 'before_action', thread: 's', dir: PLOT, action }, argv: [] };
  }
  const base = { session_id: 's', cwd: PLOT, hook_event_name: 'PreToolUse' };
  const input =
    cli === 'codex'
      ? {
          tool_name: 'apply_patch',
          tool_input: { command: `*** Begin Patch\n*** Add File: ${file}\n+x\n*** End Patch` },
        }
      : { tool_name: 'Write', tool_input: { file_path: absolute, content: 'x' } };
  const argv = cli === 'codex' ? ['--dialect', 'codex', '--event', 'PreToolUse'] : ['--event', 'PreToolUse'];
  return { payload: { ...base, ...input }, argv };
}

describe('the write fence, through every dialect', () => {
  let kingdom: TempKingdom;
  let policy: string;
  beforeEach(async () => {
    kingdom = await tempKingdom();
    policy = path.join(kingdom.runDir, 'policy.json');
  });
  afterEach(() => kingdom.remove());

  it.each(['claude', 'codex', 'antigravity', 'neutral'])(
    'refuses a source file and keeps the report open: %s',
    async (cli) => {
      const dialect = cli === 'neutral' ? { dialect: FLINT_DIALECT } : {};
      await writeFile(
        policy,
        JSON.stringify({ version: 1, writable_paths: ['elvaria-report.md'], ...dialect }),
        'utf8',
      );
      const write = async (file: string) => {
        const { payload, argv } = writeOf(cli, file);
        const outcome = await runHook({
          stdin: JSON.stringify(payload),
          env: kingdom.env({ ELVARIA_ROLE: 'assignee' }),
          argv: ['--policy', policy, ...argv],
          now: Date.parse('2026-11-28T12:00:00Z'),
        });
        return refusalOf(outcome.stdout);
      };
      expect(await write('src/app.ts')).toContain('src/app.ts is not yours to write');
      expect(await write('elvaria-report.md')).toBeUndefined();
      const { events } = await kingdom.log();
      expect(events.filter(({ type }) => type === 'agent.tool.blocked')).toHaveLength(1);
    },
  );
});
