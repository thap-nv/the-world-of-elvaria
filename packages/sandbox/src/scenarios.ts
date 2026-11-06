// The three fake days of implementation-plan §7, as tables: `busy` (a full day on three territories), `quiet`
// (a few quests, long pauses) and `mana-out` (Claude's pool runs dry before noon and wakes after lunch). Tribe,
// class, kind, script and tag ids are those `elvaria init` and the default registry write; scenarioProblems
// (check.ts) says which one a kingdom lacks instead of generating a day it cannot hold.
import type { CastMember, QuestTemplate, Scenario, TerritorySeed } from './scenario.ts';

const CAST: readonly CastMember[] = [
  {
    id: 'thorn',
    cls: 'knight',
    tribe: 'claude',
    model: 'claude-sonnet-5-5',
    level: 3,
    history: { verdicts: 6, pass: 0.8, tags: ['frontend', 'i18n'] },
  },
  {
    id: 'kael',
    cls: 'knight',
    tribe: 'claude',
    model: 'claude-opus-5-5',
    level: 6,
    history: { verdicts: 9, pass: 0.9, tags: ['backend', 'db'] },
  },
  {
    id: 'brann',
    cls: 'dwarf',
    tribe: 'claude',
    model: 'claude-sonnet-5-5',
    level: 4,
    history: { verdicts: 5, pass: 0.8, tags: ['infra', 'backend'] },
  },
  {
    id: 'wren',
    cls: 'scout',
    tribe: 'gemini',
    model: 'gemini-4-argon-medium',
    level: 2,
    history: { verdicts: 4, pass: 0.75, tags: ['docs'] },
  },
  {
    id: 'lyra',
    cls: 'scribe',
    tribe: 'gemini',
    model: 'gemini-4-argon-medium',
    level: 3,
    history: { verdicts: 7, pass: 0.85, tags: ['docs', 'i18n'] },
  },
  // One judge per tribe (ADR 0011): each judges the other family first (ADR 0008).
  {
    id: 'ella',
    cls: 'judge',
    tribe: 'claude',
    model: 'claude-opus-5-5',
    level: 5,
    history: { verdicts: 0, pass: 0, tags: [] },
  },
  {
    id: 'orin',
    cls: 'judge',
    tribe: 'gemini',
    model: 'gemini-4-argon-high',
    level: 5,
    history: { verdicts: 0, pass: 0, tags: [] },
  },
];

const TERRITORIES: readonly TerritorySeed[] = [
  { id: 'web-portal', name: 'Web Portal', kind: 'code' },
  { id: 'api-server', name: 'API Server', kind: 'code' },
  { id: 'handbook', name: 'Handbook', kind: 'docs' },
];

const BUILD: QuestTemplate = {
  kind: 'build',
  territory: 'web-portal',
  cls: 'knight',
  tags: ['frontend'],
  ranks: { F: 0, E: 2, D: 3, C: 2, B: 1, A: 0, S: 0 },
  weight: 4,
  titles: [
    { vi: 'Thêm trang đăng nhập', en: 'Add the sign-in page' },
    { vi: 'Thêm bộ lọc cho danh sách đơn hàng', en: 'Add filters to the order list' },
    { vi: 'Làm lại thanh điều hướng trên điện thoại', en: 'Rebuild the mobile navigation bar' },
    { vi: 'Thêm chế độ tối', en: 'Add a dark mode' },
  ],
};

const FIX: QuestTemplate = {
  kind: 'fix',
  territory: 'api-server',
  cls: 'knight',
  tags: ['backend'],
  ranks: { F: 0, E: 1, D: 3, C: 2, B: 0, A: 0, S: 0 },
  weight: 3,
  titles: [
    { vi: 'Sửa lỗi phân trang trả trùng bản ghi', en: 'Fix pagination returning duplicate rows' },
    { vi: 'Sửa lỗi phiên đăng nhập hết hạn quá sớm', en: 'Fix sessions expiring too early' },
    { vi: 'Sửa múi giờ trong báo cáo ngày', en: 'Fix the time zone of the daily report' },
  ],
};

const REFACTOR: QuestTemplate = {
  kind: 'refactor',
  territory: 'api-server',
  cls: 'dwarf',
  tags: ['backend', 'db'],
  ranks: { F: 0, E: 0, D: 1, C: 3, B: 1, A: 0, S: 0 },
  weight: 2,
  titles: [
    { vi: 'Tách module thanh toán', en: 'Split the payments module' },
    {
      vi: 'Gom các truy vấn trùng lặp vào một lớp dữ liệu',
      en: 'Move duplicated queries into one data layer',
    },
  ],
};

const INTEGRATE: QuestTemplate = {
  kind: 'integrate',
  territory: 'web-portal',
  cls: 'dwarf',
  tags: ['infra', 'e2e'],
  ranks: { F: 0, E: 0, D: 2, C: 2, B: 0, A: 0, S: 0 },
  weight: 1,
  titles: [{ vi: 'Chạy e2e trong CI cho mỗi pull request', en: 'Run e2e in CI on every pull request' }],
};

const RESEARCH: QuestTemplate = {
  kind: 'research',
  territory: 'handbook',
  cls: 'scout',
  tags: ['docs'],
  ranks: { F: 2, E: 3, D: 1, C: 0, B: 0, A: 0, S: 0 },
  weight: 2,
  titles: [
    { vi: 'Tìm hiểu cách các thư viện i18n xử lý số nhiều', en: 'Survey how i18n libraries handle plurals' },
    { vi: 'So sánh ba công cụ đo hiệu năng trang', en: 'Compare three page-performance tools' },
    { vi: 'Tóm tắt những gì Node 24 thay đổi', en: 'Summarise what Node 24 changed' },
  ],
};

const DOCUMENT: QuestTemplate = {
  kind: 'document',
  territory: 'handbook',
  cls: 'scribe',
  tags: ['docs', 'i18n'],
  ranks: { F: 0, E: 2, D: 2, C: 0, B: 0, A: 0, S: 0 },
  weight: 2,
  titles: [
    { vi: 'Viết hướng dẫn cài đặt cho người mới', en: 'Write the setup guide for newcomers' },
    { vi: 'Cập nhật README với các lệnh mới', en: 'Update the README with the new commands' },
    { vi: 'Dịch trang câu hỏi thường gặp sang tiếng Anh', en: 'Translate the FAQ page into English' },
  ],
};

const LINK_CHECK: QuestTemplate = {
  kind: 'batch',
  territory: 'handbook',
  script: 'link-check',
  tags: ['docs'],
  ranks: { F: 1, E: 1, D: 0, C: 0, B: 0, A: 0, S: 0 },
  weight: 1,
  titles: [{ vi: 'Kiểm tra mọi liên kết trong tài liệu', en: 'Check every link in the docs' }],
};

const COUNT_FILES: QuestTemplate = {
  kind: 'analyze',
  territory: 'api-server',
  script: 'count-files',
  tags: ['backend'],
  ranks: { F: 1, E: 1, D: 0, C: 0, B: 0, A: 0, S: 0 },
  weight: 1,
  titles: [{ vi: 'Đếm file test theo thư mục', en: 'Count test files per folder' }],
};

const ALL_TEMPLATES = [BUILD, FIX, REFACTOR, INTEGRATE, RESEARCH, DOCUMENT, LINK_CHECK, COUNT_FILES];
const BUSY_MINUTES = { work: [12, 40], review: [4, 12], script: [2, 6], owner: [8, 40] } as const;

export const BUSY: Scenario = {
  id: 'busy',
  cast: CAST,
  territories: TERRITORIES,
  templates: ALL_TEMPLATES,
  quests: 14,
  arrivals: [5, 330],
  session: { submit: 72, crash: 8, ask: 10, breaker: 4 },
  verdict: { pass: 75, fail: 25 },
  script: { pass: 90, crash: 10 },
  minutes: BUSY_MINUTES,
  ownerRetries: true,
};

const QUIET_CAST = new Set(['thorn', 'wren', 'ella', 'orin']);

export const QUIET: Scenario = {
  id: 'quiet',
  cast: CAST.filter(({ id }) => QUIET_CAST.has(id)),
  territories: TERRITORIES.filter(({ id }) => id !== 'api-server'),
  templates: [BUILD, RESEARCH, LINK_CHECK],
  quests: 4,
  arrivals: [20, 420],
  session: { submit: 85, crash: 5, ask: 10, breaker: 0 },
  verdict: { pass: 85, fail: 15 },
  script: { pass: 1, crash: 0 },
  minutes: { work: [20, 40], review: [6, 15], script: [2, 6], owner: [20, 60] },
  ownerRetries: false,
};

export const MANA_OUT: Scenario = {
  id: 'mana-out',
  cast: CAST,
  territories: TERRITORIES,
  templates: ALL_TEMPLATES,
  quests: 10,
  arrivals: [5, 240],
  session: { submit: 80, crash: 8, ask: 8, breaker: 4 },
  verdict: { pass: 75, fail: 25 },
  script: { pass: 90, crash: 10 },
  minutes: BUSY_MINUTES,
  ownerRetries: true,
  // 11:00 to 13:00: the five-hour window of the morning's work closes, a fresh one opens after lunch.
  manaOut: { tribe: 'claude', at: 150, asleep: 120 },
};

export const SCENARIOS = { busy: BUSY, quiet: QUIET, 'mana-out': MANA_OUT } as const;
