import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { testTimeConfig } from './eslint-test-time.mjs';
import { elvaria } from './eslint.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const SPEC = 'packages/store/src/lock.spec.ts';

// Only the test-time rules, without type information: they read syntax and scopes, not types.
const linter = new Linter({ cwd: REPO });
const configs: Linter.Config[] = [
  { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser, globals: globals.node } },
  ...testTimeConfig(['**/*.spec.ts']),
];

/** `rule:line` for each report on `lines` placed at `file`, a path from the repo root. */
const lint = (lines: string[], file = SPEC): string[] =>
  linter
    .verify(lines.join('\n'), configs, join(REPO, file))
    .map((message) => `${message.ruleId ?? message.message}:${message.line}`);

describe('elvaria/no-real-wait', () => {
  const WAIT = 'elvaria/no-real-wait';

  it('flags a global timer, a timer from node:timers/promises under any name, and every use of it', () => {
    const code = [
      'await new Promise((resolve) => setTimeout(resolve, 10));',
      "import { setTimeout as sleep } from 'node:timers/promises';",
      'await sleep(5);',
      'await sleep(5);',
      'const ticker = setInterval(check, 50);',
    ];
    expect(lint(code)).toEqual([`${WAIT}:1`, `${WAIT}:3`, `${WAIT}:4`, `${WAIT}:5`]);
  });

  it('flags a loop that awaits until a condition holds, and the polling helpers of vitest', () => {
    const code = [
      'while (!done()) await tick();',
      'do { await tick(); await tick(); } while (!done());',
      'await expect.poll(() => read()).toBe(1);',
      'await vi.waitFor(() => check());',
      'await vi.waitUntil(() => ready());',
    ];
    expect(lint(code)).toEqual([`${WAIT}:1`, `${WAIT}:2`, `${WAIT}:3`, `${WAIT}:4`, `${WAIT}:5`]);
  });

  it('leaves counted loops, loops without await, and awaits in a function the loop builds', () => {
    const code = [
      'for (let tick = 0; tick < 3; tick += 1) await steward.tick();',
      'while (queue.length > 0) queue.pop();',
      'while (pending.length > 0) handlers.push(async () => { await pending.pop(); });',
      'for await (const line of lines) seen.push(line);',
    ];
    expect(lint(code)).toEqual([]);
  });

  it('leaves code a child process runs, timers vitest fakes, and names that only look like timers', () => {
    const code = [
      "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)']);",
      "import { setImmediate } from 'node:timers/promises';",
      'await setImmediate();',
      'const run = { setTimeout: 5 }; run.setTimeout += 1;',
    ];
    expect(lint(code)).toEqual([]);
    const fake = ['vi.useFakeTimers();', 'setTimeout(done, 1000);', 'vi.advanceTimersByTime(1000);'];
    expect(lint(fake)).toEqual([]);
  });

  it('flags a timer imported from node:timers even next to fake timers, which replace only the globals', () => {
    const code = [
      'vi.useFakeTimers();',
      "import { setTimeout } from 'node:timers';",
      'setTimeout(done, 1000);',
    ];
    expect(lint(code)).toEqual([`${WAIT}:3`]);
  });

  it('applies to specs only', () => {
    expect(lint(['setTimeout(done, 10);'], 'packages/store/src/lock.ts')).toEqual([]);
  });
});

describe('elvaria/no-real-clock', () => {
  const CLOCK = 'elvaria/no-real-clock';

  it('flags every read of the real clock', () => {
    const code = [
      'const now = Date.now();',
      'const today = new Date();',
      'const stamp = Date();',
      'const started = performance.now();',
      'const precise = process.hrtime.bigint();',
    ];
    expect(lint(code)).toEqual([1, 2, 3, 4, 5].map((line) => `${CLOCK}:${line}`));
  });

  it('leaves a date built from data', () => {
    expect(lint(["new Date('2026-11-06T00:00:00Z');", 'new Date(0);'])).toEqual([]);
  });

  it('leaves the clock to vi.useFakeTimers(), and only Date to vi.setSystemTime()', () => {
    expect(lint(['vi.useFakeTimers();', 'Date.now();', 'performance.now();'])).toEqual([]);
    const systemTime = ["vi.setSystemTime(new Date('2026-11-17'));", 'Date.now();', 'performance.now();'];
    expect(lint(systemTime)).toEqual([`${CLOCK}:3`]);
  });
});

describe('elvaria/timeout-reason', () => {
  const REASON = 'elvaria/timeout-reason';

  it('flags a timeout with no comment, in any of the ways vitest takes one', () => {
    const code = [
      "it('a', { timeout: 10_000 }, async () => {});",
      "describe.each([[1]])('b %s', { timeout: 5000 }, () => {});",
      'beforeAll(async () => {}, 5000);',
      'vi.setConfig({ testTimeout: 5000, hookTimeout: 5000 });',
    ];
    expect(lint(code)).toEqual([`${REASON}:1`, `${REASON}:2`, `${REASON}:3`, `${REASON}:4`, `${REASON}:4`]);
  });

  it('takes a comment above the test, on the timeout, or on its line', () => {
    const code = [
      '// Spawns a cold PowerShell.',
      "it('a', { timeout: 10_000 }, async () => {});",
      'it(',
      "  'b',",
      '  // Builds a real git repo.',
      '  { timeout: 10_000 },',
      '  async () => {},',
      ');',
      "it('c', async () => {",
      '  await run();',
      '}, 10_000); // a real git repo per test',
    ];
    expect(lint(code)).toEqual([]);
  });

  it('does not take a comment that belongs to the last line of the test body', () => {
    const code = ["it('a', async () => {", '  await run(); // starts the run', '}, 10_000);'];
    expect(lint(code)).toEqual([`${REASON}:3`]);
  });

  it("takes a comment beside the declaration of a constant of the file, not an imported one's", () => {
    const code = [
      '/** A live CLI answers in minutes. */',
      'export const MINUTES = 4 * 60_000;',
      'const BARE = 60_000;',
      "import { LIMIT } from './limit.ts';",
      'const SHORT = 5000; // one cold Node start',
      "it('a', { timeout: 3 * MINUTES }, async () => {});",
      "it('b', { timeout: BARE }, async () => {});",
      "it('c', { timeout: LIMIT }, async () => {});",
      "it('d', { timeout: -SHORT }, async () => {});",
    ];
    expect(lint(code)).toEqual([`${REASON}:7`, `${REASON}:8`]);
  });

  it('leaves other options and the timeouts of other calls', () => {
    const code = [
      "it('a', { retry: 2 }, async () => {});",
      "spawnSync('git', [], { timeout: 5000 });",
      "it('b', async () => {}, { retry: 1 });",
      'pattern.test(text);',
    ];
    expect(lint(code)).toEqual([]);
  });
});

describe('temporary folder rule', () => {
  // Keep forbidden API spellings in generated snippets, so the repository scan finds actual uses only.
  const factory = ['mk', 'dtemp'].join('');
  const rule = `elvaria/no-${factory}`;
  it.each(['fs', 'node:fs', 'fs/promises', 'node:fs/promises'])(
    'flags named imports from %s, including aliases',
    (module) => {
      expect(
        lint([`import { ${factory} as folder, ${factory}Sync as syncFolder } from '${module}';`]),
      ).toEqual([`${rule}:1`, `${rule}:1`]);
    },
  );

  it('flags calls through namespace and default imports, including computed properties', () => {
    expect(
      lint([
        "import * as fs from 'node:fs';",
        "import promises from 'fs/promises';",
        `fs.${factory}Sync('prefix');`,
        `promises.${factory}('prefix');`,
        `fs['${factory}']('prefix', done);`,
      ]),
    ).toEqual([`${rule}:3`, `${rule}:4`, `${rule}:5`]);
  });

  it('leaves testkit, other fs calls, unrelated imports and shadowed bindings alone', () => {
    expect(
      lint([
        "import { tempDir } from '@elvaria/testkit';",
        "import * as fs from 'node:fs';",
        "import other from './other.ts';",
        "await tempDir('kingdom');",
        "fs.mkdirSync('child');",
        `other.${factory}('prefix');`,
        `function local(fs) { fs.${factory}('prefix'); }`,
      ]),
    ).toEqual([]);
  });

  it('leaves runtime files and the protected hook specs alone', () => {
    const code = [`import { ${factory} } from 'node:fs/promises';`];
    expect(lint(code, 'packages/store/src/lock.ts')).toEqual([]);
    expect(lint(code, '.claude/hooks/hook-io.spec.ts')).toEqual([]);
  });
});

describe('elvaria()', () => {
  it('keeps all time guards on protected hook specs', () => {
    expect(
      lint(
        ['setTimeout(done, 10);', 'Date.now();', "it('a', async () => {}, 5000);"],
        '.claude/hooks/example.spec.ts',
      ),
    ).toEqual(['elvaria/no-real-wait:1', 'elvaria/no-real-clock:2', 'elvaria/timeout-reason:3']);
  });

  it('runs the test-time rules on every spec', () => {
    const time = elvaria({ root: REPO }).find((config) => config.name === 'elvaria/tests/time');
    expect(time?.files).toEqual(['**/*.spec.ts']);
  });
});
