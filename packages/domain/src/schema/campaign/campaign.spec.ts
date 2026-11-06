import { describe, expect, it } from 'vitest';

import examples from '../../../examples/campaign.json' with { type: 'json' };
import { CampaignSchema } from './campaign.ts';

const [example] = examples;

const minimal = {
  version: 1,
  id: 'c_20261110_5m8q2r',
  name: 'Phát hành v1.4',
  mode: 'offense',
  fronts: [],
  victory_conditions: [],
  status: 'declared',
  declared_at: '2026-11-10T09:00:00+07:00',
};

const front = (id: string) => ({ id, name: 'Mặt trận web', goal: 'L5 nổi bật', quest_ids: [] });
const condition = (id: string, check: object = { type: 'all_quests_done' }) => ({
  id,
  text: 'Mọi quest xong',
  check,
  met: false,
});

const issuesOf = (value: unknown) => {
  const result = CampaignSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('CampaignSchema', () => {
  it('accepts the example of the v1 contract unchanged', () => {
    expect(CampaignSchema.parse(example)).toEqual(example);
  });

  it('accepts a minimal declared campaign as it is', () => {
    expect(CampaignSchema.parse(minimal)).toEqual(minimal);
  });

  it.each([
    ['a closed campaign with its closing time', { status: 'closed', closed_at: '2026-11-22T10:00:00+07:00' }],
    [
      'a command condition',
      { victory_conditions: [condition('ci-green', { type: 'command', run: 'pnpm check' })] },
    ],
    [
      'a met condition with its check time',
      { victory_conditions: [{ ...condition('a'), met: true, checked_at: '2026-11-20T10:00:00+07:00' }] },
    ],
    ['a retro path', { status: 'retro_pending', retro_path: 'campaigns/c_20261110_5m8q2r/retro.md' }],
  ])('accepts %s', (_, change) => {
    expect(issuesOf({ ...minimal, ...change })).toEqual([]);
  });

  it.each([
    ['an unknown field', { morale: 0.8 }, ': Unrecognized key'],
    ['a quest id as campaign id', { id: 'q_20261110_5m8q2r' }, 'id: '],
    ['an empty name', { name: '' }, 'name: '],
    ['a name longer than 60', { name: 'x'.repeat(61) }, 'name: '],
    ['an unknown mode', { mode: 'siege' }, 'mode: '],
    ['an unknown status', { status: 'paused' }, 'status: '],
    ['a declared time without offset', { declared_at: '2026-11-10T09:00:00' }, 'declared_at: '],
    ['a deadline that is a date', { deadline: '2026-11-21' }, 'deadline: '],
    ['an empty retro path', { retro_path: '' }, 'retro_path: '],
    ['closed without closing time', { status: 'closed' }, 'closed_at: a closed campaign needs closed_at'],
    ['a front id that is not a slug', { fronts: [front('Web')] }, 'fronts.0.id: '],
    ['a front without goal', { fronts: [{ ...front('web'), goal: '' }] }, 'fronts.0.goal: '],
    [
      'a front quest that is not a quest id',
      { fronts: [{ ...front('web'), quest_ids: ['web-1'] }] },
      'fronts.0.quest_ids.0: ',
    ],
    [
      'a quest twice in one front',
      { fronts: [{ ...front('web'), quest_ids: ['q_20261110_2a4b6c', 'q_20261110_2a4b6c'] }] },
      'fronts.0.quest_ids: items must be unique',
    ],
    ['two fronts with one id', { fronts: [front('web'), front('web')] }, 'fronts.1.id: duplicate id "web"'],
    [
      'two conditions with one id',
      { victory_conditions: [condition('ci'), condition('ci')] },
      'victory_conditions.1.id: duplicate id "ci"',
    ],
    [
      'a condition without text',
      { victory_conditions: [{ ...condition('a'), text: '' }] },
      'victory_conditions.0.text: ',
    ],
    [
      'a condition without met',
      { victory_conditions: [{ ...condition('a'), met: undefined }] },
      'victory_conditions.0.met: ',
    ],
    [
      'an unknown check type',
      { victory_conditions: [condition('a', { type: 'vote' })] },
      'victory_conditions.0.check.type: ',
    ],
    [
      'a command check without command',
      { victory_conditions: [condition('a', { type: 'command' })] },
      'victory_conditions.0.check.run: a command check needs run',
    ],
    [
      'a check with an empty command',
      { victory_conditions: [condition('a', { type: 'command', run: '' })] },
      'victory_conditions.0.check.run: ',
    ],
    [
      'a check time without offset',
      { victory_conditions: [{ ...condition('a'), checked_at: 'yesterday' }] },
      'victory_conditions.0.checked_at: ',
    ],
  ])('rejects %s', (_, change, expected) => {
    const lines = issuesOf({ ...minimal, ...change });
    expect(lines.map((line) => line.slice(0, expected.length))).toContain(expected);
  });
});
