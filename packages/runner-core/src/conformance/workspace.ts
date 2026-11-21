// Where a conformance check runs: a throwaway kingdom with one plot, one run folder and one quest folder, and the
// request a check spawns there. The folder name has a space, like real kingdoms (`D:\Dummy\Tool - Personal\…`).
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CharacterSchema } from '@elvaria/domain';

import { WORKSPACE_PREFIX, sweepStaleWorkspaces } from './sweep.ts';
import { toolPolicyOf } from '../policy/tool-policy.ts';
import type { ToolPolicyInput } from '../policy/tool-policy.ts';
import {
  FAKE_FORBIDDEN_COMMAND,
  FAKE_QUESTION,
  FAKE_SCENARIO_ENV,
  FAKE_SCRATCH_COMMANDS,
  FAKE_SECRET_COMMANDS,
  FAKE_STRUCTURED_ANSWER,
  FAKE_STRUCTURED_SCHEMA,
} from './scenarios.ts';
import { FAKE_IMAGE_SCHEMA, fakeImageAsk, fakeImagePath, writeFakeImage } from './image-probe.ts';
import { SPAWN_PROBE_COMMAND, writeSpawnProbe } from './spawn-probe.ts';
import type { AgentRunner, BuiltPrompt, SpawnRequest } from '../runner/types.ts';
import type { FakeScenario } from './scenarios.ts';
import type { StripeColor } from './stripes.ts';
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
 * `hang` check of runner-antigravity). Linear back-off: up to 5.5 s in all. A real agy held it for minutes
 * (2026-11-12): past the retries the workspace stays and the check says so (`leave` of play.ts), it does not fail.
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

/** Where workspaces are made and what time it is; a test injects both. */
export interface WorkspaceOptions {
  readonly tmp?: string;
  readonly now?: () => number;
}

/**
 * Opens a fresh workspace, first clearing the ones an earlier killed turn left (sweep.ts): the one point every turn
 * passes through, so rubbish never outlives the next check by more than the hour a live turn could still be using it.
 */
export async function openWorkspace(options: WorkspaceOptions = {}): Promise<Workspace> {
  const tmp = options.tmp ?? tmpdir();
  await sweepStaleWorkspaces({ tmp, now: options.now ?? Date.now });
  const root = await mkdtemp(path.join(tmp, WORKSPACE_PREFIX));
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

/** What a scenario sees before the session starts: the stripes of the image probe, left to right (PS-11b). */
export interface Prepared {
  readonly colors?: readonly StripeColor[];
}

/**
 * What a scenario needs before the session starts: the spawn probe's script in the plot, the image probe's PNG in the
 * run folder's screens, outside the plot as a review's are.
 */
export async function prepareWorkspace(workspace: Workspace, scenario: FakeScenario): Promise<Prepared> {
  if (scenario === 'spawn_child') await writeSpawnProbe(workspace.plot);
  return scenario === 'image' ? { colors: await writeFakeImage(workspace.run_dir) } : {};
}

/** What each scenario asks; a real CLI follows the words, a fake one its env. The image probe names its file. */
const ASKS: Readonly<Record<Exclude<FakeScenario, 'image'>, string>> = {
  submit: 'Reply with the single word: done. Use no tool.',
  crash: 'Stop with an error.',
  hang: 'Count from 1 to 100000, one number per line. Use no tool.',
  rate_limit: 'Keep working until the account runs out of usage.',
  forbidden_command: `Run this shell command exactly once: ${FAKE_FORBIDDEN_COMMAND}. Then reply with the single word: done.`,
  ask: `Write this question in the Question section of the handover letter, then stop: ${FAKE_QUESTION}`,
  scratch_commit: `Run these shell commands exactly once each, in order: ${FAKE_SCRATCH_COMMANDS.join(', then ')}. Then reply with the single word: done.`,
  // A real model is asked for the place only: Codex's would not run a line naming git's credentials (secret-check.ts).
  secret_place: `Run this shell command exactly once: ${FAKE_SECRET_COMMANDS[0]}. Then reply with the single word: done.`,
  spawn_child: `Run this shell command exactly once, in the folder you are in: ${SPAWN_PROBE_COMMAND}. Then reply with the single word: done.`,
  structured: `Give the verdict ${FAKE_STRUCTURED_ANSWER.result} with the note "${FAKE_STRUCTURED_ANSWER.notes}". Fill in no other field. Use no tool.`,
};

const PROBE_SYSTEM =
  'You are a probe of the Elvaria conformance suite. Do exactly what you are asked, nothing more.';

/**
 * The probe is an assignee, and an assignee's hook does not let it stop before it has left a letter (ADR 0010),
 * so the system part says where the letter goes, as buildPrompt does for a real assignee. A judge leaves none.
 */
const promptOf = (
  scenario: FakeScenario,
  handover: string | undefined,
  workspace: Workspace,
): BuiltPrompt => ({
  system:
    handover === undefined
      ? PROBE_SYSTEM
      : [
          PROBE_SYSTEM,
          `Before you stop, write your handover letter, the file ${handover}: the heading "## Where I am" and one line`,
          'under it saying what you did. Add no other heading unless you are asked to.',
        ].join(' '),
  user: scenario === 'image' ? fakeImageAsk(fakeImagePath(workspace.run_dir)) : ASKS[scenario],
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

/** A git territory without laws of its own: only Elvaria's fences stand. */
const PROBE_POLICY_TERRITORY: NonNullable<ToolPolicyInput['territory']> = {
  laws: {
    forbidden_paths: [],
    read_only_paths: [],
    patch_paths: [],
    forbidden_commands: [],
    read_before_write: [],
    rank_floor: [],
  },
  checks: [],
  commands: {},
  vcs: { type: 'git', default_branch: 'main' },
};

/** A knight's shell: git is allowed, so only the fences can stop the push; node runs the spawn probe (P1-12e). */
const PROBE_POLICY = toolPolicyOf({
  role: 'assignee',
  characterClass: {
    tools: {
      allow: [
        'Read',
        'Edit',
        'Write',
        'Glob',
        'Grep',
        'Bash(git status:*)',
        'Bash(git commit:*)',
        'Bash(node:*)',
      ],
      deny: [],
    },
  },
  territory: PROBE_POLICY_TERRITORY,
});

/** A judge in its scratch plot whose class allows commit and push: only the fences of the plot can stop them. */
const SCRATCH_JUDGE_POLICY = toolPolicyOf({
  role: 'verifier',
  scratch: true,
  characterClass: {
    tools: {
      allow: ['Read', 'Glob', 'Grep', 'Bash(git status:*)', 'Bash(git commit:*)', 'Bash(git push:*)'],
      deny: ['Edit', 'Write', 'Agent'],
    },
  },
  territory: PROBE_POLICY_TERRITORY,
});

/** A judge in its own plot, read-only, as the Steward's verdict sessions run (ADR 0008). */
const JUDGE_INPUT: ToolPolicyInput = {
  role: 'verifier',
  characterClass: { tools: { allow: ['Read', 'Glob', 'Grep'], deny: ['Edit', 'Write', 'Agent'] } },
  territory: PROBE_POLICY_TERRITORY,
};
const JUDGE_POLICY = toolPolicyOf(JUDGE_INPUT);

/** The judge of the image probe: its policy opens the one image of its review (PS-11b). */
const imageJudgePolicy = (workspace: Workspace) =>
  toolPolicyOf({ ...JUDGE_INPUT, images: [fakeImagePath(workspace.run_dir)] });

const policyOf = (scenario: FakeScenario, workspace: Workspace) => {
  if (scenario === 'scratch_commit') return SCRATCH_JUDGE_POLICY;
  if (scenario === 'image') return imageJudgePolicy(workspace);
  return scenario === 'structured' ? JUDGE_POLICY : PROBE_POLICY;
};

/** The schema a judging scenario answers in. */
const schemaOf = (scenario: FakeScenario) =>
  scenario === 'image' ? FAKE_IMAGE_SCHEMA : FAKE_STRUCTURED_SCHEMA;

export function conformanceRequest(
  workspace: Workspace,
  scenario: FakeScenario,
  runner: AgentRunner,
  target: ConformanceTarget,
): SpawnRequest {
  // scratch_commit plays a judge in its scratch plot, structured a judge giving its verdict, as the Steward asks it
  // (a schema, no letter), image a judge reading a screen of its review; every other scenario the knight probe.
  const verdict = scenario === 'structured' || scenario === 'image';
  const judge = verdict || scenario === 'scratch_commit';
  return {
    role: judge ? 'verifier' : 'assignee',
    character: probeCharacter(runner, target),
    cwd: workspace.plot,
    prompt: promptOf(scenario, verdict ? undefined : workspace.handover, workspace),
    permissions: policyOf(scenario, workspace),
    budget: PROBE_BUDGET,
    env: {
      ...target.env,
      ELVARIA_KINGDOM: workspace.root,
      ELVARIA_QUEST: CONFORMANCE_QUEST,
      ELVARIA_ATTEMPT: '1',
      ELVARIA_CHARACTER: CONFORMANCE_CHARACTER,
      ELVARIA_ROLE: judge ? 'verifier' : 'assignee',
      [FAKE_SCENARIO_ENV]: scenario,
    },
    run_dir: workspace.run_dir,
    ...(verdict ? { structured: schemaOf(scenario) } : { handover: workspace.handover }),
  };
}
