import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { QUEST, REGISTRY, TERRITORY, THORN } from '../__fixtures__/world.ts';
import { toolPolicyOf } from '../policy/tool-policy.ts';
import { POLICY_FILE, policyFileOf, writePolicyFile } from './policy-file.ts';
import { contextEnv, runContextOf } from './run-context.ts';
import type { SpawnRequest } from './types.ts';

const knight = REGISTRY.classes.find(({ id }) => id === 'knight')!;
const policy = toolPolicyOf({ role: 'assignee', characterClass: knight, territory: TERRITORY });

const request = (env: Record<string, string>, withQuest = true): SpawnRequest => ({
  role: 'assignee',
  ...(withQuest ? { quest: QUEST } : {}),
  character: THORN,
  cwd: '/plot',
  prompt: { system: 's', user: 'u' },
  permissions: policy,
  budget: { max_turns: 5, max_minutes: 5 },
  env,
  run_dir: '/runs',
});

const STEWARD_ENV = {
  PATH: '/bin',
  ELVARIA_KINGDOM: '/kingdom',
  ELVARIA_QUEST: 'q_20990101_zzzzzz',
  ELVARIA_ATTEMPT: '2',
  ELVARIA_CHARACTER: 'someone-else',
  ELVARIA_TZ: 'Asia/Ho_Chi_Minh',
};

describe('runContextOf', () => {
  it('takes who from the request and where from the env', () => {
    expect(runContextOf(request(STEWARD_ENV))).toEqual({
      kingdom: '/kingdom',
      // The request's quest and character win over a stale env.
      quest: QUEST.id,
      attempt: 2,
      character: THORN.id,
      role: 'assignee',
      model: THORN.model,
      tz: 'Asia/Ho_Chi_Minh',
    });
  });

  it('falls back to the env quest, and leaves out what is unset, empty or malformed', () => {
    const ctx = runContextOf(request({ ELVARIA_QUEST: 'q_x', ELVARIA_ATTEMPT: '0', ELVARIA_TZ: '' }, false));
    expect(ctx).toEqual({ quest: 'q_x', character: THORN.id, role: 'assignee', model: THORN.model });
  });

  it('turns the context back into the env the hook reads', () => {
    expect(contextEnv(runContextOf(request(STEWARD_ENV)))).toEqual({
      ELVARIA_KINGDOM: '/kingdom',
      ELVARIA_QUEST: QUEST.id,
      ELVARIA_ATTEMPT: '2',
      ELVARIA_CHARACTER: THORN.id,
      ELVARIA_ROLE: 'assignee',
      ELVARIA_MODEL: THORN.model,
      ELVARIA_TZ: 'Asia/Ho_Chi_Minh',
    });
  });
});

describe('policy.json', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'elvaria policy '));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('is the v1 contract the hook reads: version, context, laws', () => {
    const file = policyFileOf(runContextOf(request(STEWARD_ENV)), policy.laws);
    expect(file).toMatchObject({ version: 1, quest: QUEST.id, attempt: 2, model: THORN.model });
    expect(file.laws).toEqual(policy.laws);
    expect(file.laws.forbidden_paths).toEqual(['.env', '.env.*', 'infra/secrets/**']);
    // The hook checks these by hand (packages/hooks/src/policy.ts): strings, an integer attempt, string lists.
    for (const key of ['kingdom', 'quest', 'character', 'role', 'model', 'tz'] as const) {
      expect(typeof file[key]).toBe('string');
    }
  });

  it('is written into the run folder, which it creates', async () => {
    const runDir = path.join(dir, '.runs', `${QUEST.id}-1`);
    const written = await writePolicyFile(runDir, runContextOf(request(STEWARD_ENV)), policy.laws);
    expect(written).toBe(path.join(runDir, POLICY_FILE));
    const parsed = JSON.parse(await readFile(written, 'utf8')) as { laws: unknown; version: number };
    expect(parsed.version).toBe(1);
    expect(parsed.laws).toEqual(policy.laws);
  });
});
