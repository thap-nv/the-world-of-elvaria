import { describe, expect, it } from 'vitest';

import { deletedByOwnerOf, liveEntryOf, monkLinesOf, sourceOf } from './ledger.ts';
import { AT, COMMAND, entryOfMonk, fileOf, ledgerOf, monkId } from './__fixtures__/report.ts';

const retired = { at: AT, by: 'monk', text: 'Old rule.', command: COMMAND } as const;

describe('the ledger beside a scripture', () => {
  const file = fileOf(
    'temple',
    [
      '- Hand-written rule.',
      `- [${monkId(1)}] Monk rule.`,
      `- [${monkId(2)}] Copied id, the owner's.`,
      `- [${monkId(3)}] Retired, yet put back.`,
    ],
    ledgerOf(
      entryOfMonk(monkId(1)),
      entryOfMonk(monkId(3), { retired }),
      entryOfMonk(monkId(4)),
      entryOfMonk(monkId(5), { retired }),
    ),
  );
  const lines = monkLinesOf(file);

  it("names the Monk's lines: those the ledger keeps and has not retired", () => {
    expect(lines.map(({ text }) => text)).toEqual(['Monk rule.']);
  });

  it("tells every other line as the owner's", () => {
    const source = (id: string | null) => sourceOf({ id: id as never }, file.ledger);
    expect([null, monkId(1), monkId(2), monkId(3)].map(source)).toEqual(['user', 'monk', 'user', 'user']);
    expect(liveEntryOf({ id: monkId(3) }, file.ledger)).toBeUndefined();
  });

  it('finds the entries of lines the owner deleted, not those retired', () => {
    expect(deletedByOwnerOf(file).map(({ id }) => id)).toEqual([monkId(4)]);
  });
});
