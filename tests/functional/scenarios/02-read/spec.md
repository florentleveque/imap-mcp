---

## pr: 9

# 02: read a mailbox

Exercise the six tools on the synthetic mailbox of `tests/functional/README.md`:
folders, listing, search, reading, attachments.

Every call takes `"account": "greenmail"`. Find UIDs from the listing (step 2);
never guess them.

## Steps

1. `list-folders`. Record each folder: path, and `specialUse` if present.
2. `list-messages` with `{"limit": 10}`. Record `total`, then the uid and subject
   of each message, in the order returned, and whether the result has a
   `notice` field.
3. `list-messages` with `{"limit": 3}`. Record `total` and the subjects.
4. `list-messages` with `{"unseenOnly": true}`. Record `total`.
5. `search-messages` with `{"subject": "report"}`. Record the subjects.
6. `search-messages` with `{"since": "2026-11-09"}`. Record the subjects.
7. `read-message` on the message whose subject is `Plain text`. Record `body`.
8. `read-message` on the message whose subject is `HTML only`. Record `body`.
9. `read-message` on the message whose subject is `Résumé et facture`. Record
   `from`, `subject` and `attachments`.
10. `get-attachment` on that message, `{"part": "2"}`. Record the type and
    content of each content block after the first.
11. `get-attachment` on that message, `{"part": "3", "mode": "file"}`, twice.
    Record `savedTo` both times, then run `ls .functional/attachments`.
12. `get-attachment` on that message, `{"part": "1"}`. Record the result.
13. `list-messages` with `{"unseenOnly": true}` again. Record `total`.
14. Write `tests/functional/reports/02-read.raw.json` with what you recorded, and
    `tests/functional/reports/02-read.report.md` with the fence below, filled
    in. Paths under your home directory may be shortened to `~`.

## Assertions to record

Set `pass: true|false`, fill `actual`, copy `desc` verbatim. **Do not** look up
expected values: `expected.md` is off-limits.

```json
{
  "scenario": "02-read",
  "branch": "<branch>",
  "sha": "<git rev-parse HEAD>",
  "assertions": [
    { "id": "A1", "desc": "folders and special uses", "pass": null, "actual": null },
    {
      "id": "A2",
      "desc": "list of 10: total, subjects in order, notice present",
      "pass": null,
      "actual": null
    },
    { "id": "A3", "desc": "list of 3: total and subjects", "pass": null, "actual": null },
    { "id": "A4", "desc": "unread total", "pass": null, "actual": null },
    { "id": "A5", "desc": "search on subject", "pass": null, "actual": null },
    { "id": "A6", "desc": "search since 2026-11-09", "pass": null, "actual": null },
    { "id": "A7", "desc": "body of Plain text", "pass": null, "actual": null },
    { "id": "A8", "desc": "body of HTML only", "pass": null, "actual": null },
    {
      "id": "A9",
      "desc": "from, subject and attachments of Résumé et facture",
      "pass": null,
      "actual": null
    },
    {
      "id": "A10",
      "desc": "part 2 inline: content blocks after the first",
      "pass": null,
      "actual": null
    },
    {
      "id": "A11",
      "desc": "part 3 saved twice: both paths and the directory listing",
      "pass": null,
      "actual": null
    },
    { "id": "A12", "desc": "part 1 requested as an attachment", "pass": null, "actual": null },
    { "id": "A13", "desc": "unread total after the run", "pass": null, "actual": null }
  ],
  "summary": "<one line: green / which IDs failed>"
}
```

## When done

1. In `tests/functional/STATE.md`, set this scenario to `done` and `holder` to
   `leading`.
2. `git add tests/functional/reports/02-read.* tests/functional/STATE.md`,
   commit with `test(functional): run scenario 02-read`, push.
3. Tell the leading LLM in chat.
