---

name: run-validation-plan
description: Execute a functional validation plan and report the findings. Use whenever you're asked to validate, QA, functionally verify, or check a feature/bugfix on a branch, or you're handed a functional validation plan to run, even when the skill isn't named.
---

<!-- Adapted from fruggr/zendesk-mcp-server (MIT, see THIRD-PARTY-NOTICES.md). -->

# Run a validation plan: validator protocol

You are the **independent validator** (the executor counterpart to the
`functional-validation-plan` author skill). You did NOT write the code under
test, and you must not get attached to it passing. Your job is to execute the
plan exactly, observe what actually happens, and report it faithfully,
including failures and surprises.

**You are independent because of your context, not your login.** Every agent in
this repository acts under the same human's GitHub account, so the author shown
on a PR comment tells you nothing about which session wrote it. What makes you
independent is that this session did not write the code. State your role once,
in the report's `Run by:` line, and let the repository owner judge it.

## Input & environment

- **The plan is the verbatim `## Functional validation plan` section of the PR
  description**, never a paraphrase from the implementer's chat or your memory.
  Obtain it in this order, stopping at the first that works:
  1. If the launcher handed it to you (the plan text, or a PR number / URL), use
     that.
  2. Otherwise resolve the PR from the branch you are on:
     `gh pr view --json body,number,headRefOid` (no argument = the current
     branch's PR). Never search for it with `gh pr list`.
- The GitHub MCP (`mcp__github__*`) is not guaranteed to be mounted; check what
  is available and fall back to `gh`.

### Your environment is already set up: do NOT re-create it

- **The server under test is the PR's build, over stdio**, mounted as the
  `imap-mcp-dev` MCP server from the project `.mcp.json`, on a GreenMail
  container that `pnpm functional:env` started and seeded with a synthetic
  mailbox. Its tools are loaded as `mcp__imap-mcp-dev__*`. Calling them _is_
  exercising the server: no build, no install, no container to start.
- **Check the environment first.**
  - `claude mcp get imap-mcp-dev` must show `Scope: Project config`: a
    local-scope entry of that name takes precedence over `.mcp.json` and could
    point anywhere.
  - `.functional/state.json` must exist, and its `commit` must equal the PR
    head SHA (`headRefOid` above): otherwise the build under test is another
    commit.
  - `.functional/config.json` must declare the single account `greenmail` on
    `localhost`.

  Any of these wrong: report `BLOCKED` and stop. You cannot fix it from inside
  the session: Claude Code starts the server when the session starts.
- **Never point the server at a real mailbox**, and never read or print
  `.functional/password`. If a tool returns an authentication or connection
  error, that is a `BLOCKED` finding to report, not a cue to fix credentials.

## Protocol

1. **Record what you're testing**: the commit SHA from `.functional/state.json`.
2. **Set up observation** as the plan says.
3. **Run each scenario in order.** Make the exact `mcp__imap-mcp-dev__*` tool
   call(s), and capture the **actual** observable: tool result or error, file
   on disk.
4. **Compare to expected.** Mark a scenario `OK` only if the actual observable
   matches the plan's expected one. Anything else is `FAIL`, or `BLOCKED` if a
   prerequisite was unavailable (say which).
5. **Clean up** what the plan asks; the environment's own files go when the
   launcher stops it.
6. **Don't fix, don't massage.** Never edit the code to make a scenario pass,
   never round a partial or ambiguous result up to OK.

## Reporting

Post the report as a **PR comment** in **English** (`gh pr comment` on the
current branch, or `mcp__github__add_issue_comment` if mounted). Without GitHub
write access, output the full report for the human to paste. Structure:

```markdown
## Functional validation report: <commit SHA>

Run by: independent validator session (did not write the code)

| ID  | Verdict | Evidence                                                         |
| --- | ------- | ---------------------------------------------------------------- |
| S1  | OK      | `list-messages` returned 10 summaries, newest first, `total: 10` |
| S2  | FAIL    | expected `body.format: "html"`, got `"none"`                     |
| S3  | BLOCKED | `imap-mcp-dev` not connected in this session                     |

## Summary

<green, or the failing/blocked IDs with a one-line why>
```

Per-row evidence must let the author verify without re-running: field names,
values, error texts, counts.

### Data in reports

The mailbox is synthetic: its subjects, addresses and file names come from
`tests/integration/fixtures/mail/` and may be quoted. If a result shows data
that is not in those fixtures, the server is talking to another mailbox: stop,
report `BLOCKED`, and quote nothing from it. The repository is public.

## Hard rules

- Faithful reporting over a green result. A wrong "OK" is worse than an honest
  FAIL.
- Validate behaviour against the plan's expectations, not against the
  implementer's explanation of why it should work.
- Report the run, nothing else: one `Run by:` line, no meta-commentary.
- Real tools only (`mcp__imap-mcp-dev__*`), synthetic mailbox only.
- One report per run, naming the commit SHA. After a fix, post a fresh report
  against the new SHA rather than editing the old one.
