import { describe, expect, it } from 'vitest';

import examples from '../../../examples/character.json' with { type: 'json' };
import { CharacterSchema } from './character.ts';

const [thorn, sable] = examples;

const minimal = {
  version: 1,
  id: 'thorn',
  name: 'Thorn',
  class: 'knight',
  tribe: 'claude',
  model: 'claude-sonnet-5-5',
  level: 1,
  reputation: { window: [] },
  status: 'idle',
  status_since: '2026-11-06T09:00:00+07:00',
  vow_no_production: false,
  consecutive_fail: { count: 0 },
  stats: { quests_done: 0, tokens_today: 0, tokens_day: '2026-11-06' },
  created_at: '2026-11-06T08:00:00+07:00',
};

const entry = (n: number) => ({
  verdict_id: `q_20261105_4c8n2d-${n}`,
  result: 'pass',
  by_human: false,
  at: '2026-11-05T16:20:00+07:00',
});
const window = (size: number) => Array.from({ length: size }, (_, i) => entry(i + 1));
const current = (role: string) => ({ quest: 'q_20261106_7k3m2a', role });

const issuesOf = (value: unknown) => {
  const result = CharacterSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('CharacterSchema', () => {
  it('accepts the examples of the v1 contract unchanged', () => {
    expect(CharacterSchema.parse(thorn)).toEqual(thorn);
    // Sable leaves out skill_affinity and pinned_tag; parsing adds their defaults.
    expect(CharacterSchema.parse(sable)).toEqual({ ...sable, skill_affinity: {}, pinned_tag: null });
  });

  it('fills the contract defaults from a minimal file', () => {
    expect(CharacterSchema.parse(minimal)).toEqual({ ...minimal, skill_affinity: {}, pinned_tag: null });
  });

  it('gives every character its own affinity record', () => {
    const [first, second] = [CharacterSchema.parse(minimal), CharacterSchema.parse(minimal)];
    expect(first.skill_affinity).not.toBe(second.skill_affinity);
  });

  it.each([
    ['idle without a quest', { current: null }],
    ['working as the assignee', { status: 'working', current: current('assignee') }],
    ['reviewing as the verifier', { status: 'reviewing', current: current('verifier') }],
    [
      'asleep, keeping the quest it was working on',
      { status: 'sleeping_mana', status_before_sleep: 'working', current: current('assignee') },
    ],
    ['full windows of 20 verdicts', { reputation: { window: window(20) } }],
    ['a pinned tag', { pinned_tag: 'frontend', skill_affinity: { frontend: { window: window(20) } } }],
  ])('accepts a character %s', (_, change) => {
    expect(issuesOf({ ...minimal, ...change })).toEqual([]);
  });

  it.each([
    ['an unknown field', { title: 'Hiệp sĩ frontend' }, ': Unrecognized key'],
    ['a stored gear tier', { gear_tier: 1 }, ': Unrecognized key'],
    ['an id that is not a slug', { id: 'Thorn' }, 'id: '],
    ['a name wider than .elv-name', { name: 'x'.repeat(25) }, 'name: '],
    ['a class that is not snake_case', { class: 'Knight' }, 'class: '],
    ['a tribe that is not snake_case', { tribe: 'claude-code' }, 'tribe: '],
    ['a model slug with capitals', { model: 'Claude-Sonnet' }, 'model: '],
    ['level 0', { level: 0 }, 'level: '],
    ['level 11', { level: 11 }, 'level: '],
    ['a fractional level', { level: 1.5 }, 'level: '],
    ['a missing level', { level: undefined }, 'level: '],
    ['a reputation window of 21', { reputation: { window: window(21) } }, 'reputation.window: '],
    ['a reputation without window', { reputation: {} }, 'reputation.window: '],
    [
      'a partial verdict in the window',
      { reputation: { window: [{ ...entry(1), result: 'partial' }] } },
      'reputation.window.0.result: ',
    ],
    [
      'a verdict id without attempt',
      { reputation: { window: [{ ...entry(1), verdict_id: 'q_20261105_4c8n2d' }] } },
      'reputation.window.0.verdict_id: ',
    ],
    [
      'a verdict time without offset',
      { reputation: { window: [{ ...entry(1), at: '2026-11-05T16:20:00' }] } },
      'reputation.window.0.at: ',
    ],
    [
      'stored pass counts in a window entry',
      { reputation: { window: [{ ...entry(1), pass: 1 }] } },
      'reputation.window.0: Unrecognized key',
    ],
    [
      'an affinity tag that is not a tag id',
      { skill_affinity: { 'front-end': { window: [] } } },
      'skill_affinity.front-end: ',
    ],
    [
      'an affinity window of 21',
      { skill_affinity: { frontend: { window: window(21) } } },
      'skill_affinity.frontend.window: ',
    ],
    [
      'stored per-tag counts',
      { skill_affinity: { frontend: { window: [], pass: 3, fail: 0 } } },
      'skill_affinity.frontend: Unrecognized key',
    ],
    ['a pinned tag that is not a tag id', { pinned_tag: 'Front End' }, 'pinned_tag: '],
    ['an unknown status', { status: 'resting' }, 'status: '],
    ['a status time without offset', { status_since: '2026-11-06 09:00' }, 'status_since: '],
    [
      'a status before sleep it cannot come back to',
      { status: 'sleeping_mana', status_before_sleep: 'swamp' },
      'status_before_sleep: ',
    ],
    [
      'sleep without the status to restore',
      { status: 'sleeping_mana' },
      'status_before_sleep: status sleeping_mana needs status_before_sleep',
    ],
    ['working without a quest', { status: 'working' }, 'current: status working needs current'],
    [
      'working with current null',
      { status: 'working', current: null },
      'current: status working needs current',
    ],
    [
      'working as a verifier',
      { status: 'working', current: current('verifier') },
      'current.role: status working needs role assignee',
    ],
    ['reviewing without a quest', { status: 'reviewing' }, 'current: status reviewing needs current'],
    [
      'reviewing as the assignee',
      { status: 'reviewing', current: current('assignee') },
      'current.role: status reviewing needs role verifier',
    ],
    [
      'a current quest id that is not a quest id',
      { current: { quest: 'c_20261106_7k3m2a', role: 'assignee' } },
      'current.quest: ',
    ],
    ['a current role outside the two roles', { current: current('owner') }, 'current.role: '],
    ['a missing vow', { vow_no_production: undefined }, 'vow_no_production: '],
    ['an empty tool name', { tools: { allow: [''] } }, 'tools.allow.0: '],
    ['an unknown tool list', { tools: { ask: ['Bash'] } }, 'tools: Unrecognized key'],
    [
      'an unknown fail kind',
      { consecutive_fail: { fail_kind: 'typo', count: 1 } },
      'consecutive_fail.fail_kind: ',
    ],
    ['a negative fail count', { consecutive_fail: { count: -1 } }, 'consecutive_fail.count: '],
    ['a fail streak without count', { consecutive_fail: {} }, 'consecutive_fail.count: '],
    [
      'a token day that is a date-time',
      { stats: { ...minimal.stats, tokens_day: '2026-11-06T00:00:00+07:00' } },
      'stats.tokens_day: ',
    ],
    [
      'a token day that is not a calendar day',
      { stats: { ...minimal.stats, tokens_day: '2026-02-30' } },
      'stats.tokens_day: ',
    ],
    ['negative tokens', { stats: { ...minimal.stats, tokens_today: -5 } }, 'stats.tokens_today: '],
    ['a missing created_at', { created_at: undefined }, 'created_at: '],
    ['version 2', { version: 2 }, 'version: '],
  ])('rejects %s', (_, change, expected) => {
    const lines = issuesOf({ ...minimal, ...change });
    expect(lines.map((line) => line.slice(0, expected.length))).toContain(expected);
  });
});
