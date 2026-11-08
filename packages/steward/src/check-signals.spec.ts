// The checks of a submitted run after P1-10b (implementation-plan §3.2, §3.9): they get the quest's secrets as its
// sessions do, they tell the owner and the world when they start and end, a quest whose secrets are gone by then
// goes to the infirmary, an assignee whose work came back reads the end of the red check's log, masked, and the loop
// ticks as soon as they end instead of at its next beat.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import { inKingdom } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { NPM_TOKEN, bench, memoryTreasury, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { plotsWith, questOfRun, statusIs, unitFails } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { PlotCheck, Steward, StewardDeps } from './types.ts';
import type { CheckRun } from '@elvaria/runner-core';

const ERROR_LINE = 'AssertionError: expected 120 to be 108';
const NEEDS_TOKEN = { secrets_required: ['npm_token'] };

/** What the plots were asked to check, and how each check ends: green, red, or when the spec (or an abort) says. */
interface Checks {
  readonly calls: PlotCheck[];
  readonly check: (request: PlotCheck) => Promise<readonly CheckRun[]>;
  /** Ends the checks held by `held`. */
  release(): void;
}

function checksThat(root: string, ending: 'pass' | 'fail' | 'held'): Checks {
  const calls: PlotCheck[] = [];
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const red = async (request: PlotCheck): Promise<readonly CheckRun[]> => {
    const failed = unitFails(questOfRun(request.run_dir));
    const log = inKingdom(root, failed.log_path);
    await mkdir(path.dirname(log), { recursive: true });
    // A careless install printed the registry token: the fake's log is not masked, the prompt must be.
    const lines = ['$ pnpm test', ' FAIL  src/api/orders.spec.ts > total', ERROR_LINE, `token ${NPM_TOKEN}`];
    await writeFile(log, `${lines.join('\n')}\n`);
    return [failed];
  };
  const check = async (request: PlotCheck): Promise<readonly CheckRun[]> => {
    calls.push(request);
    if (ending === 'pass') return [];
    if (ending === 'fail') return red(request);
    await new Promise<void>((resolve, reject) => {
      const killed = (): void => {
        reject(new Error('killed'));
      };
      request.signal?.addEventListener('abort', killed, { once: true });
      void gate.then(resolve);
    });
    return [];
  };
  return {
    calls,
    check,
    release: () => {
      release();
    },
  };
}

let current: Bench | undefined;
let running: Steward | undefined;

async function open(
  checks: (root: string) => Checks,
  options: { readonly loop?: boolean; readonly deps?: Partial<StewardDeps> } = {},
) {
  current = await bench();
  const made = checks(current.root);
  running = current.steward({ plots: plotsWith(current.root, { check: made.check }), ...options.deps });
  expect(await running.start({ loop: options.loop ?? false })).toEqual({ ok: true });
  return { kingdom: current, steward: running, checks: made };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const checkLines = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events.filter(({ type }) => type.startsWith('check.'));

describe('the checks of a submitted run (P1-10b)', () => {
  it("get exactly the quest's secrets, and a quest that asks for none gives its checks none", async () => {
    const { kingdom, steward, checks } = await open((root) => checksThat(root, 'pass'));
    await kingdom.command('create_quest', questPayload('Private registry', NEEDS_TOKEN));
    await kingdom.command('create_quest', questPayload('Public only'));
    await tickUntil(steward, kingdom.clock, () => Promise.resolve(checks.calls.length === 2));
    const secret = await kingdom.quest('Private registry');
    const plain = await kingdom.quest('Public only');
    const callOf = (id: string) => checks.calls.find(({ run_dir }) => run_dir === `.runs/${id}-1`);
    expect(callOf(secret.id)?.secrets).toEqual({ npm_token: NPM_TOKEN });
    expect(callOf(plain.id)).not.toHaveProperty('secrets');
  });

  it('tell the owner and the world when they start and how they end', async () => {
    const { kingdom, steward } = await open((root) => checksThat(root, 'fail'));
    await kingdom.command('create_quest', questPayload('Red check'));
    await tickUntil(steward, kingdom.clock, async () => (await checkLines(kingdom)).length === 2);
    const quest = await kingdom.quest('Red check');
    const envelope = { quest: quest.id, territory: 'dc1-se-team', attempt: 1, actor: { kind: 'steward' } };
    expect(await checkLines(kingdom)).toEqual([
      expect.objectContaining({ type: 'check.start', ...envelope, data: {} }),
      expect.objectContaining({
        type: 'check.end',
        ...envelope,
        data: { outcome: 'fail', checks: [{ id: 'unit', pass: false, duration_ms: 900 }] },
      }),
    ]);
  });

  it('say they were stopped when the Steward stops under them', async () => {
    const { kingdom, steward, checks } = await open((root) => checksThat(root, 'held'));
    await kingdom.command('create_quest', questPayload('Stopped check'));
    await tickUntil(steward, kingdom.clock, () => Promise.resolve(checks.calls.length === 1));
    await steward.stop();
    running = undefined;
    const lines = await checkLines(kingdom);
    expect(lines.map(({ type, data }) => [type, data])).toEqual([
      ['check.start', {}],
      ['check.end', { outcome: 'stopped', checks: [] }],
    ]);
  });

  it('send the quest to the infirmary when its secrets are gone by then, and never run', async () => {
    // The treasury lists the token for the session's opening, and no longer for the checks.
    const lists = memoryTreasury({ npm_token: NPM_TOKEN });
    let reads = 0;
    const treasury = {
      ...lists,
      names: () => {
        reads += 1;
        return reads === 1 ? lists.names() : Promise.resolve([]);
      },
    };
    const { kingdom, steward, checks } = await open((root) => checksThat(root, 'pass'), {
      deps: { treasury },
    });
    await kingdom.command('create_quest', questPayload('Lost token', NEEDS_TOKEN));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Lost token', 'infirmary'));
    expect(checks.calls).toEqual([]);
    expect(kingdom.notices).toContainEqual(
      expect.objectContaining({
        kind: 'infirmary',
        reason: 'breaker:secrets: the treasury has no npm_token',
      }),
    );
  });

  it("show an assignee whose work came back the end of the red check's log, its secrets masked", async () => {
    const { kingdom, steward } = await open((root) => checksThat(root, 'fail'));
    await kingdom.command('create_quest', questPayload('Fix the total', NEEDS_TOKEN));
    const assignees = () => kingdom.requests.filter(({ role }) => role === 'assignee');
    await tickUntil(steward, kingdom.clock, () => Promise.resolve(assignees().length === 2));
    const user = assignees()[1]?.prompt.user ?? '';
    expect(user).toContain('# The quest came back');
    expect(user).toContain('## Machine checks that failed');
    expect(user).toContain('### The end of the log of unit');
    expect(user).toContain(ERROR_LINE);
    expect(user).toContain('token [redacted]');
    expect(user).not.toContain(NPM_TOKEN);
    // The first session read no such section: nothing had come back yet.
    expect(assignees()[0]?.prompt.user).not.toContain('Machine checks that failed');
  });
});

describe('the loop (P1-10b)', () => {
  it('ticks as soon as the checks end, not a beat later', async () => {
    current = await bench();
    const kingdom = await current.store.kingdom.read();
    if (!kingdom.ok) throw new Error('fixture: kingdom');
    const beat = 3;
    await current.store.kingdom.write({
      ...kingdom.value,
      dispatch: { ...kingdom.value.dispatch, tick_seconds: beat },
    });
    const checks = checksThat(current.root, 'held');
    running = current.steward({ plots: plotsWith(current.root, { check: checks.check }) });
    expect(await running.start()).toEqual({ ok: true });
    await current.command('create_quest', questPayload('Judged at once'));
    const looped = current;
    const until = async (done: () => Promise<boolean>, ms: number) => {
      for (const end = Date.now() + ms; Date.now() < end;) {
        if (await done()) return true;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return false;
    };
    // The second beat finds the session's end and starts the checks.
    expect(await until(() => Promise.resolve(checks.calls.length === 1), 4 * beat * 1000)).toBe(true);
    const ended = Date.now();
    checks.release();
    const judged = async () => typeof (await looped.quest('Judged at once')).verifier === 'string';
    expect(await until(judged, beat * 1000)).toBe(true);
    // A beat after the tick that started the checks would be about `beat` seconds away.
    expect(Date.now() - ended).toBeLessThan((beat * 1000) / 2);
  }, 30_000);
});
