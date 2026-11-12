// The gazetteer's freshness stamp (PS-21): read from the first line only, left out of what the prompt quotes, and a
// note naming the folders that moved since, the most touched first; a gazetteer without a stamp stays as it was.
import { describe, expect, it } from 'vitest';

import { driftNote, gazetteerStampOf, gazetteerWithDrift } from './gazetteer-drift.ts';

const SHA = '43566818d835f9acb3c24e8b2acffbfe90133284';
const STAMPED = `<!-- elvaria:commit ${SHA} -->\n# dc1\n\nThe API lives in apps/api.\n`;

describe('gazetteerStampOf', () => {
  it('reads the commit of the first line, in any case, short or full', () => {
    expect(gazetteerStampOf(STAMPED)).toBe(SHA);
    expect(gazetteerStampOf('<!--elvaria:COMMIT ABC1234-->\r\n# x')).toBe('abc1234');
  });

  it('finds none elsewhere, or in another shape', () => {
    expect(gazetteerStampOf(`# dc1\n<!-- elvaria:commit ${SHA} -->`)).toBeUndefined();
    expect(gazetteerStampOf('<!-- elvaria:commit abc12 -->')).toBeUndefined();
    expect(gazetteerStampOf('<!-- commit: abc1234 -->')).toBeUndefined();
    expect(gazetteerStampOf('')).toBeUndefined();
  });
});

describe('driftNote', () => {
  it('names the folders that moved, the most touched first, with the stamp shortened', () => {
    expect(driftNote(SHA, { packages: 3, apps: 12, docs: 3 })).toBe(
      'Since this gazetteer was written at `43566818d835`, 12 commits touched `apps/`, 3 touched `docs/`, 3 touched `packages/`: check what it says of them against the code.',
    );
    expect(driftNote(SHA, { apps: 1 })).toContain('1 commit touched `apps/`:');
  });

  it('says nothing when no folder moved', () => {
    expect(driftNote(SHA, {})).toBe('');
    expect(driftNote(SHA, { apps: 0 })).toBe('');
  });
});

describe('gazetteerWithDrift', () => {
  it('leaves a gazetteer without a stamp exactly as it is', () => {
    const text = '# dc1\n\nThe API lives in apps/api.\n';
    expect(gazetteerWithDrift(text, { apps: 4 })).toBe(text);
  });

  it('drops the stamp line and adds the note after the text', () => {
    expect(gazetteerWithDrift(STAMPED, { apps: 2 })).toBe(
      '# dc1\n\nThe API lives in apps/api.\n\nSince this gazetteer was written at `43566818d835`, 2 commits touched `apps/`: check what it says of them against the code.\n',
    );
  });

  it('drops the stamp alone when nothing moved, or git could not say', () => {
    const body = '# dc1\n\nThe API lives in apps/api.\n';
    expect(gazetteerWithDrift(STAMPED, {})).toBe(body);
    expect(gazetteerWithDrift(STAMPED, null)).toBe(body);
    expect(gazetteerWithDrift(`<!-- elvaria:commit ${SHA} -->`, null)).toBe('');
  });
});
