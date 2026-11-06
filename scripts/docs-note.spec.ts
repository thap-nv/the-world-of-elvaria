import { describe, expect, it } from 'vitest';

import { docsNote, stagedFiles } from './docs-note.mjs';

const CODE = ['packages/domain/src/quest.ts'];

describe('docsNote', () => {
  it('asks a behaviour change that touches no docs for a reason', () => {
    const [ok, message] = docsNote({ type: 'feat', raw: 'feat(domain): add quest\n\nWhy.' }, CODE);
    expect(ok).toBe(false);
    expect(message).toContain('docs: none');
  });

  it('is satisfied by a change under docs/', () => {
    expect(docsNote({ type: 'fix', raw: 'fix(store): x' }, [...CODE, 'docs/adr/0004.md'])[0]).toBe(true);
  });

  it('is satisfied by "docs: none" in the body, not in the header', () => {
    expect(docsNote({ type: 'perf', raw: 'perf(hooks): x\n\nFaster.\n\ndocs: none' }, CODE)[0]).toBe(true);
    expect(docsNote({ type: 'feat', raw: 'feat: docs: none' }, CODE)[0]).toBe(false);
  });

  it('leaves other commit types alone', () => {
    for (const type of ['chore', 'refactor', 'test', 'docs', 'ci', null]) {
      expect(docsNote({ type, raw: 'x' }, CODE)[0]).toBe(true);
    }
  });
});

describe('stagedFiles', () => {
  it('lists staged paths from git as an array of strings', () => {
    const files = stagedFiles();
    expect(Array.isArray(files)).toBe(true);
    expect(files.every((file) => typeof file === 'string' && file !== '')).toBe(true);
  });
});
