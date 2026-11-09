---

branch: 3-read-tools
current_run: none
holder: leading
---

# Functional test run state

`holder` is the narrative lock: only the holder pushes commits. Pass `holder` to
the other LLM before pushing. The leading LLM reads reports and writes verdicts;
the executing LLM runs scenarios and writes the raw and report artifacts.
Protocol: [`README.md`](README.md).

| Scenario        | Status  | Last update |
| --------------- | ------- | ----------- |
| 01-tool-surface | pending | 2026-11-06  |
| 02-read         | pending | 2026-11-06  |
