// The kind agy's tools log under (implementation-plan §3.10): searching and listing are `search` since PS-21, so the
// metrics' reads by file count only files read, as on Claude.
import { describe, expect, it } from 'vitest';

import { toolCallOf } from '../claude/tools.ts';
import { agyToolCallOf } from './tools.ts';

const PLOT = 'C:\\Users\\elvaria\\dc1-se-team\\.elvaria\\worktrees\\q_20261106_7k3m2a';

describe('agy tool kinds', () => {
  it('logs searching and listing as search, reading a file as read (PS-21)', () => {
    const kinds = [
      ['grep_search', { SearchPath: PLOT, Query: 'TODO' }],
      ['find_by_name', { SearchDirectory: `${PLOT}\\src`, Pattern: '*.ts' }],
      ['list_dir', { DirectoryPath: `${PLOT}\\src` }],
      ['read_file', { Path: `${PLOT}\\src\\a.ts` }],
      ['view_file', { AbsolutePath: `${PLOT}\\src\\a.ts` }],
    ].map(([name, args]) => [name, agyToolCallOf(name, args).kind]);
    expect(Object.fromEntries(kinds)).toEqual({
      grep_search: 'search',
      find_by_name: 'search',
      list_dir: 'search',
      read_file: 'read',
      view_file: 'read',
    });
  });

  it('matches the kinds of the Claude tools they stand for', () => {
    expect(['Glob', 'Grep', 'LS', 'Read'].map((name) => toolCallOf(name, {}).kind)).toEqual([
      'search',
      'search',
      'search',
      'read',
    ]);
  });
});
