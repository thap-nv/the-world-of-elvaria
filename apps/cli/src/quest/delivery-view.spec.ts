// What `quest show` says of a done quest's delivery to its forge (PS-08c), read from its journal: the pull request,
// where the delivery stopped and how to send it again, or nothing once the owner asked for it again.
import { EVENT_VERSION, EventSchema } from '@elvaria/domain';
import type { Event } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { QUEST_ID, questFixture } from '../__fixtures__/quest.ts';
import { deliveryLines } from './delivery-view.ts';

const en = translator('en');
const QUEST = questFixture('done', QUEST_ID);
const HEAD = 'abcdef0123456789abcdef0123456789abcdef01';
const PR = { number: 7, url: 'https://github.com/elvaria-specs/kingdom-repo/pull/7' };
const BASE = { quest: QUEST_ID, territory: 'do-an', branch: `quest/${QUEST_ID}` };

let serial = 0;
const line = (type: string, data: Record<string, unknown>, quest?: string): Event => {
  serial += 1;
  return EventSchema.parse({
    v: EVENT_VERSION,
    id: `01JC${String(serial).padStart(22, '0')}`,
    ts: '2026-11-06T08:40:00+07:00',
    type,
    actor: { kind: quest === undefined ? 'steward' : 'user' },
    ...(quest === undefined ? {} : { quest }),
    data,
  });
};
const pushed = (extra: Record<string, unknown> = {}) =>
  line('delivery.pushed', { ...BASE, head: HEAD, forge: 'github', pr: PR, ...extra });
const failed = (extra: Record<string, unknown>) =>
  line('delivery.failed', { quest: QUEST_ID, territory: 'do-an', ...extra });

describe('deliveryLines', () => {
  it('says nothing for a quest that never went to a forge', () => {
    expect(deliveryLines(en, QUEST, [])).toEqual([]);
  });

  it('names the pull request and the short head, and the files a secret pattern matched', () => {
    expect(deliveryLines(en, QUEST, [pushed()])).toEqual([
      '',
      `Branch pushed (head abcdef0); pull request: ${PR.url}`,
    ]);
    expect(deliveryLines(en, QUEST, [pushed({ warnings: ['src/a.ts', '.env.example'] })])).toEqual([
      '',
      `Branch pushed (head abcdef0); pull request: ${PR.url}`,
      'Warning: added lines match a shared secret pattern in src/a.ts, .env.example; look at them before you merge.',
    ]);
  });

  it('names the merged pull request and its merge commit', () => {
    const merged = line('delivery.merged', {
      ...BASE,
      head: HEAD,
      pr: PR,
      merge_sha: '1234567890abcdef1234567890abcdef12345678',
      method: 'squash',
      sealed: true,
      branch_deleted: true,
    });
    expect(deliveryLines(en, QUEST, [pushed(), merged])).toEqual([
      '',
      `Pull request ${PR.url} merged (commit 1234567).`,
    ]);
  });

  it('says where a delivery stopped and why, its pull request, files, the end of the message, and the command', () => {
    const detail = Array.from({ length: 10 }, (_, index) => `remote: line ${index + 1}`).join('\r\n');
    const lines = deliveryLines(en, QUEST, [
      failed({
        stage: 'checks',
        reason: 'checks_red',
        pr: PR,
        paths: ['a.ts', 'b.ts'],
        detail: `${detail}\n\n`,
      }),
    ]);
    expect(lines.slice(0, 4)).toEqual([
      '',
      "The delivery stopped at the pull request's checks: a check is red: a required check of the pull request, or a check of the territory on the branch with the base branch merged in (.runs/<quest>-delivery/checks/); read it, then deliver again.",
      `Pull request: ${PR.url}`,
      'Files: a.ts, b.ts',
    ]);
    expect(lines.slice(4, -1)).toEqual(
      Array.from({ length: 8 }, (_, index) => `    remote: line ${index + 3}`),
    );
    expect(lines.at(-1)).toBe(`Once fixed, deliver it again: elvaria quest deliver ${QUEST_ID}`);
  });

  it('says only where and why when the failure carries nothing else', () => {
    expect(deliveryLines(en, QUEST, [failed({ stage: 'push', reason: 'no_credential' })])).toEqual([
      '',
      'The delivery stopped at the push: git has no credential for the forge; sign in (git credential, Git Credential Manager), then deliver again.',
      `Once fixed, deliver it again: elvaria quest deliver ${QUEST_ID}`,
    ]);
  });

  it('names the merge quest the stop waits for, instead of the command (PS-09b)', () => {
    const merge = 'q_20261116_m3m3m3';
    const stop = { stage: 'update', reason: 'conflict', paths: ['src/a.ts'], merge_quest: merge };
    expect(deliveryLines(en, QUEST, [failed(stop)]).at(-1)).toBe(
      `It waits for the merge quest ${merge}, which goes into the base branch with it. Should that quest be cancelled: elvaria quest deliver ${QUEST_ID}`,
    );
  });

  it("forgets the outcome once the owner's deliver command is applied", () => {
    const again = line(
      'command.applied',
      { command_id: '01JC0000000000000000000099', kind: 'deliver' },
      QUEST_ID,
    );
    expect(deliveryLines(en, QUEST, [failed({ stage: 'push', reason: 'push_refused' }), again])).toEqual([]);
  });
});
