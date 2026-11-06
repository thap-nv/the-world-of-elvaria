// Numbers of the skill contract (implementation-plan §2.3, §3.13).

export const SKILL_TITLE_MAX_LENGTH = 80;
/** The description becomes the CLI-native skill's description: one line saying when the skill applies. */
export const SKILL_DESCRIPTION_MAX_LENGTH = 200;
/** As many tags as a quest may carry: a skill is matched to quests by tag. */
export const SKILL_TAGS_MAX = 6;
/** The smallest size cap a skill may declare. */
export const SKILL_MAX_TOKENS_MIN = 100;
/** A starting value for the size cap; a skill that grows past its cap is split. */
export const SKILL_MAX_TOKENS_DEFAULT = 2000;
