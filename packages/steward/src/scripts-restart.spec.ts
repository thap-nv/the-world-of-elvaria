// A script-tier run a Steward stopped in the middle of (implementation-plan §2.5 `working.release.by_machine`, §3.12,
// P1-17, P1-25): the script runs outside the tick, so a tick goes on while it runs; stop() kills it and leaves the
// quest working with no output, as a Steward that died does; the next one opens it again when the run saved
// nothing, or judges what it saved, without a second follow-up.
import { access, rm } from 'node:fs/promises';
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
  it('holds no tick while the script runs, kills it on stop, and the next Steward runs it anew', async () => {
    const bench = await kingdom.setup({ files: DOCS });
    await fakeScript(bench.root, 'link-check', 'setTimeout(() => console.log("{}"), 60_000);');
    await bench.command('create_quest', scriptQuest('Cut short', LINKS));
    await kingdom.tick();
    const running = await bench.quest('Cut short');
    expect(running.status).toBe('working');
    // The script of a minute runs on: the next tick applies the owner's command and does not wait for it.
    await bench.command('set_rank', { quest: running.id, rank: 'C' });
    const ticked = Date.now();
    await kingdom.tick();
    expect(Date.now() - ticked).toBeLessThan(20_000);
    expect(await bench.quest('Cut short')).toMatchObject({ status: 'working', rank: 'C' });
    const before = Date.now();
    await kingdom.stop();
    expect(Date.now() - before).toBeLessThan(20_000);
    // Killed: it saved nothing, and the quest waits for the next Steward.
    expect((await bench.quest('Cut short')).status).toBe('working');
    await expect(access(path.join(bench.root, '.runs', `${running.id}-1`, 'script.json'))).rejects.toThrow();
    // The real link check this time: the next Steward opens the quest again, and run 2 goes all the way.
    await withCatalog(bench.root);
    await kingdom.restart({ files: DOCS });
    await kingdom.tick();
    const released = await bench.quest('Cut short');
    expect(released.status).toBe('open');
    expect(released.attempt_log.map(({ outcome }) => outcome)).toEqual(['cancelled']);
    await kingdom.run();
    const again = await bench.quest('Cut short');
    expect(again).toMatchObject({ status: 'done', attempts: 2 });
    expect(again.attempt_log.map(({ outcome }) => outcome)).toEqual(['cancelled', 'submitted']);
  });

  it('opens again a run a Steward that died left working without output, and runs it next tick', async () => {
    const bench = await kingdom.setup({ files: DOCS });
    await bench.command('create_quest', scriptQuest('Died', LINKS));
    await kingdom.run();
    const done = await bench.quest('Died');
    await backToWorking(bench, done);
    await rm(path.join(bench.root, '.runs', `${done.id}-1`, 'script.json'));
    await kingdom.tick();
    expect((await bench.quest('Died')).status).toBe('open');
    await kingdom.run();
    expect(await bench.quest('Died')).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('judges a run the last Steward saved but did not judge', async () => {
    const bench = await kingdom.setup({ files: DOCS });
    await bench.command('create_quest', scriptQuest('Saved', LINKS));
    await kingdom.run();
    await backToWorking(bench, await bench.quest('Saved'));
    await kingdom.tick();
    expect(await bench.quest('Saved')).toMatchObject({ status: 'done', units: [{ outcome: 'done' }] });
  });

  it('opens the follow-up of a failed run once, when the verdict is judged again', async () => {
    const bench = await kingdom.setup({ files: { ...DOCS, 'docs/guide.md': '[home](../HOME.md)\n' } });
    await bench.command('create_quest', scriptQuest('Twice', LINKS));
    await kingdom.run();
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
