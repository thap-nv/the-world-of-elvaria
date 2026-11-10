import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
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

  it('names the env variables of the quest secrets, which never become an env variable of their own', () => {
    const withSecrets = { ...request(STEWARD_ENV), quest: { ...QUEST, secrets_required: ['npm_token'] } };
    const ctx = runContextOf(withSecrets);
    expect(ctx.secrets).toEqual(['NPM_TOKEN']);
    expect(Object.keys(contextEnv(ctx))).not.toContain('NPM_TOKEN');
    expect(runContextOf(request(STEWARD_ENV)).secrets).toBeUndefined();
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
  afterAll(() => rm(dir, RM_TEMP));

  it('is the v1 contract the hook reads: version, context, secret names, tools, laws', () => {
    const withSecrets = { ...request(STEWARD_ENV), quest: { ...QUEST, secrets_required: ['npm_token'] } };
    const file = policyFileOf(runContextOf(withSecrets), policy);
    expect(file).toMatchObject({ version: 1, quest: QUEST.id, attempt: 2, model: THORN.model });
    expect(file.secrets).toEqual(['NPM_TOKEN']);
    expect(file.tools).toEqual(policy.tools);
    expect(file.laws).toEqual(policy.laws);
    expect(file.laws.forbidden_paths).toEqual(['.env', '.env.*', 'infra/secrets/**']);
    // The hook checks these by hand (packages/hooks/src/policy.ts): strings, an integer attempt, string lists.
    for (const key of ['kingdom', 'quest', 'character', 'role', 'model', 'tz'] as const) {
      expect(typeof file[key]).toBe('string');
    }
  });

  it('is written into the run folder, which it creates', async () => {
    const runDir = path.join(dir, '.runs', `${QUEST.id}-1`);
    const written = await writePolicyFile(runDir, runContextOf(request(STEWARD_ENV)), policy);
    expect(written).toBe(path.join(runDir, POLICY_FILE));
    const parsed = JSON.parse(await readFile(written, 'utf8')) as Record<string, unknown>;
    expect(parsed.version).toBe(1);
    expect(parsed.laws).toEqual(policy.laws);
    expect(parsed.tools).toEqual(['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Agent']);
    // A session without secrets names none, and without the adapter's word no apprentice model list.
    expect(parsed).not.toHaveProperty('secrets');
    expect(parsed).not.toHaveProperty('apprentice_models');
  });

  it("carries the apprentice's models when the adapter gives them (§3.12)", async () => {
    const runDir = path.join(dir, '.runs', `${QUEST.id}-2`);
    const context = runContextOf(request(STEWARD_ENV));
    const written = await writePolicyFile(runDir, context, policy, {
      apprentice_models: ['haiku', 'sonnet'],
    });
    const parsed = JSON.parse(await readFile(written, 'utf8')) as Record<string, unknown>;
    expect(parsed.apprentice_models).toEqual(['haiku', 'sonnet']);
    // Without the adapter's own list, git's folder alone: no write tool of any tribe changes it (P1-49).
    expect(parsed.cli_protected_paths).toEqual(['.git/**']);
  });

  it('carries the read-only paths and the paths the CLI itself guards (P1-24), then git (P1-49)', async () => {
    const runDir = path.join(dir, '.runs', `${QUEST.id}-3`);
    const context = runContextOf(request(STEWARD_ENV));
    const written = await writePolicyFile(runDir, context, policy, { cli_protected_paths: ['.husky/**'] });
    const parsed = JSON.parse(await readFile(written, 'utf8')) as Record<string, unknown>;
    expect(parsed.cli_protected_paths).toEqual(['.husky/**', '.git/**']);
    const claude = await writePolicyFile(runDir, context, policy, {
      cli_protected_paths: ['.git/**', '.npmrc'],
    });
    const once = JSON.parse(await readFile(claude, 'utf8')) as Record<string, unknown>;
    expect(once.cli_protected_paths).toEqual(['.git/**', '.npmrc']);
    expect(parsed.laws).toMatchObject({
      read_only_paths: ['apps/api/openapi.json', 'packages/shared/src/api-types.ts'],
    });
  });

  it('names the patch file only when the territory has patch paths (P1-28)', async () => {
    const runDir = path.join(dir, '.runs', `${QUEST.id}-4`);
    const context = runContextOf(request(STEWARD_ENV));
    const read = async (file: string) => JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    const patched = await read(await writePolicyFile(runDir, context, policy));
    expect(patched).toMatchObject({ patch_file: 'elvaria.patch', laws: { patch_paths: ['.husky/**'] } });
    const none = { ...policy, laws: { ...policy.laws, patch_paths: [] } };
    expect(await read(await writePolicyFile(runDir, context, none))).not.toHaveProperty('patch_file');
  });
});
