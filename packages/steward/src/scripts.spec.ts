// The script tier (implementation-plan §2.5, §3.12, ADR 0017): catalog scripts run by the Steward in the plot, with no
// model, and judged by the machine. The real link-check and run-check of packages/registry-default run here.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload } from './__fixtures__/kingdom.ts';
import { folderPlots } from './plots.ts';
import { nodeScriptRunner } from './script/run-script.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Plots, ResolvedCheck, Steward, StewardDeps } from './types.ts';

const CATALOG = path.join(import.meta.dirname, '..', '..', 'registry-default', 'scripts');

let b: Bench | undefined;
let steward: Steward | undefined;
afterEach(async () => {
  await steward?.stop();
  await b?.remove();
  steward = undefined;
  b = undefined;
});

/** The catalog files a kingdom gets at init (registry/scripts/), which the bench leaves out. */
async function withCatalog(root: string): Promise<void> {
  await mkdir(path.join(root, 'registry', 'scripts'), { recursive: true });
  for (const name of ['common', 'link-check', 'run-check'])
    await copyFile(path.join(CATALOG, `${name}.mjs`), path.join(root, 'registry', 'scripts', `${name}.mjs`));
}

/** A stand-in for a catalog entry: the script's whole body. */
const fakeScript = (root: string, id: string, body: string) =>
  writeFile(path.join(root, 'registry', 'scripts', `${id}.mjs`), body, 'utf8');

/** folderPlots whose plot already holds the files a script reads, and the territory's resolved checks. */
function plotsWith(
  root: string,
  files: Readonly<Record<string, string>>,
  checks: readonly ResolvedCheck[],
): Plots {
  const base = folderPlots(root);
  return {
    ...base,
    prepare: async (quest, territory) => {
      const prepared = await base.prepare(quest, territory);
      for (const [file, text] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(prepared.cwd, file)), { recursive: true });
        await writeFile(path.join(prepared.cwd, file), text, 'utf8');
      }
      return prepared;
    },
    scriptChecks: () => Promise.resolve(checks),
  };
}

const scriptQuest = (title: string, script: Record<string, unknown>, kind = 'batch') =>
  questPayload(title, { kind, tier: 'script', class_required: undefined, territory: 'handbook', script });

const LINKS = { id: 'link-check', params: { globs: ['**/*.md'] } };
const DOCS = { 'README.md': 'See [the guide](docs/guide.md).\n', 'docs/guide.md': '# Guide\n' };
/** What the composition root hands the Steward: on Windows a child node needs SystemRoot to start. */
const ENV: Readonly<Record<string, string>> = {
  PATH: process.env.PATH ?? '',
  ...(process.env.SystemRoot === undefined ? {} : { SystemRoot: process.env.SystemRoot }),
};

interface Setup {
  readonly files?: Readonly<Record<string, string>>;
  readonly checks?: readonly ResolvedCheck[];
  readonly deps?: Partial<StewardDeps>;
}

async function setup({ files = {}, checks = [], deps = {} }: Setup = {}): Promise<Bench> {
  const made = await bench();
  b = made;
  await withCatalog(made.root);
  steward = made.steward({ plots: plotsWith(made.root, files, checks), env: ENV, ...deps });
  await steward.start({ loop: false });
  return made;
}

async function ticked(): Promise<void> {
  if (steward === undefined) throw new Error('spec: no steward');
  await steward.tick();
}

const readJson = async (root: string, file: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path.join(root, file), 'utf8')) as Record<string, unknown>;

async function lines(bench: Bench): Promise<{ type: string; data: Record<string, unknown> }[]> {
  const text = await readFile(path.join(bench.root, 'events', '2026-11-07.jsonl'), 'utf8');
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { type: string; data: Record<string, unknown> });
}

const infirmaryReason = async (bench: Bench): Promise<unknown> =>
  (await lines(bench)).findLast(({ type }) => type === 'quest.infirmary')?.data.reason;

describe('the script tier: a run that gives a result', () => {
  it('runs a link check all the way in one tick: no character, no model, mana 0, the machine judges', async () => {
    const bench = await setup({ files: DOCS });
    await bench.command('create_quest', scriptQuest('Links of the handbook', LINKS));
    await ticked();
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

  it('fails a link check with a dead link: the infirmary, the units kept, the dead one named', async () => {
    const bench = await setup({ files: { ...DOCS, 'docs/guide.md': 'Back to [home](../HOME.md).\n' } });
    await bench.command('create_quest', scriptQuest('Dead links', LINKS));
    await ticked();
    const quest = await bench.quest('Dead links');
    expect(quest.status).toBe('infirmary');
    expect(quest.units?.map(({ outcome }) => outcome)).toEqual(['done', 'not_done']);
    const verdict = await readJson(bench.root, `verdicts/${quest.id}-1.json`);
    expect(verdict).toMatchObject({ result: 'fail', fail_kind: 'tests_fail' });
    expect(verdict.notes).toContain('(not_done): docs/guide.md:1 -> ../HOME.md');
    expect(await infirmaryReason(bench)).toBe('script:fail: link-check did not pass, see the verdict');
    expect(bench.notices).toEqual([expect.objectContaining({ kind: 'infirmary' })]);
  });

  it("runs one of the territory's checks with run-check, from the resolved argv the Steward hands it", async () => {
    const lint = {
      id: 'lint',
      argv: [process.execPath, '-e', 'console.log("3 problems"); process.exit(1)'],
      timeout_minutes: 1,
    };
    const bench = await setup({ checks: [lint] });
    await bench.command(
      'create_quest',
      scriptQuest('Lint', { id: 'run-check', params: { check_id: 'lint' } }),
    );
    await ticked();
    const quest = await bench.quest('Lint');
    expect(quest.status).toBe('infirmary');
    const verdict = await readJson(bench.root, `verdicts/${quest.id}-1.json`);
    expect(verdict.checks).toEqual([expect.objectContaining({ id: 'run_check', pass: false })]);
    expect(verdict.notes).toContain('"check_id":"lint","exit_code":1');
    const log = await readFile(path.join(bench.root, '.runs', `${quest.id}-1`, 'checks', 'lint.log'), 'utf8');
    expect(log).toContain('3 problems');
  });
});

describe('the script tier: a run that gives none', () => {
  it('refuses params that do not fit the catalog before anything runs', async () => {
    const bench = await setup();
    await bench.command('create_quest', scriptQuest('No globs', { id: 'link-check', params: { glob: 'x' } }));
    await ticked();
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
  ])('sends %s to the infirmary at once, with no retry', async (_, body, reason) => {
    const bench = await setup();
    await fakeScript(bench.root, 'link-check', body);
    await bench.command('create_quest', scriptQuest('Broken', LINKS));
    await ticked();
    const quest = await bench.quest('Broken');
    expect(quest).toMatchObject({ status: 'infirmary', attempts: 1 });
    expect(quest.attempt_log[0]?.outcome).toBe('crash');
    expect(await infirmaryReason(bench)).toBe(reason);
  });

  it('trips the time breaker on a script past its timeout and kills it', async () => {
    const short = nodeScriptRunner();
    const bench = await setup({ deps: { scripts: (request) => short({ ...request, timeout_ms: 300 }) } });
    await fakeScript(bench.root, 'link-check', 'setTimeout(() => console.log("{}"), 60_000);');
    await bench.command('create_quest', scriptQuest('Slow', LINKS));
    await ticked();
    const quest = await bench.quest('Slow');
    expect(quest.status).toBe('infirmary');
    expect(quest.attempt_log[0]?.outcome).toBe('timeout');
    expect(await infirmaryReason(bench)).toBe('breaker:time: the script ran past 10 minutes');
  });
});

describe('the script tier: a Steward that stops in the middle', () => {
  it('kills the script when it stops; the next Steward sends the run, which left nothing, to the infirmary', async () => {
    const bench = await setup();
    await fakeScript(bench.root, 'link-check', 'setTimeout(() => console.log("{}"), 60_000);');
    await bench.command('create_quest', scriptQuest('Cut short', LINKS));
    const tick = ticked();
    for (let wait = 0; wait < 200; wait += 1) {
      const quests = await bench.quests();
      if (quests[0]?.status === 'working') break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const before = Date.now();
    await steward?.stop();
    await tick;
    expect(Date.now() - before).toBeLessThan(20_000);
    expect((await bench.quest('Cut short')).status).toBe('working');
    steward = bench.steward({ plots: folderPlots(bench.root), env: ENV });
    await steward.start({ loop: false });
    await ticked();
    expect((await bench.quest('Cut short')).status).toBe('infirmary');
    expect(await infirmaryReason(bench)).toBe('script:lost: the Steward stopped while the script ran');
  });

  it('judges a run the last Steward saved but did not judge', async () => {
    const bench = await setup({ files: DOCS });
    await bench.command('create_quest', scriptQuest('Saved', LINKS));
    await ticked();
    const done = await bench.quest('Saved');
    // The same quest as the files held after the script's run, before its verdict: working, its run saved.
    const { units: _units, ...before } = done;
    const entry = { ...done.attempt_log[0], outcome: undefined, ended_at: undefined };
    const working: Record<string, unknown> = {
      ...before,
      status: 'working',
      checks_run: [],
      attempt_log: [entry],
    };
    await bench.store.quests.write(working as never);
    await ticked();
    expect(await bench.quest('Saved')).toMatchObject({ status: 'done', units: [{ outcome: 'done' }] });
  });
});
