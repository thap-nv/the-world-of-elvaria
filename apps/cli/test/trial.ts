// A territory to try (PS-25): a git repo whose path has spaces, Node scripts as its setup and checks, its
// territory.json filled in, a gazetteer, and a ledger where its quests measured well.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EVENT_VERSION, EventSchema, VerdictSchema } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { openKingdom } from '@elvaria/store';

import { git, gitRepo, printed, run, testIo } from './cli.ts';
import { plantQuests, questFixture } from './quest.ts';
import type { TestIo } from './cli.ts';

export const SCRIPTS: Readonly<Record<string, string>> = {
  'setup.mjs': "import { writeFileSync } from 'node:fs';\nwriteFileSync('setup-ran.txt', 'yes');\n",
  'unit.mjs':
    "import { existsSync } from 'node:fs';\nif (!existsSync('setup-ran.txt')) { console.error('Error: no setup'); process.exit(1); }\n",
  'red.mjs':
    "console.log('running 3 tests');\nconsole.error('Error: expected 1 to be 2');\nprocess.exit(1);\n",
  'broken-setup.mjs': "console.log('resolving');\nconsole.error('boom: cannot install');\nprocess.exit(3);\n",
};

/** What a territory that has all it needs declares, beside what `territory add` wrote. */
export const FULL = {
  commands: { setup: 'node setup.mjs' },
  checks: [{ id: 'unit', run: 'node unit.mjs', when: ['**'], timeout_minutes: 5 }],
  shared_paths: [],
  laws: { protected_paths: ['.github/**'] },
};

/** A gazetteer stamped at `commit` that names every command of FULL. */
export const gazetteerAt = (commit: string): string =>
  `<!-- elvaria:commit ${commit} -->\n# Demo\n\nSetup: \`node setup.mjs\`. Tests: \`node unit.mjs\`.\n`;

/** An io whose owner never presses Ctrl+C (testIo's untilStopped stops at once). */
export const patientIo = (): TestIo => testIo({ untilStopped: () => new Promise<void>(() => undefined) });

/** The repo `<root>/Tool - Demo` with SCRIPTS committed on main, attached as territory `demo`; its head. */
export async function attachDemo(root: string, kingdom: string): Promise<{ repo: string; head: string }> {
  const repo = await gitRepo(path.join(root, 'Tool - Demo'));
  git(repo, 'config', 'core.autocrlf', 'false');
  for (const [file, text] of Object.entries(SCRIPTS)) await writeFile(path.join(repo, file), text);
  git(repo, 'add', '--all');
  git(repo, 'commit', '-q', '-m', 'scripts');
  const io = testIo();
  const code = await run(
    io,
    'territory',
    'add',
    repo,
    '--id',
    'demo',
    '--kingdom',
    kingdom,
    '--locale',
    'en',
  );
  if (code !== 0) throw new Error(`territory add failed: ${printed(io)}`);
  return { repo, head: git(repo, 'rev-parse', 'HEAD') };
}

const territoryFile = (kingdom: string) => path.join(kingdom, 'territories', 'demo', 'territory.json');

/** Writes `fields` over the territory file, as the owner fills it in. */
export async function fillDemo(kingdom: string, fields: Record<string, unknown>): Promise<void> {
  const file = territoryFile(kingdom);
  const current = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  await writeFile(file, `${JSON.stringify({ ...current, ...fields }, null, 2)}\n`);
}

export const writeGazetteer = (kingdom: string, text: string): Promise<void> =>
  writeFile(path.join(kingdom, 'territories', 'demo', 'gazetteer.md'), text);

const HOUR = (hour: number) => `2026-11-06T${String(hour).padStart(2, '0')}:00:00+07:00`;

/** Three quests of `demo` whose first run passed, each after a run of checks that passed. */
export async function seedLedger(kingdom: string): Promise<void> {
  const ids = ['q_20261106_aaaaa1', 'q_20261106_aaaaa2', 'q_20261106_aaaaa3'];
  await plantQuests(
    kingdom,
    ...ids.map((id) =>
      questFixture('done', id, {
        territory: 'demo',
        attempts: 1,
        attempt_log: [
          {
            n: 1,
            character: 'thorn',
            role: 'assignee',
            started_at: HOUR(1),
            ended_at: HOUR(2),
            outcome: 'submitted',
            run_dir: `.runs/${id}-1`,
          },
        ],
      }),
    ),
  );
  const store = openKingdom(kingdom);
  for (const id of ids)
    await store.verdicts.write(
      VerdictSchema.parse({
        version: 1,
        id: `${id}-1`,
        quest_id: id,
        attempt: 1,
        verifier_id: 'vesper',
        ritual: 'build_review',
        checks: [],
        result: 'pass',
        by_human: false,
        session_id: `s-${id}-verifier`,
        created_at: HOUR(3),
      }),
    );
  await openEventLog(kingdom).append(
    ids.map((id, index) =>
      EventSchema.parse({
        v: EVENT_VERSION,
        id: `01JC00000000000000000000T${index}`,
        ts: HOUR(2),
        type: 'check.end',
        actor: { kind: 'steward' },
        quest: id,
        data: { outcome: 'pass', checks: [{ id: 'unit', pass: true, duration_ms: 900 }] },
      }),
    ),
  );
}
