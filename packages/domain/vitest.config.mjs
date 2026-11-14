import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// The design system's CSS is the other half of statusToneOf (implementation-plan §2.7): its `data-status`
// values must be the domain's tones. Specs cannot read files (the domain's program has no Node types), so the
// config reads the current source and hands its text to the spec through `provide`. The source is ui-kit once
// it exists (stage 2), the design handoff until then.
const CSS_SOURCES = ['../ui-kit/src/elvaria.css', '../../design/project/elvaria.css'].map((path) =>
  fileURLToPath(new URL(path, import.meta.url)),
);
const cssPath = CSS_SOURCES.find((path) => existsSync(path));
if (cssPath === undefined) throw new Error(`elvaria.css not found; looked in ${CSS_SOURCES.join(', ')}`);

// Plain .mjs, outside tsconfig.json on purpose: vitest/config pulls in Vite's types, which reference
// @types/node, and one such file would make `process` and `node:fs` type-check everywhere in the domain.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // The domain does no IO, so a spec's time is CPU alone and a ceiling measures only how busy the machine is:
    // the property specs try 340 000 transitions per pass, 2.5 s under coverage on a quiet machine and over the
    // default 5 s when several `pnpm check` run at once (fix/busy-machine). 60 s still stops a loop that never ends.
    testTimeout: 60_000,
    provide: { designCss: { path: cssPath, text: readFileSync(cssPath, 'utf8') } },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Fixtures are test data and builders for the specs, never shipped (NOT_RUNTIME in eslint-boundaries.mjs).
      exclude: ['src/**/*.spec.ts', 'src/**/__fixtures__/**'],
      // The domain decides; every branch of a decision is tested (CLAUDE.md, ADR 0002).
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
