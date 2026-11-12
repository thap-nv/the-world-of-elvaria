import { describe, expect, it } from 'vitest';

import { GRAPH_COMMANDS, graphCommandOf } from './commands.ts';

describe('graphCommandOf', () => {
  it('names the graph command a line starts with', () => {
    expect(graphCommandOf('graphify query "FOCUS_MAX callers"')).toBe('graphify query');
    expect(graphCommandOf('  graphify affected FOCUS_MAX --depth 3 ')).toBe('graphify affected');
    expect(graphCommandOf('graphify explain')).toBe('graphify explain');
    expect(graphCommandOf('graphify\tpath A B')).toBeUndefined();
  });

  it('refuses other graphify commands and lookalikes', () => {
    expect(graphCommandOf('graphify update .')).toBeUndefined();
    expect(graphCommandOf('graphify queryx a')).toBeUndefined();
    expect(graphCommandOf('git grep graphify query')).toBeUndefined();
  });

  it('keeps every command read-only', () => {
    expect(GRAPH_COMMANDS.every((command) => command.startsWith('graphify '))).toBe(true);
  });
});
