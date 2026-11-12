// `data` of the lines about the build a kingdom runs (implementation-plan §3.16.4, ADR 0026; PS-04b): `elvaria
// upgrade` builds a commit of the Elvaria repo beside the pinned one, tries it, and only then moves the pointer
// `.state/build.json`; `--rollback` moves it back. The CLI writes these lines (actor `user`), as it writes
// territory.attached: no Steward runs while the pointer moves.
import { z } from 'zod';

import { NonEmptyStringSchema } from '../common.ts';

const describe = (description: string) => ({ description });

/** A full commit id: 40 hex digits (SHA-1), or 64 in a repo that uses SHA-256. */
export const CommitShaSchema = z
  .string()
  .regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/)
  .meta(describe('A full commit id of the Elvaria repo: the name of the build folder `.builds/<sha>/`.'));

/** What an upgrade tries before it moves the pointer, in order; `prepare` is the worktree, install and build. */
export const UPGRADE_STEPS = ['prepare', 'doctor', 'conformance', 'trial'] as const;
export type UpgradeStep = (typeof UPGRADE_STEPS)[number];

export const UpgradeStartedDataSchema = z
  .strictObject({
    ref: NonEmptyStringSchema.meta(describe('What the owner asked for (`--ref`), as typed.')),
    to: CommitShaSchema,
    from: CommitShaSchema.nullable().meta(describe('The pinned build; null when the kingdom had none.')),
  })
  .meta(describe('`elvaria upgrade` began building and trying a commit (implementation-plan §3.16.4).'));

export const UpgradeSwitchedDataSchema = z
  .strictObject({ from: CommitShaSchema.nullable(), to: CommitShaSchema })
  .meta(describe('Every trial passed: the pointer now names the new build; `from` is kept as the way back.'));

export const UpgradeRolledBackDataSchema = z
  .strictObject({ from: CommitShaSchema, to: CommitShaSchema })
  .meta(describe('`elvaria upgrade --rollback`: the pointer went back from `from` to the build before it.'));

export const UpgradeFailedDataSchema = z
  .strictObject({
    to: CommitShaSchema,
    step: z.enum(UPGRADE_STEPS),
    reason: NonEmptyStringSchema.meta(describe('One line, redacted: the exit code or the error.')),
  })
  .meta(describe('A step of the upgrade failed: the pointer did not move and the new build was removed.'));
