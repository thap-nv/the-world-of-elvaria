import { describe, expect, it } from 'vitest';

import { GENERATORS, run } from './docs-gen.mjs';
import { code, escapeCell, generatedNote, markdownDocument, table } from './docs-markdown.mjs';
import { gitRepo } from './docs-repo.mjs';

/** An in-memory repo holding `files`, recording what the generator writes. */
function memory(files: Record<string, string>) {
  const written: Record<string, string> = {};
  return {
    written,
    read: (file: string) => files[file],
    write: (file: string, text: string) => {
      written[file] = text;
    },
  };
}

const GENERATED = [
  { file: 'docs/a.md', render: () => '# A\n' },
  { file: 'docs/b.md', render: () => Promise.resolve('# B\n') },
];

describe('docs:gen', () => {
  it('finds nothing to do when every generated doc matches its source', async () => {
    const repo = memory({ 'docs/a.md': '# A\n', 'docs/b.md': '# B\n' });
    expect(await run(['--check'], repo, GENERATED)).toEqual({
      code: 0,
      text: 'docs:gen: 2 generated docs, up to date',
    });
  });

  it('reports drift under --check without writing, and writes it otherwise (implementation-plan §7)', async () => {
    const files = { 'docs/a.md': '# A, edited by hand\n' };
    const checked = memory(files);
    expect(await run(['--check'], checked, GENERATED)).toEqual({
      code: 1,
      text: [
        'docs/a.md differs from its source: run pnpm docs:gen',
        'docs/b.md differs from its source: run pnpm docs:gen',
      ].join('\n'),
    });
    expect(checked.written).toEqual({});
    const fixed = memory(files);
    expect(await run([], fixed, GENERATED)).toEqual({
      code: 0,
      text: 'docs:gen: 2 generated docs, 2 written',
    });
    expect(fixed.written).toEqual({ 'docs/a.md': '# A\n', 'docs/b.md': '# B\n' });
  });

  it('reports a source it cannot render and still writes the others', async () => {
    const broken = [
      {
        file: 'docs/x.md',
        render: () => {
          throw new Error('bad glossary');
        },
      },
      { file: 'docs/y.md', render: () => Promise.reject(new Error('no graph')) },
      ...GENERATED,
    ];
    const repo = memory({});
    expect(await run([], repo, broken)).toEqual({
      code: 1,
      text: 'docs/x.md: cannot render: bad glossary\ndocs/y.md: cannot render: no graph',
    });
    expect(Object.keys(repo.written)).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('rewrites only the region of a hand-written file, between its markers', async () => {
    const plan = '# Plan\n\nHand.\n\n<!-- docs:gen table -->\nold\n<!-- /docs:gen table -->\n\nMore hand.\n';
    const generator = { file: 'docs/plan.md', region: 'table', render: () => '| a |\n' };
    const checked = memory({ 'docs/plan.md': plan });
    expect(await run(['--check'], checked, [generator])).toEqual({
      code: 1,
      text: 'docs/plan.md (table) differs from its source: run pnpm docs:gen',
    });
    const fixed = memory({ 'docs/plan.md': plan });
    await run([], fixed, [generator]);
    expect(fixed.written['docs/plan.md']).toBe(plan.replace('old\n', '| a |\n'));
  });

  it('refuses a region whose markers are missing or out of order', async () => {
    const generator = { file: 'docs/plan.md', region: 'table', render: () => '' };
    const reversed = '<!-- /docs:gen table -->\n<!-- docs:gen table -->\n';
    for (const text of [undefined, '# Plan\n', reversed]) {
      const files: Record<string, string> = text === undefined ? {} : { 'docs/plan.md': text };
      expect(await run([], memory(files), [generator])).toEqual({
        code: 1,
        text: 'docs/plan.md (table): cannot render: no "<!-- docs:gen table -->" … "<!-- /docs:gen table -->" markers',
      });
    }
  });

  it('generates the glossary, the event catalogue, the dependency graph, the CLI reference, the quest transition table and the plan contents', () => {
    expect(
      GENERATORS.map(({ file, region }) => (region === undefined ? file : `${file} (${region})`)),
    ).toEqual([
      'docs/glossary.md',
      'docs/events.md',
      'docs/dependency-graph.md',
      'docs/cli.md',
      'docs/implementation-plan/2-data-and-events.md (quest-transitions)',
      'docs/implementation-plan.md (plan-index)',
    ]);
  });

  it('renders the §2.5 table from QUEST_TRANSITIONS, ending in a newline for its region', async () => {
    const quest = GENERATORS.find(({ region }) => region === 'quest-transitions');
    const text = await quest?.render();
    expect(text?.startsWith('| Từ | Sự kiện | Điều kiện | Ai | Đến | Ghi chú |\n')).toBe(true);
    expect(text?.endsWith('| archived | — |  |  |  | trạng thái cuối |\n')).toBe(true);
  });

  it('matches what is committed in docs/ (pnpm docs:gen --check)', async () => {
    expect(await run(['--check'], gitRepo())).toMatchObject({ code: 0 });
  });
});

describe('Markdown helpers', () => {
  it('prints a table the way the hand-written docs do, escaping pipes once', () => {
    expect(
      table(
        ['a', 'b'],
        [
          ['x|y', ''],
          [String.raw`p\|q`, 'z'],
        ],
      ),
    ).toBe(['| a | b |', '|---|---|', String.raw`| x\|y | |`, String.raw`| p\|q | z |`].join('\n'));
    expect(escapeCell('a|b|c')).toBe(String.raw`a\|b\|c`);
  });

  it('joins blocks with one blank line and ends in one newline', () => {
    expect(markdownDocument(['# T', generatedNote(code('src.json'))])).toBe(
      '# T\n\n> Sinh từ `src.json` bằng `pnpm docs:gen`, CI kiểm drift: sửa nguồn rồi chạy lại lệnh, không sửa file này.\n',
    );
  });
});
