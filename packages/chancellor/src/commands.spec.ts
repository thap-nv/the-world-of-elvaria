import { InboxCommandSchema, QuestDraftFileSchema, QuestIdSchema } from '@elvaria/domain';
import type { QuestId } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { reply } from './__fixtures__/kingdom.ts';
import { draftCommands } from './commands.ts';
import type { CommandHeader, CommandSource } from './commands.ts';

const ULIDS = ['01JCFB7Q2R8S4T6V9W3X5Y1Z0A', '01JCFB7Q2R8S4T6V9W3X5Y1Z0B', '01JCFB7Q2R8S4T6V9W3X5Y1Z0C'];
const QUESTS = ['q_20261107_aaaaaa', 'q_20261107_bbbbbb', 'q_20261107_cccccc'];

/** Headers with growing ids; the quest of a header is the one at the same place. */
function source(): CommandSource {
  let next = 0;
  return {
    header: (): CommandHeader => {
      const id = ULIDS[next] ?? 'missing';
      next += 1;
      return { version: 1, id, ts: '2026-11-07T09:00:00+07:00', source: 'cli' };
    },
    questIdOf: (header) => QuestIdSchema.parse(QUESTS[ULIDS.indexOf(header.id)]),
  };
}

const commandsOf = (name: string) => draftCommands(QuestDraftFileSchema.parse(reply(name)).drafts, source());
const quest = (index: number): QuestId => QuestIdSchema.parse(QUESTS[index]);

describe('draftCommands (§3.11, ADR 0005)', () => {
  it('turns refs into the ids the Steward will give, in order, and every command is a valid inbox file', () => {
    const commands = commandsOf('split');
    expect(commands.map(({ ref, quest: id }) => [ref, id])).toEqual([
      ['d1', quest(0)],
      ['d2', quest(1)],
      ['d3', quest(2)],
    ]);
    for (const { command } of commands) expect(InboxCommandSchema.safeParse(command).success).toBe(true);
    const [plan, first, second] = commands.map(({ command }) => command.payload);
    expect(plan).toMatchObject({
      draft: true,
      created_by: 'chancellor',
      kind: 'plan',
      class_required: 'mage',
    });
    expect(plan?.question).toBe(
      'Giữ nguyên thứ tự mục hiện có của docs/architecture.md hay sắp lại theo ADR?',
    );
    expect(plan).not.toHaveProperty('depends_on');
    expect(plan).not.toHaveProperty('parent_id');
    expect(first).toMatchObject({ depends_on: [quest(0)], parent_id: quest(0) });
    expect(second).toMatchObject({ depends_on: [quest(1)], parent_id: quest(0) });
    for (const payload of [plan, first, second]) {
      expect(payload).not.toHaveProperty('ref');
      expect(payload).not.toHaveProperty('depends_on_refs');
      expect(payload).not.toHaveProperty('parent_ref');
    }
  });

  it('keeps a script tier and a party contract', () => {
    const [script] = commandsOf('link-check');
    expect(script?.command.payload).toMatchObject({
      tier: 'script',
      script: { id: 'link-check', params: { globs: ['README.md', 'docs/**/*.md', 'CLAUDE.md'] } },
      tags: ['docs'],
    });
    expect(script?.command.payload).not.toHaveProperty('class_required');
    const [party] = commandsOf('party');
    expect(party?.command.payload).toMatchObject({
      kind: 'plan',
      class_required: 'mage',
      party_role: 'contract',
      tags: ['backend', 'frontend'],
    });
    expect(commandsOf('vague')[0]?.command.payload).not.toHaveProperty('party_role');
  });

  it("keeps a draft's scope, and declares none for a draft without one (PS-05)", () => {
    const [draft] = QuestDraftFileSchema.parse(reply('split')).drafts;
    if (draft === undefined) throw new Error('fixture: no draft');
    const [scoped] = draftCommands([{ ...draft, scope_paths: ['docs/architecture.md'] }], source());
    expect(scoped?.command.payload.scope_paths).toEqual(['docs/architecture.md']);
    expect(InboxCommandSchema.safeParse(scoped?.command).success).toBe(true);
    expect(commandsOf('split')[0]?.command.payload).not.toHaveProperty('scope_paths');
  });
});
