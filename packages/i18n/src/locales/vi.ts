// Vietnamese, the reference, by namespace: each key lives in the file of its longest namespace (AH-04).
// A new namespace is a file in vi/ and en/ and one line here and in en.ts; `pnpm i18n:check` holds the rest.
import character from './vi/character.json' with { type: 'json' };
import cli from './vi/cli.json' with { type: 'json' };
import cliAmend from './vi/cli-amend.json' with { type: 'json' };
import cliAnswer from './vi/cli-answer.json' with { type: 'json' };
import cliBuild from './vi/cli-build.json' with { type: 'json' };
import cliCharacter from './vi/cli-character.json' with { type: 'json' };
import cliColumn from './vi/cli-column.json' with { type: 'json' };
import cliDelegation from './vi/cli-delegation.json' with { type: 'json' };
import cliDigest from './vi/cli-digest.json' with { type: 'json' };
import cliDoctor from './vi/cli-doctor.json' with { type: 'json' };
import cliError from './vi/cli-error.json' with { type: 'json' };
import cliForge from './vi/cli-forge.json' with { type: 'json' };
import cliHelp from './vi/cli-help.json' with { type: 'json' };
import cliInbox from './vi/cli-inbox.json' with { type: 'json' };
import cliInit from './vi/cli-init.json' with { type: 'json' };
import cliMana from './vi/cli-mana.json' with { type: 'json' };
import cliMemo from './vi/cli-memo.json' with { type: 'json' };
import cliMetrics from './vi/cli-metrics.json' with { type: 'json' };
import cliMigrate from './vi/cli-migrate.json' with { type: 'json' };
import cliOption from './vi/cli-option.json' with { type: 'json' };
import cliQuest from './vi/cli-quest.json' with { type: 'json' };
import cliQuestInfirmaryReason from './vi/cli-quest-infirmary-reason.json' with { type: 'json' };
import cliRegistry from './vi/cli-registry.json' with { type: 'json' };
import cliReturn from './vi/cli-return.json' with { type: 'json' };
import cliRun from './vi/cli-run.json' with { type: 'json' };
import cliSandbox from './vi/cli-sandbox.json' with { type: 'json' };
import cliSay from './vi/cli-say.json' with { type: 'json' };
import cliScripture from './vi/cli-scripture.json' with { type: 'json' };
import cliSeal from './vi/cli-seal.json' with { type: 'json' };
import cliSealRaise from './vi/cli-seal-raise.json' with { type: 'json' };
import cliTemple from './vi/cli-temple.json' with { type: 'json' };
import cliTerritory from './vi/cli-territory.json' with { type: 'json' };
import cliTriage from './vi/cli-triage.json' with { type: 'json' };
import cliTribe from './vi/cli-tribe.json' with { type: 'json' };
import cliUpgrade from './vi/cli-upgrade.json' with { type: 'json' };
import cliWake from './vi/cli-wake.json' with { type: 'json' };
import cliWatch from './vi/cli-watch.json' with { type: 'json' };
import locale from './vi/locale.json' with { type: 'json' };
import quest from './vi/quest.json' with { type: 'json' };
import registry from './vi/registry.json' with { type: 'json' };
import sandbox from './vi/sandbox.json' with { type: 'json' };
import store from './vi/store.json' with { type: 'json' };
import tribeLook from './vi/tribe-look.json' with { type: 'json' };

export const VI = {
  character,
  cli,
  'cli.amend': cliAmend,
  'cli.answer': cliAnswer,
  'cli.build': cliBuild,
  'cli.character': cliCharacter,
  'cli.column': cliColumn,
  'cli.delegation': cliDelegation,
  'cli.digest': cliDigest,
  'cli.doctor': cliDoctor,
  'cli.error': cliError,
  'cli.forge': cliForge,
  'cli.help': cliHelp,
  'cli.inbox': cliInbox,
  'cli.init': cliInit,
  'cli.mana': cliMana,
  'cli.memo': cliMemo,
  'cli.metrics': cliMetrics,
  'cli.migrate': cliMigrate,
  'cli.option': cliOption,
  'cli.quest': cliQuest,
  'cli.quest.infirmary.reason': cliQuestInfirmaryReason,
  'cli.registry': cliRegistry,
  'cli.return': cliReturn,
  'cli.run': cliRun,
  'cli.sandbox': cliSandbox,
  'cli.say': cliSay,
  'cli.scripture': cliScripture,
  'cli.seal': cliSeal,
  'cli.seal_raise': cliSealRaise,
  'cli.temple': cliTemple,
  'cli.territory': cliTerritory,
  'cli.triage': cliTriage,
  'cli.tribe': cliTribe,
  'cli.upgrade': cliUpgrade,
  'cli.wake': cliWake,
  'cli.watch': cliWatch,
  locale,
  quest,
  registry,
  sandbox,
  store,
  tribe_look: tribeLook,
} as const;
