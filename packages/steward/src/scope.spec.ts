// Quests with scopes on the Steward's bench (implementation-plan §3.16.5, ADR 0028, PS-05): two quests whose scopes are
// apart work at once on a code territory, a held scope keeps a meeting one waiting, and a submit names the files its
// work changed outside the scope, on its line and in its judge's prompt.
import { isEventOf } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, settled, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
import { folderPlots } from './plots.ts';
import { outOfScopeIn, outOfScopeOf } from './sessions/out-of-scope.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Context } from './context.ts';
import type { Steward } from './types.ts';
import type { Quest } from '@elvaria/domain';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const CAST = [
  { id: 'kael', cls: 'knight' },
  { id: 'thorn', cls: 'knight' },
  { id: 'sable', cls: 'judge', model: 'claude-opus-5-5', level: 6 },
] as const;

const startedBy = (kingdom: Bench): string[] =>
  kingdom.requests.filter(({ role }) => role === 'assignee').map(({ quest }) => quest?.title ?? '');

describe('the Steward and quests with scopes (PS-05)', () => {
  it('works two quests whose scopes are apart at once on a code territory of max_concurrent 2', async () => {
    current = await bench({ cast: CAST, room: { code: 2, docs: 1 }, plays: { work: { Api: ['hang'] } } });
    running = current.steward();
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await current.command('create_quest', questPayload('Api', { scope_paths: ['apps/api/**'] }));
    await current.command('create_quest', questPayload('Web', { scope_paths: ['apps/web/**'] }));
    await running.tick();
    expect(startedBy(current).sort()).toEqual(['Api', 'Web']);
  });

  it('keeps a quest whose scope meets a held one open, done and waiting for the merge included', async () => {
    current = await bench({ cast: CAST, room: { code: 2, docs: 1 } });
    running = current.steward();
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await current.command('create_quest', questPayload('First', { scope_paths: ['apps/**'] }));
    await tickUntil(running, current.clock, statusIs(current, 'First', 'done'));
    await current.command('create_quest', questPayload('Second', { scope_paths: ['apps/api/**'] }));
    await running.tick();
    await settled(running);
    await running.tick();
    expect(startedBy(current)).toEqual(['First']);
    expect((await current.quest('Second')).status).toBe('open');
  });

  it('names the files changed outside the scope on the submit line and in the judge prompt', async () => {
    current = await bench({ cast: CAST });
    const touched = ['apps/api/src/a.ts', 'README.md', 'docs/notes.md'];
    running = current.steward({
      plots: { ...folderPlots(current.root), touched: () => Promise.resolve(touched) },
    });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await current.command('create_quest', questPayload('Scoped', { scope_paths: ['apps/api/**'] }));
    await tickUntil(running, current.clock, statusIs(current, 'Scoped', 'done'));
    const { events } = await openEventLog(current.root).read();
    const submitted = events.find((event) => isEventOf(event, 'quest.submitted'));
    expect(submitted?.data.out_of_scope).toEqual(['README.md', 'docs/notes.md']);
    const judge = current.requests.find(({ role }) => role === 'verifier');
    expect(judge?.prompt.user).toContain('# Files changed outside the scope');
    expect(judge?.prompt.user).toContain('- `README.md`\n- `docs/notes.md`');
  });
});

describe('outOfScopeOf', () => {
  const quest = { scope_paths: ['apps/api/**', 'docs/api.md', 'scripts'] };

  it('leaves out what the scope covers: a glob, a file, a folder named without a wildcard', () => {
    const changed = [
      'apps/api/x.ts',
      'docs/api.md',
      'scripts/a.mjs',
      'Scripts/B.mjs',
      'scriptsx/c',
      'README.md',
    ];
    expect(outOfScopeOf(changed, quest, undefined)).toEqual(['scriptsx/c', 'README.md']);
  });

  it("leaves out the territory's shared paths, and finds nothing outside a quest without a scope", () => {
    const shared = { shared_paths: [{ glob: 'docs/schemas/**', merge: 'union' as const }] };
    expect(outOfScopeOf(['docs/schemas/a.json', 'b.ts'], quest, shared)).toEqual(['b.ts']);
    expect(outOfScopeOf(['b.ts'], {}, shared)).toEqual([]);
  });

  it('asks git nothing without a scope, and says when git cannot tell', async () => {
    const warnings: string[] = [];
    const ctx = (touched: () => Promise<readonly string[]>) =>
      ({
        deps: { plots: { touched }, log: { warn: (message: string) => warnings.push(message) } },
        world: { territories: new Map() },
      }) as unknown as Context;
    const scoped = { id: 'q_20261107_aaaaaa', territory: 'dc1-se-team', ...quest } as unknown as Quest;
    const never = () => Promise.reject(new Error('never asked'));
    expect(await outOfScopeIn(ctx(never), { ...scoped, scope_paths: undefined })).toEqual([]);
    expect(
      await outOfScopeIn(
        ctx(() => Promise.reject(new Error('git gone'))),
        scoped,
      ),
    ).toEqual([]);
    expect(warnings).toEqual([
      'steward: q_20261107_aaaaaa: the files changed outside its scope are unknown: git gone',
    ]);
    expect(
      await outOfScopeIn(
        ctx(() => Promise.resolve(['x'])),
        scoped,
      ),
    ).toEqual(['x']);
  });
});
