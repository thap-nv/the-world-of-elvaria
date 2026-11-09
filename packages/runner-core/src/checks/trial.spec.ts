import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FLAKE_RUNS, TerritorySchema } from '@elvaria/domain';
import { inKingdom } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { createPlotManager } from '../plot/plot-manager.ts';
import { trialInScratch } from './scratch-trial.ts';
import { runTrial } from './trial.ts';
import type { TrialRequest } from './trial.ts';

let root = '';
let kingdom = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria trial '));
  kingdom = path.join(root, 'my kingdom');
  await mkdir(kingdom);
});
afterAll(() => rm(root, { recursive: true, force: true }));

/** Counts its runs in `<plot>/../counts/<name>` and fails on the runs listed after the name. */
const COUNT = [
  "import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
  'const [name, ...failOn] = process.argv.slice(2);',
  "mkdirSync('../counts', { recursive: true });",
  'let n = 1;',
  'try { n = Number(readFileSync(`../counts/${name}`, "utf8")) + 1; } catch {}',
  'writeFileSync(`../counts/${name}`, String(n));',
  "appendFileSync('../trace.txt', `${name} ${n}\\n`);",
  'console.log(`ran ${name} #${n}`);',
  'process.exit(failOn.includes(String(n)) ? 1 : 0);',
].join('\n');

/** Writes an istanbul summary with `lines.covered` of 100, the head's or the base's (side.txt); none or bad. */
const COVER = [
  "import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
  'const [head, base] = process.argv.slice(2);',
  "const side = existsSync('side.txt') ? readFileSync('side.txt', 'utf8') : 'head';",
  "const value = side === 'base' ? base : head;",
  "if (value === 'none') process.exit(1);",
  "mkdirSync('coverage', { recursive: true });",
  'const lines = { total: 100, covered: Number(value) };',
  "const summary = value === 'bad' ? { total: {} } : { total: { lines } };",
  "writeFileSync('coverage/coverage-summary.json', JSON.stringify(summary));",
].join('\n');

let plots = 0;
/** A fresh plot folder with the two scripts, and a plot whose checkout writes which side it is on. */
async function plotFolder() {
  plots += 1;
  const dir = path.join(root, `case ${plots}`, 'plot');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'count.mjs'), COUNT);
  await writeFile(path.join(dir, 'cover.mjs'), COVER);
  const plot = {
    base: 'BASE',
    head: 'HEAD',
    checkout: (ref: string) => writeFile(path.join(dir, 'side.txt'), ref === 'BASE' ? 'base' : 'head'),
  };
  const trace = async () => (await readFile(path.join(dir, '..', 'trace.txt'), 'utf8')).trim().split('\n');
  return { dir, plot, trace };
}

const check = (id: string, ...failOn: string[]) => ({
  id,
  run: ['node count.mjs', id, ...failOn].join(' '),
  when: ['**'],
  timeout_minutes: 1,
});

function requestIn(dir: string, fields: { checks?: unknown[]; commands?: unknown } & Partial<TrialRequest>) {
  const { checks = [check('e2e')], commands = {}, ...rest } = fields;
  const territory = TerritorySchema.parse({
    version: 1,
    id: 'dc1',
    name: 'dc1',
    path: '/repos/dc1',
    kind: 'code',
    vcs: { type: 'none' },
    checks,
    commands,
  });
  return {
    kingdom,
    territory,
    touched: ['e2e/flow.spec.ts'],
    cwd: dir,
    run_dir: '.runs/q-1',
    runs: 1,
    coverage: false,
    ...rest,
  };
}

const ids = (runs: readonly { id: string; pass: boolean }[]) => runs.map(({ id, pass }) => `${id}:${pass}`);
const log = (file: string) => readFile(inKingdom(kingdom, file), 'utf8');

describe('runTrial', () => {
  it('resets before the checks and reports the reset as rerun_clean, once without flake_check', async () => {
    const { dir, plot, trace } = await plotFolder();
    const request = requestIn(dir, { commands: { reset: ['node count.mjs reset', 'node count.mjs seed'] } });
    const runs = await runTrial(request, TEST_HOST, plot);
    expect(ids(runs)).toEqual(['rerun_clean:true', 'e2e:true']);
    expect(await trace()).toEqual(['reset 1', 'seed 1', 'e2e 1']);
    expect(await log(runs[0]!.log_path)).toContain('$ node count.mjs seed');
  });

  it('says when the territory has no reset, and stops at a reset that fails', async () => {
    const quiet = await plotFolder();
    const [clean] = await runTrial(requestIn(quiet.dir, {}), TEST_HOST, quiet.plot);
    expect(await log(clean!.log_path)).toContain('the territory has no commands.reset');
    const broken = await plotFolder();
    const commands = { reset: 'node count.mjs reset 1' };
    const runs = await runTrial(requestIn(broken.dir, { commands }), TEST_HOST, broken.plot);
    expect(runs).toMatchObject([{ id: 'rerun_clean', pass: false, exit_code: 1 }]);
    expect(await broken.trace()).toEqual(['reset 1']);
  });

  it('runs the checks three times on a green run, each after a reset, and finds no flake', async () => {
    const { dir, plot, trace } = await plotFolder();
    const commands = { reset: 'node count.mjs reset' };
    const request = requestIn(dir, { commands, runs: FLAKE_RUNS, checks: [check('lint'), check('e2e')] });
    const runs = await runTrial(request, TEST_HOST, plot);
    expect(ids(runs)).toEqual(['rerun_clean:true', 'lint:true', 'e2e:true', 'flake_check:true']);
    expect((await trace()).filter((line) => line.startsWith('reset'))).toHaveLength(FLAKE_RUNS);
    expect(await log('.runs/q-1/run-3/checks/e2e.log')).toContain('ran e2e #3');
    expect(await log(runs[3]!.log_path)).toContain('every check gave the same result in every run');
  });

  it('fails flake_check on a check that passes once and fails the next time, and stops there', async () => {
    const { dir, plot, trace } = await plotFolder();
    const request = requestIn(dir, { runs: FLAKE_RUNS, checks: [check('lint'), check('e2e', '2')] });
    const runs = await runTrial(request, TEST_HOST, plot);
    expect(ids(runs)).toEqual(['rerun_clean:true', 'lint:true', 'e2e:true', 'flake_check:false']);
    expect(await trace()).toEqual(['lint 1', 'e2e 1', 'lint 2', 'e2e 2']);
    const said = await log(runs[3]!.log_path);
    expect(said).toContain('flaky: e2e passed in one run and failed in another');
    expect(said).toContain('run 2: ✓ lint (.runs/q-1/run-2/checks/lint.log), ✗ e2e');
  });

  it('repeats nothing after a failing first run, after a reset that fails, or when no check ran', async () => {
    const failing = await plotFolder();
    const red = await runTrial(
      requestIn(failing.dir, { runs: FLAKE_RUNS, checks: [check('e2e', '1')] }),
      TEST_HOST,
      failing.plot,
    );
    expect(ids(red)).toEqual(['rerun_clean:true', 'e2e:false']);
    const resetting = await plotFolder();
    const commands = { reset: 'node count.mjs reset 2' };
    const stopped = await runTrial(
      requestIn(resetting.dir, { runs: FLAKE_RUNS, commands }),
      TEST_HOST,
      resetting.plot,
    );
    expect(ids(stopped)).toEqual(['rerun_clean:false', 'e2e:true']);
    const none = await plotFolder();
    const nothing = await runTrial(
      requestIn(none.dir, {
        runs: FLAKE_RUNS,
        touched: ['README.md'],
        checks: [{ ...check('e2e'), when: ['e2e/**'] }],
      }),
      TEST_HOST,
      none.plot,
    );
    expect(ids(nothing)).toEqual(['rerun_clean:true']);
  });

  it.each([
    ['holds', '80', '80', true, 'coverage did not drop'],
    ['drops', '79', '80', false, 'lines: 79.00 % < 80.00 %'],
    [
      'cannot be read on the branch',
      'none',
      '80',
      false,
      'the branch: no readable coverage/coverage-summary.json',
    ],
    ['has no totals on the branch', 'bad', '80', false, 'has no totals'],
    ['cannot be measured on the base', '70', 'none', true, 'nothing to compare'],
  ])(
    'measures coverage on the branch and its base, and passes when it %s',
    async (_, head, base, pass, said) => {
      const { dir, plot } = await plotFolder();
      const request = requestIn(dir, {
        coverage: true,
        commands: { coverage: `node cover.mjs ${head} ${base}` },
      });
      const runs = await runTrial(request, TEST_HOST, plot);
      expect(runs.at(-1)).toMatchObject({ id: 'coverage_not_lower', pass });
      expect(await log(runs.at(-1)!.log_path)).toContain(said);
      // The judge finds the plot back on the branch.
      expect(await readFile(path.join(dir, 'side.txt'), 'utf8')).toBe('head');
    },
  );

  it('measures no coverage when the ritual or the territory asks for none', async () => {
    const { dir, plot } = await plotFolder();
    const asked = await runTrial(requestIn(dir, { coverage: true }), TEST_HOST, plot);
    const unasked = await runTrial(
      requestIn(dir, { commands: { coverage: 'node cover.mjs 1 1' } }),
      TEST_HOST,
      plot,
    );
    expect([ids(asked), ids(unasked)]).toEqual([
      ['rerun_clean:true', 'e2e:true'],
      ['rerun_clean:true', 'e2e:true'],
    ]);
  });
});

describe('trialInScratch', () => {
  const manager = () => createPlotManager({ kingdom, host: TEST_HOST });

  it("runs the trial in a fresh scratch plot of the quest's branch, coverage against its base", async () => {
    const repo = await gitRepo(path.join(root, 'Tool - DC1', 'repo'));
    await commitFile(repo, 'cover.mjs', COVER);
    const quest = { id: questId('a1b2c3') };
    const territory = territoryAt(repo, {
      checks: [{ id: 'unit', run: 'node -e "process.exit(0)"', when: ['src/**'], timeout_minutes: 1 }],
      commands: { coverage: 'node cover.mjs 90 80' },
    });
    const plots = manager();
    const prepared = await plots.prepare(quest, territory);
    if (!prepared.ok) throw new Error(prepared.error.detail);
    await commitFile(path.join(repo, '.elvaria', 'worktrees', quest.id), 'src/sum.mjs', 'export {};\n');
    const request = { kingdom, quest, territory, run_dir: `.runs/${quest.id}-1`, runs: 1, coverage: true };
    const runs = await trialInScratch(plots, request, TEST_HOST);
    expect(ids(runs)).toEqual(['rerun_clean:true', 'unit:true', 'coverage_not_lower:true']);
    expect(await plots.scratchOf(quest, territory)).toBeDefined();
  }, 60_000);

  it('fails rerun_clean on a setup that fails, and throws when git cannot make the plot', async () => {
    const repo = await gitRepo(path.join(root, 'setup'));
    const quest = { id: questId('b2c3d4') };
    const territory = territoryAt(repo);
    const plots = manager();
    const prepared = await plots.prepare(quest, territory);
    if (!prepared.ok) throw new Error(prepared.error.detail);
    const failing = { ...territory, commands: { setup: 'node -e "process.exit(2)"' } };
    const request = { kingdom, quest, territory: failing, run_dir: '.runs/x-1', runs: 1, coverage: false };
    expect(await trialInScratch(plots, request, TEST_HOST)).toMatchObject([
      { id: 'rerun_clean', pass: false, log_path: `.runs/${quest.id}-verify-setup.log` },
    ]);
    const folder = { ...territory, vcs: { type: 'none' as const } };
    await expect(trialInScratch(plots, { ...request, territory: folder }, TEST_HOST)).rejects.toThrow(
      'is not ready (not_a_repo)',
    );
  }, 60_000);
});
