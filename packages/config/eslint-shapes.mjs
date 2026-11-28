// A shape gathered into one home keeps one (implementation-plan §4.2 R7; AH-14, CLAUDE.md Definition of done):
// where a selector can tell the hand copy apart, `no-restricted-syntax` refuses it outside its home and names the
// home, so `pnpm dup` is not the only guard and the author learns where the shared code lives.
import { NOT_RUNTIME } from './eslint-boundaries.mjs';

/** @typedef {import('eslint').Linter.Config} Config */
/** @typedef {{ selector: string; message: string }} Restriction */
/** @typedef {Restriction & { home: string }} Shape */

/** Shipped CLI code, where the shapes below were gathered. */
const CLI_FILES = ['apps/cli/src/**/*.ts'];

/** @type {readonly Shape[]} */
const CLI_SHAPES = [
  {
    // AH-14a: an unknown id reads the same whichever command it was given to.
    home: 'apps/cli/src/kingdom-context.ts',
    selector:
      "CallExpression[callee.name=/^read(Quest|Character)$/] MemberExpression[object.property.name='positionals']",
    message:
      'Read the quest or character the command line names with namedQuest or namedCharacter (namedBy in kingdom-context.ts), not by hand (AH-14a, R7).',
  },
  {
    // AH-14a: a quest refused by where it stands names its status alike in every command.
    home: 'apps/cli/src/quest/references.ts',
    selector: "CallExpression[callee.property.name='err'] MemberExpression[object.name='QUEST_STATUS_LABEL']",
    message:
      'Refuse a quest by its status through questUnless (quest/references.ts), not by hand (AH-14a, R7).',
  },
];

/**
 * @param {readonly Restriction[]} baseSyntax  the repo-wide `no-restricted-syntax` entries; ESLint would otherwise
 *   drop them for these files, because a later object replaces rule options
 * @returns {Config[]}  one object for every CLI file but the homes, then one per home without its own shape
 */
export function sharedShapeConfigs(baseSyntax) {
  /**
   * @param {readonly Shape[]} kept
   * @returns {import('eslint').Linter.RuleEntry}
   */
  const rule = (kept) => [
    'error',
    ...baseSyntax,
    ...kept.map(({ selector, message }) => ({ selector, message })),
  ];
  const homes = [...new Set(CLI_SHAPES.map((shape) => shape.home))];
  return [
    {
      name: 'elvaria/shared-shapes',
      files: CLI_FILES,
      ignores: [...NOT_RUNTIME, ...homes],
      rules: { 'no-restricted-syntax': rule(CLI_SHAPES) },
    },
    ...homes.map((home) => ({
      name: `elvaria/shared-shapes:${home}`,
      files: [home],
      rules: { 'no-restricted-syntax': rule(CLI_SHAPES.filter((shape) => shape.home !== home)) },
    })),
  ];
}
