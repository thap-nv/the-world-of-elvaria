import { describe, expect, it } from 'vitest';

import contract from '../../../../docs/schemas/kingdom.schema.json' with { type: 'json' };
import { KingdomSchema, TribeSchema } from './kingdom.ts';

// The reviewed v1 contract carries a full example; the zod source must accept it (ADR 0003).
const [example] = contract.examples;

const minimal = {
  version: 1,
  name: 'Bình Minh',
  created_at: '2026-11-06T09:00:00+07:00',
  tz: 'Asia/Ho_Chi_Minh',
  owner: { profession: 'developer' },
  paths: { treasury: 'C:/Users/me/.elvaria/treasury.json' },
  tribes: [{ id: 'claude', adapter: 'claude_code' }],
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
  it('accepts the example of the v1 contract unchanged', () => {
    expect(KingdomSchema.parse(example)).toEqual(example);
  });

  it('fills every default of the contract from a minimal file', () => {
    const kingdom = KingdomSchema.parse(minimal);
    expect(kingdom.owner.locale).toBe('vi');
    expect(kingdom.tribes[0]).toEqual({
      id: 'claude',
      adapter: 'claude_code',
      enabled: true,
      max_concurrent: 1,
    });
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
    expect(kingdom.bell).toEqual({ desktop: true, web_push: false, messaging: null });
    expect(kingdom.tunnel).toEqual({ enabled: false });
    expect(kingdom.ui).toEqual({ mode: 'night', eco: false });
  });

  it.each([
    ['an unknown field', { ...minimal, colour: 'gold' }, 'Unrecognized key'],
    ['a name wider than .elv-name', { ...minimal, name: 'x'.repeat(25) }, 'name'],
    ['a zone Intl does not know', { ...minimal, tz: 'Mars/Olympus' }, 'tz: unknown IANA time zone'],
    ['a backslash path', { ...minimal, paths: { treasury: 'C:\\Users\\me\\t.json' } }, 'paths.treasury'],
    ['no tribe at all', { ...minimal, tribes: [] }, 'tribes'],
    [
      'the same tribe twice',
      {
        ...minimal,
        tribes: [
          { id: 'a', adapter: 'x' },
          { id: 'a', adapter: 'y' },
        ],
      },
      'duplicate id',
    ],
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

describe('TribeSchema', () => {
  const tool = { path: '/usr/local/bin/gemini', version: '0.67.0' };
  const messages = (value: unknown) => {
    const result = TribeSchema.safeParse(value);
    return result.success ? 'ok' : result.error.issues.map((issue) => issue.path.join('.')).join(',');
  };

  it('runs Gemini CLI only with a paid API key (ADR 0018)', () => {
    expect(messages({ id: 'gemini', adapter: 'gemini_cli', tool })).toBe('tool.auth');
    expect(messages({ id: 'gemini', adapter: 'gemini_cli' })).toBe('ok');
    const paid = { ...tool, auth: 'api_key' };
    expect(messages({ id: 'gemini', adapter: 'gemini_cli', tool: paid, budget: { usd_week: 5 } })).toBe('ok');
  });

  it('asks a paid key for a weekly spend ceiling', () => {
    const paid = { ...tool, auth: 'api_key' };
    expect(messages({ id: 'claude', adapter: 'claude_code', tool: paid })).toBe('budget.usd_week');
    expect(messages({ id: 'claude', adapter: 'claude_code', tool: paid, budget: {} })).toBe(
      'budget.usd_week',
    );
    expect(messages({ id: 'claude', adapter: 'claude_code', tool, budget: {} })).toBe('ok');
  });

  it('accepts an adapter file from the kingdom and rejects one elsewhere', () => {
    expect(messages({ id: 'local', adapter: 'adapters/my-cli.mjs' })).toBe('ok');
    expect(messages({ id: 'local', adapter: '../outside.mjs' })).toBe('adapter');
  });
});
