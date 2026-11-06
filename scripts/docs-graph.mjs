// docs/dependency-graph.md: which workspace the shipped code of each workspace really imports (dependency-cruiser)
// beside what packages/config/boundaries.mjs allows (implementation-plan §1.3, §5.4).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DEV_ONLY, WORKSPACES, workspaceDir } from '@elvaria/config/boundaries';
import { depcruiseConfig } from '@elvaria/config/depcruise';
import { cruise } from 'dependency-cruiser';

import { code, generatedNote, markdownDocument, table } from './docs-markdown.mjs';

/** @typedef {ReadonlyMap<string, ReadonlySet<string>>} Edges workspace key → keys its shipped code imports */

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WORKSPACE_PATH = /^(?:packages|apps)\/([^/]+)\//;
// Tests, fixtures and tool config do not ship; mirrors NOT_RUNTIME in packages/config/depcruise.mjs.
const NOT_RUNTIME = String.raw`\.spec\.ts$|/__fixtures__/|\.config\.(ts|mjs)$`;

/** @param {string} path */
const workspaceOf = (path) => WORKSPACE_PATH.exec(path.replaceAll('\\', '/'))?.[1];

/**
 * Workspace edges in a dependency-cruiser result; npm packages and imports inside one workspace drop out.
 * @param {import('dependency-cruiser').ICruiseResult} result
 * @returns {Edges}
 */
export function edgesOf(result) {
  /** @type {Map<string, Set<string>>} */
  const edges = new Map();
  for (const module of result.modules) {
    const from = workspaceOf(module.source);
    if (from === undefined) continue;
    const targets = edges.get(from) ?? new Set();
    for (const dependency of module.dependencies) {
      const to = workspaceOf(dependency.resolved);
      if (to !== undefined && to !== from) targets.add(to);
    }
    edges.set(from, targets);
  }
  return edges;
}

/** Runs dependency-cruiser over the workspaces on disk, shipped code only. @returns {Promise<Edges>} */
export async function cruiseEdges() {
  const { options = {} } = depcruiseConfig();
  const exclude =
    typeof options.exclude === 'object' && 'path' in options.exclude ? options.exclude.path : '';
  const roots = ['packages', 'apps'].filter((dir) => existsSync(`${ROOT}${dir}`));
  const { output } = await cruise(roots, {
    ...options,
    baseDir: ROOT,
    exclude: {
      path: [exclude, NOT_RUNTIME]
        .flat()
        .filter((part) => part !== '')
        .join('|'),
    },
    outputType: 'json',
  });
  // The json reporter returns the result serialized; it is dependency-cruiser's own ICruiseResult.
  return edgesOf(typeof output === 'string' ? JSON.parse(output) : output);
}

/** Mermaid node ids cannot hold `-`; the label keeps the real name. @param {string} key */
const nodeId = (key) => key.replaceAll('-', '_');

/** @param {readonly string[]} keys */
const codeList = (keys) => (keys.length === 0 ? '—' : keys.map(code).join(', '));

/**
 * The text of docs/dependency-graph.md.
 * @param {Edges} edges from cruiseEdges()
 * @param {readonly string[]} present workspace keys that exist on disk
 */
export function renderGraph(edges, present) {
  const keys = Object.keys(WORKSPACES);
  const shown = keys.filter((key) => present.includes(key));
  const mermaid = [
    '```mermaid',
    'flowchart TD',
    ...shown.map((key) => `  ${nodeId(key)}["${key}"]`),
    ...shown.flatMap((key) =>
      [...(edges.get(key) ?? [])].sort().map((to) => `  ${nodeId(key)} --> ${nodeId(to)}`),
    ),
    '```',
  ].join('\n');
  const rows = keys.map((key) => [
    code(key),
    present.includes(key) ? code(workspaceDir(key)) : 'chưa có',
    present.includes(key) ? codeList([...(edges.get(key) ?? [])].sort()) : '',
    DEV_ONLY.includes(key) ? '— (chỉ dùng khi dev)' : codeList(WORKSPACES[key]?.deps ?? []),
  ]);
  return markdownDocument([
    '# Đồ thị phụ thuộc giữa các workspace',
    generatedNote(
      'import thật của mã chạy (dependency-cruiser; bỏ test, fixture, file cấu hình) và `packages/config/boundaries.mjs`',
    ),
    'Mũi tên `A --> B`: mã chạy của A import B (kể cả `import type`). Bảng cho phép là luật ở [implementation-plan.md](implementation-plan.md) §1.3; ESLint và `pnpm boundaries` chặn mọi import ngoài bảng (ADR 0001).',
    mermaid,
    table(['Workspace', 'Thư mục', 'Import thật', 'Được phép (`boundaries.mjs`)'], rows),
  ]);
}

/** Workspace keys that have a package.json on disk. */
export const workspacesOnDisk = () =>
  Object.keys(WORKSPACES).filter((key) => existsSync(`${ROOT}${workspaceDir(key)}/package.json`));

export async function renderDependencyGraph() {
  return renderGraph(await cruiseEdges(), workspacesOnDisk());
}
