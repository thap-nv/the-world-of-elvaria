// Who is whose child on macOS and Linux, as `ps` sees it at one moment: what the kill tree walks, since POSIX has
// no call that ends a process with its descendants (implementation-plan §3.4). Windows walks its own tree
// (`taskkill /T`), so this file is POSIX only.
import { PS, PS_ENV, capture } from './system.ts';

/** Parent pid → its children's pids. */
export type ProcessTable = ReadonlyMap<number, readonly number[]>;

const ROW = /^\s*(\d+)\s+(\d+)\s*$/;

/** The table of `ps -A -o pid=,ppid=`: one `<pid> <ppid>` per line; a line of another shape is skipped. */
export function parseProcessTable(text: string): ProcessTable {
  const table = new Map<number, number[]>();
  for (const line of text.split('\n')) {
    const row = ROW.exec(line);
    if (row === null) continue;
    const [pid, parent] = [Number(row[1]), Number(row[2])];
    table.set(parent, [...(table.get(parent) ?? []), pid]);
  }
  return table;
}

/** Every descendant of `roots`, nearest first, each once and none of the roots. */
export function descendantsOf(table: ProcessTable, roots: readonly number[]): number[] {
  const seen = new Set(roots);
  const found: number[] = [];
  for (let queue = [...roots]; queue.length > 0;) {
    const children = queue.flatMap((pid) => table.get(pid) ?? []).filter((pid) => !seen.has(pid));
    for (const pid of children) seen.add(pid);
    found.push(...children);
    queue = children;
  }
  return found;
}

/** Every process of the machine and its parent; empty when ps cannot run, and the kill reaches the roots only. */
export async function readProcessTable(): Promise<ProcessTable> {
  const ran = await capture(PS, ['-A', '-o', 'pid=,ppid='], PS_ENV);
  return parseProcessTable(ran.code === 0 ? ran.stdout : '');
}
