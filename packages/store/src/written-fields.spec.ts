import { describe, expect, it } from 'vitest';

import { dropFilledDefaults, toWrite } from './written-fields.ts';
import type { Parser } from './stored-file.ts';

describe('dropFilledDefaults (187)', () => {
  const raw = { version: 1, name: 'a', laws: { paths: ['x'] }, checks: [{ id: 'lint' }] };
  const read = {
    version: 1,
    name: 'a',
    laws: { paths: ['x'], commands: [] },
    checks: [{ id: 'lint', exclusive: false }],
    blind_trial: { enabled: false, min_rank: 'B' },
  };

  it('drops the defaults the schema filled in, at any depth and inside array items', () => {
    expect(dropFilledDefaults({ ...read, name: 'b' }, raw, read)).toEqual({ ...raw, name: 'b' });
  });

  it('keeps a field the change set, a field the file had, and a new array item whole', () => {
    const next = {
      ...read,
      laws: { paths: [], commands: ['rm'] },
      checks: [
        { id: 'lint', exclusive: true },
        { id: 'unit', exclusive: false },
      ],
      blind_trial: { enabled: true, min_rank: 'B' },
      health: { ci: 'green' },
    };
    expect(dropFilledDefaults(next, raw, read)).toEqual({ ...next, blind_trial: { enabled: true } });
  });

  it('leaves out a field the change removed, and anything that is not an object on both sides', () => {
    const unnamed = { version: 1, laws: read.laws, checks: read.checks, blind_trial: read.blind_trial };
    expect(dropFilledDefaults(unnamed, raw, read)).toEqual({
      version: 1,
      laws: raw.laws,
      checks: raw.checks,
    });
    expect(dropFilledDefaults({ laws: 'none' }, raw, read)).toEqual({ laws: 'none' });
    expect(dropFilledDefaults([1], { a: 1 }, [1])).toEqual([1]);
  });
});

describe('toWrite (187)', () => {
  /** `label` defaults to `kind`, a default that pairing by key cannot see; kind `c` must name its label. */
  interface Tagged {
    kind: string;
    label: string;
  }
  const parser: Parser<Tagged> = {
    safeParse: (data) => {
      const { kind, label } = data as { kind?: unknown; label?: unknown };
      if (typeof kind !== 'string' || (kind === 'c' && label === undefined))
        return { success: false, error: { issues: [{ path: ['label'], message: 'Required' }] } };
      return { success: true, data: { kind, label: typeof label === 'string' ? label : kind } };
    },
  };
  const before = { raw: { kind: 'a' }, value: { kind: 'a', label: 'a' } };

  it('writes the sparse form when the schema reads it back as the value', () => {
    expect(toWrite({ kind: 'a', label: 'b' }, before, parser)).toEqual({ kind: 'a', label: 'b' });
    expect(toWrite({ kind: 'a', label: 'a' }, before, parser)).toEqual({ kind: 'a' });
  });

  it('writes the value whole when the sparse form would read back differently, or not at all', () => {
    expect(toWrite({ kind: 'b', label: 'a' }, before, parser)).toEqual({ kind: 'b', label: 'a' });
    expect(toWrite({ kind: 'c', label: 'a' }, before, parser)).toEqual({ kind: 'c', label: 'a' });
  });
});
