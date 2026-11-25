import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { inKingdom } from '@elvaria/store';
import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST } from '../__fixtures__/git-repo.ts';
import { openLog, runLines } from './logged-run.ts';
import type { ProcessHost } from '../process/program.ts';

/** Git for Windows' POSIX shell, an MSYS program; a POSIX system has its own. */
const SH = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/sh.exe' : '/bin/sh';
const hasSh = await access(SH).then(
  () => true,
  () => false,
);
const SH_HOST: ProcessHost = {
  ...TEST_HOST,
  resolve: (name) => (name === 'sh' ? Promise.resolve({ file: SH, args: [] }) : TEST_HOST.resolve(name)),
};

let root = '';
let kingdom = '';
let plot = '';
let temp: TempDir;
beforeAll(async () => {
  temp = await tempDir('logged run');
  root = temp.root;
  kingdom = path.join(root, 'my kingdom');
  plot = path.join(root, 'plot');
  await mkdir(plot, { recursive: true });
  await writeFile(path.join(plot, 'say.mjs'), 'console.log(`said ${process.argv[2]}`);\n');
});
afterAll(() => temp.remove());

/** Runs `lines` into a new log and gives the run with the log's text. */
async function logged(lines: string[], host: ProcessHost, name: string) {
  const logPath = `.runs/q_20261109_l0g0a1-1/checks/${name}.log`;
  const log = await openLog(kingdom, logPath, `$ ${lines[0] ?? ''}`);
  let run;
  try {
    run = await runLines(lines, { cwd: plot, host }, log, 60_000);
  } finally {
    await log.close();
  }
  return { run, text: await readFile(inKingdom(kingdom, logPath), 'utf8') };
}

describe('a log of command lines', () => {
  it("keeps its first line, then each command's own line and output, in the order they ran", async () => {
    const { run, text } = await logged(['node say.mjs one', 'node say.mjs two'], TEST_HOST, 'order');
    expect(run.exit_code).toBe(0);
    expect(text).toBe('$ node say.mjs one\nsaid one\n\n$ node say.mjs two\nsaid two\n');
  });

  // P1-35: on Windows a log opened to append gave Git's sh (MSYS) a handle it could not write through, so
  // `sh infra/scripts/init-secrets.sh` printed nothing and failed under `set -e`, and every e2e check of dc1 was red.
  it.runIf(hasSh)('takes the output of a POSIX shell script, which fails when it cannot write', async () => {
    await writeFile(path.join(plot, 'strict.sh'), 'set -eu\necho "from sh"\necho "still sh"\n');
    const { run, text } = await logged(['sh strict.sh', 'node say.mjs after'], SH_HOST, 'sh');
    expect(run.exit_code).toBe(0);
    expect(text).toBe('$ sh strict.sh\nfrom sh\nstill sh\n\n$ node say.mjs after\nsaid after\n');
  });
});
