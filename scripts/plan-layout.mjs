// Where each part of docs/implementation-plan.md goes (P1-52, plan-split.mjs): §3 one file per mechanism, the other
// long sections one file each, the done rows of §8 one file per subsection, §11 one file per day; the index keeps the
// preamble, a contents table, §8 without its done rows, §10 and the rule for §11. Section numbers stay as they are,
// because code comments and docs cite them ("implementation-plan §3.4").
import { FENCE } from './docs-links.mjs';

/** Sections that stay in the index; every other one moves to the file SECTION_FILES names. */
export const KEPT = new Set(['preamble', '8', '10', '11']);
/** Sections cut one file per subsection: §3, one per mechanism. */
const BY_SUBSECTION = new Set(['3']);

/** @type {ReadonlyMap<string, string>} */
export const SECTION_FILES = new Map([
  ['1', '1-repo-structure.md'],
  ['2', '2-data-and-events.md'],
  // The head of §3 (its title and one line) goes with its first mechanism.
  ['3', '3.0-cli-facts.md'],
  ['3.0', '3.0-cli-facts.md'],
  ['3.1', '3.1-steward.md'],
  ['3.2', '3.2-separation-of-duties.md'],
  ['3.3', '3.3-plot.md'],
  ['3.4', '3.4-breakers.md'],
  ['3.5', '3.5-mana.md'],
  ['3.6', '3.6-hooks.md'],
  ['3.7', '3.7-runner.md'],
  ['3.8', '3.8-claude-md-for-gemini.md'],
  ['3.9', '3.9-treasury.md'],
  ['3.10', '3.10-event-normalization.md'],
  ['3.11', '3.11-chancellor.md'],
  ['3.12', '3.12-three-tiers.md'],
  ['3.13', '3.13-affinity-skills-parties.md'],
  ['3.14', '3.14-tribe-contract.md'],
  ['3.15', '3.15-tests-in-the-world.md'],
  ['3.16', '3.16-self-strengthening.md'],
  ['4', '4-code-quality.md'],
  ['5', '5-docs-as-code.md'],
  ['6', '6-windows-and-macos.md'],
  ['7', '7-tooling-and-ci.md'],
  ['9', '9-risks.md'],
]);

/** The §8 subsections whose done rows move, by heading, and the file they move to. */
/** @type {readonly (readonly [RegExp, string])[]} */
export const DONE_FILES = [
  [/^### Giai đoạn 0 /, '8-done-phase-0.md'],
  [/^### Giai đoạn 1 /, '8-done-phase-1.md'],
  [/^### Chặng tự cường /, '8-done-ps.md'],
];

const RULE = '---';
const SECTION = /^## (\d+)\. /;
const SUBSECTION = /^### (\d+\.\d+) /;
const ITEM_HEADER = /^\| # \| Task \| File chạm \| Xong khi \| Trạng thái \|$/;
const DAY_HEADER = /^\| Ngày \| Quyết định \|$/;
const DAY_ROW = /^\| (\d{4}-\d\d-\d\d) \|/;
/** Cells of a table row; `\|` is a pipe inside a cell. */
const CELL_BORDER = /(?<!\\)\|/;
const DONE = /^xong\b/;
const TITLE = '# Kế hoạch triển khai Elvaria · ';
const MAIN = '[kế hoạch triển khai](../implementation-plan.md)';
const REGION = 'plan-index';

const PART_NOTE = `Một phần của ${MAIN}, tách ra ở P1-52: chỉ chuyển chỗ, nội dung giữ nguyên. Số mục giữ làm định danh; mục lục và luật ghi ở file chính.`;
const DONE_NOTE = `Một phần §8 của ${MAIN}: dòng của các task đã xong, theo thứ tự của bảng. Task chưa xong ở bảng §8 của file chính; \`pnpm plan:split\` chuyển dòng xong từ đó sang cuối bảng này.`;
const DAY_NOTE = `Một phần §11 của ${MAIN}: các dòng ghi ngày ở tiêu đề, theo thứ tự ghi. Dòng mới của ngày này thêm vào cuối bảng; ngày khác thì file khác (mục lục của file chính, "Ghi vào đâu").`;
const CONTENTS = [
  RULE,
  '',
  '## Mục lục',
  '',
  '(P1-52, 2026-11-12) File này là mục lục và phần dùng hằng ngày: phần đầu ở trên, §8 (cách chia việc, chạy song song, bảng task chưa xong), §10 (câu hỏi còn mở) và luật ghi §11. Các mục khác, dòng §8 của task đã xong và các dòng §11 nằm ở [implementation-plan/](implementation-plan/): mỗi mục, mỗi cơ chế của §3, mỗi ngày của §11 một file, không file nào quá 150 KB. Số mục (§3.4, §8, §11 …) giữ nguyên làm định danh: comment trong code và tài liệu ghi "implementation-plan §3.4" tra bảng dưới; `pnpm docs:gen` sinh bảng từ đề mục của các file đó.',
  '',
  `<!-- docs:gen ${REGION} -->`,
  `<!-- /docs:gen ${REGION} -->`,
  '',
  '**Ghi vào đâu.**',
  '',
  '- Task mới và ô Trạng thái: bảng §8 của file này. Dòng đã xong ở lại bảng tới lần chạy `pnpm plan:split` kế tiếp; lần đó chuyển nó sang cuối file `8-done-…` của mục.',
  '- Dòng §11 mới: cuối bảng của `implementation-plan/11-<ngày>.md`, với ngày là ô đầu của dòng (dòng ghi ngày 2026-11-12 vào [11-2026-11-12.md](implementation-plan/11-2026-11-12.md), sau dòng cuối). Ngày chưa có file thì tạo file đó, phần đầu chép từ file ngày trước và đổi ngày ở tiêu đề, rồi chạy `pnpm docs:gen` cho bảng trên. Conflict khi merge thì giữ cả hai phía, như §8 dặn.',
  '- Sửa nội dung một mục: ở file của mục. Bảng §2.5 là vùng `docs:gen` trong file của §2: sửa `QUEST_TRANSITIONS` rồi chạy `pnpm docs:gen`.',
  '- Tìm các dòng §11 nhắc một task: tìm id của task (ví dụ `P1-55`) trong `docs/implementation-plan/11-*.md`. Không có tool tìm thì đọc từ file của ngày task được chốt (ô Task của dòng §8 thường ghi ngày đó) trở đi.',
  '- File lớn hơn khoảng 50 KB: tìm phần cần trước, rồi chỉ đọc khoảng dòng đó.',
  '- Nhánh tách trước P1-52 có sửa file kế hoạch một khối: khi `git merge origin/main` conflict ở file này, lấy bản của main, rồi đặt lại phần mình sửa vào file mới của mục đó (dòng §8 đang mở ở đây, dòng §11 vào file ngày của nó). Phiên đang tách kế hoạch thì làm ngược lại: lấy file một khối của main rồi chạy lại `pnpm plan:split`.',
  '',
];
const ELEVEN_NOTE =
  'Các dòng của nhật ký nằm ở [implementation-plan/](implementation-plan/), mỗi ngày một file `11-<ngày>.md`, danh sách ở mục lục đầu file này. Dòng mới vào cuối file của ngày ghi trên dòng; ngày chưa có file thì tạo file đó (mục lục, "Ghi vào đâu").';

/** @param {readonly string[]} lines */
const trimBlank = (lines) => {
  const first = lines.findIndex((line) => line.trim() !== '');
  const last = lines.findLastIndex((line) => line.trim() !== '');
  return first < 0 ? [] : lines.slice(first, last + 1);
};
/** @param {readonly string[]} lines */
const textOf = (lines) => `${trimBlank(lines).join('\n')}\n`;
/** One blank line where there were several. @param {readonly string[]} lines */
const collapseBlank = (lines) =>
  lines.filter((line, at) => line.trim() !== '' || lines[at - 1]?.trim() !== '');
/** @param {string} line */
const numberOf = (line) => SECTION.exec(line)?.[1] ?? SUBSECTION.exec(line)?.[1];

/**
 * The plan cut into blocks: the preamble, then one per section (from the `---` before its title), §3 one per
 * subsection. Headings inside code fences do not cut.
 * @param {readonly string[]} lines
 */
export function blocksOf(lines) {
  const cuts = [{ key: 'preamble', at: 0 }];
  let fenced = false;
  lines.forEach((line, at) => {
    if (FENCE.test(line)) fenced = !fenced;
    const section = fenced ? undefined : SECTION.exec(line)?.[1];
    const sub = fenced ? undefined : SUBSECTION.exec(line)?.[1];
    if (section !== undefined) {
      const ruled = lines[at - 1] === '' && lines[at - 2] === RULE;
      cuts.push({ key: section, at: ruled ? at - 2 : at });
    } else if (sub !== undefined && BY_SUBSECTION.has(sub.split('.')[0] ?? '')) cuts.push({ key: sub, at });
  });
  return cuts.map((cut, at) => ({
    key: cut.key,
    lines: lines.slice(cut.at, cuts[at + 1]?.at ?? lines.length),
  }));
}

/** @param {string} key */
export function sectionFile(key) {
  return (
    SECTION_FILES.get(key) ??
    new Error(`§${key} has no file: add it to SECTION_FILES of scripts/plan-layout.mjs`)
  );
}

/**
 * A section's file: a title from its own heading, a line saying where it came from, then its lines as they were.
 * @param {readonly string[]} keys the sections it holds, its own last
 * @param {readonly string[]} lines
 */
export function partText(keys, lines) {
  const heading = lines.find((line) => numberOf(line) === keys.at(-1)) ?? '';
  const title = heading.replace(/^#+ /, '').replace(/^(\d+(?:\.\d+)?)\.? /, '§$1 ');
  return textOf([`${TITLE}${title}`, '', PART_NOTE, '', ...trimBlank(lines)]);
}

/**
 * A done file as the first run writes it.
 * @param {string} heading the `###` line of the §8 subsection
 * @param {readonly string[]} header the table's two head lines
 * @param {readonly string[]} rows
 */
export function doneText(heading, header, rows) {
  return textOf([
    `${TITLE}§8, task đã xong: ${heading.replace(/^#+ /, '')}`,
    '',
    DONE_NOTE,
    '',
    heading,
    '',
    ...header,
    ...rows,
  ]);
}

/**
 * A §11 day file.
 * @param {string} day
 * @param {readonly string[]} header
 * @param {readonly string[]} rows
 */
export function dayText(day, header, rows) {
  return textOf([`${TITLE}§11 Nhật ký quyết định, ${day}`, '', DAY_NOTE, '', ...header, ...rows]);
}

/** The index up to §8: the preamble, then the contents table (empty until rendered) and the rules for writing. */
export function indexHead(/** @type {readonly string[]} */ preamble) {
  return [...trimBlank(preamble), '', ...CONTENTS];
}

/** @param {readonly string[]} lines @param {number} from */
const endOfTable = (lines, from) => {
  const end = lines.findIndex((line, at) => at >= from && !line.startsWith('|'));
  return end < 0 ? lines.length : end;
};

/** @param {string} row */
const isDone = (row) => DONE.test(row.split(CELL_BORDER).at(-2)?.trim() ?? '');

/**
 * One §8 subsection without its done rows, a line pointing to them where its table starts.
 * @param {readonly string[]} chunk
 * @param {string | undefined} file
 */
function withoutDone(chunk, file) {
  const at = chunk.findIndex((line) => ITEM_HEADER.test(line));
  const end = endOfTable(chunk, at + 2);
  const rows = at < 0 ? [] : chunk.slice(at + 2, end);
  const done = rows.filter(isDone);
  if (done.length === 0) return { lines: [...chunk], header: [], rows: done, emptied: false };
  if (file === undefined) return new Error(`§8 "${chunk[0] ?? ''}" has done rows but no file in DONE_FILES`);
  const open = rows.filter((row) => !isDone(row));
  const pointer = `Dòng của task đã xong ở [${file}](implementation-plan/${file}).`;
  const before = chunk.slice(0, at);
  const header = chunk.slice(at, at + 2);
  const lines = [
    ...before,
    ...(before.includes(pointer) ? [] : [pointer, '']),
    ...(open.length > 0 ? [...header, ...open] : []),
    ...chunk.slice(end),
  ];
  return { lines: collapseBlank(lines), header, rows: done, emptied: open.length === 0 };
}

/**
 * §8 with its done rows taken out, by the file they move to (links still written from the index); `emptied` when
 * the table left in the index had no row and went too.
 * @param {readonly string[]} lines §8 as the plan holds it
 */
export function moveDone(lines) {
  const starts = lines.flatMap((line, at) => (at === 0 || line.startsWith('### ') ? [at] : []));
  /** @type {string[]} */
  const kept = [];
  /** @type {Map<string, { heading: string; header: string[]; rows: string[]; emptied: boolean }>} */
  const done = new Map();
  for (const [index, start] of starts.entries()) {
    const chunk = lines.slice(start, starts[index + 1] ?? lines.length);
    const heading = chunk[0] ?? '';
    const file = DONE_FILES.find(([pattern]) => pattern.test(heading))?.[1];
    const moved = withoutDone(chunk, file);
    if (moved instanceof Error) return moved;
    kept.push(...moved.lines);
    if (file !== undefined && moved.rows.length > 0) {
      done.set(file, { heading, header: moved.header, rows: moved.rows, emptied: moved.emptied });
    }
  }
  return { lines: kept, done };
}

/**
 * §11 cut into its head, which stays in the index with the rule for new rows, and its rows by day.
 * @param {readonly string[]} lines §11 as the plan holds it
 */
export function dayRows(lines) {
  const at = lines.findIndex((line) => DAY_HEADER.test(line));
  if (at < 0) return new Error('§11 has no "| Ngày | Quyết định |" table');
  const end = endOfTable(lines, at + 2);
  const after = lines.slice(end).find((line) => line.trim() !== '');
  if (after !== undefined) return new Error(`§11 has a line after its table: ${after.slice(0, 80)}`);
  /** @type {Map<string, string[]>} */
  const days = new Map();
  for (const row of lines.slice(at + 2, end)) {
    const day = DAY_ROW.exec(row)?.[1];
    if (day === undefined) return new Error(`§11 has a row without a date: ${row.slice(0, 80)}`);
    days.set(day, [...(days.get(day) ?? []), row]);
  }
  return { lines: [...lines.slice(0, at), ELEVEN_NOTE, ''], header: lines.slice(at, at + 2), days };
}
