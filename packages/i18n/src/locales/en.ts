// English by namespace: typed against Vietnamese, so a namespace or key missing here fails typecheck (AH-04).
import type { Translation } from './namespace.ts';
import character from './en/character.json' with { type: 'json' };
import cli from './en/cli.json' with { type: 'json' };
import cliAmend from './en/cli-amend.json' with { type: 'json' };
import cliAnswer from './en/cli-answer.json' with { type: 'json' };
import cliBuild from './en/cli-build.json' with { type: 'json' };
import cliCharacter from './en/cli-character.json' with { type: 'json' };
import cliColumn from './en/cli-column.json' with { type: 'json' };
import cliDelegation from './en/cli-delegation.json' with { type: 'json' };
import cliDigest from './en/cli-digest.json' with { type: 'json' };
import cliDoctor from './en/cli-doctor.json' with { type: 'json' };
import cliError from './en/cli-error.json' with { type: 'json' };
import cliForge from './en/cli-forge.json' with { type: 'json' };
import cliHelp from './en/cli-help.json' with { type: 'json' };
import cliInbox from './en/cli-inbox.json' with { type: 'json' };
import cliInit from './en/cli-init.json' with { type: 'json' };
import cliMana from './en/cli-mana.json' with { type: 'json' };
import cliMemo from './en/cli-memo.json' with { type: 'json' };
import cliMetrics from './en/cli-metrics.json' with { type: 'json' };
import cliMigrate from './en/cli-migrate.json' with { type: 'json' };
import cliOption from './en/cli-option.json' with { type: 'json' };
import cliQuest from './en/cli-quest.json' with { type: 'json' };
import cliQuestInfirmaryReason from './en/cli-quest-infirmary-reason.json' with { type: 'json' };
import cliRegistry from './en/cli-registry.json' with { type: 'json' };
import cliReturn from './en/cli-return.json' with { type: 'json' };
import cliRun from './en/cli-run.json' with { type: 'json' };
import cliSandbox from './en/cli-sandbox.json' with { type: 'json' };
import cliSay from './en/cli-say.json' with { type: 'json' };
import cliScripture from './en/cli-scripture.json' with { type: 'json' };
import cliSeal from './en/cli-seal.json' with { type: 'json' };
import cliSealRaise from './en/cli-seal-raise.json' with { type: 'json' };
import cliTemple from './en/cli-temple.json' with { type: 'json' };
import cliTerritory from './en/cli-territory.json' with { type: 'json' };
import cliTriage from './en/cli-triage.json' with { type: 'json' };
import cliTribe from './en/cli-tribe.json' with { type: 'json' };
import cliUpgrade from './en/cli-upgrade.json' with { type: 'json' };
import cliWake from './en/cli-wake.json' with { type: 'json' };
import cliWatch from './en/cli-watch.json' with { type: 'json' };
import locale from './en/locale.json' with { type: 'json' };
import quest from './en/quest.json' with { type: 'json' };
import registry from './en/registry.json' with { type: 'json' };
import sandbox from './en/sandbox.json' with { type: 'json' };
import store from './en/store.json' with { type: 'json' };
import tribeLook from './en/tribe-look.json' with { type: 'json' };
import type { VI } from './vi.ts';

export const EN = {
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
} as const satisfies Translation<typeof VI>;
