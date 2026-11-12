// `elvaria upgrade --rollback` (implementation-plan §3.16.4, ADR 0026: "an upgrade that breaks the world is one
// command to undo"; PS-04b): the pointer goes back to the build before, which is still on disk; nothing is built or
// tried, since that build ran before. Both directions hold the Steward's lock while the pointer moves, so no Steward
// starts on a build that is being swapped out.
import { acquireLock, inKingdom, kingdomLayout } from '@elvaria/store';
import { sessionsLeftBehind } from '@elvaria/steward';
import type { HeldLock } from '@elvaria/store';

import { EXIT } from '../command.ts';
import { recordUpgrade } from '../events.ts';
import { BUILD_FILE, buildDirOf, hasCli, readPointer, shortSha, writePointer } from './pointer.ts';
import type { ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** What proper-lockfile locks for `.state/steward.lock` (steward.ts): the Steward's own lock, taken the same way. */
const STEWARD_LOCK_TARGET = kingdomLayout.stewardLock().replace(/\.lock$/, '');

/**
 * Takes the Steward's lock, so no Steward runs and none starts until it is released. Sessions a stopped Steward
 * left running refuse an upgrade (ADR 0026: "no upgrade while a session runs"); a rollback only names them, since
 * the next `elvaria run` of the build it goes back to kills them, and the way back must not wait for that.
 */
export async function holdKingdom(ctx: KingdomContext, refuseLeft: boolean): Promise<HeldLock | undefined> {
  const { io, t } = ctx;
  const root = ctx.store.root;
  const left = await sessionsLeftBehind(root);
  if (left.length > 0 && refuseLeft) {
    io.err(t('cli.upgrade.sessions_left', { count: left.length }));
    return undefined;
  }
  const held = await acquireLock(inKingdom(root, STEWARD_LOCK_TARGET), { wait: false });
  if (!held.ok) {
    io.err(t('cli.upgrade.steward_runs', { kingdom: root }));
    return undefined;
  }
  if (left.length > 0) io.out(t('cli.upgrade.rollback_sessions', { count: left.length }));
  return held.value;
}

export async function rollbackKingdom(ctx: KingdomContext): Promise<ExitCode> {
  const { io, t } = ctx;
  const root = ctx.store.root;
  const read = await readPointer(root);
  if (read.kind !== 'pinned') {
    io.err(
      read.kind === 'none'
        ? t('cli.upgrade.no_pointer')
        : t('cli.build.unreadable', { file: inKingdom(root, BUILD_FILE) }),
    );
    return EXIT.failed;
  }
  const { current, previous } = read.pointer;
  if (previous === null) {
    io.err(t('cli.upgrade.no_previous', { sha: shortSha(current) }));
    return EXIT.failed;
  }
  const dir = buildDirOf(root, previous);
  if (!(await hasCli(dir))) {
    io.err(t('cli.build.missing', { sha: previous, dir }));
    return EXIT.failed;
  }
  const lock = await holdKingdom(ctx, false);
  if (lock === undefined) return EXIT.failed;
  try {
    await writePointer(root, { current: previous, previous: current, switched_at: ctx.now() });
    await recordUpgrade(ctx, 'upgrade.rolled_back', { from: current, to: previous });
  } finally {
    await lock.release();
  }
  io.out(t('cli.upgrade.rolled_back', { sha: shortSha(previous), from: shortSha(current), full: current }));
  return EXIT.ok;
}
