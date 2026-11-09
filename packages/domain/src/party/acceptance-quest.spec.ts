import { describe, expect, it } from 'vitest';

import { Q1, Q2, Q3, quest } from '../dispatch/__fixtures__/snapshot.ts';
import {
  ACCEPTANCE_CLASS,
  ACCEPTANCE_KIND,
  ACCEPTANCE_TAG,
  acceptanceQuestOf,
  blindTrialDue,
} from './acceptance-quest.ts';
import { mergeQuestOf } from './merge-quest.ts';
import type { CampaignId, CheckId, TagId } from '../core/ids.ts';
import type { Rank } from '../schema/common.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TerritoryCheck } from '../schema/territory.ts';

const contract: Quest = {
  ...quest(Q1, { party: Q1, kind: 'plan', cls: 'mage', rank: 'C' }),
  title: 'Export my results',
  description: 'A member downloads their results as CSV.\nOne row per answer.',
};
const api: Quest = { ...quest(Q2, { party: Q1, dependsOn: [Q1], rank: 'C' }), secrets_required: ['db_url'] };
const web = quest(Q3, { party: Q1, dependsOn: [Q1, Q2], rank: 'D' });

const trial = (enabled: boolean, least: Rank = 'B') => ({ blind_trial: { enabled, min_rank: least } });

const CHECKS: TerritoryCheck[] = [
  {
    id: 'unit' as CheckId,
    run: 'pnpm test',
    when: ['**'],
    exclusive: false,
    defer_to_merge: false,
    timeout_minutes: 10,
  },
  {
    id: 'integration' as CheckId,
    run: ['pnpm db:reset', 'pnpm test:integration'],
    when: ['apps/api/**'],
    exclusive: true,
    defer_to_merge: true,
    timeout_minutes: 20,
  },
];
const TAGS = ['backend', 'e2e'] as TagId[];

describe('blindTrialDue', () => {
  it('holds on a territory that turned it on, once the contract or a part is of its rank or above', () => {
    expect(blindTrialDue(trial(false), { ...contract, rank: 'S' }, [api])).toBe(false);
    expect(blindTrialDue(trial(true), contract, [api, web])).toBe(false);
    expect(blindTrialDue(trial(true), { ...contract, rank: 'B' }, [api, web])).toBe(true);
    expect(blindTrialDue(trial(true), contract, [api, { ...web, rank: 'A' }])).toBe(true);
    expect(blindTrialDue(trial(true, 'C'), contract, [])).toBe(true);
  });
});

describe('acceptanceQuestOf', () => {
  it("opens a knight's build under the contract, waiting for the contract alone, with the parts' rank and secrets", () => {
    const made = acceptanceQuestOf(contract, [api, web], { territory: { checks: CHECKS }, tags: TAGS });
    expect(made.party).toEqual({ id: Q1, role: 'acceptance', contract: 'api/openapi.yaml' });
    expect(made.payload).toEqual({
      draft: false,
      title: 'Export my results',
      description: expect.stringContaining(`The blind trial of party ${Q1} («Export my results»)`) as string,
      kind: ACCEPTANCE_KIND,
      rank: 'C',
      territory: contract.territory,
      tier: 'session',
      class_required: ACCEPTANCE_CLASS,
      tags: [ACCEPTANCE_TAG],
      seal_required: false,
      secrets_required: ['db_url'],
      depends_on: [Q1],
      parent_id: Q1,
      created_by: 'council',
    });
  });

  it("tells the writer the owner's words, the contract, where the checks run, and never the parts' work", () => {
    const { description } = acceptanceQuestOf(contract, [api, web], {
      territory: { checks: CHECKS },
      tags: TAGS,
    }).payload;
    expect(description).toContain('> A member downloads their results as CSV.\n> One row per answer.');
    expect(description).toContain('the contract (`api/openapi.yaml`) on this branch');
    expect(description).toContain('2 other part(s)');
    expect(description).toContain(
      '`unit` (`pnpm test`), `integration` (`pnpm db:reset` then `pnpm test:integration`)',
    );
    expect(description).toContain('no other branch, no other worktree');
    expect(description).not.toContain(api.title);
    expect(description).not.toContain(api.description);
  });

  it("carries no tag the kingdom lacks, no secret when the parts ask none, and the contract's campaign", () => {
    const own: Quest = { ...contract, campaign_id: 'c_x' as CampaignId };
    const { payload } = acceptanceQuestOf(own, [web], { territory: { checks: [] }, tags: [] });
    expect(payload.tags).toEqual([]);
    expect(payload.secrets_required).toBeUndefined();
    expect(payload.campaign_id).toBe('c_x');
    expect(payload.rank).toBe('D');
    expect(payload.description).toContain('The territory names no check');
  });

  it('is merged by the merge quest, which tells its knight what the tests are and who may change them', () => {
    const tests: Quest = {
      ...quest('q_20261106_t5t5t5', { party: Q1, dependsOn: [Q1] }),
      party_role: 'acceptance',
    };
    const { description } = mergeQuestOf(contract, [api, tests]).payload;
    expect(description).toContain(`- quest/${tests.id}: the acceptance tests of the blind trial`);
    expect(description).toContain(`quest/${tests.id} holds acceptance tests another character wrote`);
    expect(mergeQuestOf(contract, [api]).payload.description).not.toContain('acceptance');
  });
});
