// A consumer for crash.spec.ts that gets killed mid-run, run by Node's type stripping:
//   node test/tail-child.ts <kingdom> <state.json>
// It tails the log and, after each batch, saves what it processed together with the cursor in one atomic
// rename: the pattern a real consumer uses, so its state and its cursor can never disagree.
import { readFile, rename, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import { isEventCursor, openEventLog } from '../src/index.ts';
import type { EventCursor } from '../src/index.ts';

interface State {
  readonly cursor: EventCursor;
  readonly ids: string[];
}

function argsOf(): [kingdom: string, stateFile: string] {
  const [kingdom, stateFile] = process.argv.slice(2);
  if (kingdom === undefined || stateFile === undefined)
    throw new Error('usage: tail-child.ts <kingdom> <state>');
  return [kingdom, stateFile];
}

const [kingdom, stateFile] = argsOf();

// Windows refuses to rename over a file another process holds open for a moment; try again.
async function save(state: State): Promise<void> {
  const temp = `${stateFile}.tmp`;
  await writeFile(temp, JSON.stringify(state), 'utf8');
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(temp, stateFile);
      return;
    } catch (error) {
      if (attempt >= 50) throw error;
      await sleep(10);
    }
  }
}

async function load(): Promise<State> {
  try {
    const parsed: unknown = JSON.parse(await readFile(stateFile, 'utf8'));
    const { cursor, ids } = parsed as State;
    return isEventCursor(cursor) ? { cursor, ids } : { cursor: {}, ids: [] };
  } catch {
    return { cursor: {}, ids: [] };
  }
}

// Never outlive the spec, even when it fails before killing this process.
setTimeout(() => process.exit(1), 60_000).unref();
await import('@elvaria/domain');
process.stdout.write('ready\n');
let state = await load();
for await (const batch of openEventLog(kingdom).tail({ from: state.cursor, intervalMs: 5 })) {
  state = { cursor: batch.cursor, ids: [...state.ids, ...batch.events.map((event) => event.id)] };
  await save(state);
  process.stdout.write(`${state.ids.length}\n`);
}
