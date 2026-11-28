import { minimalEnv } from '../process/minimal-env.ts';
import { runProcess } from '../process/run-process.ts';
import { BELL_REGISTRY_KEY } from './identity.ts';
import type { CliIo } from '../io.ts';

export const REGISTRY_TIMEOUT_MS = 10_000;
const QUERY_ARGS = ['query', BELL_REGISTRY_KEY, '/v', 'DisplayName'];

/** The caller probes once at startup; ringing a toast never reads the registry. */
export async function bellRegistered(
  io: Pick<CliIo, 'platform' | 'env'>,
  spawn: typeof runProcess = runProcess,
): Promise<boolean> {
  if (io.platform !== 'win32') return false;
  const result = await spawn('reg.exe', QUERY_ARGS, {
    env: minimalEnv(io.env),
    timeoutMs: REGISTRY_TIMEOUT_MS,
  });
  return result.code === 0;
}
