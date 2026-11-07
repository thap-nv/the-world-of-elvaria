// A script-tier run a Steward stopped in the middle of (implementation-plan §2.5 `working.release.script`, §3.12,
// P1-17): stop() kills the script and opens the quest again; a Steward that died leaves the quest working, and the
// next one opens it again when the run saved nothing, or judges what it saved, without a second follow-up.
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DOCS,
  LINKS,
  backToWorking,
  fakeScript,
  scriptKingdom,
  scriptQuest,
  withCatalog,
} from './__fixtures__/scripts.ts';

const kingdom = scriptKingdom();
afterEach(() => kingdom.remove());

describe('the script tier: a Steward that stops in the middle', () => {
  it('kills the script when it stops and opens the quest again; the next Steward runs it anew', async () => {
    const bench = await kingdom.setup({ files: DOCS });
    await fakeScript(bench.root, 'link-check', 'setTimeout(() => console.log("{}"), 60_000);');
    await bench.command('create_quest', scriptQuest('Cut short', LINKS));
    const tick = kingdom.tick();
    for (let wait = 0; wait < 200; wait += 1) {
      if ((await bench.quests())[0]?.status === 'working') break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const before = Date.now();
    await kingdom.stop();
    await tick;
    expect(Date.now() - before).toBeLessThan(20_000);
    const released = await bench.quest('Cut short');
    expect(released.status).toBe('open');
    expect(released.attempt_log.map(({ outcome }) => outcome)).toEqual(['cancelled']);
    // The real link check this time: run 2 goes all the way.
    await withCatalog(bench.root);
    await kingdom.restart({ files: DOCS });
    await kingdom.tick();
    const again = await bench.quest('Cut short');
    expect(again).toMatchObject({ status: 'done', attempts: 2 });
    expect(again.attempt_log.map(({ outcome }) => outcome)).toEqual(['cancelled', 'submitted']);
  });

  it('opens again a run a Steward that died left working without output, and runs it next tick', async () => {
    const bench = await kingdom.setup({ files: DOCS });
    await bench.command('create_quest', scriptQuest('Died', LINKS));
    await kingdom.tick();
    const done = await bench.quest('Died');
    await backToWorking(bench, done);
    await rm(path.join(bench.root, '.runs', `${done.id}-1`, 'script.json'));
    await kingdom.tick();
    expect((await bench.quest('Died')).status).toBe('open');
    await kingdom.tick();
    expect(await bench.quest('Died')).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('judges a run the last Steward saved but did not judge', async () => {
    const bench = await kingdom.setup({ files: DOCS });
    await bench.command('create_quest', scriptQuest('Saved', LINKS));
    await kingdom.tick();
    await backToWorking(bench, await bench.quest('Saved'));
    await kingdom.tick();
    expect(await bench.quest('Saved')).toMatchObject({ status: 'done', units: [{ outcome: 'done' }] });
  });

  it('opens the follow-up of a failed run once, when the verdict is judged again', async () => {
    const bench = await kingdom.setup({ files: { ...DOCS, 'docs/guide.md': '[home](../HOME.md)\n' } });
    await bench.command('create_quest', scriptQuest('Twice', LINKS));
    await kingdom.tick();
    const failed = await bench.quest('Twice');
    // As if the Steward died after it opened the follow-up and before the verdict moved the quest.
    await backToWorking(bench, failed);
    await kingdom.tick();
    expect((await bench.quests()).map(({ title }) => title).sort()).toEqual([
      'Kiểm tra link: Twice',
      'Twice',
    ]);
    expect((await bench.quest('Twice')).status).toBe('infirmary');
  });
});
