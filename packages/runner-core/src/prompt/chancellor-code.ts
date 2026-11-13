// What the Chancellor learns of the code before it drafts (implementation-plan §3.11, PS-21b): the size of the files
// the owner's words name, read from the territory's working tree whatever `code_graph` says (P1-50 (a): it estimated
// 70k tokens for a 1 MB file), and, where the territory has a code graph, what graphify answers to the code names of
// those words, with the impact of the named paths. `elvaria say` gathers both at 0 mana; this file only words them.
// Both go to the system part, which agy reads from a file: it takes the user part on its command line (PS-21).
import { fill } from './templates.ts';
import type { AnswerFile } from '../graph/query-answer.ts';
import type { PromptTemplates } from './templates.ts';

/** One file, as the territory's working tree holds it. */
export interface SizedFile {
  readonly path: string;
  readonly bytes: number;
  readonly lines: number;
}

/** A path or glob of the owner's words, and the files it names in one territory. */
export interface NamedPath {
  /** As the owner wrote it. */
  readonly words: string;
  readonly files: number;
  readonly bytes: number;
  /** The largest of them, largest first, at most NAMED_FILES_SHOWN. */
  readonly largest: readonly SizedFile[];
}

/** A file of the graph's answer, with its size when the working tree holds it. */
export interface GraphFile extends AnswerFile {
  readonly size?: SizedFile;
}

export interface GraphAnswer {
  /** The commit the graph was built at: the tip of the default branch. */
  readonly commit: string;
  /** The words asked (`graphify query '<question>'`). */
  readonly question: string;
  readonly files: readonly GraphFile[];
  /** The files outside the named paths that use code in them (impactOf); absent when the words name no file there. */
  readonly impact?: readonly string[];
}

/** What one territory's code says of the owner's words; a territory whose code says nothing is left out. */
export interface TerritoryCode {
  readonly territory: string;
  readonly named: readonly NamedPath[];
  /** Absent with `code_graph` off, no graph built at the tip, or no code name in the words. */
  readonly graph?: GraphAnswer;
}

/** The largest files shown per path; the gatherer counts the lines of these only. */
export const NAMED_FILES_SHOWN = 5;
const GRAPH_FILES_SHOWN = 12;
const NAMES_SHOWN = 6;
const IMPACT_SHOWN = 5;
const KIB = 1024;
/** As git prints a commit short. */
const COMMIT_SHOWN = 12;

export function sizeOf(bytes: number): string {
  if (bytes < KIB) return `${bytes} B`;
  if (bytes < KIB * KIB) return `${(bytes / KIB).toFixed(1)} KB`;
  return `${(bytes / KIB / KIB).toFixed(1)} MB`;
}

const quoted = (text: string): string => `\`${text}\``;
const more = (count: number, what: string): string => (count > 0 ? ` and ${count} more ${what}` : '');
const fileLine = (file: SizedFile): string => `${sizeOf(file.bytes)}, ${file.lines} lines`;

function namedLines({ words, files, bytes, largest }: NamedPath): string[] {
  const counted = `${files} ${files === 1 ? 'file' : 'files'}, ${sizeOf(bytes)} in all`;
  const shown = largest.slice(0, NAMED_FILES_SHOWN);
  return [
    `- ${quoted(words)}: ${counted}`,
    ...shown.map((file) => `  - ${quoted(file.path)}: ${fileLine(file)}`),
    ...(files > shown.length ? [`  - …${more(files - shown.length, 'files')}`] : []),
  ];
}

function graphFileLine({ path, names, size }: GraphFile): string {
  const sized = size === undefined ? '' : ` (${fileLine(size)})`;
  const shown = names.slice(0, NAMES_SHOWN).map(quoted).join(', ');
  const listed = shown === '' ? '' : `: ${shown}${more(names.length - NAMES_SHOWN, 'names')}`;
  return `- ${quoted(path)}${sized}${listed}`;
}

function impactLine(impact: readonly string[]): string {
  if (impact.length === 0) return 'Impact: no file outside the paths the owner names uses code in them.';
  const files = impact.slice(0, IMPACT_SHOWN).map(quoted).join(', ');
  return `Impact: ${impact.length} ${impact.length === 1 ? 'file' : 'files'} outside the paths the owner names use code in them: ${files}${more(impact.length - IMPACT_SHOWN, 'files')}.`;
}

function graphText(territory: string, graph: GraphAnswer): string {
  const files = graph.files.slice(0, GRAPH_FILES_SHOWN).map(graphFileLine);
  const rest = graph.files.length - files.length;
  return [
    `## Territory ${quoted(territory)}, graph at commit ${quoted(graph.commit.slice(0, COMMIT_SHOWN))}`,
    `Asked: \`graphify query '${graph.question}'\``,
    [...files, ...(rest > 0 ? [`- …${more(rest, 'files')}`] : [])].join('\n') || 'It named no file.',
    ...(graph.impact === undefined ? [] : [impactLine(graph.impact)]),
  ].join('\n\n');
}

/** The two blocks of the system part: the named files, then the graph's answer; empty when there is neither. */
export function chancellorCodeBlocks(
  code: readonly TerritoryCode[] | undefined,
  t: PromptTemplates,
): string[] {
  const named = (code ?? []).filter((entry) => entry.named.length > 0);
  const graphs = (code ?? []).flatMap(({ territory, graph }) =>
    graph === undefined ? [] : [{ territory, graph }],
  );
  return [
    named.length === 0
      ? ''
      : fill(t['chancellor-files'], {
          files: named
            .map(({ territory, named: paths }) =>
              [`## Territory ${quoted(territory)}`, paths.flatMap(namedLines).join('\n')].join('\n\n'),
            )
            .join('\n\n'),
        }),
    graphs.length === 0
      ? ''
      : fill(t['chancellor-graph'], {
          graphs: graphs.map(({ territory, graph }) => graphText(territory, graph)).join('\n\n'),
        }),
  ];
}
