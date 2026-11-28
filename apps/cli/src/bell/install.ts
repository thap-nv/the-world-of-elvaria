import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { EXIT } from '../command-table/command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import { runProcess } from '../process/run-process.ts';
import { BELL_APP_ID, BELL_REGISTRY_KEY, bellIcon } from './identity.ts';
import { REGISTRY_TIMEOUT_MS } from './registration.ts';
import type { CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

type BellAction = 'install' | 'uninstall';

async function changeRegistration(
  ctx: KingdomContext,
  action: BellAction,
  spawn: typeof runProcess,
): Promise<ExitCode> {
  const icon = path.join(ctx.store.root, '.state', 'bell', 'elvaria-bell.png');
  const options = { env: minimalEnv(ctx.io.env), timeoutMs: REGISTRY_TIMEOUT_MS };
  try {
    if (action === 'install') {
      await mkdir(path.dirname(icon), { recursive: true });
      // Pinned builds are pruned after upgrades; Windows must keep a kingdom-owned image.
      await copyFile(bellIcon(), icon);
    }
    const VALUES = [
      ['DisplayName', BELL_APP_ID],
      ['IconUri', path.win32.normalize(icon)],
    ] as const;
    const COMMANDS =
      action === 'install'
        ? VALUES.map(([name, value]) => [
            'add',
            BELL_REGISTRY_KEY,
            '/v',
            name,
            '/t',
            'REG_SZ',
            '/d',
            value,
            '/f',
          ])
        : [['delete', BELL_REGISTRY_KEY, '/f']];
    for (const args of COMMANDS) {
      const result = await spawn('reg.exe', args, options);
      if (result.code !== 0) {
        ctx.io.err(
          ctx.t(`bell.${action}.failed`, { why: result.stderr.trim() || result.stdout.trim() || '—' }),
        );
        return EXIT.failed;
      }
    }
    if (action === 'uninstall') await rm(icon, { force: true });
    ctx.io.out(ctx.t(`bell.${action}.done`));
    return EXIT.ok;
  } catch (error) {
    ctx.io.err(
      ctx.t(`bell.${action}.failed`, { why: error instanceof Error ? error.message : String(error) }),
    );
    return EXIT.failed;
  }
}

/** The fake process runner in tests never writes the owner's registry. */
export function bellCommand(action: BellAction, spawn: typeof runProcess = runProcess): CommandSpec {
  return {
    name: ['bell', action],
    summary: `bell.${action}.summary`,
    args: [],
    options: {},
    run: async (input, cli) => {
      if (cli.io.platform !== 'win32') {
        cli.io.out(cli.t('bell.nothing', { platform: cli.io.platform }));
        return EXIT.ok;
      }
      const ctx = await openKingdomContext(input, cli);
      return ctx === undefined ? EXIT.failed : changeRegistration(ctx, action, spawn);
    },
  };
}

export const BELL_INSTALL = bellCommand('install');
export const BELL_UNINSTALL = bellCommand('uninstall');
