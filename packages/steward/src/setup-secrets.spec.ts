// The plot of a quest that asks for secrets (P1-30, implementation-plan §3.3, §3.9): its territory's
// `commands.setup` gets the quest's secrets as its checks do (P1-10b), read from the treasury before the plot is
// prepared, so an install from a private registry no longer fails before the first session. A quest that asks for
// none gives setup none and reads no treasury.
import { afterEach, describe, expect, it } from 'vitest';

import { NPM_TOKEN, bench, memoryTreasury, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { plotsWith, statusIs } from './__fixtures__/review.ts';
import { ENV, LINKS, withCatalog } from './__fixtures__/scripts.ts';
import { folderPlots } from './plots.ts';
import { nodeScriptRunner } from './script/run-script.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { ScriptRunner } from './script/run-script.ts';
import type { Plots, Steward, StewardDeps } from './types.ts';
import type { Treasury } from '@elvaria/runner-core';

const NEEDS_TOKEN = { secrets_required: ['npm_token'] };

/** What Plots.prepare was handed: the quest and the secrets for its setup. */
interface Prepared {
  readonly quest: string;
  readonly secrets: Readonly<Record<string, string>> | undefined;
}

/** A treasury holding the token, counting every read of it. */
function countedTreasury(resolve?: Treasury['resolve']) {
  const held = memoryTreasury({ npm_token: NPM_TOKEN });
  const reads: string[] = [];
  const treasury: Treasury = {
    names: () => {
      reads.push('names');
      return held.names();
    },
    resolve: (names) => {
      reads.push('resolve');
      return (resolve ?? held.resolve)(names);
    },
  };
  return { treasury, reads };
}

let current: Bench | undefined;
let running: Steward | undefined;

async function open(
  deps: (root: string, prepared: Prepared[]) => Partial<StewardDeps>,
  options: BenchOptions = {},
) {
  current = await bench(options);
  const prepared: Prepared[] = [];
  running = current.steward(deps(current.root, prepared));
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running, prepared };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** folderPlots whose prepare keeps what it was handed. */
const keeping = (root: string, prepared: Prepared[]): Plots =>
  plotsWith(root, {
    prepare: (quest, territory, options) => {
      prepared.push({ quest: quest.id, secrets: options?.secrets });
      return folderPlots(root).prepare(quest, territory);
    },
  });

describe("the plot's setup (P1-30)", () => {
  it("gets exactly the quest's secrets, and none without reading the treasury when it asks for none", async () => {
    const counted = countedTreasury();
    const { kingdom, steward, prepared } = await open((root, kept) => ({
      plots: keeping(root, kept),
      treasury: counted.treasury,
    }));
    await kingdom.command('create_quest', questPayload('Public only'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Public only', 'done'));
    const plain = await kingdom.quest('Public only');
    // The assignee's plot and the judge's (the same one, prepared again): neither got a secret.
    expect(prepared).toEqual([
      { quest: plain.id, secrets: undefined },
      { quest: plain.id, secrets: undefined },
    ]);
    expect(counted.reads).toEqual([]);

    await kingdom.command('create_quest', questPayload('Private registry', NEEDS_TOKEN));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Private registry', 'done'));
    const secret = await kingdom.quest('Private registry');
    const forSecret = prepared.filter(({ quest }) => quest === secret.id);
    expect(forSecret).toEqual([
      { quest: secret.id, secrets: { npm_token: NPM_TOKEN } },
      { quest: secret.id, secrets: { npm_token: NPM_TOKEN } },
    ]);
  });

  // fix/review-no-session: before, the claim went back and was taken again every tick, with a warning only.
  it('is never prepared when the treasury cannot give the values: the quest waits in the infirmary, saying why', async () => {
    // The treasury lists the token (so secretsLacking lets the quest through), and then cannot be read.
    const counted = countedTreasury(() => Promise.reject(new Error('the treasury file is locked')));
    const { kingdom, steward, prepared } = await open((root, kept) => ({
      plots: keeping(root, kept),
      treasury: counted.treasury,
    }));
    await kingdom.command('create_quest', questPayload('Private registry', NEEDS_TOKEN));
    await tickUntil(steward, kingdom.clock, () => Promise.resolve(counted.reads.includes('resolve')));
    expect(prepared).toEqual([]);
    expect(kingdom.requests).toEqual([]);
    expect(await kingdom.quest('Private registry')).toMatchObject({ status: 'infirmary' });
    expect(kingdom.warnings).toContainEqual(expect.stringContaining('the treasury file is locked'));
    expect(kingdom.notices).toEqual([
      expect.objectContaining({
        kind: 'infirmary',
        trip: 'no_session',
        reason: {
          code: 'breaker:no_session',
          params: { error: expect.stringContaining('the treasury file is locked') as unknown },
        },
      }),
    ]);
  });
});

// A script-tier quest on a territory whose setup needs a secret (P1-47, (a) of P1-30): its plot gets the quest's
// secrets after secretsLacking, as a session's plot does; the script itself still gets none (ADR 0017).
describe("a script-tier quest's plot", () => {
  const linksWithToken = (title: string) =>
    questPayload(title, {
      kind: 'batch',
      tier: 'script',
      class_required: undefined,
      territory: 'dc1-se-team',
      script: LINKS,
      ...NEEDS_TOKEN,
    });

  /** The script runner of `elvaria run`, keeping the env each script got. */
  const keptEnvs =
    (envs: Readonly<Record<string, string>>[]): ScriptRunner =>
    (request) => {
      envs.push(request.env);
      return nodeScriptRunner()(request);
    };

  it("gets the quest's secrets for its setup, and the script none", async () => {
    const envs: Readonly<Record<string, string>>[] = [];
    const { kingdom, steward, prepared } = await open((root, kept) => ({
      plots: keeping(root, kept),
      env: ENV,
      scripts: keptEnvs(envs),
    }));
    await withCatalog(kingdom.root);
    await kingdom.command('create_quest', linksWithToken('Links behind a private registry'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Links behind a private registry', 'done'));
    const quest = await kingdom.quest('Links behind a private registry');
    expect(prepared).toEqual([{ quest: quest.id, secrets: { npm_token: NPM_TOKEN } }]);
    expect(envs).toHaveLength(1);
    expect(Object.values(envs[0] ?? {})).not.toContain(NPM_TOKEN);
  });

  it('goes to the infirmary once when the treasury lacks them, instead of a claim given back every tick', async () => {
    const envs: Readonly<Record<string, string>>[] = [];
    const { kingdom, steward, prepared } = await open(
      (root, kept) => ({ plots: keeping(root, kept), env: ENV, scripts: keptEnvs(envs) }),
      { treasury: {} },
    );
    await withCatalog(kingdom.root);
    await kingdom.command('create_quest', linksWithToken('Links without the token'));
    await steward.tick();
    await steward.tick();
    const quest = await kingdom.quest('Links without the token');
    expect(quest).toMatchObject({ status: 'infirmary', assignee: null, attempts: 0, attempt_log: [] });
    expect(prepared).toEqual([]);
    expect(envs).toEqual([]);
    expect(kingdom.notices).toEqual([
      {
        kind: 'infirmary',
        quest: { id: quest.id, title: 'Links without the token', rank: 'D' },
        reason: { code: 'breaker:secrets_missing', params: { names: 'npm_token' } },
        trip: 'secrets',
      },
    ]);
  });
});
