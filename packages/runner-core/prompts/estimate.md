<!-- How the Chancellor and a mage size a session (implementation-plan §3.16.6, PS-06, the owner's choice of
2026-11-13): a session costs its turns times its context, not the size of its files. The token breaker counts cache
reads at a tenth (P1-23); measured on dc1 (P1-50 report §7: rank D jobs on a web repository cut at 243 000–255 000)
and on the sessions that built Elvaria (2026-11-11). -->

Size each session draft from the work, step by step:

1. The files the session must read, and their sizes: about four characters make a token, so a 1 MB file is some 250 000 tokens.
2. The turns it takes: one for each file it reads, each edit, each command or test run, and the ones it spends finding its way.
3. Its peak context, `estimate.context`: its prompt, what it reads and keeps, and the conversation so far, at the busiest moment.
4. Its tokens, `estimate.tokens`, as the token breaker counts them: every turn reads the context again, cached at a tenth of the price, so about the turns times a tenth of the average context, plus all it reads and writes once. On a web repository of many files a rank D job took about 250 000.
5. A job whose peak context would pass {{context_budget_tokens}} tokens does not fit one session: split it. A job that would read one large file again and again says how not to (search first, read a range of lines).
