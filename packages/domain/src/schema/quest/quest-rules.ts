// Rules across fields of one quest (implementation-plan §2.5 invariants): the v1 `allOf` conditionals, then the
// invariants JSON Schema cannot state. Rules that need other files (registry, territory, party) live elsewhere.
import { scriptTierNeedsScript, sessionTierNeedsClass } from './shared.ts';
import { issueIf } from './rules.ts';
import type { QuestStatus } from './shared.ts';
import type { QuestFieldsSchema } from './quest-fields.ts';
import type { Rule } from './rules.ts';
import type { z } from 'zod';

type QuestFields = z.output<typeof QuestFieldsSchema>;

/** A session-tier quest in these states is held by a character (implementation-plan §2.5). */
const HELD: readonly QuestStatus[] = [
  'claimed',
  'working',
  'review',
  'returned',
  'awaiting_seal',
  'paused_mana',
];
/** The royal seal is the last step: a sealed quest is done, or archived after that. */
const SEALED: readonly QuestStatus[] = ['done', 'archived'];

const CONDITIONALS: readonly Rule<QuestFields>[] = [
  {
    contract: {
      $comment: 'Script tier: a catalog script, no character.',
      if: { properties: { tier: { const: 'script' } } },
      then: { required: ['script'], properties: { assignee: { type: 'null' } } },
    },
    check: (quest) => [
      ...scriptTierNeedsScript(quest),
      ...issueIf(
        quest.tier === 'script' && typeof quest.assignee === 'string',
        ['assignee'],
        'a script-tier quest has no assignee: the Steward runs it',
      ),
    ],
  },
  {
    contract: {
      $comment:
        "Session tier: a character holds the quest while it is in flight; not a party's merge quest, whose run the Steward may make itself (P1-18).",
      if: {
        properties: {
          tier: { const: 'session' },
          status: { enum: HELD },
          party_role: { not: { const: 'merge' } },
        },
      },
      then: { required: ['assignee'], properties: { assignee: { type: 'string' } } },
    },
    check: (quest) =>
      issueIf(
        quest.tier === 'session' &&
          HELD.includes(quest.status) &&
          quest.party_role !== 'merge' &&
          typeof quest.assignee !== 'string',
        ['assignee'],
        `a session-tier quest in ${quest.status} needs an assignee`,
      ),
  },
  {
    contract: {
      $comment:
        "A quest in review has had a run: an attempt, or the Steward's own run of a party's merge, which takes a run number and no attempt (P1-55).",
      if: { properties: { status: { const: 'review' } } },
      then: {
        anyOf: [
          { properties: { attempts: { minimum: 1 } } },
          {
            required: ['attempt_log'],
            properties: {
              attempt_log: {
                contains: { required: ['role'], properties: { role: { const: 'assignee' } } },
              },
            },
          },
        ],
      },
    },
    check: (quest) =>
      issueIf(
        quest.status === 'review' &&
          quest.attempts < 1 &&
          !quest.attempt_log.some(({ role }) => role === 'assignee'),
        ['attempts'],
        'a quest in review has had a run',
      ),
  },
  {
    contract: { if: { required: ['seal'] }, then: { properties: { status: { enum: SEALED } } } },
    check: (quest) =>
      issueIf(
        quest.seal !== undefined && !SEALED.includes(quest.status),
        ['status'],
        'a sealed quest is done or archived',
      ),
  },
  {
    contract: { if: { properties: { status: { const: 'blocked' } } }, then: { required: ['blocked'] } },
    check: (quest) =>
      issueIf(
        quest.status === 'blocked' && quest.blocked === undefined,
        ['blocked'],
        'a blocked quest needs blocked',
      ),
  },
  {
    contract: {
      $comment: 'Session tier: the class is fixed when the quest is created.',
      if: { properties: { tier: { const: 'session' } } },
      then: { required: ['class_required'] },
    },
    check: sessionTierNeedsClass,
  },
  {
    contract: {
      $comment:
        'Party fields come together: a member has a role; parts, the acceptance part and the merge quest know the contract.',
      if: { required: ['party_id'] },
      then: { required: ['party_role'] },
    },
    check: (quest) =>
      issueIf(
        quest.party_id !== undefined && quest.party_role === undefined,
        ['party_role'],
        'a party member needs party_role',
      ),
  },
  {
    contract: { if: { required: ['party_role'] }, then: { required: ['party_id'] } },
    check: (quest) =>
      issueIf(
        quest.party_role !== undefined && quest.party_id === undefined,
        ['party_id'],
        'a party role needs party_id',
      ),
  },
  {
    contract: {
      if: {
        required: ['party_role'],
        properties: { party_role: { enum: ['part', 'acceptance', 'merge'] } },
      },
      then: { required: ['contract'] },
    },
    check: (quest) =>
      issueIf(
        quest.party_role !== undefined && quest.party_role !== 'contract' && quest.contract === undefined,
        ['contract'],
        `a party ${String(quest.party_role)} needs the contract path`,
      ),
  },
];

/** The verifier is a fresh pair of eyes: never the assignee, never anyone who worked the quest (ADR 0008). */
const verifierNeverWorked = (quest: QuestFields) => {
  const { verifier } = quest;
  if (typeof verifier !== 'string') return [];
  const worked = quest.attempt_log.some((entry) => entry.role === 'assignee' && entry.character === verifier);
  return [
    ...issueIf(verifier === quest.assignee, ['verifier'], 'the verifier is not the assignee (ADR 0008)'),
    ...issueIf(worked, ['verifier'], 'the verifier never worked this quest (ADR 0008)'),
  ];
};

/**
 * The contract quest opens the party with its own id (implementation-plan §3.13), so party_id = id names the
 * contract quest and no other member. A missing half is reported by the conditionals above.
 */
const contractQuestOwnsParty = (quest: QuestFields) => {
  if (quest.party_id === undefined || quest.party_role === undefined) return [];
  return issueIf(
    (quest.party_role === 'contract') !== (quest.party_id === quest.id),
    ['party_id'],
    'party_id is the quest id exactly for the contract quest',
  );
};

/** The plot branch is created as quest/<id> (implementation-plan §3.3); another branch would be someone else's. */
const plotBranchIsOwn = (quest: QuestFields) => {
  const { branch } = quest.plot;
  return issueIf(
    branch !== undefined && branch !== `quest/${quest.id}`,
    ['plot', 'branch'],
    'the plot branch is quest/<id>',
  );
};

export const QUEST_RULES: readonly Rule<QuestFields>[] = [
  ...CONDITIONALS,
  { check: verifierNeverWorked },
  { check: contractQuestOwnsParty },
  { check: plotBranchIsOwn },
];
