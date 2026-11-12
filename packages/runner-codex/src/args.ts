// Codex's argv for one session (spike Codex 2026-11-12 §1.3–§1.10, §4, §5): everything through `-c`, since
// `exec resume` takes neither `-s`, `-C` nor `--add-dir`, so a new session and a resumed one carry the same flags.
// The prompt goes on stdin (`-`). Never `--dangerously-bypass-approvals-and-sandbox`, `--worktree` or `--ephemeral`
// (a resumed session needs its rollout); `--dangerously-bypass-hook-trust` only after the hooks check (hooks.ts).
import path from 'node:path';

import type { SpawnRequest } from '@elvaria/runner-core';

import { hookConfigArgs } from './hooks.ts';
import { modelOf } from './launch.ts';
import { sessionWrites } from './run-files.ts';
import type { Launch } from './launch.ts';
import type { RunFiles } from './run-files.ts';

/** The owner chose it, guarded by the hooks check (ADR 0021, amended 2026-11-12). */
export const BYPASS_HOOK_TRUST = '--dangerously-bypass-hook-trust';
/** Codex features no class of Elvaria uses: the owner's plugins and connectors, generated images (spike §1.7). */
export const FEATURES_OFF = ['plugins', 'apps', 'image_generation'] as const;
/** The system prompt and the territory's law files live in AGENTS.override.md: room for all of them. */
export const CONTEXT_FILE_MAX_BYTES = 1_048_576;

/** A TOML basic string: JSON's escapes are TOML's. */
const toml = (text: string): string => JSON.stringify(text);

/**
 * The `-c` settings of a session: no approvals asked, Windows' sandbox without an administrator's setup, the temp
 * folders out of the writable roots (else a plot in %TEMP% lets every write out, spike §4), the network on as for
 * the other tribes, and the quest's folder writable for the handover letter, which lives outside the plot.
 */
export function configOf(req: SpawnRequest): string[] {
  const writes = sessionWrites(req);
  const letter = writes && req.handover !== undefined ? [path.dirname(req.handover)] : [];
  const web = req.permissions.tools.some((tool) => tool === 'WebFetch' || tool === 'WebSearch');
  const { effort } = modelOf(req.character.model);
  return [
    'approval_policy="never"',
    `sandbox_mode="${writes ? 'workspace-write' : 'read-only'}"`,
    'windows.sandbox="unelevated"',
    'sandbox_workspace_write.exclude_tmpdir_env_var=true',
    'sandbox_workspace_write.exclude_slash_tmp=true',
    'sandbox_workspace_write.network_access=true',
    ...(letter.length === 0
      ? []
      : [`sandbox_workspace_write.writable_roots=[${letter.map(toml).join(',')}]`]),
    'history.persistence="none"',
    `project_doc_max_bytes=${CONTEXT_FILE_MAX_BYTES}`,
    `web_search="${web ? 'live' : 'disabled'}"`,
    ...(effort === undefined ? [] : [`model_reasoning_effort="${effort}"`]),
  ];
}

/** `codex exec …` for a new session, `codex exec resume … <id>` to continue one; `-` reads the prompt on stdin. */
export function sessionArgs(req: SpawnRequest, files: RunFiles, hook: Launch): string[] {
  const common = [
    '--json',
    '--ignore-user-config',
    '--skip-git-repo-check',
    ...FEATURES_OFF.flatMap((feature) => ['--disable', feature]),
    '-m',
    modelOf(req.character.model).model,
    ...configOf(req).flatMap((setting) => ['-c', setting]),
    ...hookConfigArgs(hook, files.policy),
    BYPASS_HOOK_TRUST,
    ...(files.schema === undefined ? [] : ['--output-schema', files.schema]),
  ];
  return req.resume === undefined
    ? ['exec', ...common, '-']
    : ['exec', 'resume', ...common, req.resume.session_id, '-'];
}

/** The app-server flags that list the same hooks as the session: its `-c` hooks and the same features off. */
export function hooksCheckArgs(files: RunFiles, hook: Launch): string[] {
  return [
    ...FEATURES_OFF.flatMap((feature) => ['--disable', feature]),
    ...hookConfigArgs(hook, files.policy),
  ];
}
