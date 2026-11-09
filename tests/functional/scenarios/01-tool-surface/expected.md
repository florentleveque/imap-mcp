# LEADING LLM ONLY: DO NOT READ IF YOU ARE THE EXECUTOR

## Expected values (verdict criteria)

| ID  | Expected                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 7                                                                                                                                                                                                          |
| A2  | The set `list-accounts`, `list-folders`, `list-messages`, `search-messages`, `read-message`, `get-attachment`, `save-attachment`. Order is not asserted. Reference: `tests/unit/fixtures/tools-list.json`. |
| A3  | `account` string, required; `folder` string, optional (default `INBOX`); `uid` integer, required. Nothing else.                                                                                            |
| A4  | Both tools: `account` string, required; `folder` string, optional; `uid` integer, required; `part` string, required. Nothing else: no `mode`.                                                              |
| A5  | An error whose text starts with `Input validation error: Invalid arguments for tool list-messages`: the schema has `additionalProperties: false`.                                                          |
| A6  | An error whose text contains `Give at least one of from, to, subject, body, since, before or unseenOnly`.                                                                                                  |
| A7  | `{"accounts":[{"name":"greenmail","host":"localhost","port":<int>,"security":"tls","user":"validator-<8 hex>@example.test"}]}`; no password or `caFile` field. Needs no mail server: never `BLOCKED`.      |

## Failure diagnostics

| If FAIL on | Likely cause                                        | Where to look                                     |
| ---------- | --------------------------------------------------- | ------------------------------------------------- |
| A1, A2     | a tool not registered, or the wrong build           | `src/tools/registry.ts`, `.functional/state.json` |
| A3, A4     | a schema changed without the fixture                | `src/tools/fields.ts`, `tests/unit/fixtures/`     |
| A5         | an input schema built with `z.object`               | `src/tools/*.ts`                                  |
| A6         | the refinement of `search-messages`                 | `src/tools/messages.ts`                           |
| A7         | the configuration path or the list-accounts mapping | `src/index.ts`, `src/tools/accounts.ts`           |
