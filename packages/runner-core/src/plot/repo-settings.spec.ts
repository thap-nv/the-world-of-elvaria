import { describe, expect, it } from 'vitest';

import { PLOT_EXCLUDES, withPlotExcludes } from './repo-settings.ts';

const block = `# Elvaria: plots, and files runners generate in them (ADR 0012)\n${PLOT_EXCLUDES.join('\n')}\n`;

describe('withPlotExcludes', () => {
  it('appends the header and every line to an empty or missing exclude file', () => {
    expect(withPlotExcludes('')).toBe(block);
  });

  it("keeps the owner's lines and closes an unfinished last line first", () => {
    expect(withPlotExcludes('# git ls-files --others --exclude-from=.git/info/exclude\n*.local')).toBe(
      `# git ls-files --others --exclude-from=.git/info/exclude\n*.local\n${block}`,
    );
  });

  it('adds only what is missing, under the existing header, and nothing when all is there', () => {
    const partial = block.replace('/GEMINI.md\n', '');
    expect(withPlotExcludes(partial)).toBe(`${partial}/GEMINI.md\n`);
    expect(withPlotExcludes(block)).toBeUndefined();
    expect(withPlotExcludes(block.replaceAll('\n', '\r\n'))).toBeUndefined();
  });

  it('anchors every line at the plot root', () => {
    for (const line of PLOT_EXCLUDES) expect(line.startsWith('/')).toBe(true);
  });
});
