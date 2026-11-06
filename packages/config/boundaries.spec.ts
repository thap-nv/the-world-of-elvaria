import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEV_ONLY,
  NO_NODE_TYPES,
  SCOPE,
  WORKSPACES,
  forbiddenFor,
  packageName,
  workspaceDir,
} from './boundaries.mjs';

type Table = Readonly<Record<string, { readonly deps: readonly string[] }>>;

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const KEYS = Object.keys(WORKSPACES);
const CONCRETE_RUNNERS = KEYS.filter((key) => key.startsWith('runner-') && key !== 'runner-core');
const WORK_ENGINE = [
  'store',
  'registry-default',
  'runner-core',
  ...CONCRETE_RUNNERS,
  'steward',
  'chancellor',
];
const BROWSER_SIDE = ['ui-kit', 'ui', 'world', 'lite'];

const depsOf = (table: Table, key: string): readonly string[] => table[key]?.deps ?? [];

/** Every workspace `key` reaches through its deps, transitively. */
function reachable(table: Table, key: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...depsOf(table, key)];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    if (seen.has(next)) continue;
    seen.add(next);
    stack.push(...depsOf(table, next));
  }
  return seen;
}

/** The first cycle found, as a path that starts and ends on the same key; undefined for a DAG. */
function findCycle(table: Table): string[] | undefined {
  const done = new Set<string>();
  const visit = (key: string, path: readonly string[]): string[] | undefined => {
    if (path.includes(key)) return [...path.slice(path.indexOf(key)), key];
    if (done.has(key)) return undefined;
    const cycle = depsOf(table, key)
      .map((dep) => visit(dep, [...path, key]))
      .find((found) => found !== undefined);
    done.add(key);
    return cycle;
  };
  return Object.keys(table)
    .map((key) => visit(key, []))
    .find((found) => found !== undefined);
}

describe('the dependency table (implementation-plan §1.3)', () => {
  it('is a DAG', () => {
    expect(findCycle(WORKSPACES)).toBeUndefined();
  });

  it('would report a cycle if one were added', () => {
    const table = { a: { deps: ['b'] }, b: { deps: ['c'] }, c: { deps: ['a'] }, d: { deps: [] } };
    expect(findCycle(table)).toEqual(['a', 'b', 'c', 'a']);
  });

  it('names only known workspaces as deps, never the workspace itself', () => {
    for (const key of KEYS) {
      expect(depsOf(WORKSPACES, key).filter((dep) => !KEYS.includes(dep))).toEqual([]);
      expect(depsOf(WORKSPACES, key)).not.toContain(key);
    }
  });

  it('keeps domain, i18n and ui-kit free of any dependency', () => {
    for (const key of ['domain', 'i18n', 'ui-kit']) expect(depsOf(WORKSPACES, key)).toEqual([]);
  });

  it('keeps the herald away from the Steward and every runner, even indirectly (ADR 0005)', () => {
    const reached = reachable(WORKSPACES, 'herald');
    for (const key of ['steward', 'runner-core', ...CONCRETE_RUNNERS]) expect(reached).not.toContain(key);
  });

  it('lets the browser side reach only domain types, i18n and the UI kit', () => {
    for (const key of ['ui', 'world', 'lite']) {
      expect([...reachable(WORKSPACES, key)].sort()).toEqual(
        ['domain', 'i18n', 'ui-kit', ...(key === 'ui' ? [] : ['ui'])].sort(),
      );
    }
  });

  it('lets hooks load the event log only, so it starts in < 100 ms', () => {
    expect(depsOf(WORKSPACES, 'hooks')).toEqual(['eventlog']);
    expect([...reachable(WORKSPACES, 'hooks')].sort()).toEqual(['domain', 'eventlog']);
  });

  it('keeps the event bus ignorant of the work engine and the world', () => {
    for (const key of ['eventlog', 'hooks']) {
      const reached = reachable(WORKSPACES, key);
      for (const other of [...WORK_ENGINE, ...BROWSER_SIDE, 'herald']) expect(reached).not.toContain(other);
    }
  });

  it('keeps the work engine ignorant of the world', () => {
    for (const key of WORK_ENGINE) {
      const reached = reachable(WORKSPACES, key);
      for (const other of [...BROWSER_SIDE, 'herald', 'cli']) expect(reached).not.toContain(other);
    }
  });

  it('makes apps/cli the only composition root (ADR 0006, 0021)', () => {
    const notInCli = ['config', 'cli', ...BROWSER_SIDE];
    expect([...depsOf(WORKSPACES, 'cli')].sort()).toEqual(
      KEYS.filter((key) => !notInCli.includes(key)).sort(),
    );
    for (const key of KEYS.filter((other) => other !== 'cli')) {
      for (const app of ['cli', 'world', 'lite', ...CONCRETE_RUNNERS]) {
        expect(depsOf(WORKSPACES, key)).not.toContain(app);
      }
    }
  });

  it('never makes a dev-only workspace a runtime dependency', () => {
    expect(DEV_ONLY).toEqual(['config']);
    expect(NO_NODE_TYPES.filter((key) => !KEYS.includes(key))).toEqual([]);
    for (const key of KEYS) for (const dev of DEV_ONLY) expect(depsOf(WORKSPACES, key)).not.toContain(dev);
  });
});

describe('helpers', () => {
  it('forbids exactly what a workspace does not list', () => {
    for (const key of KEYS) {
      const allowed = [key, ...depsOf(WORKSPACES, key)];
      expect([...forbiddenFor(key), ...allowed].sort()).toEqual([...KEYS].sort());
      expect(forbiddenFor(key).filter((other) => allowed.includes(other))).toEqual([]);
    }
  });

  it('maps keys to npm names and directories', () => {
    expect(packageName('runner-core')).toBe(`${SCOPE}/runner-core`);
    expect(workspaceDir('domain')).toBe('packages/domain');
    expect(workspaceDir('cli')).toBe('apps/cli');
    expect(() => workspaceDir('nope')).toThrow(/Unknown workspace "nope"/);
  });
});

type Manifest = { name?: string } & Partial<Record<DependencyField, Record<string, string>>>;
type DependencyField = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies';

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** Workspaces present on disk, as `{ key, root }`. */
function workspacesOnDisk(): { key: string; root: string }[] {
  return ['packages', 'apps'].flatMap((root) => {
    const dir = join(REPO, root);
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'package.json')))
      .map((entry) => ({ key: entry.name, root }));
  });
}

/** `@elvaria/*` names in some dependency fields, as workspace keys. */
function workspaceDeps(manifest: Manifest, fields: readonly DependencyField[]): string[] {
  return fields
    .flatMap((field) => Object.keys(manifest[field] ?? {}))
    .filter((name) => name.startsWith(`${SCOPE}/`))
    .map((name) => name.slice(SCOPE.length + 1));
}

describe('workspaces on disk follow the table', () => {
  const onDisk = workspacesOnDisk();

  it('finds at least this package', () => {
    expect(onDisk).toContainEqual({ key: 'config', root: 'packages' });
  });

  it.each(onDisk)('$root/$key is in the table, under its own name', ({ key, root }) => {
    expect(WORKSPACES[key]?.root).toBe(root);
    // Read at the IO boundary; the fields used below are optional and checked as they are read.
    const manifest = readJson(join(REPO, root, key, 'package.json')) as Manifest;
    expect(manifest.name).toBe(packageName(key));
  });

  it.each(onDisk)('$root/$key declares only the workspaces it may import', ({ key, root }) => {
    const manifest = readJson(join(REPO, root, key, 'package.json')) as Manifest;
    const allowed = depsOf(WORKSPACES, key);
    const runtime = workspaceDeps(manifest, ['dependencies', 'peerDependencies', 'optionalDependencies']);
    expect(runtime.filter((dep) => !allowed.includes(dep))).toEqual([]);
    const dev = workspaceDeps(manifest, ['devDependencies']);
    expect(dev.filter((dep) => !allowed.includes(dep) && !DEV_ONLY.includes(dep))).toEqual([]);
  });

  it.each(onDisk)(
    '$root/$key has tsconfig references only to the workspaces it may import',
    ({ key, root }) => {
      const path = join(REPO, root, key, 'tsconfig.json');
      // Repo tsconfigs are plain JSON (no comments), so JSON.parse reads them.
      const tsconfig = (existsSync(path) ? readJson(path) : {}) as { references?: { path: string }[] };
      const referenced = (tsconfig.references ?? []).map((ref) => ref.path.split(/[\\/]/).at(-1) ?? '');
      expect(referenced.filter((dep) => !depsOf(WORKSPACES, key).includes(dep))).toEqual([]);
    },
  );

  it.each(onDisk.filter(({ key }) => NO_NODE_TYPES.includes(key)))(
    '$root/$key keeps Node types out of its program',
    ({ key, root }) => {
      const tsconfig = readJson(join(REPO, root, key, 'tsconfig.json')) as {
        extends?: string;
        compilerOptions?: { types?: string[] };
        include?: string[];
      };
      expect(tsconfig.extends).toBe('@elvaria/config/tsconfig/base.json');
      expect(tsconfig.compilerOptions?.types ?? []).not.toContain('node');
      // A vitest.config.ts would pull @types/node in through Vite's types.
      expect((tsconfig.include ?? []).filter((entry) => /config\.[cm]?ts$/.test(entry))).toEqual([]);
      expect(existsSync(join(REPO, root, key, 'vitest.config.ts'))).toBe(false);
    },
  );
});
