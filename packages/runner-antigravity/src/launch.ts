// How agy (and the hook it runs) is started: the shape of `hookCommand()` of @elvaria/hooks, `{command, args}`.
// runner-core's spawn and kill tree (P1-06) take runner-core's `Launch`, `{file, args}`.
import type { Launch as ProgramLaunch } from '@elvaria/runner-core';

/** The absolute CLI (`tribes[].tool.path`), or node + a script (an npm shim, a fake). */
export interface Launch {
  readonly command: string;
  readonly args: readonly string[];
}

export const programOf = (launch: Launch): ProgramLaunch => ({ file: launch.command, args: launch.args });
