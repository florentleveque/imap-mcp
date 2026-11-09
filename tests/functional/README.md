<!-- Adapted from third-party code (MIT, see THIRD-PARTY-NOTICES.md). -->

# Functional test harness

End-to-end behavioural tests for the MCP server, driven by **two LLMs
communicating through committed files**. They validate what the unit and
integration suites cannot: what an MCP client actually receives when it starts
the built server over stdio and calls its tools.

Nothing here runs in CI or under Vitest, and the mutation baseline cache key
exempts this directory.

## Roles

| Role              | Session                                                  | Reads                                                               | Writes                                                            |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Leading LLM**   | Any session that does not call the server                | `scenarios/<slug>/spec.md`, `scenarios/<slug>/expected.md`, reports | `STATE.md`, `reports/<slug>.verdict.md`, optional code fixes      |
| **Executing LLM** | A Claude Code session connected to the server under test | `scenarios/<slug>/spec.md`, `STATE.md`                              | `reports/<slug>.raw.json`, `reports/<slug>.report.md`, `STATE.md` |

`scenarios/` is read-only for the executor. `reports/` is the communication
channel. `STATE.md` is shared, but its `holder` field is a narrative lock: only
the holder pushes.

**Critical:** the executor must NOT open `expected.md`. It encodes the verdict
criteria; seeing it would bias the report.

The leading LLM follows the `functional-testing` skill (`/functional-testing`).

## The server under test

The branch's build, started over stdio by the executor's Claude Code session
through the `imap-mcp-dev` entry of the project `.mcp.json`, on a GreenMail
container holding a synthetic mailbox. Never a real mailbox.

1. At the branch head, in a terminal of its own, run `pnpm functional:env`. It
   builds the server, starts GreenMail, seeds the mailbox described below,
   writes `.functional/` (git-ignored: configuration, a throwaway password,
   the commit it built) and stays in the foreground. Wait for "Ready".
2. Start the executor's session at the repository root and approve the
   `imap-mcp-dev` server.
3. Ctrl+C in the first terminal stops GreenMail and removes `.functional/`.

Before the first scenario, the executor checks that
`claude mcp get imap-mcp-dev` shows `Scope: Project config` (a local-scope
entry of the same name would take precedence) and that the commit in
`.functional/state.json` is the branch head.

Until a password source exists (#4), the server cannot log in to GreenMail:
every scenario that reaches the mailbox is `BLOCKED`.

## The mailbox

One account, `greenmail`. Folders `INBOX`, `Sent` and `Trash` (names imapflow
would guess a special use from; GreenMail declares none). INBOX holds these
fixtures of `tests/integration/fixtures/mail/`, received one a day at 09:00 UTC
from 1 November 2026, in this order: `plain` (already read), `html-only`,
`alternative`, `attachment`, `inline-named`, `no-disposition`, `related`,
`forwarded`, `encoded-names`, `latin1`, `named-body`. The configuration sets
`attachments.directory` to `.functional/attachments`. Every subject, address and file name is
synthetic and may be quoted in a report.

## Adding a scenario

1. Create `scenarios/<NN>-<slug>/spec.md` with frontmatter:

   ```yaml
   ---
   pr: <number>
   ---
   ```

2. Body of `spec.md`: the exact tool calls to make, the artifacts to write, and
   the assertion fence template (IDs and descriptions, no expected values).
3. Create `scenarios/<NN>-<slug>/expected.md` with a header banner telling the
   executor not to open it, then the expected value per assertion ID.
4. Append a row to `STATE.md` with status `pending`.
5. Invoke the leading LLM with `/functional-testing <NN-slug>` (or `all`).

## Cleaning between runs

`reports/<slug>.*` are committed. Between PRs, clear them with:

```sh
rm tests/functional/reports/*.json tests/functional/reports/*.md
```
