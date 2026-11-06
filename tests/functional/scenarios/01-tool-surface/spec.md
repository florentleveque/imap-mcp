---

## pr: 9

# 01: tool surface

Verify the tools an MCP client receives from the server, how it refuses bad
arguments, and what it says about the configured accounts.

## Steps

1. List every tool of `imap-mcp-dev` available to you (`mcp__imap-mcp-dev__*`).
   Record their names without the prefix and their count.
2. For `read-message` and `get-attachment`, record the input parameters you
   see: name, type, whether required, allowed values.
3. Call `list-messages` with `{"account": "greenmail", "unread": true}` and
   record the result: error or not, and its text.
4. Call `search-messages` with `{"account": "greenmail"}` and record the result.
5. Call `list-accounts` with `{}` and record the result.
6. Write `tests/functional/reports/01-tool-surface.raw.json` with what you
   recorded, and `tests/functional/reports/01-tool-surface.report.md` with the
   fence below, filled in.

## Assertions to record

Set `pass: true|false`, fill `actual`, copy `desc` verbatim. **Do not** look up
expected values: `expected.md` is off-limits.

```json
{
  "scenario": "01-tool-surface",
  "branch": "<branch>",
  "sha": "<git rev-parse HEAD>",
  "assertions": [
    { "id": "A1", "desc": "number of imap-mcp-dev tools", "pass": null, "actual": null },
    { "id": "A2", "desc": "tool names, without the prefix", "pass": null, "actual": null },
    {
      "id": "A3",
      "desc": "read-message parameters (name, type, required)",
      "pass": null,
      "actual": null
    },
    {
      "id": "A4",
      "desc": "get-attachment parameters (name, type, required, allowed values)",
      "pass": null,
      "actual": null
    },
    {
      "id": "A5",
      "desc": "list-messages with an unknown argument: error or not, and its text",
      "pass": null,
      "actual": null
    },
    {
      "id": "A6",
      "desc": "search-messages without any criterion: error or not, and its text",
      "pass": null,
      "actual": null
    },
    { "id": "A7", "desc": "list-accounts result", "pass": null, "actual": null }
  ],
  "summary": "<one line: green / which IDs failed>"
}
```

## When done

1. In `tests/functional/STATE.md`, set this scenario to `done` and `holder` to
   `leading`.
2. `git add tests/functional/reports/01-tool-surface.* tests/functional/STATE.md`,
   commit with `test(functional): run scenario 01-tool-surface`, push.
3. Tell the leading LLM in chat.
