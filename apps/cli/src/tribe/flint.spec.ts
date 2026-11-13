// PS-23 "xong khi": a fourth tribe needs only an adapter file, a look and the owner's account. flint, a made-up CLI
// with hooks of its own, passes the whole conformance suite (forbidden_command too, refused by Elvaria's real hook
// reading flint's payload through the neutral dialect), takes its summoned characters' starting levels from the
// models it declares, and goes round a quest of rank C; no file of packages/ or apps/ knows its name.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { openEventLog } from '@elvaria/eventlog';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { FAKE_FLINT, FLINT_ADAPTER, ensureHookBuilt, installFlint } from '../../test/flint.ts';
import { editKingdom } from '../../test/lantern.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

const TITLE = 'Rework the release pipeline';
/** A few Node starts per session and per hook call, one tick a second. */
const ROUND_MS = 120_000;
const POLL_MS = 100;
const REPO = path.join(import.meta.dirname, '..', '..', '..', '..');

beforeAll(() => {
  ensureHookBuilt();
}, 120_000);

describe('a fourth tribe from an adapter file alone', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const elvaria = async (io: TestIo, ...args: string[]) => {
    const code = await run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
    if (code !== 0) throw new Error(`elvaria ${args.join(' ')} → ${String(code)}: ${printed(io)}`);
    return io;
  };
  const addFlint = async () => {
    await installFlint(kingdom);
    const added = await elvaria(testIo(), 'tribe', 'add', 'flint', '--adapter', FLINT_ADAPTER);
    await run(testIo(), 'doctor', '--tool', `flint=${FAKE_FLINT}`, '--kingdom', kingdom);
    return added;
  };

  it(
    'says the look it draws when added, and passes every check of the suite',
    { timeout: 120_000 },
    async () => {
      const added = await addFlint();
      expect(added.printed.out[1]).toMatch(/^Look: .+ \(\w+, \w+\), drawn from the theme for flint;/);
      const io = await elvaria(testIo(), 'tribe', 'check', 'flint', '--scenarios');
      expect(io.printed.out.filter((line) => /^[✓✗–] /.test(line))).toEqual([
        '✓ capabilities',
        '✓ doctor',
        '✓ probe',
        '✓ submit',
        '✓ crash',
        '✓ hang',
        '✓ rate_limit',
        '✓ forbidden_command',
        '✓ spawn_child',
        '✓ scratch_commit',
        '✓ ask',
      ]);
      expect(io.printed.out).toContain('It takes quests of rank F to S.');
    },
  );

  it('takes only the models flint declares, at the level it gives them', { timeout: 60_000 }, async () => {
    await addFlint();
    const summon = (id: string, model: string, ...more: string[]) =>
      run(
        testIo(),
        'character',
        'add',
        id,
        '--class',
        'knight',
        '--tribe',
        'flint',
        '--model',
        model,
        ...more,
        '--kingdom',
        kingdom,
        '--locale',
        'en',
      );
    const io = testIo();
    expect(
      await run(
        io,
        'character',
        'add',
        'ash',
        '--class',
        'knight',
        '--tribe',
        'flint',
        '--model',
        'gemini-4-argon',
        '--kingdom',
        kingdom,
        '--locale',
        'en',
      ),
    ).toBe(1);
    expect(printed(io)).toContain(
      'The adapter of tribe flint serves no model «gemini-4-argon»: it names swift, swift-max, breeze, auto',
    );
    expect(await summon('wren', 'swift-high')).toBe(0);
    expect(await summon('vane', 'auto')).toBe(0);
    const characters = (await openKingdom(kingdom).characters.list()).items;
    expect(characters.map(({ id, level }) => [id, level])).toEqual(
      expect.arrayContaining([
        ['wren', 4],
        ['vane', 1],
      ]),
    );
  });

  it(
    'goes round a quest of rank C, the hook writing what the CLI did',
    { timeout: ROUND_MS + 30_000 },
    async () => {
      await addFlint();
      await elvaria(testIo(), 'tribe', 'disable', 'claude');
      await elvaria(testIo(), 'tribe', 'disable', 'gemini');
      await elvaria(testIo(), 'tribe', 'check', 'flint', '--scenarios');
      const summon = (id: string, cls: string, model: string) =>
        elvaria(testIo(), 'character', 'add', id, '--class', cls, '--tribe', 'flint', '--model', model);
      // Level 4 from the declared model: rank C as a matter of course. The judge is the same maker on another model.
      await summon('wren', 'knight', 'swift');
      await summon('gale', 'judge', 'swift-max');
      const folder = path.join(dir.root, 'release');
      await mkdir(folder);
      await elvaria(testIo(), 'territory', 'add', folder);
      await elvaria(
        testIo(),
        'quest',
        'add',
        '--title',
        TITLE,
        '--description',
        TITLE,
        '--territory',
        'release',
        '--kind',
        'build',
        '--rank',
        'C',
        '--class',
        'knight',
      );
      await editKingdom(kingdom, (value) => ({
        ...value,
        dispatch: { ...(value.dispatch as object), tick_seconds: 1 },
      }));
      const quest = async () =>
        (await openKingdom(kingdom).quests.list()).items.find(({ title }) => title === TITLE);
      const untilDone = async () => {
        const deadline = Date.now() + ROUND_MS;
        let sealed = false;
        while (Date.now() < deadline) {
          const current = await quest();
          if (current?.status === 'done') return;
          if (current?.status === 'awaiting_seal' && !sealed) {
            await elvaria(testIo(), 'seal', current.id);
            sealed = true;
          }
          await sleep(POLL_MS);
        }
      };
      const io = testIo({ untilStopped: untilDone });
      expect(await run(io, 'run', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
      const done = await quest();
      expect(done).toMatchObject({ status: 'done', assignee: 'wren', verifier: 'gale' });
      expect(done?.attempt_log.map(({ role, outcome }) => [role, outcome])).toEqual([
        ['assignee', 'submitted'],
        ['verifier', 'submitted'],
      ]);
      // flint has events: the hook wrote the starts and the letter's save from flint's own payload, the adapter the ends.
      const log = await openEventLog(kingdom).read();
      expect(log.issues).toEqual([]);
      const types = log.events.map(({ type }) => type).filter((type) => type.startsWith('agent.'));
      expect(types.filter((type) => type === 'agent.session.start')).toHaveLength(2);
      expect(types.filter((type) => type === 'agent.session.end')).toHaveLength(2);
      expect(types).toContain('agent.tool');
    },
  );
});

describe('the code of Elvaria', () => {
  /** Every source file of packages/ and apps/ that runs: not a spec, a fixture, a test helper or a build. */
  const sources = (): string[] =>
    ['packages', 'apps'].flatMap((top) =>
      readdirSync(path.join(REPO, top))
        .map((name) => path.join(top, name, 'src'))
        .filter((src) => existsSync(path.join(REPO, src)))
        .flatMap((src) =>
          readdirSync(path.join(REPO, src), { recursive: true, encoding: 'utf8' }).map((file) =>
            path.join(src, file),
          ),
        )
        .filter((file) => /\.(ts|mjs|json|md)$/.test(file) && !/\.spec\.ts$|__fixtures__/.test(file)),
    );

  it('names no fourth tribe: flint lives in the specs and their fixtures only', () => {
    const naming = sources().filter((file) => /\bflint\b/i.test(readFileSync(path.join(REPO, file), 'utf8')));
    expect(naming).toEqual([]);
  });
});
