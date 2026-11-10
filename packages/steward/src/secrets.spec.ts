// The treasury in the Steward's hands (implementation-plan §3.9, ADR 0013): a quest asks only for what its territory
// allows, a session gets the minimal env, its context and exactly those secrets, and what a session leaves behind
// (the letter, the question, the verdict notes) loses their values before the kingdom keeps it.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ok } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BENCH_ENV,
  KINGDOM,
  NPM_TOKEN,
  RM_TEMP,
  bench,
  characterOf,
  questPayload,
  tickUntil,
  wakesAfter,
} from './__fixtures__/kingdom.ts';
import { maskFinished } from './sessions/secrets.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Context } from './context.ts';
import type { Running } from './sessions/running.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { AgentRunner, FakeRunner, RunResult } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(
  options: BenchOptions = {},
  overrides: (kingdom: Bench) => Partial<StewardDeps> = () => ({}),
) {
  current = await bench(options);
  running = current.steward(overrides(current));
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const NEEDS_TOKEN = { secrets_required: ['npm_token'] };

const rejections = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events
    .filter(({ type }) => type === 'command.rejected')
    .map(({ data }) => (data as { reason?: string }).reason);

const everything = async (kingdom: Bench) =>
  JSON.stringify([(await openEventLog(kingdom.root).read()).events, await kingdom.quests()]);

describe('a quest that asks for secrets', () => {
  it('is refused when its territory does not allow one of them', async () => {
    const { kingdom, steward } = await open({ cast: [] });
    await kingdom.command(
      'create_quest',
      questPayload('Deploy', { secrets_required: ['npm_token', 'aws_key'] }),
    );
    await kingdom.command('create_quest', questPayload('Docs', { territory: 'handbook', ...NEEDS_TOKEN }));
    await kingdom.command('create_quest', questPayload('Publish', NEEDS_TOKEN));
    await steward.tick();
    expect(await rejections(kingdom)).toEqual(['secret_not_allowed', 'secret_not_allowed']);
    expect((await kingdom.quests()).map(({ title, secrets_required }) => [title, secrets_required])).toEqual([
      ['Publish', ['npm_token']],
    ]);
  });

  it('gives each session the minimal env, its context and exactly its secrets (env snapshot)', async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Publish', NEEDS_TOKEN));
    await kingdom.command('create_quest', questPayload('Refactor'));
    await tickUntil(steward, kingdom.clock, async () =>
      (await kingdom.quests()).every(({ status }) => status === 'done'),
    );
    const publish = await kingdom.quest('Publish');
    const [assignee, verifier] = kingdom.requests.filter(({ quest }) => quest?.id === publish.id);
    expect(assignee?.env).toEqual({
      ...BENCH_ENV,
      ELVARIA_KINGDOM: kingdom.root,
      ELVARIA_QUEST: publish.id,
      ELVARIA_ATTEMPT: '1',
      ELVARIA_CHARACTER: assignee?.character.id,
      ELVARIA_ROLE: 'assignee',
      ELVARIA_TRIBE: 'claude',
      ELVARIA_MODEL: assignee?.character.model,
      ELVARIA_TZ: KINGDOM.tz,
      NPM_TOKEN,
    });
    // The verifier runs the same checks, so it gets the same secrets; a quest that asked for none gets none.
    expect(verifier?.env).toMatchObject({ ELVARIA_ROLE: 'verifier', NPM_TOKEN });
    const refactor = kingdom.requests.filter(({ quest }) => quest?.title === 'Refactor');
    expect(
      refactor.map(({ env }) => Object.keys(env).filter((name) => !name.startsWith('ELVARIA_'))),
    ).toEqual([
      ['PATH', 'HOME'],
      ['PATH', 'HOME'],
    ]);
  });

  it('opens no session when the treasury lacks one of them: the quest waits in the infirmary (P1-06)', async () => {
    const { kingdom, steward } = await open({ treasury: {} });
    await kingdom.command('create_quest', questPayload('Publish', NEEDS_TOKEN));
    await steward.tick();
    await steward.tick();
    expect(kingdom.requests).toEqual([]);
    const quest = await kingdom.quest('Publish');
    expect(quest).toMatchObject({ status: 'infirmary', attempts: 0, attempt_log: [] });
    // Once, with its own reason: not claimed and released again every tick.
    const why = 'the treasury has no npm_token';
    const said = { reason: `breaker:secrets: ${why}`, trip: 'secrets', detail: { message: why } };
    const publish = { id: quest.id, title: 'Publish', rank: 'D' };
    expect(kingdom.notices).toEqual([{ kind: 'infirmary', quest: publish, ...said }]);
    expect(kingdom.warnings).toEqual([]);
  });

  it('opens no session when its territory has dropped one of them since the quest was made', async () => {
    const { kingdom, steward } = await open({ cast: [] });
    await kingdom.command('create_quest', questPayload('Publish', NEEDS_TOKEN));
    await steward.tick();
    const dropped = await kingdom.store.territories.update('dc1-se-team' as never, (territory) =>
      ok({ ...territory, secrets_allowed: [] }),
    );
    expect(dropped.ok).toBe(true);
    await kingdom.store.characters.write(characterOf({ id: 'thorn', cls: 'knight', level: 5 }));
    await steward.tick();
    expect(kingdom.requests).toEqual([]);
    expect((await kingdom.quest('Publish')).status).toBe('infirmary');
    expect(kingdom.notices.at(-1)).toMatchObject({
      reason: 'breaker:secrets: territory dc1-se-team does not allow the secrets npm_token',
    });
  });

  it('sends the quest to the infirmary when its secret leaves the treasury before the judge can open', async () => {
    const values: Record<string, string> = { npm_token: NPM_TOKEN };
    const { kingdom, steward } = await open({ treasury: values });
    await kingdom.command('create_quest', questPayload('Publish', NEEDS_TOKEN));
    await steward.tick();
    // The assignee's session has its secret; the owner empties the treasury while it works.
    delete values.npm_token;
    // The checks run first (P1-25); the judge that would come next cannot get the secret.
    await tickUntil(
      steward,
      kingdom.clock,
      async () => !['working', 'review'].includes((await kingdom.quest('Publish')).status),
    );
    const quest = await kingdom.quest('Publish');
    expect(quest).toMatchObject({ status: 'infirmary', verifier: null });
    expect(kingdom.requests.map(({ role }) => role)).toEqual(['assignee']);
    expect(kingdom.notices.at(-1)).toMatchObject({
      reason: 'breaker:secrets: the treasury has no npm_token',
    });
  });

  it('lets the sleeper go of a paused quest that cannot wake for want of its secret', async () => {
    const values: Record<string, string> = { npm_token: NPM_TOKEN };
    const { kingdom, steward } = await open({
      treasury: values,
      plays: { work: { Publish: ['rate_limit'] } },
      probes: { claude: wakesAfter(1) },
    });
    await kingdom.command('create_quest', questPayload('Publish', NEEDS_TOKEN));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Publish')).status === 'paused_mana',
    );
    const sleeper = (await kingdom.quest('Publish')).assignee ?? '';
    delete values.npm_token;
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Publish')).status === 'infirmary',
    );
    expect(kingdom.notices.at(-1)).toMatchObject({
      reason: 'breaker:secrets: the treasury has no npm_token',
    });
    await steward.tick();
    expect(await kingdom.character(sleeper)).toMatchObject({ status: 'idle', current: null });
  });

  it("refuses the owner's answer to a blocked quest whose secret is gone, saying why", async () => {
    const values: Record<string, string> = { npm_token: NPM_TOKEN };
    const { kingdom, steward } = await open({ treasury: values, plays: { work: { Publish: ['ask'] } } });
    await kingdom.command('create_quest', questPayload('Publish', NEEDS_TOKEN));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Publish')).status === 'blocked',
    );
    delete values.npm_token;
    await kingdom.command('answer', {
      quest: (await kingdom.quest('Publish')).id,
      answer: 'Use the staging registry.',
    });
    await steward.tick();
    expect(await rejections(kingdom)).toEqual(['secrets_lacking: the treasury has no npm_token']);
    expect((await kingdom.quest('Publish')).status).toBe('blocked');
  });
});

describe('maskFinished', () => {
  it('masks the patterns of a session it was told nothing of, and warns when the letter cannot be read', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'elvaria mask '));
    try {
      const quest = 'q_20261107_aaaaaa' as Running['quest'];
      // A folder where the letter should be: reading it fails, and the end is recorded all the same.
      await mkdir(path.join(root, 'quests', quest, 'handover.md'), { recursive: true });
      const warnings: string[] = [];
      const ctx = { root, deps: { log: { warn: (line: string) => void warnings.push(line) } } };
      const shaped = ['gh', 'p_', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('');
      const running = {
        quest,
        role: 'assignee',
        n: 1,
        character: 'thorn',
        session: {},
        session_id: 's',
      } as unknown as Running;
      const result = { outcome: 'completed', question: `Use ${shaped}?` } as unknown as RunResult;
      const masked = await maskFinished(ctx as unknown as Context, { running, result });
      expect(masked.result.question).toBe('Use [redacted]?');
      expect(warnings).toEqual([
        expect.stringMatching(/^steward: q_20261107_aaaaaa: the handover letter was not masked/),
      ]);
    } finally {
      await rm(root, RM_TEMP);
    }
  });
});

/** A fake whose assignee copies the token into its letter and its question, as a careless character might. */
function careless(fake: FakeRunner): AgentRunner {
  return {
    ...fake,
    spawn: async (req) => {
      const session = await fake.spawn(req);
      if (req.role !== 'assignee' || req.handover === undefined) return session;
      const letter = req.handover;
      const question = `May I print ${req.env.NPM_TOKEN ?? ''} in the log?`;
      return {
        ...session,
        wait: async () => {
          const result = await session.wait();
          await writeFile(letter, `## Where I am\n\nLogged in with ${req.env.NPM_TOKEN ?? ''}.\n`, 'utf8');
          return { ...result, question };
        },
      };
    },
  };
}

describe('what a session leaves behind', () => {
  it('loses the secret values: the letter, the question in the quest and its events', async () => {
    const { kingdom, steward } = await open({}, (made) => {
      const runners: Record<string, AgentRunner> = { claude: careless(made.fakes.claude) };
      return { runners };
    });
    await kingdom.command('create_quest', questPayload('Publish', NEEDS_TOKEN));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Publish')).status === 'blocked',
    );
    const quest = await kingdom.quest('Publish');
    expect(quest.blocked?.question).toBe('May I print [redacted] in the log?');
    const letter = await readFile(path.join(kingdom.root, 'quests', quest.id, 'handover.md'), 'utf8');
    expect(letter).toBe('## Where I am\n\nLogged in with [redacted].\n');
    expect(await everything(kingdom)).not.toContain(NPM_TOKEN);
  });

  it('loses the secret values in the verdict notes the next prompt reads', async () => {
    const notes = `The test prints ${NPM_TOKEN} into its snapshot; remove it from there.`;
    const { kingdom, steward } = await open({
      plays: { verdicts: { Publish: [{ result: 'fail', fail_kind: 'tests_fail', notes }] } },
    });
    await kingdom.command('create_quest', questPayload('Publish', NEEDS_TOKEN));
    await tickUntil(steward, kingdom.clock, async () => (await kingdom.quest('Publish')).attempts >= 2);
    const quest = await kingdom.quest('Publish');
    const verdict = await kingdom.store.verdicts.read(`${quest.id}-1` as never);
    expect(verdict).toMatchObject({
      ok: true,
      value: { notes: 'The test prints [redacted] into its snapshot; remove it from there.' },
    });
    // The returned assignee's prompt reads the masked verdict.
    const again = kingdom.requests.filter(({ role }) => role === 'assignee').at(-1);
    expect(again?.prompt.user).toContain('The test prints [redacted] into its snapshot');
    expect(again?.prompt.user).not.toContain(NPM_TOKEN);
  });
});
