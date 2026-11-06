import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CHARACTER, DC1_LAWS, QUEST } from './__fixtures__/claude-payloads.ts';
import { tempKingdom } from './__fixtures__/temp.ts';
import { loadContext, policyArgument } from './context.ts';
import type { TempKingdom } from './__fixtures__/temp.ts';

describe('policyArgument', () => {
  it.each([
    [['--policy', 'C:\\run dir\\policy.json'], 'C:\\run dir\\policy.json'],
    [['--policy=/run/policy.json'], '/run/policy.json'],
    [['--other'], undefined],
    [[], undefined],
  ])('%j', (argv, file) => {
    expect(policyArgument(argv)).toBe(file);
  });
});

describe('loadContext', () => {
  let kingdom: TempKingdom;
  beforeEach(async () => {
    kingdom = await tempKingdom();
  });
  afterEach(() => kingdom.remove());

  const writePolicy = async (policy: unknown): Promise<string> => {
    const file = path.join(kingdom.runDir, 'policy.json');
    await writeFile(file, JSON.stringify(policy), 'utf8');
    return file;
  };

  it('reads the session from env and builds the run folder from it', () => {
    const ctx = loadContext(kingdom.env({ ELVARIA_ROLE: 'assignee', ELVARIA_MODEL: 'claude-opus-5-5' }), []);
    expect(ctx).toMatchObject({
      model: 'claude-opus-5-5',
      kingdom: kingdom.root,
      quest: QUEST,
      attempt: 1,
      character: CHARACTER,
      role: 'assignee',
      tz: 'Asia/Ho_Chi_Minh',
      runDir: kingdom.runDir,
      problems: [],
    });
    expect(ctx.laws.paths).toEqual([]);
  });

  it('takes context and laws from the policy file, env first', async () => {
    const file = await writePolicy({
      version: 1,
      kingdom: kingdom.root,
      quest: QUEST,
      attempt: 3,
      character: 'other',
      role: 'verifier',
      model: 'claude-sonnet-5-5',
      tz: 'Asia/Kolkata',
      laws: DC1_LAWS,
    });
    const ctx = loadContext({ ELVARIA_CHARACTER: CHARACTER, ELVARIA_ROLE: '' }, ['--policy', file]);
    expect(ctx).toMatchObject({
      quest: QUEST,
      attempt: 3,
      character: CHARACTER,
      role: 'verifier',
      model: 'claude-sonnet-5-5',
      tz: 'Asia/Kolkata',
    });
    expect(ctx.runDir).toBe(kingdom.runDir);
    expect(ctx.laws.paths.map(({ glob }) => glob)).toEqual(DC1_LAWS.forbidden_paths);
    expect(ctx.problems).toEqual([]);
  });

  it('breaks the laws when the policy file asked for cannot be read', () => {
    const missing = path.join(kingdom.runDir, 'missing.json');
    const ctx = loadContext(kingdom.env(), ['--policy', missing]);
    expect(ctx.laws.broken).toContain(missing);
    expect(ctx.problems).toEqual([expect.stringContaining(missing)]);
    expect(ctx.runDir).toBe(kingdom.runDir);
  });

  it('leaves out malformed ids and says so', () => {
    const ctx = loadContext(
      kingdom.env({
        ELVARIA_QUEST: '../../etc',
        ELVARIA_ATTEMPT: '0',
        ELVARIA_CHARACTER: 'Thorn the Brave',
      }),
      [],
    );
    expect(ctx).toMatchObject({
      quest: undefined,
      attempt: undefined,
      character: undefined,
      runDir: undefined,
    });
    expect(ctx.problems).toHaveLength(3);
  });

  it('stamps in the machine zone when the zone is missing or not a zone id', () => {
    for (const tz of [undefined, 'Asia/Ho Chi Minh', '../x']) {
      const ctx = loadContext(kingdom.env({ ELVARIA_TZ: tz }), []);
      expect(ctx.tz).toBeUndefined();
      expect(ctx.problems).toEqual([expect.stringMatching(/not an IANA zone/)]);
    }
    expect(loadContext(kingdom.env({ ELVARIA_TZ: 'Etc/GMT+7' }), []).tz).toBe('Etc/GMT+7');
  });

  it('knows nothing outside an Elvaria session', () => {
    const ctx = loadContext({}, []);
    expect(ctx).toMatchObject({ kingdom: undefined, quest: undefined, runDir: undefined, role: undefined });
  });
});
