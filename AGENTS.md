# AGENTS.md: working rules for AI agents

**Purpose & scope.** This file orients an LLM working in this repository: where
things live and the rules that are not obvious from the code. It is **not** user
documentation (that is `README.md`).

- **Don't document what the code already shows.** File trees, command listings,
  env-var tables and setup steps are read faster from the source,
  `package.json` or `README.md` than from a prose copy here, which only goes
  stale.
- Keep each section short: durable rules and pointers. Reference material goes
  to `README.md` or `docs/`, linked from here.
- **Write for the next agent, not for the record.** A line earns its place only
  by changing what someone does next. Git history already holds what was done.
  Exception: a migration still in flight, while both states are live.

## Claim before you build: no duplicate work

Before coding an issue: re-read it live (closed as completed means it already
shipped: stop); search open _and_ merged PRs for its number (`is:pr #<n>`) and
coordinate on an open one rather than forking it; then self-assign, comment that
you are picking it up, and open your PR as a draft early. Link the issue in the
PR **description** with a closing keyword (`Closes #<n>`; a bare `#<n>` or
`Part of #<n>` does not close it). A follow-up on shipped work gets a _new_
issue for the delta.

**Branch name**: `<issue>-<kebab-slug>`, issue number first, no type prefix
(`3-read-tools`, not `feat/3-...`). Short, lowercase, hyphens only, about the
change rather than the file.

## Architecture

- A local MCP server over stdio: the MCP client starts it as a child process.
  `src/index.ts` is the executable and hands `createMcpServer`
  (`src/server.ts`) to the SDK's stdio transport.
- `src/tools/` defines the tools (one file per group, `registry.ts` lists
  them); `src/imap/` talks to the server; `src/config.ts` reads the JSON
  configuration on every call. Password sources arrive with #4
  (`src/passwords.ts`).
- One IMAP connection per tool call (`withClient`, `withMailbox` in
  `src/imap/session.ts`): connect, open the folder read-only (EXAMINE), work,
  log out. Nothing stays open between calls.
- `src/imap/options.ts` holds the TLS and logging invariants below; change them
  there only. A special use comes from the server's SPECIAL-USE attribute
  only: imapflow also guesses one from the folder name (`specialUseSource`).
- Why per-part extraction, one connection per call and the test layout:
  `docs/decisions/imap-layer.md`.

## Security invariants

These hold for every change. A PR that needs to break one says so in its title.

- **stdout is the MCP channel.** Nothing but the transport writes to it: logs
  and diagnostics go to stderr. One stray line corrupts the JSON-RPC stream;
  `pnpm test:smoke` checks it on the build.
- **No password in the configuration file, the logs or a tool result.**
  Passwords come from the OS keyring, a password command or, discouraged, an
  environment variable (#4).
- **TLS is mandatory and certificate verification cannot be turned off**, by
  configuration or otherwise.
- **Message content is untrusted.** A mail can carry instructions aimed at the
  assistant (prompt injection). Tool results mark it as data from the sender.
- **Writes are opt-in.** Every write tool is off by default and enabled one by
  one in the configuration; every send is confirmed by the user through MCP
  elicitation (#5). `save-attachment` writes a local file only, and is refused
  until `attachments.directory` is set: that key is its switch.
- **No destructive shortcut.** Special folders are found through SPECIAL-USE
  (RFC 6154), never by name. Delete moves a message to the trash by UID; never
  EXPUNGE a whole folder.

## Design principle: usage-first, not protocol-shaped

Design every tool for what an LLM needs to accomplish a real task, not for what
IMAP happens to expose. Commands, sequence numbers, fetch items and MIME
structure are an implementation detail: a tool may run several commands and
reshape the result. When protocol shape and usage pull apart, follow the usage.
This never overrides the tool schema rule below.

## Testing

- New features: TDD, failing test first. Bug fixes: reproduce with a test first.
- Existing tests are sacred: a failure is a potential regression. Find the root
  cause before touching the test.
- Never reach a real mail server from a test. `pnpm test:integration` runs the
  IMAP code against GreenMail in Docker (testcontainers); `pnpm test` stays
  Docker-free, since Stryker loads only `vitest.config.ts`.
- Unit tests stand in for imapflow with `tests/unit/fakes/mail-client.ts`,
  replaying what imapflow returned on GreenMail
  (`tests/unit/fixtures/messages.json`). A new MIME case starts as a synthetic
  `.eml` in `tests/integration/fixtures/mail/`, recorded with
  `pnpm test:integration -u`; never hand-edit the recording.
- Coverage thresholds in `vitest.config.ts` are a ratchet: raise them, never
  lower them.
- Mutation testing (StrykerJS) runs over the scope in `stryker.config.mjs`, and
  CI fails a PR on a mutant that survived **in a line it changed**
  (`pnpm test:mutation:diff origin/main HEAD` reproduces it). That gate is the
  contract; **the score is not a target.** A survivor in a line you changed
  means an assertion is missing or too loose: tighten it, never weaken one to go
  green. Everywhere else, **waive late, not early**: an equivalent mutant stays
  escaped until the gate trips on it, and the person touching the line writes
  `// Stryker disable next-line <mutator>: <one-sentence reason>`. Rationale:
  `docs/decisions/mutation-testing.md`.

## Planning

An implementation plan that changes **MCP-runtime-observable behaviour** (the
tool surface, the transport, resources, prompts, persistence or timing a
running server exposes to a client) must also carry a **functional validation
plan**, written for an _independent_ validator (another agent or a human who did
not write the code). It lives in the PR description; the validator posts their
report as a PR comment, in English. The `functional-validation-plan` and
`run-validation-plan` skills write and run it, on the synthetic mailbox of
`tests/functional/README.md`.

Independence is about context, not identity: every agent here acts under the
same GitHub account, so a comment's author says nothing about which session
wrote it. A validator is independent when it did not write the code. State the
role behind a run once, in one line; the repository owner decides whether it
counts.

**Pure tooling changes are exempt** (build, lint, test tooling, CI, release
automation): if a running server behaves no differently for a client, the
standard gates (`pnpm typecheck`, `pnpm check`, `pnpm test`, CI) are the
validation.

## Code style

- TypeScript strict; Biome lints and formats (`pnpm check`, `pnpm check:fix`).
- Keep the `!!**/node_modules` force-ignore in `biome.json` `files.includes`: it
  keeps dependency files out of Biome's module-graph scan, not out of the lint.
  `biome.json` rejects comments, hence this note.
- Lint runs on every edit, formatting at pre-commit (`lefthook.yml`). Keep
  `--skip=types` on the edit hook and don't add formatting to it. Why:
  `docs/decisions/lint-tooling.md`.
- Enable a lint rule only once the tree is already clean for it, so `pnpm check`
  stays green in the same commit. Which rules are on and why each other one is
  off: `docs/decisions/biome-rules.md`. `nursery` and the `types` domain are
  closed by policy.
- **Comments explain the why, never the how.** Write one only for what the code
  cannot say: a constraint, a trade-off, a non-obvious API behaviour, a pointer
  to `docs/decisions/`. A comment that paraphrases the line below it is noise.
  Cap an implementation comment at ~50 words and a `/** */` contract block at
  ~100; past that, write a decision record and point to it.

## Toolchain and dependencies

- pnpm only (version pinned in `package.json#packageManager`), Node 24
  (`.nvmrc`).
- `minimumReleaseAge` in `pnpm-workspace.yaml` refuses any version published
  less than five days ago. Pick the newest version that clears it; never add a
  `minimumReleaseAgeExclude` entry or turn `minimumReleaseAgeStrict` off. Why:
  `docs/decisions/dependency-automerge.md`.
- GitHub Actions are referenced by full commit SHA with the exact release as a
  trailing comment (`uses: actions/checkout@<sha> # v6.1.0`), never by a tag.
  Resolve a new one with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`
  (dereference an annotated tag); Renovate keeps the SHAs current.

## Secrets and personal data

- Never print, log or commit a secret: a mail password, a keyring entry, the
  output of a password command. A command that needs one reads it into a
  variable and uses it without echoing it.
- Mailboxes hold real people's messages. Never paste real message content,
  names or email addresses into a commit, an issue, a PR or a test fixture:
  redact or use synthetic data.

## Communication language

GitHub (issues, PRs, commits, comments, code) in **English**. Chat follows the
user's language.

## No attribution lines

Commits and PR descriptions carry no AI attribution: no `Co-Authored-By:`
trailer for an assistant, no "Generated with ..." footer. The human author owns
the change.

## Tool schemas: never weakened (absolute rule)

The server must keep working with every mainstream MCP agent; no PR may degrade
one. A **tool change** keeps what agents depend on in the exposed JSON Schema:
never drop a field, loosen a type or drop what a description said (saying it in
fewer words is fine, fixing a false statement is a duty). A **new tool** states
its purpose, when to use it, its side effects, and describes every parameter,
and keeps the tool set coherent: consistent naming, no needless duplication.
`tests/unit/fixtures/tools-list.json` holds the exposed `tools/list` answer and
`tests/unit/tool-schemas.test.ts` compares the server against it: edit it in
the commit that changes the surface. The same test checks the surface against
`tools-list.floor.json`, the first published schemas: extend it when a tool is
added, never edit it to make a test pass.

## Documentation maintenance

A change to the tool surface updates the "Tools Available" section of
`README.md` in the same PR. Keep counts out of prose; they only go stale.

## Submission quality bar

Before opening a PR or asking for review, clear the
[Submission quality bar](CONTRIBUTING.md#submission-quality-bar) (same bar for
human and AI authors).

## Merging and releases

- Agents never merge. The repository owner merges, by squash.
- Releases will be automated by semantic-release on push to `main` (#7): never
  hand-bump `version` in `package.json`. Conventional Commits decide the bump;
  mark a change that breaks visible behaviour with `!`.
