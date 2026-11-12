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
  return previous === null
    ? finding('ok', t('cli.build.doctor_pinned_first', { sha: shortSha(current) }))
    : finding('ok', t('cli.build.doctor_pinned', { sha: shortSha(current), previous: shortSha(previous) }));
}
