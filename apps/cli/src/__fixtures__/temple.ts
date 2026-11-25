// The Temple's specs (PS-12f): a kingdom where three runs of thorn failed `tests_fail` (the quests, the verdict files and
// their `verdict.fail` lines, which the Temple's count reads), a Monk to add, and a Monk's runner that answers from a
// script: its structured output on a tribe with the JSON Schema flag, its last text on one without, or a hang that
// only a kill ends. No mana: no CLI runs.
import path from 'node:path';

import { EVENT_VERSION, EventSchema, TribeIdSchema, VerdictSchema, createIdSource } from '@elvaria/domain';
import type { Event, InboxCommand, TribeHold } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import { createFakeRunner, createSignalChannel, openFileTreasury } from '@elvaria/runner-core';
import type { AgentRunner, RunOutcome, RunResult, RunnerSignal, SpawnRequest } from '@elvaria/runner-core';
import { createSteward, folderPlots } from '@elvaria/steward';
import type { Steward, StewardDeps } from '@elvaria/steward';
import { openKingdom } from '@elvaria/store';

import { consoleBell } from '../run/bell.ts';
import { TZ, run, testIo } from './cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from './quest.ts';
import type { TestIo } from './cli.ts';

export const FAILED = `${QUEST_ID}-1`;
export const MONK_TOKENS = 2400;
const at = (hour: number) => `2026-11-06T${String(hour).padStart(2, '0')}:00:00+07:00`;

/** Three runs of thorn (TEMPLE_REPEAT_MIN), each failed `tests_fail` by vesper, with their lines in the log. */
export async function stageFailures(kingdom: string): Promise<void> {
  const ids = [QUEST_ID, OTHER_QUEST_ID, 'q_20261106_9p5q4c'];
  const quests = ids.map((id, index) =>
    questFixture('archived', id, {
      attempts: 1,
      attempt_log: [
        {
          n: 1,
          character: 'thorn',
          role: 'assignee',
          started_at: at(8 + index),
          ended_at: at(9 + index),
          outcome: 'submitted',
          session_id: `s-${String(index)}`,
          tokens: 1000,
          run_dir: `.runs/${id}-1`,
        },
      ],
    }),
  );
  await plantQuests(kingdom, ...quests);
  const store = openKingdom(kingdom);
  for (const id of ids)
    await store.verdicts.write(
      VerdictSchema.parse({
        version: 1,
        id: `${id}-1`,
        quest_id: id,
        attempt: 1,
        verifier_id: 'vesper',
        ritual: 'build_review',
        checks: [],
        result: 'fail',
        fail_kind: 'tests_fail',
        notes: 'pnpm test fails: the new handler has no test.',
        by_human: false,
        session_id: `v-${id}`,
        created_at: at(20),
      }),
    );
  await openEventLog(kingdom).append(
    ids.map((id, index) =>
      EventSchema.parse({
        v: EVENT_VERSION,
        id: `01KA0000000000000000000V0${String(index)}`,
        ts: at(20),
        type: 'verdict.fail',
        actor: { kind: 'character', id: 'vesper' },
        quest: id,
        data: { verdict: `${id}-1`, fail_kind: 'tests_fail' },
      }),
    ),
  );
}

export interface MonkAnswer {
  readonly structured?: unknown;
  /** Its last words: where a tribe without the JSON Schema flag puts its JSON. */
  readonly text?: string;
  /** Never ends on its own: only a kill ends it. */
  readonly hang?: boolean;
}

export interface MonkRunner extends AgentRunner {
  readonly heard: SpawnRequest[];
}

const resultOf = (answer: MonkAnswer, session: string, outcome: RunOutcome): RunResult => ({
  outcome,
  exit_code: outcome === 'completed' ? 0 : null,
  usage: { tokens: MONK_TOKENS },
  ...(answer.structured === undefined ? {} : { structured: answer.structured }),
  session_id: session,
  duration_ms: 1,
  permission_denials: [],
  rate_limited: false,
});

/** A Monk of `tribe` whose sessions play `answers` in turn; `native`: its CLI has a JSON Schema flag. */
export function monkRunner(answers: readonly MonkAnswer[], tribe = 'gemini', native = true): MonkRunner {
  const fake = createFakeRunner();
  const heard: SpawnRequest[] = [];
  return {
    ...fake,
    tribe: TribeIdSchema.parse(tribe),
    capabilities: { ...fake.capabilities, structured_output: native },
    heard,
    spawn: (req) => {
      heard.push(req);
      const answer = answers[heard.length - 1] ?? {};
      const session = `monk-${String(heard.length)}`;
      const signals = createSignalChannel<RunnerSignal>();
      let finish: (result: RunResult) => void = () => undefined;
      const ended = new Promise<RunResult>((resolve) => {
        finish = resolve;
      });
      const end = (outcome: RunOutcome) => {
        signals.close();
        finish(resultOf(answer, session, outcome));
      };
      if (answer.text !== undefined) signals.push({ kind: 'text', text: answer.text });
      if (answer.hang !== true) end('completed');
      return Promise.resolve({
        session_id: Promise.resolve(session),
        pid: 0,
        signals: signals.iterable,
        wait: () => ended,
        kill: () => {
          end('killed');
          return Promise.resolve();
        },
      });
    },
  };
}

/** The decision of rung `check` on the group: a letter to the Chancellor. */
export const LETTER_REPLY = {
  version: 1,
  decisions: [
    {
      group: 'tests_fail',
      rung: 'check',
      why: 'Lãnh thổ có check test; chạy nó trước khi chấm thì bắt được lỗi này.',
      letter: { source_verdict: FAILED, body: 'Bật check `test` của dc1-se-team trước lượt chấm.' },
    },
  ],
};

export const LINE_TEXT = 'Run the tests of every package you touched before you hand in.';

/** The decision of rung `scripture`: a line of the temple's scripture for every assignee. */
export const LINE_REPLY = {
  version: 1,
  decisions: [
    {
      group: 'tests_fail',
      rung: 'scripture',
      why: 'Người làm quên chạy test của package đã sửa.',
      lesson: { owner: 'temple', scope: { role: ['assignee'] }, text: LINE_TEXT, source_verdict: FAILED },
    },
  ],
};

/** Rung `check` that carries a line too: the zod rule a CLI without the flag cannot hold. */
export const LETTER_AND_LINE_REPLY = {
  ...LETTER_REPLY,
  decisions: [{ ...LETTER_REPLY.decisions[0], lesson: LINE_REPLY.decisions[0]?.lesson }],
};

export const fenced = (value: unknown): string =>
  `My decisions:\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;

/** sage, of the registry's Monk class, on its tribe gemini. */
export async function addMonk(kingdom: string): Promise<void> {
  const io = testIo();
  const added = await run(io, 'character', 'add', 'sage', '--class', 'monk', '--kingdom', kingdom);
  if (added !== 0) throw new Error(`character add: ${io.printed.err.join('\n')}`);
}

export const inboxOf = async (kingdom: string): Promise<InboxCommand[]> =>
  (await openKingdom(kingdom).inbox.read()).flatMap(({ command }) => (command.ok ? [command.value] : []));

export const templeRanOf = async (kingdom: string): Promise<Event[]> =>
  (await openEventLog(kingdom).read()).events.filter(({ type }) => type === 'temple.ran');

/** A Steward with no runner and `onCall`, started: its ticks apply the inbox and start the job. */
export async function stewardOf(
  kingdom: string,
  io: TestIo,
  onCall: StewardDeps['onCall'] = [],
): Promise<Steward> {
  const ids = createIdSource({ clock: io.clock, random: io.random, tz: TZ });
  if (!ids.ok) throw new Error('tz');
  const steward = createSteward({
    store: openKingdom(kingdom),
    events: openEventLog(kingdom),
    runners: {},
    plots: folderPlots(kingdom),
    env: {},
    treasury: openFileTreasury(path.join(kingdom, '..', 'no-treasury.json')),
    clock: io.clock,
    ids: ids.value,
    bell: consoleBell(translator('en'), io),
    log: { warn: () => undefined },
    onCall,
  });
  await steward.start({ loop: false });
  return steward;
}

/** The Monk's tribe held by its CLI's version. */
export const HOLD: TribeHold = {
  tribe: TribeIdSchema.parse('gemini'),
  path: 'C:/tools/agy.exe',
  version: '1.6.0',
  checked: '1.5.9',
};
