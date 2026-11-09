// The kit an owner adapter file is handed (implementation-plan §3.14, ADR 0021): `<kingdom>/adapters/<name>.mjs`
// exports `createAdapter(kit)` and imports nothing, so the kingdom needs no node_modules. The kit is the part of
// runner-core every adapter shares (spawn and kill tree, the run's context and policy.json, the run log and redacted
// output, the handover's Question, the tool fences) plus what the composition root knows of the machine. The prompt,
// the tool policy and the plot already arrive in each SpawnRequest; the adapter only translates.
import { countedTokens } from '@elvaria/domain';
import type { Tribe } from '@elvaria/domain';
import { fromPortable } from '@elvaria/store';

import { commandRefusal } from '../policy/command-refusal.ts';
import { NO_PUSH_COMMAND } from '../policy/constants.ts';
import { toolOf } from '../policy/tool-policy.ts';
import { runToEnd, startChild } from '../process/child.ts';
import { KILL_GRACE_MS, killTree } from '../process/kill-tree.ts';
import { HANDOVER_SECTIONS, readQuestion } from '../runner/handover.ts';
import { writePolicyFile } from '../runner/policy-file.ts';
import { contextEnv, runContextOf } from '../runner/run-context.ts';
import { openRunLog } from '../runner/run-log.ts';
import { openRunOutput } from '../runner/run-output.ts';
import { RUN_OUTCOMES } from '../runner/types.ts';
import { createSignalChannel } from '../runner/signal-channel.ts';
import { secretValuesOf, sessionRedactor } from '../treasury/session-env.ts';
import { writeRunFile } from './run-file.ts';
import type { Launch } from '../process/program.ts';
import type { AbsolutePath } from '../runner/types.ts';

/** Raised when the kit changes in a way an adapter file written for this one would break on. */
export const ADAPTER_KIT_VERSION = 1;

/** The hook's command in the exec form (`hookCommand` of @elvaria/hooks, which runner-core may not import). */
export interface KitHookCommand {
  readonly command: string;
  readonly args: readonly string[];
}

/** What the composition root knows of the machine and the tribe (`apps/cli`, the only place that loads files). */
export interface KitHost {
  /** The tribe's entry in kingdom.json: id, adapter, the pinned tool, pools, budget. */
  readonly tribe: Tribe;
  readonly kingdom: AbsolutePath;
  /** The minimal env of every child (§3.9): never the whole process env, never a secret. */
  readonly env: Readonly<Record<string, string>>;
  readonly platform: NodeJS.Platform;
  /** The Node running Elvaria: a CLI that is a Node script starts with it. */
  readonly node_path: AbsolutePath;
  /** The CLI to drive: `elvaria doctor --tool <tribe>=<path>`, else the pinned one; undefined: the adapter looks. */
  readonly tool_path?: AbsolutePath;
  /** How to start a file without a shell: a Windows npm shim becomes `node <script>` (§6). */
  readonly launchOf: (file: AbsolutePath) => Promise<Launch | undefined>;
  readonly hookCommand: (policyFile?: string) => KitHookCommand;
}

export interface AdapterKit {
  readonly version: typeof ADAPTER_KIT_VERSION;
  /** The tribe the runner serves: `AgentRunner.tribe` is its id, `AgentRunner.adapter` its adapter. */
  readonly tribe: Tribe;
  readonly kingdom: AbsolutePath;
  readonly env: Readonly<Record<string, string>>;
  readonly platform: NodeJS.Platform;
  readonly node_path: AbsolutePath;
  /** The CLI in the machine's own path form, or undefined until doctor pins one. */
  readonly tool_path: AbsolutePath | undefined;
  readonly launchOf: KitHost['launchOf'];
  readonly hookCommand: KitHost['hookCommand'];
  /** Start a CLI without a shell and read it line by line; kill its whole tree (P1-06). */
  readonly process: {
    readonly startChild: typeof startChild;
    readonly runToEnd: typeof runToEnd;
    readonly killTree: typeof killTree;
    readonly KILL_GRACE_MS: number;
  };
  /** One session's side of the contract: signals, context and policy.json, the log, output and letter. */
  readonly session: {
    readonly createSignalChannel: typeof createSignalChannel;
    readonly runContextOf: typeof runContextOf;
    readonly contextEnv: typeof contextEnv;
    readonly writePolicyFile: typeof writePolicyFile;
    /** A file of the run (the CLI's settings, the prompt): `<run_dir>/<name>`, nowhere else. */
    readonly writeRunFile: typeof writeRunFile;
    readonly openRunLog: typeof openRunLog;
    readonly openRunOutput: typeof openRunOutput;
    readonly readQuestion: typeof readQuestion;
    readonly secretValuesOf: typeof secretValuesOf;
    readonly sessionRedactor: typeof sessionRedactor;
    readonly countedTokens: typeof countedTokens;
    readonly RUN_OUTCOMES: typeof RUN_OUTCOMES;
    readonly HANDOVER_SECTIONS: typeof HANDOVER_SECTIONS;
  };
  /** The fences every session keeps, for a CLI whose own rules the adapter writes from `req.permissions`. */
  readonly policy: {
    readonly commandRefusal: typeof commandRefusal;
    readonly toolOf: typeof toolOf;
    /** The regex source that catches `git -C . push` as well as `git push`. */
    readonly NO_PUSH_COMMAND: string;
  };
}

/** The kit for one tribe. Frozen: an adapter file cannot change what the next one is handed. */
export function adapterKitOf(host: KitHost): AdapterKit {
  const pinned =
    host.tribe.tool === undefined ? undefined : fromPortable(host.tribe.tool.path, host.platform);
  return Object.freeze({
    version: ADAPTER_KIT_VERSION,
    tribe: host.tribe,
    kingdom: host.kingdom,
    env: Object.freeze({ ...host.env }),
    platform: host.platform,
    node_path: host.node_path,
    tool_path: host.tool_path ?? pinned,
    launchOf: host.launchOf,
    hookCommand: host.hookCommand,
    process: Object.freeze({ startChild, runToEnd, killTree, KILL_GRACE_MS }),
    session: Object.freeze({
      createSignalChannel,
      runContextOf,
      contextEnv,
      writePolicyFile,
      writeRunFile,
      openRunLog,
      openRunOutput,
      readQuestion,
      secretValuesOf,
      sessionRedactor,
      countedTokens,
      RUN_OUTCOMES,
      HANDOVER_SECTIONS,
    }),
    policy: Object.freeze({ commandRefusal, toolOf, NO_PUSH_COMMAND }),
  });
}
