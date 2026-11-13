// The payloads the inbox-command specs share (inbox-command.spec.ts): one valid and one invalid payload per kind, and
// the quests create_quest names. Apart from the spec since PS-03b, which grew the table past the file's size.
import type { InboxCommandKind } from '../inbox-command.ts';

export const QUEST = 'q_20261106_7k3m2a';
export const TS = '2026-11-06T19:45:00+07:00';
export const SESSION_QUEST = {
  draft: false,
  title: 'Fix the login redirect',
  description: 'After login the user lands on /404.',
  kind: 'fix',
  rank: 'C',
  territory: 'dc1-se-team',
  class_required: 'knight',
  created_by: 'user',
};
export const SCRIPT_QUEST = {
  ...SESSION_QUEST,
  class_required: undefined,
  tier: 'script',
  script: { id: 'link-check' },
};

// One valid and one invalid payload per kind, in the order of the contract; the type makes it name every kind.
export const CASES: Record<InboxCommandKind, { valid: object; invalid: object; issue: string }> = {
  confirm: { valid: { quest: QUEST }, invalid: { quest: 'q_1' }, issue: 'payload.quest: Invalid string' },
  seal: {
    valid: { quest: QUEST },
    invalid: { quest: QUEST, note: 42 },
    issue: 'payload.note: Invalid input',
  },
  return: {
    valid: { quest: QUEST, notes: 'README still shows the old command.' },
    invalid: { quest: QUEST, notes: '' },
    issue: 'payload.notes: Too small',
  },
  retry: {
    valid: { quest: QUEST },
    invalid: { quest: QUEST, reason: 'again' },
    issue: 'Unrecognized key: "reason"',
  },
  cancel: {
    valid: { quest: QUEST, reason: 'not needed' },
    invalid: { reason: 'x' },
    issue: 'payload.quest: Invalid',
  },
  archive: {
    valid: { quest: QUEST },
    invalid: { quest: QUEST, reason: null },
    issue: 'payload.reason: Invalid',
  },
  summon: {
    valid: { character: 'thorn' },
    invalid: { character: 'Thorn' },
    issue: 'payload.character: Invalid',
  },
  wake: {
    valid: { tribe: 'gemini' },
    invalid: { tribe: 'gemini-cli' },
    issue: 'payload.tribe: Invalid string',
  },
  suspend: {
    valid: { character: 'thorn', reason: 'same failure three times' },
    invalid: { quest: QUEST },
    issue: 'payload.character: Invalid',
  },
  release: { valid: { character: 'thorn' }, invalid: {}, issue: 'payload.character: Invalid' },
  reassign: { valid: { quest: QUEST }, invalid: { quest: QUEST, character: '' }, issue: 'payload.character' },
  send_to_temple: {
    valid: { character: 'thorn' },
    invalid: { character: 'thorn', quest: QUEST },
    issue: 'Unrecognized key: "quest"',
  },
  declare_campaign: {
    valid: { name: 'Release 2.0', mode: 'offense', deadline: TS },
    invalid: { name: 'x'.repeat(61), mode: 'offense' },
    issue: 'payload.name: Too big',
  },
  close_campaign: {
    valid: { campaign: 'c_20261106_7k3m2a', outcome: 'won' },
    invalid: { campaign: 'c_20261106_7k3m2a', outcome: 'draw' },
    issue: 'payload.outcome: Invalid option',
  },
  create_quest: {
    valid: SESSION_QUEST,
    invalid: { ...SESSION_QUEST, rank: 'Z' },
    issue: 'payload.rank: Invalid',
  },
  answer: {
    valid: { quest: QUEST, answer: 'Use pnpm.' },
    invalid: { quest: QUEST, answer: '' },
    issue: 'payload.answer',
  },
  set_rank: {
    valid: { quest: QUEST, rank: 'S' },
    invalid: { quest: QUEST, rank: 'SS' },
    issue: 'payload.rank',
  },
  attach_territory: {
    valid: { path: 'D:/Dummy/Tool - DC1/dc1-se-team', name: 'dc1-se-team', id: 'dc1-se-team' },
    invalid: { path: String.raw`D:\Dummy\dc1-se-team` },
    issue: 'payload.path: Invalid string',
  },
  edit_quest: {
    valid: { quest: QUEST, expected_updated_at: TS, changes: { rank: 'B' } },
    invalid: { quest: QUEST, expected_updated_at: TS, changes: {} },
    issue: 'payload.changes: an edit changes at least one field',
  },
  pin_tag: {
    valid: { character: 'thorn', tag: null },
    invalid: { character: 'thorn' },
    issue: 'payload.tag',
  },
  set_level: {
    valid: { character: 'thorn', level: 10 },
    invalid: { character: 'thorn', level: 11 },
    issue: 'payload.level: Too big',
  },
  set_model: {
    valid: { character: 'quill', model: 'gemini-3.8-flash-high' },
    invalid: { character: 'quill', model: 'Gemini Flash' },
    issue: 'payload.model',
  },
  decide_memo: {
    valid: { memo: 'm_20261106_4k2pqz', decision: 'handled', quest: QUEST },
    invalid: { memo: 'm_20261106_4k2pqz', decision: 'handled' },
    issue: 'payload.quest: a handled memo names its quest',
  },
  escalate_memo: {
    valid: {
      memo: 'm_20261106_4k2pqz',
      action: 'merge',
      quest: QUEST,
      addendum: 'Also fix the broken link.',
      holds: ['outside_scope'],
      note: 'The link is in another quest’s area.',
    },
    invalid: { memo: 'm_20261106_4k2pqz', action: 'owner', holds: [], note: 'Only you can say.' },
    issue: 'payload.holds: Too small: expected array to have >=1 items',
  },
  decide_amendment: {
    valid: {
      memo: 'm_20261106_4k2pqz',
      decision: 'accepted',
      note: 'The endpoint moved; the new path is right.',
      description: '## Goal\n\nServe the page at /v2/status.',
      expected_updated_at: '2026-11-06T09:00:00+07:00',
    },
    invalid: { memo: 'm_20261106_4k2pqz', decision: 'owner', note: 'Only you can say.' },
    issue: 'payload.holds: an amendment sent to the owner, and only one, says why',
  },
};
