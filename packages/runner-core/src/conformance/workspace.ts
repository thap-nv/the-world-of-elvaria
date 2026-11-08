// Where a conformance check runs: a throwaway kingdom with one plot, one run folder and one quest folder, and the
// request a check spawns there. The folder name has a space, like real kingdoms (`D:\Dummy\Tool - Personal\…`).
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CharacterSchema } from '@elvaria/domain';

import { toolPolicyOf } from '../policy/tool-policy.ts';
import { FAKE_FORBIDDEN_COMMAND, FAKE_QUESTION, FAKE_SCENARIO_ENV } from './scenarios.ts';
import type { AgentRunner, BuiltPrompt, SpawnRequest } from '../runner/types.ts';
import type { FakeScenario } from './scenarios.ts';
import type { ConformanceTarget } from './target.ts';

/** A quest id in the domain's shape (`q_<date>_<6 Crockford>`), so hooks and readers accept the lines. */
export const CONFORMANCE_QUEST = 'q_20261107_c0nf0r';
export const CONFORMANCE_CHARACTER = 'probe';
const STARTED = '2026-11-07T00:00:00+07:00';
const DEFAULT_MODEL = 'claude-haiku-5-5';
/**
 * A probe never needs more; the CLI stops it if it tries. The tiny job takes a turn or two; the handover letter a
 * real hook asks for at Stop (ADR 0010) takes a few more (P1-09, first run against Claude Code).
 */
const PROBE_BUDGET = { max_turns: 10, max_minutes: 5 } as const;
/**
 * On Windows a killed session's own children (a hook, agy's shim) may still hold the plot for a moment: killing
 * the whole tree is P1-06. rm() then fails with EBUSY or EPERM, which its retries are made for (CI, PR #32: the
 * `hang` check of runner-antigravity). Linear back-off: up to 5.5 s in all.
 */
const REMOVE_RETRIES = 10;
const REMOVE_RETRY_MS = 100;

export interface Workspace {
  readonly root: string;
  readonly plot: string;
  readonly run_dir: string;
  readonly handover: string;
  remove(): Promise<void>;
}

export async function openWorkspace(): Promise<Workspace> {
  const root = await mkdtemp(path.join(tmpdir(), 'elvaria conformance '));
  const plot = path.join(root, 'plot');
  const runDir = path.join(root, '.runs', `${CONFORMANCE_QUEST}-1`);
  await Promise.all([mkdir(plot), mkdir(runDir, { recursive: true })]);
  return {
    root,
    plot,
    run_dir: runDir,
    handover: path.join(root, 'quests', CONFORMANCE_QUEST, 'handover.md'),
    remove: () =>
      rm(root, { recursive: true, force: true, maxRetries: REMOVE_RETRIES, retryDelay: REMOVE_RETRY_MS }),
  };
}

/** What each scenario asks; a real CLI follows the words, a fake one its env. */
const ASKS: Readonly<Record<FakeScenario, string>> = {
  submit: 'Reply with the single word: done. Use no tool.',
  crash: 'Stop with an error.',
  hang: 'Count from 1 to 100000, one number per line. Use no tool.',
  rate_limit: 'Keep working until the account runs out of usage.',
  forbidden_command: `Run this shell command exactly once: ${FAKE_FORBIDDEN_COMMAND}. Then reply with the single word: done.`,
  ask: `Write this question in the Question section of the handover letter, then stop: ${FAKE_QUESTION}`,
};

/**
 * The probe is an assignee, and an assignee's hook does not let it stop before it has left a letter (ADR 0010),
 * so the system part says where the letter goes, as buildPrompt does for a real assignee.
 */
const promptOf = (scenario: FakeScenario, handover: string): BuiltPrompt => ({
  system: [
    'You are a probe of the Elvaria conformance suite. Do exactly what you are asked, nothing more.',
    `Before you stop, write your handover letter, the file ${handover}: the heading "## Where I am" and one line`,
    'under it saying what you did. Add no other heading unless you are asked to.',
  ].join(' '),
  user: ASKS[scenario],
});

function probeCharacter(runner: AgentRunner, target: ConformanceTarget) {
  return CharacterSchema.parse({
    version: 1,
    id: CONFORMANCE_CHARACTER,
    name: 'Probe',
    class: 'knight',
    tribe: runner.tribe,
    model: target.model ?? DEFAULT_MODEL,
    level: 1,
    reputation: { window: [] },
    status: 'working',
    status_since: STARTED,
    current: { quest: CONFORMANCE_QUEST, role: 'assignee' },
    vow_no_production: false,
    consecutive_fail: { count: 0 },
    stats: { quests_done: 0, tokens_today: 0, tokens_day: STARTED.slice(0, 'yyyy-mm-dd'.length) },
    created_at: STARTED,
  });
}

/** A knight's shell: git is allowed, so only the fences can stop the push. */
const PROBE_POLICY = toolPolicyOf({
  role: 'assignee',
  characterClass: {
    tools: {
      allow: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(git status:*)', 'Bash(git commit:*)'],
      deny: [],
    },
  },
  territory: {
    laws: {
      forbidden_paths: [],
      read_only_paths: [],
      forbidden_commands: [],
      read_before_write: [],
      rank_floor: [],
    },
    checks: [],
    commands: {},
  },
});

export function conformanceRequest(
  workspace: Workspace,
  scenario: FakeScenario,
  runner: AgentRunner,
  target: ConformanceTarget,
): SpawnRequest {
  return {
    role: 'assignee',
    character: probeCharacter(runner, target),
    cwd: workspace.plot,
    prompt: promptOf(scenario, workspace.handover),
    permissions: PROBE_POLICY,
    budget: PROBE_BUDGET,
    env: {
      ...target.env,
      ELVARIA_KINGDOM: workspace.root,
      ELVARIA_QUEST: CONFORMANCE_QUEST,
      ELVARIA_ATTEMPT: '1',
      ELVARIA_CHARACTER: CONFORMANCE_CHARACTER,
      ELVARIA_ROLE: 'assignee',
      [FAKE_SCENARIO_ENV]: scenario,
    },
    run_dir: workspace.run_dir,
    handover: workspace.handover,
  };
}
