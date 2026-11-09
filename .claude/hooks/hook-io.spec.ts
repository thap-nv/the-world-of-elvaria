import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import {
  FD_0,
  REPO,
  binOf,
  readPayload,
  readStdin,
  repoPath,
  runNode,
  toolEnv,
  toolInput,
} from './hook-io.mjs';

describe('readPayload and toolInput', () => {
  it('reads the JSON object on stdin, or an empty object for anything else', () => {
    expect(readPayload(() => '{"tool_input":{"command":"ls"}}')).toEqual({ tool_input: { command: 'ls' } });
    expect(readPayload(() => '')).toEqual({});
    expect(readPayload(() => '[1]')).toEqual({});
    expect(readPayload(() => 'null')).toEqual({});
    expect(
      readPayload(() => {
        throw new Error('EAGAIN');
      }),
    ).toEqual({});
  });

  it('keeps what it read before EAGAIN and reads the rest after it (P1-36)', () => {
    const steps = ['{"tool_input":', 'EAGAIN', 'EAGAIN', '{"command":"ls"}}'];
    const waits: number[] = [];
    const source = {
      read: (buffer: Buffer) => {
        const step = steps.shift();
        if (step === undefined) return 0;
        if (step === 'EAGAIN') throw Object.assign(new Error('EAGAIN'), { code: 'EAGAIN' });
        return Buffer.from(step, 'utf8').copy(buffer);
      },
      wait: (ms: number) => waits.push(ms),
    };
    expect(readPayload(() => readStdin(source))).toEqual({ tool_input: { command: 'ls' } });
    expect(waits).toEqual([1, 1]);
    const broken = {
      read: (): number => {
        throw Object.assign(new Error('EBADF'), { code: 'EBADF' });
      },
      wait: () => undefined,
    };
    expect(() => readStdin(broken)).toThrow('EBADF');
    const started = performance.now();
    FD_0.wait(5);
    expect(performance.now() - started).toBeGreaterThanOrEqual(4);
  });

  it('reads a payload whole on a non-blocking stdin written in two halves, as the guards run', async () => {
    // Touching process.stdin opens fd 0 as a libuv pipe, non-blocking on POSIX: the next read after the first
    // half fails with EAGAIN, where readFileSync(0) threw the first half away and the guard let the call run.
    const child = spawn(
      process.execPath,
      ['--import', 'data:text/javascript,process.stdin', join(REPO, '.claude/hooks/guard-bash.mjs')],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    const closed = once(child, 'close') as Promise<[number | null]>;
    const command = ['git', 'push', '--force'].join(' ');
    const text = JSON.stringify({ cwd: REPO, tool_name: 'Bash', tool_input: { command } });
    child.stdin.write(text.slice(0, text.length / 2));
    await setTimeout(300);
    child.stdin.end(text.slice(text.length / 2));
    expect((await closed)[0]).toBe(2);
    expect(stderr).toMatch(/Force push is not allowed/);
  });

  it('reads one string field of tool_input', () => {
    expect(toolInput({ tool_input: { command: 'ls', timeout: 5 } }, 'command')).toBe('ls');
    expect(toolInput({ tool_input: { timeout: 5 } }, 'timeout')).toBe('');
    expect(toolInput({}, 'command')).toBe('');
  });
});

describe('repoPath', () => {
  it('turns an absolute or relative path inside the checkout into a repo path with /', () => {
    expect(repoPath(join(REPO, 'packages', 'domain', 'src', 'index.ts'))).toBe(
      'packages/domain/src/index.ts',
    );
    expect(repoPath('apps/cli/src/cli.ts')).toBe('apps/cli/src/cli.ts');
  });

  it('gives undefined outside the checkout, for the checkout itself and for no path', () => {
    expect(repoPath(join(REPO, '..', 'p0-10', 'CLAUDE.md'))).toBeUndefined();
    expect(repoPath(REPO)).toBeUndefined();
    expect(repoPath('')).toBeUndefined();
  });
});

describe('tools', () => {
  it('hands tools only the variables they need', () => {
    expect(
      toolEnv({ PATH: '/bin', HOME: '/home/x', CLAUDE_CODE_MESSAGING_TOKEN: 's', GIT_DIR: '/x' }),
    ).toEqual({
      PATH: '/bin',
      HOME: '/home/x',
    });
  });

  it('finds the bin scripts of the repo root dependencies', () => {
    expect(existsSync(binOf('typescript', 'tsc'))).toBe(true);
    expect(existsSync(binOf('dependency-cruiser', 'depcruise'))).toBe(true);
    expect(() => binOf('typescript', 'nope')).toThrow(/no bin "nope"/);
  });

  it('runs a script with node in the checkout; only a finished failing run is not ok', () => {
    const dir = mkdtempSync(join(tmpdir(), 'elvaria hook-io '));
    const script = (name: string, body: string): string => {
      writeFileSync(join(dir, name), body);
      return join(dir, name);
    };
    expect(runNode(script('ok.mjs', 'console.log(process.cwd())'), [], 10_000)).toEqual({
      ok: true,
      output: REPO,
    });
    expect(runNode(script('fail.mjs', 'console.error("bad"); process.exit(3)'), [], 10_000)).toEqual({
      ok: false,
      output: 'bad',
    });
    // A run that times out is the machine's problem, not the agent's mistake.
    expect(runNode(script('slow.mjs', 'setTimeout(() => {}, 5000)'), [], 200).ok).toBe(true);
  });
});

describe('.claude/settings.json', () => {
  interface Hook {
    command: string;
    args: string[];
  }
  const settings = JSON.parse(readFileSync(join(REPO, '.claude/settings.json'), 'utf8')) as {
    hooks: Record<string, { hooks: Hook[] }[]>;
  };
  const hooks = Object.values(settings.hooks).flatMap((entries) => entries.flatMap((entry) => entry.hooks));

  it('runs each hook in exec form, node plus a script that exists, through ${CLAUDE_PROJECT_DIR}', () => {
    // Claude Code 2.1.318 expands `${CLAUDE_PROJECT_DIR}` in exec-form args but not `$CLAUDE_PROJECT_DIR`
    // (checked with a SessionStart hook under a model that does not exist, implementation-plan §5.1).
    expect(hooks).toHaveLength(4);
    for (const hook of hooks) {
      expect(hook.command).toBe('node');
      const [script] = hook.args;
      expect(script).toMatch(/^\$\{CLAUDE_PROJECT_DIR\}\/\.claude\/hooks\/[a-z-]+\.mjs$/);
      expect(existsSync(join(REPO, (script ?? '').replace('${CLAUDE_PROJECT_DIR}', '')))).toBe(true);
    }
  });
});
