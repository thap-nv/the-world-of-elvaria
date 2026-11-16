// The forge port (implementation-plan §3.16.7, ADR 0023; PS-08c): where a territory's remote and its pull requests
// live. The Steward pushes quest/<id> itself (push.ts); everything after the push goes through this port. apps/cli,
// the composition root, gives one adapter per id of territory.delivery.forge (GitHub's REST API first), whose network
// is the CLI's fetch ((e) of PS-08). An adapter asks git for the credential at every call and keeps none, and every
// message it gives back has been through `redact` with the token as a known value: nothing here holds a secret.
import type { DeliveryForge, MergeMethod, Result } from '@elvaria/domain';
import type { Launch } from '@elvaria/runner-core';

/** A territory's repo on its forge, read from vcs.remote (repoOf). */
export interface ForgeRepo {
  readonly owner: string;
  readonly name: string;
  /** The territory's folder, native: git is asked for the credential there, so its own helper settings count. */
  readonly cwd: string;
}

/**
 * Why a call gave nothing: git has no credential for the forge's host, the forge refused it (401, 403), or anything
 * else (the network, the time limit, a server error, an answer it could not read). `detail` is redacted.
 */
export interface ForgeProblem {
  readonly reason: 'no_credential' | 'forge_auth' | 'forge_error';
  readonly detail?: string;
}

export type ForgeResult<T> = Promise<Result<T, ForgeProblem>>;

export interface PullRequest {
  readonly number: number;
  readonly url: string;
}

/** A pull request to open: `head` is the branch, `base` the territory's default branch. */
export interface PullRequestDraft {
  readonly head: string;
  readonly base: string;
  readonly title: string;
  readonly body: string;
}

/** A check run or status context of the pull request's head, as the forge words its conclusion. */
export interface ForgeCheck {
  readonly name: string;
  readonly conclusion: string;
  readonly url?: string;
}

export const PULL_STATES = ['pending', 'green', 'red', 'conflict', 'merged', 'closed'] as const;
export type PullState = (typeof PULL_STATES)[number];

/** Where a pull request stands for `pr_merge` (PS-08d): its state, the head the forge has, the required checks. */
export interface PullStatus {
  readonly state: PullState;
  readonly head: string;
  readonly checks: readonly ForgeCheck[];
}

/** A merge the forge refused: the pull request cannot merge cleanly, or its head is not the one asked for. */
export interface MergeProblem {
  readonly reason: ForgeProblem['reason'] | 'conflict' | 'head_moved';
  readonly detail?: string;
}

export interface Forge {
  /** The repo `remote` names on this forge, git asked in `cwd`; undefined when it names none. */
  repoOf(remote: string, cwd: string): ForgeRepo | undefined;
  /** Whether the credential's account may push to `repo`. */
  access(repo: ForgeRepo): ForgeResult<'push' | 'read_only'>;
  /** The branch's pull request: found first, in any state (an open one before a closed one), else opened. */
  open(repo: ForgeRepo, draft: PullRequestDraft): ForgeResult<PullRequest>;
  /** Where pull request `pr` stands; `required` names the checks that count (none: the forge's mergeable says). */
  status(repo: ForgeRepo, pr: number, required: readonly string[]): ForgeResult<PullStatus>;
  /** Merges `pr` by `method` only while its head is `head`; the merge commit's sha. */
  merge(
    repo: ForgeRepo,
    pr: number,
    options: { readonly method: MergeMethod; readonly head: string },
  ): Promise<Result<string, MergeProblem>>;
  /** Deletes `branch` on the forge only while its tip is `head`: false when it moved or is gone. */
  deleteBranch(repo: ForgeRepo, branch: string, head: string): ForgeResult<boolean>;
}

/**
 * What the Steward delivers with: an adapter per forge id, and git as the composition root found it. Absent: a
 * territory whose delivery is not manual gets one `delivery.failed` (`forge_error`) per quest.
 */
export interface Forges {
  readonly adapters: Readonly<Partial<Record<DeliveryForge, Forge>>>;
  readonly git: Launch;
}

/**
 * The two switches of a delivery's git ((L) of PS-08, .claude/rules/runner.md): nobody sits at a background push, so
 * git asks no terminal and Git Credential Manager opens no window. GIT_TERMINAL_PROMPT is the one GIT_* variable
 * Elvaria sets, and only here; GCM_INTERACTIVE means nothing on macOS and harms nothing.
 */
export const DELIVERY_GIT_SWITCHES: Readonly<Record<string, string>> = {
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
};
