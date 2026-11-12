// What the `elvaria` bin does with its words (PS-04b): run them here, or on the build the kingdom pins. A pin that
// cannot be honoured stops the command, since running another build would be the thing the pin prevents; the
// line says how to leave it (`elvaria upgrade --rollback`, `--here`).
import { DEFAULT_LOCALE, isLocale, translator } from '@elvaria/i18n';

import { EXIT } from '../command.ts';
import { localeFlag, runCli } from '../run-cli.ts';
import { pinOf } from './pin.ts';
import { relaunch } from './relaunch.ts';
import { SELF_ROOT } from './self.ts';
import type { CliIo } from '../io.ts';
import type { SignalSource } from './relaunch.ts';

export async function elvaria(
  argv: readonly string[],
  io: CliIo,
  signals: SignalSource,
  self: string = SELF_ROOT,
): Promise<number> {
  const pin = await pinOf(argv, io, self);
  if (pin.kind === 'here') return runCli(argv, io);
  if (pin.kind === 'pinned') return relaunch(pin.entry, pin.sha, argv, io, signals);
  const flag = localeFlag(argv);
  const t = translator(flag !== undefined && isLocale(flag) ? flag : DEFAULT_LOCALE);
  io.err(
    pin.kind === 'unreadable'
      ? t('cli.build.unreadable', { file: pin.file })
      : t('cli.build.missing', { sha: pin.sha, dir: pin.dir }),
  );
  return EXIT.failed;
}
