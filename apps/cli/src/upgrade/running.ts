// Which build a command runs on, said where the owner looks (PS-04b, "print the sha at startup"): `elvaria run`
// names it as it starts, `elvaria doctor` says what the kingdom pins and whether this command runs on it.
import { inKingdom } from '@elvaria/store';
import type { Translate } from '@elvaria/i18n';

import { finding } from '../doctor/finding.ts';
import { sameFolder } from './pin.ts';
import { BUILD_FILE, buildDirOf, buildShaOf, hasCli, readPointer, shortSha } from './pointer.ts';
import { SELF_ROOT } from './self.ts';
import type { Finding } from '../doctor/finding.ts';

/** `elvaria run`'s line: the pinned build it runs on, or the source folder when it runs on none. */
export function runningLine(t: Translate, self: string = SELF_ROOT): string {
  const sha = buildShaOf(self);
  return sha === undefined
    ? t('cli.run.build_source', { root: self })
    : t('cli.run.build', { sha: shortSha(sha), dir: self });
}

/** The doctor's line about the pin: an error when the pinned build cannot run, a warning under `--here`. */
export async function checkBuild(
  t: Translate,
  root: string,
  platform: NodeJS.Platform,
  self: string = SELF_ROOT,
): Promise<Finding> {
  const read = await readPointer(root);
  if (read.kind === 'none') return finding('ok', t('cli.build.doctor_none', { root: self }));
  if (read.kind === 'unreadable')
    return finding('error', t('cli.build.unreadable', { file: inKingdom(root, BUILD_FILE) }));
  const { current, previous } = read.pointer;
  const dir = buildDirOf(root, current);
  if (!(await hasCli(dir))) return finding('error', t('cli.build.missing', { sha: current, dir }));
  if (!(await sameFolder(self, dir, platform)))
    return finding('warn', t('cli.build.doctor_here', { sha: shortSha(current), root: self }));
  return finding('ok', await wayBackLine(t, root, current, previous));
}

/**
 * The pinned build's line with the way back: the build before counts only while its CLI is on disk, as rollback.ts
 * checks before it moves the pointer (170): a kingdom moved to another machine without `.builds/` has none. Not a
 * warning: a first pin has no way back either, and the next upgrade keeps one again.
 */
async function wayBackLine(
  t: Translate,
  root: string,
  current: string,
  previous: string | null,
): Promise<string> {
  const sha = shortSha(current);
  if (previous === null) return t('cli.build.doctor_pinned_first', { sha });
  const dir = buildDirOf(root, previous);
  return (await hasCli(dir))
    ? t('cli.build.doctor_pinned', { sha, previous: shortSha(previous) })
    : t('cli.build.doctor_pinned_gone', { sha, previous: shortSha(previous), dir });
}
