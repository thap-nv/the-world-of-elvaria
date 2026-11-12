// The Codex tribe's runner for `elvaria run` (implementation-plan §3.7, §3.14, ADR 0021; P1-12d): runner-codex behind
// AgentRunner. Codex starts from the path `elvaria doctor` pinned, else PATH, else the VS Code extension's binary
// (locateCodex); a Windows npm shim is read and its script run with Node, which needs a file read, so the adapter
// is built on first use and the crew stays a plain function of kingdom.json. The hook's command comes from
// @elvaria/hooks, which the adapter may not import (§1.3).
import { hookCommand } from '@elvaria/hooks';
import { CODEX_ADAPTER, CODEX_CAPABILITIES, createCodexRunner, locateCodex } from '@elvaria/runner-codex';
import type { Tribe } from '@elvaria/domain';
import type { AgentRunner } from '@elvaria/runner-core';
import { fromPortable } from '@elvaria/store';

import { findExecutable } from '../process/find-executable.ts';
import { launchOf } from '../process/launch.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import type { CliIo } from '../io.ts';

/** The program Codex's adapter is started with, or why there is none. */
async function codexLaunch(tribe: Tribe, io: CliIo) {
  const file =
    tribe.tool === undefined
      ? ((await findExecutable('codex', io.env, io.platform)) ??
        (await locateCodex({ ...io.env, HOME: io.home, USERPROFILE: io.home }, io.platform)))
      : fromPortable(tribe.tool.path, io.platform);
  if (file === undefined)
    throw new Error(`tribe ${tribe.id}: codex is not pinned and not found (elvaria doctor)`);
  const launch = await launchOf(file, io.nodePath);
  if (launch === undefined) throw new Error(`tribe ${tribe.id}: ${file} cannot be started without a shell`);
  return { command: launch.file, args: launch.args };
}

export function codexRunner(tribe: Tribe, io: CliIo): AgentRunner {
  let built: Promise<AgentRunner> | undefined;
  const runner = () =>
    (built ??= codexLaunch(tribe, io).then((launch) =>
      createCodexRunner({
        tribe: tribe.id,
        launch,
        hook: hookCommand(),
        env: minimalEnv(io.env),
        platform: io.platform,
      }),
    ));
  return {
    tribe: tribe.id,
    adapter: CODEX_ADAPTER,
    capabilities: CODEX_CAPABILITIES,
    spawn: async (req) => (await runner()).spawn(req),
    probe: async (options) => (await runner()).probe(options),
    doctor: async () => (await runner()).doctor(),
  };
}
