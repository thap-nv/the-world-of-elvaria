// The read-only quest of an inquiry device (P2-01d, 383a, W7): made only by the Steward, of a report kind, with no
// secret and no seal; no edit removes the mark, and its branch never goes to the forge nor is looked for in the base.
import { describe, expect, it } from 'vitest';

import { InboxCommandSchema } from '../schema/command/inbox-command.ts';
import { QuestSchema } from '../schema/quest/quest.ts';
import { readOnlyFor } from '../device/may.ts';
import { questViewOf } from '../world/quest-view.ts';
import { protectedMarkOf } from '../verify/protected.ts';
import { KINGDOM, Q1, Q2, TERRITORY, at, moved, quest } from './__fixtures__/snapshot.ts';
import { forgeDue } from './forge-due.ts';
import { baseLooks } from './in-base.ts';
import { editQuest, questFromCommand } from './new-quest.ts';
import type { Instant } from '../core/clock.ts';
import type { KindId } from '../core/ids.ts';
import type { Device } from '../schema/device/device.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TerritoryDelivery } from '../schema/territory-delivery.ts';
import type { NewQuestContext } from './new-quest.ts';

const REGISTRY = {
  kinds: [
    { id: 'build', classes_allowed: ['knight'], deliverable_type: 'branch', seal_default: true },
    { id: 'research', classes_allowed: ['scout'], deliverable_type: 'report', seal_default: true },
    { id: 'batch', classes_allowed: ['knight'], deliverable_type: 'report', seal_default: false },
  ],
  tags: [],
  scripts: [{ id: 'link-check', kinds: ['batch'], params_schema: { type: 'object' } }],
} as unknown as NewQuestContext['registry'];

const PR_MERGE: TerritoryDelivery = {
  mode: 'pr_merge',
  forge: 'github',
  merge_method: 'merge',
  required_checks: [],
  checks_timeout_minutes: 60,
};

const CONTEXT: NewQuestContext = {
  id: Q1,
  at: at(5),
  breakers: KINGDOM.breakers,
  registry: REGISTRY,
  territories: [{ id: TERRITORY, secrets_allowed: ['npm_token'], delivery: PR_MERGE }],
  quests: [Q2],
  // The delegation would spare a research quest the seal: a read-only one has nothing to be spared.
  seal: { seal: { max_rank: 'S', kinds: ['research' as KindId], max_diff_lines: 400 } },
  read_only: true,
};
const { read_only: _, ...ORDINARY } = CONTEXT;

function asked(fields: Record<string, unknown> = {}, context: NewQuestContext = CONTEXT) {
  const command = InboxCommandSchema.parse({
    version: 1,
    id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A',
    ts: at(5),
    kind: 'create_quest',
    source: 'herald',
    device: 'dev_20261128_abcdef',
    payload: {
      draft: false,
      title: 'Where is the sign-in flow?',
      description: 'Which files make the sign-in flow, and how do they call each other?',
      kind: 'research',
      rank: 'C',
      territory: TERRITORY,
      class_required: 'scout',
      created_by: 'user',
      ...fields,
    },
  });
  if (command.kind !== 'create_quest') throw new Error('fixture');
  return questFromCommand(command.payload, context);
}

const invalid = (made: ReturnType<typeof asked>): readonly string[] =>
  made.ok ? [] : (made.error.issues ?? [`code ${made.error.code}`]);

/** A done read-only research quest, delivered on its own branch. */
const READ_ONLY: Quest = QuestSchema.parse({
  ...quest(Q1, { kind: 'research', cls: 'scout', rank: 'S' }),
  deliverable: { type: 'report' },
  read_only: true,
});
const delivered = (base: Quest): Quest => ({
  ...base,
  status: 'done',
  plot: { type: 'worktree', path: 'E:/plots/q1', branch: `quest/${base.id}` },
  deliverable: { ...base.deliverable, delivered_at: at(30) },
});

describe('questFromCommand for an inquiry device', () => {
  it('marks the quest read-only, without the seal its kind or the delegation would give', () => {
    const made = asked();
    expect(made).toMatchObject({ ok: true, value: { read_only: true, seal_required: false } });
    expect(made.ok && made.value.seal_delegated).toBe(undefined);
    expect(asked({}, ORDINARY)).toMatchObject({
      ok: true,
      value: { seal_required: false, seal_delegated: true },
    });
    expect(asked({}, { ...ORDINARY, seal: {} })).toMatchObject({
      ok: true,
      value: { seal_required: true },
    });
  });

  it('refuses what a read-only quest cannot be: another deliverable, a script, a secret, the seal', () => {
    expect(invalid(asked({ kind: 'build', class_required: 'knight' }))).toEqual([
      'deliverable.type: a read-only quest delivers a report',
    ]);
    const script = { kind: 'batch', tier: 'script', script: { id: 'link-check' }, class_required: undefined };
    expect(invalid(asked(script))).toEqual(['tier: a read-only quest runs as a session']);
    expect(invalid(asked({ secrets_required: ['npm_token'] }))).toEqual([
      'secrets_required: a read-only quest asks for no secret',
    ]);
    expect(invalid(asked({ seal_required: true }))).toEqual([
      'seal_required: a read-only quest never waits for the seal',
    ]);
  });

  it('is never asked for by the payload, and a full device makes an ordinary quest', () => {
    expect(() => asked({ read_only: true }, ORDINARY)).toThrow();
    const device = (role: Device['role']): Pick<Device, 'role'> => ({ role });
    expect([
      readOnlyFor(device('inquiry')),
      readOnlyFor(device('scoped')),
      readOnlyFor(device('full')),
    ]).toEqual([true, false, false]);
    expect(readOnlyFor(undefined)).toBe(false);
  });

  it('keeps no seal field the schema refuses on a read-only quest', () => {
    for (const field of [
      { seal: { by: 'user', at: at(9) } },
      { seal_delegated: true },
      { seal_raised: ['rank'] },
    ]) {
      const parsed = QuestSchema.safeParse({ ...READ_ONLY, status: 'done', ...field });
      expect(parsed.success).toBe(false);
    }
  });
});

describe('a read-only quest afterwards', () => {
  const edit = (changes: Record<string, unknown>) => {
    const command = InboxCommandSchema.parse({
      version: 1,
      id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0B',
      ts: at(40),
      kind: 'edit_quest',
      source: 'cli',
      payload: { quest: Q1, expected_updated_at: READ_ONLY.updated_at, changes },
    });
    if (command.kind !== 'edit_quest') throw new Error('fixture');
    return editQuest(READ_ONLY, command.payload, { at: at(40), quests: [Q1, Q2] });
  };

  it('keeps its mark through an edit, which cannot name it, and refuses the seal', () => {
    expect(edit({ title: 'Sharper question' })).toMatchObject({ ok: true, value: { read_only: true } });
    expect(edit({ seal_required: true })).toMatchObject({ ok: false, error: { code: 'invalid_quest' } });
    expect(() => edit({ read_only: false })).toThrow();
  });

  it('takes no seal from a claim above the level, nor from a protected path', () => {
    const claimed = moved(READ_ONLY, 10, ['claim', 'steward', { assignee: 'ember', level: 1 }]);
    expect(claimed).toMatchObject({ assignee: 'ember', seal_required: false });
    expect(protectedMarkOf(READ_ONLY, ['AGENTS.md'])).toEqual({ protected_changes: ['AGENTS.md'] });
  });

  it('never goes to the forge, nor is looked for in the base branch', () => {
    const territory = { delivery: PR_MERGE };
    const ordinary = delivered(QuestSchema.parse({ ...READ_ONLY, read_only: undefined }));
    expect(forgeDue(delivered(READ_ONLY), territory)).toBe(false);
    expect(forgeDue(ordinary, territory)).toBe(true);
    expect(baseLooks({}, [delivered(READ_ONLY)], 0 as Instant)).toEqual([]);
    expect(baseLooks({}, [ordinary], 0 as Instant)).toEqual([{ territory: TERRITORY, quests: [Q1] }]);
  });

  it('shows its mark to the world, and an ordinary quest none', () => {
    expect(questViewOf(READ_ONLY).read_only).toBe(true);
    expect('read_only' in questViewOf(quest(Q2))).toBe(false);
  });
});
