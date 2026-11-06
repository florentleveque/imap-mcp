---

name: functional-validation-plan
description: Create a functional validation plan for a feature or bugfix. Use whenever you author an implementation plan, finish a feature/bugfix with runtime-observable behaviour, or prepare a PR that needs independent end-to-end validation, even when validation isn't explicitly asked for.
---

<!-- Adapted from fruggr/zendesk-mcp-server (MIT, see THIRD-PARTY-NOTICES.md). -->

# Functional validation plan: author protocol

A code change is not "done" when the unit tests pass. Someone who did **not**
write the code must be able to exercise the feature end-to-end and confirm it
behaves as claimed. This skill produces the brief that lets them do that.

## When to apply

- Whenever you produce an **implementation plan** that changes MCP-runtime-
  observable behaviour: the plan includes a functional validation plan as a
  first-class section, not an afterthought.
- Whenever you land a feature or bugfix whose behaviour is observable at
  **MCP-server runtime** (tool surface, transport, configuration handling,
  password sources, resources, prompts, timing).

Skip for changes with no MCP-runtime-observable behaviour: pure docs, comments,
formatting, **and pure tooling** (build, lint, test tooling, CI, release
automation). The standard gates (`pnpm typecheck`, `pnpm check`, `pnpm test`,
`pnpm test:integration`, CI) cover those. Say so explicitly rather than
silently omitting the plan.

## Hard rules

- **Independent validator.** Write the plan FOR someone other than the
  implementer: another agent or a human. Don't assume it shares your
  conversation: spell out the state to manipulate and how to observe results.
  Independence is about _context_, not identity: every agent here posts under
  the same human's GitHub account, so judge a report on its evidence and leave
  the "does this count" call to the repository owner.
- **Assume a ready environment; don't make the validator build it.** Before the
  validator session starts, the launcher runs `pnpm functional:env` at the PR
  head (`tests/functional/README.md`): it builds the server, starts GreenMail
  with a synthetic mailbox and writes `.functional/`. The validator's session
  mounts the build as the `imap-mcp-dev` stdio server (project `.mcp.json`),
  its tools loaded as `mcp__imap-mcp-dev__*`, on the single account
  `greenmail`. So the plan must NOT ask the validator to build, install or
  start anything, nor to look for passwords or edit the configuration. A
  connection or authentication error is a `BLOCKED` finding to report, never a
  setup task. The plan names the commit the environment must be built from
  (the PR head), which `.functional/state.json` records.
- **Never a real mailbox.** Scenarios run against the GreenMail mailbox the
  environment seeds from `tests/integration/fixtures/mail/`. A scenario that
  needs other messages describes them as synthetic `.eml` content to add to
  the fixtures, never as a real account to point at.
- **Ground truth from the tools.** Tool results are the observable: field
  names, values from the synthetic fixtures, error texts, the content blocks of
  get-attachment. When a result cannot show what matters (a file on disk, a
  flag the tools do not expose), name the observable to capture instead (`ls
  .functional/attachments`, a second tool call that shows the state).
- **Lives in the PR description.** Put the plan in the PR body under a
  `## Functional validation plan` heading so it travels with the PR. Keep it in
  sync if the change evolves.
- **Report goes to a PR comment.** The validator posts their findings as a PR
  comment (English, `AGENTS.md` rule), referencing each scenario id with an
  OK/FAIL/BLOCKED verdict and the observed evidence.
- **No waiting on real time.** Prefer levers that simulate state over waiting
  out a real timeout. Call out which behaviours unit or integration tests
  already cover so the validator doesn't re-prove them.
- **Distinct from `/functional-testing`.** That harness drives the committed
  inter-LLM scenarios in `tests/functional/`. This skill is the lighter, per-PR
  brief embedded in the PR description. Reference the harness when the change
  belongs there; don't duplicate it.

## Plan structure

Write the plan as a self-contained, copy-pasteable brief:

1. **Context**: the feature and which `mcp__imap-mcp-dev__*` tool call(s)
   exercise it. Note any path that does NOT exercise the code, so the validator
   doesn't test the wrong surface.
2. **Setup & prerequisites**: only what the ready environment does not provide,
   and how to observe. Flag what can only be checked partially.
3. **Scenarios**: a table, each row: id, what it validates, the exact tool call,
   the expected observable. Make "expected" concrete (which field, which value
   from which fixture, which error text).
4. **Long-running behaviours**: for anything time-based, give the no-wait lever
   AND name the test that already covers it.
5. **Priorities**: which scenarios are the real user-facing paths (do first).
6. **Cleanup**: what the run leaves behind (saved attachments under
   `.functional/attachments` go with the environment on Ctrl+C).
7. **Reporting instructions**: the validator posts a PR comment: per-id verdict
   and evidence; overall summary.

## Loop

1. Draft the plan from the structure above, tailored to the change.
2. Put it in the PR description under `## Functional validation plan`
   (`gh pr edit --body-file`), or inline if you are still in plan mode and no
   PR exists yet.
3. Hand it to the independent validator: another agent runs the executor side
   (the `run-validation-plan` skill), or a human picks it up.

## Closing the loop (verifying the report)

The feature is not validated until every scenario is `OK` against the **latest
pushed commit**. When the validator's report lands as a PR comment:

1. **Read the report** and confirm it tested the right commit SHA. If it
   predates your last push, ask for a re-run. A stale SHA is a reason to re-run;
   the account it was posted from never is.
2. **Re-verify each scenario; don't trust the verdict blindly.** Check the
   reported evidence against the plan's expected observable yourself. Where the
   evidence is too thin to confirm, ask for that scenario to be re-captured.
3. **On all OK:** the loop is closed. Note the outcome **once** (a short
   confirming PR comment, or tell the user) and stop there.
4. **On any FAIL/BLOCKED:** diagnose the root cause. A real bug gets a fix on
   the branch in a separate commit, a push, and a re-run of the affected ids
   against the new SHA. A `BLOCKED` is reported to the user, who decides whether
   that scenario can be validated here.
