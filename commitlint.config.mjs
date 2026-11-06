// Conventional Commits `type(scope): why`; the scope is a workspace name (implementation-plan §4.2).
import { WORKSPACES } from '@elvaria/config/boundaries';

import { docsNote, stagedFiles } from './scripts/docs-note.mjs';

// Commits that touch no single workspace: root tooling, CI, dependency bumps, theme data.
const REPO_SCOPES = ['repo', 'ci', 'deps', 'themes'];

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        /** @param {{ type?: string | null; raw?: string | null }} commit */
        'docs-touched': (commit) => docsNote(commit, stagedFiles()),
      },
    },
  ],
  rules: {
    'scope-enum': [2, 'always', [...Object.keys(WORKSPACES), ...REPO_SCOPES]],
    'docs-touched': [1, 'always'],
  },
};
