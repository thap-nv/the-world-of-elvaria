// territory.patrol (PS-26): optional after v1, absent means no patrol; scans default to none, a follow-up names the
// draft's kind, rank and class.
import { describe, expect, it } from 'vitest';

import { TerritorySchema } from './territory.ts';

const territory = (fields: Record<string, unknown> = {}) => ({
  version: 1,
  id: 'elvaria',
  name: 'Elvaria',
  path: 'D:/Dummy/Tool - Personal/elvaria',
  kind: 'code',
  vcs: { type: 'git', default_branch: 'main' },
  ...fields,
});

describe('territory.patrol', () => {
  it('accepts partial after_merge configuration and rejects invalid thresholds, paths and unknown keys', () => {
    const parse = (after_merge: unknown) => TerritorySchema.safeParse(territory({ patrol: { after_merge } }));
    expect(parse({}).data?.patrol?.after_merge).toEqual({ every: 3, quiet_paths: [] });
    expect(parse({ every: 1 }).data?.patrol?.after_merge).toEqual({ every: 1, quiet_paths: [] });
    expect(parse({ quiet_paths: ['docs/**'] }).data?.patrol?.after_merge).toEqual({
      every: 3,
      quiet_paths: ['docs/**'],
    });
    for (const value of [
      { every: 0 },
      { every: 1.5 },
      { unknown: true },
      ...['', '/docs/**', 'C:/docs/**', '../docs/**', 'docs\\**'].map((glob) => ({ quiet_paths: [glob] })),
    ])
      expect(parse(value).success).toBe(false);
  });

  it('stays absent when the file has none: no patrol', () => {
    expect(TerritorySchema.parse(territory())).not.toHaveProperty('patrol');
  });

  it('defaults scans to none and their params to empty, and takes a follow-up', () => {
    const parsed = TerritorySchema.parse(territory({ patrol: {} }));
    expect(parsed.patrol).toEqual({ scans: [] });
    const full = TerritorySchema.parse(
      territory({
        patrol: {
          scans: [{ script: 'link-check', params: { globs: ['docs/**/*.md'] } }, { script: 'todo-scan' }],
          follow_up: { kind: 'fix', rank: 'D', class: 'knight' },
        },
      }),
    );
    expect(full.patrol?.scans[1]).toEqual({ script: 'todo-scan', params: {} });
    expect(full.patrol?.follow_up).toEqual({ kind: 'fix', rank: 'D', class: 'knight' });
  });

  it('refuses a follow-up without its class, and a field it does not know', () => {
    const issues = (patrol: unknown) =>
      (TerritorySchema.safeParse(territory({ patrol })).error?.issues ?? []).map(({ path }) =>
        path.join('.'),
      );
    expect(issues({ follow_up: { kind: 'fix', rank: 'D' } })).toEqual(['patrol.follow_up.class']);
    expect(issues({ enabled: true })).toEqual(['patrol']);
  });
});
