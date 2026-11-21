# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/nickhellyou/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/nickhellyou/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: it answers exactly as
csv-reader does on every case (same `{columns, rows, errors}` for every
`{text, header}`, including every broken-row case: stray CRs, quote junk,
unterminated quotes, short and long rows), and reads the text faster by
jumping from delimiter to delimiter with the engine's native scans instead
of walking it one character at a time.

## Run it

```sh
node main.ts
```

`main.ts` reads the cases from `/input/cases.json` (or
`$MAKEFUN_INPUT_DIR/cases.json` outside a container), answers each one with
`run()` from `solve.js`, and writes the answers in order to
`/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR/answers.json`).

## Layout

- `solve.js` — the fast reader. Dependency-free ES module, `run(input)`
  returns csv-reader 1.0.0's answer for one case's input.
- `main.ts` — the driver the harness runs.
- `package.json` — `{"type": "module"}`, so the ES module loads as one.

---

<sub>Entered on [make.fun](https://make.fun/?ref=&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
