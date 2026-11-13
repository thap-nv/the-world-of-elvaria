// What `graphify query` answers, as the Chancellor's graph block reads it (PS-21b): one `NODE <name> [src=<file>
// loc=L<n> …]` line per node of the subgraph, then `EDGE` lines (graphify 0.9.106, serve.py `_subgraph_to_text`). The
// block keeps the files and the names in them; edges and nodes outside the repo (no file) are left out.

/** One file the answer names, with the names of its nodes, in the answer's order. */
export interface AnswerFile {
  readonly path: string;
  readonly names: readonly string[];
}

const NODE = /^NODE (.+?) \[src=(\S*) loc=/;

/** The files of an answer, in the order the answer first names them, each with its distinct names. */
export function answerFilesOf(answer: string): AnswerFile[] {
  const files = new Map<string, string[]>();
  for (const line of answer.split(/\r?\n/)) {
    const node = NODE.exec(line);
    if (node === null) continue;
    const [, name = '', source = ''] = node;
    const file = source.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');
    if (file === '') continue;
    const names = files.get(file) ?? [];
    // A file's own node is named after the file: it says nothing the path does not.
    if (!names.includes(name) && name !== file.split('/').at(-1)) names.push(name);
    files.set(file, names);
  }
  return [...files].map(([path, names]) => ({ path, names }));
}
