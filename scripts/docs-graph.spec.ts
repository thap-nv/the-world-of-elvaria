import type { ICruiseResult } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

import { cruiseEdges, edgesOf, renderGraph, workspacesOnDisk } from './docs-graph.mjs';

/** Just the fields edgesOf reads; dependency-cruiser's result has many more. */
const result = (modules: { source: string; dependencies: { resolved: string }[] }[]) =>
  ({ modules }) as unknown as ICruiseResult;

describe('edgesOf', () => {
  it('keeps edges between workspaces, drops npm packages and imports inside one workspace', () => {
    const edges = edgesOf(
      result([
        {
          source: 'packages/store/src/index.ts',
          dependencies: [
            { resolved: 'packages/domain/src/index.ts' },
            { resolved: 'packages/store/src/lock.ts' },
            { resolved: 'node_modules/proper-lockfile/index.js' },
          ],
        },
        {
          source: 'packages\\store\\src\\lock.ts',
          dependencies: [{ resolved: 'packages\\eventlog\\src\\index.ts' }],
        },
        { source: 'node_modules/zod/index.js', dependencies: [] },
        { source: 'packages/domain/src/index.ts', dependencies: [] },
      ]),
    );
    expect(edges).toEqual(
      new Map([
        ['store', new Set(['domain', 'eventlog'])],
        ['domain', new Set()],
      ]),
    );
  });
});

describe('renderGraph', () => {
  const text = renderGraph(new Map([['registry-default', new Set(['domain'])]]), [
    'config',
    'domain',
    'registry-default',
  ]);

  it('draws the workspaces on disk and their real imports in Mermaid', () => {
    expect(text).toContain(
      [
        '```mermaid',
        'flowchart TD',
        '  config["config"]',
        '  domain["domain"]',
        '  registry_default["registry-default"]',
      ].join('\n'),
    );
    expect(text).toContain('  registry_default --> domain\n```');
  });

  it('lists every workspace of boundaries.mjs with its real and its allowed imports', () => {
    expect(text).toContain('| `config` | `packages/config` | — | — (chỉ dùng khi dev) |');
    expect(text).toContain('| `registry-default` | `packages/registry-default` | `domain` | `domain` |');
    expect(text).toContain('| `steward` | chưa có | | `domain`, `store`, `eventlog`, `runner-core` |');
  });
});

describe('on this repo', () => {
  it('finds the workspaces on disk', () => {
    expect(workspacesOnDisk()).toEqual(
      expect.arrayContaining(['config', 'domain', 'registry-default', 'i18n']),
    );
  });

  it('sees registry-default import the domain, and tests and config left out', async () => {
    const edges = await cruiseEdges();
    expect(edges.get('registry-default')).toEqual(new Set(['domain']));
    expect(edges.get('domain')).toEqual(new Set());
    // Every workspace imports @elvaria/config from its config files only.
    expect([...edges.values()].some((targets) => targets.has('config'))).toBe(false);
  });
});
