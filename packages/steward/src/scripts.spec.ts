// The script tier (implementation-plan §2.5, §3.12, ADR 0017): catalog scripts run by the Steward in the plot, outside
// the tick (P1-25), with no model, and judged by the machine; a failed run hands what it found to the follow-up its catalog entry names. The
// real link-check and run-check of packages/registry-default run here. A Steward stopped mid-run: scripts-restart.spec.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DOCS,
  LINKS,
  fakeScript,
  infirmaryReason,
  lines,
  readJson,
  scriptKingdom,
  scriptQuest,
} from './__fixtures__/scripts.ts';
import { nodeScriptRunner } from './script/run-script.ts';

const kingdom = scriptKingdom();
afterEach(() => kingdom.remove());

const DEAD_LINK = { ...DOCS, 'docs/guide.md': 'Back to [home](../HOME.md).\n' };

describe('the script tier: a run that gives a result', () => {
  it('runs a link check outside the tick, then judges it: no character, no model, mana 0, the machine judges', async () => {
    const bench = await kingdom.setup({ files: DOCS });
    await bench.command('create_quest', scriptQuest('Links of the handbook', LINKS));
    await kingdom.run();
    const quest = await bench.quest('Links of the handbook');
    expect(quest).toMatchObject({
      status: 'done',
      tier: 'script',
      assignee: null,
      verifier: null,
      attempts: 1,
      checks_run: ['link_check'],
      units: [{ label: 'README.md:1 -> docs/guide.md', outcome: 'done' }],
    });
    expect(quest.attempt_log).toEqual([
      expect.objectContaining({ n: 1, character: null, role: 'assignee', outcome: 'submitted' }),
    ]);
    const verdict = await readJson(bench.root, `verdicts/${quest.id}-1.json`);
    expect(verdict).toMatchObject({ verifier_id: 'machine', result: 'pass', ritual: 'unit_tally' });
    expect(verdict.notes).toContain('1 units: 1 done');
    // Mana 0: no runner was asked for anything, and no session line was written.
    expect(bench.requests).toEqual([]);
    const types = (await lines(bench)).map(({ type }) => type);
    expect(types.filter((type) => type.startsWith('agent.'))).toEqual([]);
    expect(types).toEqual(
      expect.arrayContaining([
        'quest.claimed',
        'quest.started',
        'quest.submitted',
        'verdict.pass',
        'quest.done',
      ]),
    );
    const log = await readFile(path.join(bench.root, '.runs', `${quest.id}-1`, 'script.log'), 'utf8');
    expect(log).toContain('"units"');
  });

  it('fails a link check with a dead link and hands the dead one to a follow-up quest of a scribe', async () => {
    const bench = await kingdom.setup({ files: DEAD_LINK });
    await bench.command('create_quest', scriptQuest('Dead links', LINKS));
    await kingdom.run();
    const quest = await bench.quest('Dead links');
    expect(quest.status).toBe('infirmary');
    const verdict = await readJson(bench.root, `verdicts/${quest.id}-1.json`);
    expect(verdict).toMatchObject({ result: 'fail', fail_kind: 'tests_fail' });
    expect(verdict.notes).toContain('(not_done): docs/guide.md:1 -> ../HOME.md');
    // The catalog's follow_up of link-check: one document quest for a scribe, a child of the battle.
    const followUp = await bench.quest('Kiểm tra link: Dead links');
    expect(followUp).toMatchObject({
      status: 'open',
      tier: 'session',
      kind: 'document',
      class_required: 'scribe',
      parent_id: quest.id,
      territory: 'handbook',
      created_by: 'battle',
    });
    expect(followUp.description).toContain('docs/guide.md:1 -> ../HOME.md');
    expect(quest.units?.map(({ outcome, child_quest: child }) => [outcome, child])).toEqual([
      ['done', undefined],
      ['not_done', followUp.id],
    ]);
    expect(await infirmaryReason(bench)).toBe(
      `script:fail: link-check did not pass, see the verdict; follow-up quest ${followUp.id} opened`,
    );
    expect(bench.notices).toEqual([expect.objectContaining({ kind: 'infirmary' })]);
  });

  it('opens no follow-up when the catalog entry names none', async () => {
    const bench = await kingdom.setup({ files: DEAD_LINK });
    const catalog = (await readJson(bench.root, 'registry/scripts.json')) as {
      scripts: Record<string, unknown>[];
    };
    const quiet = catalog.scripts.map(({ follow_up: _followUp, ...rest }) => rest);
    await writeFile(
      path.join(bench.root, 'registry', 'scripts.json'),
      JSON.stringify({ ...catalog, scripts: quiet }),
    );
    await bench.command('create_quest', scriptQuest('Dead links', LINKS));
    await kingdom.run();
    expect((await bench.quests()).map(({ title }) => title)).toEqual(['Dead links']);
    expect(await infirmaryReason(bench)).toBe('script:fail: link-check did not pass, see the verdict');
  });

  it("runs one of the territory's checks with run-check, from the resolved argv the Steward hands it", async () => {
    const lint = {
      id: 'lint',
      argv: [process.execPath, '-e', 'console.log("3 problems"); process.exit(1)'],
      timeout_minutes: 1,
    };
    const bench = await kingdom.setup({ checks: [lint] });
    await bench.command(
      'create_quest',
      scriptQuest('Lint', { id: 'run-check', params: { check_id: 'lint' } }),
    );
    await kingdom.run();
    const quest = await bench.quest('Lint');
    expect(quest.status).toBe('infirmary');
    const verdict = await readJson(bench.root, `verdicts/${quest.id}-1.json`);
    expect(verdict.checks).toEqual([expect.objectContaining({ id: 'run_check', pass: false })]);
    expect(verdict.notes).toContain('"check_id":"lint","exit_code":1');
    const log = await readFile(path.join(bench.root, '.runs', `${quest.id}-1`, 'checks', 'lint.log'), 'utf8');
    expect(log).toContain('3 problems');
    // A monster found: the Exorcism quest, a fix for a knight (run-check's follow_up).
    expect(await bench.quest('Chạy kiểm tra máy: Lint')).toMatchObject({
      status: 'open',
      kind: 'fix',
      class_required: 'knight',
      parent_id: quest.id,
    });
  });
});

describe('the script tier: a run that gives none', () => {
  it('refuses params that do not fit the catalog before anything runs', async () => {
    const bench = await kingdom.setup();
    await bench.command('create_quest', scriptQuest('No globs', { id: 'link-check', params: { glob: 'x' } }));
    await kingdom.tick();
    expect(await bench.quests()).toEqual([]);
    const rejected = (await lines(bench)).find(({ type }) => type === 'command.rejected');
    expect(rejected?.data.reason).toBe('invalid_script_params');
  });

  it.each([
    ['a script that breaks', 'process.stderr.write("boom\\n"); process.exit(1);', 'script:broken: boom'],
    [
      'a quest the script cannot use',
      'process.stderr.write("no such check\\n"); process.exitCode = 2;',
      'script:usage: no such check',
    ],
    ['output outside the contract', 'console.log("done");', 'script:broken: stdout is not JSON'],
  ])('sends %s to the infirmary at once, with no retry and no follow-up', async (_, body, reason) => {
    const bench = await kingdom.setup();
    await fakeScript(bench.root, 'link-check', body);
    await bench.command('create_quest', scriptQuest('Broken', LINKS));
    await kingdom.run();
    const quest = await bench.quest('Broken');
    expect(quest).toMatchObject({ status: 'infirmary', attempts: 1 });
    expect(quest.attempt_log[0]?.outcome).toBe('crash');
    expect(await infirmaryReason(bench)).toBe(reason);
    expect(await bench.quests()).toHaveLength(1);
  });

  it('trips the time breaker on a script past its timeout and kills it', async () => {
    const short = nodeScriptRunner();
    const bench = await kingdom.setup({
      deps: { scripts: (request) => short({ ...request, timeout_ms: 300 }) },
    });
    await fakeScript(bench.root, 'link-check', 'setTimeout(() => console.log("{}"), 60_000);');
    await bench.command('create_quest', scriptQuest('Slow', LINKS));
    await kingdom.run();
    const quest = await bench.quest('Slow');
    expect(quest.status).toBe('infirmary');
    expect(quest.attempt_log[0]?.outcome).toBe('timeout');
    expect(await infirmaryReason(bench)).toBe('breaker:time: the script ran past 10 minutes');
  });
});
