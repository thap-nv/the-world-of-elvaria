// Checks outside the tick (P1-25, implementation-plan §3.1, §3.2; phase-1 report §5.5): a check of minutes holds no
// tick, a Steward that stops kills it and the next one runs it again, a quest that moves on loses it, and the judge
// reads the end of a failing check's log in its prompt, its secrets masked.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { inKingdom } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { NPM_TOKEN, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { plotsWith, questOfRun, statusIs, unitFails } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { PlotCheck, Steward } from './types.ts';
import type { CheckRun } from '@elvaria/runner-core';

/** A token of a shape the patterns know, built so no scanner takes the spec for a leak. */
const GITHUB_TOKEN = ['ghp', '_', 'Q'.repeat(36)].join('');
const ERROR_LINE = 'AssertionError: expected 120 to be 108';

/** A check of five minutes: it ends when the spec ends it, or dies when nobody waits for it any more. */
interface SlowChecks {
  readonly check: (request: PlotCheck) => Promise<readonly CheckRun[]>;
  readonly calls: PlotCheck[];
  end(): void;
}

function slowChecks(root: string): SlowChecks {
  const calls: PlotCheck[] = [];
  let ended = (): void => undefined;
  const over = new Promise<void>((resolve) => {
    ended = resolve;
  });
  const check = (request: PlotCheck): Promise<readonly CheckRun[]> => {
    calls.push(request);
    return new Promise((resolve, reject) => {
      request.signal?.addEventListener(
        'abort',
        () => {
          reject(new Error('killed'));
        },
        { once: true },
      );
      void over.then(async () => {
        const failed = unitFails(questOfRun(request.run_dir));
        const log = inKingdom(root, failed.log_path);
        await mkdir(path.dirname(log), { recursive: true });
        // What a check prints when it fails, a careless line with secrets among it, and enough lines to cut.
        const before = Array.from({ length: 60 }, (_, index) => `ok ${index} src/api/part-${index}.spec.ts`);
        const end = [
          ' FAIL  src/api/orders.spec.ts > total',
          ERROR_LINE,
          `npm token ${NPM_TOKEN}, gh ${GITHUB_TOKEN}`,
        ];
        await writeFile(log, `$ pnpm test\r\n${[...before, ...end].join('\r\n')}\r\n`);
        resolve([failed]);
      });
    });
  };
  return {
    check,
    calls,
    end: () => {
      ended();
    },
  };
}

let current: Bench | undefined;
const stewards: Steward[] = [];

async function open(): Promise<{ kingdom: Bench; slow: SlowChecks; steward: () => Promise<Steward> }> {
  const kingdom = await bench();
  current = kingdom;
  const slow = slowChecks(kingdom.root);
  const steward = async () => {
    const made = kingdom.steward({ plots: plotsWith(kingdom.root, { check: slow.check }) });
    expect(await made.start({ loop: false })).toEqual({ ok: true });
    stewards.push(made);
    return made;
  };
  return { kingdom, slow, steward };
}

afterEach(async () => {
  for (const steward of stewards.splice(0)) await steward.stop();
  await current?.remove();
  current = undefined;
});

/** The quest submitted, its checks running outside the tick. */
async function inCheck(kingdom: Bench, steward: Steward, slow: SlowChecks, title: string) {
  await kingdom.command('create_quest', questPayload(title, { secrets_required: ['npm_token'] }));
  await tickUntil(steward, kingdom.clock, statusIs(kingdom, title, 'review'));
  await tickUntil(steward, kingdom.clock, () => Promise.resolve(slow.calls.length === 1));
  return kingdom.quest(title);
}

describe('checks outside the tick (P1-25)', () => {
  it('holds no tick while a check of five minutes runs: the inbox is applied meanwhile', async () => {
    const { kingdom, slow, steward } = await open();
    const stewardA = await steward();
    const quest = await inCheck(kingdom, stewardA, slow, 'Long check');
    await kingdom.command('set_rank', { quest: quest.id, rank: 'C' });
    await kingdom.command('create_quest', questPayload('Next one'));
    const before = Date.now();
    const report = await stewardA.tick();
    expect(Date.now() - before).toBeLessThan(10_000);
    expect(report.commands).toMatchObject({ applied: 2, rejected: 0 });
    expect(await kingdom.quest('Long check')).toMatchObject({ status: 'review', verifier: null, rank: 'C' });
    expect((await kingdom.quest('Next one')).status).toBe('working');
    // Still running: not started twice, and no judge yet.
    expect(slow.calls).toHaveLength(1);
    expect(kingdom.requests.filter(({ role }) => role === 'verifier')).toEqual([]);
    slow.end();
    await stewardA.idle();
    await stewardA.tick();
    expect((await kingdom.quest('Long check')).verifier).toEqual(expect.any(String));
  });

  it('kills the check when the Steward stops, and the next Steward runs it again', async () => {
    const { kingdom, slow, steward } = await open();
    const stewardA = await steward();
    await inCheck(kingdom, stewardA, slow, 'Stopped check');
    const before = Date.now();
    await stewardA.stop();
    expect(Date.now() - before).toBeLessThan(10_000);
    expect(slow.calls[0]?.signal?.aborted).toBe(true);
    const stewardB = await steward();
    await stewardB.tick();
    expect(slow.calls).toHaveLength(2);
    expect(slow.calls[1]?.signal?.aborted).toBe(false);
    slow.end();
    await stewardB.idle();
    await stewardB.tick();
    expect((await kingdom.quest('Stopped check')).verifier).toEqual(expect.any(String));
  });

  it('kills the check of a quest the owner cancels while it runs', async () => {
    const { kingdom, slow, steward } = await open();
    const stewardA = await steward();
    const quest = await inCheck(kingdom, stewardA, slow, 'Cancelled check');
    await kingdom.command('cancel', { quest: quest.id });
    await stewardA.tick();
    expect((await kingdom.quest('Cancelled check')).status).toBe('archived');
    expect(slow.calls[0]?.signal?.aborted).toBe(true);
  });

  it("shows the judge the end of a failing check's log, its secrets masked", async () => {
    const { kingdom, slow, steward } = await open();
    const stewardA = await steward();
    await inCheck(kingdom, stewardA, slow, 'Red check');
    slow.end();
    await stewardA.idle();
    await stewardA.tick();
    const judge = kingdom.requests.find(({ role }) => role === 'verifier');
    const user = judge?.prompt.user ?? '';
    expect(user).toContain('## The end of the log of unit');
    expect(user).toContain(ERROR_LINE);
    // The quest's own treasury value and a token the patterns know: neither reaches the model.
    expect(user).toContain('npm token [redacted], gh [redacted]');
    expect(user).not.toContain(NPM_TOKEN);
    expect(user).not.toContain(GITHUB_TOKEN);
    // The last lines only: the start of a long log stays in the file.
    expect(user).not.toContain('$ pnpm test');
    expect(user).not.toContain('\r');
  });
});
