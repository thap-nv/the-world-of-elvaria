// Prompt templates are Markdown files in `prompts/` (implementation-plan §3.7, §10): prose is reviewed as prose,
// and the code only fills `{{name}}` placeholders and joins blocks. A leading `<!-- … -->` is a note for the
// maintainer and never reaches a model.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const PROMPTS_DIR = path.join(import.meta.dirname, '..', '..', 'prompts');

export const PROMPT_TEMPLATES = [
  'decree',
  'assignee',
  'class',
  'apprentice',
  'shell',
  'read-only',
  'patch',
  'handover',
  'quest',
  'gazetteer',
  'scripture',
  'skills',
  'revive',
  'resumed',
  'returned',
  'memory',
  'answer',
  'verifier',
  'review',
  'partial',
  'ritual-steps',
  'chancellor',
  'chancellor-context',
] as const;
export type PromptTemplateName = (typeof PROMPT_TEMPLATES)[number];
export type PromptTemplates = Readonly<Record<PromptTemplateName, string>>;

const COMMENT = /<!--[\s\S]*?-->\s*/g;
const PLACEHOLDER = /\{\{([a-z_]+)\}\}/g;
/** A placeholder alone on its line, with the blank line after it. */
const LONE_PLACEHOLDER = /^\{\{([a-z_]+)\}\}\n(?:\n|$)/gm;

/** A prompt file as a model reads it: `\n` line ends, without the `<!-- … -->` notes for people, trimmed. */
export const withoutNotes = (text: string): string =>
  text.replaceAll('\r\n', '\n').replace(COMMENT, '').trim();

export async function loadPromptTemplates(dir: string = PROMPTS_DIR): Promise<PromptTemplates> {
  const entries = await Promise.all(
    PROMPT_TEMPLATES.map(
      async (name) => [name, withoutNotes(await readFile(path.join(dir, `${name}.md`), 'utf8'))] as const,
    ),
  );
  return Object.fromEntries(entries) as PromptTemplates;
}

/**
 * Fills `{{name}}` from `values` in one pass: text that comes in with a value is never read as a placeholder.
 * A placeholder alone on its line whose value is empty disappears with its line. A placeholder without a value
 * is a bug in a template, so it throws.
 */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  const valueOf = (key: string): string => {
    const value = values[key];
    if (value === undefined) throw new Error(`prompt template: no value for {{${key}}}`);
    return value;
  };
  return template
    .replaceAll(LONE_PLACEHOLDER, (line, key: string) => (valueOf(key).trim() === '' ? '' : line))
    .replaceAll(PLACEHOLDER, (_placeholder, key: string) => valueOf(key))
    .trimEnd();
}

/** The blocks of one prompt part, empty ones left out, a blank line apart. */
export const joinBlocks = (blocks: readonly string[]): string =>
  blocks
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .join('\n\n');

/** `text` in a code fence longer than any backtick run inside it, so a letter or a diff cannot close it. */
export function fenced(text: string, lang = ''): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${text.trimEnd()}\n${fence}`;
}

/** The `## <id>` sections of a template, by id: the ritual steps. */
export function sectionsOf(template: string): ReadonlyMap<string, string> {
  const sections = new Map<string, string>();
  for (const part of template.split(/^## /m).slice(1)) {
    const newline = part.indexOf('\n');
    const id = (newline === -1 ? part : part.slice(0, newline)).trim();
    sections.set(id, newline === -1 ? '' : part.slice(newline + 1).trim());
  }
  return sections;
}
