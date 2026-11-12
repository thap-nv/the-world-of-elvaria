// The code graph's commands in the hook (PS-21): every class, in both CLIs, runs no graphify call but the quest's own
// read-only ones with options that only shape the answer; a class without a shell runs them as one plain call per
// line and nothing else, whether its CLI is Claude Code (which gives it the shell for these alone) or agy.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DC1_LAWS, PLOT, SESSION } from './__fixtures__/claude-payloads.ts';
import { tempKingdom } from './__fixtures__/temp.ts';
import { DEFER_TO_SETTINGS } from './antigravity/translate.ts';
import { claudeInputOf } from './claude/input.ts';
import { preToolUse } from './claude/tool-events.ts';
import { loadContext } from './context.ts';
import { graphLineViolation } from './graph.ts';
import { compileLaws } from './laws.ts';
import { runHook } from './run-hook.ts';
import type { TempKingdom } from './__fixtures__/temp.ts';

const GRAPH = ['graphify query', 'graphify path', 'graphify explain', 'graphify affected'];
const SCOUT = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];
const KNIGHT = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Agent'];
const NOW = Date.parse('2026-11-12T12:00:00Z');

describe('graphLineViolation', () => {
  it('lets the granted commands run with the options that shape the answer', () => {
    for (const line of [
      "graphify query 'FOCUS_MAX AreaCard' --budget 4000 --depth=3",
      'graphify explain "AreaCard()" --all',
      "graphify affected 'FOCUS_MAX' --relation calls",
      "graphify path 'A' 'B' --undirected",
      'C:\\Users\\me\\.local\\bin\\graphify.exe query x',
      'git diff --stat && graphify query x',
      'pnpm test',
    ]) {
      expect(graphLineViolation(line, GRAPH)).toBeUndefined();
    }
  });

  it('refuses every other graphify call, and an option that names another graph or is not read yet', () => {
    expect(graphLineViolation('graphify update .', GRAPH)).toMatch(/^graphify update is refused: only/);
    expect(graphLineViolation('python -m graphify label .', GRAPH)).toMatch(/^graphify label is refused/);
    expect(graphLineViolation('graphify', GRAPH)).toMatch(/^graphify without a command is refused/);
    expect(graphLineViolation('graphify query x --graph C:/other/graph.json', GRAPH)).toMatch(
      /^graphify query --graph is refused: it takes only --dfs, .*--depth/,
    );
    expect(graphLineViolation('graphify explain x --backend=claude', GRAPH)).toMatch(
      /--backend=claude is refused/,
    );
    expect(graphLineViolation('graphify query x; graphify save-result --question q', GRAPH)).toMatch(
      /save-result is refused/,
    );
    expect(graphLineViolation('graphify query x', [])).toBe(
      'graphify is refused: this quest has no code graph',
    );
  });
});

describe('a Claude session (PS-21)', () => {
  let kingdom: TempKingdom;
  beforeEach(async () => {
    kingdom = await tempKingdom();
  });
  afterEach(() => kingdom.remove());

  const reasonOf = (tools: readonly string[], command: string, graph: readonly string[] = GRAPH) => {
    const ctx = {
      ...loadContext(kingdom.env(), []),
      laws: compileLaws(DC1_LAWS),
      tools,
      graphCommands: graph,
    };
    const raw = {
      hook_event_name: 'PreToolUse',
      session_id: SESSION,
      cwd: PLOT,
      tool_name: 'Bash',
      tool_input: { command },
    };
    const output = preToolUse(claudeInputOf(raw), ctx).decision?.hookSpecificOutput as
      { permissionDecisionReason?: string } | undefined;
    return output?.permissionDecisionReason;
  };

  it('lets a scout given the shell for the graph run one plain graph call, and nothing else', () => {
    expect(reasonOf(SCOUT, "graphify query 'FOCUS_MAX'")).toBeUndefined();
    expect(reasonOf(SCOUT, 'pnpm test')).toMatch(
      /^Elvaria rule: your class has no shell; it may run only graphify query, .*each alone on its line/,
    );
    expect(reasonOf(SCOUT, "graphify query 'x' && rm -rf src")).toMatch(
      /your class has no shell, only graphify query.*this line has & outside quotes/,
    );
  });

  it('refuses a graph-writing call to a class with a shell too, and any graphify call without a graph', () => {
    expect(reasonOf(KNIGHT, 'graphify update .')).toMatch(/^Elvaria rule: graphify update is refused/);
    expect(reasonOf(KNIGHT, 'pnpm test && graphify query x')).toBeUndefined();
    expect(reasonOf(KNIGHT, 'graphify query x', [])).toMatch(/this quest has no code graph/);
    expect(reasonOf(KNIGHT, 'pnpm test', [])).toBeUndefined();
  });
});

describe('an agy session (PS-21)', () => {
  let kingdom: TempKingdom;
  let policy = '';
  beforeEach(async () => {
    kingdom = await tempKingdom();
    policy = path.join(kingdom.runDir, 'policy.json');
  });
  afterEach(() => kingdom.remove());

  const withPolicy = (tools: readonly string[], graph?: readonly string[]) =>
    writeFile(
      policy,
      JSON.stringify({
        version: 1,
        tools,
        laws: DC1_LAWS,
        ...(graph === undefined ? {} : { graph_commands: graph }),
      }),
    );

  async function decide(command: string): Promise<Record<string, unknown>> {
    const input = {
      conversationId: 'c-1',
      workspacePaths: [PLOT],
      stepIdx: 1,
      toolCall: { name: 'run_command', args: { CommandLine: command } },
    };
    const { stdout } = await runHook({
      stdin: JSON.stringify(input),
      env: kingdom.env(),
      argv: ['PreToolUse', '--policy', policy],
      now: NOW,
    });
    return stdout === '' ? {} : (JSON.parse(stdout) as Record<string, unknown>);
  }

  it('defers a plain graph call of a scout to the settings, which allow its prefix', async () => {
    await withPolicy(SCOUT, GRAPH);
    expect(await decide("graphify explain 'AreaCard()'")).toEqual(DEFER_TO_SETTINGS);
    const refused = await decide("graphify query 'x' | Out-File a.txt");
    expect(refused).toMatchObject({ decision: 'deny' });
    expect(refused.reason).toMatch(
      /your class has no shell, only graphify query.*this line has \| outside quotes/,
    );
    const other = await decide('Get-ChildItem');
    expect(other.reason).toMatch(/; to ask the code graph, run graphify query or .* alone;/);
  });

  it('refuses a graph-writing call whatever the class, and every graphify call without a graph', async () => {
    await withPolicy(KNIGHT, GRAPH);
    const other = await decide("graphify query 'x' --graph D:/x/graph.json");
    expect(other.decision).toBe('deny');
    expect(other.reason).toMatch(/^Elvaria rule: run_command: graphify query --graph is refused/);
    await withPolicy(KNIGHT);
    expect((await decide('graphify explain x')).reason).toMatch(/this quest has no code graph/);
    expect(await decide('pnpm test')).toEqual(DEFER_TO_SETTINGS);
  });
});
