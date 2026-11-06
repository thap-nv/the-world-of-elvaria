import { describe, expect, it } from 'vitest';

import { currentVersion, migrate, versionOf } from './run.ts';
import type { MigrationChain } from './run.ts';

// A made-up contract with two steps: v1 {name} → v2 {title} → v3 {title, tags}.
const CHAIN: MigrationChain = [
  (old) => {
    const { name } = old as { name: string };
    return { version: 2, title: name };
  },
  (old) => ({ ...(old as object), version: 3, tags: [] }),
];

describe('versionOf', () => {
  it.each([
    [{ version: 1 }, 1],
    [{ version: 7 }, 7],
    [{ version: 0 }, undefined],
    [{ version: 1.5 }, undefined],
    [{ version: '1' }, undefined],
    [{}, undefined],
    [null, undefined],
    [[1], undefined],
    ['{"version":1}', undefined],
  ])('reads %j as %s', (value, expected) => {
    expect(versionOf(value)).toBe(expected);
  });
});

describe('migrate (implementation-plan §2.1, ADR 0003)', () => {
  it('counts the current version from the chain', () => {
    expect(currentVersion([])).toBe(1);
    expect(currentVersion(CHAIN)).toBe(3);
  });

  it('chains every step from the file version to the current one', () => {
    expect(migrate({ version: 1, name: 'a' }, CHAIN)).toEqual({
      ok: true,
      value: { value: { version: 3, title: 'a', tags: [] }, from: 1 },
    });
    expect(migrate({ version: 2, title: 'b' }, CHAIN)).toEqual({
      ok: true,
      value: { value: { version: 3, title: 'b', tags: [] }, from: 2 },
    });
  });

  it('returns a current file as it is', () => {
    const file = { version: 3, title: 'c', tags: ['x'] };
    const result = migrate(file, CHAIN);
    expect(result).toEqual({ ok: true, value: { value: file, from: 3 } });
    expect(result.ok && result.value.value).toBe(file);
  });

  it('refuses a file without a version, and one from a newer Elvaria', () => {
    expect(migrate({ name: 'a' }, CHAIN)).toEqual({ ok: false, error: { code: 'missing_version' } });
    expect(migrate({ version: 4 }, CHAIN)).toEqual({
      ok: false,
      error: { code: 'future_version', version: 4, current: 3 },
    });
  });

  it('reports the step that threw, and one that forgot to bump the version', () => {
    const throwing: MigrationChain = [
      () => {
        throw new Error('no name');
      },
    ];
    expect(migrate({ version: 1 }, throwing)).toEqual({
      ok: false,
      error: { code: 'migration_failed', from: 1, message: 'no name' },
    });
    const forgetful: MigrationChain = [(old) => old];
    expect(migrate({ version: 1 }, forgetful)).toEqual({
      ok: false,
      error: { code: 'migration_failed', from: 1, message: 'did not set version 2' },
    });
    // A step written badly enough to throw something that is not an Error.
    const thrown: unknown = 'bad';
    const odd: MigrationChain = [
      () => {
        throw thrown;
      },
    ];
    expect(migrate({ version: 1 }, odd)).toMatchObject({ ok: false, error: { message: 'bad' } });
  });
});
