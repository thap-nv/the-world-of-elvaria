// graphify, the one program outside Node that Elvaria runs (PS-21, ADR 0029): checked when a territory has
// `code_graph` on or a graphify is pinned already. Missing is a warning, never an error: a quest without its graph
// runs as before, and `elvaria upgrade` (PS-04b) must not stop on it. `--pin` pins the path and version as a tribe's
// CLI is pinned (kingdom.programs.graphify), and a changed version is told until it is pinned again.
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { ok } from '@elvaria/domain';
import type { Kingdom, Territory } from '@elvaria/domain';
import { fromPortable, toPortable } from '@elvaria/store';

import { storeIssueLines } from '../issues.ts';
import { findExecutable } from '../process/find-executable.ts';
import { launchOf } from '../process/launch.ts';
import { finding } from './finding.ts';
import { toolVersion } from './tool-version.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

export const GRAPHIFY = 'graphify';

type Pin = NonNullable<NonNullable<Kingdom['programs']>['graphify']>;

async function isFile(file: string): Promise<boolean> {
  return stat(file).then(
    (info) => info.isFile(),
    () => false,
  );
}

/**
 * The pinned path while it is there, else PATH, else where `uv tool install` and `pipx` put it (`~/.local/bin`),
 * which a shell started before the install may not have on PATH yet.
 */
async function locateGraphify(ctx: KingdomContext): Promise<string | undefined> {
  const { io } = ctx;
  const pinned = ctx.kingdom.programs?.graphify?.path;
  if (pinned !== undefined && (await isFile(fromPortable(pinned, io.platform)))) {
    return fromPortable(pinned, io.platform);
  }
  const onPath = await findExecutable(GRAPHIFY, io.env, io.platform);
  if (onPath !== undefined) return onPath;
  const local = path.join(io.home, '.local', 'bin', io.platform === 'win32' ? `${GRAPHIFY}.exe` : GRAPHIFY);
  return (await isFile(local)) ? local : undefined;
}

async function savePin(ctx: KingdomContext, pin: Pin): Promise<Finding> {
  const saved = await ctx.store.kingdom.update((current) =>
    ok({ ...current, programs: { ...current.programs, graphify: pin } }),
  );
  if (saved.ok) return finding('ok', ctx.t('cli.doctor.graph_pinned', { version: pin.version }));
  const [head = '', ...details] = storeIssueLines(ctx.t, saved.error);
  return finding('error', head, details);
}

/** What a found graphify says, against what is pinned; `pin` writes it down. */
async function foundGraphify(ctx: KingdomContext, file: string, pin: boolean): Promise<Finding[]> {
  const { t } = ctx;
  // An npm-style `.cmd` shim runs as `node <js>`, as a tribe's CLI does: no shell (ADR 0015).
  const launch = await launchOf(file, ctx.io.nodePath);
  const version = launch === undefined ? undefined : await toolVersion(launch, ctx.io.env);
  if (version === undefined) return [finding('warn', t('cli.doctor.graph_no_version', { path: file }))];
  const pinned = ctx.kingdom.programs?.graphify;
  const current = { path: toPortable(file, ctx.io.platform), version };
  const same = pinned?.version === version && pinned.path === current.path;
  const seen = finding('ok', t('cli.doctor.graph_found', { version, path: file }));
  if (same) return [seen];
  if (pin) return [seen, await savePin(ctx, current)];
  return pinned === undefined
    ? [seen, finding('warn', t('cli.doctor.graph_unpinned'))]
    : [seen, finding('warn', t('cli.doctor.graph_changed', { pinned: pinned.version, version }))];
}

export async function checkGraph(ctx: KingdomContext, pin: boolean): Promise<Finding[]> {
  const { items } = await ctx.store.territories.list();
  const graphed = items.filter((territory: Territory) => territory.code_graph === true).map(({ id }) => id);
  if (graphed.length === 0 && ctx.kingdom.programs?.graphify === undefined) return [];
  const file = await locateGraphify(ctx);
  if (file !== undefined) return foundGraphify(ctx, file, pin);
  return [
    finding('warn', ctx.t('cli.doctor.graph_missing', { territories: graphed.join(', ') || '—' }), [
      ctx.t('cli.doctor.graph_install'),
    ]),
  ];
}
