// The treasury in the Steward's hands (implementation-plan §3.9, ADR 0013): a quest asks only for what its territory
// allows, a session gets the minimal env, its context and exactly those secrets, and what a session leaves behind
// (the letter, the question, the verdict notes) loses their values before the kingdom keeps it.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { BENCH_ENV, KINGDOM, NPM_TOKEN, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { AgentRunner, FakeRunner } from '@elvaria/runner-core';

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

  it('opens no session when the treasury lacks one of them', async () => {
    const { kingdom, steward } = await open({ treasury: {} });
    await kingdom.command('create_quest', questPayload('Publish', NEEDS_TOKEN));
    await steward.tick();
    await steward.tick();
    expect(kingdom.requests).toEqual([]);
    expect(kingdom.warnings.join('\n')).toMatch(/no session for \w+: treasury has no npm_token/);
    expect((await kingdom.quest('Publish')).status).toBe('open');
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
