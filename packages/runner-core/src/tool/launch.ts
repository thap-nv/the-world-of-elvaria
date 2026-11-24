// How a tribe's CLI (and the hook it runs) is started: the shape of `hookCommand()` of @elvaria/hooks and of
// `tribes[].tool.path`, `{command, args}`, which runner-core's spawn and kill tree take as `{file, args}`.
import type { Launch } from '../process/program.ts';

/** The absolute CLI (`tribes[].tool.path`), or node and a script (an npm shim, a fake CLI). */
export interface CommandLaunch {
  readonly command: string;
  readonly args: readonly string[];
}

export const programOf = (launch: CommandLaunch): Launch => ({ file: launch.command, args: launch.args });

/** The version a CLI prints: `codex-cli 0.167.0-alpha.4.1` → `0.167.0-alpha.4.1`, agy's `1.5.2` as it is. */
export const toolVersionOf = (stdout: string): string | undefined => /\d+\.\d+\.\d+\S*/.exec(stdout)?.[0];
