// The limits of a tribe its adapter narrows (implementation-plan §3.14, tribeLimitsOf, P1-33), as the Steward applies
// them: without a tool gate there is no Stop hook, so the Steward checks the letter after the session and reminds
// the assignee as the hook would block it (ADR 0010); without a context file the territory's law and rules come in
// the prompt.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { openJournal } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { folderPlots } from './plots.ts';
import { LETTER_REMINDERS_MAX } from './sessions/letter.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { AdapterCapabilities, QuestId } from '@elvaria/domain';
import type { AgentRunner, SpawnRequest } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(overrides: (kingdom: Bench) => Partial<StewardDeps>) {
  current = await bench();
  running = current.steward(overrides(current));
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const isReminder = (req: SpawnRequest) => path.basename(req.run_dir).startsWith('letter-');
const assigneesOf = (spawned: readonly SpawnRequest[]) => spawned.filter(({ role }) => role === 'assignee');

/**
 * A tribe whose adapter lacks `lacks`; its assignees write their letter only when `writes(req)` says so (the fake
 * writes it wherever a request names one), and every request is kept in `spawned`.
 */
function narrowed(
  fake: AgentRunner,
  lacks: Partial<AdapterCapabilities>,
  spawned: SpawnRequest[],
  writes: (req: SpawnRequest) => boolean = () => true,
): AgentRunner {
  return {
    ...fake,
    capabilities: { ...fake.capabilities, ...lacks },
    spawn: (req) => {
      spawned.push(req);
      if (req.role !== 'assignee' || writes(req)) return fake.spawn(req);
      const { handover: _, ...silent } = req;
      return fake.spawn(silent);
    },
  };
}

const notificationsOf = async (kingdom: Bench, quest: QuestId) =>
  (await openJournal(kingdom.root, quest).read()).events
    .filter(({ type }) => type === 'agent.notification')
    .map(({ data }) => data);

describe('a tribe without a tool gate: the letter checked after the session (handover_check: after_session)', () => {
  it('reminds an assignee who left its letter unchanged, as the Stop hook would, then lets it through and says so', async () => {
    const spawned: SpawnRequest[] = [];
    const { kingdom, steward } = await open((k) => ({
      runners: {
        claude: narrowed(k.runners.claude, { tool_gate: false }, spawned, () => false),
        gemini: k.runners.gemini,
      },
    }));
    await kingdom.command('create_quest', questPayload('Silent knight'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Silent knight')).status === 'done',
    );
    const [work, ...reminders] = assigneesOf(spawned);
    expect(reminders).toHaveLength(LETTER_REMINDERS_MAX);
    expect(reminders.map(({ run_dir }) => path.relative(work!.run_dir, run_dir))).toEqual([
      'letter-1',
      'letter-2',
    ]);
    for (const reminder of reminders) {
      // The fake CLI resumes: the session goes on, told only to write its letter.
      expect(reminder.resume).toEqual({ session_id: expect.any(String) as unknown });
      expect(reminder.prompt.user).toMatch(/^# Your handover letter\n\nYour session on quest q_/);
      expect(reminder.prompt.system).toBe(work!.prompt.system);
    }
    const quest = await kingdom.quest('Silent knight');
    // One assignee session to the quest: the reminders belong to it.
    expect(quest.attempt_log.map(({ role, outcome }) => [role, outcome])).toEqual([
      ['assignee', 'submitted'],
      ['verifier', 'submitted'],
    ]);
    expect(await notificationsOf(kingdom, quest.id)).toEqual([
      {
        notification_type: 'handover_unchanged',
        message:
          "Finished with handover.md unchanged since the attempt started, after the Steward's reminders.",
      },
    ]);
    expect(kingdom.warnings.join('\n')).toContain('left handover.md unchanged');
    // The line that ends the run names the two reminders, so the log counts three sessions (P1-49, (c) of P1-33).
    const { events } = await openJournal(kingdom.root, quest.id).read();
    const submitted = events.find(({ type }) => type === 'quest.submitted');
    const reminded = { session_id: expect.any(String) as unknown, why: 'the handover letter is unchanged' };
    expect(submitted?.data).toMatchObject({ sequels: [reminded, reminded] });
    expect(events.find(({ type }) => type === 'quest.done')?.data).not.toHaveProperty('sequels');
  });

  it('stops reminding once the letter is written, and opens a fresh session when the tribe cannot resume', async () => {
    const spawned: SpawnRequest[] = [];
    const { kingdom, steward } = await open((k) => ({
      runners: {
        claude: narrowed(k.runners.claude, { tool_gate: false, resume: false }, spawned, isReminder),
        gemini: k.runners.gemini,
      },
    }));
    await kingdom.command('create_quest', questPayload('Late letter'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Late letter')).status === 'done',
    );
    const [, reminder, ...more] = assigneesOf(spawned);
    expect(more).toEqual([]);
    expect(reminder).not.toHaveProperty('resume');
    expect(reminder?.prompt.user).toContain('# Your handover letter');
    expect(await notificationsOf(kingdom, (await kingdom.quest('Late letter')).id)).toEqual([]);
  });

  it('leaves a tribe with a tool gate to its Stop hook: no reminder, no note', async () => {
    const spawned: SpawnRequest[] = [];
    const { kingdom, steward } = await open((k) => ({
      runners: { claude: narrowed(k.runners.claude, {}, spawned, () => false), gemini: k.runners.gemini },
    }));
    await kingdom.command('create_quest', questPayload('Gated knight'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Gated knight')).status === 'done',
    );
    expect(assigneesOf(spawned)).toHaveLength(1);
    expect(await notificationsOf(kingdom, (await kingdom.quest('Gated knight')).id)).toEqual([]);
  });
});

describe('a tribe without a context file: the territory law in the prompt (context: prompt)', () => {
  it("puts the plot's CLAUDE.md in the system part of its sessions, and not in another tribe's", async () => {
    const spawned: SpawnRequest[] = [];
    const { kingdom, steward } = await open((k) => {
      const plots = folderPlots(k.root);
      return {
        runners: {
          claude: narrowed(k.runners.claude, { context_file: false }, spawned),
          gemini: narrowed(k.runners.gemini, {}, spawned),
        },
        plots: {
          ...plots,
          prepare: async (...args: Parameters<typeof plots.prepare>) => {
            const prepared = await plots.prepare(...args);
            await writeFile(
              path.join(prepared.cwd, 'CLAUDE.md'),
              '# dc1 law\n\nRun pnpm check before you finish.\n',
            );
            return prepared;
          },
        },
      };
    });
    await kingdom.command('create_quest', questPayload('Lawful knight'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Lawful knight')).status === 'done',
    );
    const law = '## CLAUDE.md\n\n```markdown\n# dc1 law\n\nRun pnpm check before you finish.\n```';
    const byTribe = (tribe: string) => spawned.filter(({ character }) => character.tribe === tribe);
    expect(byTribe('claude').length).toBeGreaterThan(0);
    for (const req of byTribe('claude')) {
      expect(req.prompt.system).toContain('# Law and rules of dc1-se-team');
      expect(req.prompt.system).toContain(law);
    }
    for (const req of byTribe('gemini')) expect(req.prompt.system).not.toContain('# Law and rules');
  });
});
