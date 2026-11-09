import { describe, expect, it } from 'vitest';

import { BRANN, ELLA, THORN, at, questIn } from './__fixtures__/quests.ts';
import { partyIssues } from './party.ts';
import type { CharacterId, QuestId, TerritoryId } from '../core/ids.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { PartyRole } from '../schema/quest/shared.ts';

const CONTRACT = 'q_20261107_5m2k8p' as QuestId;
const WEB = 'q_20261107_2w6t9c' as QuestId;
const API = 'q_20261107_3h7w2x' as QuestId;
const MERGE = 'q_20261107_4j8k1m' as QuestId;
const LONE = 'q_20261107_6n4p2r' as QuestId;

const worked = (character: CharacterId, role: Attempt['role']): Attempt => ({
  n: 1,
  character,
  role,
  started_at: at(1),
  run_dir: '.runs/x-1',
});

const member = (id: QuestId, role: PartyRole, extra: Partial<Quest> = {}): Quest => ({
  ...questIn('open'),
  id,
  party_id: CONTRACT,
  party_role: role,
  ...(role === 'contract' ? {} : { contract: 'apps/api/openapi.json' }),
  depends_on: role === 'part' ? [CONTRACT] : role === 'merge' ? [WEB, API] : [],
  ...extra,
});

const party = (): Quest[] => [
  member(CONTRACT, 'contract', { attempt_log: [worked(ELLA, 'assignee')] }),
  member(WEB, 'part', { attempt_log: [worked(THORN, 'assignee'), worked(BRANN, 'verifier')] }),
  member(API, 'part'),
  member(MERGE, 'merge'),
];

const codesOf = (quests: readonly Quest[]) => partyIssues(quests).map(({ quest, code }) => [quest, code]);

describe('partyIssues', () => {
  it('finds nothing wrong with a sound party, and ignores quests outside parties', () => {
    expect(partyIssues([...party(), { ...questIn('open'), id: LONE }])).toEqual([]);
  });

  it('needs the contract quest among the quests it is given', () => {
    expect(partyIssues(party().slice(1))).toEqual([
      {
        party: CONTRACT,
        quest: CONTRACT,
        code: 'missing_contract',
        message: 'the contract quest of this party is missing',
      },
    ]);
  });

  it('keeps every member in the territory of the contract', () => {
    const [contract, web, ...rest] = party();
    const moved: Quest = { ...web!, territory: 'shop-api' as TerritoryId };
    expect(codesOf([contract!, moved, ...rest])).toEqual([[WEB, 'territory_mismatch']]);
  });

  it('makes every part wait for the contract and the merge quest wait for every part', () => {
    const [contract, web, api, merge] = party();
    expect(codesOf([contract!, { ...web!, depends_on: [] }, api!, { ...merge!, depends_on: [WEB] }])).toEqual(
      [
        [WEB, 'part_without_contract'],
        [MERGE, 'merge_missing_part'],
      ],
    );
  });

  it('allows one merge quest per party', () => {
    expect(codesOf([...party(), member(LONE, 'merge')])).toEqual([[LONE, 'many_merges']]);
  });

  it('never lets anyone who worked on the party verify a quest of it, whichever came first (ADR 0020)', () => {
    const [contract, web, api, merge] = party();
    // Ella wrote the contract and verifies the API part; Brann verified the web part and now works the API
    // part; Thorn worked the web part and once verified the merge quest.
    const judgedByMember = { ...api!, assignee: BRANN, verifier: ELLA };
    const judgedEarlier = { ...merge!, attempt_log: [worked(THORN, 'verifier')] };
    const issue = (quest: QuestId, who: string) => ({
      party: CONTRACT,
      quest,
      code: 'member_verifies',
      message: `${who} worked on this party and verifies ${quest}`,
    });
    expect(partyIssues([contract!, web!, judgedByMember, judgedEarlier])).toEqual([
      issue(WEB, 'brann'),
      issue(API, 'ella'),
      issue(MERGE, 'thorn'),
    ]);
  });

  describe("with a blind trial's acceptance part (P1-21)", () => {
    const TESTS = 'q_20261107_7t5s3a' as QuestId;
    const tests = (extra: Partial<Quest> = {}) =>
      member(TESTS, 'acceptance', { depends_on: [CONTRACT], ...extra });
    const withTests = (part: Partial<Quest>, merge: readonly QuestId[] = [WEB, API, TESTS]): Quest[] => {
      const [contract, web, api, mergeQuest] = party();
      return [contract!, web!, api!, { ...mergeQuest!, depends_on: [...merge] }, tests(part)];
    };

    it('makes it wait for the contract like a part, and the merge quest wait for it', () => {
      expect(codesOf(withTests({}))).toEqual([]);
      expect(codesOf(withTests({ depends_on: [] }, [WEB, API]))).toEqual([
        [TESTS, 'part_without_contract'],
        [MERGE, 'merge_missing_part'],
      ]);
    });

    it("keeps its writer apart from the parts' workers", () => {
      expect(partyIssues(withTests({ assignee: THORN }))).toEqual([
        {
          party: CONTRACT,
          quest: CONTRACT,
          code: 'blind_trial_crossed',
          message: 'thorn wrote the acceptance tests of this party and worked one of its parts',
        },
      ]);
      expect(codesOf(withTests({ assignee: 'ash' as CharacterId }))).toEqual([]);
    });
  });
});
