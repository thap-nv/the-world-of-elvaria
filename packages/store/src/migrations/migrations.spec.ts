// The test ADR 0003 asks for: every fixture of every version is still readable by the current store, each
// migration step turns v<n>.json into v<n+1>.json, and the newest fixture is at the current version.
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CONTRACTS } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { fixture, fixtureText } from '../../test/kingdom.ts';
import { STORED_GROUPS } from '../migrate-kingdom.ts';
import { decode } from '../stored-file.ts';
import { MIGRATIONS, STORED_CONTRACTS } from './index.ts';
import { currentVersion, migrate } from './run.ts';
import type { FileSpec } from '../stored-file.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const specOf = new Map<string, FileSpec<unknown>>(
  STORED_GROUPS.map((group) => [group.spec.contract, group.spec]),
);

/** Fixture versions on disk for one contract: `v1.json`, `v2.json`… */
const fixtureVersions = (contract: string): number[] =>
  readdirSync(new URL(`${contract}/`, import.meta.url))
    .map((name) => /^v([1-9][0-9]*)\.json$/.exec(name)?.[1])
    .filter((version) => version !== undefined)
    .map(Number)
    .sort((a, b) => a - b);

/** Migration modules on disk for one contract: `v1-to-v2.ts` → 1. */
const stepFiles = (contract: string): number[] =>
  readdirSync(new URL(`${contract}/`, import.meta.url))
    .map((name) => /^v([1-9][0-9]*)-to-v[1-9][0-9]*\.ts$/.exec(name)?.[1])
    .filter((version) => version !== undefined)
    .map(Number)
    .sort((a, b) => a - b);

describe('the stored contracts', () => {
  it('are contracts of the domain (docs/schemas)', () => {
    expect(STORED_CONTRACTS.filter((contract) => !(contract in CONTRACTS))).toEqual([]);
  });

  it('each have a migration chain, a group of files and a fixture folder', () => {
    expect(Object.keys(MIGRATIONS).sort()).toEqual([...STORED_CONTRACTS].sort());
    expect([...specOf.keys()].sort()).toEqual([...STORED_CONTRACTS].sort());
    for (const contract of STORED_CONTRACTS) expect(existsSync(`${HERE}${contract}`)).toBe(true);
  });
});

describe.each(STORED_CONTRACTS)('%s', (contract) => {
  const chain = MIGRATIONS[contract];
  const spec = specOf.get(contract);

  it('has one fixture per version, v1 up to the current one', () => {
    const current = currentVersion(chain);
    expect(fixtureVersions(contract)).toEqual(Array.from({ length: current }, (_, index) => index + 1));
  });

  it('has one module per migration step, named v<n>-to-v<n+1>.ts', () => {
    expect(stepFiles(contract)).toEqual(chain.map((_, index) => index + 1));
  });

  it('reads every fixture with the current store', () => {
    if (spec === undefined) throw new Error(`no spec for ${contract}`);
    for (const version of fixtureVersions(contract)) {
      const decoded = decode(fixtureText(contract, version), `${contract}/v${version}.json`, spec);
      expect(decoded).toMatchObject({ ok: true, value: { from: version } });
    }
  });

  it('turns each fixture into the next one, step by step', () => {
    for (const version of fixtureVersions(contract).slice(0, -1)) {
      const step = migrate(fixture(contract, version), chain.slice(0, version));
      expect(step).toEqual({ ok: true, value: { value: fixture(contract, version + 1), from: version } });
    }
  });
});
