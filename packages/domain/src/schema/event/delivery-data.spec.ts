// The delivery.* lines (PS-08, ADR 0023): what each must carry, so PS-08c and PS-08d write them the same way.
import { describe, expect, it } from 'vitest';

import { DELIVERY_DETAIL_MAX_LENGTH } from '../constants.ts';
import { DELIVERY_FAILURES, DELIVERY_STAGES } from './delivery-data.ts';
import { isKnownEventType } from './event-types.ts';
import { EVENT_VERSION, EventSchema } from './event.ts';

const HEAD = '4bc14e9d0c2a7f1e3b5d6a8c9e0f1a2b3c4d5e6f';
const MERGE = 'b0b2605a1c3e5f7a9b1d3f5a7c9e1b3d5f7a9c1e';
const QUEST = 'q_20261115_7k3m2a';
const PR = { number: 174, url: 'https://github.com/owner/repo/pull/174' };
const WHERE = { quest: QUEST, territory: 'elvaria' };

const line = (type: string, data: Record<string, unknown>) => ({
  v: EVENT_VERSION,
  id: '01JCF8X4Z6Q3W9N2M5R7T8V0YB',
  ts: '2026-11-15T15:00:00+07:00',
  type,
  actor: { kind: 'steward' },
  quest: QUEST,
  territory: 'elvaria',
  data,
});

const issuesOf = (value: unknown): string =>
  (EventSchema.safeParse(value).error?.issues ?? [])
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

const PUSHED = { ...WHERE, branch: `quest/${QUEST}`, head: HEAD, forge: 'github', pr: PR };
const MERGED = {
  ...WHERE,
  branch: `quest/${QUEST}`,
  head: HEAD,
  pr: PR,
  merge_sha: MERGE,
  method: 'merge',
  sealed: true,
  branch_deleted: true,
};

describe('delivery.* data', () => {
  it('names the three new types in the catalogue', () => {
    expect(['delivery.pushed', 'delivery.merged', 'delivery.failed'].every(isKnownEventType)).toBe(true);
  });

  it('names where a delivery stops and why, in the order of the flow', () => {
    expect(DELIVERY_STAGES).toEqual([
      'update',
      'scan',
      'push',
      'open',
      'checks',
      'merge',
      'cleanup',
      'train',
    ]);
    expect(DELIVERY_FAILURES).toContain('generate_failed');
    expect(DELIVERY_FAILURES).toContain('no_credential');
  });

  it.each([
    ['delivery.pushed', { ...PUSHED, push_ms: 0 }],
    ['delivery.pushed', { ...PUSHED, push_ms: 123 }],
    ['delivery.pushed', PUSHED],
    ['delivery.pushed', { ...PUSHED, warnings: ['docs/spec.md'] }],
    ['delivery.merged', MERGED],
    ['delivery.merged', { ...MERGED, method: 'squash', sealed: false, branch_deleted: false }],
    ['delivery.failed', { ...WHERE, stage: 'push', reason: 'no_credential' }],
    ['delivery.failed', { ...WHERE, stage: 'scan', reason: 'secret', paths: ['.env.local'] }],
    [
      'delivery.failed',
      {
        ...WHERE,
        stage: 'checks',
        reason: 'checks_red',
        branch: `quest/${QUEST}`,
        head: HEAD,
        pr: PR,
        checks: [{ name: 'ci', conclusion: 'failure', url: 'https://github.com/owner/repo/actions/runs/1' }],
        detail: 'ci failed',
      },
    ],
    [
      'delivery.failed',
      { ...WHERE, stage: 'merge', reason: 'forge_error', detail: 'x'.repeat(DELIVERY_DETAIL_MAX_LENGTH) },
    ],
  ])('accepts %s %j', (type, data) => {
    expect(issuesOf(line(type, data))).toBe('');
  });

  it.each([
    ['delivery.pushed', { ...PUSHED, quest: undefined }, 'data.quest'],
    ['delivery.pushed', { ...PUSHED, territory: undefined }, 'data.territory'],
    ['delivery.pushed', { ...PUSHED, head: 'main' }, 'data.head'],
    ['delivery.pushed', { ...PUSHED, forge: 'gitlab' }, 'data.forge'],
    ['delivery.pushed', { ...PUSHED, pr: { number: 0, url: PR.url } }, 'data.pr.number'],
    ['delivery.pushed', { ...PUSHED, warnings: [] }, 'data.warnings'],
    ['delivery.pushed', { ...PUSHED, push_ms: -1 }, 'data.push_ms'],
    ['delivery.merged', { ...MERGED, method: 'rebase' }, 'data.method'],
    ['delivery.merged', { ...MERGED, sealed: undefined }, 'data.sealed'],
    ['delivery.merged', { ...MERGED, merge_sha: undefined }, 'data.merge_sha'],
    ['delivery.failed', { ...WHERE, stage: 'deploy', reason: 'secret' }, 'data.stage'],
    ['delivery.failed', { ...WHERE, stage: 'push', reason: 'offline' }, 'data.reason'],
    [
      'delivery.failed',
      { ...WHERE, stage: 'checks', reason: 'checks_red', checks: [{ name: 'ci' }] },
      'data.checks.0.conclusion',
    ],
    [
      'delivery.failed',
      { ...WHERE, stage: 'push', reason: 'forge_error', detail: 'x'.repeat(DELIVERY_DETAIL_MAX_LENGTH + 1) },
      'data.detail',
    ],
    [
      'delivery.failed',
      { ...WHERE, stage: 'push', reason: 'forge_error', token: 'gho_x' },
      'Unrecognized key',
    ],
  ])('rejects %s with data %j', (type, data, expected) => {
    expect(issuesOf(line(type, data))).toContain(expected);
  });

  it('keeps delivery.sent without a shape, as since v1', () => {
    expect(issuesOf(line('delivery.sent', { anything: 1 }))).toBe('');
  });
});
