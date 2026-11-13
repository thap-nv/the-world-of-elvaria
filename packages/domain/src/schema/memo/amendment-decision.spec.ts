import { describe, expect, it } from 'vitest';

import examples from '../../../examples/amendment-decision.json' with { type: 'json' };
import { DecideAmendmentPayloadSchema } from '../command/memo-payloads.ts';
import { contractOf } from '../json-schema.ts';
import { AmendmentDecisionFileSchema } from './amendment-decision.ts';

const messagesOf = (result: { error?: { issues: readonly { message: string }[] } }) =>
  result.error?.issues.map(({ message }) => message) ?? [];

describe('AmendmentDecisionFileSchema', () => {
  const reply = { version: 1, note: 'The file moved.', ask: [] };

  it('accepts the contract examples unchanged', () => {
    for (const example of examples) expect(AmendmentDecisionFileSchema.parse(example)).toEqual(example);
  });

  it('takes an acceptance with its description, a refusal and a referral without one', () => {
    const accepted = { ...reply, decision: 'accepted', description: '## Goal\n\nServe /v2.' };
    expect(AmendmentDecisionFileSchema.parse(accepted)).toEqual(accepted);
    for (const decision of ['rejected', 'owner'])
      expect(AmendmentDecisionFileSchema.safeParse({ ...reply, decision }).success).toBe(true);
  });

  it('refuses an acceptance without a description, and a description on anything else', () => {
    const rule = 'an accepted amendment, and only one, rewrites the description';
    expect(messagesOf(AmendmentDecisionFileSchema.safeParse({ ...reply, decision: 'accepted' }))).toEqual([
      rule,
    ]);
    const rejected = { ...reply, decision: 'rejected', description: 'x' };
    expect(messagesOf(AmendmentDecisionFileSchema.safeParse(rejected))).toEqual([rule]);
  });

  it('says both rules in its contract', () => {
    expect(contractOf('amendment-decision', AmendmentDecisionFileSchema)).toMatchObject({
      allOf: [
        { if: { properties: { decision: { const: 'accepted' } } }, then: { required: ['description'] } },
        { if: { required: ['description'] }, then: { properties: { decision: { const: 'accepted' } } } },
      ],
    });
  });
});

describe('DecideAmendmentPayloadSchema', () => {
  const payload = { memo: 'm_20261113_4k2pqz', note: 'Because.' };
  const read = '2026-11-13T10:00:00+07:00';

  it('takes an acceptance with or without a rewrite, a refusal, and a referral with its holds', () => {
    for (const decision of [
      { decision: 'accepted', description: 'New.', expected_updated_at: read },
      { decision: 'accepted' },
      { decision: 'rejected' },
      { decision: 'owner', holds: ['decision_change'] },
    ])
      expect(DecideAmendmentPayloadSchema.safeParse({ ...payload, ...decision }).success).toBe(true);
  });

  it('refuses a rewrite without the time it was read at, or on a refusal; holds anywhere but a referral', () => {
    const rewrite = 'only an acceptance rewrites the description, with the time the author read the quest at';
    const holds = 'an amendment sent to the owner, and only one, says why';
    const cases = [
      [{ decision: 'accepted', description: 'New.' }, [rewrite]],
      [{ decision: 'rejected', description: 'New.', expected_updated_at: read }, [rewrite]],
      [{ decision: 'rejected', holds: ['decision_change'] }, [holds]],
    ] as const;
    for (const [decision, messages] of cases)
      expect(messagesOf(DecideAmendmentPayloadSchema.safeParse({ ...payload, ...decision }))).toEqual(
        messages,
      );
  });
});
