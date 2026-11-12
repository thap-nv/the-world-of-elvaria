import { describe, expect, it } from 'vitest';

import { Q1, Q2, Q3, quest } from '../dispatch/__fixtures__/snapshot.ts';
import {
  ACCEPTANCE_CLASS,
  ACCEPTANCE_KIND,
  ACCEPTANCE_TAG,
  LEAD_MARK,
  acceptanceQuestOf,
  blindTrialDue,
  partWaitsFor,
  workOf,
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
    // Ranks alone: the Steward asks it of the lead's drafts before any part exists (P1-37 (iii)).
    expect(blindTrialDue(trial(true), { rank: 'C' }, [{ rank: 'B' }])).toBe(true);
  });
});

describe('partWaitsFor (P1-37 (iii))', () => {
  it('makes every part wait for the contract, and in a blind trial for the acceptance part too', () => {
    expect(partWaitsFor(Q1, undefined)).toEqual([Q1]);
    expect(partWaitsFor(Q1, Q3)).toEqual([Q1, Q3]);
  });
});

describe('workOf (P1-37 (n))', () => {
  it('keeps what comes before the first line ---, trimmed', () => {
    expect(workOf(`Export CSV.\r\nOne row per answer.\r\n${LEAD_MARK}\r\nSplit in two.\n---\nMore.`)).toBe(
      'Export CSV.\r\nOne row per answer.',
    );
  });

  it('gives null without a mark, or with nothing before it', () => {
    expect(workOf('Export CSV.\n----\nSplit in two.')).toBeNull();
    expect(workOf(`  \n${LEAD_MARK}\nSplit in two.`)).toBeNull();
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
    // The contract's scope (PS-05): the tests sit beside the contract, before any part's work.
    const scoped = { ...contract, scope_paths: ['api/openapi.yaml', 'e2e/**'] };
    const tests = acceptanceQuestOf(scoped, [api, web], { territory: { checks: CHECKS }, tags: TAGS });
    expect(tests.payload.scope_paths).toEqual(['api/openapi.yaml', 'e2e/**']);
  });

  it("tells the writer the owner's words, the contract, where the checks run, and never the parts' work", () => {
    const { description } = acceptanceQuestOf(contract, [api, web], {
      territory: { checks: CHECKS },
      tags: TAGS,
    }).payload;
    expect(description).toContain('> A member downloads their results as CSV.\n> One row per answer.');
    expect(description).toContain('the contract (`api/openapi.yaml`) on this branch');
    expect(description).toContain('2 part(s) of the party build the work once your tests are judged');
    expect(description).toContain(
      '`unit` (`pnpm test`), `integration` (`pnpm db:reset` then `pnpm test:integration`)',
    );
    expect(description).toContain('never read another branch or another worktree');
    expect(description).not.toContain(api.title);
    expect(description).not.toContain(api.description);
  });

  it("asks for test files named apart from any part's, so the merge meets no add/add conflict (P1-37 (l))", () => {
    const { description } = acceptanceQuestOf(contract, [api], {
      territory: { checks: [] },
      tags: [],
    }).payload;
    expect(description).toContain('Give every test file you add `.acceptance` right before its test suffix');
    expect(description).toContain('`rooms.acceptance.spec.ts`');
  });

  it("quotes the work alone when a line --- ends it, and warns off the lead's part when none does (P1-37 (n))", () => {
    const lead = 'Write the contract in api/openapi.yaml, then split it into two parts of rank C.';
    const marked = { ...contract, description: `${contract.description}\n\n ---\n${lead}` };
    const tests = acceptanceQuestOf(marked, [api], { territory: { checks: [] }, tags: [] }).payload;
    expect(tests.description).toContain(
      '> A member downloads their results as CSV.\n> One row per answer.\n\n',
    );
    expect(tests.description).not.toContain(lead);
    expect(tests.description).not.toContain("What it tells the party's lead");
    const unmarked = { ...contract, description: `${contract.description}\n\n${lead}` };
    const whole = acceptanceQuestOf(unmarked, [api], { territory: { checks: [] }, tags: [] }).payload;
    expect(whole.description).toContain(`> ${lead}`);
    expect(whole.description).toContain(
      "What it tells the party's lead (writing the contract, splitting the work into parts) is no work to test",
    );
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
