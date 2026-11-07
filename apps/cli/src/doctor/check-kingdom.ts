// The doctor's checks that only read: the registry and the files it names, git, and every territory's folder.
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { REGISTRY_ROOT } from '@elvaria/registry-default';
import { fromPortable, missingRegistryFiles } from '@elvaria/store';

import { registryIssueLines, storeIssueLines } from '../issues.ts';
import { gitIn } from '../process/git.ts';
import { finding } from './finding.ts';
import { parseVersion } from './tool-version.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** Where a kingdom made before P1-15 finds the class prompts its registry/ lacks. */
const DEFAULT_PROMPTS = path.join(REGISTRY_ROOT, 'prompts');

/**
 * registry/ loads, passes the domain's cross-file rules, and has a prompt for every class (P1-15: a kingdom made
 * before that has none, and is told where the default ones are). Catalog scripts it names but lacks are a warning:
 * only a script-tier quest needs one (implementation-plan §2.3).
 */
export async function checkRegistry(ctx: KingdomContext): Promise<Finding[]> {
  const { t, store } = ctx;
  const registry = await store.loadRegistry();
  if (!registry.ok) {
    const details = registry.error.flatMap((issue) => registryIssueLines(t, issue));
    const prompts = registry.error.some(
      (issue) => issue.code === 'not_found' && issue.file.startsWith('registry/prompts/'),
    );
    const hint = prompts ? [t('cli.doctor.registry_prompts_hint', { path: DEFAULT_PROMPTS })] : [];
    return [finding('error', t('cli.doctor.registry_invalid'), [...details, ...hint])];
  }
  const { kinds, classes, rituals, scripts, tags } = registry.value;
  const counts = {
    kinds: kinds.length,
    classes: classes.length,
    rituals: rituals.length,
    scripts: scripts.length,
    tags: tags.length,
  };
  const findings = [finding('ok', t('cli.doctor.registry', counts))];
  const missing = await missingRegistryFiles(store.root, registry.value);
  if (missing.length > 0) {
    const files = missing.map((issue) => issue.file);
    findings.push(finding('warn', t('cli.doctor.registry_missing', { count: missing.length }), files));
  }
  return findings;
}

export async function checkGit(ctx: KingdomContext): Promise<Finding> {
  const git = await gitIn(ctx.io, ctx.io.cwd);
  const said = git === undefined ? undefined : await git(['--version']);
  const version = said === undefined ? undefined : parseVersion(said);
  return version === undefined
    ? finding('error', ctx.t('cli.doctor.git_missing'))
    : finding('ok', ctx.t('cli.doctor.git', { version }));
}

async function isFolder(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/** Each territory's folder still exists, and a git territory is still a work tree. */
export async function checkTerritories(ctx: KingdomContext): Promise<Finding[]> {
  const { t } = ctx;
  const { items, issues } = await ctx.store.territories.list();
  const unreadable = issues.map((issue) => {
    const [head = '', ...details] = storeIssueLines(t, issue);
    return finding('error', head, details);
  });
  const checked = await Promise.all(
    items.map(async (territory) => {
      const folder = fromPortable(territory.path, ctx.io.platform);
      const params = { id: territory.id, path: territory.path };
      if (!(await isFolder(folder))) return finding('error', t('cli.doctor.territory_missing', params));
      if (territory.vcs.type === 'none') return finding('ok', t('cli.doctor.territory', params));
      const git = await gitIn(ctx.io, folder);
      // Without git nothing can be said about the repo; the missing git is its own error above.
      if (git === undefined) return finding('warn', t('cli.doctor.territory_unchecked', params));
      const inside = await git(['rev-parse', '--is-inside-work-tree']);
      return inside === 'true'
        ? finding('ok', t('cli.doctor.territory', params))
        : finding('error', t('cli.doctor.territory_not_git', params));
    }),
  );
  return [...checked, ...unreadable];
}
