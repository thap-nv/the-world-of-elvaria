<!-- User part of the Bard's session (P2-06b): the day's ledger as dayLedgerOf built it, one entry a line, cut at
CHRONICLE_PROMPT_LEDGER_MAX characters with the count left out; and, on the second try, what was wrong with the first. -->

# The day

The chronicle of {{kingdom}} for {{day}} (local time of {{tz}}).

# The ledger

{{counts}}

Each line is one entry, in the order it happened: its `kind`, when (`at`), the quest (`quest`, `title`, `territory`) and the character it is about (`character`), and who else acted (`by`, such as the judge of a verdict); a pool that fell asleep or woke names its `tribe`, `pool` and `model`.

```jsonl
{{entries}}
```

{{omitted}}

# The day's characters

The only characters you may name: {{characters}}.

{{issues}}
