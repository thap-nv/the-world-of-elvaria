// The Gemini tribe's runner for `elvaria run` (implementation-plan §3.7, ADR 0018, 0021; P1-15 after the owner's
// decision): runner-antigravity of P1-12b behind AgentRunner. agy starts from the path `elvaria doctor` pinned (else
// PATH); a Windows npm shim is read and its script run with Node, which needs a file read, so the adapter is built
// on first use and the crew stays a plain function of kingdom.json. The hook's command comes from @elvaria/hooks,
// which the adapter may not import (§1.3).
import { hookCommand } from '@elvaria/hooks';
import {
  ANTIGRAVITY_ADAPTER,
  ANTIGRAVITY_CAPABILITIES,
  createAntigravityRunner,
} from '@elvaria/runner-antigravity';
import type { Tribe } from '@elvaria/domain';
import type { AgentRunner } from '@elvaria/runner-core';
import { fromPortable } from '@elvaria/store';

import { findExecutable } from '../process/find-executable.ts';
import { launchOf } from '../process/launch.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import type { CliIo } from '../io.ts';

/** The program agy's adapter is started with, or why there is none. */
async function agyLaunch(tribe: Tribe, io: CliIo) {
  const file =
    tribe.tool === undefined
      ? await findExecutable('agy', io.env, io.platform)
      : fromPortable(tribe.tool.path, io.platform);
  if (file === undefined)
    throw new Error(`tribe ${tribe.id}: agy is not pinned and not on PATH (elvaria doctor)`);
  const launch = await launchOf(file, io.nodePath);
  if (launch === undefined) throw new Error(`tribe ${tribe.id}: ${file} cannot be started without a shell`);
  return { command: launch.file, args: launch.args };
}

/** The pools of the tribe its probe watches: the enabled ones (kingdom.json `tribes[].pools`). */
const enabledPools = (tribe: Tribe): string[] | undefined =>
  tribe.pools === undefined
    ? undefined
    : Object.entries(tribe.pools)
        .filter(([, pool]) => pool.enabled)
        .map(([id]) => id);

export function antigravityRunner(tribe: Tribe, io: CliIo): AgentRunner {
  let built: Promise<AgentRunner> | undefined;
  const runner = () =>
    (built ??= agyLaunch(tribe, io).then((launch) => {
      const pools = enabledPools(tribe);
      return createAntigravityRunner({
        tribe: tribe.id,
        launch,
        hook: hookCommand(),
        terms_acknowledged_at: tribe.tool?.terms_acknowledged_at,
        env: minimalEnv(io.env),
        ...(pools === undefined ? {} : { pools }),
      });
    }));
  return {
    tribe: tribe.id,
    adapter: ANTIGRAVITY_ADAPTER,
    capabilities: ANTIGRAVITY_CAPABILITIES,
    spawn: async (req) => (await runner()).spawn(req),
    probe: async (options) => (await runner()).probe(options),
    doctor: async () => (await runner()).doctor(),
  };
}
