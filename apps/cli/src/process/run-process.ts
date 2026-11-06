// Starts a program without a shell and collects its output (ADR 0015: `shell: false` everywhere, so no quoting
// differs between cmd, PowerShell and sh). The CLI only runs short probes (`git rev-parse`, `<tool> --version`);
// long-lived sessions and kill trees belong to runner-core (P1-06).
import { spawn } from 'node:child_process';

export interface ProcessOutcome {
  /** null when the program did not start, was killed or timed out. */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessOptions {
  readonly env: Readonly<Record<string, string>>;
  readonly cwd?: string;
  readonly timeoutMs: number;
}

export function runProcess(
  file: string,
  args: readonly string[],
  options: ProcessOptions,
): Promise<ProcessOutcome> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeoutMs,
    });
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    // A program that cannot start (missing, not executable) emits `error` and maybe no `close`.
    child.on('error', (error) => {
      resolve({ code: null, stdout, stderr: stderr || error.message });
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
