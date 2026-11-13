// The `## ` sections of a Markdown text, as the quest template (template.ts) and the plan file (plan-file.ts) read
// them: a heading of level one or two starts a section, `###` and deeper stay inside theirs, and a heading inside a
// code fence is text.

const FENCE = /^\s*(?:```|~~~)/;
/** A heading of level one or two; `###` and deeper belong to the section they are in. */
const HEADING = /^(?<level>#{1,2})\s+(?<text>.*?)\s*:?\s*$/;

/** How a heading is looked up: its text in lower case, so `## Done When` is `## Done when`. */
export const sectionKeyOf = (heading: string): string => heading.trim().toLowerCase();

/** The text of each `## ` section, trimmed, by its key (sectionKeyOf); the first of two with one heading wins. */
export function sectionsOf(text: string): ReadonlyMap<string, string> {
  const sections = new Map<string, string[]>();
  let current: string[] | undefined;
  let fenced = false;
  for (const line of text.split(/\r?\n/)) {
    if (FENCE.test(line)) fenced = !fenced;
    const heading = fenced ? null : HEADING.exec(line);
    if (heading === null) {
      current?.push(line);
      continue;
    }
    const key = sectionKeyOf(String(heading.groups?.text));
    current = heading.groups?.level === '##' && !sections.has(key) ? [] : undefined;
    if (current !== undefined) sections.set(key, current);
  }
  return new Map([...sections].map(([key, lines]) => [key, lines.join('\n').trim()]));
}

/** Whether `line` is a heading of level one or two outside a fence: what ends a section. */
export const isSectionHeading = (line: string): boolean => HEADING.test(line);

/** Whether `line` opens or closes a code fence. */
export const isFence = (line: string): boolean => FENCE.test(line);
