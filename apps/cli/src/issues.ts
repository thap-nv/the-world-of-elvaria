// Store and registry issues in the owner's language. The code picks the sentence; the schema details (field
// paths and zod messages) stay verbatim, like error text in a handover (implementation-plan §4.1).
import type { RegistryIssue } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';
import type { RegistryGap, RegistryLoadIssue, StoreIssue } from '@elvaria/store';

import { REGISTRY_ISSUE_LABEL, STORE_ISSUE_LABEL } from './labels.ts';

/** How the store names the top of a file in its own messages. */
const FILE_ROOT = '(root)';

const isRegistryIssue = (issue: RegistryLoadIssue): issue is RegistryIssue => 'path' in issue;

/** One issue as lines: the translated sentence, then one indented line per schema detail. */
export function storeIssueLines(t: Translate, issue: StoreIssue): string[] {
  const head = t(STORE_ISSUE_LABEL[issue.code], { file: issue.file });
  const details = (issue.details ?? []).map(
    (detail) => `  ${detail.path.join('.') || FILE_ROOT}: ${detail.message}`,
  );
  return [head, ...details];
}

export function registryIssueLines(t: Translate, issue: RegistryLoadIssue): string[] {
  if (!isRegistryIssue(issue)) return storeIssueLines(t, issue);
  const where = `registry/${issue.file}.json ${issue.path.join('.')}`;
  return [t(REGISTRY_ISSUE_LABEL[issue.code], { where }), `  ${issue.message}`];
}

/** A default registry entry the kingdom lacks, or the keys of it the kingdom's entry lacks (P1-41). */
export const registryGapLine = (t: Translate, gap: RegistryGap): string =>
  gap.fields === undefined
    ? t('cli.registry.gap_entry', { file: gap.file, id: gap.id })
    : t('cli.registry.gap_fields', { file: gap.file, id: gap.id, fields: gap.fields.join(', ') });
