import { describe, expect, it } from 'vitest';

import examples from '../../examples/kingdom.json' with { type: 'json' };
import { KingdomSchema } from './kingdom.ts';

// examples/ is the one source of the contract's `examples` (ADR 0003): the zod source must accept them.
const [example] = examples;

const minimal = {
  version: 1,
  name: 'Bình Minh',
  created_at: '2026-11-06T09:00:00+07:00',
  tz: 'Asia/Ho_Chi_Minh',
  owner: { profession: 'developer' },
  paths: { treasury: 'C:/Users/me/.elvaria/treasury.json' },
  tribes: [{ id: 'claude', adapter: 'claude_code', enabled: true, max_concurrent: 2 }],
  mana: {},
  breakers: {},
  schedule: {},
  dispatch: {},
  bell: {},
  tunnel: {},
  theme: 'fantasy',
  ui: {},
};

const issuesOf = (value: unknown) => {
  const result = KingdomSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('KingdomSchema', () => {
  it('accepts the contract example unchanged', () => {
    expect(KingdomSchema.parse(example)).toEqual(example);
  });

  it('fills every default of the contract from a minimal file', () => {
    const kingdom = KingdomSchema.parse(minimal);
    expect(kingdom.owner.locale).toBe('vi');
    expect(kingdom.mana).toEqual({
      cap_pct: 98,
      king_reserve_pct: 2,
      warn_margin_pct: 10,
      probe_interval_minutes: 15,
      reassign_after_hours: null,
    });
    expect(kingdom.breakers).toEqual(example?.breakers);
    expect(kingdom.schedule).toEqual(example?.schedule);
    expect(kingdom.dispatch).toEqual(example?.dispatch);
    // PS-03b: a kingdom.json written before delegation gets its defaults.
    expect(kingdom.delegation).toEqual(example?.delegation);
    expect(kingdom.bell).toEqual({ desktop: true, web_push: false, messaging: null });
    expect(kingdom.tunnel).toEqual({ enabled: false });
    expect(kingdom.ui).toEqual({ mode: 'night', eco: false });
  });

  it('resumes an answered session for 55 minutes unless the owner turns it off (P1-05)', () => {
    expect(KingdomSchema.parse(minimal).dispatch.resume_after_answer_minutes).toBe(55);
    const off = KingdomSchema.parse({ ...minimal, dispatch: { resume_after_answer_minutes: null } });
    expect(off.dispatch.resume_after_answer_minutes).toBeNull();
    expect(issuesOf({ ...minimal, dispatch: { resume_after_answer_minutes: 0 } }).join('\n')).toContain(
      'dispatch.resume_after_answer_minutes',
    );
  });

  const tribe = (id: string) => ({ id, adapter: 'claude_code', enabled: true, max_concurrent: 1 });

  it.each([
    ['an unknown field', { ...minimal, colour: 'gold' }, 'Unrecognized key'],
    ['a name wider than .elv-name', { ...minimal, name: 'x'.repeat(25) }, 'name'],
    ['a zone Intl does not know', { ...minimal, tz: 'Mars/Olympus' }, 'tz: unknown IANA time zone'],
    ['a backslash path', { ...minimal, paths: { treasury: 'C:\\Users\\me\\t.json' } }, 'paths.treasury'],
    ['no tribe at all', { ...minimal, tribes: [] }, 'tribes'],
    ['the same tribe twice', { ...minimal, tribes: [tribe('a'), tribe('a')] }, 'tribes.1.id: duplicate id'],
    ['a missing theme', { ...minimal, theme: undefined }, 'theme'],
    [
      'a reserve above half the quota',
      { ...minimal, mana: { king_reserve_pct: 51 } },
      'mana.king_reserve_pct',
    ],
    [
      'a chronicle time of 24:00',
      { ...minimal, schedule: { chronicle: { at: '24:00' } } },
      'schedule.chronicle.at',
    ],
    [
      'a patrol interval in weeks',
      { ...minimal, schedule: { patrol: { every: 'P1W' } } },
      'schedule.patrol.every',
    ],
  ])('rejects %s', (_, value, expected) => {
    expect(issuesOf(value).join('\n')).toContain(expected);
  });
});
