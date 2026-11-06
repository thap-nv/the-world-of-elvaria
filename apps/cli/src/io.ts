// Everything the CLI takes from the machine, passed in: commands then run in-process under test with a fixed
// clock, fixed randomness and captured output, the same way the domain gets a Clock (ADR 0002).
import type { Clock, RandomSource } from '@elvaria/domain';

export type Env = Readonly<Record<string, string | undefined>>;

export interface CliIo {
  /** One line the owner reads (stdout). */
  readonly out: (line: string) => void;
  /** One line about a problem (stderr). */
  readonly err: (line: string) => void;
  /** Read through, never copied: on Windows `process.env` matches names without case (`Path`, `PATH`). */
  readonly env: Env;
  /** Where relative paths on the command line start. */
  readonly cwd: string;
  /** The owner's home folder: the default treasury is `~/.elvaria/treasury.json` (implementation-plan §6). */
  readonly home: string;
  /** IANA zone of the machine, written into a new kingdom.json. */
  readonly timeZone: string;
  readonly platform: NodeJS.Platform;
  /** Absolute path of the running Node, to start an npm `.cmd` shim's script without a shell (ADR 0015). */
  readonly nodePath: string;
  readonly clock: Clock;
  readonly random: RandomSource;
}
